/**
 * Excel-Ausgaben des Bereichs: der Leistungsnachweis im Aufbau der
 * Excel-Vorlagen (Kopf, Tabelle mit Rahmen und grauem Tabellenkopf, Summe,
 * Gesamtstunden, „geprüft und freigegeben“; Druckbereich A4 hoch auf
 * Seitenbreite), die Liste der Leistungen eines Projekts und eine Vorlage
 * für den Import im Aufbau der Zeiterfassung.
 *
 * Wie in der Vorlage stehen rechts neben dem Druckbereich die Stunden je
 * Mitarbeiter („Wiko LR“ …) – zur Kontrolle, nicht im Druck.
 *
 * Die Blätter entstehen rein (`nachweisBlatt`, `leistungenBlatt`,
 * `importVorlageBlatt`); erst die Funktionen `…Exportieren`/`…Laden` laden
 * die Datei herunter.
 */
import { formatDate, today } from '../../../shared/dates';
import { dateiLaden, spalte, xlsxErzeugen, type Blatt, type Stil, type Zelle } from '../../../shared/xlsx';
import { GESAMT, dateiname, nachweisDateiname, nachweisFassung, spaltenStunden, type StundenSpalte } from './druck';
import {
  QUELLE_LABEL,
  mitarbeiterName,
  projektTitel,
  type Leistung,
  type Leistungsnachweis,
  type LeistungsnachweisDaten,
  type Projekt,
} from './types';
import { runden, stundenText } from './zeitraum';

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

/** Ein einzelnes „&“ in Kopf- und Fußzeilen schreibt Excel als „&&“. */
const fussText = (text: string) => text.replace(/&/g, '&&');

/**
 * Der Leistungsnachweis als Tabellenblatt – Aufbau wie die Excel-Vorlagen:
 * Zeilen 1–3 Kopf, ab Zeile 5 die Tabelle (mit Abschnitten zweizeiliger Kopf
 * mit „Aufwand (Std)“ über den Abschnittsspalten), Summe mit Formeln,
 * Gesamtstunden, Bemerkung und „geprüft und freigegeben“.
 */
