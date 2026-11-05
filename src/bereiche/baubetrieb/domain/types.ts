/**
 * Datenmodell des Bereichs „Baubetriebsplanung“: Projekte (im Lastenheft
 * „Projekthülle“) und die baubetrieblichen Anmeldungen für Sperrpausen. Jede
 * Anmeldung steht in einem Status eines Workflows; die Workflows sind – wie im
 * Planlaufmanagement – bearbeitbar (Grundlage: Lastenheft „Laufender
 * Baubetrieb – grober Monitor“ der Anwender).
 *
 * Flache Listen, Verweise über IDs – wie im Planlaufmanagement, aber
 * vollständig davon getrennt.
 */
import type { ISODate } from '../../../shared/dates';

export type { ISODate };
export type ID = string;

/**
 * Fassung des gespeicherten Bestands. Erhöhen, sobald `migriere()` in
 * `store/storage.ts` ältere Stände anheben muss.
 */
export const DATEN_VERSION = 8;

/** Name, solange niemand unter „Angemeldet als“ eingetragen ist. */
export const STANDARD_BEARBEITER = 'Bearbeitung MIC';

export type Farbmodus = 'standard' | 'kontrast';

/* ------------------------------------------------------------------ */
/* Phasen, Maßnahmenarten, AnnexVII                                    */
/* ------------------------------------------------------------------ */

/**
 * Phasen der Baubetriebsplanung – je Phase ein Standard-Workflow. Im
 * Lastenheft hießen sie SKM, PzE, Vorprozess N-x und unterjährige Anmeldung.
 */
export type Phase = 'skm' | 'mkm' | 'km' | 'kkm';

export const PHASE_LABEL: Record<Phase, string> = {
  skm: 'SKM',
  mkm: 'MKM',
  km: 'KM (n-2 & n-1)',
  kkm: 'KKM (unterjährig)',
};

/**
 * Maßnahmenart einer Anmeldung. SKM und MKM kennzeichnen die Sammeleinträge
 * dieser Phasen; die übrigen Arten können in mehreren Phasen vorkommen –
 * getrennt wird nach Workflow. Das Lastenheft unterschied A_Vor_N-2,
 * A_Vor_N-1 und A_unterjahr; sie sind in A aufgegangen, PzE heißt MKM.
 */
export type AnmeldungsArt = 'SKM' | 'MKM' | 'A' | 'B(0)' | 'B(S)' | 'B' | 'C' | 'Container';

export const ALLE_ARTEN: AnmeldungsArt[] = ['SKM', 'MKM', 'A', 'B(0)', 'B(S)', 'B', 'C', 'Container'];

/** Maßnahmenarten mit eigener Frist im KKM (Ril_KKM je Maßnahmenart). */
export const MASSNAHMENARTEN: AnmeldungsArt[] = ['A', 'B(0)', 'B(S)', 'B', 'C', 'Container'];

export type AnnexVIIGrund =
  | 'ausserhalbKontrolle'
  | 'anlagemangel'
  | 'kosten'
  | 'schatten'
  | 'prozessphase'
  | 'zustimmung';

export const ANNEX_VII: { id: AnnexVIIGrund; label: string; selten?: boolean }[] = [
  { id: 'ausserhalbKontrolle', label: 'Außerhalb Kontrolle DB' },
  { id: 'anlagemangel', label: 'Anlagemangel / sicherer Betrieb' },
  { id: 'kosten', label: 'Wesentlich höhere Kosten' },
  { id: 'schatten', label: 'Vollständig im Schatten' },
  // Laut Lastenheft nur der Vollständigkeit halber – in der Praxis so gut wie nie
  { id: 'prozessphase', label: 'Entspricht Prozessphase', selten: true },
  { id: 'zustimmung', label: 'Zustimmung EVU/EIU', selten: true },
];

export const ANNEX_VII_LABEL = Object.fromEntries(ANNEX_VII.map((a) => [a.id, a.label])) as Record<
  AnnexVIIGrund,
  string
