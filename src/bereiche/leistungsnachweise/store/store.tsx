/**
 * Datenbestand des Bereichs „Leistungsnachweise“. Alle Schreibzugriffe laufen
 * über `mutate()`; danach setzt `nachweiseBereinigen` den Änderungszeitpunkt
 * geänderter Nachweise und verwirft Nachweise ohne Projekt, und der Bestand
 * wird lokal gespeichert – aber nur, wenn er einwandfrei geladen wurde
 * (`ladeZustand` 'ok'). Der Aufbau entspricht dem der Projektsteuerung, ist
 * davon aber vollständig getrennt.
 *
 * Kennungen, die die Oberfläche braucht, entstehen vor `mutate()`; solche,
 * die erst in der Änderung anfallen (Nachweise, Abschnitte), liefert ein
 * Vorrat (`idVorrat`), der beim doppelten Aufruf im StrictMode dieselben
 * Kennungen wieder ausgibt.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { abschnitteAusElementen, importAnwenden, type ImportPlan } from '../domain/import';
import { leistungenOhneNachweis, mitZeilenText, nachweiseBereinigen, nachweiseSichern, standErzeugen } from '../domain/nachweis';
import { seedDaten } from '../domain/seed';
import {
  newId,
  type Einstellungen,
  type ID,
  type Leistung,
  type Leistungsnachweis,
  type LeistungsnachweisDaten,
  type Mitarbeiter,
  type NachweisZeile,
  type Projekt,
  type Quelle,
} from '../domain/types';
import { runden } from '../domain/zeitraum';
import { ladeDaten, speichereDaten, type LadeZustand } from './storage';

export { newId };

interface StoreValue {
  data: LeistungsnachweisDaten;
  /** 'ok' – es wird gespeichert; sonst zeigt der Bereich Demodaten und lässt den gespeicherten Stand unberührt. */
  ladeZustand: LadeZustand;
  setEinstellungen: (e: Partial<Einstellungen>) => void;
  /* Mitarbeiter */
  addMitarbeiter: (m: Omit<Mitarbeiter, 'id'>) => ID;
  updateMitarbeiter: (id: ID, patch: Partial<Omit<Mitarbeiter, 'id'>>) => void;
  /** Nur ohne Leistungen – prüft die Oberfläche vorher. */
  deleteMitarbeiter: (id: ID) => void;
  /* Projekte */
  addProjekt: (p: Omit<Projekt, 'id'>) => ID;
  /** Ändern; entfallene Abschnitte verlieren ihre Leistungen (diese stehen dann ohne Abschnitt). */
  updateProjekt: (id: ID, patch: Partial<Omit<Projekt, 'id'>>) => void;
  /** Mit allen Leistungen und Nachweisen. */
  deleteProjekt: (id: ID) => void;
  toggleMarkiert: (id: ID) => void;
  /** Abschnitte aus den Projektelementen der Leistungen anlegen und Leistungen ohne Abschnitt zuordnen; liefert die Zahl neuer Abschnitte. */
  abschnitteAusProjektelementen: (projektId: ID) => number;
  /* Leistungen */
  /** Legt die Leistung an und ergänzt bei Bedarf einen Nachweis (`nachweiseErgaenzen`); liefert die ID. */
  addLeistung: (l: Omit<Leistung, 'id' | 'erfasst' | 'quelle'> & { quelle?: Quelle }) => ID;
  /** Ändern; ein neues Datum außerhalb aller Nachweise ergänzt ebenfalls einen. */
  updateLeistung: (id: ID, patch: Partial<Omit<Leistung, 'id' | 'projektId'>>) => void;
  deleteLeistung: (id: ID) => void;
  deleteLeistungen: (ids: ID[]) => void;
  /** Fehlende Nachweise für alle Leistungen ohne Nachweis des Projekts anlegen; liefert { neu, erweitert } (Anzahl). */
  nachweiseFuerOffeneLeistungen: (projektId: ID) => { neu: number; erweitert: number };
  /* Nachweise */
  /** Fügt den Nachweis an; die ID vorab mit newId('ln') erzeugen. */
  addNachweis: (n: Leistungsnachweis) => void;
  updateNachweis: (id: ID, patch: Partial<Omit<Leistungsnachweis, 'id' | 'projektId'>>) => void;
  /** Löscht den Nachweis; mitLeistungen = auch die Leistungen in seinem Zeitraum löschen. */
  deleteNachweis: (id: ID, mitLeistungen: boolean) => void;
  /** Text einer Zeile setzen (mit den Leistungs-IDs der Zeile); null = wieder automatisch. */
  zeilenTextSetzen: (nachweisId: ID, zeile: NachweisZeile, text: string | null) => void;
  /** Festschreiben (`standErzeugen`), Status abgeschlossen. */
  nachweisAbschliessen: (id: ID) => void;
  /** Status in Bearbeitung, Stand verwerfen. */
  nachweisOeffnen: (id: ID) => void;
  /* Import */
  importUebernehmen: (plan: ImportPlan) => void;
  /* Verwaltung */
  /** Ersetzt den Bestand (Sicherung einspielen); danach wird wieder gespeichert. */
  ersetzeDaten: (d: LeistungsnachweisDaten) => void;
  /** Demodaten laden; bei einem Stand aus einer neueren Fassung wirkungslos, damit er nicht verloren geht. */
  zuruecksetzen: () => void;
}

