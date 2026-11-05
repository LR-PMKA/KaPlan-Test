/**
 * Fachliches Datenmodell des Planlauf-Managements.
 *
 * Die Struktur ist bewusst so geschnitten, dass sie später 1:1 auf
 * relationale Tabellen abgebildet werden kann (jede Entität hat eine
 * eigene ID, Referenzen laufen ausschließlich über IDs).
 */

export type ID = string;

/** ISO-Datum ohne Zeitanteil, z.B. "2026-03-14". */
export type ISODate = string;

/** Aktuelle Fassung des Datenbestands – steuert die Migration beim Laden. */
export const DATEN_VERSION = 14;

/**
 * Fassung der mitgelieferten Stammdaten (Funktionen und Standard-Prozess-
 * ketten). Wird sie erhöht, übernimmt ein vorhandener Bestand beim nächsten
 * Laden die neuen Stammdaten – eigene Rollen, Varianten und laufende Planläufe
 * bleiben dabei unangetastet.
 */
export const STAMMDATEN_VERSION = 6;

/* ------------------------------------------------------------------ */
/* Bearbeiter                                                          */
/* ------------------------------------------------------------------ */

/** Farbdarstellung der Oberfläche. */
export type Farbmodus = 'standard' | 'kontrast';

/**
 * Angemeldete Person. Alle Bearbeiter sehen alle Projekte; die angemeldete
 * Person füllt in ihren Projekten stets die Funktion Planlaufmanagement aus –
 * Schritte dieser Funktion gelten daher als eigene To-Dos.
 */
export interface Bearbeiter {
  name: string;
  /**
   * Nach dem Erledigen eines eigenen Schritts fragen, ob die für den
   * nächsten Schritt zuständige Person per E-Mail informiert werden soll.
   */
  mailNachfrage: boolean;
  /**
   * „kontrast“ stellt die Oberfläche mit Farben dar, die auch bei einer
   * Rot-Grün-Sehschwäche unterscheidbar sind, und erhöht die Kontraste.
   */
  farbmodus: Farbmodus;
}

/** Name der angemeldeten Person, solange es keine Anmeldung gibt. */
export const STANDARD_BEARBEITER = 'Max Mustermann';

/** Die eigene Rolle in allen Projekten (Kürzel: PLM). */
export const EIGENE_ROLLE = 'Planlaufmanagement';

/**
 * Die eigene Funktion: übergreifend und mit der Bezeichnung des
 * Planlaufmanagements. Sie füllt stets die angemeldete Person mit ihrem
 * Profil aus – sie wird daher nicht unter „Funktion“ geführt und nicht
 * bearbeitet.
 */
export function istEigeneFunktion(funktion: { name: string; gewerk: string | null }): boolean {
  return funktion.gewerk === null && funktion.name.trim().toLowerCase() === EIGENE_ROLLE.toLowerCase();
}

/** Erster Schritt der mitgelieferten Workflows: der Plan geht beim PLM ein. */
export const SCHRITT_EINGANG = 'Eingang PLM';

