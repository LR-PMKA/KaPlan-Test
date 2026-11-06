/**
 * Sehr schlanker XLSX-Schreiber ohne externe Abhängigkeit.
 *
 * Erzeugt eine gültige Arbeitsmappe (OOXML) als ZIP-Datei. Die Einträge werden
 * unkomprimiert abgelegt ("stored"), was der ZIP-Spezifikation entspricht und
 * von Excel, LibreOffice und Numbers gelesen wird.
 *
 * Zellen können schlichte Werte sein oder formatiert (Schrift, Füllung,
 * Rahmen, Ausrichtung, Umbruch, Datum, Zahlenformat, Formel). Ein Blatt kann
 * Zellen zusammenfassen, Spaltenbreiten und Zeilenhöhen vorgeben, obere
 * Zeilen fixieren und quer oder hoch auf Seitenbreite gedruckt werden – mit
 * Druckbereich, wiederholten Kopfzeilen und Fußzeile. Bilder (PNG, JPEG)
 * liegen frei über den Zellen, etwa ein Logo im Kopf; sie stehen als
 * Binäreinträge im ZIP.
 *
 * Alle Angaben über die schlichte Zelle hinaus sind freiwillig; wer sie nicht
 * nutzt, erhält dieselbe Datei wie zuvor.
 */

/** Gestaltung einer Zelle; Farben als Hexwert RRGGBB. */
export interface Stil {
  fett?: boolean;
  kursiv?: boolean;
  /** Schriftgröße in Punkt (Vorgabe 11). */
  groesse?: number;
  farbe?: string;
  fuellung?: string;
  /** Dünner Rahmen rundum. */
  rahmen?: boolean;
  /** Waagerecht mittig; ohne `oben` auch senkrecht mittig. */
  zentriert?: boolean;
  /** Schriftart (Vorgabe Calibri), etwa „Arial“. */
  schriftart?: string;
  /** Excel-Zahlenformat, etwa „0.00“ oder „#,##0.00“; Excel zeigt es in der Schreibweise des Rechners an. */
  zahlenformat?: string;
  /** Text in der Zelle umbrechen – auch an Zeilenumbrüchen im Wert. */
  umbruch?: boolean;
  /** Rechtsbündig. */
  rechts?: boolean;
  /** Senkrecht oben ausrichten. */
  oben?: boolean;
}

export interface FormatierteZelle {
  wert: string | number | null | undefined;
  /** Der Wert ist ein Datum JJJJ-MM-TT – er wird als Excel-Datum (TT.MM.JJJJ) abgelegt. */
  datum?: boolean;
  /**
   * Formel ohne führendes „=“, etwa „SUM(D6:D9)“. `wert` ist ihr vorab
   * berechnetes Ergebnis; Excel rechnet beim Öffnen neu.
   */
  formel?: string;
  stil?: Stil;
}

export type Zelle = string | number | null | undefined | FormatierteZelle;

export interface Blatt {
  name: string;
  zeilen: Zelle[][];
  /** Erste Zeile fett als Kopfzeile setzen (Vorgabe); bei eigener Gestaltung abschalten. */
  kopfzeileFett?: boolean;
  /** Spaltenbreiten in Zeichen; sonst nach dem Inhalt. */
  spaltenbreiten?: number[];
  /** Zusammengefasste Zellbereiche, z.B. „A1:I1“. */
  zusammenfassen?: string[];
  /** Anzahl der oberen Zeilen, die beim Scrollen stehen bleiben. */
  fixierteZeilen?: number;
  /** Druck im Querformat, auf Seitenbreite eingepasst (A4). */
  querformat?: boolean;
  /** Druck im Hochformat, auf Seitenbreite eingepasst (A4). */
  hochformat?: boolean;
  /** Zeilenhöhen in Punkt, je Zeile; leer = nach dem Inhalt. */
  zeilenhoehen?: (number | null | undefined)[];
  /** Druckbereich, etwa „A1:D18“; Zellen außerhalb erscheinen nicht im Druck. */
  druckbereich?: string;
  /** Anzahl der oberen Zeilen, die auf jeder Druckseite wiederholt werden. */
  wiederholteZeilen?: number;
  /**
   * Fußzeile im Druck, links, mittig und rechts. Excel-Kürzel gelten: „&P“
   * Seitenzahl, „&N“ Zahl der Seiten; ein einzelnes „&“ als „&&“ schreiben.
   */
  fusszeile?: { links?: string; mitte?: string; rechts?: string };
  /** Bilder über den Zellen, etwa ein Logo im Kopf. */
  bilder?: Bild[];
}

