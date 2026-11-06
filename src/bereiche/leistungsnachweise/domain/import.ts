/**
 * Excel-Import der Leistungen aus der Zeiterfassung. Je Zeile eine Buchung mit
 * Datum, Mitarbeiter, Leistungstext, Stunden, Projekt („K2476: …“) und
 * Projektelement. Eine Datei kann mehrere Projekte und Mitarbeiter enthalten;
 * jede Leistung landet in ihrem Projekt und dort im Nachweis ihres Zeitraums.
 *
 * Ablauf: `importLesen` liest die Zeilen eines Blatts, `importPlanen` rechnet
 * daraus eine Vorschau samt Plan (rein, ohne Zufall – alle Kennungen über
 * `neueId`), `importAnwenden` übernimmt den Plan in den Bestand.
 *
 * Jeder übernimmt nur seine eigenen Zeilen (`ImportOptionen.angemeldetId`);
 * Zeilen anderer Mitarbeiter werden mit dem Grund „anderer Mitarbeiter“
 * übersprungen. Nur das Controlling übernimmt einen Sammel-Export aller
 * Mitarbeiter der Datei (`alleMitarbeiter`) und legt dabei unbekannte an.
 * Steht in der Datei Kürzel und Name („MM: Mustermann, Max“), müssen beide
 * passen – ein gleiches Kürzel mit anderem Namen ist eine andere Person.
 *
 * Spalte J (Projektelement) gibt den Abschnitt an: Fehlende Abschnitte legt der
 * Import selbst an und ordnet jede neue Leistung ihrem Abschnitt zu.
 *
 * Leistungen anderer Mitarbeiter werden nie verändert: Doppelte Zeilen
 * (gleiche Person, gleiches Projekt, Datum, Stunden, Text und – gegenüber
 * früheren Importen – Projektelement) werden übersprungen, und „ersetzen“
 * entfernt nur frühere Importe derselben Person in den Projekten der Datei
 * und in ihrem Datumsbereich der Datei.
 */
import { datumLesen, spaltenZuordnen } from '../../../shared/xlsxLesen';
import { nachweiseErgaenzen, nachweisFuer, nachweisTitel, textSchluessel } from './nachweis';
import {
  kuerzelAus,
  mitarbeiterName,
  type Abschnitt,
  type ID,
  type ISODate,
  type Leistung,
  type Leistungsnachweis,
  type LeistungsnachweisDaten,
  type Mitarbeiter,
  type Projekt,
} from './types';
import { istDatum, runden } from './zeitraum';

/* ------------------------------------------------------------------ */
/* Lesen                                                               */
/* ------------------------------------------------------------------ */

export interface ImportPosten {
  /** Zeile in der Datei (1-basiert wie in Excel – auch nach leeren Zeilen, `GeleseneTabelle.zeilenNummern`). */
  zeile: number;
  datum: ISODate;
  text: string;
  stunden: number;
  /** „K2476“ (Großbuchstaben, ohne Leerzeichen). */
  projektNummer: string;
  /** „PS / PLM, Neubau Hp Aalen West“ */
  projektName: string;
  /** Roh, „01: Neustadt Nord, Strecke 3436“. */
  projektelement: string;
  /** Roh, „MM: Mustermann, Max“ oder ''. */
  mitarbeiterText: string;
}

/** Zeile der Datei, die nicht übernommen wird, mit Grund und Text zur Anzeige. */
export interface Uebersprungen {
  zeile: number;
  grund: string;
  text: string;
}

/** Ergebnis von `importLesen`. */
export interface ImportGelesen {
  posten: ImportPosten[];
  uebersprungen: Uebersprungen[];
  blatt: string;
}

/** Felder, die der Import aus einer Zeile liest. */
export type ImportFeld = 'datum' | 'mitarbeiter' | 'text' | 'stunden' | 'projekt' | 'projektelement';

/** Erkannte Spaltenüberschriften (für Hinweise in der Oberfläche). */
export const IMPORT_SPALTEN: Record<ImportFeld, string[]> = {
  datum: ['Buchungsdatum', 'Datum', 'Leistungsdatum', 'Tag'],
  mitarbeiter: ['Mitarbeiter', 'Mitarbeiterin', 'Bearbeiter', 'Name', 'Person'],
  text: ['Buchungstext', 'Leistungstext', 'Text', 'Tätigkeit', 'Beschreibung', 'Leistung'],
  stunden: ['Menge ext.', 'Stunden', 'Std.', 'Std', 'Menge', 'Dauer', 'Aufwand'],
  projekt: ['Projekt', 'Projektnummer', 'Projekt-Nr.', 'Projektnr.'],
  projektelement: ['Projektelement', 'Abschnitt', 'Element'],
};

/** Feste Spalten, wenn keine Überschrift erkannt wird: A, B, E, F, I, J. */
export const IMPORT_STANDARDSPALTEN: Record<ImportFeld, number> = {
  datum: 0,
  mitarbeiter: 1,
  text: 4,
  stunden: 5,
  projekt: 8,
  projektelement: 9,
};

/**
 * Meldung, wenn eine Datei gar nicht zum Import passt – weder eine Kopfzeile
 * noch eine einzige Zeile mit Datum und Stunden (wörtlich).
 */
export const IMPORT_FALSCHE_DATEI =
  'Die Datei sieht nicht wie ein Export der Zeiterfassung aus – erwartet werden Buchungsdatum (A), Buchungstext (E), Menge (F) und Projekt (I).';

/** Meldung, wenn die Datei Leistungen enthält, aber keine der angemeldeten Person (wörtlich). */
export function keineEigenenLeistungen(name: string): string {
  return `Die Datei enthält keine Leistungen von ${name}. Übernommen werden nur eigene Leistungen.`;
}

/**
 * Zahl aus einer Zelle: „6.5“ (Excel), „6,5“ und „1.234,5“ (deutsch) sowie
 * „1,234.5“ (englisch). Ein einzelner Punkt oder ein einzelnes Komma trennt die
 * Nachkommastellen; null, wenn keine Zahl.
 */