/** Prüft, ob ein Schritt der Eingang beim Planlaufmanagement ist. */
export function istEingangPLM(schrittName: string): boolean {
  return schrittName.trim().toLowerCase() === SCHRITT_EINGANG.toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Projekt                                                             */
/* ------------------------------------------------------------------ */

export type ProjectStatus = 'aktiv' | 'pausiert' | 'abgeschlossen';

export interface Project {
  id: ID;
  nummer: string;
  name: string;
  status: ProjectStatus;
  /** Markierte Projekte erscheinen in der Übersicht und in der Seitenleiste. */
  markiert: boolean;
  beschreibung: string;
  settings: ProjectSettings;
  /** Zeitpunkt der letzten Änderung (ISO-Zeitstempel), vom Store gesetzt. */
  geaendertAm?: string;
}

export interface ProjectSettings {
  /** Vorlaufzeit in Tagen, ab der eine Frist als "fällig" gemeldet wird. */
  erinnerungVorlaufTage: number;
  /** Fristen in Arbeitstagen (Mo–Fr) statt Kalendertagen rechnen. */
  fristenInArbeitstagen: boolean;
  /** Projektbezogene Feiertage, die bei Arbeitstagen übersprungen werden. */
  feiertage: ISODate[];
  /** Absender, der in der Vorlage als {{absender}} eingesetzt wird. */
  absenderName: string;
  absenderEmail: string;
}

export interface EmailTemplate {
  id: ID;
  name: string;
  /** Anlass, für den die Vorlage vorgeschlagen wird. */
  anlass: EmailAnlass;
  betreff: string;
  text: string;
}

export type EmailAnlass = 'erinnerung' | 'ueberfaellig' | 'freigabe' | 'uebergabe' | 'allgemein';

export const EMAIL_ANLASS_LABEL: Record<EmailAnlass, string> = {
  erinnerung: 'Erinnerung (Frist läuft)',
  ueberfaellig: 'Mahnung (überfällig)',
  freigabe: 'Freigabe erteilt',
  uebergabe: 'Übergabe / Versand',
  allgemein: 'Allgemein',
};

/* ------------------------------------------------------------------ */
/* Funktionen                                                          */
/* ------------------------------------------------------------------ */

/**
 * Seite, der eine Funktion im Terminnachweis zugerechnet wird: Wer einen
 * Verzug verursacht, steht auf einer dieser Seiten. `null` = nicht festgelegt.
 */
export type Seite = 'planer' | 'pruefer' | 'auftraggeber' | 'plm';

export const SEITE_LABEL: Record<Seite, string> = {
  planer: 'Planer',
  pruefer: 'Prüfer',
  auftraggeber: 'Auftraggeber',
  plm: 'PLM',
};

/**
 * Vorbelegung der Seite aus der Bezeichnung einer Funktion: das
 * Planlaufmanagement ist PLM, Planer und Fachspezialisten sind Planer,
 * prüfende Funktionen Prüfer, Bauvorlageberechtigte, Projektleitung und
 * Bauüberwachung der Auftraggeber. Alles andere bleibt offen (`null`).
 */
export function seiteAusFunktion(name: string): Seite | null {
  const n = name.trim();
  if (n.toLowerCase() === EIGENE_ROLLE.toLowerCase() || n.toLowerCase() === 'plm') return 'plm';
  if (/planer|fachspezialist/i.test(n)) return 'planer';
  if (istPrueferRolle(n)) return 'pruefer';
  if (/bauvorlage|projektleitung|bauüberwachung|bauueberwachung|auftraggeber/i.test(n)) return 'auftraggeber';
  return null;
}

/**
 * Projektübergreifend gepflegte Rolle. Beim Anlegen eines Projekts werden
 * diese Rollen als Projektfunktionen übernommen.
 */
export interface StandardRolle {
  id: ID;
  name: string;
  kuerzel: string;
  farbe: string;
  beschreibung: string;
  /**
   * Gewerk, zu dem die Funktion gehört. Jedes Gewerk hat eigene Funktionen:
   * „Fachplaner OLA“ und „Fachplaner KIB“ sind zwei verschiedene Funktionen.
   * `null` steht für übergreifende Funktionen, die einmal besetzt werden.
   */
  gewerk: string | null;
  /** Seite im Terminnachweis; null = nicht festgelegt (siehe seiteAusFunktion). */
  seite: Seite | null;
}

/** Übergreifende Funktionen gelten für alle Gewerke. */
export const UEBERGREIFEND = 'Übergreifend';

export function istUebergreifend(funktion: { gewerk: string | null }): boolean {
  return funktion.gewerk === null;
}

/**
 * Kürzel aus einer Bezeichnung: Anfangsbuchstaben der Wörter, bei einem
 * einzelnen Wort dessen erste drei Buchstaben.
 */
export function kuerzelAus(name: string): string {
  const woerter = name.trim().split(/\s+/).filter(Boolean);
  if (woerter.length === 0) return '';
  const roh = woerter.length > 1 ? woerter.map((w) => w[0]).join('') : woerter[0].slice(0, 3);
  return roh.slice(0, 4).toUpperCase();
}

/** Vollständige Bezeichnung einer Funktion inklusive Gewerk. */
export function funktionsName(funktion: { name: string; gewerk: string | null }): string {
  return funktion.gewerk ? `${funktion.name} ${funktion.gewerk}` : funktion.name;
}

/** Frei definierbare Projektrolle, z.B. "PLM" oder "Prüfstatiker". */
export interface Role {
  id: ID;
  projectId: ID;
  name: string;
  kuerzel: string;
  farbe: string;
  beschreibung: string;
  /** Gewerk der Funktion; null = übergreifend (siehe StandardRolle). */
  gewerk: string | null;
  /** Seite im Terminnachweis; null = nicht festgelegt (siehe StandardRolle). */
  seite: Seite | null;
  /** Zeitpunkt der letzten Änderung (ISO-Zeitstempel), vom Store gesetzt. */
  geaendertAm?: string;
}

/**
 * Besetzung einer Rolle durch eine Person. Bei Rollen mit Gewerkbezug gilt die
 * Zuordnung für ein bestimmtes Gewerk, sonst (gewerk = null) für alle.
 */
export interface Zuordnung {
  roleId: ID;
  gewerk: string | null;
}

export interface Contact {
  id: ID;
  projectId: ID;
  anrede: string;
  vorname: string;
  nachname: string;
  firma: string;
  email: string;
  telefon: string;
  /** Straße, PLZ und Ort – mehrzeilig. */
  anschrift: string;
  /** SharePoint-Ordner, in dem die Unterlagen für die Person bereitliegen (Versandmail). */
  sharepointEingang: string;
  /** SharePoint-Ordner, in den die Person ihre Unterlagen zurücklegt (Versandmail). */
  sharepointAusgang: string;
  /** Besetzte Rollen, ggf. je Gewerk. */
  zuordnungen: Zuordnung[];
  notiz: string;
  /**
   * Kontakt der angemeldeten Person. Er wird in jedem markierten Projekt
   * automatisch geführt und besetzt dort das Planlaufmanagement.
   */
  eigen: boolean;
  /** Zeitpunkt der letzten Änderung (ISO-Zeitstempel), vom Store gesetzt. */
  geaendertAm?: string;
}

/* ------------------------------------------------------------------ */
/* Pläne, Planpakete, Planverzeichnisse                                */
/* ------------------------------------------------------------------ */

export type DocumentKind = 'plan' | 'paket' | 'verzeichnis';

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  plan: 'Plan',
  paket: 'Planpaket',
  verzeichnis: 'Planverzeichnis',
};

