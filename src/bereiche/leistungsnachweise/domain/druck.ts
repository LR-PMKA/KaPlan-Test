/**
 * Druckfassung eines Leistungsnachweises als HTML-Text – nach dem Vorbild der
 * Excel-Vorlagen von Mailänder Consult: oben „Leistungsnachweis“ mit dem
 * Zeitraum, Projekt und Leistungsbereich, rechts die Logos; darunter die
 * Tabelle mit Datum, Bearbeitern, Leistungstext und Stunden – bei Projekten
 * mit Abschnitten statt „Stunden“ die Gruppe „Aufwand (Std)“ mit einer Spalte
 * je Abschnitt. Am Ende Summe, Gesamtstunden, Bemerkung und „geprüft und
 * freigegeben“.
 *
 * Derselbe Text erscheint in der Druckansicht der Seite und im Druckdialog
 * des Browsers – dort lässt sich „Als PDF sichern“ wählen. Abgeschlossene
 * Nachweise zeigen ihren festgeschriebenen Stand (`nachweisFassung`); die
 * Excel-Ausgabe (domain/export.ts) nutzt dieselbe Fassung.
 */
import { druckeHtml } from '../../../shared/print';
import { bearbeiterVon, nachweisTitel, summeStunden, zeilenFuerAnzeige } from './nachweis';
import { logosVon } from './seed';
import {
  OHNE_ABSCHNITT,
  kuerzelAus,
  mitarbeiterName,
  projektKurzname,
  type ID,
  type Leistungsnachweis,
  type LeistungsnachweisDaten,
  type Logo,
  type NachweisZeile,
  type Projekt,
} from './types';
import { monatsanfang, monatsende, runden, stundenText } from './zeitraum';

