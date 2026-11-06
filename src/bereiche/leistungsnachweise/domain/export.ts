/**
 * Excel-Ausgaben des Bereichs – alle dem Controlling vorbehalten
 * (domain/rechte.ts, `darf(d, 'export')`):
 * * der Leistungsnachweis im Aufbau der Excel-Vorlagen (Kopf mit Logo,
 *   Tabelle mit Rahmen und grauem Tabellenkopf, Summe, Gesamtstunden,
 *   „geprüft und freigegeben“; Druckbereich A4 hoch auf Seitenbreite) mit den
 *   abgerechneten Stunden,
 * * die Auswertung des Controllings (ein Blatt je Tabelle),
 * * Listen von Leistungen (eines Projekts bzw. aller Projekte im Zeitraum),
 * * eine Vorlage für den Import im Aufbau der Zeiterfassung.
 *
 * Wie in der Vorlage stehen rechts neben dem Druckbereich die erfassten
 * Stunden je Mitarbeiter („Wiko LR“ …) und der Aufschlag – zusammen ergeben
 * sie die abgerechnete Summe; zur Kontrolle, nicht im Druck.
 *
 * Die Blätter entstehen rein (`nachweisBlatt`, `auswertungBlaetter`,
 * `leistungenBlatt`, `importVorlageBlatt`); erst die Funktionen
 * `…Exportieren`/`…Laden` laden die Datei herunter. Das Logo des Nachweises
 * wird dafür geladen (`logosLaden`) – misslingt das, entsteht die Datei ohne Logo.
 */
import { formatDate, today } from '../../../shared/dates';
import {
  bildArt,
  bildGroesse,
  dateiLaden,
  spalte,
  spaltePixel,
  xlsxErzeugen,
  type Bild,
  type Blatt,
  type Stil,
  type Zelle,
} from '../../../shared/xlsx';
import { auswertung, zeitraumBezeichnung, type AuswertungFilter, type MitarbeiterTabelle } from './auswertung';
import { GESAMT, dateiname, logoQuelle, nachweisDateiname, nachweisFassung, spaltenStunden, type StundenSpalte } from './druck';
import { nachweisFuer, nachweisTitel, stundenVon } from './nachweis';
import { logosVon } from './seed';
import {
  QUELLE_LABEL,
  mitarbeiterName,
  projektKurzname,
  projektTitel,
  type ID,
  type Leistung,
  type Leistungsnachweis,
  type LeistungsnachweisDaten,
  type Logo,
  type Projekt,
} from './types';
import { monatText, monatsanfang, monatsende, stundenText } from './zeitraum';

/* ------------------------------------------------------------------ */
/* Logos                                                               */
/* ------------------------------------------------------------------ */

/** Logo als Bilddaten (PNG oder JPEG) mit seiner Größe in Bildpunkten – für die Excel-Datei. */
export interface LogoBild {
  name: string;
  daten: Uint8Array;
  breite: number;
  hoehe: number;
}

/**
 * Andere Bildformate (SVG, GIF, WebP …) über eine Zeichenfläche in PNG
 * umwandeln – nur im Browser; sonst null.
 */
async function alsPng(daten: Uint8Array, typ: string): Promise<Uint8Array | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const url = URL.createObjectURL(new Blob([daten as BlobPart], { type: typ }));
  try {
    const bild = new Image();
    bild.src = url;
    await bild.decode();
    if (!bild.naturalWidth || !bild.naturalHeight) return null;
    // Doppelte Auflösung, damit das Logo im Druck scharf bleibt
    const faktor = Math.min(2, 1600 / bild.naturalWidth);
    const flaeche = document.createElement('canvas');
    flaeche.width = Math.round(bild.naturalWidth * faktor);
    flaeche.height = Math.round(bild.naturalHeight * faktor);
    const ctx = flaeche.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bild, 0, 0, flaeche.width, flaeche.height);
    const png = await new Promise<Blob | null>((fertig) => flaeche.toBlob(fertig, 'image/png'));
    return png ? new Uint8Array(await png.arrayBuffer()) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Lädt ein Logo (Pfad unter `public/`, Adresse oder data:-URL) als Bilddaten.
 * PNG und JPEG bleiben, wie sie sind; andere Formate werden im Browser in PNG
 * umgewandelt. Jeder Fehler liefert null – die Datei entsteht dann ohne Logo.
 */
export async function logoBildLaden(logo: Logo): Promise<LogoBild | null> {
  try {
    const antwort = await fetch(logoQuelle(logo.src));
    if (!antwort.ok) return null;
    let daten: Uint8Array | null = new Uint8Array(await antwort.arrayBuffer());
    if (!bildArt(daten)) daten = await alsPng(daten, antwort.headers.get('content-type') ?? '');
    const groesse = daten ? bildGroesse(daten) : null;
    if (!daten || !groesse || !groesse.breite || !groesse.hoehe) return null;
    return { name: logo.name, daten, ...groesse };
  } catch {
    return null;
  }
}