/** Bezeichnung des Nummernfelds je Art. */
export const NUMMER_LABEL: Record<DocumentKind, string> = {
  plan: 'Plancodierung',
  paket: 'Name Planpaket',
  verzeichnis: 'Codierung',
};

/** Bezeichnung des Indexfelds je Art. */
export const INDEX_LABEL: Record<DocumentKind, string> = {
  plan: 'Index',
  paket: 'Index',
  verzeichnis: 'Ausgabe',
};

/**
 * Mitgelieferte Gewerke. Der gepflegte Bestand steht in `AppData.gewerke`;
 * dort lassen sich weitere Gewerke ergänzen.
 */
export const GEWERKE = ['EEA', 'KIB', 'LST', 'OLA', 'OSE', 'TK', 'VA'] as const;

/** Planungsphasen zur Auswahl; freie Eingabe bleibt zusätzlich möglich. */
export const PLANUNGSPHASEN = ['Entwurfsplanung', 'Genehmigungsplanung', 'Ausführungsplanung'] as const;

export interface PlanDocument {
  id: ID;
  projectId: ID;
  kind: DocumentKind;
  /**
   * Übergeordnetes Planverzeichnis eines Plans. Ob der Plan im Lauf des
   * Verzeichnisses mitläuft oder einen eigenen hat, bestimmen planlaufModus
   * des Verzeichnisses und eigenerLauf des Plans (siehe hatEigenenPlanlauf).
   * Pläne ohne Verzeichnis sind Einzelpläne mit eigenem Lauf.
   */
  parentId: ID | null;
  /**
   * Nur Planverzeichnisse: gebündelt durchläuft das Verzeichnis den Planlauf
   * und seine Pläne laufen mit; bei „einzeln“ hat jeder Plan einen eigenen
   * Lauf und das Verzeichnis ordnet nur. Fehlt die Angabe, gilt gebündelt.
   */
  planlaufModus?: PlanlaufModus;
  /**
   * Nur Pläne eines gebündelten Verzeichnisses: aus dessen Lauf herausgelöst,
   * der Plan hat seither einen eigenen Lauf.
   */
  eigenerLauf?: boolean;
  /**
   * Planpaket, dem der Eintrag zugeordnet ist. Reines Ordnungsmerkmal ohne
   * Auswirkung auf Planläufe und Fristen.
   */
  paketId: ID | null;
  /** Plancodierung bzw. Name des Pakets / Verzeichnisses. */
  nummer: string;
  titel: string;
  /** Index/Revision – standardmäßig leer. */
  index: string;
  gewerk: string;
  planungsphase: string;
  /** Soll-Termin für den Eingang der Unterlage. */
  eingangSoll: ISODate | null;
  /** Datum der Ausgabe – nur bei Planverzeichnissen geführt. */
  datum: ISODate | null;
  bemerkung: string;
  /** Zeitpunkt der letzten Änderung (ISO-Zeitstempel), vom Store gesetzt. */
  geaendertAm?: string;
}

