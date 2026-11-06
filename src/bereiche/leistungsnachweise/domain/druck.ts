/**
 * Druckfassung eines Leistungsnachweises als HTML-Text – im Stil der
 * PDF-Kurzfassung des Planlaufmanagements (`EXPORT_STIL`, `exportHtml` in
 * src/bereiche/planlauf/domain/export.ts und `druckeHtml` in
 * src/shared/print.ts): oben der Kopf mit „<Nummer> · <Projekt>“, darunter
 * eine graue Meta-Zeile mit Zeitraum, Leistungsbereich, Raster und Stand,
 * rechts die Logos; darunter die Tabelle mit grauen Großbuchstaben-Köpfen und
 * feinen Trennlinien statt Gitter – Datum, Bearbeiter, Leistungstext und
 * Stunden, ab zwei Abschnitten statt „Stunden“ die Gruppe „Aufwand (Std)“ mit
 * einer Spalte je Abschnitt (`mitAbschnittsspalten`). Am Ende Summe,
 * Gesamtstunden, Bemerkung, „geprüft und freigegeben“ mit Linien für Datum
 * und Unterschrift und der Fuß „Erzeugt mit KaPlan am …“.
 *
 * Druck und Excel zeigen die abgerechneten Stunden (erfasst plus Aufschlag
 * des Controllings); der Aufschlag selbst erscheint nicht. Abgeschlossene
 * Nachweise zeigen ihren festgeschriebenen Stand (`nachweisFassung`); die
 * Excel-Ausgabe (domain/export.ts) nutzt dieselbe Fassung. Lange Nachweise
 * laufen über mehrere Seiten, der Tabellenkopf wiederholt sich, Zeilen
 * brechen nicht.
 */
import { formatDate, today } from '../../../shared/dates';
import { druckeHtml } from '../../../shared/print';
import { bearbeiterVon, mitAbschnittsspalten, nachweisSummen, nachweisTitel, tagVon, zeilenFuerAnzeige } from './nachweis';
import { logosVon } from './seed';
import {
  OHNE_ABSCHNITT,
  RASTER_LABEL,
  kuerzelAus,
  mitarbeiterName,
  projektKurzname,
  type ID,
  type ISODate,
  type Leistungsnachweis,
  type LeistungsnachweisDaten,
  type Logo,
  type NachweisZeile,
  type Projekt,
  type Raster,
} from './types';
import { langDatum, monatsanfang, monatsende, runden, stundenText } from './zeitraum';

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

/**
 * Welche Stunden eine Fassung zeigt: die erfassten (so sehen alle den
 * gemeinsamen Nachweis) oder die abgerechneten – erfasst plus Aufschlag; so
 * stehen sie in Druck und Excel.
 */
export type FassungWerte = 'erfasst' | 'abgerechnet';

/** Spalte der Stunden bei Projekten mit Abschnittsspalten: ein Abschnitt, „ohne“ Abschnitt oder „Gesamt“. */
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
  /** Erfasste Stunden der Person – Aufschläge gehören der Zeile, nicht einer Person. */
  stunden: number;
}

/** Was Druck und Excel-Datei zeigen. */
export interface NachweisFassung {
  /** Erfasste oder abgerechnete Stunden in `spaltenStunden`, `summen` und `summe`. */
  werte: FassungWerte;
  /** Vollständige Überschrift, etwa „Leistungsnachweis Oktober 2026“. */
  titel: string;
  /** Überschrift in zwei Teilen wie in der Vorlage: „Leistungsnachweis“ | „Oktober 2026“; ohne zweiten Teil steht `titelLinks` allein. */
  titelLinks: string;
  titelRechts: string;
  /** Die Überschrift ist von Hand vergeben (nicht „Leistungsnachweis <Zeitraum>“). */
  titelEigen: boolean;
  /** Bezeichnung des Projekts im Kopf (Kurzname). */
  projektName: string;
  projektNummer: string;
  leistungsbereich: string;
  von: ISODate;
  bis: ISODate;
  raster: Raster;
  /** Datum des Stands: der Tag des Abschlusses, sonst heute. */
  standDatum: ISODate;
  zeilen: NachweisZeile[];
  /** Spalten der Stunden: je Abschnitt, „ohne“ (falls nötig) und „Gesamt“; leer unter zwei Abschnitten (`mitAbschnittsspalten`). */
  spalten: StundenSpalte[];
  /** Summen je Spalte (Schlüssel wie in `spalten`), in der Art von `werte`. */
  summen: Record<string, number>;
  /** Summe der Stunden in der Art von `werte`. */
  summe: number;
  /** Erfasste Stunden, Aufschlag und abgerechnete Stunden des ganzen Nachweises. */
  erfasst: number;
  aufschlag: number;
  abgerechnet: number;
  bearbeiter: string[];
  /** Personen in der Reihenfolge ihres ersten Auftretens. */
  mitarbeiter: FassungMitarbeiter[];
  bemerkung: string;
  abgeschlossen: boolean;
}

