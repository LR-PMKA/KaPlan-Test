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
 *
 * Die Rechte (domain/rechte.ts) werden hier durchgesetzt: Jede Änderung prüft
 * sie auf dem Stand, den sie ändert – ohne Recht ändert eine Methode nichts.
 * Rückgabewerte (Kennungen, Meldungen) rechnet die Methode zusätzlich auf dem
 * angezeigten Stand. Mit der gemeinsamen Datenbank gehen dieselben Prüfungen
 * auf den Server über.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { abschnitteAusElementen, importAnwenden, kuerzelFrei, type ImportPlan } from '../domain/import';
import {
  aufschlagPruefen,
  leistungenOhneNachweis,
  mitAufschlag,
  mitZeilenText,
  nachweisAbschliessenAnwenden,
  nachweiseBereinigen,
  nachweiseSichern,
  ueberschneidung,
} from '../domain/nachweis';
import {
  NICHT_ANGEMELDET,
  NUR_CONTROLLING,
  angemeldet,
  controllingEinrichtbar,
  darf,
  darfLeistungAendern,
  istControlling,
  mitarbeiterAendernPruefen,
  mitarbeiterLoeschenPruefen,
  rolleSetzenPruefen,
} from '../domain/rechte';
import { seedDaten } from '../domain/seed';
import {
  kuerzelAus,
  mitarbeiterName,
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
import { istDatum, runden } from '../domain/zeitraum';
import { ladeDaten, speichereDaten, type LadeZustand } from './storage';

export { newId };

interface StoreValue {
  data: LeistungsnachweisDaten;
  /** 'ok' – es wird gespeichert; sonst zeigt der Bereich Demodaten und lässt den gespeicherten Stand unberührt. */
  ladeZustand: LadeZustand;
  /** Anzeigename und Farbmodus; die Anmeldung läuft über `anmelden`. */
  setEinstellungen: (e: Partial<Omit<Einstellungen, 'mitarbeiterId'>>) => void;
  /* Anmeldung und Rollen */
  /**
   * Meldet einen aktiven Mitarbeiter an (setzt `mitarbeiterId` und `bearbeiter`); null meldet ab.
   * `controlling`: dabei die Rolle Controlling übernehmen – nur solange niemand sie hat.
   */
  anmelden: (mitarbeiterId: ID | null, optionen?: { controlling?: boolean }) => void;
  /**
   * Legt die angemeldete Person selbst an (aktiv, ohne Rolle – mit `controlling` die Rolle, solange
   * niemand sie hat) und meldet sie an. Ein vergebenes Kürzel wird eindeutig gemacht (`kuerzelFrei`),
   * ein leeres aus dem Namen gebildet. null ohne Nachnamen.
   */
  selbstAnlegen: (m: { vorname: string; nachname: string; kuerzel: string; controlling?: boolean }) => ID | null;
  /** Rolle Controlling vergeben/entziehen (`rolleSetzenPruefen`); liefert die Meldung oder null. */
  rolleSetzen: (mitarbeiterId: ID, controlling: boolean) => string | null;
  /* Mitarbeiter (nur Controlling) */
  /** Legt einen Mitarbeiter an (ohne Rolle); null ohne Recht. */
  addMitarbeiter: (m: Omit<Mitarbeiter, 'id' | 'controlling'>) => ID | null;
  /** Ändert einen Mitarbeiter (nicht die Rolle); liefert die Meldung (etwa die letzte Person mit Rolle deaktivieren) oder null. */
  updateMitarbeiter: (id: ID, patch: Partial<Omit<Mitarbeiter, 'id' | 'controlling'>>) => string | null;
  /** Nur ohne Leistungen und nicht die letzte Person mit Rolle; liefert die Meldung oder null. */
  deleteMitarbeiter: (id: ID) => string | null;
  /* Projekte */
  /** Jeder Angemeldete; null ohne Anmeldung. */
  addProjekt: (p: Omit<Projekt, 'id'>) => ID | null;
  /** Ändern (jeder Angemeldete); entfallene Abschnitte verlieren ihre Leistungen (diese stehen dann ohne Abschnitt). */
  updateProjekt: (id: ID, patch: Partial<Omit<Projekt, 'id'>>) => void;
  /** Mit allen Leistungen und Nachweisen – nur Controlling. */
  deleteProjekt: (id: ID) => void;
  toggleMarkiert: (id: ID) => void;
  /** Abschnitte aus den Projektelementen der Leistungen anlegen und Leistungen ohne Abschnitt zuordnen; liefert die Zahl neuer Abschnitte. */
  abschnitteAusProjektelementen: (projektId: ID) => number;
  /* Leistungen – nur eigene */
  /**
   * Legt eine Leistung der angemeldeten Person an und ergänzt bei Bedarf einen Nachweis
   * (`nachweiseErgaenzen`); liefert die ID, ohne Anmeldung null (keine Änderung).
   */
  addLeistung: (l: Omit<Leistung, 'id' | 'erfasst' | 'quelle' | 'mitarbeiterId'> & { quelle?: Quelle }) => ID | null;
  /** Ändern – nur eigene; Mitarbeiter und Projekt bleiben. Ein neues Datum außerhalb aller Nachweise ergänzt einen. */
  updateLeistung: (id: ID, patch: Partial<Omit<Leistung, 'id' | 'projektId' | 'mitarbeiterId'>>) => void;
  /** Nur eigene. */
  deleteLeistung: (id: ID) => void;
  /** Nur eigene; fremde Kennungen bleiben unberührt. */
  deleteLeistungen: (ids: ID[]) => void;
  /** Fehlende Nachweise für alle Leistungen ohne Nachweis des Projekts anlegen (jeder Angemeldete); liefert { neu, erweitert } (Anzahl). */
  nachweiseFuerOffeneLeistungen: (projektId: ID) => { neu: number; erweitert: number };
  /* Nachweise */
  /** Fügt den Nachweis an (nur Controlling, ohne Überschneidung); die ID vorab mit newId('ln') erzeugen. */
  addNachweis: (n: Leistungsnachweis) => void;
  /**
   * Zeitraum, Raster, Titel – nur Controlling (ohne Überschneidung). Nur die Bemerkung darf jeder
   * Angemeldete ändern, solange der Nachweis offen ist (gemeinsame Bearbeitung).
   */
  updateNachweis: (id: ID, patch: Partial<Pick<Leistungsnachweis, 'titel' | 'von' | 'bis' | 'raster' | 'bemerkung'>>) => void;
  /** Löscht den Nachweis (nur Controlling); mitLeistungen = auch die Leistungen in seinem Zeitraum löschen. */
  deleteNachweis: (id: ID, mitLeistungen: boolean) => void;
  /** Text einer Zeile setzen (mit den Leistungs-IDs der Zeile); null = wieder automatisch. Jeder Angemeldete, nur offene Nachweise. */
  zeilenTextSetzen: (nachweisId: ID, zeile: NachweisZeile, text: string | null) => void;
  /**
   * Abschließen (nur Controlling, nur offene): fortlaufende Nachweise enden am letzten Tag mit
   * Leistungen (`abschlussZeitraum`), der Stand wird mit Aufschlägen festgeschrieben.
   */
  nachweisAbschliessen: (id: ID) => void;
  /** Status in Bearbeitung, Stand verwerfen (nur Controlling; die Rückfrage macht die Oberfläche). */
  nachweisOeffnen: (id: ID) => void;
  /**
   * Aufschlag einer Zeile (± Stunden; null/0 entfernt) – nur Controlling, nur offene Nachweise.
   * Ohne Abschnittsspalten gilt er der ganzen Zeile (`abschnittId` null). Liefert die Meldung
   * (`AUFSCHLAG_KEINE_ZAHL`, `AUFSCHLAG_UNTER_NULL` …) oder null.
   */
  aufschlagSetzen: (nachweisId: ID, zeilenSchluessel: string, abschnittId: ID | null, stunden: number | null) => string | null;
  /** Alle Aufschläge des Nachweises entfernen – nur Controlling, nur offen. */
  aufschlaegeZuruecksetzen: (nachweisId: ID) => void;
  /* Import */
  /**
   * Übernimmt den Plan (`importPlanen`). Ohne Anmeldung nichts; ohne Rolle Controlling nur eigene
   * Leistungen, keine neuen Mitarbeiter und nur eigene frühere Importe als „ersetzt“.
   */
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

/** Felder ohne `undefined` – ein Patch soll nichts auf undefined setzen. */
const ohneLeere = <T extends object>(patch: T): T =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as T;

/** Änderung anwenden – im Store über `setData`, in Prüfungen auf einem lokalen Stand. */
export type Mutate = (fn: Aenderung, optionen?: { zeitstempel?: boolean }) => void;

/** Die Methoden des Stores ohne Zustände (für Prüfungen auch außerhalb von React nutzbar). */
export type StoreAktionen = Omit<StoreValue, 'data' | 'ladeZustand' | 'ersetzeDaten' | 'zuruecksetzen'>;

/**
 * Beschränkt einen Importplan auf das, was die angemeldete Person darf: ohne
 * Anmeldung nichts; ohne Rolle Controlling nur eigene neue Leistungen, keine
 * neuen Mitarbeiter und als „ersetzt“ nur eigene frühere Importe.
 */
function planErlaubt(d: LeistungsnachweisDaten, plan: ImportPlan): ImportPlan | null {
  const ich = angemeldet(d);
  if (!ich) return null;
  if (darf(d, 'sammelImport')) return plan;
  const eigen = new Set(d.leistungen.filter((l) => l.mitarbeiterId === ich.id && l.quelle === 'import').map((l) => l.id));
  const neueLeistungen = plan.neueLeistungen.filter((l) => l.mitarbeiterId === ich.id);
  // Projekte und Nachweise nur, soweit eigene Leistungen sie brauchen
  const projekte = new Set(neueLeistungen.map((l) => l.projektId));
  const brauchtNachweis = (projektId: ID, von: string, bis: string) =>
    neueLeistungen.some((l) => l.projektId === projektId && l.datum >= von && l.datum <= bis);
  return {
    ...plan,
    neueMitarbeiter: [],
    neueProjekte: plan.neueProjekte.filter((p) => projekte.has(p.id)),
    neueLeistungen,
    neueNachweise: plan.neueNachweise.filter((n) => brauchtNachweis(n.projektId, n.von, n.bis)),
    erweiterteNachweise: plan.erweiterteNachweise.filter((e) => {
      const n = d.nachweise.find((x) => x.id === e.id);
      return !!n && brauchtNachweis(n.projektId, e.von, e.bis);
    }),
    entfernen: plan.entfernen.filter((id) => eigen.has(id)),
  };
}

/**
 * Die Methoden des Stores auf dem Stand `data`. Jede Methode ist genau ein
 * `mutate`; Rückgabewerte für die Oberfläche (etwa die Zahl neuer Nachweise)
 * werden zusätzlich auf `data` gerechnet – mit denselben Kennungen.
 */
export function storeAktionen(data: LeistungsnachweisDaten, mutate: Mutate): StoreAktionen {
  /** Ändert einen Nachweis, wenn `erlaubt` auf dem aktuellen Stand zutrifft. */
  const nachweisAendern = (
    id: ID,
    erlaubt: (n: Leistungsnachweis, d: LeistungsnachweisDaten) => boolean,
    fn: (n: Leistungsnachweis, d: LeistungsnachweisDaten, jetzt: string) => Leistungsnachweis,
  ) =>
    mutate((d, jetzt) => {
      const alt = d.nachweise.find((n) => n.id === id);
      if (!alt || !erlaubt(alt, d)) return d;
      return {
        ...d,
        nachweise: d.nachweise.map((n) => (n.id === id ? { ...fn(n, d, jetzt), id, projektId: n.projektId, geaendert: jetzt } : n)),
      };
    });
  /** Nur mit Anmeldung. */
  const angemeldetNur = (fn: Aenderung): Aenderung => (d, jetzt) => (angemeldet(d) ? fn(d, jetzt) : d);
  /** Nur mit der Rolle Controlling. */
  const controllingNur = (fn: Aenderung): Aenderung => (d, jetzt) => (istControlling(d) ? fn(d, jetzt) : d);

  return {
    setEinstellungen: (e) => {
      // Die Anmeldung (mitarbeiterId) wechselt nur über anmelden
      const patch: Partial<Einstellungen> = {};
      if (e.bearbeiter !== undefined) patch.bearbeiter = e.bearbeiter;
      if (e.farbmodus !== undefined) patch.farbmodus = e.farbmodus;
      mutate((d) => ({ ...d, einstellungen: { ...d.einstellungen, ...patch } }));
    },

    anmelden: (mitarbeiterId, optionen = {}) =>
      mutate((d) => {
        if (mitarbeiterId === null) return { ...d, einstellungen: { ...d.einstellungen, mitarbeiterId: null } };
        const m = d.mitarbeiter.find((x) => x.id === mitarbeiterId && x.aktiv);
        if (!m) return d;
        const rolle = optionen.controlling === true && !m.controlling && controllingEinrichtbar(d);
        return {
          ...d,
          mitarbeiter: rolle ? aendern(d.mitarbeiter, m.id, (x) => ({ ...x, controlling: true })) : d.mitarbeiter,
          einstellungen: { ...d.einstellungen, mitarbeiterId: m.id, bearbeiter: mitarbeiterName(m) || m.kuerzel },
        };
      }),
    selbstAnlegen: (m) => {
      const vorname = m.vorname.trim();
      const nachname = m.nachname.trim();
      if (!nachname) return null;
      const id = newId('ma');
      mutate((d) => {
        if (d.mitarbeiter.some((x) => x.id === id)) return d;
        const neu: Mitarbeiter = {
          id,
          kuerzel: kuerzelFrei(m.kuerzel.trim() || kuerzelAus(`${vorname} ${nachname}`), d.mitarbeiter),
          vorname,
          nachname,
          aktiv: true,
          controlling: m.controlling === true && controllingEinrichtbar(d),
        };
        return {
          ...d,
          mitarbeiter: [...d.mitarbeiter, neu],
          einstellungen: { ...d.einstellungen, mitarbeiterId: id, bearbeiter: mitarbeiterName(neu) },
        };
      });
      return id;
    },
    rolleSetzen: (mitarbeiterId, controlling) => {
      const meldung = rolleSetzenPruefen(data, mitarbeiterId, controlling);
      mutate((d) =>
        rolleSetzenPruefen(d, mitarbeiterId, controlling) === null
          ? { ...d, mitarbeiter: aendern(d.mitarbeiter, mitarbeiterId, (x) => ({ ...x, controlling })) }
          : d,
      );
      return meldung;
    },

    addMitarbeiter: (m) => {
      if (!darf(data, 'mitarbeiterVerwalten')) return null;
      const id = newId('ma');
      mutate(
        controllingNur((d) =>
          d.mitarbeiter.some((x) => x.id === id) ? d : { ...d, mitarbeiter: [...d.mitarbeiter, { ...m, id, controlling: false }] },
        ),
      );
      return id;
    },
    updateMitarbeiter: (id, patch) => {
      // Die Rolle wechselt nur über rolleSetzen
      const { controlling: _rolle, ...rest } = patch as Partial<Mitarbeiter>;
      void _rolle;
      const sauber = ohneLeere(rest);
      const meldung = mitarbeiterAendernPruefen(data, id, sauber);
      mutate((d) =>
        mitarbeiterAendernPruefen(d, id, sauber) === null
          ? { ...d, mitarbeiter: aendern(d.mitarbeiter, id, (m) => ({ ...m, ...sauber, controlling: m.controlling })) }
          : d,
      );
      return meldung;
    },
    deleteMitarbeiter: (id) => {
      const meldung = mitarbeiterLoeschenPruefen(data, id);
      mutate((d) =>
        mitarbeiterLoeschenPruefen(d, id) === null
          ? {
              ...d,
              mitarbeiter: d.mitarbeiter.filter((m) => m.id !== id),
              einstellungen: d.einstellungen.mitarbeiterId === id ? { ...d.einstellungen, mitarbeiterId: null } : d.einstellungen,
            }
          : d,
      );
      return meldung;
    },

    addProjekt: (p) => {
      if (!angemeldet(data)) return null;
      const id = newId('pr');
      mutate(angemeldetNur((d) => (d.projekte.some((x) => x.id === id) ? d : { ...d, projekte: [...d.projekte, { ...p, id }] })));
      return id;
    },
    updateProjekt: (id, patch) =>
      mutate(
        angemeldetNur((d) => {
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
      ),
    deleteProjekt: (id) =>
      mutate(
        controllingNur((d) => ({
          ...d,
          projekte: d.projekte.filter((p) => p.id !== id),
          leistungen: d.leistungen.filter((l) => l.projektId !== id),
          nachweise: d.nachweise.filter((n) => n.projektId !== id),
        })),
      ),
    toggleMarkiert: (id) =>
      mutate((d) => ({ ...d, projekte: aendern(d.projekte, id, (p) => ({ ...p, markiert: !p.markiert })) })),
    abschnitteAusProjektelementen: (projektId) => {
      if (!angemeldet(data)) return 0;
      const folge = idVorrat();
      // Die Zahl auf dem angezeigten Stand; die Kennungen gelten auch in der Änderung
      const { anzahl } = abschnitteAusElementen(data, projektId, folge());
      mutate(angemeldetNur((d) => abschnitteAusElementen(d, projektId, folge()).daten));
      return anzahl;
    },

    addLeistung: (l) => {
      if (!angemeldet(data)) return null;
      const id = newId('le');
      const folge = idVorrat();
      mutate((d, jetzt) => {
        const ich = angemeldet(d);
        if (!ich || d.leistungen.some((x) => x.id === id)) return d;
        const { mitarbeiterId: _fremd, ...werte } = l as typeof l & { mitarbeiterId?: ID };
        void _fremd;
        const leistung: Leistung = {
          ...werte,
          id,
          mitarbeiterId: ich.id,
          stunden: runden(l.stunden),
          quelle: l.quelle ?? 'manuell',
          erfasst: jetzt,
        };
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
        if (!alt || !darfLeistungAendern(d, alt)) return d;
        const neu: Leistung = {
          ...alt,
          ...ohneLeere(patch),
          id,
          projektId: alt.projektId,
          mitarbeiterId: alt.mitarbeiterId,
          stunden: runden(patch.stunden ?? alt.stunden),
        };
        const daten = { ...d, leistungen: d.leistungen.map((l) => (l.id === id ? neu : l)) };
        if (neu.datum === alt.datum) return daten;
        const ids = folge();
        return nachweiseSichern(daten, neu.projektId, [neu.datum], jetzt, () => ids('ln')).daten;
      });
    },
    deleteLeistung: (id) =>
      mutate((d) => {
        const l = d.leistungen.find((x) => x.id === id);
        return l && darfLeistungAendern(d, l) ? { ...d, leistungen: d.leistungen.filter((x) => x.id !== id) } : d;
      }),
    deleteLeistungen: (ids) => {
      const weg = new Set(ids);
      mutate((d) => {
        const loeschen = d.leistungen.filter((l) => weg.has(l.id) && darfLeistungAendern(d, l));
        if (loeschen.length === 0) return d;
        const raus = new Set(loeschen.map((l) => l.id));
        return { ...d, leistungen: d.leistungen.filter((l) => !raus.has(l.id)) };
      });
    },
    nachweiseFuerOffeneLeistungen: (projektId) => {
      if (!angemeldet(data)) return { neu: 0, erweitert: 0 };
      const folge = idVorrat();
      const offen = (d: LeistungsnachweisDaten, jetzt: string) => {
        const ids = folge();
        return nachweiseSichern(d, projektId, leistungenOhneNachweis(d, projektId).map((l) => l.datum), jetzt, () => ids('ln'));
      };
      const { ergaenzung } = offen(data, new Date().toISOString());
      mutate(angemeldetNur((d, jetzt) => offen(d, jetzt).daten));
      return { neu: ergaenzung.neu.length, erweitert: ergaenzung.erweitert.length };
    },

    addNachweis: (n) =>
      mutate(
        controllingNur((d) =>
          d.nachweise.some((x) => x.id === n.id) ||
          !d.projekte.some((p) => p.id === n.projektId) ||
          !istDatum(n.von) ||
          !istDatum(n.bis) ||
          n.von > n.bis ||
          ueberschneidung(d, n.projektId, n.von, n.bis)
            ? d
            : { ...d, nachweise: [...d.nachweise, { ...n, aufschlaege: n.aufschlaege ?? {} }] },
        ),
      ),
    updateNachweis: (id, patch) => {
      const sauber = ohneLeere(patch);
      if (Object.keys(sauber).length === 0) return;
      const nurBemerkung = Object.keys(sauber).every((k) => k === 'bemerkung');
      nachweisAendern(
        id,
        (n, d) => {
          if (nurBemerkung) return istControlling(d) || (!!angemeldet(d) && n.status === 'entwurf');
          if (!darf(d, 'nachweisVerwalten')) return false;
          const von = sauber.von ?? n.von;
          const bis = sauber.bis ?? n.bis;
          return istDatum(von) && istDatum(bis) && von <= bis && !ueberschneidung(d, n.projektId, von, bis, n.id);
        },
        (n) => ({ ...n, ...sauber }),
      );
    },
    deleteNachweis: (id, mitLeistungen) =>
      mutate(
        controllingNur((d) => {
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
      ),
    zeilenTextSetzen: (nachweisId, zeile, text) =>
      nachweisAendern(
        nachweisId,
        (n, d) => !!angemeldet(d) && n.status === 'entwurf',
        (n) => mitZeilenText(n, zeile, text),
      ),
    nachweisAbschliessen: (id) => {
      const folge = idVorrat();
      mutate(
        controllingNur((d, jetzt) => {
          const ids = folge();
          return nachweisAbschliessenAnwenden(d, id, jetzt, () => ids('ln'));
        }),
      );
    },
    nachweisOeffnen: (id) =>
      nachweisAendern(
        id,
        (n, d) => darf(d, 'abschliessen') && n.status === 'abgeschlossen',
        (n) => ({ ...n, status: 'entwurf', abgeschlossen: null, stand: null }),
      ),
    aufschlagSetzen: (nachweisId, zeilenSchluessel, abschnittId, stunden) => {
      const pruefen = (d: LeistungsnachweisDaten): string | null => {
        if (!angemeldet(d)) return NICHT_ANGEMELDET;
        if (!darf(d, 'aufschlag')) return NUR_CONTROLLING;
        const n = d.nachweise.find((x) => x.id === nachweisId);
        if (!n) return 'Diesen Leistungsnachweis gibt es nicht (mehr).';
        if (n.status !== 'entwurf') return 'Der Leistungsnachweis ist abgeschlossen – Aufschläge erst nach „Wieder öffnen“.';
        return aufschlagPruefen(d, n, zeilenSchluessel, abschnittId, stunden);
      };
      const meldung = pruefen(data);
      if (meldung) return meldung;
      nachweisAendern(
        nachweisId,
        (_n, d) => pruefen(d) === null,
        (n, d) =>
          mitAufschlag(
            n,
            d.projekte.find((p) => p.id === n.projektId),
            zeilenSchluessel,
            abschnittId,
            stunden,
          ),
      );
      return null;
    },
    aufschlaegeZuruecksetzen: (nachweisId) =>
      nachweisAendern(
        nachweisId,
        (n, d) => darf(d, 'aufschlag') && n.status === 'entwurf' && Object.keys(n.aufschlaege).length > 0,
        (n) => ({ ...n, aufschlaege: {} }),
      ),

    importUebernehmen: (plan) =>
      mutate((d) => {
        const erlaubt = planErlaubt(d, plan);
        return erlaubt ? importAnwenden(d, erlaubt) : d;
      }),
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
