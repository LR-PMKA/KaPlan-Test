/**
 * Datenbestand des Bereichs „Projektsteuerung“. Alle Schreibzugriffe laufen
 * über `mutate()`; danach werden die Teilnehmenden der Protokolle mit der
 * Projektbeteiligtenliste abgeglichen (`teilnehmerNachziehen`) und der
 * Bestand lokal gespeichert. Der Aufbau entspricht dem des
 * Planlaufmanagements, ist davon aber vollständig getrennt.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { folgeprotokoll, naechsteNr, teilnehmerNachziehen } from '../domain/protokoll';
import { seedDaten } from '../domain/seed';
import {
  newId,
  type Beteiligter,
  type Einstellungen,
  type Funktion,
  type ID,
  type Projekt,
  type ProjektsteuerungDaten,
  type Protokoll,
} from '../domain/types';
import type { Punkt } from '../domain/punkte';
import { ladeDaten, speichereDaten } from './storage';

export { newId };

interface StoreValue {
  data: ProjektsteuerungDaten;
  /* Einstellungen */
  setEinstellungen: (e: Partial<Einstellungen>) => void;
  /* Gewerke */
  addGewerk: (name: string) => void;
  /** Löscht ein Gewerk samt seiner Funktionen; ob diese noch Personen tragen, prüft die Oberfläche vorher. */
  deleteGewerk: (name: string) => void;
  /* Funktionen (projektübergreifend) */
  addFunktion: (f: Omit<Funktion, 'id'>) => ID;
  updateFunktion: (id: ID, patch: Partial<Omit<Funktion, 'id'>>) => void;
  /** Löscht eine Funktion; ob sie noch Projektbeteiligten zugeordnet ist, prüft die Oberfläche vorher. */
  deleteFunktion: (id: ID) => void;
  /* Projekte */
  addProjekt: (p: Omit<Projekt, 'id'>) => ID;
  updateProjekt: (id: ID, patch: Partial<Omit<Projekt, 'id'>>) => void;
  /** Löscht das Projekt mit Beteiligten und Protokollen. */
  deleteProjekt: (id: ID) => void;
  toggleMarkiert: (id: ID) => void;
  /* Projektbeteiligte */
  addBeteiligter: (b: Omit<Beteiligter, 'id'>) => ID;
  updateBeteiligter: (id: ID, patch: Partial<Omit<Beteiligter, 'id' | 'projektId'>>) => void;
  /** Entfernt die Person; in Protokollen bleiben ihre Angaben als Text stehen. */
  deleteBeteiligter: (id: ID) => void;
  /* Protokolle */
  addProtokoll: (p: Protokoll) => void;
  /** Ändert ein Protokoll über eine reine Funktion und vermerkt den Zeitpunkt. */
  updateProtokoll: (id: ID, fn: (p: Protokoll) => Protokoll) => void;
  /** Löscht ein Protokoll; Aufgaben, die es weitergeführt hat, gelten im Vorprotokoll wieder als offen. */
  deleteProtokoll: (id: ID) => void;
  /** Legt das Folgeprotokoll an (Nummer: höchste der Reihe + 1) und liefert seine Kennung. */
  folgeprotokollAnlegen: (id: ID) => ID | null;
  /** Übernimmt Protokolle (etwa aus dem Protokoll-Tool); gleiche Kennungen werden ersetzt. */
  protokolleUebernehmen: (liste: Protokoll[]) => void;
  /* Aufgaben aus den Protokollen */
  /** Setzt „erledigt“ an einer Aufgabe – Eintrag oder Ergänzung mit eigener Art. */
  punktErledigen: (punkt: Punkt, erledigt: boolean) => void;
  /* Verwaltung */
  ersetzeDaten: (d: ProjektsteuerungDaten) => void;
  zuruecksetzen: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ProjektsteuerungDaten>(() => ladeDaten());

  useEffect(() => {
    speichereDaten(data);
  }, [data]);

  /** Jede Änderung läuft hierüber – die Funktion muss rein sein. */
  const mutate = useCallback((fn: (d: ProjektsteuerungDaten) => ProjektsteuerungDaten) => {
    setData((alt) => teilnehmerNachziehen(fn(alt)));
  }, []);

  const protokollAendern = useCallback(
    (id: ID, fn: (p: Protokoll) => Protokoll) =>
      mutate((d) => ({
        ...d,
        protokolle: d.protokolle.map((p) => (p.id === id ? { ...fn(p), id, geaendert: new Date().toISOString() } : p)),
      })),
    [mutate],
  );

  const value = useMemo<StoreValue>(
    () => ({
      data,
      setEinstellungen: (e) => mutate((d) => ({ ...d, einstellungen: { ...d.einstellungen, ...e } })),

      addGewerk: (name) =>
        mutate((d) =>
          d.gewerke.some((g) => g.toLowerCase() === name.trim().toLowerCase())
            ? d
            : { ...d, gewerke: [...d.gewerke, name.trim()].sort((a, b) => a.localeCompare(b, 'de')) },
        ),
      deleteGewerk: (name) =>
        mutate((d) => {
          const gleich = (g: string | null) => (g ?? '').toLowerCase() === name.toLowerCase();
          const weg = new Set(d.funktionen.filter((f) => gleich(f.gewerk)).map((f) => f.id));
          return {
            ...d,
            gewerke: d.gewerke.filter((g) => !gleich(g)),
            funktionen: d.funktionen.filter((f) => !weg.has(f.id)),
            beteiligte: d.beteiligte.map((b) => (b.funktionId && weg.has(b.funktionId) ? { ...b, funktionId: null } : b)),
          };
        }),

      addFunktion: (f) => {
        const id = newId('fn');
        mutate((d) => {
          // Ein Gewerk, das es noch nicht gibt, kommt mit der Funktion hinzu.
          const neuesGewerk = f.gewerk && !d.gewerke.some((g) => g.toLowerCase() === f.gewerk!.toLowerCase());
          return {
            ...d,
            gewerke: neuesGewerk ? [...d.gewerke, f.gewerk!].sort((a, b) => a.localeCompare(b, 'de')) : d.gewerke,
            funktionen: [...d.funktionen, { ...f, id }],
          };
        });
        return id;
      },
      updateFunktion: (id, patch) =>
        mutate((d) => ({ ...d, funktionen: d.funktionen.map((f) => (f.id === id ? { ...f, ...patch, id } : f)) })),
      deleteFunktion: (id) =>
        mutate((d) => ({
          ...d,
          funktionen: d.funktionen.filter((f) => f.id !== id),
          beteiligte: d.beteiligte.map((b) => (b.funktionId === id ? { ...b, funktionId: null } : b)),
        })),

      addProjekt: (p) => {
        const id = newId('pr');
        mutate((d) => ({ ...d, projekte: [...d.projekte, { ...p, id }] }));
        return id;
      },
      updateProjekt: (id, patch) =>
        mutate((d) => ({ ...d, projekte: d.projekte.map((p) => (p.id === id ? { ...p, ...patch, id } : p)) })),
      deleteProjekt: (id) =>
        mutate((d) => ({
          ...d,
          projekte: d.projekte.filter((p) => p.id !== id),
          beteiligte: d.beteiligte.filter((b) => b.projektId !== id),
          protokolle: d.protokolle.filter((p) => p.projektId !== id),
        })),
      toggleMarkiert: (id) =>
        mutate((d) => ({
          ...d,
          projekte: d.projekte.map((p) => (p.id === id ? { ...p, markiert: !p.markiert } : p)),
        })),

      addBeteiligter: (b) => {
        const id = newId('bt');
        mutate((d) => ({ ...d, beteiligte: [...d.beteiligte, { ...b, id }] }));
        return id;
      },
      updateBeteiligter: (id, patch) =>
        mutate((d) => ({
          ...d,
          beteiligte: d.beteiligte.map((b) => (b.id === id ? { ...b, ...patch, id, projektId: b.projektId } : b)),
        })),
      deleteBeteiligter: (id) => mutate((d) => ({ ...d, beteiligte: d.beteiligte.filter((b) => b.id !== id) })),

      addProtokoll: (p) => mutate((d) => ({ ...d, protokolle: [...d.protokolle, p] })),
      updateProtokoll: protokollAendern,
      deleteProtokoll: (id) =>
        mutate((d) => ({
          ...d,
          protokolle: d.protokolle
            .filter((p) => p.id !== id)
            .map((p) =>
              p.tops.some((t) => t.eintraege.some((e) => e.uebernommenIn === id))
                ? {
                    ...p,
                    tops: p.tops.map((t) => ({
                      ...t,
                      eintraege: t.eintraege.map((e) => (e.uebernommenIn === id ? { ...e, uebernommenIn: null } : e)),
                    })),
                  }
                : p,
            ),
        })),
      folgeprotokollAnlegen: (id) => {
        if (!data.protokolle.some((p) => p.id === id)) return null;
        // Die Kennung entsteht außerhalb von mutate, damit sie beim doppelten
        // Aufruf im StrictMode dieselbe bleibt.
        const neueId = newId('pt');
        mutate((d) => {
          const quelle = d.protokolle.find((p) => p.id === id);
          if (!quelle) return d;
          const { neu, vorher } = folgeprotokoll(quelle, neueId, naechsteNr(d.protokolle, quelle.reiheId));
          return { ...d, protokolle: [...d.protokolle.map((p) => (p.id === id ? vorher : p)), neu] };
        });
        return neueId;
      },
      protokolleUebernehmen: (liste) =>
        mutate((d) => {
          const ids = new Set(liste.map((p) => p.id));
          return { ...d, protokolle: [...d.protokolle.filter((p) => !ids.has(p.id)), ...liste] };
        }),

      punktErledigen: (punkt, erledigt) => {
        const status = erledigt ? ('erledigt' as const) : ('offen' as const);
        protokollAendern(punkt.protokollId, (p) => ({
          ...p,
          tops: p.tops.map((t) => ({
            ...t,
            eintraege: t.eintraege.map((e) =>
              e.id === punkt.id
                ? { ...e, status }
                : { ...e, zeilen: e.zeilen.map((z) => (z.id === punkt.id ? { ...z, status } : z)) },
            ),
          })),
        }));
      },

      ersetzeDaten: (d) => mutate(() => d),
      zuruecksetzen: () => mutate(() => seedDaten()),
    }),
    [data, mutate, protokollAendern],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore außerhalb von StoreProvider');
  return ctx;
}
