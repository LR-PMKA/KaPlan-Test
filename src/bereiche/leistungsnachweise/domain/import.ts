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
 * Leistungen anderer Mitarbeiter werden nie verändert: Doppelte Zeilen
 * (gleiche Person, gleiches Projekt, Datum, Stunden, Projektelement und Text)
 * werden übersprungen, und „ersetzen“ entfernt nur frühere Importe derselben
 * Person in den Projekten der Datei und in ihrem Datumsbereich der Datei.
 */
import { datumLesen, spaltenZuordnen } from '../../../shared/xlsxLesen';
import { nachweiseErgaenzen, nachweisFuer, nachweisTitel, textSchluessel } from './nachweis';
import {
  kuerzelAus,
  mitarbeiterName,
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
  /** Zeile in der Datei (1-basiert wie in Excel; ganz leere Zeilen lässt das Lesen der Datei aus). */
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
  /** Roh, „LR: Roese, Lukas“ oder ''. */
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

/** Meldung, wenn eine Datei gar nicht zum Import passt. */
const FEHLENDE_SPALTEN = 'In der Datei fehlen die Spalten für Datum, Stunden und Projekt.';

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

/** „K2476: PS / PLM, Neubau Hp Aalen West“ → { nummer: 'K2476', name: 'PS / PLM, Neubau Hp Aalen West' }; null, wenn keine Nummer. */
export function projektAusText(text: string): { nummer: string; name: string } | null {
  const m = /^\s*([A-Za-z]{1,3}\s*-?\s*\d{3,})(?![\dA-Za-z])\s*(?:[:\-–—]\s*)?([\s\S]*)$/.exec(text);
  if (!m) return null;
  return { nummer: nummerNormal(m[1]), name: m[2].trim() };
}

/** Mitarbeiterangabe mit dem Vermerk, ob das Kürzel in der Datei stand (dann zählt es beim Zuordnen zuerst). */
function mitarbeiterLesen(text: string): { kuerzel: string; vorname: string; nachname: string; mitKuerzel: boolean } | null {
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
  // Nur ein Kürzel, etwa „LR“
  const nurKuerzel = !kuerzel && !vorname && /^[\p{Lu}\d]{1,4}$/u.test(nachname);
  if (nurKuerzel) kuerzel = nachname;
  if (!nachname) nachname = kuerzel;
  if (!kuerzel) kuerzel = kuerzelAus(`${vorname} ${nachname}`);
  return { kuerzel, vorname, nachname, mitKuerzel: !!mitDoppelpunkt || nurKuerzel };
}

/** „LR: Roese, Lukas“ → { kuerzel: 'LR', vorname: 'Lukas', nachname: 'Roese' }; „Lukas Roese“ → Kürzel aus Initialen. */
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
  const neu = [...elemente.values()].sort((a, b) => a.kennung.localeCompare(b.kennung, 'de', { numeric: true }));
  for (const teil of neu) {
    const vergeben = new Set(abschnitte.map((a) => a.kurz.trim().toLowerCase()));
    let kurz = `Abschn.${/^\d+$/.test(teil.kennung) ? Number(teil.kennung) : abschnitte.length + 1}`;
    for (let n = abschnitte.length + 1; vergeben.has(kurz.toLowerCase()); n++) kurz = `Abschn.${n}`;
    abschnitte.push({ id: neueId('ab'), kennung: teil.kennung, kurz, name: teil.name || teil.kennung });
  }
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
 * Wirft Error („In der Datei fehlen die Spalten für Datum, Stunden und Projekt.“), wenn gar nichts passt.
 */
export function importLesen(zeilen: string[][], blatt = ''): ImportGelesen {
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
    if (!zeilen.some(datumIn)) throw new Error(FEHLENDE_SPALTEN);
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
        zeile: i + 1,
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
      zeile: i + 1,
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
  /** Mitarbeiter für Zeilen ohne Angabe; null = solche Zeilen überspringen. */
  ersatzMitarbeiterId: ID | null;
  /** Unbekannte Projektnummern, die angelegt werden (Nummer → true). Fehlt eine, werden ihre Zeilen übersprungen. */
  neueProjekte: Record<string, boolean>;
  /**
   * Frühere Importe ersetzen: Importierte Leistungen derselben Person in den Projekten der Datei,
   * deren Datum zwischen dem ersten und letzten Datum dieser Person in der Datei liegt, werden durch
   * die Datei ersetzt. Händisch erfasste Leistungen und Leistungen anderer Personen bleiben immer.
   */
  ersetzen: boolean;
}

/** Ein Projekt der Datei in der Vorschau. */
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
}

/** Ein Mitarbeiter der Datei in der Vorschau (je Schreibweise der Spalte „Mitarbeiter“). */
export interface VorschauMitarbeiter {
  text: string;
  kuerzel: string;
  name: string;
  /** null = wird angelegt. */
  mitarbeiterId: ID | null;
  anzahl: number;
}

/** Was `importAnwenden` übernimmt – alle Kennungen schon vergeben. */
export interface ImportPlan {
  neueMitarbeiter: Mitarbeiter[];
  neueProjekte: Projekt[];
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
  /** Aus dem Lesen + „ohne Mitarbeiter“, „Projekt wird nicht angelegt“ – nach Zeile sortiert. */
  uebersprungen: Uebersprungen[];
  plan: ImportPlan;
}