export function zahlLesen(wert: string): number | null {
  let t = wert.replace(/[\s ]/g, '');
  if (!t) return null;
  const komma = t.lastIndexOf(',');
  const punkt = t.lastIndexOf('.');
  if (komma >= 0 && punkt >= 0) {
    // Das zuletzt stehende Zeichen trennt die Nachkommastellen
    t = komma > punkt ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (komma >= 0) {
    t = t.indexOf(',') === komma ? t.replace(',', '.') : t.replace(/,/g, '');
  } else if (punkt >= 0 && t.indexOf('.') !== punkt) {
    t = t.replace(/\./g, '');
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null;
  const zahl = Number(t);
  return Number.isFinite(zahl) ? zahl : null;
}

/** Projektnummer zum Vergleichen: ohne Leerzeichen, in Großbuchstaben. */
export function nummerNormal(nummer: string): string {
  return nummer.replace(/\s+/g, '').toUpperCase();
}

/** Kürzel zum Vergleichen: ohne Leerraum, ohne Rücksicht auf Groß-/Kleinschreibung. */
export function kuerzelNormal(kuerzel: string): string {
  return kuerzel.replace(/\s+/g, '').toLowerCase();
}

/**
 * Ein noch freies Kürzel: „LR“, sonst „LR2“, „LR3“ …; ist `basis` leer, „MA“.
 * So legen der Import und der Mitarbeiterdialog neue Personen an.
 */
export function kuerzelFrei(basis: string, vorhandene: Pick<Mitarbeiter, 'kuerzel'>[]): string {
  const vergeben = new Set(vorhandene.map((m) => kuerzelNormal(m.kuerzel)));
  const grund = basis.trim() || 'MA';
  let k = grund;
  for (let n = 2; vergeben.has(kuerzelNormal(k)); n++) k = `${grund}${n}`;
  return k;
}

/** „K2476: PS / PLM, Neubau Hp Aalen West“ → { nummer: 'K2476', name: 'PS / PLM, Neubau Hp Aalen West' }; null, wenn keine Nummer. */
export function projektAusText(text: string): { nummer: string; name: string } | null {
  const m = /^\s*([A-Za-z]{1,3}\s*-?\s*\d{3,})(?![\dA-Za-z])\s*(?:[:\-–—]\s*)?([\s\S]*)$/.exec(text);
  if (!m) return null;
  return { nummer: nummerNormal(m[1]), name: m[2].trim() };
}

/** Mitarbeiterangabe der Datei mit dem Vermerk, ob Kürzel bzw. Name darin standen. */
interface MitarbeiterAngabe {
  kuerzel: string;
  vorname: string;
  nachname: string;
  /** Das Kürzel stand in der Datei („MM: …“ oder nur „MM“). */
  mitKuerzel: boolean;
  /** Ein Name stand in der Datei. */
  mitName: boolean;
}

function mitarbeiterLesen(text: string): MitarbeiterAngabe | null {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  const mitDoppelpunkt = /^([\p{L}\d]{1,6})\s*:\s*(.*)$/u.exec(t);
  let kuerzel = mitDoppelpunkt ? mitDoppelpunkt[1].toUpperCase() : '';
  const name = mitDoppelpunkt ? mitDoppelpunkt[2].trim() : t;
  let vorname = '';
  let nachname = '';
  if (name.includes(',')) {
    const [nach, ...vor] = name.split(',');
    nachname = nach.trim();
    vorname = vor.join(',').trim();
  } else if (name) {
    const teile = name.split(' ');
    nachname = teile.pop() ?? '';
    vorname = teile.join(' ');
  }
  // Nur ein Kürzel, etwa „MM“
  const nurKuerzel = !kuerzel && !vorname && /^[\p{Lu}\d]{1,4}$/u.test(nachname);
  if (nurKuerzel) kuerzel = nachname;
  const mitName = !nurKuerzel && !!(vorname || nachname);
  if (!nachname) nachname = kuerzel;
  if (!kuerzel) kuerzel = kuerzelAus(`${vorname} ${nachname}`);
  return { kuerzel, vorname, nachname, mitKuerzel: !!mitDoppelpunkt || nurKuerzel, mitName };
}

/**
 * Teile eines Namens zum Vergleichen: klein, Umlaute und ß ausgeschrieben
 * („ö“ ≙ „oe“), ohne Akzente und Satzzeichen, nach dem Alphabet – so passt
 * „Mustermann, Max“ zu „Max Mustermann“.
 */
function namensSchluessel(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Passt der Name aus der Datei zum Mitarbeiter? Vor- und Nachname in beliebiger
 * Reihenfolge (`namensSchluessel`); nennt die Datei nur einen Nachnamen, genügt dieser.
 */
export function namePasst(angabe: { vorname: string; nachname: string }, m: Pick<Mitarbeiter, 'vorname' | 'nachname'>): boolean {
  const datei = namensSchluessel(`${angabe.vorname} ${angabe.nachname}`);
  if (!datei) return false;
  if (datei === namensSchluessel(`${m.vorname} ${m.nachname}`)) return true;
  return !angabe.vorname.trim() && namensSchluessel(angabe.nachname) === namensSchluessel(m.nachname);
}

/**
 * Mitarbeiter zu einer Angabe der Datei: Kürzel und Name → beide müssen passen,
 * sonst zählt der Name allein (die Person führt in KaPlan ein anderes Kürzel);
 * nur ein Kürzel → über das Kürzel; nur ein Name → über den Namen. `kuerzelVon`
 * ist die Person, der das Kürzel gehört, wenn der Name nicht zu ihr passt.
 */
export function mitarbeiterZuordnen(
  personen: Mitarbeiter[],
  text: string,
): { person: Mitarbeiter | null; kuerzelVon: Mitarbeiter | null } {
  const angabe = mitarbeiterLesen(text);
  if (!angabe) return { person: null, kuerzelVon: null };
  const zumKuerzel = angabe.mitKuerzel
    ? (personen.find((m) => kuerzelNormal(m.kuerzel) === kuerzelNormal(angabe.kuerzel)) ?? null)
    : null;
  if (!angabe.mitName) return { person: zumKuerzel, kuerzelVon: null };
  if (zumKuerzel && namePasst(angabe, zumKuerzel)) return { person: zumKuerzel, kuerzelVon: null };
  const gleicherName = personen.filter((m) => namePasst(angabe, m));
  const person = gleicherName.find((m) => m.aktiv) ?? gleicherName[0] ?? null;
  return { person, kuerzelVon: person ? null : zumKuerzel };
}

/** „MM: Mustermann, Max“ → { kuerzel: 'MM', vorname: 'Max', nachname: 'Mustermann' }; „Max Mustermann“ → Kürzel aus Initialen. */
export function mitarbeiterAusText(text: string): { kuerzel: string; vorname: string; nachname: string } | null {
  const m = mitarbeiterLesen(text);
  return m ? { kuerzel: m.kuerzel, vorname: m.vorname, nachname: m.nachname } : null;
}

/**
 * „01: Neustadt Nord, Strecke 3436“ → { kennung: '01', name: 'Neustadt Nord, Strecke 3436' }; „01_buchen“ → { kennung: '01', name: 'buchen' }.
 * Ohne erkennbare Nummer ist der ganze Text die Kennung.
 */
export function projektelementTeilen(text: string): { kennung: string; name: string } {
  const t = text.trim();
  const m = /^([A-Za-z]{0,3}\d+(?:\.\d+)*)(?:\s*[:_\-–]\s*|\s+|$)([\s\S]*)$/.exec(t);
  if (!m) return { kennung: t, name: t };
  return { kennung: m[1], name: m[2].trim() };
}

/** Kennung zum Vergleichen (Abschnitte, Dubletten). */
export const kennungNormal = (kennung: string) => kennung.trim().toLowerCase();

/**
 * Neue Abschnitte zu Kennungen aus Projektelementen – nach Kennung sortiert,
 * Spaltenkopf „Abschn.<Zahl>“ (bei „01“ „Abschn.1“, eindeutig im Projekt),
 * Bezeichnung aus dem Projektelement.
 */
export function abschnitteAnlegen(
  vorhandene: Abschnitt[],
  teile: { kennung: string; name: string }[],
  neueId: (prefix: string) => ID,
): Abschnitt[] {
  const alle = [...vorhandene];
  const neu: Abschnitt[] = [];
  for (const teil of [...teile].sort((a, b) => a.kennung.localeCompare(b.kennung, 'de', { numeric: true }))) {
    const vergeben = new Set(alle.map((a) => a.kurz.trim().toLowerCase()));
    let kurz = `Abschn.${/^\d+$/.test(teil.kennung) ? Number(teil.kennung) : alle.length + 1}`;
    for (let n = alle.length + 1; vergeben.has(kurz.toLowerCase()); n++) kurz = `Abschn.${n}`;
    const abschnitt: Abschnitt = { id: neueId('ab'), kennung: teil.kennung, kurz, name: teil.name || teil.kennung };
    alle.push(abschnitt);
    neu.push(abschnitt);
  }
  return neu;
}

/**
 * Abschnitte aus den Projektelementen der Leistungen eines Projekts: Je neuer
 * Kennung entsteht ein Abschnitt („Abschn.1“ für „01“, Bezeichnung aus dem
 * Projektelement); Leistungen ohne Abschnitt erhalten den ihrer Kennung.
 * Rein; liefert den neuen Bestand und die Zahl neuer Abschnitte.
 */
export function abschnitteAusElementen(
  daten: LeistungsnachweisDaten,
  projektId: ID,
  neueId: (prefix: string) => ID,
): { daten: LeistungsnachweisDaten; anzahl: number } {
  const projekt = daten.projekte.find((p) => p.id === projektId);
  if (!projekt) return { daten, anzahl: 0 };
  const abschnitte = [...projekt.abschnitte];
  const elemente = new Map<string, { kennung: string; name: string }>();
  for (const l of daten.leistungen) {
    if (l.projektId !== projektId || !l.projektelement.trim()) continue;
    const teil = projektelementTeilen(l.projektelement);
    const k = kennungNormal(teil.kennung);
    if (k && !elemente.has(k) && !abschnitte.some((a) => kennungNormal(a.kennung) === k)) elemente.set(k, teil);
  }
  const neu = abschnitteAnlegen(abschnitte, [...elemente.values()], neueId);
  abschnitte.push(...neu);
  const nachKennung = new Map(abschnitte.map((a) => [kennungNormal(a.kennung), a.id]));
  const gueltig = new Set(abschnitte.map((a) => a.id));
  let zugeordnet = false;
  const leistungen = daten.leistungen.map((l) => {
    if (l.projektId !== projektId || (l.abschnittId && gueltig.has(l.abschnittId)) || !l.projektelement.trim()) return l;
    const id = nachKennung.get(kennungNormal(projektelementTeilen(l.projektelement).kennung));
    if (!id) return l;
    zugeordnet = true;
    return { ...l, abschnittId: id };
  });
  if (neu.length === 0 && !zugeordnet) return { daten, anzahl: 0 };
  return {
    daten: {
      ...daten,
      projekte: neu.length ? daten.projekte.map((p) => (p.id === projektId ? { ...p, abschnitte } : p)) : daten.projekte,
      leistungen: zugeordnet ? leistungen : daten.leistungen,
    },
    anzahl: neu.length,
  };
}

/**
 * Liest die Zeilen eines Blatts (`tabelleLesen`). Kopfzeile in den ersten 15 Zeilen über
 * `spaltenZuordnen`; ohne erkannte Kopfzeile gelten die Standardspalten und Zeile 1 zählt mit, wenn
 * sie ein Datum hat. Gründe für übersprungene Zeilen (wörtlich so verwenden):
 *  „ohne Datum“, „ohne Projekt“, „ohne Stunden“, „Projektnummer nicht erkannt“.
 * Wirft Error (`IMPORT_FALSCHE_DATEI`), wenn weder eine Kopfzeile noch eine einzige Zeile mit
 * Datum und Stunden vorkommt. `zeilenNummern` (aus `tabelleLesen`) sind die Zeilen in Excel;
 * ohne sie zählt die Stelle in `zeilen`.
 */
export function importLesen(zeilen: string[][], blatt = '', zeilenNummern?: number[]): ImportGelesen {
  const nummer = (i: number) => zeilenNummern?.[i] ?? i + 1;
  const vollstaendig = (s: Partial<Record<ImportFeld, number>>) =>
    s.datum !== undefined && s.stunden !== undefined && s.projekt !== undefined;
  const kopfIndex = zeilen.slice(0, 15).findIndex((z) => vollstaendig(spaltenZuordnen(z, IMPORT_SPALTEN)));
  let spalten: Partial<Record<ImportFeld, number>>;
  let start: number;
  if (kopfIndex >= 0) {
    spalten = spaltenZuordnen(zeilen[kopfIndex], IMPORT_SPALTEN);
    start = kopfIndex + 1;
  } else {
    spalten = IMPORT_STANDARDSPALTEN;
    const datumIn = (z: string[] | undefined) => !!z && istDatum(datumLesen(z[IMPORT_STANDARDSPALTEN.datum] ?? '') ?? '');
    const mitStunden = (z: string[]) => datumIn(z) && zahlLesen(z[IMPORT_STANDARDSPALTEN.stunden] ?? '') !== null;
    if (!zeilen.some(mitStunden)) throw new Error(IMPORT_FALSCHE_DATEI);
    start = datumIn(zeilen[0]) ? 0 : 1;
  }

  const posten: ImportPosten[] = [];
  const uebersprungen: Uebersprungen[] = [];
  for (let i = start; i < zeilen.length; i++) {
    const z = zeilen[i] ?? [];
    if (z.every((f) => !(f ?? '').trim())) continue;
    const wert = (feld: ImportFeld) => {
      const index = spalten[feld];
      return index !== undefined ? (z[index] ?? '').trim() : '';
    };
    const text = wert('text');
    const ueberspringen = (grund: string) =>
      uebersprungen.push({
        zeile: nummer(i),
        grund,
        text: (text || z.map((f) => (f ?? '').trim()).filter(Boolean).join(' · ')).slice(0, 160),
      });

    const datum = datumLesen(wert('datum'));
    if (!datum || !istDatum(datum)) {
      ueberspringen('ohne Datum');
      continue;
    }
    const projektText = wert('projekt');
    if (!projektText) {
      ueberspringen('ohne Projekt');
      continue;
    }
    const projekt = projektAusText(projektText);
    if (!projekt) {
      ueberspringen('Projektnummer nicht erkannt');
      continue;
    }
    const stunden = zahlLesen(wert('stunden'));
    if (stunden === null || !(stunden > 0)) {
      ueberspringen('ohne Stunden');
      continue;
    }
    posten.push({
      zeile: nummer(i),
      datum,
      text,
      stunden: runden(stunden),
      projektNummer: projekt.nummer,
      projektName: projekt.name,
      projektelement: wert('projektelement'),
      mitarbeiterText: wert('mitarbeiter'),
    });
  }
  return { posten, uebersprungen, blatt };
}

/** Projektnummern der Datei, zu denen es noch kein Projekt gibt – aufsteigend (Vorgabe für „Projekt anlegen“). */
export function unbekannteProjektnummern(daten: Pick<LeistungsnachweisDaten, 'projekte'>, gelesen: ImportGelesen): string[] {
  const bekannt = new Set(daten.projekte.map((p) => nummerNormal(p.nummer)));
  return [...new Set(gelesen.posten.map((p) => p.projektNummer))].filter((n) => !bekannt.has(n)).sort();
}


/* ------------------------------------------------------------------ */
/* Planen                                                              */
/* ------------------------------------------------------------------ */

export interface ImportOptionen {
  /**
   * Angemeldete Person. Im Normalfall übernimmt sie nur ihre eigenen Zeilen
   * (Zeilen ohne Mitarbeiterangabe gehören ihr); ohne Anmeldung wird nichts
   * übernommen.
   */
  angemeldetId: ID | null;
  /**
   * Sammel-Export: Leistungen aller Mitarbeiter der Datei übernehmen und
   * unbekannte Mitarbeiter anlegen – nur mit der Rolle Controlling (der Dialog
   * setzt es nur dann, der Store lässt ohne Rolle nur eigene Leistungen zu).
   */
  alleMitarbeiter: boolean;
  /** Nur Sammel-Export: Mitarbeiter für Zeilen ohne Angabe; null = solche Zeilen überspringen. */
  ersatzMitarbeiterId: ID | null;
  /** Unbekannte Projektnummern, die angelegt werden (Nummer → true). Fehlt eine, werden ihre Zeilen übersprungen. */
  neueProjekte: Record<string, boolean>;
  /**
   * Frühere Importe ersetzen: Importierte Leistungen derselben Person in den Projekten der Datei,
   * deren Datum zwischen dem ersten und letzten Datum dieser Person in der Datei liegt, werden durch
   * die Datei ersetzt. Händisch erfasste Leistungen und Leistungen anderer Personen bleiben immer;
   * im Normalfall betrifft es nur die angemeldete Person.
   */
  ersetzen: boolean;
}

/** Ein Projekt der Datei in der Vorschau (im Normalfall nur mit den eigenen Zeilen). */
export interface VorschauProjekt {
  nummer: string;
  name: string;
  /** Vorhandenes Projekt; null = neu. */
  projektId: ID | null;
  /** Nur bei neu: wird angelegt? */
  anlegen: boolean;
  /** Zeilen der Datei für das Projekt mit ihren Stunden und ihrem Zeitraum. */
  anzahl: number;
  stunden: number;
  von: ISODate;
  bis: ISODate;
  /** Neu aufgenommene Leistungen. */
  neu: number;
  /** Schon vorhanden → übersprungen. */
  doppelt: number;
  /** Frühere Importe, die entfallen. */
  ersetzt: number;
  /** Neue bzw. entfallende Leistungen in abgeschlossenen Nachweisen (Stand bleibt bis „Wieder öffnen“). */
  inAbgeschlossenem: number;
  nachweise: { titel: string; art: 'neu' | 'erweitert' | 'vorhanden' }[];
  /** Abschnitte, die der Import aus Spalte J anlegt („01 Neustadt Nord, Strecke 3436“ …). */
  neueAbschnitte: Abschnitt[];
}

/** Ein Mitarbeiter der Datei in der Vorschau (je Schreibweise der Spalte „Mitarbeiter“). */
export interface VorschauMitarbeiter {
  /** Angabe aus der Datei, etwa „MM: Mustermann, Max“. */
  text: string;
  /** Kürzel und Name der zugeordneten (bzw. neu angelegten) Person, sonst aus der Datei. */
  kuerzel: string;
  name: string;
  /** Vorhandener Mitarbeiter; null = wird angelegt bzw. (Normalfall) unbekannt. */
  mitarbeiterId: ID | null;
  anzahl: number;
  /**
   * 'eigene' – die angemeldete Person; 'anderer' – eine andere Person, ihre
   * Zeilen werden übersprungen (Normalfall); im Sammel-Export 'vorhanden'
   * bzw. 'neu' (wird angelegt, wenn sie neue Leistungen erhält).
   */
  art: 'eigene' | 'anderer' | 'vorhanden' | 'neu';
  /** Hinweis bei einem Kürzel, das zu einer anderen Person gehört; sonst null. */
  hinweis: string | null;
}

/** Was `importAnwenden` übernimmt – alle Kennungen schon vergeben. */
export interface ImportPlan {
  neueMitarbeiter: Mitarbeiter[];
  /** Neue Projekte samt ihren Abschnitten aus Spalte J. */
  neueProjekte: Projekt[];
  /** Neue Abschnitte vorhandener Projekte (aus Spalte J). */
  neueAbschnitte: { projektId: ID; abschnitte: Abschnitt[] }[];
  entfernen: ID[];
  neueLeistungen: Leistung[];
  neueNachweise: Leistungsnachweis[];
  erweiterteNachweise: { id: ID; von: ISODate; bis: ISODate }[];
}

/** Ergebnis von `importPlanen`: Vorschau für die Oberfläche samt Plan. */
export interface ImportVorschau {
  projekte: VorschauProjekt[];
  mitarbeiter: VorschauMitarbeiter[];
  /** Zeilen ohne Mitarbeiterangabe. */
  ohneMitarbeiter: number;
  /** Zeilen, die einem Mitarbeiter zugeordnet sind – im Normalfall der angemeldeten Person. */
  zugeordnet: number;
  /** Normalfall: Zeilen anderer Mitarbeiter (übersprungen, Grund „anderer Mitarbeiter“). */
  fremde: number;
  /**
   * Aus dem Lesen + „anderer Mitarbeiter“, „nicht angemeldet“, „ohne Mitarbeiter“,
   * „Projekt wird nicht angelegt“ – nach Zeile sortiert.
   */
  uebersprungen: Uebersprungen[];
  plan: ImportPlan;
}

/** Vorgaben eines beim Import neu angelegten Projekts. */
export const IMPORT_PROJEKT_VORGABEN: Pick<Projekt, 'leistungsbereich' | 'raster' | 'zeitraumregel'> = {
  leistungsbereich: 'Projektsteuerung',
  raster: 'monat',
  zeitraumregel: 'monat',
};

const textNormal = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Schlüssel einer Leistung für die Dubletten-Erkennung: Projekt, Person,
 * Datum, Stunden, Text – mit `mitElement` auch das Projektelement (gegen
 * frühere Importe; händisch erfasste Leistungen haben keins).
 */
function dublettenSchluessel(
  l: Pick<Leistung, 'projektId' | 'mitarbeiterId' | 'datum' | 'stunden' | 'projektelement' | 'text'>,
  mitElement: boolean,
): string {
  return [
    l.projektId,
    l.mitarbeiterId,
    l.datum,
    runden(l.stunden),
    mitElement ? textSchluessel(l.projektelement) : '',
    textSchluessel(l.text),
  ].join('|');
}

/**
 * Rein. Ordnet Mitarbeiter zu (`mitarbeiterZuordnen`: Kürzel und Name müssen beide passen; nur
 * Kürzel → Kürzel; nur Name → Name). Im Normalfall (`alleMitarbeiter` false) bleiben nur die
 * Zeilen der angemeldeten Person (und die ohne Mitarbeiterangabe), alle anderen werden mit
 * „anderer Mitarbeiter“ übersprungen; es entstehen keine Mitarbeiter. Im Sammel-Export
 * entstehen unbekannte Mitarbeiter neu – bei einem Kürzel, das einer anderen Person gehört, mit
 * freiem Kürzel (`kuerzelFrei`, etwa „MM2“) und Hinweis.
 *
 * Projekte über die Nummer (ohne Leerzeichen, Großschreibung; sonst neu mit name aus der Datei,
 * Leistungsbereich „Projektsteuerung“, Raster „monat“, Regel „monat“, markiert). Abschnitte über
 * die Kennung des Projektelements (Spalte J); fehlende legt der Plan an. Doppelte werden
 * übersprungen – je vorhandener Leistung höchstens einmal: zuerst gegen frühere Importe mit
 * gleichem Projektelement, danach gegen händisch erfasste ohne Rücksicht auf das Projektelement
 * (`dublettenSchluessel`). Danach `nachweiseErgaenzen` je Projekt für die neuen Leistungen.
 * `neueId(prefix)` erzeugt alle IDs. Neue Mitarbeiter und Projekte nimmt der Plan nur auf, wenn
 * sie neue Leistungen erhalten.
 */
export function importPlanen(
  daten: LeistungsnachweisDaten,
  gelesen: ImportGelesen,
  optionen: ImportOptionen,
  jetzt: string,
  neueId: (prefix: string) => ID,
): ImportVorschau {
  const uebersprungen: Uebersprungen[] = [...gelesen.uebersprungen];
  const sammel = optionen.alleMitarbeiter;
  const ich = optionen.angemeldetId && daten.mitarbeiter.some((m) => m.id === optionen.angemeldetId) ? optionen.angemeldetId : null;
  const bekannteIds = new Set(daten.mitarbeiter.map((m) => m.id));

  /* Mitarbeiter */
  const personen: Mitarbeiter[] = [...daten.mitarbeiter];
  const vorlaeufig: Mitarbeiter[] = [];
  const nachText = new Map<string, { vorschau: VorschauMitarbeiter; id: ID | null }>();
  const personZu = (text: string): ID | null => {
    const schluessel = textNormal(text);
    const bekannt = nachText.get(schluessel);
    if (bekannt) {
      bekannt.vorschau.anzahl++;
      return bekannt.id;
    }
    const angabe = mitarbeiterLesen(text)!;
    const { person: gefunden, kuerzelVon } = mitarbeiterZuordnen(personen, text);
    let person = gefunden;
    let art: VorschauMitarbeiter['art'];
    let hinweis: string | null = null;
    const nameVon = (m: Mitarbeiter) => mitarbeiterName(m) || m.kuerzel;
    if (!sammel) {
      art = person && person.id === ich ? 'eigene' : 'anderer';
      if (art === 'anderer' && kuerzelVon && kuerzelVon.id === ich) {
        hinweis = `Gleiches Kürzel „${angabe.kuerzel}“ wie ${nameVon(kuerzelVon)}, aber ein anderer Name – eine andere Person.`;
      }
    } else if (person) {
      art = bekannteIds.has(person.id) ? 'vorhanden' : 'neu';
    } else {
      const kuerzel = kuerzelFrei(angabe.kuerzel, personen);
      person = {
        id: neueId('ma'),
        kuerzel,
        vorname: angabe.vorname,
        nachname: angabe.nachname,
        aktiv: true,
        controlling: false,
      };
      personen.push(person);
      vorlaeufig.push(person);
      art = 'neu';
      if (kuerzelVon) {
        hinweis = `Das Kürzel „${angabe.kuerzel}“ gehört zu ${nameVon(kuerzelVon)} – angelegt wird eine neue Person mit dem Kürzel „${kuerzel}“.`;
      }
    }
    const id = sammel ? person!.id : art === 'eigene' ? ich : null;
    nachText.set(schluessel, {
      id,
      vorschau: {
        text: text.trim(),
        kuerzel: person?.kuerzel ?? angabe.kuerzel,
        name: person ? mitarbeiterName(person) : mitarbeiterName(angabe),
        mitarbeiterId: person && bekannteIds.has(person.id) ? person.id : null,
        anzahl: 1,
        art,
        hinweis,
      },
    });
    return id;
  };
  const ersatz =
    sammel && optionen.ersatzMitarbeiterId && bekannteIds.has(optionen.ersatzMitarbeiterId) ? optionen.ersatzMitarbeiterId : null;

  // Zeilen in der Reihenfolge der Datei, damit Mitarbeiter in dieser Reihenfolge erscheinen
  let ohneMitarbeiter = 0;
  let fremde = 0;
  const zugeordnet: { posten: ImportPosten; mitarbeiterId: ID }[] = [];
  for (const p of gelesen.posten) {
    const angabe = p.mitarbeiterText.trim();
    if (!angabe) ohneMitarbeiter++;
    const mitarbeiterId = angabe ? personZu(p.mitarbeiterText) : sammel ? ersatz : ich;
    if (!sammel && !ich) {
      uebersprungen.push({ zeile: p.zeile, grund: 'nicht angemeldet', text: p.text });
      continue;
    }
    if (!sammel && angabe && !mitarbeiterId) {
      fremde++;
      uebersprungen.push({ zeile: p.zeile, grund: 'anderer Mitarbeiter', text: `${angabe} – ${p.text}`.slice(0, 160) });
      continue;
    }
    if (!mitarbeiterId) {
      uebersprungen.push({ zeile: p.zeile, grund: 'ohne Mitarbeiter', text: p.text });
      continue;
    }
    zugeordnet.push({ posten: p, mitarbeiterId });
  }

  /* Projekte */
  const gruppen = new Map<string, ImportPosten[]>();
  for (const { posten: p } of zugeordnet) {
    const liste = gruppen.get(p.projektNummer);
    if (liste) liste.push(p);
    else gruppen.set(p.projektNummer, [p]);
  }
  const neueProjekte: Projekt[] = [];
  const projektInfo: { nummer: string; posten: ImportPosten[]; projekt: Projekt | null; vorhanden: boolean; anlegen: boolean }[] = [];
  for (const nummer of [...gruppen.keys()].sort()) {
    const posten = gruppen.get(nummer)!;
    const vorhanden = daten.projekte.find((p) => nummerNormal(p.nummer) === nummer);
    const anlegen = !vorhanden && optionen.neueProjekte[nummer] === true;
    let projekt: Projekt | null = vorhanden ?? null;
    if (!projekt && anlegen) {
      projekt = {
        id: neueId('pr'),
        nummer,
        name: posten.find((p) => p.projektName)?.projektName || nummer,
        kurzname: '',
        status: 'aktiv',
        markiert: true,
        beschreibung: '',
        ...IMPORT_PROJEKT_VORGABEN,
        abschnitte: [],
        logos: null,
      };
      neueProjekte.push(projekt);
    }
    projektInfo.push({ nummer, posten, projekt, vorhanden: !!vorhanden, anlegen });
  }

  interface Kandidat {
    posten: ImportPosten;
    projekt: Projekt;
    mitarbeiterId: ID;
  }
  const projektVon = new Map(projektInfo.map((i) => [i.nummer, i.projekt]));
  const kandidaten: Kandidat[] = [];
  for (const { posten: p, mitarbeiterId } of zugeordnet) {
    const projekt = projektVon.get(p.projektNummer) ?? null;
    if (!projekt) {
      uebersprungen.push({ zeile: p.zeile, grund: 'Projekt wird nicht angelegt', text: p.text });
      continue;
    }
    kandidaten.push({ posten: p, projekt, mitarbeiterId });
  }

  /* Dubletten gegen den Bestand – als Multimenge, frühere Importe zuerst */
  const mitElement = new Map<string, Leistung[]>();
  const haendisch = new Map<string, Leistung[]>();
  const einreihen = (ziel: Map<string, Leistung[]>, k: string, l: Leistung) => {
    const liste = ziel.get(k);
    if (liste) liste.push(l);
    else ziel.set(k, [l]);
  };
  for (const l of [...daten.leistungen].sort((a, b) => (a.quelle === b.quelle ? 0 : a.quelle === 'import' ? -1 : 1))) {
    einreihen(mitElement, dublettenSchluessel(l, true), l);
    if (l.quelle === 'manuell') einreihen(haendisch, dublettenSchluessel(l, false), l);
  }
  const verbraucht = new Set<ID>();
  const nimm = (liste: Leistung[] | undefined): Leistung | undefined => {
    while (liste && liste.length > 0) {
      const l = liste.shift()!;
      if (!verbraucht.has(l.id)) return l;
    }
    return undefined;
  };
  const alsLeistung = (k: Kandidat) => ({
    projektId: k.projekt.id,
    mitarbeiterId: k.mitarbeiterId,
    datum: k.posten.datum,
    stunden: k.posten.stunden,
    projektelement: k.posten.projektelement,
    text: k.posten.text,
  });
  const doppelt = new Map<ID, number>();
  const offen = new Set<Kandidat>(kandidaten);
  for (const stufe of [true, false]) {
    for (const k of kandidaten) {
      if (!offen.has(k)) continue;
      const treffer = nimm((stufe ? mitElement : haendisch).get(dublettenSchluessel(alsLeistung(k), stufe)));
      if (!treffer) continue;
      verbraucht.add(treffer.id);
      offen.delete(k);
      doppelt.set(k.projekt.id, (doppelt.get(k.projekt.id) ?? 0) + 1);
    }
  }
  const neu = kandidaten.filter((k) => offen.has(k));

  /* Frühere Importe derselben Personen ersetzen */
  const entfernt: Leistung[] = [];
  if (optionen.ersetzen) {
    const bereich = new Map<ID, { von: ISODate; bis: ISODate }>();
    for (const k of kandidaten) {
      const b = bereich.get(k.mitarbeiterId);
      if (!b) bereich.set(k.mitarbeiterId, { von: k.posten.datum, bis: k.posten.datum });
      else {
        if (k.posten.datum < b.von) b.von = k.posten.datum;
        if (k.posten.datum > b.bis) b.bis = k.posten.datum;
      }
    }
    const projekteDerDatei = new Set(kandidaten.map((k) => k.projekt.id));
    for (const l of daten.leistungen) {
      const b = bereich.get(l.mitarbeiterId);
      if (
        l.quelle === 'import' &&
        b &&
        projekteDerDatei.has(l.projektId) &&
        l.datum >= b.von &&
        l.datum <= b.bis &&
        !verbraucht.has(l.id)
      ) {
        entfernt.push(l);
      }
    }
  }

  /* Abschnitte aus Spalte J für die neuen Leistungen */
  const neueAbschnitteVon = new Map<ID, Abschnitt[]>();
  const abschnittNachKennung = new Map<ID, Map<string, ID>>();
  for (const info of projektInfo) {
    const projekt = info.projekt;
    if (!projekt) continue;
    const bekannt = new Map(projekt.abschnitte.map((a) => [kennungNormal(a.kennung), a.id]));
    const fehlend = new Map<string, { kennung: string; name: string }>();
    for (const k of neu) {
      if (k.projekt.id !== projekt.id || !k.posten.projektelement.trim()) continue;
      const teil = projektelementTeilen(k.posten.projektelement);
      const kennung = kennungNormal(teil.kennung);
      if (kennung && !bekannt.has(kennung) && !fehlend.has(kennung)) fehlend.set(kennung, teil);
    }
    const angelegt = abschnitteAnlegen(projekt.abschnitte, [...fehlend.values()], neueId);
    for (const a of angelegt) bekannt.set(kennungNormal(a.kennung), a.id);
    if (angelegt.length) neueAbschnitteVon.set(projekt.id, angelegt);
    abschnittNachKennung.set(projekt.id, bekannt);
  }

  /* Neue Leistungen und Nachweise */
  const neueLeistungen: Leistung[] = neu.map((k) => {
    const kennung = kennungNormal(projektelementTeilen(k.posten.projektelement).kennung);
    return {
      id: neueId('le'),
      projektId: k.projekt.id,
      mitarbeiterId: k.mitarbeiterId,
      datum: k.posten.datum,
      text: k.posten.text,
      stunden: k.posten.stunden,
      abschnittId: (kennung && abschnittNachKennung.get(k.projekt.id)?.get(kennung)) || null,
      projektelement: k.posten.projektelement,
      quelle: 'import',
      erfasst: jetzt,
    };
  });
  const neueNachweise: Leistungsnachweis[] = [];
  const erweiterteNachweise: ImportPlan['erweiterteNachweise'] = [];
  const projekte: VorschauProjekt[] = [];

  for (const info of projektInfo) {
    const { posten, projekt } = info;
    const tage = posten.map((p) => p.datum).sort();
    const leistungen = projekt ? neueLeistungen.filter((l) => l.projektId === projekt.id) : [];
    const weg = projekt ? entfernt.filter((l) => l.projektId === projekt.id) : [];
    const nachweise: VorschauProjekt['nachweise'] = [];
    let inAbgeschlossenem = 0;
    if (projekt) {
      const ergaenzung = nachweiseErgaenzen(daten, projekt, leistungen.map((l) => l.datum), jetzt, () => neueId('ln'));
      neueNachweise.push(...ergaenzung.neu);
      erweiterteNachweise.push(...ergaenzung.erweitert);
      const erweitert = new Map(ergaenzung.erweitert.map((e) => [e.id, e]));
      const liste: { von: ISODate; titel: string; art: 'neu' | 'erweitert' | 'vorhanden' }[] = ergaenzung.neu.map((n) => ({
        von: n.von,
        titel: nachweisTitel(n),
        art: 'neu',
      }));
      const vorhandene = new Set<ID>();
      for (const l of [...leistungen, ...weg]) {
        const n = nachweisFuer(daten, projekt.id, l.datum);
        if (!n) continue;
        if (n.status === 'abgeschlossen') inAbgeschlossenem++;
        vorhandene.add(n.id);
      }
      for (const n of daten.nachweise) {
        const e = erweitert.get(n.id);
        if (e) liste.push({ von: e.von, titel: nachweisTitel({ ...n, von: e.von, bis: e.bis }), art: 'erweitert' });
        else if (vorhandene.has(n.id)) liste.push({ von: n.von, titel: nachweisTitel(n), art: 'vorhanden' });
      }
      liste.sort((a, b) => (a.von < b.von ? -1 : a.von > b.von ? 1 : 0));
      nachweise.push(...liste.map(({ titel, art }) => ({ titel, art })));
    }
    projekte.push({
      nummer: info.nummer,
      name: projekt?.name || posten.find((p) => p.projektName)?.projektName || info.nummer,
      projektId: info.vorhanden && projekt ? projekt.id : null,
      anlegen: !info.vorhanden && info.anlegen,
      anzahl: posten.length,
      stunden: runden(posten.reduce((s, p) => s + p.stunden, 0)),
      von: tage[0] ?? '',
      bis: tage[tage.length - 1] ?? '',
      neu: leistungen.length,
      doppelt: projekt ? (doppelt.get(projekt.id) ?? 0) : 0,
      ersetzt: weg.length,
      inAbgeschlossenem,
      nachweise,
      neueAbschnitte: projekt ? (neueAbschnitteVon.get(projekt.id) ?? []) : [],
    });
  }

  const genutzt = new Set(neueLeistungen.flatMap((l) => [l.mitarbeiterId, l.projektId]));
  const neuesProjekt = new Set(neueProjekte.map((p) => p.id));
  return {
    projekte,
    mitarbeiter: [...nachText.values()].map((m) => m.vorschau),
    ohneMitarbeiter,
    zugeordnet: zugeordnet.length,
    fremde,
    uebersprungen: uebersprungen.sort((a, b) => a.zeile - b.zeile),
    plan: {
      neueMitarbeiter: sammel ? vorlaeufig.filter((m) => genutzt.has(m.id)) : [],
      neueProjekte: neueProjekte
        .filter((p) => genutzt.has(p.id))
        .map((p) => ({ ...p, abschnitte: [...p.abschnitte, ...(neueAbschnitteVon.get(p.id) ?? [])] })),
      neueAbschnitte: [...neueAbschnitteVon.entries()]
        .filter(([projektId]) => !neuesProjekt.has(projektId))
        .map(([projektId, abschnitte]) => ({ projektId, abschnitte })),
      entfernen: entfernt.map((l) => l.id),
      neueLeistungen,
      neueNachweise,
      erweiterteNachweise,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Anwenden                                                            */
/* ------------------------------------------------------------------ */

/** Rein: wendet den Plan an (Mitarbeiter, Projekte, Abschnitte, Entfernen, Leistungen, Nachweise neu/erweitert). */
export function importAnwenden(daten: LeistungsnachweisDaten, plan: ImportPlan): LeistungsnachweisDaten {
  const ids = (liste: { id: ID }[]) => new Set(liste.map((x) => x.id));
  const mitarbeiterIds = ids(daten.mitarbeiter);
  const projektIds = ids(daten.projekte);
  const leistungIds = ids(daten.leistungen);
  const nachweisIds = ids(daten.nachweise);
  const entfernen = new Set(plan.entfernen);
  const erweitert = new Map(plan.erweiterteNachweise.map((e) => [e.id, e]));
  const abschnitte = new Map((plan.neueAbschnitte ?? []).map((e) => [e.projektId, e.abschnitte]));
  return {
    ...daten,
    mitarbeiter: [...daten.mitarbeiter, ...plan.neueMitarbeiter.filter((m) => !mitarbeiterIds.has(m.id))],
    projekte: [
      ...daten.projekte.map((p) => {
        const neu = abschnitte.get(p.id)?.filter((a) => !p.abschnitte.some((x) => x.id === a.id));
        return neu && neu.length ? { ...p, abschnitte: [...p.abschnitte, ...neu] } : p;
      }),
      ...plan.neueProjekte.filter((p) => !projektIds.has(p.id)),
    ],
    leistungen: [
      ...daten.leistungen.filter((l) => !entfernen.has(l.id)),
      ...plan.neueLeistungen.filter((l) => !leistungIds.has(l.id)),
    ],
    nachweise: [
      ...daten.nachweise.map((n) => {
        const e = erweitert.get(n.id);
        return e && n.status === 'entwurf' ? { ...n, von: e.von, bis: e.bis } : n;
      }),
      ...plan.neueNachweise.filter((n) => !nachweisIds.has(n.id)),
    ],
  };
}