/** Maskiert Text für HTML – auch in Attributen. */
export function esc(wert: string | number | null | undefined): string {
  return String(wert ?? '').replace(
    /[&<>"']/g,
    (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[z]!,
  );
}

/** Vollständige Adresse eines Logos – der Druckrahmen braucht sie. */
export function logoQuelle(src: string): string {
  if (/^(data:|blob:|https?:)/.test(src)) return src;
  try {
    return new URL(`${import.meta.env.BASE_URL}${src}`, window.location.href).href;
  } catch {
    return src;
  }
}

/* ------------------------------------------------------------------ */
/* Fassung für Druck und Excel                                         */
/* ------------------------------------------------------------------ */

/** Spalte der Stunden bei Projekten mit Abschnitten: ein Abschnitt, „ohne“ Abschnitt oder „Gesamt“. */
export interface StundenSpalte {
  /** Abschnitts-ID, `OHNE_ABSCHNITT` oder `GESAMT`. */
  schluessel: string;
  /** Spaltenkopf, etwa „Abschn.1“. */
  kurz: string;
  /** Vollständige Bezeichnung (Titel im Druck). */
  name: string;
}

/** Schlüssel der Spalte „Gesamt“. */
export const GESAMT = '*';

/** Mitarbeiter mit Leistungen im Nachweis – für die Kontrolle der Stunden je Person. */
export interface FassungMitarbeiter {
  id: ID;
  kuerzel: string;
  name: string;
  stunden: number;
}

/** Was Druck und Excel-Datei zeigen. */
export interface NachweisFassung {
  /** Vollständige Überschrift, etwa „Leistungsnachweis Oktober 2026“. */
  titel: string;
  /** Überschrift in zwei Teilen wie in der Vorlage: „Leistungsnachweis“ | „Oktober 2026“; ohne zweiten Teil steht `titelLinks` allein. */
  titelLinks: string;
  titelRechts: string;
  /** Bezeichnung des Projekts im Kopf (Kurzname). */
  projektName: string;
  projektNummer: string;
  leistungsbereich: string;
  zeilen: NachweisZeile[];
  /** Spalten der Stunden: je Abschnitt, „ohne“ (falls nötig) und „Gesamt“; leer, wenn das Projekt keine Abschnitte hat. */
  spalten: StundenSpalte[];
  /** Summen je Spalte (Schlüssel wie in `spalten`). */
  summen: Record<string, number>;
  summe: number;
  bearbeiter: string[];
  /** Personen in der Reihenfolge ihres ersten Auftretens. */
  mitarbeiter: FassungMitarbeiter[];
  bemerkung: string;
  abgeschlossen: boolean;
}

/** Stunden einer Zeile in einer Spalte (`GESAMT` = alle). */
export function spaltenStunden(z: NachweisZeile, schluessel: string): number {
  return schluessel === GESAMT ? z.stunden : (z.stundenJeAbschnitt[schluessel] ?? 0);
}

/**
 * Druck- und Excel-Fassung eines Nachweises: bei abgeschlossenen Nachweisen
 * aus dem festgeschriebenen Stand (Zeilen, Abschnitte, Projektangaben,
 * Überschrift), sonst aus den aktuellen Leistungen.
 */
export function nachweisFassung(daten: LeistungsnachweisDaten, n: Leistungsnachweis, projekt: Projekt): NachweisFassung {
  const stand = n.status === 'abgeschlossen' ? n.stand : null;
  const zeilen = zeilenFuerAnzeige(daten, n);
  const kopf = stand?.projekt ?? projekt;
  const titel = stand?.titel ?? nachweisTitel(n);

  // „Leistungsnachweis Oktober 2026“ steht wie in der Vorlage in zwei Zellen.
  const praefix = 'Leistungsnachweis ';
  const geteilt = titel.startsWith(praefix) && titel.length > praefix.length;

  const abschnitte = stand?.abschnitte ?? projekt.abschnitte;
  const spalten: StundenSpalte[] = [];
  if (abschnitte.length > 0) {
    spalten.push(...abschnitte.map((a) => ({ schluessel: a.id, kurz: a.kurz || a.kennung || a.name, name: a.name })));
    if (zeilen.some((z) => (z.stundenJeAbschnitt[OHNE_ABSCHNITT] ?? 0) !== 0)) {
      spalten.push({ schluessel: OHNE_ABSCHNITT, kurz: 'ohne', name: 'Leistungen ohne Abschnitt' });
    }
    spalten.push({ schluessel: GESAMT, kurz: 'Gesamt', name: 'Stunden gesamt' });
  }
  const summen = Object.fromEntries(
    spalten.map((s) => [s.schluessel, runden(zeilen.reduce((sum, z) => sum + spaltenStunden(z, s.schluessel), 0))]),
  );

  const personen = new Map<ID, number>();
  for (const z of zeilen) {
    for (const [id, stunden] of Object.entries(z.stundenJeMitarbeiter)) personen.set(id, (personen.get(id) ?? 0) + stunden);
  }
  const mitarbeiter = [...personen.entries()].map(([id, stunden]): FassungMitarbeiter => {
    const m = daten.mitarbeiter.find((x) => x.id === id);
    const name = m ? mitarbeiterName(m) || m.kuerzel : '?';
    return { id, kuerzel: m?.kuerzel || kuerzelAus(name) || '?', name, stunden: runden(stunden) };
  });

  return {
    titel,
    titelLinks: geteilt ? praefix.trim() : titel,
    titelRechts: geteilt ? titel.slice(praefix.length) : '',
    projektName: projektKurzname(kopf),
    projektNummer: kopf.nummer,
    leistungsbereich: kopf.leistungsbereich,
    zeilen,
    spalten,
    summen,
    summe: summeStunden(zeilen),
    bearbeiter: bearbeiterVon(zeilen),
    mitarbeiter,
    bemerkung: n.bemerkung,
    abgeschlossen: !!stand,
  };
}

/** „2026-10“ */
const monatTeil = (datum: string) => datum.slice(0, 7);

/**
 * Dateiname ohne Endung, etwa „Leistungsnachweis_K2476_2026-10“ (ein Monat),
 * „…_2026-06_bis_2026-10“ (volle Monate) oder „…_2026-06-15_bis_2026-10-31“.
 * Ohne Umlaute und Sonderzeichen – manche Browser verwerfen sonst den Namen.
 */
export function nachweisDateiname(n: Pick<Leistungsnachweis, 'von' | 'bis'>, projekt: Pick<Projekt, 'nummer' | 'name' | 'kurzname'>): string {
  const volleMonate = n.von === monatsanfang(n.von) && n.bis === monatsende(n.bis);
  const zeitraum = volleMonate
    ? monatTeil(n.von) === monatTeil(n.bis)
      ? monatTeil(n.von)
      : `${monatTeil(n.von)}_bis_${monatTeil(n.bis)}`
    : n.von === n.bis
      ? n.von
      : `${n.von}_bis_${n.bis}`;
  return dateiname(`Leistungsnachweis_${projekt.nummer || projektKurzname(projekt)}_${zeitraum}`);
}

const UMLAUTE: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

/** Dateiname ohne Umlaute und Sonderzeichen. */
export function dateiname(text: string): string {
  return text
    .replace(/[äöüÄÖÜß]/g, (z) => UMLAUTE[z])
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/* ------------------------------------------------------------------ */
/* HTML                                                                */
/* ------------------------------------------------------------------ */

/** Text mit Zeilenumbrüchen. */
const mehrzeilig = (text: string) => esc(text).replace(/\n/g, '<br>');

/** Stunden einer Zelle; leer bei 0, wie in der Vorlage. */
const zelle = (stunden: number) => (stunden ? stundenText(stunden) : '');

/** Ab so vielen Stundenspalten wird die Tabelle enger gesetzt (kleinere Schrift). */
const ENG_AB = 5;

/**
 * Spaltenbreiten in Prozent: Datum, Bearbeiter, je Stundenspalte und
 * „Gesamt“ – der Leistungstext erhält den Rest.
 */
function breiten(spaltenzahl: number): { datum: number; bearbeiter: number; stunden: number; gesamt: number } {
  if (spaltenzahl === 0) return { datum: 18, bearbeiter: 17, stunden: 9, gesamt: 9 };
  if (spaltenzahl < ENG_AB) return { datum: 18, bearbeiter: 15, stunden: 8, gesamt: 9 };
  const stunden = Math.max(5.5, Math.min(7, 36 / spaltenzahl));
  return { datum: 16, bearbeiter: 12, stunden, gesamt: stunden + 1.5 };
}

/** Spaltenkopf eines Abschnitts: Umbruch nach dem Punkt erlaubt („Abschn.“ / „1“). */
const abschnittKopf = (kurz: string) => esc(kurz).replace(/\./g, '.<wbr>');

function logosHtml(logos: Logo[]): string {
  if (logos.length === 0) return '';
  return `<div class="ln-doc-logos">${logos
    .map((l) => `<img src="${esc(logoQuelle(l.src))}" alt="${esc(l.name)}">`)
    .join('')}</div>`;
}

/** Druckfassung des Nachweises (A4 hoch). */
export function nachweisHtml(daten: LeistungsnachweisDaten, n: Leistungsnachweis, projekt: Projekt): string {
  const f = nachweisFassung(daten, n, projekt);
  const mitAbschnitten = f.spalten.length > 0;
  const b = breiten(f.spalten.length);
  const stundenSpalten = mitAbschnitten ? f.spalten.length : 1;
  const spaltenzahl = 3 + stundenSpalten;

  // Die Kopfspalten folgen den Tabellenspalten, werden aber nie schmaler als ihr längstes Wort.
  const kopf = `<header class="ln-doc-kopf" style="grid-template-columns: minmax(min-content, ${b.datum}%) minmax(min-content, ${b.bearbeiter}%) minmax(0, 1fr) auto">
      ${
        f.titelRechts
          ? `<div class="ln-doc-k">${esc(f.titelLinks)}</div><div class="ln-doc-k">${esc(f.titelRechts)}</div>`
          : `<div class="ln-doc-k ln-doc-k-breit">${esc(f.titelLinks)}</div>`
      }
      <div class="ln-doc-k">${esc(f.projektName)}${f.projektNummer ? `<span class="ln-doc-nr">${esc(f.projektNummer)}</span>` : ''}</div>
      ${logosHtml(logosVon(projekt))}
      <div class="ln-doc-k">Leistungsbereich</div><div></div><div class="ln-doc-k">${esc(f.leistungsbereich)}</div>
    </header>`;

  const spalten = `<colgroup><col style="width:${b.datum}%"><col style="width:${b.bearbeiter}%"><col>${
    mitAbschnitten
      ? f.spalten.map((s) => `<col style="width:${s.schluessel === GESAMT ? b.gesamt : b.stunden}%">`).join('')
      : `<col style="width:${b.stunden}%">`
  }</colgroup>`;

  const tabellenkopf = mitAbschnitten
    ? `<tr><th rowspan="2">Datum</th><th rowspan="2">Bearbeiter</th><th rowspan="2">Leistungstext</th><th colspan="${
        f.spalten.length
      }" class="ln-doc-mitte">Aufwand (Std)</th></tr>
      <tr>${f.spalten
        .map(
          (s) =>
            `<th class="ln-doc-abschnitt${s.schluessel === GESAMT ? ' ln-doc-gesamtspalte' : ''}" title="${esc(s.name)}">${abschnittKopf(s.kurz)}</th>`,
        )
        .join('')}</tr>`
    : '<tr><th>Datum</th><th>Bearbeiter</th><th>Leistungstext</th><th class="ln-doc-mitte">Stunden</th></tr>';

  const stundenZellen = (z: NachweisZeile) =>
    mitAbschnitten
      ? f.spalten
          .map(
            (s) =>
              `<td class="ln-doc-std${s.schluessel === GESAMT ? ' ln-doc-gesamtspalte' : ''}">${zelle(spaltenStunden(z, s.schluessel))}</td>`,
          )
          .join('')
      : `<td class="ln-doc-std">${zelle(z.stunden)}</td>`;

  const zeilen = f.zeilen.length
    ? f.zeilen
        .map(
          (z) => `<tr>
          <td class="ln-doc-dat">${mehrzeilig(z.datumText)}</td>
          <td class="ln-doc-bea">${z.bearbeiter.map(esc).join('<br>')}</td>
          <td class="ln-doc-txt">${mehrzeilig(z.text)}</td>
          ${stundenZellen(z)}
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="${spaltenzahl}" class="ln-doc-leer">Keine Leistungen im Zeitraum.</td></tr>`;

  const summen = mitAbschnitten
    ? f.spalten
        .map((s) => `<td class="ln-doc-std${s.schluessel === GESAMT ? ' ln-doc-gesamtspalte' : ''}">${stundenText(f.summen[s.schluessel] ?? 0)}</td>`)
        .join('')
    : `<td class="ln-doc-std">${stundenText(f.summe)}</td>`;
  const gesamt = `${mitAbschnitten ? '<td></td>'.repeat(f.spalten.length - 1) : ''}<td class="ln-doc-std">${stundenText(f.summe)}</td>`;

  return `<article class="ln-doc">
    ${kopf}
    <table class="ln-doc-tab${f.spalten.length >= ENG_AB ? ' ln-doc-eng' : ''}">
      ${spalten}
      <thead>${tabellenkopf}</thead>
      <tbody>${zeilen}</tbody>
      <tbody class="ln-doc-fuss">
        <tr class="ln-doc-summe"><td></td><td></td><td class="ln-doc-rechts">Summe</td>${summen}</tr>
        <tr class="ln-doc-abstand"><td colspan="${spaltenzahl}"></td></tr>
        <tr class="ln-doc-gesamt"><td></td><td></td><td>Gesamtstunden</td>${gesamt}</tr>
      </tbody>
    </table>
    ${f.bemerkung.trim() ? `<div class="ln-doc-bemerkung"><b>Bemerkung</b><p>${mehrzeilig(f.bemerkung.trim())}</p></div>` : ''}
    <p class="ln-doc-freigabe">geprüft und freigegeben  ______________________</p>
  </article>`;
}

/* ------------------------------------------------------------------ */
/* Gestaltung                                                          */
/* ------------------------------------------------------------------ */

/**
 * Gestaltung des Blatts – gilt in der Druckansicht der Seite und im Druck.
 * Schwarz auf Weiß mit dünnen Rahmenlinien und grau hinterlegtem
 * Tabellenkopf wie in der Excel-Vorlage; feste Farben, damit Druck und
 * Bildschirm übereinstimmen (auch im Farbmodus „kontrast“).
 */
export const DRUCK_STIL = `
.ln-doc { color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.35; letter-spacing: 0; }
.ln-doc p { margin: 0; }
.ln-doc table { width: 100%; border-collapse: collapse; margin: 0; table-layout: fixed; }
.ln-doc th, .ln-doc td { position: static; box-shadow: none; text-transform: none; letter-spacing: 0; white-space: normal;
  color: #000; font-size: inherit; overflow-wrap: anywhere; }
.ln-doc .ln-doc-kopf { display: grid; align-items: start; row-gap: 4px; margin: 0 0 26px; font-size: 13.5px; }
.ln-doc .ln-doc-k { font-weight: 700; padding-right: 8px; min-width: 0; }
.ln-doc .ln-doc-k-breit { grid-column: 1 / span 2; }
.ln-doc .ln-doc-nr { display: block; font-weight: 400; font-size: 11px; color: #3c3c3c; margin-top: 1px; }
.ln-doc .ln-doc-logos { grid-column: 4; grid-row: 1 / span 2; display: flex; gap: 14px; align-items: center;
  justify-content: flex-end; flex-wrap: wrap; padding-left: 12px; }
.ln-doc .ln-doc-logos img { max-height: 42px; max-width: 190px; object-fit: contain; display: block; }
.ln-doc .ln-doc-tab th { background: #c0c0c0; font-weight: 700; text-align: left; vertical-align: middle;
  border: 1px solid #000; padding: 6px 6px; }
.ln-doc .ln-doc-tab thead tr:first-child th { border-top-width: 1.5px; }
.ln-doc .ln-doc-tab th.ln-doc-mitte { text-align: center; }
.ln-doc .ln-doc-tab th.ln-doc-abschnitt { background: #d9d9d9; font-weight: 400; font-size: 11px; text-align: center; padding: 4px 2px; overflow-wrap: normal; }
.ln-doc .ln-doc-tab th.ln-doc-gesamtspalte { font-weight: 700; }
.ln-doc .ln-doc-tab td { border: 1px solid #000; padding: 5px 6px; vertical-align: top; }
.ln-doc .ln-doc-tab tbody tr { break-inside: avoid; page-break-inside: avoid; }
.ln-doc .ln-doc-dat { white-space: pre-line; }
.ln-doc .ln-doc-bea { font-weight: 700; }
.ln-doc .ln-doc-txt { white-space: pre-wrap; }
.ln-doc .ln-doc-std { text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; padding-left: 2px; padding-right: 2px; }
.ln-doc .ln-doc-tab td.ln-doc-gesamtspalte { font-weight: 700; }
.ln-doc .ln-doc-eng { font-size: 11px; }
.ln-doc .ln-doc-eng td { padding: 4px 4px; }
.ln-doc .ln-doc-eng th.ln-doc-abschnitt { font-size: 9.5px; padding: 3px 1px; }
.ln-doc .ln-doc-eng td.ln-doc-std { padding: 4px 1px; }
.ln-doc .ln-doc-leer { color: #5b6672; text-align: center; padding: 14px 6px; }
.ln-doc .ln-doc-rechts { text-align: right; }
.ln-doc .ln-doc-fuss tr.ln-doc-abstand td { border: 0; padding: 0; height: 18px; }
.ln-doc .ln-doc-fuss tr.ln-doc-gesamt td { border: 0; font-weight: 700; }
.ln-doc .ln-doc-bemerkung { margin-top: 18px; break-inside: avoid; page-break-inside: avoid; }
.ln-doc .ln-doc-bemerkung p { white-space: pre-wrap; margin-top: 3px; }
.ln-doc .ln-doc-freigabe { margin-top: 56px; text-align: right; font-weight: 700; white-space: pre; break-inside: avoid; page-break-inside: avoid; }
@media (max-width: 700px) {
  .ln-doc { font-size: 11px; }
  .ln-doc .ln-doc-kopf { font-size: 12.5px; }
  .ln-doc .ln-doc-logos img { max-height: 30px; max-width: 120px; }
}
@media print {
  .ln-doc { font-size: 9pt; }
  .ln-doc .ln-doc-tab th.ln-doc-abschnitt { font-size: 8pt; }
  .ln-doc .ln-doc-eng { font-size: 8pt; }
  .ln-doc .ln-doc-eng th.ln-doc-abschnitt { font-size: 7.5pt; }
  .ln-doc .ln-doc-kopf { font-size: 10.5pt; }
  .ln-doc .ln-doc-nr { font-size: 8.5pt; }
}
`;

/** Öffnet den Druckdialog für den Nachweis (A4 hoch) – dort auch „Als PDF sichern“. */
export function nachweisDrucken(daten: LeistungsnachweisDaten, n: Leistungsnachweis, projekt: Projekt): void {
  druckeHtml(
    esc(nachweisDateiname(n, projekt)),
    nachweisHtml(daten, n, projekt),
    `${DRUCK_STIL}
    @page { size: A4 portrait; margin: 14mm; }
    body { color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
  );
}