/** Eine Änderung: rein, mit dem Zeitpunkt der Änderung. */
export type Aenderung = (d: LeistungsnachweisDaten, jetzt: string) => LeistungsnachweisDaten;

/**
 * Vorrat an Kennungen für eine Änderungsfunktion, die im StrictMode doppelt
 * läuft: Jeder Durchlauf (`folge()`) erhält je Präfix dieselbe Folge von
 * Kennungen; erzeugt wird nur, was der erste Durchlauf braucht.
 */
function idVorrat(): () => (prefix: string) => ID {
  const vorrat: Record<string, ID[]> = {};
  return () => {
    const zaehler: Record<string, number> = {};
    return (prefix) => {
      const n = zaehler[prefix] ?? 0;
      zaehler[prefix] = n + 1;
      const liste = (vorrat[prefix] ??= []);
      if (liste.length <= n) liste.push(newId(prefix));
      return liste[n];
    };
  };
}

/** Ändert ein Element einer Liste; die Kennung bleibt. */
const aendern = <T extends { id: ID }>(liste: T[], id: ID, fn: (x: T) => T): T[] =>
  liste.map((x) => (x.id === id ? { ...fn(x), id } : x));

/** Änderung anwenden – im Store über `setData`, in Prüfungen auf einem lokalen Stand. */
export type Mutate = (fn: Aenderung, optionen?: { zeitstempel?: boolean }) => void;

/** Die Methoden des Stores ohne Zustände (für Prüfungen auch außerhalb von React nutzbar). */
export type StoreAktionen = Omit<StoreValue, 'data' | 'ladeZustand' | 'ersetzeDaten' | 'zuruecksetzen'>;

/**
 * Die Methoden des Stores auf dem Stand `data`. Jede Methode ist genau ein
 * `mutate`; Rückgabewerte für die Oberfläche (etwa die Zahl neuer Nachweise)
 * werden zusätzlich auf `data` gerechnet – mit denselben Kennungen.
 */
