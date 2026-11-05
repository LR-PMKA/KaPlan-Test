/**
 * Projektbeteiligte aus einer Excel- oder CSV-Liste. Je Zeile eine Person mit
 * Funktion (und wahlweise Gewerk). Die Kopfzeile wird in den ersten Zeilen
 * gesucht – so lässt sich auch die Excel-Ausgabe der Beteiligtenliste mit
 * ihren Titelzeilen wieder einlesen.
 *
 * Funktionen werden über Bezeichnung und Gewerk, ersatzweise über die volle
 * Bezeichnung („Fachplanung LST“) oder das Kürzel gefunden; unbekannte werden
 * beim Übernehmen angelegt. Personen gleichen Namens im Projekt werden
 * aktualisiert statt doppelt angelegt.
 */
import { spaltenZuordnen } from '../../../shared/xlsxLesen';
import {
  UEBERGREIFEND,
  funktionsName,
  kuerzelAus,
  personName,
  type Beteiligter,
  type Funktion,
  type ID,
  type ProjektsteuerungDaten,
} from './types';

/** Spalten der Vorlage und der Excel-Ausgabe – in dieser Reihenfolge. */
export const BETEILIGTE_KOPF = [
  'Funktion',
  'Gewerk',
  'Kürzel',
  'Anrede',
  'Vorname',
  'Nachname',
  'Firma / Büro',
  'E-Mail',
  'Telefon',
  'Mobil',
  'Anschrift',
  'Notiz',
];

/** Erkannte Schreibweisen der Spaltenüberschriften. */
const SPALTEN: Record<string, string[]> = {
  funktion: ['Funktion', 'Rolle', 'Aufgabe im Projekt'],
  gewerk: ['Gewerk', 'Fachbereich'],
  kuerzel: ['Kürzel', 'Kurzzeichen', 'Kurz'],
  anrede: ['Anrede'],
  vorname: ['Vorname'],
  nachname: ['Nachname', 'Familienname', 'Zuname'],
  name: ['Name', 'Person', 'Ansprechpartner'],
  firma: ['Firma / Büro', 'Firma', 'Büro', 'Unternehmen', 'Organisation'],
  email: ['E-Mail', 'Email', 'Mail', 'E-Mail-Adresse'],
  telefon: ['Telefon', 'Tel', 'Tel.', 'Telefonnummer', 'Festnetz'],
  mobil: ['Mobil', 'Mobiltelefon', 'Handy'],
  anschrift: ['Anschrift', 'Adresse'],
  notiz: ['Notiz', 'Bemerkung', 'Bemerkungen', 'Hinweis'],
};

type Personenangaben = Omit<Beteiligter, 'id' | 'projektId' | 'funktionId'>;

export interface ImportZeile {
  person: Personenangaben;
  /** Gefundene Funktion; sonst Bezeichnung und Gewerk einer neu anzulegenden. */
  funktion: { id: ID | null; name: string; gewerk: string | null };
  /** Person gleichen Namens im Projekt, die aktualisiert wird. */
  vorhandenId: ID | null;
  hinweise: string[];
}

const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** „Berger, Anna“ oder „Dr. Anna Berger“ in Vor- und Nachname. */
function nameTeilen(name: string): { vorname: string; nachname: string } {
  const text = name.trim().replace(/\s+/g, ' ');
  if (text.includes(',')) {
    const [nach, ...vor] = text.split(',');
    return { vorname: vor.join(',').trim(), nachname: nach.trim() };
  }
  const teile = text.split(' ');
  return { vorname: teile.slice(0, -1).join(' '), nachname: teile[teile.length - 1] ?? '' };
}

/**
 * Funktion zu Bezeichnung und Gewerk. Ohne Gewerk zählt die volle
 * Bezeichnung („Fachplanung LST“ oder eine übergreifende Funktion), dann eine
 * eindeutige Bezeichnung in irgendeinem Gewerk, zuletzt das Kürzel.
 */
export function funktionFinden(funktionen: Funktion[], name: string, gewerk: string | null): Funktion | undefined {
  if (!name.trim()) return undefined;
  if (gewerk) {
    return (
      funktionen.find((f) => gleich(f.name, name) && gleich(f.gewerk ?? '', gewerk)) ??
      funktionen.find((f) => gleich(funktionsName(f), name))
    );
  }
  const voll = funktionen.find((f) => gleich(funktionsName(f), name));
  if (voll) return voll;
  const gleicheBezeichnung = funktionen.filter((f) => gleich(f.name, name));
  if (gleicheBezeichnung.length === 1) return gleicheBezeichnung[0];
  return funktionen.find((f) => f.kuerzel && gleich(f.kuerzel, name));
}

