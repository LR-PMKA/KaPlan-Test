/**
 * Datenbestand des Bereichs „Baubetriebsplanung“. Alle Schreibzugriffe laufen
 * über `mutate()`; der Bestand wird danach lokal gespeichert. Der Aufbau
 * entspricht dem des Planlaufmanagements, ist davon aber vollständig getrennt.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { today } from '../../../shared/dates';
import {
  anmeldungDuplizieren,
  bauzeitraumAbgleichen,
  wechselAnwenden,
  wechselZuruecknehmen,
  type Wechsel,
} from '../domain/ablauf';
import { newId, seedDaten } from '../domain/seed';
import type {
  Anmeldung,
  BaubetriebDaten,
  Einstellungen,
  ID,
  ISODate,
  Projekt,
  RilFrist,
  RilSchluessel,
  Workflow,
} from '../domain/types';
import { zielText } from '../domain/workflow';
import { workflowLoeschen, workflowSpeichern } from '../domain/workflowPflege';
import { ladeDaten, speichereDaten } from './storage';

export { newId };

/** Angaben zur Neuanlage einer Anmeldung; Verlauf und Änderungsmerkmale entstehen im Store. */
export type NeueAnmeldung = Omit<
  Anmeldung,
  'id' | 'verlauf' | 'herkunftId' | 'aenderungsNr' | 'annexVII' | 'terminManuell'
>;

interface StoreValue {
  data: BaubetriebDaten;
  /* Einstellungen */
  setEinstellungen: (e: Partial<Omit<Einstellungen, 'rilFristen'>>) => void;
  /** Ändert eine Richtlinienfrist; sie gilt danach nicht mehr als Platzhalter. */
  setRilFrist: (schluessel: RilSchluessel, patch: Partial<RilFrist>) => void;
  /* Workflows */
  /**
   * Legt einen Workflow an oder ersetzt ihn. Nachfolger, die auf entfallene
   * Status zeigen, werden in allen Workflows entfernt. Ob entfallende Status
   * noch belegt sind, prüft der Editor vorher (belegteEntfallendeStatus).
   */
  saveWorkflow: (w: Workflow) => void;
  /** Löscht einen Workflow, in dem keine Anmeldung mehr steht. */
  deleteWorkflow: (id: ID) => void;
  /* Projekte */
  addProjekt: (p: Omit<Projekt, 'id'>) => ID;
  updateProjekt: (id: ID, patch: Partial<Projekt>) => void;
  /** Löscht das Projekt samt seiner Anmeldungen. */
  deleteProjekt: (id: ID) => void;
  toggleMarkiert: (id: ID) => void;
  /* Anmeldungen */
  addAnmeldung: (a: NeueAnmeldung) => ID;
  updateAnmeldung: (id: ID, patch: Partial<Omit<Anmeldung, 'id' | 'statusId' | 'verlauf'>>) => void;
  deleteAnmeldung: (id: ID) => void;
  /** Legt eine Kopie mit aktuellem Stand und Statusverlauf an und liefert ihre Kennung. */
  duplicateAnmeldung: (id: ID) => ID;
  /**
   * Statuswechsel auf einen zulässigen Nachfolger. Liefert die Kennungen der
   * bei einer Aufteilung zusätzlich entstandenen Anmeldungen.
   */
  statusWechseln: (id: ID, w: Wechsel) => ID[];
  /** Nimmt den letzten Statuswechsel zurück. */
  statusZuruecknehmen: (id: ID) => void;
  /** Hält fest, dass nachgehakt wurde, und setzt ggf. einen neuen Termin. */
  nachgehakt: (id: ID, datum: ISODate, notiz: string, neuerTermin: ISODate | null) => void;
  /** Legt die Terminfrist im aktuellen Status von Hand fest (null: berechnen). */
  terminSetzen: (id: ID, termin: ISODate | null) => void;
  /* Verwaltung */
  ersetzeDaten: (d: BaubetriebDaten) => void;
  zuruecksetzen: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<BaubetriebDaten>(() => ladeDaten());

  useEffect(() => {
    speichereDaten(data);
  }, [data]);

  /** Jede Änderung läuft hierüber – die Funktion muss rein sein. */
  const mutate = useCallback((fn: (d: BaubetriebDaten) => BaubetriebDaten) => {
    setData((alt) => fn(alt));
  }, []);

  const anmeldungAendern = useCallback(
    (id: ID, fn: (a: Anmeldung) => Anmeldung) =>
      mutate((d) => ({ ...d, anmeldungen: d.anmeldungen.map((a) => (a.id === id ? fn(a) : a)) })),
    [mutate],
  );