/** Lädt alle Logos; was sich nicht laden lässt, entfällt. */
export async function logosLaden(logos: Logo[]): Promise<LogoBild[]> {
  const geladen = await Promise.all(logos.map(logoBildLaden));
  return geladen.filter((l): l is LogoBild => !!l);
}

/* ------------------------------------------------------------------ */
/* Leistungsnachweis                                                   */
/* ------------------------------------------------------------------ */

/** Schrift der Vorlage. */
const SCHRIFT = 'Arial';
const arial = (stil: Stil): Stil => ({ schriftart: SCHRIFT, groesse: 10, ...stil });

const KOPF = arial({ fett: true, groesse: 11, oben: true });
/** Zeitraum und Projekt im Kopf dürfen umbrechen („September – November 2026“ ist breiter als die Spalte). */
const KOPF_UMBRUCH = { ...KOPF, umbruch: true };
const KOPF_NUMMER = arial({ oben: true });
const TABELLENKOPF = arial({ fett: true, fuellung: 'C0C0C0', rahmen: true, zentriert: true, umbruch: true });
const ABSCHNITTSKOPF = arial({ fuellung: 'D9D9D9', rahmen: true, zentriert: true, umbruch: true });
const TEXT = arial({ rahmen: true, oben: true, umbruch: true });
const BEARBEITER = { ...TEXT, fett: true };
const STUNDEN = arial({ rahmen: true, oben: true, zentriert: true, zahlenformat: '0.00' });
const SUMME = arial({ rahmen: true, oben: true, rechts: true });
const FETT = arial({ fett: true, oben: true });
const GESAMTSTUNDEN = arial({ fett: true, oben: true, zentriert: true, zahlenformat: '0.00' });
const BEMERKUNG = arial({ oben: true, umbruch: true });
const FREIGABE = arial({ fett: true, rechts: true });
/* Kontrolle neben dem Druckbereich – rot auf Gelb wie die Wiko-Spalten der Vorlage */
const KONTROLLE_KOPF = arial({ fett: true, farbe: 'FF0000', fuellung: 'FFFF00', zentriert: true, oben: true, umbruch: true });
const KONTROLLE = arial({ farbe: 'FF0000', fuellung: 'FFFF00', zentriert: true, oben: true, zahlenformat: '0.00' });
const KONTROLLE_SUMME = { ...KONTROLLE, fuellung: 'FFFF99', fett: true };

/** Spaltenbreiten der Vorlage (Zeichen). */
const BREITE = { datum: 21.44, bearbeiter: 23.55, text: 93.44, textMitAbschnitten: 80, stunden: 12.55, luecke: 3, kontrolle: 11 };
const FREIGABE_TEXT = 'geprüft und freigegeben  ______________________';

/** Logo im Kopf: so hoch wie in der Vorlage Monat.xlsx, höchstens so breit. */
const LOGO = { hoehe: 44, breite: 200, abstand: 12, oben: 4, rechts: 6 };

/** Ein einzelnes „&“ in Kopf- und Fußzeilen schreibt Excel als „&&“. */
const fussText = (text: string) => text.replace(/&/g, '&&');

/**
 * Logos rechtsbündig über dem rechten Rand des Druckbereichs in Zeile 1 – wie
 * das Logo der Vorlage Monat.xlsx. `breiten`: Spaltenbreiten des Druckbereichs.
 */
function logoBilder(logos: LogoBild[], breiten: number[]): Bild[] {
  const masse = logos.map((l) => {
    const faktor = Math.min(LOGO.hoehe / l.hoehe, LOGO.breite / l.breite);
    return { logo: l, breite: Math.round(l.breite * faktor), hoehe: Math.round(l.hoehe * faktor) };
  });
  const rand = breiten.reduce((s, b) => s + spaltePixel(b), 0) - LOGO.rechts;
  let x = rand - masse.reduce((s, m) => s + m.breite, 0) - LOGO.abstand * Math.max(0, masse.length - 1);
  return masse.map((m) => {
    const bild: Bild = { daten: m.logo.daten, x: Math.max(0, x), y: LOGO.oben, breite: m.breite, hoehe: m.hoehe, name: m.logo.name };
    x += m.breite + LOGO.abstand;
    return bild;
  });
}

/**
 * Der Leistungsnachweis als Tabellenblatt – Aufbau wie die Excel-Vorlagen:
 * Zeilen 1–3 Kopf (rechts die Logos), ab Zeile 5 die Tabelle mit den
 * abgerechneten Stunden (ab zwei Abschnitten zweizeiliger Kopf mit „Aufwand
 * (Std)“ über den Abschnittsspalten), Summe mit Formeln, Gesamtstunden,
 * Bemerkung und „geprüft und freigegeben“. Rechts daneben die Kontrolle:
 * erfasste Stunden je Person und der Aufschlag.
 */
