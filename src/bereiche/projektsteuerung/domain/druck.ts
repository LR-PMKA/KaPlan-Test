/**
 * Druckfassungen von Protokoll und Projektbeteiligtenliste als HTML-Text.
 * Derselbe Text erscheint in der Druckansicht der Seite, in der
 * Live-Druckansicht (eigenes Fenster, etwa auf dem zweiten Bildschirm) und im
 * Druckdialog des Browsers – dort lässt sich „Als PDF sichern“ wählen.
 *
 * Im Protokoll stehen neue und gegenüber dem Vorprotokoll geänderte Angaben
 * blau, unter jeder übernommenen Zeile ihr Ursprung („aus Prot. 1“).
 * Ergänzungen mit eigener Art stehen in einer eigenen Tabellenzeile unter
 * ihrem Eintrag – mit Typ, Verantwortlich und Termin. Erledigtes und
 * Gestrichenes – Tagesordnungspunkt, Eintrag oder Zeile – steht
 * durchgestrichen, mit blauer Linie in dem Protokoll, in dem es erledigt bzw.
 * gestrichen wurde; der Text bleibt dabei schwarz.
 */
import { druckeHtml } from '../../../shared/print';
import {
  eigeneArt,
  eintragEntfaellt,
  eintragNeu,
  entfallenGeaendert,
  feldNeu,
  fuehrerVon,
  topNeu,
  topNeuGestrichen,
  zeileEntfaellt,
  zeileEntfallenGeaendert,
  zeileFeldNeu,
  zeileGestrichen,
  zeileHerkunft,
  zeileNeuGestrichen,
  zeitText,
} from './protokoll';
import type { Eintrag, Logo, Projekt, Protokoll, Top, Zeile } from './types';