/**
 * Einträge mit eigenem Planlauf: gebündelte Planverzeichnisse, Einzelpläne,
 * Pläne eines Verzeichnisses mit Plänen einzeln und herausgelöste Pläne.
 * Planpakete sind reine Ordnungsmerkmale; Pläne eines gebündelten
 * Verzeichnisses laufen im Lauf des Verzeichnisses mit.
 */
export function hatEigenenPlanlauf(
  doc: Pick<PlanDocument, 'kind' | 'parentId' | 'planlaufModus' | 'eigenerLauf'>,
  dokumente: Pick<PlanDocument, 'id' | 'planlaufModus'>[],
): boolean {
  if (doc.kind === 'paket') return false;
  if (doc.kind === 'verzeichnis') return verzeichnisGebuendelt(doc);
  if (doc.parentId === null) return true;
  if (doc.eigenerLauf) return true;
  // Ein Plan läuft einzeln, wenn sein Verzeichnis die Pläne einzeln führt.
  // Unbekanntes Verzeichnis: wie gebündelt – der Plan läuft dann nirgends.
  const eltern = dokumente.find((d) => d.id === doc.parentId);
  return eltern ? !verzeichnisGebuendelt(eltern) : false;
}

/** Wie ein Planverzeichnis den Planlauf durchläuft. */
export type PlanlaufModus = 'gebuendelt' | 'einzeln';

export const PLANLAUF_MODUS_LABEL: Record<PlanlaufModus, string> = {
  gebuendelt: 'Gebündelt',
  einzeln: 'Pläne einzeln',
};

/** Durchläuft das Verzeichnis selbst den Planlauf? Ohne Angabe: ja. */
export function verzeichnisGebuendelt(doc: Pick<PlanDocument, 'planlaufModus'>): boolean {
  return doc.planlaufModus !== 'einzeln';
}

/* ------------------------------------------------------------------ */
/* Workflows                                                       */
/* ------------------------------------------------------------------ */

/**
 * Art eines Schritts. Früher gab es zusätzlich „Sonstiges“ (davor „Versand“);
 * solche Schritte sind Aufgaben (`migriereTyp` in store/storage.ts).
 */
export type StepType = 'aufgabe' | 'entscheidung';

export const STEP_TYPE_LABEL: Record<StepType, string> = {
  aufgabe: 'Aufgabe',
  entscheidung: 'Entscheidung',
};

/**
 * Antwortmöglichkeit einer Entscheidung.
 * `ziel` bestimmt, mit welchem Schritt weitergemacht wird:
 * eine Schritt-ID, `'ende'` für das Ende des Laufs oder `null` für den
 * unmittelbar folgenden Schritt. In einem Zweig eines parallelen Blocks heißt
 * `'ende'` „Zweig beendet“ und `null` „nächster Schritt dieses Zweigs“
 * (siehe `nachfolger` in domain/ablauf.ts).
 */
export interface Antwort {
  id: ID;
  text: string;
  ziel: ID | 'ende' | null;
  /**
   * Die Antwort führt in Nacharbeit (z. B. „Nein“, „Nachreichung“): Der Weg
   * gilt im Terminnachweis als Nacharbeit, nicht als Regelablauf. Vorgabe:
   * die erste Antwort nicht, alle weiteren schon.
   */
  nacharbeit: boolean;
}

export const STANDARD_ANTWORTEN = ['Ja', 'Nein'];

/**
 * Nachweis, der bei erfolgreichem Abschluss eines Schritts zu erfassen ist.
 * Die Nummer wird am Schritt dokumentiert und in den Export übernommen.
 */
export type Nachweis = 'keine' | 'freigabe' | 'pruefbericht';

export const NACHWEIS_LABEL: Record<Nachweis, string> = {
  keine: 'kein Nachweis',
  freigabe: 'Freigabe-Nr.',
  pruefbericht: 'Prüfbericht-Nr.',
};

/** Prüfende Rollen verlangen regelmäßig einen Prüfbericht. */
export function istPrueferRolle(roleName: string): boolean {
  return /prüf|pruef/i.test(roleName);
}

