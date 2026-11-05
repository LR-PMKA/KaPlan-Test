/**
 * Sehr schlanker XLSX-Schreiber ohne externe Abhängigkeit.
 *
 * Erzeugt eine gültige Arbeitsmappe (OOXML) als ZIP-Datei. Die Einträge werden
 * unkomprimiert abgelegt ("stored"), was der ZIP-Spezifikation entspricht und
 * von Excel, LibreOffice und Numbers gelesen wird.
 *
 * Zellen können schlichte Werte sein oder formatiert (Schrift, Füllung,
 * Rahmen, Datum). Ein Blatt kann Zellen zusammenfassen, Spaltenbreiten
 * vorgeben, obere Zeilen fixieren und quer auf Seitenbreite gedruckt werden.
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
  zentriert?: boolean;
}

export interface FormatierteZelle {
  wert: string | number | null | undefined;
  /** Der Wert ist ein Datum JJJJ-MM-TT – er wird als Excel-Datum (TT.MM.JJJJ) abgelegt. */
  datum?: boolean;
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

function schreibeZip(dateien: { name: string; inhalt: string }[]): Blob {
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
    const daten = encoder.encode(datei.inhalt);
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

  private index(liste: string[], eintrag: string): number {
    const i = liste.indexOf(eintrag);
    if (i >= 0) return i;
    liste.push(eintrag);
    return liste.length - 1;
  }

  /** Index des Zellformats für Stil und Datum. */
  von(stil: Stil = {}, datum = false): number {
    const farbe = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
    const schrift = this.index(
      this.schriften,
      `<font>${stil.fett ? '<b/>' : ''}${stil.kursiv ? '<i/>' : ''}<sz val="${stil.groesse ?? 11}"/>${
        stil.farbe ? `<color rgb="${farbe(stil.farbe)}"/>` : ''
      }<name val="Calibri"/></font>`,
    );
    const fuellung = stil.fuellung
      ? this.index(
          this.fuellungen,
          `<fill><patternFill patternType="solid"><fgColor rgb="${farbe(stil.fuellung)}"/><bgColor indexed="64"/></patternFill></fill>`,
        )
      : 0;
    const rahmen = stil.rahmen ? 1 : 0;
    const ausrichtung = stil.zentriert
      ? '<alignment horizontal="center" vertical="center"/>'
      : datum
        ? '<alignment horizontal="left"/>'
        : '';
    return this.index(
      this.formate,
      `<xf numFmtId="${datum ? 164 : 0}" fontId="${schrift}" fillId="${fuellung}" borderId="${rahmen}" xfId="0"${
        datum ? ' applyNumberFormat="1"' : ''
      } applyFont="1" applyFill="1" applyBorder="1"${ausrichtung ? ` applyAlignment="1">${ausrichtung}</xf>` : '/>'}`,
    );
  }

  xml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/></numFmts>
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

function blattXml(blatt: Blatt, formate: Formate): string {
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
          if (wert === null || wert === undefined || wert === '') return `<c r="${ref}"${stil}/>`;
          if (typeof wert === 'number' && Number.isFinite(wert)) {
            return `<c r="${ref}"${stil}><v>${wert}</v></c>`;
          }
          return `<c r="${ref}"${stil} t="inlineStr"><is><t xml:space="preserve">${xmlText(String(wert))}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${zellen}</row>`;
    })
    .join('');

  const spaltenzahl = Math.max(...blatt.zeilen.map((z) => z.length), blatt.spaltenbreiten?.length ?? 0, 1);
  const breiten = Array.from({ length: spaltenzahl }, (_, c) => {
    const vorgabe = blatt.spaltenbreiten?.[c];
    const laenge = vorgabe ?? Math.min(60, Math.max(...blatt.zeilen.map((z) => text(z[c]).length), 10) + 3);
    return `<col min="${c + 1}" max="${c + 1}" width="${laenge}" customWidth="1"/>`;
  }).join('');

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
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${blatt.querformat ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : ''}${fixiert}<cols>${breiten}</cols><sheetData>${zeilen}</sheetData>${zusammen}${druck}</worksheet>`;
}

/** Erzeugt eine Arbeitsmappe mit einem Blatt je Eintrag. */
export function xlsxErzeugen(blaetter: Blatt[]): Blob {
  const namen = blaetter.map((b, i) => blattName(b.name, i));
  // Erst die Blätter, dabei entstehen die Zellformate
  const formate = new Formate();
  const blattDateien = blaetter.map((b, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, inhalt: blattXml(b, formate) }));

  const dateien = [
    {
      name: '[Content_Types].xml',
      inhalt: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${blaetter.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
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
<sheets>${namen.map((n, i) => `<sheet name="${xmlText(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
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
