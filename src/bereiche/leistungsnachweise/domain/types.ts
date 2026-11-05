/**
 * Datenmodell des Bereichs „Leistungsnachweise“. Flache Listen, Verweise über
 * IDs – wie in den anderen Bereichen, aber vollständig davon getrennt.
 *
 * Ein Projekt sammelt die erfassten Leistungen seiner Mitarbeiter (je Tag,
 * Person und Tätigkeit eine `Leistung` mit Stunden). Ein Leistungsnachweis
 * ist ein Zeitraum eines Projekts – ein Monat oder auch mehrere – und fasst
 * die Leistungen darin je Tag, Woche oder Monat zu Zeilen zusammen
 * (`Raster`). Mehrere Mitarbeiter schreiben so an einem gemeinsamen
 * Nachweis, ohne einander zu überschreiben: Jede Person bringt nur ihre
 * eigenen Leistungen ein, der Nachweis rechnet die Zeilen daraus.
 */
export type ID = string;
/** Datum als JJJJ-MM-TT; leer = ohne Datum. */
export type ISODate = string;

/**
 * Fassung des gespeicherten Bestands. Neue Felder sind optional oder werden in
 * `migriere()` (store/storage.ts) nachgetragen – dann diese Zahl erhöhen.
 */
export const DATEN_VERSION = 1;

/** Vorgabe für „Angemeldet als“. */
export const STANDARD_BEARBEITER = 'Mitarbeiter MIC';

export type Farbmodus = 'standard' | 'kontrast';

export interface Einstellungen {
  /** Angemeldete Person (Name, wie er in der Seitenleiste steht). */
  bearbeiter: string;
  /**
   * Mitarbeiter, als der die angemeldete Person Leistungen erfasst – Vorgabe
   * beim Erfassen und für Importzeilen ohne Angabe des Mitarbeiters.
   */
  mitarbeiterId: ID | null;
  farbmodus: Farbmodus;
}

/* ------------------------------------------------------------------ */
/* Mitarbeiter                                                         */
/* ------------------------------------------------------------------ */

/** Person, die Leistungen erbringt – projektübergreifend. */
export interface Mitarbeiter {
  id: ID;
  /** Kürzel, etwa „LR“ – so steht die Person auch im Import („LR: Roese, Lukas“). */
  kuerzel: string;
  vorname: string;
  nachname: string;
  /** Ausgeschiedene Personen bleiben mit ihren Leistungen erhalten, stehen aber nicht mehr zur Wahl. */
  aktiv: boolean;
}

/** „Vorname Nachname“ – so steht die Person im Leistungsnachweis. */
export function mitarbeiterName(m: { vorname: string; nachname: string }): string {
  return `${m.vorname} ${m.nachname}`.trim();
}

/* ------------------------------------------------------------------ */
/* Projekte                                                            */
/* ------------------------------------------------------------------ */

export type ProjektStatus = 'aktiv' | 'pausiert' | 'abgeschlossen';

export const PROJEKT_STATUS_LABEL: Record<ProjektStatus, string> = {
  aktiv: 'Aktiv',
  pausiert: 'Pausiert',
  abgeschlossen: 'Abgeschlossen',
};

/** Feinheit der Zeilen eines Leistungsnachweises. */
export type Raster = 'tag' | 'woche' | 'monat';

export const RASTER_LABEL: Record<Raster, string> = {
  tag: 'Tagesscharf',
  woche: 'Wochenscharf',
  monat: 'Monatsscharf',
};

/** Kurzform für Auswahlfelder und Tabellen. */
export const RASTER_KURZ: Record<Raster, string> = {
  tag: 'Tag',
  woche: 'Woche',
  monat: 'Monat',
};

/**
 * Wie neue Leistungen außerhalb der vorhandenen Nachweise einen Nachweis
 * erhalten: je Kalendermonat ein eigener, oder fortlaufend – der offene
 * Nachweis wächst mit, bis er abgeschlossen wird (Nachweise über mehrere
 * Monate).
 */
export type Zeitraumregel = 'monat' | 'fortlaufend';

export const ZEITRAUMREGEL_LABEL: Record<Zeitraumregel, string> = {
  monat: 'Je Kalendermonat',
  fortlaufend: 'Fortlaufend bis zum Abschluss',
};