/**
 * Liest die Zeilen einer Tabelle. Wirft einen Fehler mit verständlicher
 * Meldung, wenn keine Kopfzeile mit Nach- oder Gesamtname zu finden ist.
 */
export function beteiligteLesen(zeilen: string[][], daten: ProjektsteuerungDaten, projektId: ID): ImportZeile[] {
  const kopfIndex = zeilen
    .slice(0, 15)
    .findIndex((z) => {
      const s = spaltenZuordnen(z, SPALTEN);
      return s.nachname !== undefined || s.name !== undefined;
    });
  if (kopfIndex < 0) {
    throw new Error('In der Datei fehlt eine Spalte „Nachname“ oder „Name“.');
  }
  const spalten = spaltenZuordnen(zeilen[kopfIndex], SPALTEN);
  const wert = (z: string[], feld: string) => (spalten[feld] !== undefined ? (z[spalten[feld]] ?? '').trim() : '');
  const imProjekt = daten.beteiligte.filter((b) => b.projektId === projektId);
  const gesehen = new Set<string>();
  const ergebnis: ImportZeile[] = [];

  for (const z of zeilen.slice(kopfIndex + 1)) {
    if (z.every((f) => !f.trim())) continue;
    let vorname = wert(z, 'vorname');
    let nachname = wert(z, 'nachname');
    if (!nachname && wert(z, 'name')) ({ vorname, nachname } = nameTeilen(wert(z, 'name')));
    if (!nachname) continue;

    const gewerkText = wert(z, 'gewerk');
    const gewerk = gewerkText && !gleich(gewerkText, UEBERGREIFEND) ? gewerkText : null;
    const funktionText = wert(z, 'funktion');
    const gefunden = funktionFinden(daten.funktionen, funktionText, gewerk);
    const kuerzel = wert(z, 'kuerzel');
    const person: Personenangaben = {
      anrede: wert(z, 'anrede'),
      vorname,
      nachname,
      firma: wert(z, 'firma'),
      // Gleicht das Kürzel dem der Funktion, gilt es ohnehin – es bleibt leer.
      kuerzel: gefunden && gleich(kuerzel, gefunden.kuerzel) ? '' : kuerzel,
      email: wert(z, 'email'),
      telefon: wert(z, 'telefon'),
      mobil: wert(z, 'mobil'),
      anschrift: wert(z, 'anschrift'),
      notiz: wert(z, 'notiz'),
    };
    const name = personName(person).toLowerCase();
    const vorhanden = imProjekt.find((b) => personName(b).toLowerCase() === name);
    const hinweise: string[] = [];
    if (gesehen.has(name)) hinweise.push('doppelt in der Liste');
    gesehen.add(name);
    if (vorhanden) hinweise.push('wird aktualisiert');
    if (!funktionText) hinweise.push('ohne Funktion');
    else if (!gefunden) {
      hinweise.push(
        gewerk && !daten.gewerke.some((g) => gleich(g, gewerk)) ? 'neue Funktion, neues Gewerk' : 'neue Funktion',
      );
    }
    ergebnis.push({
      person,
      funktion: gefunden
        ? { id: gefunden.id, name: gefunden.name, gewerk: gefunden.gewerk }
        : { id: null, name: funktionText, gewerk },
      vorhandenId: vorhanden?.id ?? null,
      hinweise,
    });
  }
  return ergebnis;
}

/** Schlüssel einer neu anzulegenden Funktion – je Bezeichnung und Gewerk einmal. */
export const funktionsSchluessel = (f: { name: string; gewerk: string | null }) =>
  `${f.name.trim().toLowerCase()}|${(f.gewerk ?? '').toLowerCase()}`;

/** Werte einer neu anzulegenden Funktion. */
export function neueFunktion(name: string, gewerk: string | null, farbe: string): Omit<Funktion, 'id'> {
  return { name: name.trim(), gewerk, kuerzel: kuerzelAus(name), farbe, beschreibung: '' };
}