  const value = useMemo<StoreValue>(
    () => ({
      data,
      setEinstellungen: (e) => mutate((d) => ({ ...d, einstellungen: { ...d.einstellungen, ...e } })),
      setRilFrist: (schluessel, patch) =>
        mutate((d) => ({
          ...d,
          einstellungen: {
            ...d.einstellungen,
            rilFristen: {
              ...d.einstellungen.rilFristen,
              [schluessel]: { ...d.einstellungen.rilFristen[schluessel], platzhalter: false, ...patch },
            },
          },
        })),

      saveWorkflow: (w) => mutate((d) => workflowSpeichern(d, w)),
      deleteWorkflow: (id) => mutate((d) => workflowLoeschen(d, id)),

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
          anmeldungen: d.anmeldungen.filter((a) => a.projektId !== id),
        })),
      toggleMarkiert: (id) =>
        mutate((d) => ({
          ...d,
          projekte: d.projekte.map((p) => (p.id === id ? { ...p, markiert: !p.markiert } : p)),
        })),

      addAnmeldung: (werte) => {
        const id = newId('an');
        const verlaufId = newId('vl');
        const erfasst = new Date().toISOString();
        mutate((d) => {
          const neu: Anmeldung = bauzeitraumAbgleichen(
            {
            ...werte,
            id,
            aenderungsNr: '',
            annexVII: null,
            terminManuell: null,
            herkunftId: null,
            verlauf: [
              {
                id: verlaufId,
                typ: 'anlage',
                datum: werte.statusSeit,
                erfasst,
                bearbeiter: d.einstellungen.bearbeiter,
                von: null,
                nach: werte.statusId,
                vonText: '',
                nachText: zielText(d.workflows, werte.statusId),
                text: 'Eintrag angelegt',
              },
            ],
            },
            d.workflows,
          );
          return { ...d, anmeldungen: [...d.anmeldungen, neu] };
        });
        return id;
      },
      updateAnmeldung: (id, patch) =>
        mutate((d) => ({
          ...d,
          anmeldungen: d.anmeldungen.map((a) =>
            a.id === id ? bauzeitraumAbgleichen({ ...a, ...patch, id }, d.workflows) : a,
          ),
        })),
      deleteAnmeldung: (id) =>
        mutate((d) => ({
          ...d,
          anmeldungen: d.anmeldungen
            .filter((a) => a.id !== id)
            .map((a) => (a.herkunftId === id ? { ...a, herkunftId: null } : a)),
        })),

      duplicateAnmeldung: (id) => {
        // Kennungen vor mutate() – im StrictMode läuft die Änderungsfunktion doppelt.
        const quelle = data.anmeldungen.find((a) => a.id === id);
        const ids = {
          anmeldung: newId('an'),
          verlauf: (quelle?.verlauf ?? []).map(() => newId('vl')),
          vermerk: newId('vl'),
        };
        const erfasst = new Date().toISOString();
        mutate((d) => anmeldungDuplizieren(d, id, ids, d.einstellungen.bearbeiter, erfasst, today()));
        return ids.anmeldung;
      },

      statusWechseln: (id, w) => {
        const ids = {
          verlauf: newId('vl'),
          weitere: (w.weitere ?? []).map(() => ({ anmeldung: newId('an'), verlauf: newId('vl') })),
        };
        const erfasst = new Date().toISOString();
        mutate((d) => wechselAnwenden(d, id, w, ids, d.einstellungen.bearbeiter, erfasst));
        return ids.weitere.map((x) => x.anmeldung);
      },
      statusZuruecknehmen: (id) => mutate((d) => wechselZuruecknehmen(d, id)),
      nachgehakt: (id, datum, notiz, neuerTermin) => {
        const verlaufId = newId('vl');
        const erfasst = new Date().toISOString();
        mutate((d) => ({
          ...d,
          anmeldungen: d.anmeldungen.map((a) =>
            a.id === id
              ? {
                  ...a,
                  terminManuell: neuerTermin ?? a.terminManuell,
                  verlauf: [
                    ...a.verlauf,
                    {
                      id: verlaufId,
                      typ: 'notiz',
                      datum,
                      erfasst,
                      bearbeiter: d.einstellungen.bearbeiter,
                      von: null,
                      nach: null,
                      vonText: '',
                      nachText: '',
                      text: [notiz.trim() || 'Nachgehakt', neuerTermin ? `neuer Termin ${neuerTermin}` : '']
                        .filter(Boolean)
                        .join(' · '),
                    },
                  ],
                }
              : a,
          ),
        }));
      },
      terminSetzen: (id, termin) => anmeldungAendern(id, (a) => ({ ...a, terminManuell: termin })),

      ersetzeDaten: (d) => mutate(() => d),
      zuruecksetzen: () => {
        const neu = seedDaten();
        // Persönliche Einstellungen bleiben erhalten.
        mutate((d) => ({
          ...neu,
          einstellungen: {
            ...neu.einstellungen,
            farbmodus: d.einstellungen.farbmodus,
            bearbeiter: d.einstellungen.bearbeiter,
          },
        }));
      },
    }),
    [data, mutate, anmeldungAendern],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore muss innerhalb des StoreProvider verwendet werden.');
  return ctx;
}