/** Logo im Kopf des Leistungsnachweises. */
export interface Logo {
  id: ID;
  name: string;
  /** Bilddaten (data:…) oder ein Pfad unter `public/`, etwa `logos/Druck_Mailaender_Consult.png`. */
  src: string;
}

/**
 * Abschnitt eines Projekts, etwa ein Streckenabschnitt. Hat ein Projekt
 * Abschnitte, weist der Nachweis die Stunden je Abschnitt in eigenen Spalten
 * aus („Aufwand (Std)“ mit „Abschn.1“, „Abschn.2“ …).
 */
export interface Abschnitt {
  id: ID;
  /**
   * Kennung zum Zuordnen beim Import: die Nummer vor dem Doppelpunkt der
   * Spalte „Projektelement“, etwa „01“ für „01: Neustadt Nord, Strecke 3436“.
   */
  kennung: string;
  /** Spaltenkopf im Nachweis, etwa „Abschn.1“. */
  kurz: string;
  /** Vollständige Bezeichnung, etwa „Neustadt Nord, Strecke 3436“. */
  name: string;
}

export interface Projekt {
  id: ID;
  /** Projektnummer, etwa „K2476“ – daran erkennt der Import das Projekt. */
  nummer: string;
  name: string;
  /** Bezeichnung im Kopf des Nachweises, etwa „Hp Aalen-West“; leer = `name`. */
  kurzname: string;
  status: ProjektStatus;
  /** Markierte Projekte erscheinen in der Übersicht und in der Seitenleiste. */
  markiert: boolean;
  beschreibung: string;
  /** Leistungsbereich im Kopf des Nachweises, etwa „Projektsteuerung“. */
  leistungsbereich: string;
  /** Vorgabe für neue Nachweise. */
  raster: Raster;
  zeitraumregel: Zeitraumregel;
  abschnitte: Abschnitt[];
  /** Logos im Druckkopf; null = Standardlogos (`STANDARD_LOGOS`). */
  logos: Logo[] | null;
}

/** Bezeichnung des Projekts im Kopf des Nachweises. */
export function projektKurzname(p: { name: string; kurzname: string }): string {
  return p.kurzname.trim() || p.name;
}

/** „K2476 PS / PLM, Neubau Hp Aalen West“ */
export function projektTitel(p: { nummer: string; name: string }): string {
  return [p.nummer, p.name].filter(Boolean).join(' ');
}

/** Vorschläge für den Leistungsbereich. */
export const LEISTUNGSBEREICH_VORSCHLAEGE = [
  'Projektsteuerung',
  'Projektmanagement',
  'Planlaufmanagement',
  'Baubetriebsplanung',
  'Bauüberwachung',
];

/* ------------------------------------------------------------------ */
/* Leistungen                                                          */
/* ------------------------------------------------------------------ */

export type Quelle = 'manuell' | 'import';

export const QUELLE_LABEL: Record<Quelle, string> = {
  manuell: 'Händisch',
  import: 'Import',
};

/**
 * Erfasste Leistung: an einem Tag, von einer Person, für ein Projekt. Sie
 * gehört keinem bestimmten Nachweis – welcher sie zeigt, ergibt sich aus
 * dessen Zeitraum (`nachweisFuer` in domain/nachweis.ts).
 */
export interface Leistung {
  id: ID;
  projektId: ID;
  mitarbeiterId: ID;
  datum: ISODate;
  /** Leistungstext, etwa „Abstimmung PL“. */
  text: string;
  /** Stunden, auf die Viertelstunde genau oder feiner. */
  stunden: number;
  /** Abschnitt des Projekts; null = ohne Abschnitt. */
  abschnittId: ID | null;
  /** Spalte „Projektelement“ des Imports, unverändert; leer bei händischer Erfassung. */
  projektelement: string;
  quelle: Quelle;
  /** Zeitpunkt der Erfassung bzw. des Imports (ISO). */
  erfasst: string;
}

/* ------------------------------------------------------------------ */
/* Leistungsnachweise                                                  */
/* ------------------------------------------------------------------ */

export type NachweisStatus = 'entwurf' | 'abgeschlossen';