>;

/* ------------------------------------------------------------------ */
/* Workflows                                                           */
/* ------------------------------------------------------------------ */

/** Art eines Status – steuert Farbe und Bedeutung in der Oberfläche. */
export type StatusArt =
  | 'entwurf'
  | 'abstimmung'
  | 'angemeldet'
  | 'verspaetet'
  | 'genehmigt'
  | 'abgelehnt'
  | 'aenderung'
  | 'leiche';

export const STATUS_ART_LABEL: Record<StatusArt, string> = {
  entwurf: 'Entwurf',
  abstimmung: 'In Abstimmung',
  angemeldet: 'Angemeldet',
  verspaetet: 'Angemeldet (verspätet)',
  genehmigt: 'Genehmigt',
  abgelehnt: 'Abgelehnt',
  aenderung: 'Änderungsabstimmung',
  leiche: 'Anmeldeleiche',
};

/**
 * Bezug einer Terminfrist auf die Richtlinie: Ril_SKM, Ril_MKM, Ril_KM N-2,
 * Ril_KM (N-2 oder N-1 – die N-2-Frist, solange sie am Tag des Statuswechsels
 * nicht verstrichen ist und nicht vor dem ersten Anmeldetermin liegt),
 * Ril_KKM A und Ril_KKM (je Maßnahmenart). Im
 * Lastenheft hießen sie Ril_skm, Ril_pze, Ril_N-2, Ril_Nx, Ril_A und Ril_X.
 */
export type RilBezug = 'skm' | 'mkm' | 'N-2' | 'Nx' | 'A' | 'X';

/** Kürzel in Fristregeln, z. B. „Ril_KKM − 14 Tage“. */
export const RIL_BEZUG_KUERZEL: Record<RilBezug, string> = {
  skm: 'Ril_SKM',
  mkm: 'Ril_MKM',
  'N-2': 'Ril_KM N-2',
  Nx: 'Ril_KM',
  A: 'Ril_KKM A',
  X: 'Ril_KKM',
};

/** Phase eines Fristbezugs – für die nach Phase gegliederte Auswahl im Workflow-Editor. */
export const RIL_BEZUG_PHASE: Record<RilBezug, Phase> = {
  skm: 'skm',
  mkm: 'mkm',
  'N-2': 'km',
  Nx: 'km',
  A: 'kkm',
  X: 'kkm',
};

export const RIL_BEZUG_LABEL: Record<RilBezug, string> = {
  skm: 'SKM (Ril_SKM)',
  mkm: 'MKM (Ril_MKM)',
  'N-2': 'KM N-2 (Ril_KM N-2)',
  Nx: 'KM N-2 oder N-1 – die beim Statuswechsel offene (Ril_KM)',
  A: 'KKM Maßnahmenart A (Ril_KKM A)',
  X: 'KKM je Maßnahmenart (Ril_KKM)',
};

/** Terminfrist, die eine Anmeldung in einem Status einhalten soll. */
export type FristRegel =
  /** „.-.“ – keine Frist */
  | { typ: 'keine' }
  /** Frist laut Richtlinie, ggf. mit Versatz in Kalendertagen (−14 für „Ril_KKM − 14 Tage“) */
  | { typ: 'ril'; bezug: RilBezug; versatzTage: number }
  /** „Nächster 1.8.“ – der nächste Stichtag ab dem Statuswechsel */
  | { typ: 'stichtag'; tag: number; monat: number }
  /** Nachhak-Termin: so viele Tage nach dem Statuswechsel */
  | { typ: 'nachhaken'; tage: number };

export type FristTyp = FristRegel['typ'];

export const FRIST_TYP_LABEL: Record<FristTyp, string> = {
  keine: 'Keine Terminfrist',
  ril: 'Frist laut Richtlinie',
  stichtag: 'Nächster Stichtag (TT.MM.)',
  nachhaken: 'Nachhak-Termin nach Statuswechsel',
};