/** Vorgaben eines beim Import neu angelegten Projekts. */
export const IMPORT_PROJEKT_VORGABEN: Pick<Projekt, 'leistungsbereich' | 'raster' | 'zeitraumregel'> = {
  leistungsbereich: 'Projektsteuerung',
  raster: 'monat',
  zeitraumregel: 'monat',
};

const nameNormal = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Schlüssel einer Leistung für die Dubletten-Erkennung. */
function dublettenSchluessel(l: Pick<Leistung, 'projektId' | 'mitarbeiterId' | 'datum' | 'stunden' | 'projektelement' | 'text'>): string {
  return [l.projektId, l.mitarbeiterId, l.datum, runden(l.stunden), textSchluessel(l.projektelement), textSchluessel(l.text)].join('|');
}

/**
 * Rein. Ordnet Mitarbeiter zu (Kürzel, sonst Vor- und Nachname, ohne Rücksicht auf Groß-/Klein-
 * schreibung; sonst neu), Projekte über die Nummer (ohne Leerzeichen, Großschreibung; sonst neu mit
 * name aus der Datei, Leistungsbereich „Projektsteuerung“, Raster „monat“, Regel „monat“, markiert),
 * Abschnitte über `kennung` des Projektelements. Doppelte (gleiches Projekt, Person, Datum, Stunden,
 * Projektelement und Text ohne Rücksicht auf Leerraum/Groß-/Kleinschreibung – gegen den Bestand,
 * je vorhandener Leistung höchstens einmal) werden übersprungen. Danach `nachweiseErgaenzen` je
 * Projekt für die neuen Leistungen. `neueId(prefix)` erzeugt alle IDs.
 *
 * Ein Kürzel aus der Datei („LR: …“) wird zuerst gesucht; steht nur ein Name da, zählt nur der Name.
 * Neue Mitarbeiter und Projekte nimmt der Plan nur auf, wenn sie neue Leistungen erhalten.
 */