export function storeAktionen(data: LeistungsnachweisDaten, mutate: Mutate): StoreAktionen {
  const nachweisAendern = (id: ID, fn: (n: Leistungsnachweis, d: LeistungsnachweisDaten, jetzt: string) => Leistungsnachweis) =>
    mutate((d, jetzt) => ({
      ...d,
      nachweise: d.nachweise.map((n) => (n.id === id ? { ...fn(n, d, jetzt), id, projektId: n.projektId, geaendert: jetzt } : n)),
    }));

  return {
    setEinstellungen: (e) => mutate((d) => ({ ...d, einstellungen: { ...d.einstellungen, ...e } })),

    addMitarbeiter: (m) => {
      const id = newId('ma');
      mutate((d) => ({ ...d, mitarbeiter: [...d.mitarbeiter, { ...m, id }] }));
      return id;
    },
    updateMitarbeiter: (id, patch) =>
      mutate((d) => ({ ...d, mitarbeiter: aendern(d.mitarbeiter, id, (m) => ({ ...m, ...patch })) })),
    deleteMitarbeiter: (id) =>
      mutate((d) => ({
        ...d,
        mitarbeiter: d.mitarbeiter.filter((m) => m.id !== id),
        einstellungen: d.einstellungen.mitarbeiterId === id ? { ...d.einstellungen, mitarbeiterId: null } : d.einstellungen,
      })),

    addProjekt: (p) => {
      const id = newId('pr');
      mutate((d) => ({ ...d, projekte: [...d.projekte, { ...p, id }] }));
      return id;
    },
    updateProjekt: (id, patch) =>
      mutate((d) => {
        const projekte = aendern(d.projekte, id, (p) => ({ ...p, ...patch }));
        if (!patch.abschnitte) return { ...d, projekte };
        const gueltig = new Set(patch.abschnitte.map((a) => a.id));
        return {
          ...d,
          projekte,
          leistungen: d.leistungen.map((l) =>
            l.projektId === id && l.abschnittId && !gueltig.has(l.abschnittId) ? { ...l, abschnittId: null } : l,
          ),
        };
      }),
    deleteProjekt: (id) =>
      mutate((d) => ({
        ...d,
        projekte: d.projekte.filter((p) => p.id !== id),
        leistungen: d.leistungen.filter((l) => l.projektId !== id),
        nachweise: d.nachweise.filter((n) => n.projektId !== id),
      })),
    toggleMarkiert: (id) =>
      mutate((d) => ({ ...d, projekte: aendern(d.projekte, id, (p) => ({ ...p, markiert: !p.markiert })) })),
    abschnitteAusProjektelementen: (projektId) => {
      const folge = idVorrat();
      // Die Zahl auf dem angezeigten Stand; die Kennungen gelten auch in der Änderung
      const { anzahl } = abschnitteAusElementen(data, projektId, folge());
      mutate((d) => abschnitteAusElementen(d, projektId, folge()).daten);
      return anzahl;
    },

    addLeistung: (l) => {
      const id = newId('le');
      const folge = idVorrat();
      mutate((d, jetzt) => {
        const leistung: Leistung = { ...l, id, stunden: runden(l.stunden), quelle: l.quelle ?? 'manuell', erfasst: jetzt };
        const ids = folge();
        return nachweiseSichern({ ...d, leistungen: [...d.leistungen, leistung] }, leistung.projektId, [leistung.datum], jetzt, () =>
          ids('ln'),
        ).daten;
      });
      return id;
    },
    updateLeistung: (id, patch) => {
      const folge = idVorrat();
      mutate((d, jetzt) => {
        const alt = d.leistungen.find((l) => l.id === id);
        if (!alt) return d;
        const neu: Leistung = { ...alt, ...patch, id, projektId: alt.projektId, stunden: runden(patch.stunden ?? alt.stunden) };
        const daten = { ...d, leistungen: d.leistungen.map((l) => (l.id === id ? neu : l)) };
        if (neu.datum === alt.datum) return daten;
        const ids = folge();
        return nachweiseSichern(daten, neu.projektId, [neu.datum], jetzt, () => ids('ln')).daten;
      });
    },
    deleteLeistung: (id) => mutate((d) => ({ ...d, leistungen: d.leistungen.filter((l) => l.id !== id) })),
    deleteLeistungen: (ids) => {
      const weg = new Set(ids);
      mutate((d) => ({ ...d, leistungen: d.leistungen.filter((l) => !weg.has(l.id)) }));
    },
    nachweiseFuerOffeneLeistungen: (projektId) => {
      const folge = idVorrat();
      const offen = (d: LeistungsnachweisDaten, jetzt: string) => {
        const ids = folge();
        return nachweiseSichern(d, projektId, leistungenOhneNachweis(d, projektId).map((l) => l.datum), jetzt, () => ids('ln'));
      };
      const { ergaenzung } = offen(data, new Date().toISOString());
      mutate((d, jetzt) => offen(d, jetzt).daten);
      return { neu: ergaenzung.neu.length, erweitert: ergaenzung.erweitert.length };
    },

    addNachweis: (n) => mutate((d) => (d.nachweise.some((x) => x.id === n.id) ? d : { ...d, nachweise: [...d.nachweise, n] })),
    updateNachweis: (id, patch) => nachweisAendern(id, (n) => ({ ...n, ...patch })),
    deleteNachweis: (id, mitLeistungen) =>
      mutate((d) => {
        const n = d.nachweise.find((x) => x.id === id);
        if (!n) return d;
        return {
          ...d,
          nachweise: d.nachweise.filter((x) => x.id !== id),
          leistungen: mitLeistungen
            ? d.leistungen.filter((l) => !(l.projektId === n.projektId && l.datum >= n.von && l.datum <= n.bis))
            : d.leistungen,
        };
      }),
    zeilenTextSetzen: (nachweisId, zeile, text) => nachweisAendern(nachweisId, (n) => mitZeilenText(n, zeile, text)),
    nachweisAbschliessen: (id) =>
      nachweisAendern(id, (n, d, jetzt) => ({ ...n, status: 'abgeschlossen', abgeschlossen: jetzt, stand: standErzeugen(d, n) })),
    nachweisOeffnen: (id) => nachweisAendern(id, (n) => ({ ...n, status: 'entwurf', abgeschlossen: null, stand: null })),

    importUebernehmen: (plan) => mutate((d) => importAnwenden(d, plan)),
  };
}