export function nachweisBlatt(daten: LeistungsnachweisDaten, n: Leistungsnachweis, projekt: Projekt, logos: LogoBild[] = []): Blatt {
  const f = nachweisFassung(daten, n, projekt, 'abgerechnet');
  const mitAbschnitten = f.spalten.length > 0;
  const stundenSpalten: StundenSpalte[] = mitAbschnitten ? f.spalten : [{ schluessel: GESAMT, kurz: 'Stunden', name: '' }];
  const ersteStunden = 3;
  const letzteStunden = ersteStunden + stundenSpalten.length - 1;
  const kontrollStart = letzteStunden + 2;
  const mitKontrolle = f.mitarbeiter.length > 0;
  const kopfzeilen = mitAbschnitten ? 2 : 1;
  /** Excel-Zeile der ersten Tabellenzeile. */
  const ersteZeile = 5 + kopfzeilen;
  const letzteZeile = ersteZeile + f.zeilen.length - 1;
  const summenZeile = letzteZeile + 1;

  const zeilen: Zelle[][] = [];
  const zusammenfassen: string[] = [];
  const zeilenhoehen: (number | null)[] = [];
  const zeile = (zellen: Zelle[], hoehe: number | null = null) => {
    zeilen.push(zellen);
    zeilenhoehen.push(hoehe);
  };
  /** Zellen der Stundenspalten und der Kontrolle an ihre Plätze setzen. */
  const mit = (links: Zelle[], stunden: Zelle[], kontrolle: Zelle[] = []): Zelle[] => {
    const z: Zelle[] = [...links];
    while (z.length < ersteStunden) z.push(null);
    z.push(...stunden);
    if (kontrolle.length) {
      while (z.length < kontrollStart) z.push(null);
      z.push(...kontrolle);
    }
    return z;
  };

  // Kopf: „Leistungsnachweis“ | Zeitraum | Projekt, darunter Leistungsbereich und Projektnummer
  zeile(
    f.titelRechts
      ? [{ wert: f.titelLinks, stil: KOPF }, { wert: f.titelRechts, stil: KOPF_UMBRUCH }, { wert: f.projektName, stil: KOPF_UMBRUCH }]
      : [{ wert: f.titelLinks, stil: KOPF }, null, { wert: f.projektName, stil: KOPF_UMBRUCH }],
  );
  if (!f.titelRechts) zusammenfassen.push('A1:B1');
  zeile([{ wert: 'Leistungsbereich', stil: KOPF }, null, { wert: f.leistungsbereich, stil: KOPF_UMBRUCH }]);
  zeile([null, null, f.projektNummer ? { wert: f.projektNummer, stil: KOPF_NUMMER } : null]);
  zeile([]);

  // Tabellenkopf; daneben die Kontrolle: erfasst je Person und der Aufschlag
  const kontrollKopf: Zelle[] = mitKontrolle
    ? [...f.mitarbeiter.map((m): Zelle => ({ wert: `Wiko ${m.kuerzel}`, stil: KONTROLLE_KOPF })), { wert: 'Aufschlag', stil: KONTROLLE_KOPF }]
    : [];
  const kopfZelle = (wert: string): Zelle => ({ wert, stil: TABELLENKOPF });
  if (mitAbschnitten) {
    zeile(
      mit(
        [kopfZelle('Datum'), kopfZelle('Bearbeiter'), kopfZelle('Leistungstext')],
        stundenSpalten.map((_, i) => kopfZelle(i === 0 ? 'Aufwand (Std)' : '')),
      ),
      24,
    );
    zeile(
      mit(
        [kopfZelle(''), kopfZelle(''), kopfZelle('')],
        stundenSpalten.map((s): Zelle => ({ wert: s.kurz, stil: s.schluessel === GESAMT ? { ...ABSCHNITTSKOPF, fett: true } : ABSCHNITTSKOPF })),
        kontrollKopf,
      ),
      24,
    );
    zusammenfassen.push('A5:A6', 'B5:B6', 'C5:C6', `${spalte(ersteStunden)}5:${spalte(letzteStunden)}5`);
  } else {
    zeile(mit([kopfZelle('Datum'), kopfZelle('Bearbeiter'), kopfZelle('Leistungstext')], [kopfZelle('Stunden')], kontrollKopf), 27);
  }

  // Je Tag, Woche oder Monat eine Zeile – mit den abgerechneten Stunden
  const ersteAbschnitt = spalte(ersteStunden);
  const letzteAbschnitt = spalte(letzteStunden - 1);
  f.zeilen.forEach((z, i) => {
    const r = ersteZeile + i;
    const stunden = stundenSpalten.map((s): Zelle => {
      const wert = spaltenStunden(z, s.schluessel, f.werte);
      if (mitAbschnitten && s.schluessel === GESAMT) {
        return { wert, formel: `SUM(${ersteAbschnitt}${r}:${letzteAbschnitt}${r})`, stil: { ...STUNDEN, fett: true } };
      }
      return { wert: wert || null, stil: STUNDEN };
    });
    const kontrolle: Zelle[] = mitKontrolle
      ? [
          ...f.mitarbeiter.map((m): Zelle => ({ wert: z.stundenJeMitarbeiter[m.id] || null, stil: KONTROLLE })),
          { wert: z.aufschlag || null, stil: KONTROLLE },
        ]
      : [];
    zeile(
      mit(
        [
          { wert: z.datumText, stil: TEXT },
          { wert: z.bearbeiter.join('\n'), stil: BEARBEITER },
          { wert: z.text, stil: TEXT },
        ],
        stunden,
        kontrolle,
      ),
    );
  });

  // Summe – mit Formeln, damit Änderungen in Excel mitrechnen
  const summeVon = (c: number, wert: number, stil: Stil): Zelle =>
    f.zeilen.length
      ? { wert, formel: `SUM(${spalte(c)}${ersteZeile}:${spalte(c)}${letzteZeile})`, stil }
      : { wert: 0, stil };
  zeile(
    mit(
      [{ wert: null, stil: TEXT }, { wert: null, stil: TEXT }, { wert: 'Summe', stil: SUMME }],
      stundenSpalten.map((s, i) =>
        summeVon(ersteStunden + i, mitAbschnitten ? (f.summen[s.schluessel] ?? 0) : f.summe, s.schluessel === GESAMT && mitAbschnitten ? { ...STUNDEN, fett: true } : STUNDEN),
      ),
      mitKontrolle
        ? [
            ...f.mitarbeiter.map((m, i) => summeVon(kontrollStart + i, m.stunden, KONTROLLE_SUMME)),
            summeVon(kontrollStart + f.mitarbeiter.length, f.aufschlag, KONTROLLE_SUMME),
          ]
        : [],
    ),
    19.5,
  );
  zeile([]);
  zeile([]);
  const gesamtSpalte = spalte(letzteStunden);
  zeile(
    mit(
      [null, null, { wert: 'Gesamtstunden', stil: FETT }],
      stundenSpalten.map((_, i): Zelle =>
        i === stundenSpalten.length - 1 ? { wert: f.summe, formel: `${gesamtSpalte}${summenZeile}`, stil: GESAMTSTUNDEN } : null,
      ),
    ),
  );
  if (f.bemerkung.trim()) {
    zeile([]);
    zeile([{ wert: 'Bemerkung', stil: FETT }, null, { wert: f.bemerkung.trim(), stil: BEMERKUNG }]);
  }
  for (let i = 0; i < 4; i++) zeile([]);
  zeile([null, null, { wert: FREIGABE_TEXT, stil: FREIGABE }]);
  zeile([]);

  const druckBreiten = [
    BREITE.datum,
    BREITE.bearbeiter,
    mitAbschnitten ? BREITE.textMitAbschnitten : BREITE.text,
    ...stundenSpalten.map((s) =>
      mitAbschnitten ? (s.schluessel === GESAMT ? 10 : Math.max(9, Math.min(16, s.kurz.length + 3))) : BREITE.stunden,
    ),
  ];
  const spaltenbreiten = [
    ...druckBreiten,
    ...(mitKontrolle ? [BREITE.luecke, ...f.mitarbeiter.map(() => BREITE.kontrolle), BREITE.kontrolle] : []),
  ];

  return {
    name: 'Leistungsnachweis',
    kopfzeileFett: false,
    zeilen,
    zeilenhoehen,
    spaltenbreiten,
    zusammenfassen,
    druckbereich: `A1:${gesamtSpalte}${zeilen.length}`,
    wiederholteZeilen: 4 + kopfzeilen,
    hochformat: true,
    fusszeile: {
      links: fussText([f.projektName, f.titel].filter(Boolean).join(' – ')),
      mitte: 'Seite &P von &N',
    },
    ...(logos.length ? { bilder: logoBilder(logos, druckBreiten) } : {}),
  };
}