/** Stunden einer Zeile in einer Spalte (`GESAMT` = alle) – erfasst (Vorgabe) oder abgerechnet. */
export function spaltenStunden(z: NachweisZeile, schluessel: string, werte: FassungWerte = 'erfasst'): number {
  if (werte === 'abgerechnet') {
    return schluessel === GESAMT ? (z.abgerechnet ?? z.stunden) : ((z.abgerechnetJeAbschnitt ?? z.stundenJeAbschnitt)[schluessel] ?? 0);
  }
  return schluessel === GESAMT ? z.stunden : (z.stundenJeAbschnitt[schluessel] ?? 0);
}

/**
 * Druck- und Excel-Fassung eines Nachweises: bei abgeschlossenen Nachweisen
 * aus dem festgeschriebenen Stand (Zeilen, Abschnitte, Projektangaben,
 * Überschrift), sonst aus den aktuellen Leistungen. `werte` wählt erfasste
 * (Vorgabe – so sehen alle den gemeinsamen Nachweis) oder abgerechnete
 * Stunden (Druck und Excel). Abschnittsspalten erst ab zwei Abschnitten; die
 * Spalte „ohne“ nur, wenn sie Stunden hat – auch solche, die allein ein
 * Aufschlag füllt.
 */
export function nachweisFassung(
  daten: LeistungsnachweisDaten,
  n: Leistungsnachweis,
  projekt: Projekt,
  werte: FassungWerte = 'erfasst',
): NachweisFassung {
  const stand = n.status === 'abgeschlossen' ? n.stand : null;
  const zeilen = zeilenFuerAnzeige(daten, n);
  const kopf = stand?.projekt ?? projekt;
  const titel = stand?.titel ?? nachweisTitel(n);

  // „Leistungsnachweis Oktober 2026“ steht wie in der Vorlage in zwei Zellen.
  const praefix = 'Leistungsnachweis ';
  const geteilt = titel.startsWith(praefix) && titel.length > praefix.length;

  const abschnitte = stand?.abschnitte ?? projekt.abschnitte;
  const spalten: StundenSpalte[] = [];
  if (mitAbschnittsspalten(abschnitte)) {
    spalten.push(...abschnitte.map((a) => ({ schluessel: a.id, kurz: a.kurz || a.kennung || a.name, name: a.name })));
    if (zeilen.some((z) => spaltenStunden(z, OHNE_ABSCHNITT, werte) !== 0)) {
      spalten.push({ schluessel: OHNE_ABSCHNITT, kurz: 'ohne', name: 'Leistungen ohne Abschnitt' });
    }
    spalten.push({ schluessel: GESAMT, kurz: 'Gesamt', name: 'Stunden gesamt' });
  }
  const summen = Object.fromEntries(
    spalten.map((s) => [s.schluessel, runden(zeilen.reduce((sum, z) => sum + spaltenStunden(z, s.schluessel, werte), 0))]),
  );
  const { erfasst, aufschlag, abgerechnet } = nachweisSummen(
    zeilen.map((z) => ({ stunden: z.stunden, aufschlag: z.aufschlag ?? 0, abgerechnet: z.abgerechnet ?? z.stunden })),
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
    werte,
    titel,
    titelLinks: geteilt ? praefix.trim() : titel,
    titelRechts: geteilt ? titel.slice(praefix.length) : '',
    titelEigen: titel !== nachweisTitel({ titel: '', von: n.von, bis: n.bis }),
    projektName: projektKurzname(kopf),
    projektNummer: kopf.nummer,
    leistungsbereich: kopf.leistungsbereich,
    von: n.von,
    bis: n.bis,
    raster: n.raster,
    standDatum: stand && n.abgeschlossen ? tagVon(n.abgeschlossen) : today(),
    zeilen,
    spalten,
    summen,
    summe: werte === 'abgerechnet' ? abgerechnet : erfasst,
    erfasst,
    aufschlag,
    abgerechnet,
    bearbeiter: bearbeiterVon(zeilen),
    mitarbeiter,
    bemerkung: n.bemerkung,
    abgeschlossen: !!stand,
  };
}

/** „2026-10“ */
const monatTeil = (datum: string) => datum.slice(0, 7);