export function nachweisBlatt(daten: LeistungsnachweisDaten, n: Leistungsnachweis, projekt: Projekt): Blatt {
  const f = nachweisFassung(daten, n, projekt);
  const mitAbschnitten = f.spalten.length > 0;
  const stundenSpalten: StundenSpalte[] = mitAbschnitten ? f.spalten : [{ schluessel: GESAMT, kurz: 'Stunden', name: '' }];
  const ersteStunden = 3;
  const letzteStunden = ersteStunden + stundenSpalten.length - 1;
  const kontrollStart = letzteStunden + 2;
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

  // Tabellenkopf
  const kontrollKopf = f.mitarbeiter.map((m): Zelle => ({ wert: `Wiko ${m.kuerzel}`, stil: KONTROLLE_KOPF }));
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

  // Je Tag, Woche oder Monat eine Zeile
  const ersteAbschnitt = spalte(ersteStunden);
  const letzteAbschnitt = spalte(letzteStunden - 1);
  f.zeilen.forEach((z, i) => {
    const r = ersteZeile + i;
    const stunden = stundenSpalten.map((s): Zelle => {
      const wert = spaltenStunden(z, s.schluessel);
      if (mitAbschnitten && s.schluessel === GESAMT) {
        return { wert, formel: `SUM(${ersteAbschnitt}${r}:${letzteAbschnitt}${r})`, stil: { ...STUNDEN, fett: true } };
      }
      return { wert: wert || null, stil: STUNDEN };
    });
    const kontrolle = f.mitarbeiter.map((m): Zelle => ({ wert: z.stundenJeMitarbeiter[m.id] || null, stil: KONTROLLE }));
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
      f.mitarbeiter.map((m, i) => summeVon(kontrollStart + i, m.stunden, KONTROLLE_SUMME)),
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

  const spaltenbreiten = [
    BREITE.datum,
    BREITE.bearbeiter,
    mitAbschnitten ? BREITE.textMitAbschnitten : BREITE.text,
    ...stundenSpalten.map((s) =>
      mitAbschnitten ? (s.schluessel === GESAMT ? 10 : Math.max(9, Math.min(16, s.kurz.length + 3))) : BREITE.stunden,
    ),
    ...(f.mitarbeiter.length ? [BREITE.luecke, ...f.mitarbeiter.map(() => BREITE.kontrolle)] : []),
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
  };
}

/** Leistungsnachweis als Excel-Datei, etwa „Leistungsnachweis_K2476_2026-10.xlsx“. */
export function nachweisExportieren(daten: LeistungsnachweisDaten, n: Leistungsnachweis, projekt: Projekt): void {
  dateiLaden(xlsxErzeugen([nachweisBlatt(daten, n, projekt)]), `${nachweisDateiname(n, projekt)}.xlsx`);
}

/* ------------------------------------------------------------------ */
/* Leistungen eines Projekts                                           */
/* ------------------------------------------------------------------ */

const LISTE_KOPF_STIL: Stil = { fett: true, fuellung: 'E8EDF3', rahmen: true };
const LISTE_KOPF = ['Datum', 'Mitarbeiter', 'Kürzel', 'Leistungstext', 'Stunden', 'Abschnitt', 'Projektelement', 'Quelle'];

/** Liste der Leistungen: Datum, Mitarbeiter, Kürzel, Leistungstext, Stunden, Abschnitt, Projektelement, Quelle – mit Summe. */
export function leistungenBlatt(daten: LeistungsnachweisDaten, projekt: Projekt, leistungen: Leistung[]): Blatt {
  const mitarbeiter = new Map(daten.mitarbeiter.map((m) => [m.id, m]));
  const abschnitte = new Map(projekt.abschnitte.map((a) => [a.id, a]));
  const name = (l: Leistung) => {
    const m = mitarbeiter.get(l.mitarbeiterId);
    return m ? mitarbeiterName(m) || m.kuerzel : '?';
  };
  const sortiert = [...leistungen].sort(
    (a, b) => a.datum.localeCompare(b.datum) || name(a).localeCompare(name(b), 'de') || a.erfasst.localeCompare(b.erfasst),
  );
  const summe = runden(sortiert.reduce((s, l) => s + l.stunden, 0));
  const ersteZeile = 5;
  // Alle Zellen oben ausgerichtet – der Leistungstext bricht um
  const oben = (wert: string): Zelle => ({ wert, stil: { oben: true } });
  const zeilen: Zelle[][] = sortiert.map((l) => {
    const a = l.abschnittId ? abschnitte.get(l.abschnittId) : undefined;
    return [
      { wert: l.datum, datum: true, stil: { oben: true } },
      oben(name(l)),
      oben(mitarbeiter.get(l.mitarbeiterId)?.kuerzel ?? ''),
      { wert: l.text, stil: { umbruch: true, oben: true } },
      { wert: l.stunden, stil: { zahlenformat: '0.00', oben: true } },
      oben(a ? [a.kurz, a.name].filter(Boolean).join(' – ') : ''),
      oben(l.projektelement),
      oben(QUELLE_LABEL[l.quelle]),
    ];
  });
  const summenZeile: Zelle[] = [
    null,
    null,
    null,
    { wert: 'Summe', stil: { fett: true, rechts: true } },
    sortiert.length
      ? { wert: summe, formel: `SUM(E${ersteZeile}:E${ersteZeile + sortiert.length - 1})`, stil: { fett: true, zahlenformat: '0.00' } }
      : { wert: 0, stil: { fett: true, zahlenformat: '0.00' } },
  ];
  return {
    name: 'Leistungen',
    kopfzeileFett: false,
    zeilen: [
      [{ wert: `Leistungen – ${projektTitel(projekt)}`, stil: { fett: true, groesse: 13 } }],
      [
        `Stand: ${formatDate(today())} · ${sortiert.length} ${sortiert.length === 1 ? 'Leistung' : 'Leistungen'} · ${stundenText(summe)} Stunden`,
      ],
      [],
      LISTE_KOPF.map((wert): Zelle => ({ wert, stil: LISTE_KOPF_STIL })),
      ...zeilen,
      summenZeile,
    ],
    fixierteZeilen: 4,
    querformat: true,
    spaltenbreiten: [12, 24, 8, 60, 10, 28, 34, 10],
  };
}

/** Leistungen als Excel-Liste, etwa „Leistungen_K2476_2026-11-05.xlsx“. */
export function leistungenExportieren(daten: LeistungsnachweisDaten, projekt: Projekt, leistungen: Leistung[]): void {
  dateiLaden(
    xlsxErzeugen([leistungenBlatt(daten, projekt, leistungen)]),
    `Leistungen_${dateiname(projekt.nummer || projekt.name)}_${today()}.xlsx`,
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