export const NACHWEIS_STATUS_LABEL: Record<NachweisStatus, string> = {
  entwurf: 'In Bearbeitung',
  abgeschlossen: 'Abgeschlossen',
};

/**
 * Von Hand bearbeiteter Leistungstext einer Zeile. Die Kennungen der
 * Leistungen, die beim Bearbeiten in der Zeile standen, zeigen später, ob
 * seitdem Leistungen hinzugekommen sind – der Text wird dann nicht
 * überschrieben, sondern die neuen Leistungen werden zum Ergänzen angeboten.
 */
export interface ZeilenText {
  text: string;
  leistungIds: ID[];
}

/** Zeile eines Nachweises: ein Tag, eine Woche oder ein Monat mit Leistungen. */
export interface NachweisZeile {
  /** Schlüssel des Zeitraums, etwa „T2026-10-30“, „W2026-44“ oder „M2026-10“ (`periodeVon`). */
  schluessel: string;
  von: ISODate;
  bis: ISODate;
  /** Spalte „Datum“, etwa „KW 44\n26.10.26 - 30.10.26“. */
  datumText: string;
  /** Namen der Mitarbeiter mit Leistungen in der Zeile. */
  bearbeiter: string[];
  text: string;
  /** Der Text wurde von Hand bearbeitet. */
  textBearbeitet: boolean;
  stunden: number;
  /** Stunden je Abschnitt; Schlüssel ist die Abschnitts-ID, `OHNE_ABSCHNITT` für Leistungen ohne. */
  stundenJeAbschnitt: Record<string, number>;
  /** Stunden je Mitarbeiter-ID – zur Kontrolle, nicht im Druck. */
  stundenJeMitarbeiter: Record<ID, number>;
  leistungIds: ID[];
}

/** Schlüssel in `stundenJeAbschnitt` für Leistungen ohne Abschnitt. */
export const OHNE_ABSCHNITT = '-';

/**
 * Festgeschriebener Stand eines abgeschlossenen Nachweises: so, wie er
 * abgegeben wurde. Spätere Änderungen an Leistungen, Abschnitten oder
 * Projekt ändern ihn nicht; erst „Wieder öffnen“ rechnet neu.
 */
export interface NachweisStand {
  zeilen: NachweisZeile[];
  abschnitte: Abschnitt[];
  projekt: { nummer: string; name: string; kurzname: string; leistungsbereich: string };
  titel: string;
  stunden: number;
}

export interface Leistungsnachweis {
  id: ID;
  projektId: ID;
  /** Überschrift im Druck; leer = „Leistungsnachweis“ mit dem Zeitraum (`nachweisTitel`). */
  titel: string;
  von: ISODate;
  bis: ISODate;
  raster: Raster;
  status: NachweisStatus;
  /** Von Hand bearbeitete Leistungstexte je Zeilenschlüssel. */
  texte: Record<string, ZeilenText>;
  /** Hinweis unter der Tabelle (Freitext). */
  bemerkung: string;
  /** Zeitpunkte (ISO). */
  erstellt: string;
  geaendert: string;
  abgeschlossen: string | null;
  /** Festgeschriebener Stand, solange der Nachweis abgeschlossen ist. */
  stand: NachweisStand | null;
}

/* ------------------------------------------------------------------ */
/* Gesamtbestand                                                       */
/* ------------------------------------------------------------------ */

export interface LeistungsnachweisDaten {
  version: number;
  einstellungen: Einstellungen;
  mitarbeiter: Mitarbeiter[];
  projekte: Projekt[];
  leistungen: Leistung[];
  nachweise: Leistungsnachweis[];
}

/* ------------------------------------------------------------------ */
/* Hilfen                                                              */
/* ------------------------------------------------------------------ */

export function newId(prefix = 'id'): ID {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Kürzel aus einem Namen: Anfangsbuchstaben von Vor- und Nachname, sonst die
 * ersten zwei Buchstaben – höchstens vier Zeichen.
 */
export function kuerzelAus(name: string): string {
  const woerter = name.trim().split(/[\s,-]+/).filter(Boolean);
  if (woerter.length === 0) return '';
  const roh = woerter.length > 1 ? woerter.map((w) => w[0]).join('') : woerter[0].slice(0, 2);
  return roh.slice(0, 4).toUpperCase();
}