/**
 * Zugehörigkeit eines Schritts zu einem parallelen Block. Schritte mit gleicher
 * `block`-Kennung stehen in der Liste zusammenhängend und nach `zweig` (0 … n−1)
 * sortiert, innerhalb eines Zweigs in Ablaufreihenfolge. Ein Block hat
 * mindestens zwei Zweige; Blöcke werden nicht verschachtelt. Betreten wird
 * stets der ganze Block, weiter geht es, wenn alle Zweige erledigt sind
 * (siehe domain/ablauf.ts).
 */
export interface Parallel {
  block: ID;
  zweig: number;
  /**
   * Name des Blocks (z. B. „Versand“); steht an jedem Schritt des Blocks
   * gleich, es gilt der erste nicht leere (siehe `namenVereinheitlichen` in
   * domain/ablauf.ts). Fehlt bzw. leer = ohne Namen.
   */
  name?: string;
  /** Name des Zweigs (z. B. „Prüfstatik“); steht ebenso an jedem Schritt des Zweigs. */
  zweigName?: string;
}

export interface ProcessTemplate {
  id: ID;
  /** null = globale Standard-Workflow, sonst projektspezifische Variante. */
  projectId: ID | null;
  name: string;
  beschreibung: string;
  herkunft: 'standard' | 'manuell';
  steps: ProcessTemplateStep[];
  /** Zeitpunkt der letzten Änderung (ISO-Zeitstempel), vom Store gesetzt. */
  geaendertAm?: string;
}

/** Anliegen eines Versandschritts – worum die Versandmail die nächste Person bittet. */
export type VersandAnliegen = 'freigabe' | 'vorpruefung' | 'pruefung' | 'genehmigung';

export const VERSAND_ANLIEGEN_LABEL: Record<VersandAnliegen, string> = {
  freigabe: 'Freigabe',
  vorpruefung: 'Vorprüfung',
  pruefung: 'Prüfung',
  genehmigung: 'Genehmigung',
};

/** Auswahl „Anliegen in der Versandmail“ (Workflow-Editor, Schritt anpassen). */
export const ANLIEGEN_OPTIONEN: { value: string; label: string }[] = [
  { value: '', label: 'keins' },
  ...Object.entries(VERSAND_ANLIEGEN_LABEL).map(([value, label]) => ({ value, label })),
];

/**
 * Anliegen der Versandschritte in den mitgelieferten Workflows (nach dem
 * Schrittnamen) – auch für die Umstellung vorhandener Bestände.
 */
export const VERSAND_ANLIEGEN_NACH_NAME: Record<string, VersandAnliegen> = {
  'PLM an BVB zur Freigabe': 'freigabe',
  'PLM an BVB zur Freigabe zur fachtechnischen Prüfung': 'vorpruefung',
  'PLM an Fachprüfer und Prüfstatiker': 'pruefung',
  'PLM an Planprüfer': 'pruefung',
  'PLM an PL zur Genehmigung': 'genehmigung',
};

/** Anliegen nach dem Schrittnamen (siehe VERSAND_ANLIEGEN_NACH_NAME), sonst null. */
export function versandAnliegenNachName(name: string): VersandAnliegen | null {
  return VERSAND_ANLIEGEN_NACH_NAME[(name ?? '').trim()] ?? null;
}

export interface ProcessTemplateStep {
  id: ID;
  name: string;
  typ: StepType;
  /** Verantwortliche Rolle für diesen Schritt. */
  roleName: string;
  /**
   * Frist in Tagen ab dem tatsächlichen Eingang – dem Abschluss des
   * vorherigen Schritts (bei parallelen Zweigen: aller Zweige).
   */
  fristTage: number;
  beschreibung: string;
  /** Nur bei Entscheidungen gefüllt. */
  antworten: Antwort[];
  /**
   * Nachfolger einer Aufgabe: eine Schritt-ID – auch ein früherer Schritt
   * (Rücksprung) –, `'ende'` oder `null` für den nächsten Schritt der Liste.
   * Im Zweig eines Blocks: `null` = nächster Schritt des Zweigs, `'ende'` =
   * Zweig beendet, ein Schritt außerhalb des Blocks = Ausstieg dorthin.
   * Bei Entscheidungen bestimmen die Antworten den Verlauf.
   */
  naechster: ID | 'ende' | null;
  /** Bei erfolgreichem Abschluss zu erfassender Nachweis. */
  nachweis: Nachweis;
  /**
   * Nach dem Erledigen fragen, ob die für den nächsten Schritt zuständige
   * Person per E-Mail informiert werden soll.
   */
  mailFrage: boolean;
  /** Vorzuschlagende E-Mail-Vorlage; null = die zum Anlass passende. */
  mailVorlageId: ID | null;
  /**
   * Versandschritt: Anliegen, um das die Versandmail an die danach zuständige
   * Person bittet ({{anliegen}}); null = kein Versandschritt.
   */
  versandAnliegen: VersandAnliegen | null;
  /** Zweig eines parallelen Blocks; null = außerhalb von Blöcken. */
  parallel: Parallel | null;
}

