/**
 * Datenmodell des Bereichs „Projektsteuerung“. Flache Listen, Verweise über
 * IDs – wie im Planlaufmanagement, aber vollständig davon getrennt.
 *
 * Funktionen gelten projektübergreifend. Ein Projekt führt seine
 * Projektbeteiligten (je Person eine Funktion) und seine Protokolle.
 */
export type ID = string;
/** Datum als JJJJ-MM-TT; leer = ohne Datum. */
export type ISODate = string;

/**
 * Fassung des gespeicherten Bestands. Neue Felder sind optional oder werden in
 * `migriere()` (store/storage.ts) nachgetragen – dann diese Zahl erhöhen.
 * Fassung 2: Gewerke der Funktionen, Verweis von Aufgaben auf LOP-Punkte.
 * Fassung 3: gestrichene Einträge (`entfaellt`).
 * Fassung 4: Einträge aus Zeilen mit Ursprungsprotokoll, gestrichene
 * Tagesordnungspunkte, Bemerkung der LOP-Punkte; die LOP ohne Kopfangaben.
 * Fassung 5: ohne LOP; Ergänzungen mit eigener Art (`Zeile.typ`).
 */
export const DATEN_VERSION = 5;

/** Vorgabe für „Angemeldet als“. */
export const STANDARD_BEARBEITER = 'Projektsteuerung MIC';

/** So viele Tage vor dem Termin gilt ein offener Punkt als „demnächst fällig“. */
export const VORLAUF_TAGE = 7;

export type Farbmodus = 'standard' | 'kontrast';

export interface Einstellungen {
  /** Angemeldete Person; schlägt sich als Protokollführung neuer Protokollreihen nieder. */
  bearbeiter: string;
  farbmodus: Farbmodus;
}

/* ------------------------------------------------------------------ */
/* Projekte, Funktionen, Projektbeteiligte                             */
/* ------------------------------------------------------------------ */

export type ProjektStatus = 'aktiv' | 'pausiert' | 'abgeschlossen';

export const PROJEKT_STATUS_LABEL: Record<ProjektStatus, string> = {
  aktiv: 'Aktiv',
  pausiert: 'Pausiert',
  abgeschlossen: 'Abgeschlossen',
};

/** Logo im Kopf von Protokoll und Projektbeteiligtenliste. */
export interface Logo {
  id: ID;
  name: string;
  /** Bilddaten (data:…) oder ein Pfad unter `public/`, etwa `logos/Druck_DB_InfraGO.png`. */
  src: string;
}

export interface Projekt {
  id: ID;
  nummer: string;
  name: string;
  status: ProjektStatus;
  /** Markierte Projekte erscheinen in der Übersicht und in der Seitenleiste. */
  markiert: boolean;
  beschreibung: string;
  /** Logos im Druckkopf; null = Standardlogos (`STANDARD_LOGOS`). */
  logos: Logo[] | null;
}

/** Projektübergreifende Funktion, etwa „Bauüberwachung“. */
export interface Funktion {
  id: ID;
  name: string;
  kuerzel: string;
  farbe: string;
  beschreibung: string;
  /**
   * Gewerk, zu dem die Funktion gehört: „Fachplanung“ im Gewerk LST ist eine
   * andere Funktion als „Fachplanung“ im Gewerk OLA. `null` = übergreifend.
   */
  gewerk: string | null;
}

/** Seite der Funktionen ohne Gewerkbezug. */
export const UEBERGREIFEND = 'Übergreifend';

/** Vollständige Bezeichnung einer Funktion samt Gewerk, etwa „Fachplanung LST“. */
export function funktionsName(f: { name: string; gewerk: string | null }): string {
  return f.gewerk ? `${f.name} ${f.gewerk}` : f.name;
}

/** Person in der Projektbeteiligtenliste eines Projekts. */
export interface Beteiligter {
  id: ID;
  projektId: ID;
  /** Verweis auf eine projektübergreifende Funktion. */
  funktionId: ID | null;
  anrede: string;
  vorname: string;
  nachname: string;
  firma: string;
  /** Kürzel für Protokolle („Verantwortlich“); leer = Kürzel der Funktion. */
  kuerzel: string;
  email: string;
  telefon: string;
  mobil: string;
  /** Straße, PLZ und Ort – mehrzeilig. */
  anschrift: string;
  notiz: string;
}

