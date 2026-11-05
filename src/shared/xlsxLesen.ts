/**
 * Lesen von Excel-Arbeitsmappen (.xlsx) und Textlisten (.csv) im Browser –
 * ohne externe Abhängigkeit.
 *
 * Die ZIP-Einträge einer Arbeitsmappe sind in der Regel mit „deflate“ gepackt;
 * ausgepackt wird mit der im Browser eingebauten DecompressionStream-Schnittstelle.
 */

export interface GeleseneTabelle {
  name: string;
  /** Erste Zeile sind die Spaltenüberschriften. */
  zeilen: string[][];
}

/* ----------------------------- ZIP ------------------------------- */

interface ZipEintrag {
  name: string;
  methode: number;
  offset: number;
  groesse: number;
}

function leseZipVerzeichnis(daten: DataView): ZipEintrag[] {
  // Ende des Zentralverzeichnisses von hinten suchen
  let eocd = -1;
  for (let i = daten.byteLength - 22; i >= 0 && i > daten.byteLength - 66_000; i--) {
    if (daten.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Die Datei ist keine gültige Excel-Datei (ZIP-Ende fehlt).');

  const anzahl = daten.getUint16(eocd + 10, true);
  let pos = daten.getUint32(eocd + 16, true);
  const eintraege: ZipEintrag[] = [];
  const decoder = new TextDecoder();

  for (let i = 0; i < anzahl; i++) {
    if (daten.getUint32(pos, true) !== 0x02014b50) break;
    const methode = daten.getUint16(pos + 10, true);
    const groesse = daten.getUint32(pos + 20, true);
    const nameLaenge = daten.getUint16(pos + 28, true);
    const extraLaenge = daten.getUint16(pos + 30, true);
    const kommentarLaenge = daten.getUint16(pos + 32, true);
    const offset = daten.getUint32(pos + 42, true);
    const name = decoder.decode(new Uint8Array(daten.buffer, daten.byteOffset + pos + 46, nameLaenge));
    eintraege.push({ name, methode, offset, groesse });
    pos += 46 + nameLaenge + extraLaenge + kommentarLaenge;
  }
  return eintraege;
}

async function entpacke(puffer: ArrayBuffer, daten: DataView, eintrag: ZipEintrag): Promise<string> {
  const nameLaenge = daten.getUint16(eintrag.offset + 26, true);
  const extraLaenge = daten.getUint16(eintrag.offset + 28, true);
  const start = eintrag.offset + 30 + nameLaenge + extraLaenge;
  const roh = new Uint8Array(puffer, start, eintrag.groesse);

  if (eintrag.methode === 0) return new TextDecoder().decode(roh);
  if (eintrag.methode !== 8) throw new Error('Die Datei verwendet ein nicht unterstütztes Packverfahren.');

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Dieser Browser kann keine Excel-Dateien entpacken – bitte die Liste als CSV speichern.');
  }
  const strom = new Blob([roh]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(strom).text();
}

/* ---------------------------- XLSX ------------------------------- */

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

/** Spaltenname zu Index: A → 0, AA → 26. */
function spaltenIndex(ref: string): number {
  const buchstaben = /^([A-Z]+)/.exec(ref)?.[1] ?? 'A';
  let index = 0;
  for (const z of buchstaben) index = index * 26 + (z.charCodeAt(0) - 64);
  return index - 1;
}

function textVon(el: Element | null): string {
  if (!el) return '';
  return Array.from(el.getElementsByTagNameNS(NS, 't'))
    .map((t) => t.textContent ?? '')
    .join('');
}

/** Liest alle Tabellenblätter einer Arbeitsmappe. */
export async function xlsxLesen(datei: File): Promise<GeleseneTabelle[]> {
  const puffer = await datei.arrayBuffer();
  const daten = new DataView(puffer);
  const eintraege = leseZipVerzeichnis(daten);
  const finde = (name: string) => eintraege.find((e) => e.name === name);

  // Gemeinsame Zeichenketten
  const geteilt: string[] = [];
  const sharedEintrag = finde('xl/sharedStrings.xml');
  if (sharedEintrag) {
    const xml = new DOMParser().parseFromString(await entpacke(puffer, daten, sharedEintrag), 'application/xml');
    for (const si of Array.from(xml.getElementsByTagNameNS(NS, 'si'))) geteilt.push(textVon(si));
  }

  // Blattnamen in der Reihenfolge der Mappe
  const namen: string[] = [];
  const wbEintrag = finde('xl/workbook.xml');
  if (wbEintrag) {
    const xml = new DOMParser().parseFromString(await entpacke(puffer, daten, wbEintrag), 'application/xml');
    for (const sheet of Array.from(xml.getElementsByTagNameNS(NS, 'sheet'))) {
      namen.push(sheet.getAttribute('name') ?? `Tabelle${namen.length + 1}`);
    }
  }

  const blattEintraege = eintraege
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
    .sort((a, b) => Number(/(\d+)/.exec(a.name)![1]) - Number(/(\d+)/.exec(b.name)![1]));

  const tabellen: GeleseneTabelle[] = [];
  for (let i = 0; i < blattEintraege.length; i++) {
    const xml = new DOMParser().parseFromString(await entpacke(puffer, daten, blattEintraege[i]), 'application/xml');
    const zeilen: string[][] = [];

    for (const row of Array.from(xml.getElementsByTagNameNS(NS, 'row'))) {
      const zeile: string[] = [];
      for (const c of Array.from(row.getElementsByTagNameNS(NS, 'c'))) {
        const spalte = spaltenIndex(c.getAttribute('r') ?? 'A');
        const typ = c.getAttribute('t');
        let wert = '';
        if (typ === 's') {
          const v = c.getElementsByTagNameNS(NS, 'v')[0];
          wert = geteilt[Number(v?.textContent ?? '0')] ?? '';
        } else if (typ === 'inlineStr') {
          wert = textVon(c.getElementsByTagNameNS(NS, 'is')[0] ?? null);
        } else {
          wert = c.getElementsByTagNameNS(NS, 'v')[0]?.textContent ?? '';
        }
        while (zeile.length < spalte) zeile.push('');
        zeile[spalte] = wert.trim();
      }
      if (zeile.some((z) => z !== '')) zeilen.push(zeile);
    }

    tabellen.push({ name: namen[i] ?? `Tabelle${i + 1}`, zeilen });
  }
  return tabellen;
}

/* ----------------------------- CSV ------------------------------- */

/** Liest eine Textliste; Trennzeichen wird erkannt (Semikolon, Komma, Tabulator). */
export async function csvLesen(datei: File): Promise<GeleseneTabelle[]> {
  const text = await datei.text();
  const erste = text.split(/\r?\n/)[0] ?? '';
  const trenner = [';', '\t', ','].reduce((a, b) =>
    (erste.split(b).length > erste.split(a).length ? b : a),
  ';');

  const zeilen: string[][] = [];
  let feld = '';
  let zeile: string[] = [];
  let inAnfuehrung = false;

  for (let i = 0; i < text.length; i++) {
    const z = text[i];
    if (inAnfuehrung) {
      if (z === '"' && text[i + 1] === '"') {
        feld += '"';
        i++;
      } else if (z === '"') inAnfuehrung = false;
      else feld += z;
      continue;
    }
    if (z === '"') inAnfuehrung = true;
    else if (z === trenner) {
      zeile.push(feld.trim());
      feld = '';
    } else if (z === '\n') {
      zeile.push(feld.trim());
      if (zeile.some((f) => f !== '')) zeilen.push(zeile);
      zeile = [];
      feld = '';
    } else if (z !== '\r') feld += z;
  }
  zeile.push(feld.trim());
  if (zeile.some((f) => f !== '')) zeilen.push(zeile);

  return [{ name: datei.name, zeilen }];
}

/** Liest .xlsx oder .csv anhand der Dateiendung. */
export async function tabelleLesen(datei: File): Promise<GeleseneTabelle[]> {
  if (/\.csv$/i.test(datei.name) || /\.txt$/i.test(datei.name)) return csvLesen(datei);
  return xlsxLesen(datei);
}

/**
 * Ordnet die Spalten einer Tabelle den erwarteten Feldern zu. Groß-/Klein-
 * schreibung, Umlaute und Leerzeichen werden dabei ignoriert.
 */
export function spaltenZuordnen(
  kopf: string[],
  felder: Record<string, string[]>,
): Record<string, number> {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/ä/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/ü/g, 'u')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]/g, '');

  const kopfNorm = kopf.map(norm);
  const zuordnung: Record<string, number> = {};
  for (const [feld, bezeichnungen] of Object.entries(felder)) {
    const index = kopfNorm.findIndex((k) => bezeichnungen.some((b) => norm(b) === k));
    if (index >= 0) zuordnung[feld] = index;
  }
  return zuordnung;
}

/** Wandelt gebräuchliche Datumsangaben in ein ISO-Datum. */
export function datumLesen(wert: string): string | null {
  const text = wert.trim();
  if (!text) return null;
  // Excel speichert Datumsangaben als Tageszahl seit dem 30.12.1899
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const tage = Number(text);
    const d = new Date(Date.UTC(1899, 11, 30) + tage * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const de = /^(\d{1,2})[.](\d{1,2})[.](\d{2,4})$/.exec(text);
  if (de) {
    const jahr = de[3].length === 2 ? `20${de[3]}` : de[3];
    return `${jahr}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return null;
}