export function importPlanen(
  daten: LeistungsnachweisDaten,
  gelesen: ImportGelesen,
  optionen: ImportOptionen,
  jetzt: string,
  neueId: (prefix: string) => ID,
): ImportVorschau {
  const uebersprungen: Uebersprungen[] = [...gelesen.uebersprungen];

  /* Mitarbeiter */
  const personen: Mitarbeiter[] = [...daten.mitarbeiter];
  const bekannteIds = new Set(daten.mitarbeiter.map((m) => m.id));
  const vorlaeufig: Mitarbeiter[] = [];
  const nachText = new Map<string, { vorschau: VorschauMitarbeiter; id: ID }>();
  const kuerzelFrei = (kuerzel: string) => {
    const vergeben = new Set(personen.map((m) => m.kuerzel.trim().toLowerCase()));
    let k = kuerzel || 'MA';
    for (let n = 2; vergeben.has(k.toLowerCase()); n++) k = `${kuerzel || 'MA'}${n}`;
    return k;
  };
  const personZu = (text: string): ID | null => {
    const schluessel = nameNormal(text);
    const bekannt = nachText.get(schluessel);
    if (bekannt) {
      bekannt.vorschau.anzahl++;
      return bekannt.id;
    }
    const info = mitarbeiterLesen(text);
    if (!info) return null;
    const name = nameNormal(`${info.vorname} ${info.nachname}`);
    const gefunden =
      (info.mitKuerzel ? personen.find((m) => m.kuerzel.trim().toLowerCase() === info.kuerzel.toLowerCase()) : undefined) ??
      personen.find((m) => nameNormal(mitarbeiterName(m)) === name);
    let person = gefunden;
    if (!person) {
      person = {
        id: neueId('ma'),
        kuerzel: kuerzelFrei(info.kuerzel),
        vorname: info.vorname,
        nachname: info.nachname,
        aktiv: true,
      };
      personen.push(person);
      vorlaeufig.push(person);
    }
    nachText.set(schluessel, {
      id: person.id,
      vorschau: {
        text: text.trim(),
        kuerzel: person.kuerzel,
        name: mitarbeiterName(person),
        mitarbeiterId: bekannteIds.has(person.id) ? person.id : null,
        anzahl: 1,
      },
    });
    return person.id;
  };
  const ersatz =
    optionen.ersatzMitarbeiterId && bekannteIds.has(optionen.ersatzMitarbeiterId) ? optionen.ersatzMitarbeiterId : null;

  /* Projekte */
  const gruppen = new Map<string, ImportPosten[]>();
  for (const p of gelesen.posten) {
    const liste = gruppen.get(p.projektNummer);
    if (liste) liste.push(p);
    else gruppen.set(p.projektNummer, [p]);
  }

  interface Kandidat {
    posten: ImportPosten;
    projekt: Projekt;
    mitarbeiterId: ID;
    abschnittId: ID | null;
  }
  const kandidaten: Kandidat[] = [];
  const neueProjekte: Projekt[] = [];
  const projektInfo: { nummer: string; posten: ImportPosten[]; projekt: Projekt | null; vorhanden: boolean; anlegen: boolean }[] = [];
  let ohneMitarbeiter = 0;

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

  // Zeilen in der Reihenfolge der Datei, damit Mitarbeiter in dieser Reihenfolge erscheinen
  const projektVon = new Map(projektInfo.map((i) => [i.nummer, i.projekt]));
  for (const p of gelesen.posten) {
    if (!p.mitarbeiterText.trim()) ohneMitarbeiter++;
    const mitarbeiterId = p.mitarbeiterText.trim() ? personZu(p.mitarbeiterText) : ersatz;
    const projekt = projektVon.get(p.projektNummer) ?? null;
    if (!projekt) {
      uebersprungen.push({ zeile: p.zeile, grund: 'Projekt wird nicht angelegt', text: p.text });
      continue;
    }
    if (!mitarbeiterId) {
      uebersprungen.push({ zeile: p.zeile, grund: 'ohne Mitarbeiter', text: p.text });
      continue;
    }
    const kennung = kennungNormal(projektelementTeilen(p.projektelement).kennung);
    const abschnitt = kennung ? projekt.abschnitte.find((a) => kennungNormal(a.kennung) === kennung) : undefined;
    kandidaten.push({ posten: p, projekt, mitarbeiterId, abschnittId: abschnitt?.id ?? null });
  }

  /* Dubletten gegen den Bestand – als Multimenge, frühere Importe zuerst */
  const bestand = new Map<string, Leistung[]>();
  for (const l of [...daten.leistungen].sort((a, b) => (a.quelle === b.quelle ? 0 : a.quelle === 'import' ? -1 : 1))) {
    const k = dublettenSchluessel(l);
    const liste = bestand.get(k);
    if (liste) liste.push(l);
    else bestand.set(k, [l]);
  }
  const verbraucht = new Set<ID>();
  const doppelt = new Map<ID, number>();
  const neu: Kandidat[] = [];
  for (const k of kandidaten) {
    const passend = bestand.get(
      dublettenSchluessel({
        projektId: k.projekt.id,
        mitarbeiterId: k.mitarbeiterId,
        datum: k.posten.datum,
        stunden: k.posten.stunden,
        projektelement: k.posten.projektelement,
        text: k.posten.text,
      }),
    );
    const treffer = passend?.shift();
    if (treffer) {
      verbraucht.add(treffer.id);
      doppelt.set(k.projekt.id, (doppelt.get(k.projekt.id) ?? 0) + 1);
    } else neu.push(k);
  }

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

  /* Neue Leistungen und Nachweise */
  const neueLeistungen: Leistung[] = neu.map((k) => ({
    id: neueId('le'),
    projektId: k.projekt.id,
    mitarbeiterId: k.mitarbeiterId,
    datum: k.posten.datum,
    text: k.posten.text,
    stunden: k.posten.stunden,
    abschnittId: k.abschnittId,
    projektelement: k.posten.projektelement,
    quelle: 'import',
    erfasst: jetzt,
  }));
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
    });
  }

  const genutzt = new Set(neueLeistungen.flatMap((l) => [l.mitarbeiterId, l.projektId]));
  return {
    projekte,
    mitarbeiter: [...nachText.values()].map((m) => m.vorschau),
    ohneMitarbeiter,
    uebersprungen: uebersprungen.sort((a, b) => a.zeile - b.zeile),
    plan: {
      neueMitarbeiter: vorlaeufig.filter((m) => genutzt.has(m.id)),
      neueProjekte: neueProjekte.filter((p) => genutzt.has(p.id)),
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

/** Rein: wendet den Plan an (Mitarbeiter, Projekte, Entfernen, Leistungen, Nachweise neu/erweitert). */
export function importAnwenden(daten: LeistungsnachweisDaten, plan: ImportPlan): LeistungsnachweisDaten {
  const ids = (liste: { id: ID }[]) => new Set(liste.map((x) => x.id));
  const mitarbeiterIds = ids(daten.mitarbeiter);
  const projektIds = ids(daten.projekte);
  const leistungIds = ids(daten.leistungen);
  const nachweisIds = ids(daten.nachweise);
  const entfernen = new Set(plan.entfernen);
  const erweitert = new Map(plan.erweiterteNachweise.map((e) => [e.id, e]));
  return {
    ...daten,
    mitarbeiter: [...daten.mitarbeiter, ...plan.neueMitarbeiter.filter((m) => !mitarbeiterIds.has(m.id))],
    projekte: [...daten.projekte, ...plan.neueProjekte.filter((p) => !projektIds.has(p.id))],
    leistungen: [
      ...daten.leistungen.filter((l) => !entfernen.has(l.id)),
      ...plan.neueLeistungen.filter((l) => !leistungIds.has(l.id)),
    ],
    nachweise: [
      ...daten.nachweise.map((n) => {
        const e = erweitert.get(n.id);
        return e ? { ...n, von: e.von, bis: e.bis } : n;
      }),
      ...plan.neueNachweise.filter((n) => !nachweisIds.has(n.id)),
    ],
  };
}