/**
 * Ziel eines Statuswechsels, das den Eintrag samt Verlauf löscht. In den
 * Standard-Workflows folgt es nur auf den Status „Anmeldeleiche“: Eine
 * Anmeldung wird erst zur Anmeldeleiche und im nächsten Schritt gelöscht.
 */
export const LOESCHEN = 'loeschen';

/**
 * Ziel eines Statuswechsels: die ID eines Status – auch eines Status in einem
 * anderen Workflow (Übernahme in eine neue Phase) – oder `LOESCHEN`.
 */
export type StatusZiel = ID;

/**
 * Wer in einem Status am Zug ist. Die Tabelle nennt dazu den Namen: BBK – der
 * zuständige BBK der Anmeldung, MIC – der Hauptbearbeiter, Projektleitung –
 * der Projektleiter des Projekts.
 */
export type Zustaendigkeit = 'mic' | 'bbk' | 'projektleitung';

export const ZUSTAENDIGKEIT_LABEL: Record<Zustaendigkeit, string> = {
  mic: 'MIC',
  bbk: 'BBK',
  projektleitung: 'Projektleitung DB',
};

export interface WorkflowStatus {
  id: ID;
  name: string;
  art: StatusArt;
  /** Wer in diesem Status zuständig ist; null – niemand. */
  zustaendig: Zustaendigkeit | null;
  frist: FristRegel;
  /** Der Termin dient zum Nachhaken („Zum Nachhaken“). */
  nachhaken: boolean;
  bemerkung: string;
  /** Mögliche Nachfolger – nur diese stehen beim Statuswechsel zur Wahl. */
  nachfolger: StatusZiel[];
}

/**
 * In SKM und MKM gibt es noch keine Anmeldungen: Der Sperrzeitraum umfasst das
 * ganze Fahrplanjahr, statt einer Anmelde-ID steht ein Begriff bzw. die tVE-Nr.
 */
export type BauzeitraumModus = 'fahrplanjahr' | 'tagesscharf';

export const BAUZEITRAUM_LABEL: Record<BauzeitraumModus, string> = {
  fahrplanjahr: 'Ganzes Fahrplanjahr',
  tagesscharf: 'Tagesscharf (von – bis)',
};

/**
 * Workflow einer Phase. Eine Anmeldung durchläuft die Status eines Workflows
 * und wird über einen Nachfolger in einem anderen Workflow in die nächste
 * Phase übernommen. Neu angelegt wird immer im ersten Status.
 */
export interface Workflow {
  id: ID;
  name: string;
  /** Kurzbezeichnung für Listen und Kennzeichen, z. B. „MKM“. */
  kurz: string;
  beschreibung: string;
  herkunft: 'standard' | 'manuell';
  bauzeitraum: BauzeitraumModus;
  /** Zulässige Maßnahmenarten; die erste ist die Vorgabe. */
  arten: AnmeldungsArt[];
  /** Status in ihrer Reihenfolge; der erste ist der Startstatus. */
  status: WorkflowStatus[];
}

/* ------------------------------------------------------------------ */
/* Richtlinienfristen                                                  */
/* ------------------------------------------------------------------ */

/**
 * Einzelne Fristen laut Richtlinie: je Phase, im KM getrennt nach N-2 und
 * N-1, im KKM je Maßnahmenart.
 */
export type RilSchluessel = 'skm' | 'mkm' | 'N-2' | 'N-1' | 'A' | 'B(0)' | 'B(S)' | 'B' | 'C' | 'Container';

export const RIL_SCHLUESSEL: RilSchluessel[] = ['skm', 'mkm', 'N-2', 'N-1', 'A', 'B(0)', 'B(S)', 'B', 'C', 'Container'];