/**
 * Leistungsnachweis als Excel-Datei, etwa „Leistungsnachweis_K9101_2026-10.xlsx“ –
 * mit den Logos des Projekts im Kopf; lassen sie sich nicht laden, ohne.
 */
export async function nachweisExportieren(daten: LeistungsnachweisDaten, n: Leistungsnachweis, projekt: Projekt): Promise<void> {
  const logos = await logosLaden(logosVon(projekt));
  dateiLaden(xlsxErzeugen([nachweisBlatt(daten, n, projekt, logos)]), `${nachweisDateiname(n, projekt)}.xlsx`);
}

/* ------------------------------------------------------------------ */
/* Listen von Leistungen                                               */
/* ------------------------------------------------------------------ */

const LISTE_KOPF_STIL: Stil = { fett: true, fuellung: 'E8EDF3', rahmen: true };
const LISTE_KOPF = ['Datum', 'Mitarbeiter', 'Kürzel', 'Leistungstext', 'Stunden', 'Abschnitt', 'Projektelement', 'Quelle'];

/** Name einer Person zur Anzeige; unbekannte „?“. */
function personVon(daten: Pick<LeistungsnachweisDaten, 'mitarbeiter'>, id: ID): { name: string; kuerzel: string } {
  const m = daten.mitarbeiter.find((x) => x.id === id);
  return m ? { name: mitarbeiterName(m) || m.kuerzel, kuerzel: m.kuerzel } : { name: '?', kuerzel: '' };
}