/* ------------------------------------------------------------------ */
/* Protokolle                                                          */
/* ------------------------------------------------------------------ */

export const TEILNAHME = ['anwesend', 'entschuldigt', 'abwesend', 'nur Verteiler'] as const;
export type Teilnahme = (typeof TEILNAHME)[number];

/**
 * Teilnehmende eines Protokolls. Kommt die Person aus der
 * Projektbeteiligtenliste, verweist `beteiligterId` auf sie; Name, Funktion,
 * Firma und Kürzel zieht der Store dann nach jeder Änderung nach. Ohne Verweis
 * (Gast, gelöschte Person) bleiben die Angaben, wie sie sind.
 */
export interface Teilnehmer {
  id: ID;
  beteiligterId: ID | null;
  name: string;
  funktion: string;
  firma: string;
  kuerzel: string;
  status: Teilnahme;
}

export type EintragTyp = 'I' | 'F' | 'A';

export const EINTRAG_TYP_LABEL: Record<EintragTyp, string> = {
  I: 'Information',
  F: 'Festlegung',
  A: 'Aufgabe',
};

export type Erledigung = 'offen' | 'erledigt';

/** Stand eines Protokolleintrags im Vorprotokoll. */
export interface EintragVorstand {
  typ: EintragTyp;
  wer: string;
  termin: ISODate;
  status: Erledigung;
  /** Im Vorprotokoll gestrichen (nur Bestände, in denen Gestrichenes noch einmal mitging). */
  entfaellt: boolean;
}

/** Stand einer Zeile im Vorprotokoll. */
export interface ZeileVorstand {
  text: string;
  typ: EintragTyp | null;
  wer: string;
  termin: ISODate;
  status: Erledigung;
  /** Im Vorprotokoll gestrichen (nur ältere Bestände). */
  entfaellt: boolean;
}

/**
 * Zeile eines Eintrags: der Text, der in einem Protokoll hinzukam. Ein
 * Eintrag beginnt mit einer Zeile, dem Ursprung; jedes Folgeprotokoll kann
 * eine Ergänzung als weitere Zeile anfügen. Übernommene Zeilen nennen im
 * Druck ihr Ursprungsprotokoll („aus Prot. 1“).
 *
 * Eine Ergänzung kann eine eigene Art haben – Information, Festlegung oder
 * Aufgabe – mit eigenem Verantwortlich, Termin und Erledigung. Ohne eigene
 * Art (`typ` = null) läuft sie unter dem Ursprung mit und teilt dessen Art,
 * Verantwortlich, Termin und Erledigung.
 */
export interface Zeile {
  id: ID;
  text: string;
  /** Nummer des Protokolls, in dem die Zeile entstand; null = neu in diesem Protokoll. */
  herkunft: number | null;
  /** Eigene Art der Ergänzung; null = läuft unter dem Ursprung mit. */
  typ: EintragTyp | null;
  /** Nur bei eigener Art: Verantwortlich bzw. Beteiligt. */
  wer: string;
  /** Nur bei eigener Art „Aufgabe“. */
  termin: ISODate;
  status: Erledigung;
  /** Gestrichen: Die Zeile steht in diesem Protokoll durchgestrichen und entfällt im Folgeprotokoll. */
  entfaellt: boolean;
  /** Stand im Vorprotokoll; null = neu in diesem Protokoll. */
  vor: ZeileVorstand | null;
}