/* ------------------------------------------------------------------ */
/* Planlauf = laufende Instanz einer Workflow                      */
/* ------------------------------------------------------------------ */

export type RunStatus = 'laufend' | 'abgeschlossen' | 'abgebrochen';

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  laufend: 'Laufend',
  abgeschlossen: 'Abgeschlossen',
  abgebrochen: 'Abgebrochen',
};

/** Grundform des Abbruchs: ersatzlos oder mit neuem Index bzw. neuer Ausgabe. */
export type AbbruchArt =
  | 'ersatzlos'
  | 'neuer_index'
  | 'aufgeteilt'
  | 'gebuendelt'
  | 'neu_gestartet'
  | 'aus_sicherung';

export const ABBRUCH_ART_LABEL: Record<AbbruchArt, string> = {
  ersatzlos: 'ersatzlos',
  neuer_index: 'neuer Index / neue Ausgabe',
  // Kein Abbruch im eigentlichen Sinn: der gebündelte Lauf eines
  // Planverzeichnisses wurde in Einzelläufe seiner Pläne überführt.
  aufgeteilt: 'in Einzelläufe der Pläne aufgeteilt',
  // Ebenso kein Abbruch: der Einzellauf eines Plans ging wieder im gebündelten
  // Lauf seines Verzeichnisses auf.
  gebuendelt: 'wieder im Planlauf des Verzeichnisses gebündelt',
  // Ebenso kein Abbruch: der Planlauf begann mit einem (anderen) Workflow von
  // vorn; der bisherige Lauf bleibt zum Nachschlagen erhalten.
  neu_gestartet: 'mit geändertem Workflow neu gestartet',
  // Ebenso kein Abbruch: der Lauf wurde beim Abgleich mit einer Sicherung durch
  // deren Stand ersetzt und bleibt zum Nachschlagen erhalten.
  aus_sicherung: 'durch den Stand einer Sicherung ersetzt',
};

export interface PlanRun {
  id: ID;
  projectId: ID;
  documentId: ID;
  /** Vorlage, aus der der Lauf erzeugt wurde (nur Herkunftsnachweis). */
  templateId: ID | null;
  templateName: string;
  name: string;
  /** Index bzw. Ausgabe, für die dieser Lauf geführt wird. */
  index: string;
  start: ISODate;
  status: RunStatus;
  /** Begründung, falls der Lauf abgebrochen wurde. */
  abbruchGrund: string | null;
  abbruchDatum: ISODate | null;
  abbruchArt: AbbruchArt | null;
  /** Bei „neuer Index“: der Index bzw. die Ausgabe des Nachfolgelaufs. */
  abbruchNeuerIndex: string | null;
  /** Kopie der Schritte – individuelle Abweichungen ändern nur diese Instanz. */
  steps: RunStep[];
  bemerkung: string;
  /** Änderungsprotokoll, älteste Einträge zuerst. */
  protokoll: ProtokollEintrag[];
  /** Beim Start festgehaltener Plan (Grundlage des Terminnachweises). */
  basis: Basisplan | null;
}

export type StepStatus = 'offen' | 'laufend' | 'erledigt' | 'uebersprungen';

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  offen: 'Offen',
  laufend: 'Laufend',
  erledigt: 'Erledigt',
  uebersprungen: 'Übersprungen',
};