/**
 * Liste von Leistungen mit Summe. Mit `mitProjekt` stehen zusätzlich Projekt
 * und Leistungsnachweis darin (Leistungen mehrerer Projekte).
 */
function leistungsliste(
  daten: LeistungsnachweisDaten,
  leistungen: Leistung[],
  kopf: { blatt: string; titel: string; mitProjekt: boolean; filter?: string },
): Blatt {
  const projekte = new Map(daten.projekte.map((p) => [p.id, p]));
  const abschnittVon = (l: Leistung) => projekte.get(l.projektId)?.abschnitte.find((a) => a.id === l.abschnittId);
  const name = (l: Leistung) => personVon(daten, l.mitarbeiterId).name;
  const projektNummer = (l: Leistung) => projekte.get(l.projektId)?.nummer ?? '';
  const sortiert = [...leistungen].sort(
    (a, b) =>
      a.datum.localeCompare(b.datum) ||
      (kopf.mitProjekt ? projektNummer(a).localeCompare(projektNummer(b), 'de', { numeric: true }) : 0) ||
      name(a).localeCompare(name(b), 'de') ||
      a.erfasst.localeCompare(b.erfasst),
  );
  const summe = stundenVon(sortiert);
  const ersteZeile = 5;
  const spalten = kopf.mitProjekt
    ? ['Datum', 'Projekt', 'Projektname', ...LISTE_KOPF.slice(1), 'Leistungsnachweis']
    : LISTE_KOPF;
  const stundenSpalte = spalte(spalten.indexOf('Stunden'));
  // Alle Zellen oben ausgerichtet – der Leistungstext bricht um
  const oben = (wert: string): Zelle => ({ wert, stil: { oben: true } });
  const zeilen: Zelle[][] = sortiert.map((l) => {
    const a = abschnittVon(l);
    const p = projekte.get(l.projektId);
    const n = kopf.mitProjekt ? nachweisFuer(daten, l.projektId, l.datum) : undefined;
    return [
      { wert: l.datum, datum: true, stil: { oben: true } },
      ...(kopf.mitProjekt ? [oben(p?.nummer ?? ''), oben(p ? projektKurzname(p) : '?')] : []),
      oben(name(l)),
      oben(personVon(daten, l.mitarbeiterId).kuerzel),
      { wert: l.text, stil: { umbruch: true, oben: true } },
      { wert: l.stunden, stil: { zahlenformat: '0.00', oben: true } },
      oben(a ? [a.kurz, a.name].filter(Boolean).join(' – ') : ''),
      oben(l.projektelement),
      oben(QUELLE_LABEL[l.quelle]),
      ...(kopf.mitProjekt ? [oben(n ? nachweisTitel(n) : 'ohne Nachweis')] : []),
    ];
  });
  const summenZeile: Zelle[] = spalten.map((s, i): Zelle => {
    if (spalten[i + 1] === 'Stunden') return { wert: 'Summe', stil: { fett: true, rechts: true } };
    if (s !== 'Stunden') return null;
    return sortiert.length
      ? { wert: summe, formel: `SUM(${stundenSpalte}${ersteZeile}:${stundenSpalte}${ersteZeile + sortiert.length - 1})`, stil: { fett: true, zahlenformat: '0.00' } }
      : { wert: 0, stil: { fett: true, zahlenformat: '0.00' } };
  });
  while (summenZeile.length && summenZeile[summenZeile.length - 1] === null) summenZeile.pop();
  return {
    name: kopf.blatt,
    kopfzeileFett: false,
    zeilen: [
      [{ wert: kopf.titel, stil: { fett: true, groesse: 13 } }],
      [
        kopf.filter
          ? `${kopf.filter} · ${sortiert.length} ${sortiert.length === 1 ? 'Leistung' : 'Leistungen'} · ${stundenText(summe)} Stunden`
          : `Stand: ${formatDate(today())} · ${sortiert.length} ${sortiert.length === 1 ? 'Leistung' : 'Leistungen'} · ${stundenText(summe)} Stunden`,
      ],
      [],
      spalten.map((wert): Zelle => ({ wert, stil: LISTE_KOPF_STIL })),
      ...zeilen,
      summenZeile,
    ],
    fixierteZeilen: 4,
    querformat: true,
    spaltenbreiten: kopf.mitProjekt ? [12, 10, 26, 24, 8, 60, 10, 28, 34, 10, 30] : [12, 24, 8, 60, 10, 28, 34, 10],
  };
}