/**
 * Bild im Blatt (PNG oder JPEG), frei über den Zellen. Lage und Größe gelten in
 * Bildpunkten (96 dpi) ab der linken oberen Ecke des Blatts; verankert wird es
 * an der Zelle, in der seine linke obere Ecke liegt – so wandert es mit, wenn
 * darüber Zeilen oder davor Spalten eingefügt werden.
 */
export interface Bild {
  /** Bilddaten; andere Formate als PNG und JPEG werden übergangen (`bildArt`). */
  daten: Uint8Array;
  x: number;
  y: number;
  breite: number;
  hoehe: number;
  /** Beschreibung (Alternativtext). */
  name?: string;
}

/** Format von Bilddaten anhand ihrer ersten Bytes: PNG, JPEG oder null. */
export function bildArt(daten: Uint8Array): 'png' | 'jpeg' | null {
  if (daten.length > 8 && daten[0] === 0x89 && daten[1] === 0x50 && daten[2] === 0x4e && daten[3] === 0x47) return 'png';
  if (daten.length > 3 && daten[0] === 0xff && daten[1] === 0xd8 && daten[2] === 0xff) return 'jpeg';
  return null;
}

/** Größe eines PNG- oder JPEG-Bilds in Bildpunkten; null, wenn sie sich nicht lesen lässt. */
export function bildGroesse(daten: Uint8Array): { breite: number; hoehe: number } | null {
  const art = bildArt(daten);
  const wort = (i: number) => (daten[i] << 8) | daten[i + 1];
  if (art === 'png' && daten.length >= 24) {
    const zahl = (i: number) => ((daten[i] << 24) >>> 0) + (daten[i + 1] << 16) + (daten[i + 2] << 8) + daten[i + 3];
    return { breite: zahl(16), hoehe: zahl(20) };
  }
  if (art === 'jpeg') {
    // Die Größe steht im ersten SOF-Abschnitt (0xC0–0xCF außer 0xC4, 0xC8, 0xCC)
    let i = 2;
    while (i + 9 < daten.length) {
      if (daten[i] !== 0xff) {
        i++;
        continue;
      }
      const marke = daten[i + 1];
      if (marke >= 0xc0 && marke <= 0xcf && marke !== 0xc4 && marke !== 0xc8 && marke !== 0xcc) {
        return { breite: wort(i + 7), hoehe: wort(i + 5) };
      }
      i += 2 + wort(i + 2);
    }
  }
  return null;
}

/* ----------------------------- ZIP ------------------------------- */

const crcTabelle = (() => {
  const tabelle = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabelle[i] = c >>> 0;
  }
  return tabelle;
})();