export const RIL_LABEL: Record<RilSchluessel, string> = {
  skm: 'SKM',
  mkm: 'MKM',
  'N-2': 'KM N-2',
  'N-1': 'KM N-1',
  A: 'KKM Maßnahmenart A',
  'B(0)': 'KKM Maßnahmenart B(0)',
  'B(S)': 'KKM Maßnahmenart B(S)',
  B: 'KKM Maßnahmenart B',
  C: 'KKM Maßnahmenart C',
  Container: 'KKM Maßnahmenart Container',
};

/** Kürzel einer Richtlinienfrist, z. B. „Ril_KM N-2“ oder „Ril_KKM B(S)“. */
export const RIL_KUERZEL: Record<RilSchluessel, string> = {
  skm: 'Ril_SKM',
  mkm: 'Ril_MKM',
  'N-2': 'Ril_KM N-2',
  'N-1': 'Ril_KM N-1',
  A: 'Ril_KKM A',
  'B(0)': 'Ril_KKM B(0)',
  'B(S)': 'Ril_KKM B(S)',
  B: 'Ril_KKM B',
  C: 'Ril_KKM C',
  Container: 'Ril_KKM Container',
};

/** Phase, zu der eine Richtlinienfrist gehört – danach gliedern sich Einstellungen und Übersicht. */
export const RIL_PHASE: Record<RilSchluessel, Phase> = {
  skm: 'skm',
  mkm: 'mkm',
  'N-2': 'km',
  'N-1': 'km',
  A: 'kkm',
  'B(0)': 'kkm',
  'B(S)': 'kkm',
  B: 'kkm',
  C: 'kkm',
  Container: 'kkm',
};

/**
 * Berechnungsweise einer Richtlinienfrist: als Stichtag TT.MM. im Jahr
 * N − k (N = Fahrplanjahr der Anmeldung) oder als Wochen vor Sperrbeginn.
 */
export interface RilFrist {
  bezug: 'stichtag' | 'baubeginn';
  tag: number;
  monat: number;
  jahreVorher: number;
  wochenVorher: number;
  /** Vorbelegter Wert, der noch nicht mit der Richtlinie abgeglichen ist. */
  platzhalter: boolean;
}

/* ------------------------------------------------------------------ */
/* Bestand                                                             */
/* ------------------------------------------------------------------ */

export type ProjektStatus = 'aktiv' | 'pausiert' | 'abgeschlossen';

export const PROJEKT_STATUS_LABEL: Record<ProjektStatus, string> = {
  aktiv: 'Aktiv',
  pausiert: 'Betreuungspause',
  abgeschlossen: 'Abgeschlossen',
};

/** Hinweis je Phase, wie sich ihre Richtlinienfrist auswählt. */
export const RIL_PHASE_HINWEIS: Record<Phase, string> = {
  skm: 'Stichtag je Fahrplanjahr',
  mkm: 'Stichtag je Fahrplanjahr',
  km: 'Es gilt die N-2-Frist, solange sie am Tag des Statuswechsels nicht verstrichen ist und nicht vor dem ersten Anmeldetermin des Projekts liegt, sonst die N-1-Frist (Ril_KM).',
  kkm: 'Vorlauf je Maßnahmenart (Ril_KKM); Stichtag der Anmeldung ist der Mittwoch.',
};

/** Richtlinienfristen gegliedert nach Phase, in der Reihenfolge der Phasen. */
export function rilFristenNachPhase(): { phase: Phase; schluessel: RilSchluessel[] }[] {
  return (Object.keys(PHASE_LABEL) as Phase[]).map((phase) => ({
    phase,
    schluessel: RIL_SCHLUESSEL.filter((s) => RIL_PHASE[s] === phase),
  }));
}

/** Prozessphase, auf die sich der erste Anmeldetermin bezieht. */
export type ErstePhase = 'skm' | 'mkm' | 'N-2' | 'N-1' | 'kkm';

export const ERSTE_PHASE_LABEL: Record<ErstePhase, string> = {
  skm: 'SKM',
  mkm: 'MKM',
  'N-2': 'KM N-2',
  'N-1': 'KM N-1',
  kkm: 'KKM (unterjährig)',
};