/** Liste der Leistungen eines Projekts: Datum, Mitarbeiter, Kürzel, Leistungstext, Stunden, Abschnitt, Projektelement, Quelle – mit Summe. */
export function leistungenBlatt(daten: LeistungsnachweisDaten, projekt: Projekt, leistungen: Leistung[]): Blatt {
  return leistungsliste(daten, leistungen, { blatt: 'Leistungen', titel: `Leistungen – ${projektTitel(projekt)}`, mitProjekt: false });
}

/* ------------------------------------------------------------------ */
/* Auswertung des Controllings                                         */
/* ------------------------------------------------------------------ */

const AUSWERTUNG_KOPF: Stil = { fett: true, fuellung: 'E8EDF3', rahmen: true, umbruch: true, oben: true };
const AUSWERTUNG_KOPF_ZAHL: Stil = { ...AUSWERTUNG_KOPF, rechts: true };
const ZAHL: Stil = { zahlenformat: '0.00' };
const ZAHL_FETT: Stil = { zahlenformat: '0.00', fett: true };
const FETT_RECHTS: Stil = { fett: true, rechts: true };

/** Zeile „Projekt: … · Mitarbeiter: … · Stand: …“ unter dem Titel eines Blatts der Auswertung. */
function filterText(daten: LeistungsnachweisDaten, filter: AuswertungFilter): string {
  const p = filter.projektId ? daten.projekte.find((x) => x.id === filter.projektId) : undefined;
  const m = filter.mitarbeiterId ? personVon(daten, filter.mitarbeiterId) : undefined;
  return [
    `Zeitraum: ${zeitraumBezeichnung(filter.von, filter.bis)} (${formatDate(filter.von)} – ${formatDate(filter.bis)})`,
    `Projekt: ${p ? projektTitel(p) : 'alle'}`,
    `Mitarbeiter: ${m ? m.name : 'alle'}`,
    `Stand: ${formatDate(today())}`,
  ].join(' · ');
}

/**
 * Tabelle Mitarbeiter × Spalten als Blatt: Kürzel, Mitarbeiter, je Spalte die
 * Stunden, Summe; darunter die Summen mit Formeln.
 */
function mitarbeiterBlatt(
  name: string,
  titel: string,
  unter: string,
  t: MitarbeiterTabelle,
  spaltenKopf: (schluessel: string) => string,
): Blatt {
  const ersteZeile = 5;
  const letzteZeile = ersteZeile + t.zeilen.length - 1;
  const summeSpalte = 2 + t.spalten.length;
  const summeFormel = (c: number) => `SUM(${spalte(c)}${ersteZeile}:${spalte(c)}${letzteZeile})`;
  const zeilen: Zelle[][] = t.zeilen.map((z, i) => {
    const r = ersteZeile + i;
    return [
      z.kuerzel,
      z.name,
      ...t.spalten.map((s): Zelle => ({ wert: z.werte[s] || null, stil: ZAHL })),
      t.spalten.length
        ? { wert: z.summe, formel: `SUM(${spalte(2)}${r}:${spalte(summeSpalte - 1)}${r})`, stil: ZAHL_FETT }
        : { wert: z.summe, stil: ZAHL_FETT },
    ];
  });
  const summen: Zelle[] = [
    null,
    { wert: 'Summe', stil: FETT_RECHTS },
    ...t.spalten.map((s, i): Zelle =>
      t.zeilen.length ? { wert: t.summen[s] ?? 0, formel: summeFormel(2 + i), stil: ZAHL_FETT } : { wert: 0, stil: ZAHL_FETT },
    ),
    t.zeilen.length ? { wert: t.summe, formel: summeFormel(summeSpalte), stil: ZAHL_FETT } : { wert: 0, stil: ZAHL_FETT },
  ];
  return {
    name,
    kopfzeileFett: false,
    zeilen: [
      [{ wert: titel, stil: { fett: true, groesse: 13 } }],
      [unter],
      [],
      [
        { wert: 'Kürzel', stil: AUSWERTUNG_KOPF },
        { wert: 'Mitarbeiter', stil: AUSWERTUNG_KOPF },
        ...t.spalten.map((s): Zelle => ({ wert: spaltenKopf(s), stil: AUSWERTUNG_KOPF_ZAHL })),
        { wert: 'Summe', stil: AUSWERTUNG_KOPF_ZAHL },
      ],
      ...zeilen,
      summen,
    ],
    fixierteZeilen: 4,
    querformat: true,
    spaltenbreiten: [9, 26, ...t.spalten.map(() => 15), 12],
  };
}