/**
 * Dateiname ohne Endung, etwa „Leistungsnachweis_K9101_2026-10“ (ein Monat),
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
  if (spaltenzahl === 0) return { datum: 15, bearbeiter: 17, stunden: 10, gesamt: 10 };
  if (spaltenzahl < ENG_AB) return { datum: 14, bearbeiter: 15, stunden: 9, gesamt: 9.5 };
  // Eng: Spalten so breit, dass „Abschn.“ in eine Zeile passt
  const stunden = Math.max(6, Math.min(7.5, 42 / spaltenzahl));
  return { datum: 11, bearbeiter: 12.5, stunden, gesamt: stunden + 1.5 };
}

/** Spaltenkopf eines Abschnitts: Umbruch nach dem Punkt erlaubt („Abschn.“ / „1“). */
const abschnittKopf = (kurz: string) => esc(kurz).replace(/\./g, '.<wbr>');

/** Spalte „Datum“: „KW 44“ oben, die Tage darunter grau – wie die zweizeiligen Zellen der Planlauf-Kurzfassung. */
function datumZelle(text: string): string {
  const [oben, ...rest] = text.split('\n');
  return rest.length
    ? `<div class="ln-doc-kw">${esc(oben)}</div><div class="klein grau">${rest.map(esc).join('<br>')}</div>`
    : `<span class="ln-doc-tage">${esc(oben)}</span>`;
}

function logosHtml(logos: Logo[]): string {
  if (logos.length === 0) return '';
  return `<div class="ln-doc-logos">${logos
    .map((l) => `<img src="${esc(logoQuelle(l.src))}" alt="${esc(l.name)}">`)
    .join('')}</div>`;
}