/** Projekt (im Lastenheft „Projekthülle“) – wird bei der MIC-Beauftragung angelegt. */
export interface Projekt {
  id: ID;
  /** Kurzbezeichnung der Baumaßnahme für Listen und Seitenleiste. */
  name: string;
  projektleiter: string;
  dbGNummer: string;
  /** Erster Anmeldetermin (ca.-Wert, je nach Prozessphase laut Richtlinie). */
  ersterAnmeldetermin: ISODate | null;
  erstePhase: ErstePhase;
  /** Betroffene Fahrplanjahre, aufsteigend – je Jahr eine Zeile im Anmeldebedarf. */
  fahrplanjahre: number[];
  inbetriebnahme: ISODate | null;
  hauptbearbeiter: string;
  /** MIC-Projektnummer (wiko). */
  projektnummer: string;
  status: ProjektStatus;
  markiert: boolean;
  bemerkung: string;
}

/** Eintrag im Statusverlauf einer Anmeldung. */
export interface VerlaufEintrag {
  id: ID;
  typ: 'anlage' | 'wechsel' | 'notiz';
  /** Datum des Ereignisses (fachlich, frei wählbar). */
  datum: ISODate;
  /** Zeitpunkt der Erfassung. */
  erfasst: string;
  bearbeiter: string;
  von: ID | null;
  nach: ID | null;
  /**
   * Workflow und Status zum Zeitpunkt des Eintrags, z. B. „MKM · Angemeldet“ –
   * bleibt lesbar, auch wenn der Workflow später geändert wird.
   */
  vonText: string;
  nachText: string;
  text: string;
  /** ÄAbst-Nr und AnnexVII einer abgeschlossenen Änderungsabstimmung. */
  aenderungsNr?: string;
  annexVII?: AnnexVIIGrund | null;
  /** Stand vor dem Wechsel – zum Zurücknehmen. */
  vorher?: AnmeldungStand;
}

/** Felder, die ein Statuswechsel ändern kann. */
export interface AnmeldungStand {
  statusId: ID;
  statusSeit: ISODate;
  art: AnmeldungsArt;
  anmeldeId: string;
  bauVon: ISODate | null;
  bauBis: ISODate | null;
  fahrplanjahr: number | null;
  aenderungsNr: string;
  annexVII: AnnexVIIGrund | null;
  terminManuell: ISODate | null;
}

/** Baubetriebliche Anmeldung – eine „Zeile“ im Projekt. */
export interface Anmeldung extends AnmeldungStand {
  id: ID;
  projektId: ID;
  /** Vorhabenname – im SKM führend vor der Nummer (tVE-Nr). */
  vorhaben: string;
  /** Zuständiger BBK (Name). */
  bbk: string;
  /** Bf/Strecke in Stichworten. */
  bfStrecke: string;
  /** Gewerk/Tätigkeit in Stichworten. */
  gewerk: string;
  bemerkung: string;
  /** Eintrag, aus dessen Aufteilung diese Anmeldung bei der Übernahme entstand. */
  herkunftId: ID | null;
  verlauf: VerlaufEintrag[];
}

export interface Einstellungen {
  farbmodus: Farbmodus;
  bearbeiter: string;
  /** Ab so vielen Tagen vor der Terminfrist gilt eine Anmeldung als fällig. */
  vorlaufTage: number;
  /** Vorgabe für Nachhak-Termine: neue Status im Editor und „Nachgehakt …“. */
  nachhakTage: number;
  /** Anmeldebedarf der Projekte: so viele Tage im Voraus anzeigen. */
  bedarfVorschauTage: number;
  rilFristen: Record<RilSchluessel, RilFrist>;
}

export interface BaubetriebDaten {
  version: number;
  einstellungen: Einstellungen;
  workflows: Workflow[];
  projekte: Projekt[];
  anmeldungen: Anmeldung[];
}