/**
 * Die Auswertung als Mappe – ein Blatt je Tabelle: „Stunden je Mitarbeiter“
 * (Spalten Projekte), „Mitarbeiter und Monat“ (bei mehr als einem Monat im
 * Zeitraum) und „Stunden je Projekt“ (erfasst, Aufschlag, abgerechnet, ohne
 * Nachweis). Erfasst sind die Stunden der Leistungen; Aufschläge zählen für
 * den Zeitraum, in dem ihre Zeile beginnt.
 */
export function auswertungBlaetter(daten: LeistungsnachweisDaten, filter: AuswertungFilter): Blatt[] {
  const a = auswertung(daten, filter);
  const unter = filterText(daten, filter);
  const zeitraum = zeitraumBezeichnung(filter.von, filter.bis);
  const projekte = new Map(daten.projekte.map((p) => [p.id, p]));
  const projektKopf = (id: string) => {
    const p = projekte.get(id);
    return p ? [p.nummer, projektKurzname(p)].filter(Boolean).join('\n') : '?';
  };
  const blaetter: Blatt[] = [
    mitarbeiterBlatt('Stunden je Mitarbeiter', `Stunden je Mitarbeiter – ${zeitraum}`, unter, a.jeMitarbeiter, projektKopf),
  ];
  if (a.monate.length > 1) {
    blaetter.push(
      mitarbeiterBlatt(
        'Mitarbeiter und Monat',
        `Stunden je Mitarbeiter und Monat – ${zeitraum}`,
        unter,
        a.jeMitarbeiterUndMonat,
        (monat) => monatText(`${monat}-01`),
      ),
    );
  }

  const ersteZeile = 5;
  const letzteZeile = ersteZeile + a.jeProjekt.length - 1;
  const summe = (c: number, wert: number): Zelle =>
    a.jeProjekt.length
      ? { wert, formel: `SUM(${spalte(c)}${ersteZeile}:${spalte(c)}${letzteZeile})`, stil: ZAHL_FETT }
      : { wert: 0, stil: ZAHL_FETT };
  const k = a.kennzahlen;
  blaetter.push({
    name: 'Stunden je Projekt',
    kopfzeileFett: false,
    zeilen: [
      [{ wert: `Stunden je Projekt – ${zeitraum}`, stil: { fett: true, groesse: 13 } }],
      [
        k.mitAufschlag
          ? unter
          : `${unter} · Aufschläge gehören zu Zeilen eines Nachweises und lassen sich keiner Person zurechnen – mit Mitarbeiterfilter ohne Aufschlag.`,
      ],
      [],
      [
        { wert: 'Projekt', stil: AUSWERTUNG_KOPF },
        { wert: 'Projektname', stil: AUSWERTUNG_KOPF },
        { wert: 'Erfasst', stil: AUSWERTUNG_KOPF_ZAHL },
        { wert: 'Aufschlag', stil: AUSWERTUNG_KOPF_ZAHL },
        { wert: 'Abgerechnet', stil: AUSWERTUNG_KOPF_ZAHL },
        { wert: 'Ohne Nachweis', stil: AUSWERTUNG_KOPF_ZAHL },
      ],
      ...a.jeProjekt.map((p): Zelle[] => [
        p.nummer,
        p.name,
        { wert: p.erfasst, stil: ZAHL },
        { wert: p.aufschlag || null, stil: ZAHL },
        { wert: p.abgerechnet, stil: ZAHL },
        { wert: p.ohneNachweis || null, stil: ZAHL },
      ]),
      [null, { wert: 'Summe', stil: FETT_RECHTS }, summe(2, k.erfasst), summe(3, k.aufschlag), summe(4, k.abgerechnet), summe(5, k.ohneNachweis)],
      [],
      [null, { wert: 'Mitarbeiter mit Stunden', stil: FETT_RECHTS }, { wert: k.mitarbeiter, stil: { fett: true } }],
    ],
    fixierteZeilen: 4,
    querformat: true,
    spaltenbreiten: [10, 46, 12, 12, 13, 14],
  });
  return blaetter;
}

/** Kurzform eines Zeitraums für Dateinamen: „2026-10“, „2026-Q4“, „2026“ oder „2026-10-05_bis_2026-11-15“. */
export function zeitraumDateiteil(von: string, bis: string): string {
  const voll = von === monatsanfang(von) && bis === monatsende(bis);
  if (voll && von.slice(0, 7) === bis.slice(0, 7)) return von.slice(0, 7);
  const bezeichnung = zeitraumBezeichnung(von, bis);
  if (/^\d{4}$/.test(bezeichnung)) return bezeichnung;
  const quartal = /^Q(\d) (\d{4})$/.exec(bezeichnung);
  if (quartal) return `${quartal[2]}-Q${quartal[1]}`;
  if (voll) return `${von.slice(0, 7)}_bis_${bis.slice(0, 7)}`;
  return von === bis ? von : `${von}_bis_${bis}`;
}