function crc32(daten: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < daten.length; i++) c = crcTabelle[(c ^ daten[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEintrag {
  name: string;
  laenge: number;
  crc: number;
  offset: number;
}

/** Eintrag im ZIP: Text (als UTF-8 abgelegt) oder Bytes, etwa ein Bild. */
interface ZipDatei {
  name: string;
  inhalt: string | Uint8Array;
}

function schreibeZip(dateien: ZipDatei[]): Blob {
  const encoder = new TextEncoder();
  const teile: Uint8Array[] = [];
  const eintraege: ZipEintrag[] = [];
  let offset = 0;

  const zahl = (wert: number, bytes: number) => {
    const out = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) out[i] = (wert >>> (i * 8)) & 0xff;
    return out;
  };

  const anhaengen = (...bloecke: Uint8Array[]) => {
    for (const b of bloecke) {
      teile.push(b);
      offset += b.length;
    }
  };

  for (const datei of dateien) {
    const name = encoder.encode(datei.name);
    const daten = typeof datei.inhalt === 'string' ? encoder.encode(datei.inhalt) : datei.inhalt;
    const crc = crc32(daten);
    eintraege.push({ name: datei.name, laenge: daten.length, crc, offset });

    anhaengen(
      zahl(0x04034b50, 4), // Signatur lokaler Dateikopf
      zahl(20, 2), // benötigte Version
      zahl(0x0800, 2), // Flags: Dateinamen in UTF-8
      zahl(0, 2), // Methode: unkomprimiert
      zahl(0, 2), // Uhrzeit
      zahl(0, 2), // Datum
      zahl(crc, 4),
      zahl(daten.length, 4),
      zahl(daten.length, 4),
      zahl(name.length, 2),
      zahl(0, 2), // keine Zusatzfelder
      name,
      daten,
    );
  }

  const verzeichnisStart = offset;
  for (const e of eintraege) {
    const name = encoder.encode(e.name);
    anhaengen(
      zahl(0x02014b50, 4), // Signatur Zentralverzeichnis
      zahl(20, 2),
      zahl(20, 2),
      zahl(0x0800, 2),
      zahl(0, 2),
      zahl(0, 2),
      zahl(0, 2),
      zahl(e.crc, 4),
      zahl(e.laenge, 4),
      zahl(e.laenge, 4),
      zahl(name.length, 2),
      zahl(0, 2),
      zahl(0, 2),
      zahl(0, 2),
      zahl(0, 2),
      zahl(0, 4),
      zahl(e.offset, 4),
      name,
    );
  }

  anhaengen(
    zahl(0x06054b50, 4), // Ende des Zentralverzeichnisses
    zahl(0, 2),
    zahl(0, 2),
    zahl(eintraege.length, 2),
    zahl(eintraege.length, 2),
    zahl(offset - verzeichnisStart, 4),
    zahl(verzeichnisStart, 4),
    zahl(0, 2),
  );

  return new Blob(teile as BlobPart[], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/* ---------------------------- XLSX ------------------------------- */

/** Maskiert XML-Sonderzeichen und entfernt in XML unzulässige Steuerzeichen. */
function xmlText(wert: string): string {
  return wert
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Spaltenname zu einem Index: 0 → A, 26 → AA. */
export function spalte(index: number): string {
  let name = '';
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/** Blattnamen auf die von Excel erlaubte Form bringen. */
function blattName(name: string, index: number): string {
  const sauber = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31);
  return sauber || `Tabelle${index + 1}`;
}

const istFormatiert = (z: Zelle): z is FormatierteZelle => typeof z === 'object' && z !== null;

/** Zahlenformate, die Excel unter fester Nummer mitbringt. */
const EINGEBAUTE_ZAHLENFORMATE: Record<string, number> = {
  '0': 1,
  '0.00': 2,
  '#,##0': 3,
  '#,##0.00': 4,
  '0%': 9,
  '0.00%': 10,
  '@': 49,
};

/** „A1:D18“ → „$A$1:$D$18“ – absolute Bezüge für Druckbereiche. */
function absolut(bereich: string): string {
  return bereich.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2');
}

/** Blattname in Bezügen, etwa „'Leistungsnachweis'“. */
const blattBezug = (name: string) => `'${name.replace(/'/g, "''")}'`;

/** Fußzeile aus ihren drei Teilen mit den Excel-Kürzeln für links (&L), mittig (&C) und rechts (&R). */
function fussText(teil: { links?: string; mitte?: string; rechts?: string }): string {
  return [
    teil.links ? `&L${teil.links}` : '',
    teil.mitte ? `&C${teil.mitte}` : '',
    teil.rechts ? `&R${teil.rechts}` : '',
  ].join('');
}

/** Excel zählt Tage ab dem 30.12.1899. */
function excelDatum(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 + 25569;
}

/**
 * Sammelt die Zellformate einer Arbeitsmappe. Format 0 ist die schlichte
 * Zelle, Format 1 die fette Kopfzeile; jedes weitere entsteht beim ersten
 * Gebrauch.
 */
class Formate {
  private schriften = ['<font><sz val="11"/><name val="Calibri"/></font>', '<font><b/><sz val="11"/><name val="Calibri"/></font>'];
  private fuellungen = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private rahmen = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>',
  ];
  private formate = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
  ];
  /** Eigene Zahlenformate ab Nummer 165 (164 ist das Datum). */
  private zahlenformate: string[] = [];

  private index(liste: string[], eintrag: string): number {
    const i = liste.indexOf(eintrag);
    if (i >= 0) return i;
    liste.push(eintrag);
    return liste.length - 1;
  }

  /** Nummer eines Zahlenformats: eingebaute Formate über ihre feste Nummer, sonst ein eigenes. */
  private zahlenformat(code: string): number {
    const eingebaut = EINGEBAUTE_ZAHLENFORMATE[code];
    if (eingebaut !== undefined) return eingebaut;
    return 165 + this.index(this.zahlenformate, code);
  }

  /** Index des Zellformats für Stil und Datum. */
  von(stil: Stil = {}, datum = false): number {
    const farbe = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
    const schrift = this.index(
      this.schriften,
      `<font>${stil.fett ? '<b/>' : ''}${stil.kursiv ? '<i/>' : ''}<sz val="${stil.groesse ?? 11}"/>${
        stil.farbe ? `<color rgb="${farbe(stil.farbe)}"/>` : ''
      }<name val="${xmlText(stil.schriftart ?? 'Calibri')}"/></font>`,
    );
    const fuellung = stil.fuellung
      ? this.index(
          this.fuellungen,
          `<fill><patternFill patternType="solid"><fgColor rgb="${farbe(stil.fuellung)}"/><bgColor indexed="64"/></patternFill></fill>`,
        )
      : 0;
    const rahmen = stil.rahmen ? 1 : 0;
    const zahl = datum ? 164 : stil.zahlenformat ? this.zahlenformat(stil.zahlenformat) : 0;
    // Ohne die neuen Angaben entstehen dieselben Formate wie zuvor (zentriert bzw. Datum linksbündig).
    const waagerecht = stil.zentriert ? 'center' : stil.rechts ? 'right' : datum ? 'left' : '';
    const senkrecht = stil.oben ? 'top' : stil.zentriert ? 'center' : '';
    const angaben = [
      waagerecht ? `horizontal="${waagerecht}"` : '',
      senkrecht ? `vertical="${senkrecht}"` : '',
      stil.umbruch ? 'wrapText="1"' : '',
    ].filter(Boolean);
    const ausrichtung = angaben.length ? `<alignment ${angaben.join(' ')}/>` : '';
    return this.index(
      this.formate,
      `<xf numFmtId="${zahl}" fontId="${schrift}" fillId="${fuellung}" borderId="${rahmen}" xfId="0"${
        zahl ? ' applyNumberFormat="1"' : ''
      } applyFont="1" applyFill="1" applyBorder="1"${ausrichtung ? ` applyAlignment="1">${ausrichtung}</xf>` : '/>'}`,
    );
  }

  xml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="${1 + this.zahlenformate.length}"><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/>${this.zahlenformate
      .map((code, i) => `<numFmt numFmtId="${165 + i}" formatCode="${xmlText(code)}"/>`)
      .join('')}</numFmts>
<fonts count="${this.schriften.length}">${this.schriften.join('')}</fonts>
<fills count="${this.fuellungen.length}">${this.fuellungen.join('')}</fills>
<borders count="${this.rahmen.length}">${this.rahmen.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${this.formate.length}">${this.formate.join('')}</cellXfs>
</styleSheet>`;
  }
}

/** Anzeigetext einer Zelle – Grundlage der Spaltenbreite. */
function text(zelle: Zelle): string {
  const wert = istFormatiert(zelle) ? zelle.wert : zelle;
  return istFormatiert(zelle) && zelle.datum ? '00.00.0000' : String(wert ?? '');
}

/** Breiten aller Spalten in Zeichen: vorgegeben oder nach dem Inhalt. */
function spaltenbreitenVon(blatt: Blatt): number[] {
  const spaltenzahl = Math.max(...blatt.zeilen.map((z) => z.length), blatt.spaltenbreiten?.length ?? 0, 1);
  return Array.from({ length: spaltenzahl }, (_, c) => {
    const vorgabe = blatt.spaltenbreiten?.[c];
    return vorgabe ?? Math.min(60, Math.max(...blatt.zeilen.map((z) => text(z[c]).length), 10) + 3);
  });
}

/** Namensraum der Beziehungen (r:id) in Blatt und Zeichnung. */
const BEZIEHUNGEN_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/**
 * Blatt als XML. `zeichnung`: Kennung der Beziehung zur Zeichnung mit den
 * Bildern; ohne Bilder bleibt das Blatt, wie es war.
 */
function blattXml(blatt: Blatt, formate: Formate, zeichnung?: string): string {
  const kopfFett = blatt.kopfzeileFett ?? true;
  const zeilen = blatt.zeilen
    .map((zeile, r) => {
      const zellen = zeile
        .map((zelle, c) => {
          const ref = `${spalte(c)}${r + 1}`;
          let wert = istFormatiert(zelle) ? zelle.wert : zelle;
          let format = r === 0 && kopfFett ? 1 : 0;
          if (istFormatiert(zelle)) {
            const datum = zelle.datum && typeof wert === 'string' ? excelDatum(wert) : null;
            if (datum !== null) wert = datum;
            format = formate.von(zelle.stil, datum !== null);
          }
          const stil = format ? ` s="${format}"` : '';
          const formel = istFormatiert(zelle) && zelle.formel ? `<f>${xmlText(zelle.formel)}</f>` : '';
          if (formel) {
            const ergebnis = typeof wert === 'number' && Number.isFinite(wert) ? `<v>${wert}</v>` : '';
            return `<c r="${ref}"${stil}>${formel}${ergebnis}</c>`;
          }
          if (wert === null || wert === undefined || wert === '') return `<c r="${ref}"${stil}/>`;
          if (typeof wert === 'number' && Number.isFinite(wert)) {
            return `<c r="${ref}"${stil}><v>${wert}</v></c>`;
          }
          return `<c r="${ref}"${stil} t="inlineStr"><is><t xml:space="preserve">${xmlText(String(wert))}</t></is></c>`;
        })
        .join('');
      const hoehe = blatt.zeilenhoehen?.[r];
      return `<row r="${r + 1}"${hoehe ? ` ht="${hoehe}" customHeight="1"` : ''}>${zellen}</row>`;
    })
    .join('');

  const breiten = spaltenbreitenVon(blatt)
    .map((laenge, c) => `<col min="${c + 1}" max="${c + 1}" width="${laenge}" customWidth="1"/>`)
    .join('');

  const fixiert = blatt.fixierteZeilen
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${blatt.fixierteZeilen}" topLeftCell="A${
        blatt.fixierteZeilen + 1
      }" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '';
  const zusammen = blatt.zusammenfassen?.length
    ? `<mergeCells count="${blatt.zusammenfassen.length}">${blatt.zusammenfassen
        .map((ref) => `<mergeCell ref="${ref}"/>`)
        .join('')}</mergeCells>`
    : '';

  const druck = blatt.querformat
    ? '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
    : blatt.hochformat
      ? '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>'
      : '';
  const fuss = blatt.fusszeile ? fussText(blatt.fusszeile) : '';
  const kopfFuss = fuss ? `<headerFooter><oddFooter>${xmlText(fuss)}</oddFooter></headerFooter>` : '';
  const eingepasst = blatt.querformat || blatt.hochformat;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"${zeichnung ? ` xmlns:r="${BEZIEHUNGEN_NS}"` : ''}>
${eingepasst ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : ''}${fixiert}<cols>${breiten}</cols><sheetData>${zeilen}</sheetData>${zusammen}${druck}${kopfFuss}${
    zeichnung ? `<drawing r:id="${zeichnung}"/>` : ''
  }</worksheet>`;
}

/* ---------------------------- Bilder ------------------------------ */

/** 1 Bildpunkt (96 dpi) in EMU, der Längeneinheit von DrawingML. */
const EMU = 9525;

/**
 * Breite einer Spalte (in Zeichen, wie `Blatt.spaltenbreiten`) in Bildpunkten –
 * so rechnet Excel bei der Standardschrift Calibri 11 (Ziffernbreite 7 px).
 * Hilft, Bilder an Spalten auszurichten.
 */
export function spaltePixel(breite: number): number {
  return Math.trunc(((256 * breite + Math.trunc(128 / 7)) / 256) * 7);
}

/** Zelle (0-basiert) und Versatz in Bildpunkten zu einer Lage, aus den Größen der Spalten bzw. Zeilen. */
function anker(lage: number, groesse: (index: number) => number): { index: number; versatz: number } {
  let index = 0;
  let rest = Math.max(0, lage);
  // Begrenzt, damit eine unsinnige Lage nicht endlos zählt
  while (index < 16384 && rest >= groesse(index)) {
    rest -= groesse(index);
    index++;
  }
  return { index, versatz: rest };
}

/** Bild mit Format und Dateiname im ZIP. */
interface MedienBild {
  bild: Bild;
  art: 'png' | 'jpeg';
  datei: string;
}

/** Zeichnung (xl/drawings/drawingN.xml) mit den Bildern eines Blatts, verankert an je einer Zelle. */
function zeichnungXml(blatt: Blatt, bilder: MedienBild[]): string {
  const spalten = spaltenbreitenVon(blatt).map(spaltePixel);
  // Spalten ohne Angabe haben die Standardbreite, Zeilen ohne Angabe 15 pt
  const spaltenBreite = (c: number) => spalten[c] ?? 64;
  const zeilenHoehe = (r: number) => ((blatt.zeilenhoehen?.[r] ?? 15) * 96) / 72;
  const verankert = bilder
    .map(({ bild }, i) => {
      const x = anker(bild.x, spaltenBreite);
      const y = anker(bild.y, zeilenHoehe);
      const cx = Math.round(bild.breite * EMU);
      const cy = Math.round(bild.hoehe * EMU);
      const name = xmlText(bild.name ?? `Bild ${i + 1}`);
      return `<xdr:oneCellAnchor><xdr:from><xdr:col>${x.index}</xdr:col><xdr:colOff>${Math.round(x.versatz * EMU)}</xdr:colOff><xdr:row>${
        y.index
      }</xdr:row><xdr:rowOff>${Math.round(y.versatz * EMU)}</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${
        i + 2
      }" name="${name}" descr="${name}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${
        i + 1
      }"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${BEZIEHUNGEN_NS}">${verankert}</xdr:wsDr>`;
}

/** Beziehungen als XML. */
function beziehungenXml(eintraege: { id: string; typ: string; ziel: string }[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${eintraege.map((e) => `<Relationship Id="${e.id}" Type="${BEZIEHUNGEN_NS}/${e.typ}" Target="${e.ziel}"/>`).join('\n')}
</Relationships>`;
}

/** Erzeugt eine Arbeitsmappe mit einem Blatt je Eintrag. */
export function xlsxErzeugen(blaetter: Blatt[]): Blob {
  const namen = blaetter.map((b, i) => blattName(b.name, i));
  // Bilder je Blatt (nur PNG und JPEG); jedes Blatt mit Bildern erhält eine Zeichnung
  let bildNummer = 0;
  let zeichnungNummer = 0;
  const zeichnungen = blaetter.map((b) => {
    const bilder: MedienBild[] = [];
    for (const bild of b.bilder ?? []) {
      const art = bildArt(bild.daten);
      if (!art || !(bild.breite > 0) || !(bild.hoehe > 0)) continue;
      bilder.push({ bild, art, datei: `image${++bildNummer}.${art === 'png' ? 'png' : 'jpeg'}` });
    }
    return bilder.length ? { nummer: ++zeichnungNummer, bilder } : null;
  });
  // Erst die Blätter, dabei entstehen die Zellformate
  const formate = new Formate();
  const blattDateien = blaetter.map((b, i) => ({
    name: `xl/worksheets/sheet${i + 1}.xml`,
    inhalt: blattXml(b, formate, zeichnungen[i] ? 'rId1' : undefined),
  }));
  const zeichnungDateien: ZipDatei[] = blaetter.flatMap((b, i) => {
    const z = zeichnungen[i];
    if (!z) return [];
    return [
      {
        name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        inhalt: beziehungenXml([{ id: 'rId1', typ: 'drawing', ziel: `../drawings/drawing${z.nummer}.xml` }]),
      },
      { name: `xl/drawings/drawing${z.nummer}.xml`, inhalt: zeichnungXml(b, z.bilder) },
      {
        name: `xl/drawings/_rels/drawing${z.nummer}.xml.rels`,
        inhalt: beziehungenXml(z.bilder.map((m, k) => ({ id: `rId${k + 1}`, typ: 'image', ziel: `../media/${m.datei}` }))),
      },
      ...z.bilder.map((m) => ({ name: `xl/media/${m.datei}`, inhalt: m.bild.daten })),
    ];
  });
  const arten = new Set(zeichnungen.flatMap((z) => z?.bilder.map((m) => m.art) ?? []));
  const medienTypen = [
    arten.has('png') ? '<Default Extension="png" ContentType="image/png"/>\n' : '',
    arten.has('jpeg') ? '<Default Extension="jpeg" ContentType="image/jpeg"/>\n' : '',
  ].join('');
  const zeichnungTypen = zeichnungen
    .filter((z): z is NonNullable<typeof z> => !!z)
    .map((z) => `\n<Override PartName="/xl/drawings/drawing${z.nummer}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`)
    .join('');
  // Druckbereiche und wiederholte Zeilen stehen als benannte Bereiche in der Mappe
  const namenXml = blaetter
    .flatMap((b, i) => [
      b.druckbereich
        ? `<definedName name="_xlnm.Print_Area" localSheetId="${i}">${xmlText(`${blattBezug(namen[i])}!${absolut(b.druckbereich)}`)}</definedName>`
        : '',
      b.wiederholteZeilen
        ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${xmlText(`${blattBezug(namen[i])}!$1:$${b.wiederholteZeilen}`)}</definedName>`
        : '',
    ])
    .join('');
  const mitFormeln = blaetter.some((b) => b.zeilen.some((z) => z.some((zelle) => istFormatiert(zelle) && !!zelle.formel)));

  const dateien: ZipDatei[] = [
    {
      name: '[Content_Types].xml',
      inhalt: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${medienTypen}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${blaetter.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}${zeichnungTypen}
</Types>`,
    },
    {
      name: '_rels/.rels',
      inhalt: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      inhalt: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${namen.map((n, i) => `<sheet name="${xmlText(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${
        namenXml ? `<definedNames>${namenXml}</definedNames>` : ''
      }${mitFormeln ? '<calcPr fullCalcOnLoad="1"/>' : ''}
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      inhalt: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${blaetter.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${blaetter.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: 'xl/styles.xml', inhalt: formate.xml() },
    ...blattDateien,
    ...zeichnungDateien,
  ];

  return schreibeZip(dateien);
}

/** Lädt einen Blob als Datei herunter. */
export function dateiLaden(blob: Blob, dateiname: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