export interface RunStep {
  id: ID;
  name: string;
  typ: StepType;
  /** Verantwortliche Rolle. */
  roleName: string;
  /**
   * Konkret zuständige Person. Sie ergibt sich laufend aus
   * der Besetzung der Funktion im Projekt – ändert sich diese, zieht der
   * Planlauf nach.
   */
  contactId: ID | null;
  /**
   * Von Hand gesetzte Person. Sie bleibt stehen, auch wenn die Funktion im
   * Besetzung der Funktion anders lautet.
   */
  contactManuell: boolean;
  /** Frist in Tagen ab dem tatsächlichen Eingang (siehe ProcessTemplateStep). */
  fristTage: number;
  /**
   * Soll-Datum: Eingang + Frist, berechnet von recalcSollDaten. Bei künftigen
   * Schritten eine Prognose (nie vor heute). Von Hand überschreibbar (sollManuell).
   */
  sollDatum: ISODate | null;
  /** true, sobald der Nutzer das Soll-Datum manuell gesetzt hat. */
  sollManuell: boolean;
  istDatum: ISODate | null;
  /**
   * Fester, tatsächlicher Eingang: gesetzt, sobald der Schritt ansteht – aus dem
   * Abschluss der Vorgänger bzw. beim Rücksprung aus dem Ist des Auslösers –,
   * danach nicht mehr automatisch geändert. Nur bei anstehenden und erledigten
   * Schritten belegt.
   */
  eingangIst: ISODate | null;
  /** Der Eingang wurde bei der Umstellung des Bestands geschätzt. */
  eingangGeschaetzt: boolean;
  /** Berechnet (recalc): eingangIst bzw. der voraussichtliche Eingang; außerhalb des Verlaufs null. */
  eingangDatum: ISODate | null;
  /** Momentaufnahme beim Erledigen bzw. Überspringen. */
  abschlussInfo: AbschlussInfo | null;
  /** Frühere, durch Rücksprung oder erneute Bearbeitung beendete Durchläufe. */
  historie: SchrittDurchlauf[];
  /** Vorbereitete Erinnerungen (letzteErinnerung = Zeitpunkt der letzten). */
  erinnerungen: Erinnerung[];
  /** Von Hand zugeordnete Verzugstage des laufenden Durchlaufs. */
  verzugZuordnung: VerzugAnteil[];
  /** Nur Entscheidungen: Ursache der Nacharbeit, wenn mit einer Nacharbeit-Antwort erledigt. */
  nacharbeitSeite: Seite | null;
  /** Zweig eines parallelen Blocks (siehe ProcessTemplateStep). */
  parallel: Parallel | null;
  /**
   * Durchgang durch den Block: für alle Schritte eines Blocks gemeinsam erhöht,
   * wenn der ganze Block erneut betreten wird. Außerhalb von Blöcken 1.
   */
  blockDurchgang: number;
  status: StepStatus;
  /** Kennzeichnet vom Standard abweichende Schritte (individuelle Anpassung). */
  abweichung: boolean;
  bemerkung: string;
  /** Zeitpunkt der letzten vorbereiteten Erinnerung (ISO-Zeitstempel). */
  letzteErinnerung: string | null;
  /** Antwortmöglichkeiten bei Entscheidungen. */
  antworten: Antwort[];
  /** Gewählte Antwort; ohne Auswahl gilt die erste Möglichkeit. */
  gewaehlteAntwortId: ID | null;
  /** Nachfolger bei Aufgaben (siehe ProcessTemplateStep). */
  naechster: ID | 'ende' | null;
  /** Zählt, zum wievielten Mal der Schritt durchlaufen wird (Rücksprünge). */
  durchlauf: number;
  /** Bei erfolgreichem Abschluss zu erfassender Nachweis. */
  nachweis: Nachweis;
  /** Erfasste Freigabe- bzw. Prüfbericht-Nummer. */
  nachweisNummer: string | null;
  /** Nach dem Erledigen nach einer E-Mail an den nächsten Schritt fragen. */
  mailFrage: boolean;
  /** Vorzuschlagende E-Mail-Vorlage. */
  mailVorlageId: ID | null;
  /** Anliegen der Versandmail (siehe ProcessTemplateStep). */
  versandAnliegen: VersandAnliegen | null;
}

/** Momentaufnahme beim Erledigen bzw. Überspringen eines Schritts. */
export interface AbschlussInfo {
  roleName: string;
  /** Seite der Projektfunktion zum Zeitpunkt des Abschlusses. */
  seite: Seite | null;
  /** Name der zuständigen Person zum Zeitpunkt des Abschlusses. */
  kontaktName: string;
  /** Wer den Abschluss vermerkt hat. */
  bearbeiter: string;
  /** ISO-Zeitstempel. */
  zeitpunkt: string;
}