/** Teil des Dateinamens für die Filter: Projektnummer und Kürzel. */
function filterDateiteil(daten: LeistungsnachweisDaten, filter: AuswertungFilter): string {
  const p = filter.projektId ? daten.projekte.find((x) => x.id === filter.projektId) : undefined;
  const m = filter.mitarbeiterId ? personVon(daten, filter.mitarbeiterId) : undefined;
  return [p ? p.nummer || projektKurzname(p) : '', m ? m.kuerzel || m.name : ''].filter(Boolean).join('_');
}

/** Dateiname der Auswertung ohne Endung, etwa „Auswertung_2026-10“ oder „Auswertung_K9101_2026-Q4“. */
export function auswertungDateiname(daten: LeistungsnachweisDaten, filter: AuswertungFilter): string {
  return dateiname(['Auswertung', filterDateiteil(daten, filter), zeitraumDateiteil(filter.von, filter.bis)].filter(Boolean).join('_'));
}

/** Lädt die Auswertung als Excel-Mappe herunter. */
export function auswertungExportieren(daten: LeistungsnachweisDaten, filter: AuswertungFilter): void {
  dateiLaden(xlsxErzeugen(auswertungBlaetter(daten, filter)), `${auswertungDateiname(daten, filter)}.xlsx`);
}

/**
 * Alle Leistungen des Zeitraums (nach den Filtern der Auswertung) als Liste –
 * Spalten wie `leistungenBlatt`, dazu Projekt und Leistungsnachweis.
 */
export function auswertungLeistungenBlatt(daten: LeistungsnachweisDaten, filter: AuswertungFilter): Blatt {
  return leistungsliste(daten, auswertung(daten, filter).leistungen, {
    blatt: 'Leistungen',
    titel: `Leistungen – ${zeitraumBezeichnung(filter.von, filter.bis)}`,
    mitProjekt: true,
    filter: filterText(daten, filter),
  });
}

/** Lädt die Leistungen des Zeitraums als Excel-Liste herunter, etwa „Leistungen_2026-10.xlsx“. */
export function auswertungLeistungenExportieren(daten: LeistungsnachweisDaten, filter: AuswertungFilter): void {
  dateiLaden(
    xlsxErzeugen([auswertungLeistungenBlatt(daten, filter)]),
    `${dateiname(['Leistungen', filterDateiteil(daten, filter), zeitraumDateiteil(filter.von, filter.bis)].filter(Boolean).join('_'))}.xlsx`,
  );
}

/* ------------------------------------------------------------------ */
/* Vorlage für den Import                                              */
/* ------------------------------------------------------------------ */

/** Spalten A–P wie im Export der Zeiterfassung; der Import liest Buchungsdatum, Mitarbeiter, Buchungstext, Menge ext., Projekt und Projektelement. */
export const ZEITERFASSUNG_KOPF = [
  'Buchungsdatum',
  'Mitarbeiter',
  'Mitarbeitergruppe',
  'Buchungsschlüssel',
  'Buchungstext',
  'Menge ext.',
  'Menge int.',
  'Einheit',
  'Projekt',
  'Projektelement',
  'SK',
  'VK',
  'Struk. Pfad',
  'Man. Ändrg.',
  'Subunternehmer',
  'Aufgabe',
];

/** Vorlage im Aufbau der Zeiterfassung – mit einer Beispielzeile. */
export function importVorlageBlatt(): Blatt {
  const beispiel: Zelle[] = [
    { wert: today(), datum: true },
    'MM: Mustermann, Max',
    'PT: Projektingenieure/Techniker',
    'Zeit: Zeitleistungen',
    'Abstimmung PL (Beispielzeile – bitte ersetzen)',
    { wert: 2.5, stil: { zahlenformat: '0.00' } },
    { wert: 2.5, stil: { zahlenformat: '0.00' } },
    'h: Stunden',
    'K9101: EÜ Beispielbach – Ersatzneubau',
    '01: Beispielabschnitt',
  ];
  return {
    name: 'Sheet1',
    zeilen: [ZEITERFASSUNG_KOPF, beispiel],
    fixierteZeilen: 1,
    spaltenbreiten: [14, 24, 26, 20, 48, 11, 11, 12, 40, 30, 8, 8, 12, 12, 16, 12],
  };
}

/** Lädt die Vorlage für den Excel-Import herunter. */
export function importVorlageLaden(): void {
  dateiLaden(xlsxErzeugen([importVorlageBlatt()]), 'Vorlage_Leistungen_Import.xlsx');
}