/** Meta-Zeile unter der Überschrift: „Leistungsnachweis Oktober 2026 · Projektsteuerung · Monatsscharf · Stand 06.11.2026“. */
export function nachweisMeta(f: Pick<NachweisFassung, 'titel' | 'titelEigen' | 'von' | 'bis' | 'leistungsbereich' | 'raster' | 'standDatum'>): string {
  return [
    f.titel,
    f.titelEigen ? `${langDatum(f.von)} – ${langDatum(f.bis)}` : '',
    f.leistungsbereich,
    RASTER_LABEL[f.raster],
    `Stand ${formatDate(f.standDatum)}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Druckfassung des Nachweises (A4 hoch) mit den abgerechneten Stunden. */
export function nachweisHtml(daten: LeistungsnachweisDaten, n: Leistungsnachweis, projekt: Projekt): string {
  const f = nachweisFassung(daten, n, projekt, 'abgerechnet');
  const mitAbschnitten = f.spalten.length > 0;
  const b = breiten(f.spalten.length);
  const spaltenzahl = 3 + (mitAbschnitten ? f.spalten.length : 1);
  const gesamt = (s: StundenSpalte) => (s.schluessel === GESAMT ? ' ln-doc-gesamtspalte' : '');

  const kopf = `<header class="kopf ln-doc-kopf">
      <div class="ln-doc-kopftext">
        <h1>${esc([f.projektNummer, f.projektName].filter(Boolean).join(' · '))}</h1>
        <div class="meta">${esc(nachweisMeta(f))}</div>
      </div>
      ${logosHtml(logosVon(projekt))}
    </header>`;

  const spalten = `<colgroup><col style="width:${b.datum}%"><col style="width:${b.bearbeiter}%"><col>${
    mitAbschnitten
      ? f.spalten.map((s) => `<col style="width:${s.schluessel === GESAMT ? b.gesamt : b.stunden}%">`).join('')
      : `<col style="width:${b.stunden}%">`
  }</colgroup>`;

  const tabellenkopf = mitAbschnitten
    ? `<tr><th rowspan="2">Datum</th><th rowspan="2">Bearbeiter</th><th rowspan="2">Leistungstext</th><th colspan="${
        f.spalten.length
      }" class="ln-doc-gruppe">Aufwand (Std)</th></tr>
      <tr>${f.spalten
        .map((s) => `<th class="num ln-doc-abschnitt${gesamt(s)}" title="${esc(s.name)}">${abschnittKopf(s.kurz)}</th>`)
        .join('')}</tr>`
    : '<tr><th>Datum</th><th>Bearbeiter</th><th>Leistungstext</th><th class="num">Stunden</th></tr>';

  const stundenZellen = (z: NachweisZeile) =>
    mitAbschnitten
      ? f.spalten.map((s) => `<td class="num${gesamt(s)}">${zelle(spaltenStunden(z, s.schluessel, f.werte))}</td>`).join('')
      : `<td class="num">${zelle(spaltenStunden(z, GESAMT, f.werte))}</td>`;

  const zeilen = f.zeilen.length
    ? f.zeilen
        .map(
          (z) => `<tr>
          <td class="ln-doc-dat">${datumZelle(z.datumText)}</td>
          <td class="ln-doc-bea klein">${z.bearbeiter.map(esc).join('<br>')}</td>
          <td class="ln-doc-txt">${mehrzeilig(z.text)}</td>
          ${stundenZellen(z)}
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="${spaltenzahl}" class="ln-doc-leer">Keine Leistungen im Zeitraum.</td></tr>`;

  const summen = mitAbschnitten
    ? f.spalten.map((s) => `<td class="num${gesamt(s)}">${stundenText(f.summen[s.schluessel] ?? 0)}</td>`).join('')
    : `<td class="num">${stundenText(f.summe)}</td>`;

  return `<article class="ln-doc">
    ${kopf}
    <table class="liste ln-doc-tab${f.spalten.length >= ENG_AB ? ' ln-doc-eng' : ''}">
      ${spalten}
      <thead>${tabellenkopf}</thead>
      <tbody>${zeilen}</tbody>
      <tbody class="ln-doc-summen">
        <tr class="ln-doc-summe"><td></td><td></td><td class="ln-doc-rechts">Summe</td>${summen}</tr>
      </tbody>
    </table>
    <div class="ln-doc-gesamt"><span>Gesamtstunden</span><strong>${stundenText(f.summe)}</strong></div>
    ${f.bemerkung.trim() ? `<div class="ln-doc-bemerkung"><h2>Bemerkung</h2><p>${mehrzeilig(f.bemerkung.trim())}</p></div>` : ''}
    <div class="ln-doc-freigabe">
      <div class="ln-doc-freigabe-titel">geprüft und freigegeben</div>
      <div class="ln-doc-unterschrift">
        <div><div class="ln-doc-linie"></div><span>Datum</span></div>
        <div><div class="ln-doc-linie"></div><span>Unterschrift</span></div>
      </div>
    </div>
    <p class="fuss">Erzeugt mit KaPlan am ${esc(formatDate(today()))}.</p>
  </article>`;
}

/* ------------------------------------------------------------------ */
/* Gestaltung                                                          */
/* ------------------------------------------------------------------ */

/**
 * Gestaltung des Blatts – gilt in der Vorschau der Seite und im Druck. Sie
 * übernimmt Schrift, Farben und Tabellenstil der Planlauf-Kurzfassung (die
 * Grundgestaltung aus `druckeHtml` und `EXPORT_STIL`), hier auf `.ln-doc`
 * beschränkt, damit sie in der Vorschau nichts anderes berührt. Feste Farben,
 * damit Druck und Bildschirm übereinstimmen (auch im Farbmodus „kontrast“).
 */
export const DRUCK_STIL = `
.ln-doc { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 9pt;
  color: #1d1d1f; line-height: 1.4; letter-spacing: -0.01em; text-align: left; }
.ln-doc * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
.ln-doc p { margin: 0; }
.ln-doc .klein { font-size: 8.5pt; }
.ln-doc .grau { color: #8e8e93; }
.ln-doc .kopf { display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm;
  border-bottom: 1px solid #c7c7cc; padding-bottom: 3mm; margin: 0 0 5mm; }
.ln-doc .ln-doc-kopftext { min-width: 0; }
.ln-doc .kopf h1 { font-size: 15pt; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 2mm; line-height: 1.2; color: #1d1d1f; }
.ln-doc .kopf .meta { color: #6e6e73; font-size: 9pt; }
.ln-doc .ln-doc-logos { display: flex; gap: 4mm; align-items: center; justify-content: flex-end; flex-wrap: wrap; flex: none;
  max-width: 50%; padding-bottom: 1mm; }
.ln-doc .ln-doc-logos img { max-height: 11mm; max-width: 46mm; object-fit: contain; display: block; }
.ln-doc table.liste { width: 100%; border-collapse: collapse; margin: 0; table-layout: fixed; font-size: 9pt; }
.ln-doc table.liste thead { display: table-header-group; }
.ln-doc table.liste th { text-align: left; font-size: 7.5pt; font-weight: 600; color: #8e8e93; text-transform: uppercase;
  letter-spacing: .03em; border-bottom: 1px solid rgba(0,0,0,.12); padding: 2mm 2.5mm; white-space: nowrap;
  vertical-align: bottom; background: none; position: static; box-shadow: none; }
.ln-doc table.liste th.ln-doc-gruppe { text-align: center; border-bottom: 1px solid rgba(0,0,0,.08); padding-bottom: 1mm; }
.ln-doc table.liste th.ln-doc-abschnitt { white-space: normal; overflow-wrap: normal; padding-top: 1mm; text-transform: none; letter-spacing: 0; }
.ln-doc table.liste td { padding: 2mm 2.5mm; border-bottom: 1px solid rgba(0,0,0,.08); vertical-align: top; color: #1d1d1f;
  overflow-wrap: anywhere; }
.ln-doc table.liste tr { break-inside: avoid; page-break-inside: avoid; }
.ln-doc table.liste .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; overflow-wrap: normal; }
.ln-doc table.liste td.ln-doc-gesamtspalte { font-weight: 600; }
.ln-doc .ln-doc-kw { font-weight: 600; }
.ln-doc .ln-doc-tage { font-variant-numeric: tabular-nums; }
.ln-doc .ln-doc-bea { color: #1d1d1f; }
.ln-doc .ln-doc-txt { white-space: normal; }
.ln-doc .ln-doc-leer { color: #8e8e93; text-align: center; padding: 6mm 2.5mm; }
.ln-doc .ln-doc-rechts { text-align: right; }
.ln-doc table.liste tr.ln-doc-summe td { font-weight: 600; border-top: 1px solid #c7c7cc; border-bottom: 0; padding-top: 2.5mm; }
.ln-doc table.liste.ln-doc-eng { font-size: 8pt; }
.ln-doc table.liste.ln-doc-eng th, .ln-doc table.liste.ln-doc-eng td { padding-left: 1.5mm; padding-right: 1.5mm; }
.ln-doc table.liste.ln-doc-eng th.num, .ln-doc table.liste.ln-doc-eng td.num { padding-left: 1mm; padding-right: 1mm; }
.ln-doc table.liste.ln-doc-eng th.ln-doc-abschnitt { font-size: 7pt; }
.ln-doc .ln-doc-gesamt { display: flex; justify-content: flex-end; align-items: baseline; gap: 6mm; margin-top: 4mm;
  padding: 2.5mm 2.5mm; background: #f2f2f7; border-radius: 1.5mm; break-inside: avoid; page-break-inside: avoid; }
.ln-doc .ln-doc-gesamt span { font-size: 8pt; font-weight: 600; color: #6e6e73; text-transform: uppercase; letter-spacing: .03em; }
.ln-doc .ln-doc-gesamt strong { font-size: 11pt; font-weight: 600; font-variant-numeric: tabular-nums; }
.ln-doc .ln-doc-bemerkung { margin-top: 6mm; break-inside: avoid; page-break-inside: avoid; }
.ln-doc .ln-doc-bemerkung h2 { font-size: 7.5pt; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: .03em;
  margin: 0 0 1.5mm; }
.ln-doc .ln-doc-bemerkung p { white-space: pre-wrap; }
.ln-doc .ln-doc-freigabe { margin: 14mm 0 0 auto; width: 62%; break-inside: avoid; page-break-inside: avoid; }
.ln-doc .ln-doc-freigabe-titel { font-weight: 600; margin-bottom: 11mm; }
.ln-doc .ln-doc-unterschrift { display: grid; grid-template-columns: 2fr 3fr; gap: 8mm; }
.ln-doc .ln-doc-linie { border-bottom: 1px solid #1d1d1f; margin-bottom: 1.2mm; }
.ln-doc .ln-doc-unterschrift span { font-size: 8pt; color: #8e8e93; }
.ln-doc .fuss { margin-top: 8mm; color: #8e8e93; font-size: 8pt; }
@media screen and (max-width: 700px) {
  .ln-doc .kopf { flex-direction: column-reverse; align-items: flex-start; }
  .ln-doc .ln-doc-logos { max-width: 100%; justify-content: flex-start; }
  .ln-doc .ln-doc-freigabe { width: 100%; }
}
`;

/** Seitenränder und Papier: A4 hoch – ersetzt die Vorgabe A4 quer aus `druckeHtml`. */
export const DRUCK_SEITE = `
@page { size: A4 portrait; margin: 14mm 14mm 16mm; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`;

/** Öffnet den Druckdialog für den Nachweis (A4 hoch) – dort auch „Als PDF sichern“. */
export function nachweisDrucken(daten: LeistungsnachweisDaten, n: Leistungsnachweis, projekt: Projekt): void {
  druckeHtml(esc(nachweisDateiname(n, projekt)), nachweisHtml(daten, n, projekt), `${DRUCK_STIL}${DRUCK_SEITE}`);
}