/** Ein beendeter Durchlauf eines Schritts – unveränderlich festgehalten. */
export interface SchrittDurchlauf {
  durchlauf: number;
  blockDurchgang: number;
  name: string;
  roleName: string;
  seite: Seite | null;
  contactId: ID | null;
  kontaktName: string;
  eingang: ISODate | null;
  eingangGeschaetzt: boolean;
  soll: ISODate | null;
  sollManuell: boolean;
  ist: ISODate | null;
  status: StepStatus;
  fristTage: number;
  /** Text der gewählten Antwort (Entscheidungen). */
  antwort: string | null;
  antwortNacharbeit: boolean;
  nacharbeitSeite: Seite | null;
  nachweisNummer: string | null;
  bemerkung: string;
  verzugZuordnung: VerzugAnteil[];
  grund: 'ruecksprung' | 'wieder_geoeffnet';
  /** ISO-Zeitstempel, zu dem der Durchlauf endete. */
  beendetAm: string;
}

/** Eine vorbereitete Erinnerung bzw. E-Mail zu einem Schritt. */
export interface Erinnerung {
  /** ISO-Zeitstempel. */
  zeitpunkt: string;
  contactId: ID | null;
  kontaktName: string;
  /** Verwendete Adresse(n). */
  an: string;
  betreff: string;
  anlass: EmailAnlass | null;
  weg: 'outlook' | 'web' | 'kopie' | 'sammel';
  /** Durchlauf des Schritts; null = unbekannt (vor Fassung 13). */
  durchlauf: number | null;
}

/** Von Hand einer Seite zugeordnete Verzugstage. */
export interface VerzugAnteil {
  seite: Seite;
  tage: number;
  grund: string;
  /** ISO-Zeitstempel. */
  zeitpunkt: string;
  bearbeiter: string;
}

/** Eintrag im Änderungsprotokoll eines Planlaufs. */
export interface ProtokollEintrag {
  /** ISO-Zeitstempel. */
  zeitpunkt: string;
  bearbeiter: string;
  stepId: ID | null;
  text: string;
  /** Eintrag stammt aus dem Abgleich mit einer Sicherung. */
  quelle?: 'import';
}

/** Beim Start eines Laufs festgehaltener Plan. */
export interface Basisplan {
  /** ISO-Zeitstempel. */
  festgelegtAm: string;
  /** Eingang Soll des Eintrags bzw. Start des Laufs. */
  anker: ISODate;
  /**
   * Eingang Soll des Eintrags bei der Festlegung (null = keiner, der Anker ist
   * der Start). Fehlt bei älteren Basisplänen – dann gilt: Anker ≠ Start.
   */
  eingangSoll?: ISODate | null;
  /** Ende im Regelweg; null, wenn es sich nicht berechnen ließ (Schleife). */
  planEnde: ISODate | null;
  arbeitstage: boolean;
  /** Fristen aller Schritte zum Zeitpunkt der Festlegung. */
  fristen: Record<ID, number>;
  grund: string;
}

/** Vermerk über ein gelöschtes Element (für den Abgleich mit Sicherungen). */
export interface Loeschvermerk {
  id: ID;
  art: 'projekt' | 'eintrag' | 'lauf' | 'kontakt' | 'funktion' | 'workflow' | 'gewerk' | 'emailVorlage';
  projectId: ID | null;
  bezeichnung: string;
  /** ISO-Zeitstempel. */
  am: string;
  bearbeiter: string;
}

/* ------------------------------------------------------------------ */
/* Gesamter lokaler Datenbestand                                       */
/* ------------------------------------------------------------------ */

export interface AppData {
  version: number;
  /** Fassung der übernommenen Stammdaten (siehe STAMMDATEN_VERSION). */
  stammdatenVersion: number;
  bearbeiter: Bearbeiter;
  /** Gepflegte Gewerke – mitgeliefert und selbst ergänzt. */
  gewerke: string[];
  /** Projektübergreifende Funktionen. */
  standardRollen: StandardRolle[];
  /** Projektübergreifende E-Mail-Vorlagen (Reiter „Vorlagen“). */
  emailVorlagen: EmailTemplate[];
  projects: Project[];
  roles: Role[];
  contacts: Contact[];
  documents: PlanDocument[];
  templates: ProcessTemplate[];
  runs: PlanRun[];
  /** Vermerke über gelöschte Elemente. */
  geloescht: Loeschvermerk[];
}