export interface Eintrag {
  id: ID;
  typ: EintragTyp;
  /** Ursprung und Ergänzungen der Folgeprotokolle, je eine Zeile. */
  zeilen: Zeile[];
  /** Verantwortlich (Aufgabe) bzw. Beteiligt; Kürzel einer teilnehmenden Person. */
  wer: string;
  termin: ISODate;
  status: Erledigung;
  /** Folgeprotokoll, das diesen Eintrag mit seinen Aufgaben weiterführt. */
  uebernommenIn: ID | null;
  /**
   * Gestrichen („aus dem Protokoll löschen“): Der Eintrag erscheint in diesem
   * Protokoll durchgestrichen und entfällt im Folgeprotokoll.
   */
  entfaellt: boolean;
  /** Stand im Vorprotokoll; null = neu in diesem Protokoll. */
  vor: EintragVorstand | null;
}

/** Tagesordnungspunkt. */
export interface Top {
  id: ID;
  titel: string;
  /** Titel im Vorprotokoll; null = neuer Punkt. */
  vorTitel: string | null;
  /**
   * Gestrichen: Der Punkt steht mit allen Einträgen durchgestrichen und
   * entfällt im Folgeprotokoll.
   */
  entfaellt: boolean;
  /** Im Vorprotokoll gestrichen (nur Bestände, in denen Gestrichenes noch einmal mitging). */
  vorEntfaellt: boolean;
  eintraege: Eintrag[];
}

export interface Protokoll {
  id: ID;
  projektId: ID;
  /** Eine Reihe umfasst das erste Protokoll und alle Folgeprotokolle. */
  reiheId: ID;
  /** Besprechung, etwa „Baubesprechung“ oder „Jour fixe“. */
  art: string;
  nr: number;
  datum: ISODate;
  beginn: string;
  ende: string;
  ort: string;
  /** Teilnehmende Person, die das Protokoll führt. */
  fuehrerId: ID | null;
  naechster: ISODate;
  /** Zusätzlicher Verteiler (Freitext). */
  verteiler: string;
  /** Hinweis am Protokollende. */
  hinweis: string;
  teilnehmer: Teilnehmer[];
  tops: Top[];
  /** Zeitpunkt der letzten Änderung (ISO). */
  geaendert: string;
}

/** Vorschläge für die Art der Besprechung. */
export const BESPRECHUNG_VORSCHLAEGE = [
  'Baubesprechung',
  'Jour fixe',
  'Planungsbesprechung',
  'Projektbesprechung',
  'Baustellenbegehung',
  'BIM-Koordination',
  'Abnahme',
];

export const STANDARD_HINWEIS =
  'Einwände oder Ergänzungen zu diesem Protokoll bitte innerhalb von 7 Kalendertagen nach Erhalt schriftlich mitteilen. Andernfalls gilt das Protokoll als anerkannt.';

/* ------------------------------------------------------------------ */
/* Gesamtbestand                                                       */
/* ------------------------------------------------------------------ */

export interface ProjektsteuerungDaten {
  version: number;
  einstellungen: Einstellungen;
  /** Gewerke, nach denen die Funktionen gegliedert sind. */
  gewerke: string[];
  funktionen: Funktion[];
  projekte: Projekt[];
  beteiligte: Beteiligter[];
  protokolle: Protokoll[];
}

/* ------------------------------------------------------------------ */
/* Hilfen                                                              */
/* ------------------------------------------------------------------ */

export function newId(prefix = 'id'): ID {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Kürzel aus einer Bezeichnung: Anfangsbuchstaben der Wörter, bei einem
 * einzelnen Wort dessen erste drei Buchstaben – höchstens vier Zeichen.
 */
export function kuerzelAus(name: string): string {
  const woerter = name.trim().split(/[\s-]+/).filter(Boolean);
  if (woerter.length === 0) return '';
  const roh = woerter.length > 1 ? woerter.map((w) => w[0]).join('') : woerter[0].slice(0, 3);
  return roh.slice(0, 4).toUpperCase();
}

/** „Vorname Nachname“ einer Person. */
export function personName(b: { vorname: string; nachname: string }): string {
  return `${b.vorname} ${b.nachname}`.trim();
}

/** Kürzel, unter dem eine Person in Protokollen geführt wird. */
export function kuerzelVon(b: Beteiligter, funktionen: Funktion[]): string {
  if (b.kuerzel.trim()) return b.kuerzel.trim();
  return funktionen.find((f) => f.id === b.funktionId)?.kuerzel ?? '';
}