/** Wendet eine Änderung an und räumt danach auf (`nachweiseBereinigen`) – rein. */
export function aenderungAnwenden(
  alt: LeistungsnachweisDaten,
  fn: Aenderung,
  jetzt: string,
  optionen: { zeitstempel?: boolean } = {},
): LeistungsnachweisDaten {
  return nachweiseBereinigen(alt, fn(alt, jetzt), jetzt, optionen.zeitstempel !== false);
}

const StoreContext = createContext<StoreValue | null>(null);

/** Hält den Bestand des Bereichs und stellt ihn mit allen Schreibzugriffen bereit. */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [geladen] = useState(ladeDaten);
  const [data, setData] = useState<LeistungsnachweisDaten>(geladen.daten);
  const [ladeZustand, setLadeZustand] = useState<LadeZustand>(geladen.zustand);

  // Nach einem Ladefehler bzw. bei einer neueren Fassung bleibt der gespeicherte Stand unberührt
  useEffect(() => {
    if (ladeZustand !== 'ok') return;
    speichereDaten(data);
  }, [data, ladeZustand]);

  /** Jede Änderung läuft hierüber – die Funktion muss rein sein. */
  const mutate = useCallback<Mutate>((fn, optionen = {}) => {
    const jetzt = new Date().toISOString();
    setData((alt) => aenderungAnwenden(alt, fn, jetzt, optionen));
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      data,
      ladeZustand,
      ...storeAktionen(data, mutate),
      ersetzeDaten: (d) => {
        mutate(() => d, { zeitstempel: false });
        setLadeZustand('ok');
      },
      zuruecksetzen: () => {
        // Ein Stand aus einer neueren Fassung darf nicht überschrieben werden
        if (ladeZustand === 'neuere_fassung') return;
        const demo = seedDaten();
        mutate(() => demo, { zeitstempel: false });
        setLadeZustand('ok');
      },
    }),
    [data, ladeZustand, mutate],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** Zugriff auf den Bestand und die Schreibzugriffe – nur innerhalb von `StoreProvider`. */
export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore außerhalb von StoreProvider');
  return ctx;
}
