/**
 * Zentraler Anwendungsstatus. Alle Schreibzugriffe laufen über diesen Store,
 * der den Bestand nach jeder Änderung lokal persistiert, die Termine aller
 * Planläufe neu berechnet und das Änderungsprotokoll der Läufe nachzieht.
 *
 * Jede Benutzeraktion ist genau ein `mutate`; gerechnet wird darin mit dem
 * übergebenen Stand, nie mit der Render-Kopie `data` (die Fachlogik dazu steht
 * in domain/bestand.ts). IDs, die die Oberfläche braucht, entstehen vor
 * `mutate` – im StrictMode läuft die Änderungsfunktion doppelt.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { laufUebernehmen, planlaufName, schritteFuerNeuenLauf } from '../domain/engine';
import {
  aenderungenAufLauf,
  schrittErgaenzen,
  wiederOeffnen as laufWiederOeffnen,
  type Abschluss,
  type Aenderung,
  type WiederOeffnenArt,
} from '../domain/abschluss';
import type { EinfuegePosition } from '../domain/ablauf';
import {
  abschluesseAnwenden,
  bestandAendern,
  eintraegeAendern,
  eintraegeLoeschen,
  funktionLoeschen,
  gewerkLoeschen,
  kontaktLoeschen,
  kontextFuer,
  laufAendern,
  laufLoeschen,
  loeschvermerk,
  paketAnlegen,
  paketZuweisen,
  projektLoeschen,
  type AbschlussErgebnis,
  type EintragsPatch,
  type SchrittAbschluss,
  type Vorgang,
} from '../domain/bestand';
import { basisplanFestlegen } from '../domain/simulation';
import { seedData } from '../domain/seed';
import { ladeDaten, speichereDaten, type LadeZustand, type SpeicherZustand } from './storage';
import { formatDate, today } from '../../../shared/dates';
import { funktionsName } from '../domain/types';
import type {
  AbbruchArt,
  AppData,
  Bearbeiter,
  Contact,
  EmailTemplate,
  Erinnerung,
  ID,
  ISODate,
  PlanDocument,
  PlanRun,
  ProcessTemplate,
  Project,
  Role,
  RunStep,
  Seite,
  StandardRolle,
  VerzugAnteil,
} from '../domain/types';

export function newId(prefix = 'id'): ID {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** `protokoll: false` – ohne Änderungsprotokoll und ohne Änderungszeitpunkte (Ersetzen, Zurücksetzen, Abgleich). */
export interface MutateOptionen {
  protokoll?: boolean;
}

/** Zu vermerkende Erinnerung; Zeitpunkt (Vorgabe: jetzt) und Durchlauf (Vorgabe: der laufende) ergänzt der Store. */
export type NeueErinnerung = Omit<Erinnerung, 'zeitpunkt' | 'durchlauf'> & Partial<Pick<Erinnerung, 'zeitpunkt' | 'durchlauf'>>;