/** Maskiert Text für HTML – auch in Attributen. */
export function esc(wert: string | number | null | undefined): string {
  return String(wert ?? '').replace(
    /[&<>"']/g,
    (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[z]!,
  );
}

const fmt = (iso: string) => (iso ? iso.split('-').reverse().join('.') : '');

/** Vollständige Adresse eines Logos – Druckrahmen und Live-Fenster brauchen sie. */
export function logoQuelle(src: string): string {
  if (/^(data:|blob:|https?:)/.test(src)) return src;
  try {
    return new URL(`${import.meta.env.BASE_URL}${src}`, window.location.href).href;
  } catch {
    return src;
  }
}

function logosHtml(logos: Logo[]): string {
  if (logos.length === 0) return '';
  return `<div class="ps-logos">${logos
    .map((l) => `<img src="${esc(logoQuelle(l.src))}" alt="${esc(l.name)}">`)
    .join('')}</div>`;
}

const projektText = (p: Projekt) => [p.nummer, p.name].filter(Boolean).join(' ');

/**
 * Text einer Zeile: Übernommenes schwarz, Neues blau. Setzt sich der Text aus
 * dem früheren Text und einem Nachtrag zusammen, wird nur der Nachtrag blau.
 */
function inhaltHtml(text: string, vorText: string | null, ganzNeu: boolean): string {
  if (ganzNeu) return `<span class="ps-txt ps-n">${esc(text)}</span>`;
  if (vorText === null || text === vorText) return `<span class="ps-txt">${esc(text)}</span>`;
  if (vorText && text.startsWith(vorText)) {
    return `<span class="ps-txt">${esc(vorText)}</span><span class="ps-txt ps-n">${esc(text.slice(vorText.length))}</span>`;
  }
  return `<span class="ps-txt ps-n">${esc(text)}</span>`;
}

const blau = (neu: boolean) => (neu ? ' ps-n' : '');

/** Durchgestrichen; die Linie blau, wenn es in diesem Protokoll gestrichen bzw. erledigt wurde. */
const gestrichen = (html: string, neu: boolean) =>
  `<span class="ps-gestrichen${neu ? ' ps-gestrichen-neu' : ''}">${html}</span>`;

/* ------------------------------------------------------------------ */
/* Protokoll                                                           */
/* ------------------------------------------------------------------ */

/** Termin-Spalte: „entfällt“, „erledigt“, das Datum oder „offen“; leer bei I und F. */
function terminText(x: { typ: Eintrag['typ'] | null; termin: string; status: Eintrag['status'] }, entfaellt: boolean): string {
  if (entfaellt) return 'entfällt';
  if (x.typ !== 'A') return '';
  return x.status === 'erledigt' ? 'erledigt' : fmt(x.termin) || 'offen';
}

/** Eine Zeile: Text, darunter der Ursprung, wenn sie aus einem früheren Protokoll stammt. */
function zeileHtml(top: Top, e: Eintrag, z: Zeile): string {
  const text = inhaltHtml(z.text, z.vor?.text ?? null, z.herkunft === null);
  const herkunft = zeileHerkunft(z);
  return `<div class="ps-zeile">${
    zeileGestrichen(top, e, z) ? gestrichen(text, zeileNeuGestrichen(top, e, z)) : text
  }${herkunft ? `<span class="ps-from">${herkunft}</span>` : ''}</div>`;
}

/**
 * Tabellenzeilen eines Eintrags: zuerst der Ursprung mit den mitlaufenden
 * Ergänzungen, darunter je Ergänzung mit eigener Art eine eigene Zeile.
 */
function eintragHtml(top: Top, e: Eintrag, nr: string): string {
  const zeilen = e.zeilen.filter((z) => z.text.trim());
  const mit = zeilen.filter((z) => !eigeneArt(z));
  const reihen: { nr: boolean; inhalt: string; typ: string; wer: string; termin: string; neu: Record<'typ' | 'wer' | 'termin', boolean> }[] = [];
  if (mit.length > 0 || zeilen.length === mit.length) {
    reihen.push({
      nr: true,
      inhalt: mit.map((z) => zeileHtml(top, e, z)).join(''),
      typ: e.typ,
      wer: e.wer,
      termin: terminText(e, eintragEntfaellt(top, e)),
      // Blau: Termin oder Status geändert, neu gestrichen oder wiederhergestellt
      neu: {
        typ: feldNeu(e, 'typ'),
        wer: feldNeu(e, 'wer'),
        termin: feldNeu(e, 'termin') || feldNeu(e, 'status') || entfallenGeaendert(top, e),
      },
    });
  }
  for (const z of zeilen.filter(eigeneArt)) {
    reihen.push({
      nr: reihen.length === 0,
      inhalt: zeileHtml(top, e, z),
      typ: z.typ ?? '',
      wer: z.wer,
      termin: terminText(z, zeileEntfaellt(top, e, z)),
      neu: {
        typ: zeileFeldNeu(z, 'typ'),
        wer: zeileFeldNeu(z, 'wer'),
        termin: zeileFeldNeu(z, 'termin') || zeileFeldNeu(z, 'status') || zeileEntfallenGeaendert(top, e, z),
      },
    });
  }
  return reihen
    .map(
      (r, i) => `<tr${i < reihen.length - 1 ? ' class="ps-teil"' : ''}>
              <td class="ps-no${blau(r.nr && eintragNeu(e))}">${r.nr ? nr : ''}</td>
              <td>${r.inhalt}</td>
              <td class="ps-ty${blau(r.neu.typ)}">${r.typ}</td>
              <td class="ps-w${blau(r.neu.wer)}">${esc(r.wer)}</td>
              <td class="ps-d${blau(r.neu.termin)}">${r.termin}</td>
            </tr>`,
    )
    .join('');
}

export function protokollHtml(p: Protokoll, projekt: Projekt, logos: Logo[]): string {
  const tn = p.teilnehmer.filter((t) => t.name || t.firma || t.funktion);
  const fuehrer = fuehrerVon(p);
  const pt = projektText(projekt);
  const mitStrich = p.tops.some((t) => t.eintraege.some((e) => e.zeilen.some((z) => zeileGestrichen(t, e, z))) || t.entfaellt);
  const zeilen = p.tops
    .map((top, ti) => {
      const titel = esc(top.titel) || 'Ohne Titel';
      const kopf = `<tr class="ps-topr"><td class="ps-no${blau(topNeu(top))}">${ti + 1}</td><td colspan="4" class="${
        topNeu(top) ? 'ps-n' : ''
      }">${top.entfaellt ? gestrichen(titel, topNeuGestrichen(top)) : titel}</td></tr>`;
      if (top.eintraege.length === 0) {
        return `${kopf}<tr><td></td><td colspan="4" class="ps-leer">keine Einträge</td></tr>`;
      }
      return kopf + top.eintraege.map((e, ei) => eintragHtml(top, e, `${ti + 1}.${ei + 1}`)).join('');
    })
    .join('');

  return `<article class="ps-doc">
    <div class="ps-kopf">
      <div><h1>Protokoll</h1>
      <div class="ps-sub">${esc(p.art || 'Besprechung')} Nr. ${p.nr}${pt ? ` – ${esc(pt)}` : ''}</div></div>
      ${logosHtml(logos)}
    </div>
    <div class="ps-meta">
      <div><span>Datum</span>${fmt(p.datum) || '–'}</div>
      <div><span>Zeit</span>${esc(zeitText(p)) || '–'}</div>
      <div><span>Ort</span>${esc(p.ort) || '–'}</div>
      <div><span>Protokollführung</span>${esc(fuehrer?.name) || '–'}</div>
    </div>
    ${
      tn.length
        ? `<h3>Teilnehmende und Verteiler</h3>
    <table class="ps-tn"><thead><tr><th>Name</th><th>Funktion</th><th>Firma</th><th>Kürzel</th><th>Status</th></tr></thead>
    <tbody>${tn
      .map(
        (t) =>
          `<tr><td>${esc(t.name)}</td><td>${esc(t.funktion)}</td><td>${esc(t.firma)}</td><td>${esc(t.kuerzel)}</td><td>${esc(
            t.status,
          )}</td></tr>`,
      )
      .join('')}</tbody></table>`
        : ''
    }
    ${p.verteiler ? `<p class="ps-verteiler">Zusätzlicher Verteiler: ${esc(p.verteiler)}</p>` : ''}
    <div class="ps-legende"><b>I</b> Information, <b>F</b> Festlegung, <b>A</b> Aufgabe. <span class="ps-n">Neue und geänderte Einträge sind blau dargestellt.</span>${
      mitStrich ? ' Durchgestrichene Einträge sind erledigt oder entfallen.' : ''
    }</div>
    <table class="ps-pt">
      <thead><tr><th class="ps-no">Nr.</th><th>Inhalt</th><th class="ps-ty">Typ</th><th class="ps-w">Verantwortlich</th><th class="ps-d">Termin</th></tr></thead>
      <tbody>${zeilen}</tbody>
    </table>
    <div class="ps-fuss">
      ${p.naechster ? `<p><b>Nächster Termin:</b> ${fmt(p.naechster)}</p>` : ''}
      ${
        fuehrer
          ? `<div class="ps-unterschriften"><p>Aufgestellt: ${esc(fuehrer.name)}, ${fmt(p.datum)}</p><p class="ps-freigabe">Freigegeben:</p></div>`
          : ''
      }
      ${p.hinweis ? `<p class="ps-hinweis">${esc(p.hinweis)}</p>` : ''}
    </div>
  </article>`;
}

/* ------------------------------------------------------------------ */
/* Projektbeteiligtenliste                                             */
/* ------------------------------------------------------------------ */

export interface BeteiligtenZeile {
  funktion: string;
  name: string;
  firma: string;
  kuerzel: string;
  email: string;
  telefon: string;
}

export function beteiligteHtml(projekt: Projekt, zeilen: BeteiligtenZeile[], logos: Logo[], stand: string): string {
  const pt = projektText(projekt);
  return `<article class="ps-doc">
    <div class="ps-kopf">
      <div><h1>Projektbeteiligte</h1>
      <div class="ps-sub">${pt ? esc(pt) : 'Projekt'}</div></div>
      ${logosHtml(logos)}
    </div>
    <div class="ps-meta">
      <div><span>Stand</span>${fmt(stand)}</div>
      <div><span>Personen</span>${zeilen.length}</div>
      <div></div><div></div>
    </div>
    <table class="ps-pt">
      <thead><tr><th>Funktion</th><th>Name</th><th>Firma / Büro</th><th>Kürzel</th><th>E-Mail</th><th>Telefon</th></tr></thead>
      <tbody>${
        zeilen
          .map(
            (z) =>
              `<tr><td>${esc(z.funktion) || '–'}</td><td><b>${esc(z.name)}</b></td><td>${esc(z.firma)}</td><td>${esc(
                z.kuerzel,
              )}</td><td>${esc(z.email)}</td><td>${esc(z.telefon)}</td></tr>`,
          )
          .join('') || '<tr><td colspan="6" class="ps-leer">Keine Projektbeteiligten.</td></tr>'
      }</tbody>
    </table>
  </article>`;
}

/* ------------------------------------------------------------------ */
/* Gestaltung                                                          */
/* ------------------------------------------------------------------ */

/** Gestaltung des Blatts – gilt in der Seite, im Live-Fenster und im Druck. */
export const DRUCK_STIL = `
.ps-doc { color: #000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  font-size: 13px; line-height: 1.45; letter-spacing: 0; }
.ps-doc h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.1; color: #24456e; }
.ps-doc h3 { font-size: 13px; font-weight: 600; margin: 0 0 6px; letter-spacing: 0; }
.ps-doc p { margin: 0; }
.ps-doc table { width: 100%; border-collapse: collapse; margin: 0; }
.ps-doc th { position: static; box-shadow: none; background: none; text-transform: none; letter-spacing: 0; white-space: normal; }
.ps-doc .ps-kopf { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border: 0; padding: 0; margin: 0; }
.ps-doc .ps-sub { font-size: 15px; margin-top: 4px; }
.ps-doc .ps-logos { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.ps-doc .ps-logos img { max-height: 28px; max-width: 150px; object-fit: contain; display: block; }
.ps-doc .ps-meta { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 2px solid #24456e;
  border-bottom: 1px solid #c9cfd4; margin: 20px 0 22px; }
.ps-doc .ps-meta div { padding: 8px 10px 8px 0; }
.ps-doc .ps-meta span { display: block; color: #5b6672; font-size: 11px; }
.ps-doc .ps-tn td, .ps-doc .ps-tn th { border-bottom: 1px solid #c9cfd4; padding: 4px 6px 4px 0; text-align: left; vertical-align: top; }
.ps-doc .ps-tn th { font-weight: 500; color: #5b6672; font-size: 11px; }
.ps-doc .ps-tn td { font-size: 12px; color: #000; }
.ps-doc .ps-verteiler { margin-top: 8px; }
.ps-doc .ps-legende { margin: 18px 0 6px; color: #5b6672; font-size: 11px; }
.ps-doc .ps-legende b { color: #000; }
.ps-doc .ps-pt th { font-size: 11px; font-weight: 500; color: #5b6672; text-align: left; padding: 6px; border-bottom: 2px solid #000; }
.ps-doc .ps-pt td { padding: 7px 6px; border-bottom: 1px solid #c9cfd4; vertical-align: top; font-size: 12px; color: #000; }
.ps-doc .ps-pt tr { page-break-inside: avoid; break-inside: avoid; }
.ps-doc .ps-pt tr.ps-teil td { border-bottom: 1px dashed #dfe3e6; }
.ps-doc .ps-pt .ps-topr td { background: #eef1ee; font-weight: 600; padding-top: 8px; font-size: 13px; }
.ps-doc .ps-pt .ps-no { width: 44px; font-weight: 600; white-space: nowrap; }
.ps-doc .ps-pt .ps-ty { width: 40px; text-align: center; }
.ps-doc .ps-pt td.ps-ty { font-weight: 600; }
.ps-doc .ps-pt .ps-w { width: 104px; }
.ps-doc .ps-pt .ps-d { width: 82px; white-space: nowrap; }
.ps-doc .ps-pt td.ps-leer { color: #5b6672; }
.ps-doc .ps-txt { white-space: pre-wrap; }
.ps-doc .ps-from { display: block; color: #5b6672; font-size: 11px; margin-top: 2px; }
.ps-doc .ps-zeile + .ps-zeile { margin-top: 5px; }
.ps-doc .ps-n, .ps-doc .ps-pt td.ps-n, .ps-doc .ps-legende .ps-n { color: #1846c4; }
.ps-doc .ps-gestrichen { text-decoration: line-through; text-decoration-color: #000; text-decoration-thickness: 1px; }
.ps-doc .ps-gestrichen-neu { text-decoration-color: #1846c4; text-decoration-thickness: 1.5px; }
.ps-doc .ps-fuss { margin-top: 24px; display: grid; gap: 10px; color: #000; font-size: inherit; padding: 0; }
.ps-doc .ps-unterschriften { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; align-items: baseline;
  break-inside: avoid; page-break-inside: avoid; }
.ps-doc .ps-unterschriften > p { min-width: 0; overflow-wrap: anywhere; }
.ps-doc .ps-freigabe { width: 30ch; max-width: 100%; justify-self: end; }
.ps-doc .ps-hinweis { color: #5b6672; font-size: 11px; border-top: 1px solid #c9cfd4; padding-top: 10px; }
@media (max-width: 700px) { .ps-doc .ps-meta { grid-template-columns: repeat(2, 1fr); } }
@media print {
  .ps-doc { font-size: 10.5pt; }
  .ps-doc .ps-tn td, .ps-doc .ps-pt td { font-size: 9.5pt; }
  .ps-doc .ps-pt .ps-topr td { font-size: 10pt; }
}
`;

/** Rahmen des Live-Fensters: Blatt auf grauem Grund, im Druck ohne Rand. */
const LIVE_STIL = `
html, body { margin: 0; background: #f5f5f7; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
main { padding: 24px 16px 60px; }
.ps-blatt { background: #fff; max-width: 860px; margin: 0 auto; padding: 44px 52px; border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0,0,0,.06), 0 0 0 .5px rgba(0,0,0,.05); }
@media (max-width: 700px) { .ps-blatt { padding: 24px 18px; } }
@media print {
  @page { size: A4 portrait; margin: 14mm 14mm 16mm; }
  html, body { background: #fff; }
  main { padding: 0; }
  .ps-blatt { box-shadow: none; padding: 0; max-width: none; }
}
`;

/** Leeres Dokument für das Live-Fenster; der Inhalt kommt nach `#ps-live`. */
export function liveDokument(titel: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)}</title><style>${LIVE_STIL}${DRUCK_STIL}</style></head>
<body><main id="ps-live"></main></body></html>`;
}

/** Öffnet den Druckdialog für ein Blatt (A4 hoch). */
export function blattDrucken(titel: string, inhalt: string): void {
  druckeHtml(
    esc(titel),
    inhalt,
    `${DRUCK_STIL}
    @page { size: A4 portrait; margin: 14mm 14mm 16mm; }
    body { color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
  );
}
