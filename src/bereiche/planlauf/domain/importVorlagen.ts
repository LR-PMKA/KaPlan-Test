/**
 * Gemeinsame Beschreibung der Excel-Vorlagen für den Upload von Plänen und
 * Kontakten.
 *
 * Hier stehen die erwarteten Spalten, die erkannten Schreibweisen und die
 * Beispielzeilen. Sowohl die Import-Dialoge als auch die Seite „Vorlagen“
 * greifen darauf zu, damit heruntergeladene Vorlage und eingelesene Datei
 * immer zusammenpassen.
 */
import { dateiLaden, xlsxErzeugen } from '../../../shared/xlsx';

/* ------------------------------------------------------------------ */
/* Pläne, Planverzeichnisse und Planpakete                             */
/* ------------------------------------------------------------------ */

/** Spalten der Planvorlage in der Reihenfolge der Datei. */
export const PLAN_KOPFZEILE = [
  'Art',
  'Plancodierung / Name',
  'Titel',
  'Index/Ausgabe',
  'Gewerk',
  'Planungsphase',
  'Planpaket',
  'Planverzeichnis',
  'Eingang Soll',
  'Datum Ausgabe',
  'Workflow',
  'Bemerkung',
];

/** Erkannte Schreibweisen je Feld; die erste ist die der Vorlage. */
export const PLAN_SPALTEN: Record<string, string[]> = {
  art: ['Art', 'Typ'],
  nummer: [
    'Plancodierung / Name',
    'Plancodierung/Name Planpaket / Name Plan VZ',
    'Plancodierung',
    'Name Planpaket',
    'Name PlanVZ',
    'Name Plan VZ',
    'Codierung',
    'Nummer',
    'Name',
  ],
  titel: ['Titel', 'Bezeichnung'],
  index: ['Index/Ausgabe', 'Index', 'Ausgabe', 'Revision'],
  gewerk: ['Gewerk'],
  planungsphase: ['Planungsphase', 'Phase'],
  paket: ['Planpaket', 'Paket'],
  parent: ['Planverzeichnis', 'Übergeordnet', 'Gehört zu'],
  eingangSoll: ['Eingang Soll', 'Eingang', 'Soll'],
  datum: ['Datum Ausgabe', 'Ausgabedatum', 'Datum'],
  workflow: ['Workflow', 'Prozesskette', 'Kette'],
  bemerkung: ['Bemerkung', 'Notiz'],
};

export const PLAN_BEISPIELE: string[][] = [
  ['Planpaket', 'PP-Nordkanal', 'Eisenbahnüberführung Nordkanal', '', 'KIB', '', '', '', '', '', '', 'Bündelt die Unterlagen zum Bauwerk'],
  ['Planverzeichnis', 'NK-KIB-PV-001', 'Planverzeichnis Überbau', 'C', 'KIB', 'Ausführungsplanung', 'Eisenbahnüberführung Nordkanal', '', '14.10.2026', '01.10.2026', 'VVBau mit Prüfstatik', ''],
  ['Plan', 'NK-KIB-EÜ-001-GR', 'Grundriss Überbau', 'C', 'KIB', 'Ausführungsplanung', '', 'NK-KIB-PV-001', '14.10.2026', '', '', 'läuft im Verzeichnis mit'],
  ['Plan', 'NK-LST-SP-102', 'Signallageplan Bereich Nord', 'B', 'LST', 'Ausführungsplanung', 'Bahnübergang Süd', '', '30.10.2026', '', 'VVBau STE', 'Einzelplan mit eigenem Planlauf'],
];

/** Erläuterung der Spalten – auf der Seite „Vorlagen“ und im Import. */
export const PLAN_HINWEISE: [string, string][] = [
  ['Art', 'Plan, Planverzeichnis oder Planpaket'],
  ['Plancodierung / Name', 'Plancodierung des Plans, Codierung des Planverzeichnisses bzw. Name des Pakets'],
  ['Index/Ausgabe', 'Index des Plans bzw. Ausgabe des Planverzeichnisses'],
  ['Planpaket', 'Name des Pakets – ist es noch nicht angelegt, entsteht es beim Import'],
  ['Planverzeichnis', 'Name oder Codierung des Verzeichnisses, in dem der Plan mitläuft; fehlt es, wird es angelegt'],
  ['Eingang Soll', 'Soll-Termin des ersten Prozessschritts'],
  ['Datum Ausgabe', 'nur bei Planverzeichnissen'],
  ['Workflow', 'Name eines hinterlegten Workflows; leer = der beim Import gewählte. Der Planlauf startet beim Import immer'],
];