interface StoreValue {
  data: AppData;
  /** Außer bei `ok` ließ sich der letzte Stand nicht speichern (Speicher voll bzw. gesperrt) – Hinweisleiste. */
  speicherZustand: SpeicherZustand;
  /** Ergebnis des Ladens; außer bei `ok` wird nicht gespeichert (siehe store/storage.ts). */
  ladeZustand: LadeZustand;
  /** Beim Laden angelegte Kopien selbst geänderter Standard-Workflows – für einen einmaligen Hinweis. */
  stammdatenKopien: string[];
  stammdatenHinweisQuittieren: () => void;
  /* Bearbeiter */
  setBearbeiter: (b: Partial<Bearbeiter>) => void;
  /* Gewerke */
  addGewerk: (name: string) => void;
  /** Löscht ein Gewerk samt seiner Funktionen (Stammdaten und Projekte). */
  deleteGewerk: (name: string) => void;
  /* Projekte */
  addProject: (p: Omit<Project, 'id'>) => ID;
  toggleMarkiert: (id: ID) => void;
  updateProject: (id: ID, patch: Partial<Project>) => void;
  deleteProject: (id: ID) => void;
  /* Funktionen (projektübergreifend) */
  addStandardRolle: (r: Omit<StandardRolle, 'id'>) => ID;
  updateStandardRolle: (id: ID, patch: Partial<StandardRolle>) => void;
  deleteStandardRolle: (id: ID) => void;
  /* Projektfunktionen */
  addRole: (r: Omit<Role, 'id'>) => ID;
  updateRole: (id: ID, patch: Partial<Role>) => void;
  deleteRole: (id: ID) => void;
  /* Kontakte */
  addContact: (c: Omit<Contact, 'id'>) => ID;
  updateContact: (id: ID, patch: Partial<Contact>) => void;
  /** Löscht einen Kontakt; nur offene Schritte verlieren die Person. */
  deleteContact: (id: ID) => void;
  /* Dokumente */
  addDocument: (d: Omit<PlanDocument, 'id'>) => ID;
  updateDocument: (id: ID, patch: Partial<PlanDocument>) => void;
  deleteDocument: (id: ID) => void;
  /**
   * Ordnet Einträge einem Planpaket zu (null = keinem). Pläne eines
   * Verzeichnisses folgen ihrem Verzeichnis. Liefert die Zahl der zugeordneten
   * gewählten Einträge (ohne Pläne, deren Verzeichnis nicht gewählt ist).
   */
  dokumentePaketZuweisen: (ids: ID[], paketId: ID | null) => number;
  /** Ändert Gewerk, Planungsphase u. a. mehrerer Einträge zugleich. */
  dokumenteAendern: (ids: ID[], patch: EintragsPatch) => void;
  /** Löscht mehrere Einträge samt Planläufen (siehe eintraegeLoeschen in domain/bestand.ts). */
  dokumenteLoeschen: (ids: ID[]) => void;
  /** Legt ein Planpaket an und ordnet ihm die gewählten Einträge zu (paketAnlegen). Liefert seine Kennung bzw. null, wenn die Auswahl nichts zuzuordnen enthält. */
  paketAusAuswahl: (name: string, ids: ID[]) => ID | null;
  /* E-Mail-Vorlagen (projektübergreifend) */
  setEmailVorlage: (t: EmailTemplate) => void;
  deleteEmailVorlage: (id: ID) => void;
  /* Vorlagen */
  addTemplate: (t: Omit<ProcessTemplate, 'id'> & { id?: ID }) => ID;
  updateTemplate: (id: ID, patch: Partial<ProcessTemplate>) => void;
  deleteTemplate: (id: ID) => void;
  /* Planläufe */
  /** Legt einen Lauf an; ohne Basisplan wird er beim Start festgelegt. */
  addRun: (r: Omit<PlanRun, 'id'>) => ID;
  updateRun: (id: ID, patch: Partial<PlanRun>) => void;
  deleteRun: (id: ID) => void;
  updateStep: (runId: ID, stepId: ID, patch: Partial<RunStep>) => void;
  /** Wendet Änderungen (etwa aus schrittStatusSetzen oder dem Schrittdialog) in einem Schritt an. */
  aenderungenAnwenden: (runId: ID, aenderungen: Aenderung[]) => void;
  /**
   * Schließt einen oder mehrere Schritte ab (Sammel-Erledigen), nacheinander
   * auf dem jeweils aktuellen Stand. Liefert je Eintrag das Ergebnis (gerechnet
   * auf dem angezeigten Stand – Grundlage für Meldung und „E-Mail senden“).
   */
  schritteAbschliessen: (eintraege: SchrittAbschluss[]) => AbschlussErgebnis[];
  /** Öffnet einen erledigten Schritt wieder (Korrektur bzw. erneute Bearbeitung ab `eingang`). */
  wiederOeffnen: (runId: ID, stepId: ID, modus?: WiederOeffnenArt, eingang?: ISODate) => Abschluss | null;
  /** Fügt einen Schritt in den laufenden Lauf ein (ID des neuen Schritts vorher erzeugen). */
  schrittImLaufEinfuegen: (runId: ID, nachId: ID | null, neu: RunStep, position?: EinfuegePosition) => Abschluss | null;
  /** Vermerkt eine vorbereitete E-Mail am Schritt (Liste der Erinnerungen, letzte Erinnerung). */
  erinnerungVermerken: (runId: ID, stepId: ID, erinnerung: NeueErinnerung) => void;
  /** Wie erinnerungVermerken für mehrere Schritte (Sammel-Erinnern) in einem Schritt. */
  erinnerungenVermerken: (liste: { runId: ID; stepId: ID; erinnerung: NeueErinnerung }[]) => void;
  /** Ordnet den Verzug einer Ausführung (Schritt + Durchlauf, auch früherer Durchläufe) von Hand Seiten zu. */
  verzugZuordnen: (runId: ID, stepId: ID, durchlauf: number, anteile: Pick<VerzugAnteil, 'seite' | 'tage' | 'grund'>[]) => void;
  /** Ursache der Nacharbeit einer Entscheidung (Schritt + Durchlauf). */
  nacharbeitSeiteSetzen: (runId: ID, stepId: ID, durchlauf: number, seite: Seite | null) => void;
  /** Legt den Basisplan neu fest (protokolliert, mit Grund). */
  basisNeuFestlegen: (runId: ID, grund: string) => void;
  /** Bricht einen Lauf mit Begründung ab; er bleibt im Projekt sichtbar. */
  abbrechenRun: (runId: ID, grund: string, art: AbbruchArt, neuerIndex: string | null) => void;
  /**
   * Bricht einen Lauf wegen eines neuen Index (bzw. einer neuen Ausgabe) ab,
   * hebt den Eintrag auf den neuen Index und beginnt einen neuen Lauf mit
   * derselben Kette (alle Lauffelder zurückgesetzt) – in einem Schritt.
   * Liefert die Kennung des neuen Laufs.
   */
  neuerIndexStarten: (runId: ID, grund: string, neuerIndex: string) => ID | null;
  /**
   * Beginnt einen laufenden Planlauf mit einem (anderen) Workflow von vorn:
   * Der bisherige Lauf endet als „neu gestartet“ und bleibt zum Nachschlagen
   * erhalten, ein neuer Lauf mit den übergebenen Schritten tritt an seine
   * Stelle. Ein übergebenes Eingang Soll gilt fortan für den Eintrag (es
   * bestimmt den Termin des ersten Schritts). Liefert die Kennung des neuen Laufs.
   */
  planlaufNeuStarten: (
    runId: ID,
    neu: {
      templateId: ID | null;
      templateName: string;
      steps: RunStep[];
      start: string;
      grund: string;
      eingangSoll?: string | null;
    },
  ) => ID | null;
  /* Planverzeichnisse: gebündelt oder Pläne einzeln */
  /**
   * Löst einen Plan aus dem laufenden Lauf seines gebündelten Verzeichnisses
   * heraus. Der Plan übernimmt dessen Stand. Liefert die Kennung des neuen Laufs.
   */
  planHerausloesen: (planId: ID) => ID | null;
  /**
   * Stellt ein Planverzeichnis auf Einzelläufe um. Läuft es bereits, übernimmt
   * jeder Plan ohne eigenen Lauf dessen Stand, und der gebündelte Lauf endet
   * als „aufgeteilt“. Liefert die Zahl der neu entstandenen Läufe.
   */
  verzeichnisAufteilen: (verzeichnisId: ID) => number;
  /**
   * Führt Pläne mit eigenem Lauf wieder im gebündelten Lauf ihres Verzeichnisses
   * zusammen. Läuft das Verzeichnis noch, kehren die Pläne in dessen Lauf
   * zurück; sonst entsteht ein neuer Verzeichnislauf mit dem Stand von
   * `quelleRunId`. Die eigenen Läufe der Pläne enden als „gebündelt“, nicht
   * gewählte Pläne behalten ihren Lauf. Liefert die Kennung des Verzeichnislaufs.
   */
  planeBuendeln: (verzeichnisId: ID, planIds: ID[], quelleRunId: ID | null) => ID | null;
  /* Verwaltung */
  /** Ersetzt den ganzen Bestand (Sicherung einspielen) – ohne Protokoll. */
  ersetzeDaten: (d: AppData) => void;
  /** Übernimmt das Ergebnis eines Abgleichs mit einer Sicherung – ohne Vergleichsprotokoll. */
  datenAbgleichen: (neu: AppData | ((d: AppData) => AppData)) => void;
  zuruecksetzen: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Eine Aktion auf dem aktuellen Stand; `vorgang` nennt Zeitpunkt, Bearbeiter und heute. */
export type Aenderer = (d: AppData, vorgang: Vorgang) => AppData;
export type Mutate = (fn: Aenderer, optionen?: MutateOptionen) => void;

/** Die Methoden des Stores ohne Zustände (für Prüfungen auch außerhalb von React nutzbar). */
export type StoreAktionen = Omit<
  StoreValue,
  'data' | 'speicherZustand' | 'ladeZustand' | 'stammdatenKopien' | 'stammdatenHinweisQuittieren' | 'ersetzeDaten' | 'zuruecksetzen'
>;

/** Vorgang für Vorschauen auf dem angezeigten Stand. */
const vorgangJetzt = (d: AppData): Vorgang => ({ zeitpunkt: new Date().toISOString(), bearbeiter: d.bearbeiter?.name ?? '', heute: today() });

const abbruch = (art: AbbruchArt, grund: string, heute: ISODate) => ({
  status: 'abgebrochen' as const,
  abbruchArt: art,
  abbruchGrund: grund,
  abbruchDatum: heute,
  abbruchNeuerIndex: null,
});

export function StoreProvider({ children }: { children: ReactNode }) {
  const [geladen] = useState(ladeDaten);
  const [data, setData] = useState<AppData>(geladen.daten);
  const [ladeZustand, setLadeZustand] = useState<LadeZustand>(geladen.zustand);
  const [speicherZustand, setSpeicherZustand] = useState<SpeicherZustand>('ok');
  const [stammdatenKopien, setStammdatenKopien] = useState<string[]>(geladen.stammdatenKopien);

  // Nach einem Ladefehler bzw. bei einer neueren Fassung bleibt der gespeicherte Stand unberührt
  useEffect(() => {
    if (ladeZustand !== 'ok') return;
    setSpeicherZustand(speichereDaten(data));
  }, [data, ladeZustand]);

  /**
   * Änderung anwenden: danach die eigene Person in ihren Projekten führen
   * (auch nach einem neuen Projekt, einer Markierung oder einer
   * Namensänderung), Zuständigkeiten aus der Besetzung nachziehen (neue oder
   * gewechselte Besetzungen greifen sofort auch in laufenden Planläufen), alle
   * Läufe durchrechnen, das Änderungsprotokoll der Läufe nachziehen und den
   * Änderungszeitpunkt geänderter Objekte setzen (bestandAendern).
   */
  const mutate = useCallback<Mutate>((fn, optionen = {}) => {
    const zeitpunkt = new Date().toISOString();
    const heute = today();
    setData((alt) => bestandAendern(alt, fn, { zeitpunkt, heute, protokoll: optionen.protokoll }, newId));
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      data,
      speicherZustand,
      ladeZustand,
      stammdatenKopien,
      stammdatenHinweisQuittieren: () => setStammdatenKopien([]),
      ...storeAktionen(data, mutate),
      ersetzeDaten: (d) => {
        mutate(() => d, { protokoll: false });
        setLadeZustand('ok');
      },
      zuruecksetzen: () => {
        // Ein Stand aus einer neueren Fassung darf nicht überschrieben werden
        if (ladeZustand === 'neuere_fassung') return;
        mutate(() => seedData(), { protokoll: false });
        setLadeZustand('ok');
      },
    }),
    [data, mutate, speicherZustand, ladeZustand, stammdatenKopien],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/**
 * Die Methoden des Stores auf dem Stand `data`. Jede Methode ist genau ein
 * `mutate`; Rückgabewerte für die Oberfläche (etwa das Ergebnis eines
 * Abschlusses) werden zusätzlich auf `data` gerechnet.
 */
export function storeAktionen(data: AppData, mutate: Mutate): StoreAktionen {
  const upd = <T extends { id: ID }>(list: T[], id: ID, patch: Partial<T>) =>
    list.map((x) => (x.id === id ? { ...x, ...patch } : x));

  /** Rechnet eine Aktion zuerst auf dem angezeigten Stand (Ergebnis für die Oberfläche), dann im Store. */
  const mitErgebnis = <E,>(aktion: (d: AppData, v: Vorgang) => { daten: AppData; ergebnis: E }): E => {
    const { ergebnis } = aktion(data, vorgangJetzt(data));
    mutate((d, v) => aktion(d, v).daten);
    return ergebnis;
  };

  /** Ändert einen Schritt des laufenden Durchlaufs bzw. einen früheren Durchlauf (Historie). */
  const durchlaufAendern = (
    runId: ID,
    stepId: ID,
    durchlauf: number,
    aktuell: (s: RunStep) => RunStep,
    frueher: (h: RunStep['historie'][number]) => RunStep['historie'][number],
  ) =>
    mutate((d) =>
      laufAendern(d, runId, (r) => ({
        ...r,
        steps: r.steps.map((s) => {
          if (s.id !== stepId) return s;
          if ((s.durchlauf ?? 1) === durchlauf) return aktuell(s);
          return { ...s, historie: s.historie.map((h) => (h.durchlauf === durchlauf ? frueher(h) : h)) };
        }),
      })),
    );

  /** Erinnerungen an Schritten vermerken. */
  const erinnerungenAnwenden = (d: AppData, v: Vorgang, liste: { runId: ID; stepId: ID; erinnerung: NeueErinnerung }[]) =>
    liste.reduce(
      (stand, { runId, stepId, erinnerung }) =>
        laufAendern(stand, runId, (r) => ({
          ...r,
          steps: r.steps.map((s) => {
            if (s.id !== stepId) return s;
            const e: Erinnerung = { ...erinnerung, zeitpunkt: erinnerung.zeitpunkt ?? v.zeitpunkt, durchlauf: erinnerung.durchlauf ?? s.durchlauf };
            return { ...s, erinnerungen: [...(s.erinnerungen ?? []), e], letzteErinnerung: e.zeitpunkt };
          }),
        })),
      d,
    );

  /** Basisplan eines neuen Laufs (Projekt und Eintrag aus dem aktuellen Stand). */
  const mitBasis = (d: AppData, run: PlanRun, v: Vorgang): PlanRun =>
    run.basis
      ? run
      : {
          ...run,
          basis: basisplanFestlegen(
            run,
            d.projects.find((p) => p.id === run.projectId),
            d.documents.find((x) => x.id === run.documentId),
            'beim Start festgelegt',
            v.zeitpunkt,
          ),
        };

  return {
    setBearbeiter: (b) =>
      mutate((d) => ({ ...d, bearbeiter: { ...d.bearbeiter, ...b } })),

    // Gewerke sind Stammdaten: einmal ergänzt, stehen sie überall zur Auswahl
    deleteGewerk: (name) => mutate((d, v) => gewerkLoeschen(d, name, v)),

    addGewerk: (name) =>
      mutate((d) =>
        d.gewerke.some((g) => g.trim().toLowerCase() === name.trim().toLowerCase())
          ? d
          : { ...d, gewerke: [...d.gewerke, name.trim()].sort((a, b) => a.localeCompare(b, 'de')) },
      ),

    toggleMarkiert: (id) =>
      mutate((d) => ({
        ...d,
        projects: d.projects.map((p) => (p.id === id ? { ...p, markiert: !p.markiert } : p)),
      })),

    addProject: (p) => {
      const id = newId('prj');
      mutate((d) => ({ ...d, projects: [...d.projects, { ...p, id }] }));
      return id;
    },
    updateProject: (id, patch) => mutate((d) => ({ ...d, projects: upd(d.projects, id, patch) })),
    deleteProject: (id) => mutate((d, v) => projektLoeschen(d, id, v)),

    addStandardRolle: (r) => {
      const id = newId('srol');
      mutate((d) => ({ ...d, standardRollen: [...d.standardRollen, { ...r, id }] }));
      return id;
    },
    updateStandardRolle: (id, patch) =>
      mutate((d) => ({ ...d, standardRollen: upd(d.standardRollen, id, patch) })),
    deleteStandardRolle: (id) =>
      mutate((d, v) => {
        const rolle = d.standardRollen.find((r) => r.id === id);
        if (!rolle) return d;
        return {
          ...d,
          standardRollen: d.standardRollen.filter((r) => r.id !== id),
          geloescht: [...(d.geloescht ?? []), loeschvermerk('funktion', id, null, funktionsName(rolle), v)],
        };
      }),

    addRole: (r) => {
      const id = newId('rol');
      mutate((d) => ({ ...d, roles: [...d.roles, { ...r, id }] }));
      return id;
    },
    updateRole: (id, patch) => mutate((d) => ({ ...d, roles: upd(d.roles, id, patch) })),
    deleteRole: (id) => mutate((d, v) => funktionLoeschen(d, id, v)),

    addContact: (c) => {
      const id = newId('con');
      mutate((d) => ({ ...d, contacts: [...d.contacts, { ...c, id }] }));
      return id;
    },
    updateContact: (id, patch) => mutate((d) => ({ ...d, contacts: upd(d.contacts, id, patch) })),
    deleteContact: (id) => mutate((d, v) => kontaktLoeschen(d, id, v)),

    addDocument: (doc) => {
      const id = newId('doc');
      mutate((d) => ({ ...d, documents: [...d.documents, { ...doc, id }] }));
      return id;
    },
    updateDocument: (id, patch) => mutate((d) => ({ ...d, documents: upd(d.documents, id, patch) })),
    deleteDocument: (id) => mutate((d, v) => eintraegeLoeschen(d, [id], newId, v)),
    dokumenteLoeschen: (ids) => mutate((d, v) => eintraegeLoeschen(d, ids, newId, v)),
    dokumentePaketZuweisen: (ids, paketId) => mitErgebnis((d) => {
      const { daten, zugeordnet } = paketZuweisen(d, ids, paketId);
      return { daten, ergebnis: zugeordnet };
    }),
    dokumenteAendern: (ids, patch) => mutate((d) => eintraegeAendern(d, ids, patch)),
    paketAusAuswahl: (name, ids) => {
      const id = newId('doc');
      return mitErgebnis((d) => {
        const { daten, angelegt } = paketAnlegen(d, name, ids, id);
        return { daten, ergebnis: angelegt ? id : null };
      });
    },

    setEmailVorlage: (t) =>
      mutate((d) => ({
        ...d,
        emailVorlagen: d.emailVorlagen.some((x) => x.id === t.id)
          ? d.emailVorlagen.map((x) => (x.id === t.id ? t : x))
          : [...d.emailVorlagen, t],
      })),

    deleteEmailVorlage: (id) =>
      mutate((d, v) => {
        const vorlage = d.emailVorlagen.find((x) => x.id === id);
        if (!vorlage) return d;
        return {
          ...d,
          emailVorlagen: d.emailVorlagen.filter((x) => x.id !== id),
          geloescht: [...(d.geloescht ?? []), loeschvermerk('emailVorlage', id, null, vorlage.name, v)],
        };
      }),

    addTemplate: (t) => {
      const id = t.id ?? newId('tpl');
      mutate((d) => ({ ...d, templates: [...d.templates, { ...t, id } as ProcessTemplate] }));
      return id;
    },
    updateTemplate: (id, patch) => mutate((d) => ({ ...d, templates: upd(d.templates, id, patch) })),
    deleteTemplate: (id) =>
      mutate((d, v) => {
        const vorlage = d.templates.find((t) => t.id === id);
        if (!vorlage) return d;
        return {
          ...d,
          templates: d.templates.filter((t) => t.id !== id),
          geloescht: [...(d.geloescht ?? []), loeschvermerk('workflow', id, vorlage.projectId, vorlage.name, v)],
        };
      }),

    addRun: (r) => {
      const id = newId('run');
      mutate((d, v) => ({ ...d, runs: [...d.runs, mitBasis(d, { ...r, id }, v)] }));
      return id;
    },
    updateRun: (id, patch) => mutate((d) => ({ ...d, runs: upd(d.runs, id, patch) })),
    deleteRun: (id) => mutate((d, v) => laufLoeschen(d, id, v)),

    updateStep: (runId, stepId, patch) =>
      mutate((d) =>
        laufAendern(d, runId, (r) => ({ ...r, steps: r.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) })),
      ),

    aenderungenAnwenden: (runId, aenderungen) =>
      mutate((d) => (aenderungen.length === 0 ? d : laufAendern(d, runId, (r) => aenderungenAufLauf(r, aenderungen)))),

    schritteAbschliessen: (eintraege) =>
      mitErgebnis((d, v) => {
        const { daten, ergebnisse } = abschluesseAnwenden(d, eintraege, v);
        return { daten, ergebnis: ergebnisse };
      }),

    wiederOeffnen: (runId, stepId, modus, eingang) =>
      mitErgebnis((d, v) => {
        const run = d.runs.find((r) => r.id === runId);
        const step = run?.steps.find((s) => s.id === stepId);
        if (!run || !step) return { daten: d, ergebnis: null };
        const ergebnis = laufWiederOeffnen(run, step, modus, {
          eingang,
          kontext: kontextFuer(d, run),
          zeitpunkt: v.zeitpunkt,
          heute: v.heute,
        });
        return {
          daten: ergebnis.art === 'aenderung' ? laufAendern(d, runId, (r) => aenderungenAufLauf(r, ergebnis.aenderungen)) : d,
          ergebnis,
        };
      }),

    schrittImLaufEinfuegen: (runId, nachId, neu, position = 'danach') =>
      mitErgebnis((d, v) => {
        const run = d.runs.find((r) => r.id === runId);
        if (!run) return { daten: d, ergebnis: null };
        const ergebnis = schrittErgaenzen(run, nachId, neu, position, {
          heute: v.heute,
          zeitpunkt: v.zeitpunkt,
          kontext: kontextFuer(d, run),
        });
        return {
          daten: ergebnis.art === 'aenderung' ? laufAendern(d, runId, (r) => aenderungenAufLauf(r, ergebnis.aenderungen)) : d,
          ergebnis,
        };
      }),

    erinnerungVermerken: (runId, stepId, erinnerung) =>
      mutate((d, v) => erinnerungenAnwenden(d, v, [{ runId, stepId, erinnerung }])),
    erinnerungenVermerken: (liste) => mutate((d, v) => erinnerungenAnwenden(d, v, liste)),

    verzugZuordnen: (runId, stepId, durchlauf, anteile) => {
      const zeitpunkt = new Date().toISOString();
      const bearbeiter = data.bearbeiter?.name ?? '';
      const liste: VerzugAnteil[] = anteile
        .filter((a) => a.tage > 0)
        .map((a) => ({ seite: a.seite, tage: Math.round(a.tage), grund: a.grund.trim(), zeitpunkt, bearbeiter }));
      durchlaufAendern(
        runId,
        stepId,
        durchlauf,
        (s) => ({ ...s, verzugZuordnung: liste }),
        (h) => ({ ...h, verzugZuordnung: liste }),
      );
    },

    nacharbeitSeiteSetzen: (runId, stepId, durchlauf, seite) =>
      durchlaufAendern(
        runId,
        stepId,
        durchlauf,
        (s) => ({ ...s, nacharbeitSeite: seite }),
        (h) => ({ ...h, nacharbeitSeite: seite }),
      ),

    basisNeuFestlegen: (runId, grund) =>
      mutate((d, v) =>
        laufAendern(d, runId, (r) => ({
          ...r,
          basis: basisplanFestlegen(
            r,
            d.projects.find((p) => p.id === r.projectId),
            d.documents.find((x) => x.id === r.documentId),
            grund.trim(),
            v.zeitpunkt,
          ),
        })),
      ),

    abbrechenRun: (runId, grund, art, neuerIndex) =>
      mutate((d, v) =>
        laufAendern(d, runId, (r) => ({ ...r, ...abbruch(art, grund, v.heute ?? today()), abbruchNeuerIndex: neuerIndex })),
      ),

    neuerIndexStarten: (runId, grund, neuerIndex) => {
      const vorher = data.runs.find((r) => r.id === runId);
      if (!vorher || vorher.status !== 'laufend' || !neuerIndex.trim()) return null;
      if (!data.documents.some((x) => x.id === vorher.documentId)) return null;
      const id = newId('run');
      mutate((d, v) => {
        const alt = d.runs.find((r) => r.id === runId);
        if (!alt || alt.status !== 'laufend') return d;
        const heute = v.heute ?? today();
        const documents = d.documents.map((x) => (x.id === alt.documentId ? { ...x, index: neuerIndex } : x));
        const eintrag = documents.find((x) => x.id === alt.documentId);
        if (!eintrag) return d;
        const lauf: PlanRun = {
          id,
          projectId: alt.projectId,
          documentId: alt.documentId,
          templateId: alt.templateId,
          templateName: alt.templateName,
          name: planlaufName(eintrag),
          index: neuerIndex,
          start: heute,
          status: 'laufend',
          abbruchGrund: null,
          abbruchDatum: null,
          abbruchArt: null,
          abbruchNeuerIndex: null,
          steps: schritteFuerNeuenLauf(alt.steps, newId),
          bemerkung: `Nachfolger von „${alt.name}“ (${grund})`,
          protokoll: [],
          basis: null,
        };
        const mitDoc = { ...d, documents };
        return {
          ...mitDoc,
          runs: [
            ...d.runs.map((r) =>
              r.id === runId ? { ...r, ...abbruch('neuer_index', grund, heute), abbruchNeuerIndex: neuerIndex } : r,
            ),
            mitBasis(mitDoc, lauf, v),
          ],
        };
      });
      return id;
    },

    planlaufNeuStarten: (runId, neu) => {
      const vorher = data.runs.find((r) => r.id === runId);
      if (!vorher || vorher.status !== 'laufend') return null;
      const id = newId('run');
      const grund = neu.grund.trim();
      mutate((d, v) => {
        const alt = d.runs.find((r) => r.id === runId);
        if (!alt || alt.status !== 'laufend') return d;
        const heute = v.heute ?? today();
        const documents =
          neu.eingangSoll === undefined
            ? d.documents
            : d.documents.map((x) => (x.id === alt.documentId ? { ...x, eingangSoll: neu.eingangSoll ?? null } : x));
        const eintrag = documents.find((x) => x.id === alt.documentId);
        const lauf: PlanRun = {
          id,
          projectId: alt.projectId,
          documentId: alt.documentId,
          templateId: neu.templateId,
          templateName: neu.templateName,
          name: eintrag ? planlaufName(eintrag) : alt.name,
          index: eintrag ? eintrag.index : alt.index,
          start: neu.start,
          status: 'laufend',
          abbruchGrund: null,
          abbruchDatum: null,
          abbruchArt: null,
          abbruchNeuerIndex: null,
          steps: neu.steps,
          bemerkung: `Neu gestartet am ${formatDate(heute)} – vorher Workflow „${alt.templateName}“${grund ? ` (${grund})` : ''}`,
          protokoll: [],
          basis: null,
        };
        const mitDoc = { ...d, documents };
        return {
          ...mitDoc,
          runs: [
            ...d.runs.map((r) =>
              r.id === runId ? { ...r, ...abbruch('neu_gestartet', grund || `Mit Workflow „${neu.templateName}“ neu gestartet`, heute) } : r,
            ),
            mitBasis(mitDoc, lauf, v),
          ],
        };
      });
      return id;
    },

    planHerausloesen: (planId) => {
      const plan = data.documents.find((x) => x.id === planId);
      if (!plan || plan.kind !== 'plan' || !plan.parentId) return null;
      if (!data.runs.some((r) => r.documentId === plan.parentId && r.status === 'laufend')) return null;
      const id = newId('run');
      mutate((d, v) => {
        const p = d.documents.find((x) => x.id === planId);
        const quelle = p ? d.runs.find((r) => r.documentId === p.parentId && r.status === 'laufend') : undefined;
        if (!p || !quelle) return d;
        const lauf = laufUebernehmen(
          quelle,
          { documentId: p.id, name: planlaufName(p), index: p.index, bemerkung: `Aus „${quelle.name}“ herausgelöst` },
          newId,
          { bearbeiter: v.bearbeiter, zeitpunkt: v.zeitpunkt },
        );
        return {
          ...d,
          documents: d.documents.map((x) => (x.id === planId ? { ...x, eigenerLauf: true } : x)),
          runs: [...d.runs, { ...lauf, id }],
        };
      });
      return id;
    },

    verzeichnisAufteilen: (verzeichnisId) =>
      mitErgebnis((d, v) => {
        const verzeichnis = d.documents.find((x) => x.id === verzeichnisId);
        if (!verzeichnis || verzeichnis.kind !== 'verzeichnis') return { daten: d, ergebnis: 0 };
        const quelle = d.runs.find((r) => r.documentId === verzeichnisId && r.status === 'laufend');
        // Pläne, die noch keinen eigenen (nicht abgebrochenen) Lauf haben
        const ohneLauf = d.documents.filter(
          (x) =>
            x.kind === 'plan' &&
            x.parentId === verzeichnisId &&
            !d.runs.some((r) => r.documentId === x.id && r.status !== 'abgebrochen'),
        );
        const neue = quelle
          ? ohneLauf.map((plan) => ({
              ...laufUebernehmen(
                quelle,
                { documentId: plan.id, name: planlaufName(plan), index: plan.index, bemerkung: `Aus „${quelle.name}“ aufgeteilt` },
                newId,
                { bearbeiter: v.bearbeiter, zeitpunkt: v.zeitpunkt },
              ),
              id: newId('run'),
            }))
          : [];
        return {
          daten: {
            ...d,
            documents: d.documents.map((x) => (x.id === verzeichnisId ? { ...x, planlaufModus: 'einzeln' as const } : x)),
            runs: [
              ...d.runs.map((r) =>
                quelle && r.id === quelle.id ? { ...r, ...abbruch('aufgeteilt', 'In Einzelläufe der Pläne aufgeteilt', v.heute ?? today()) } : r,
              ),
              ...neue,
            ],
          },
          ergebnis: neue.length,
        };
      }),

    planeBuendeln: (verzeichnisId, planIds, quelleRunId) => {
      const neueId = newId('run');
      return mitErgebnis((d, v) => {
        const verzeichnis = d.documents.find((x) => x.id === verzeichnisId);
        if (!verzeichnis || verzeichnis.kind !== 'verzeichnis' || planIds.length === 0) return { daten: d, ergebnis: null };
        const aktiv = (docId: ID) => d.runs.find((r) => r.documentId === docId && r.status !== 'abgebrochen');
        const laufend = d.runs.find((r) => r.documentId === verzeichnisId && r.status === 'laufend');
        let neuerLauf: PlanRun | null = null;
        if (!laufend) {
          const quelle = d.runs.find((r) => r.id === quelleRunId);
          if (!quelle) return { daten: d, ergebnis: null };
          neuerLauf = {
            ...laufUebernehmen(
              quelle,
              {
                documentId: verzeichnisId,
                name: planlaufName(verzeichnis),
                index: verzeichnis.index,
                bemerkung: `Pläne wieder gebündelt – Stand von „${quelle.name}“ übernommen`,
              },
              newId,
              { bearbeiter: v.bearbeiter, zeitpunkt: v.zeitpunkt },
            ),
            id: neueId,
          };
        }
        const beendete = new Set(planIds.map((id) => aktiv(id)?.id).filter((id): id is ID => Boolean(id)));
        return {
          daten: {
            ...d,
            documents: d.documents.map((x) => {
              if (x.id === verzeichnisId) return { ...x, planlaufModus: 'gebuendelt' as const };
              if (x.kind !== 'plan' || x.parentId !== verzeichnisId) return x;
              if (planIds.includes(x.id)) return { ...x, eigenerLauf: undefined };
              // Nicht gewählte Pläne mit eigenem Lauf behalten ihn
              return aktiv(x.id) ? { ...x, eigenerLauf: true } : x;
            }),
            runs: [
              ...d.runs.map((r) =>
                beendete.has(r.id) ? { ...r, ...abbruch('gebuendelt', 'Wieder im Planlauf des Verzeichnisses gebündelt', v.heute ?? today()) } : r,
              ),
              ...(neuerLauf ? [neuerLauf] : []),
            ],
          },
          ergebnis: laufend?.id ?? neuerLauf!.id,
        };
      });
    },

    datenAbgleichen: (neu) => mutate((d) => (typeof neu === 'function' ? neu(d) : neu), { protokoll: false }),
  };
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore muss innerhalb des StoreProvider verwendet werden.');
  return ctx;
}