export function planVorlageLaden(): void {
  dateiLaden(
    xlsxErzeugen([{ name: 'Pläne', zeilen: [PLAN_KOPFZEILE, ...PLAN_BEISPIELE] }]),
    'Vorlage-Planliste.xlsx',
  );
}

/* ------------------------------------------------------------------ */
/* Funktion samt Besetzung (Reiter „Funktion“)                        */
/* ------------------------------------------------------------------ */

export const ROLLEN_KOPFZEILE = [
  'Gewerk',
  'Funktion',
  'Kürzel',
  'Anrede',
  'Vorname',
  'Name',
  'Firma',
  'Telefon',
  'Email',
  'Straße',
  'Nr.',
  'PLZ',
  'Ort',
  'Notiz',
  'SharePoint Eingang',
  'SharePoint Ausgang',
];

export const ROLLEN_SPALTEN: Record<string, string[]> = {
  gewerk: ['Gewerk'],
  funktion: ['Funktion', 'Rolle'],
  kuerzel: ['Kürzel', 'Kuerzel', 'Abkürzung'],
  anrede: ['Anrede'],
  vorname: ['Vorname'],
  nachname: ['Name', 'Nachname'],
  firma: ['Firma', 'Büro', 'Unternehmen'],
  telefon: ['Telefon', 'Tel', 'Telefonnummer'],
  email: ['Email', 'E-Mail', 'Mail'],
  strasse: ['Straße', 'Strasse'],
  hausnummer: ['Nr.', 'Nr', 'Hausnummer'],
  plz: ['PLZ', 'Postleitzahl'],
  ort: ['Ort'],
  notiz: ['Notiz', 'Bemerkung'],
  sharepointEingang: ['SharePoint Eingang', 'SharePoint-Link Eingang', 'Link Eingang'],
  sharepointAusgang: ['SharePoint Ausgang', 'SharePoint-Link Ausgang', 'Link Ausgang'],
};

export const ROLLEN_BEISPIELE: string[][] = [
  ['KIB', 'Fachplaner', 'FP', 'Frau', 'Katrin', 'Berger', 'Ingenieurbüro Berger', '+49 40 998877-12', 'k.berger@example.de', 'Billstraße', '88', '20539', 'Hamburg', 'Fachplanung Ingenieurbau', 'https://example.sharepoint.com/sites/Nordkreuz-KIB/Eingang', 'https://example.sharepoint.com/sites/Nordkreuz-KIB/Ausgang'],
  ['LST', 'Fachtechnischer Prüfer', 'PSV', 'Herr', 'Dietmar', 'Krause', 'Prüfstelle Krause', '+49 4131 309-0', 'd.krause@example.de', 'Am Ochsenmarkt', '1', '21335', 'Lüneburg', '', '', ''],
  ['Übergreifend', 'Projektleitung', 'PL', 'Frau', 'Sabine', 'Ortmann', 'Projektleitung', '+49 40 123456-01', 's.ortmann@example.de', 'Hafenstraße', '12', '20359', 'Hamburg', '', '', ''],
  ['BÜ', 'Fachplaner', 'FP', 'Herr', 'Jens', 'Harms', 'Harms Planung', '+49 40 556677-3', 'j.harms@example.de', 'Deichweg', '4', '21079', 'Hamburg', 'Gewerk und Funktion werden beim Import angelegt', '', ''],
];

export const ROLLEN_HINWEISE: [string, string][] = [
  ['Gewerk', 'Gewerk der Funktion; „Übergreifend“ für gewerkübergreifende Funktionen. Unbekannte Gewerke werden angelegt'],
  ['Funktion', 'Bezeichnung der Funktion, z.B. Fachplaner – ist sie im Projekt nicht vorhanden, wird sie angelegt. Planlaufmanagement übernimmt stets die angemeldete Person und wird nicht besetzt'],
  ['Kürzel', 'nur für neu angelegte Funktionen; leer = aus der Bezeichnung gebildet'],
  ['Name', 'Nachname der Person – einzige Pflichtangabe der Besetzung'],
  ['Straße · Nr. · PLZ · Ort', 'werden zur Anschrift zusammengefasst'],
  ['SharePoint Eingang · Ausgang', 'Links zu den SharePoint-Ordnern der Person für die Versandmail; leere Zellen lassen vorhandene Links unverändert'],
];

export function rollenVorlageLaden(): void {
  dateiLaden(
    xlsxErzeugen([{ name: 'Funktion', zeilen: [ROLLEN_KOPFZEILE, ...ROLLEN_BEISPIELE] }]),
    'Vorlage-Funktion.xlsx',
  );
}
