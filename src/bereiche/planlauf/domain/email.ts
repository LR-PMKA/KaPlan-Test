/**
 * Aufbereitung vorgefertigter E-Mails aus den Projektvorlagen.
 * Platzhalter werden im Format {{schluessel}} ersetzt.
 */
import { formatDate, relativeLabel, today } from '../../../shared/dates';
import { tageText, verzugBisHeute, zeitrahmen } from './nachweis';
import { aktuelleSchritte, verfolgen } from './ablauf';
import { mitlaufendePlaene, paketVon } from './uebersicht';
import {
  VERSAND_ANLIEGEN_LABEL,
  type AppData,
  type Contact,
  type EmailTemplate,
  type ID,
  type PlanDocument,
  type PlanRun,
  type Project,
  type RunStep,
  type VersandAnliegen,
} from './types';

export interface Platzhalter {
  schluessel: string;
  beschreibung: string;
}

export const PLATZHALTER: Platzhalter[] = [
  { schluessel: 'anrede', beschreibung: 'Anrede-Zeile, z.B. „Sehr geehrte Frau Berger,“' },
  { schluessel: 'empfaenger', beschreibung: 'Vor- und Nachname des Empfängers' },
  { schluessel: 'empfaenger.firma', beschreibung: 'Firma des Empfängers' },
  { schluessel: 'empfaenger.anschrift', beschreibung: 'Anschrift des Empfängers (einzeilig)' },
  { schluessel: 'rolle', beschreibung: 'Funktion im Prozessschritt' },
  { schluessel: 'projekt', beschreibung: 'Projektname' },
  { schluessel: 'projekt.nummer', beschreibung: 'Projektnummer' },
  { schluessel: 'plan', beschreibung: 'Titel von Plan / Paket / Verzeichnis' },
  { schluessel: 'plan.nummer', beschreibung: 'Plannummer' },
  { schluessel: 'plan.index', beschreibung: 'Planindex' },
  { schluessel: 'plan.gewerk', beschreibung: 'Gewerk des Plans' },
  { schluessel: 'plan.phase', beschreibung: 'Planungsphase' },
  { schluessel: 'planlauf', beschreibung: 'Bezeichnung des Planlaufs' },
  { schluessel: 'schritt', beschreibung: 'Name des Prozessschritts' },
  { schluessel: 'soll', beschreibung: 'Soll-Termin, z.B. 14.03.2026' },
  { schluessel: 'frist', beschreibung: 'Relative Frist, z.B. „in 3 Tagen“' },
  { schluessel: 'verzug', beschreibung: 'Verzug mit Einheit, z.B. „5 Arbeitstage“ (0 falls im Plan)' },
  { schluessel: 'verzug.zahl', beschreibung: 'Verzug als Zahl (Arbeits- bzw. Kalendertage nach Projekt)' },
  { schluessel: 'liste', beschreibung: 'Sammel-E-Mail: Liste der Pläne mit Schritt und Soll' },
  { schluessel: 'anzahl', beschreibung: 'Sammel-E-Mail: Anzahl der Pläne in der Liste' },
  { schluessel: 'anliegen', beschreibung: 'Versandmail: Anliegen des vorangehenden Versandschritts, z.B. „Freigabe“' },
  { schluessel: 'sharepoint.eingang', beschreibung: 'Versandmail: SharePoint-Link Eingang des Empfängers' },
  { schluessel: 'sharepoint.ausgang', beschreibung: 'Versandmail: SharePoint-Link Ausgang des Empfängers' },
  { schluessel: 'versandliste', beschreibung: 'Versandmail: Unterlagen nach Planpaketen („Paket:“ und darunter „* Codierung Titel“)' },
  { schluessel: 'heute', beschreibung: 'Heutiges Datum' },
  { schluessel: 'absender', beschreibung: 'Absendername aus den Projekteinstellungen' },
];

export interface MailKontext {
  project: Project;
  run: PlanRun;
  step: RunStep;
  contact: Contact | null;
  data: AppData;
}

export function werteFuerKontext(ctx: MailKontext): Record<string, string> {
  const { project, run, step, contact, data } = ctx;
  const doc = data.documents.find((d) => d.id === run.documentId);
  // Verzug wie im Terminnachweis: Arbeits- bzw. Kalendertage nach Projekteinstellung
  const rahmen = zeitrahmen(project);
  const verzug = verzugBisHeute(step, rahmen);
  return {
    anrede: anredeZeile(contact),
    empfaenger: contact ? `${contact.vorname} ${contact.nachname}`.trim() : '',
    'empfaenger.firma': contact?.firma ?? '',
    'empfaenger.anschrift': (contact?.anschrift ?? '').replace(/\s*\n\s*/g, ', '),
    rolle: step.roleName,
    projekt: project.name,
    'projekt.nummer': project.nummer,
    plan: doc?.titel ?? '',
    'plan.nummer': doc?.nummer ?? '',
    'plan.index': doc?.index ?? '',
    'plan.gewerk': doc?.gewerk ?? '',
    'plan.phase': doc?.planungsphase ?? '',
    planlauf: run.name,
    schritt: step.name,
    soll: formatDate(step.sollDatum),
    frist: relativeLabel(step.sollDatum),
    verzug: tageText(verzug, rahmen.arbeitstage),
    'verzug.zahl': String(verzug),
    liste: listenZeile({ step, doc }, rahmen.arbeitstage, verzug),
    anzahl: '1',
    anliegen: anliegenText(versandSchrittVor(run, step.id)?.versandAnliegen ?? null),
    'sharepoint.eingang': contact?.sharepointEingang?.trim() || FEHLT_EINGANG,
    'sharepoint.ausgang': contact?.sharepointAusgang?.trim() || FEHLT_AUSGANG,
    versandliste: versandListe([run.documentId], data.documents),
    heute: formatDate(today()),
    absender: project.settings.absenderName,
  };
}

/** Bildet die Anredezeile aus der bei der Person hinterlegten Anrede. */
function anredeZeile(contact: Contact | null): string {
  if (!contact) return 'Guten Tag,';
  const anrede = contact.anrede.trim().toLowerCase();
  const name = contact.nachname.trim();
  if (!name) return 'Guten Tag,';
  if (anrede.startsWith('herr')) return `Sehr geehrter Herr ${name},`;
  if (anrede.startsWith('frau')) return `Sehr geehrte Frau ${name},`;
  return `Guten Tag ${contact.vorname} ${name},`.replace(/\s+/g, ' ');
}

export function fuelleVorlage(text: string, werte: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => werte[key] ?? `{{${key}}}`);
}

export interface VorbereiteteMail {
  an: string;
  betreff: string;
  text: string;
  /** Öffnet das lokal eingerichtete Outlook (bzw. das Standard-Mailprogramm). */
  mailto: string;
  /** Öffnet ein neues Fenster in Outlook im Web. */
  outlookWeb: string;
}

export function mailVorbereiten(template: EmailTemplate, ctx: MailKontext): VorbereiteteMail {
  const werte = werteFuerKontext(ctx);
  const betreff = fuelleVorlage(template.betreff, werte);
  const text = fuelleVorlage(template.text, werte);
  const an = ctx.contact?.email ?? '';
  return { an, betreff, text, ...mailLinks(an, betreff, text) };
}

/**
 * Höchstlänge einer mailto-Verknüpfung (kodiert). Längere Verknüpfungen
 * schneiden manche Mailprogramme bzw. Browser ab – dann nur „Kopieren“ anbieten.
 */
export const MAILTO_GRENZE = 1800;

/** Baut die Verknüpfungen für Outlook (lokal) und Outlook im Web; `zuLang`: über MAILTO_GRENZE. */
export function mailLinks(an: string, betreff: string, text: string) {
  const mailto = `mailto:${encodeURIComponent(an)}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
  return {
    mailto,
    outlookWeb:
      'https://outlook.office.com/mail/deeplink/compose?' +
      `to=${encodeURIComponent(an)}&subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`,
    zuLang: mailto.length > MAILTO_GRENZE,
  };
}

/* ------------------------------------------------------------------ */
/* Sammel-E-Mail je Person                                             */
/* ------------------------------------------------------------------ */

/** Ein Plan in einer Sammel-E-Mail: der anstehende Schritt eines Laufs. */
export interface SammelPosten {
  run: PlanRun;
  step: RunStep;
}

/** Eine Zeile der Liste: „• Plancodierung – Titel: Schritt, Soll 14.03.2026 (3 Arbeitstage überfällig)“. */
function listenZeile(
  posten: { step: RunStep; doc: Pick<PlanDocument, 'nummer' | 'titel' | 'index'> | undefined },
  arbeitstage: boolean,
  verzug?: number,
): string {
  const { step, doc } = posten;
  const plan = doc ? [doc.nummer, doc.titel].filter(Boolean).join(' – ') + (doc.index ? ` (Index ${doc.index})` : '') : '';
  const ueber = verzug && verzug > 0 ? ` (${tageText(verzug, arbeitstage)} überfällig)` : '';
  return `• ${plan ? `${plan}: ` : ''}${step.name}, Soll ${formatDate(step.sollDatum)}${ueber}`;
}

/** Liste der Pläne mit Schritt und Soll – frühestes Soll zuerst (Platzhalter {{liste}}). */
export function sammelListe(posten: SammelPosten[], data: Pick<AppData, 'documents' | 'projects'>): string {
  return [...posten]
    .sort((a, b) => (a.step.sollDatum ?? '9999').localeCompare(b.step.sollDatum ?? '9999'))
    .map(({ run, step }) => {
      const project = data.projects.find((p) => p.id === run.projectId);
      const rahmen = zeitrahmen(project);
      const doc = data.documents.find((d) => d.id === run.documentId);
      return listenZeile({ step, doc }, rahmen.arbeitstage, verzugBisHeute(step, rahmen));
    })
    .join('\n');
}

/**
 * Sammel-E-Mail an eine Person über alle ihre anstehenden Schritte. Einzelwerte
 * (Projekt, Plan, Schritt, Soll …) stammen vom dringlichsten Posten; {{liste}}
 * nennt alle, {{versandliste}} ebenso nach Planpaketen. Enthält die Vorlage
 * keinen der beiden Platzhalter, wird {{liste}} angehängt. `zuLang`: die mailto-Verknüpfung überschreitet MAILTO_GRENZE.
 */
export function sammelMailVorbereiten(
  template: EmailTemplate,
  ctx: { contact: Contact | null; posten: SammelPosten[]; data: AppData },
): VorbereiteteMail & { zuLang: boolean } {
  const sortiert = [...ctx.posten].sort((a, b) => (a.step.sollDatum ?? '9999').localeCompare(b.step.sollDatum ?? '9999'));
  const erster = sortiert[0];
  const project = erster ? ctx.data.projects.find((p) => p.id === erster.run.projectId) : undefined;
  const werte =
    erster && project
      ? werteFuerKontext({ project, run: erster.run, step: erster.step, contact: ctx.contact, data: ctx.data })
      : {};
  const projekte = new Set(ctx.posten.map((p) => p.run.projectId));
  const alle = {
    ...werte,
    // Über mehrere Projekte: kein einzelnes Projekt nennen
    ...(projekte.size > 1 ? { projekt: 'mehrere Projekte', 'projekt.nummer': '' } : {}),
    liste: sammelListe(ctx.posten, ctx.data),
    anzahl: String(ctx.posten.length),
    versandliste: versandListe(
      ctx.posten.map((p) => p.run.documentId),
      ctx.data.documents,
    ),
  };
  const betreff = fuelleVorlage(template.betreff, alle);
  // Die Versandmail bringt mit {{versandliste}} ihre eigene Liste mit
  const vorlageText = /\{\{\s*(?:liste|versandliste)\s*\}\}/.test(template.text)
    ? template.text
    : `${template.text}\n\n{{liste}}`;
  const text = fuelleVorlage(vorlageText, alle);
  const an = ctx.contact?.email ?? '';
  return { an, betreff, text, ...mailLinks(an, betreff, text) };
}

/** Wählt die zum Ampelstatus passende Vorlage vor. */
export function vorlageVorschlagen(
  templates: EmailTemplate[],
  ueberfaellig: boolean,
): EmailTemplate | undefined {
  const anlass = ueberfaellig ? 'ueberfaellig' : 'erinnerung';
  return templates.find((t) => t.anlass === anlass) ?? templates[0];
}

/* ------------------------------------------------------------------ */
/* Versandmail                                                         */
/* ------------------------------------------------------------------ */

/** Steht wörtlich in der Vorlage „Versand“; vor dem Absenden von Hand ersetzen. */
export const ORDNERNAME_PLATZHALTER = 'ORDNERNAME EINFÜGEN';
export const FEHLT_EINGANG = '[SharePoint-Link Eingang fehlt]';
export const FEHLT_AUSGANG = '[SharePoint-Link Ausgang fehlt]';
export const FEHLT_ANLIEGEN = '[Anliegen fehlt]';

/** Lücken im Text („[… fehlt]“) – der Dialog weist darauf hin. */
export function fehlendeAngaben(text: string): string[] {
  return [...new Set(text.match(/\[[^\]\n]+ fehlt\]/g) ?? [])];
}

function anliegenText(anliegen: VersandAnliegen | null): string {
  return anliegen ? VERSAND_ANLIEGEN_LABEL[anliegen] : FEHLT_ANLIEGEN;
}

/**
 * Der Versandschritt, nach dem ein Schritt ansteht: ein Vorgänger im Verlauf
 * (siehe Verlauf.vorgaenger) mit Anliegen. Sein Anliegen steht in der Mail an
 * die für den Schritt zuständige Person.
 */
export function versandSchrittVor(run: Pick<PlanRun, 'steps'>, stepId: ID): RunStep | undefined {
  const verlauf = verfolgen(run.steps);
  for (const id of verlauf.vorgaenger.get(stepId) ?? []) {
    const s = run.steps.find((x) => x.id === id);
    if (s?.versandAnliegen) return s;
  }
  return undefined;
}

/** Ein Plan in einer Sammel-Versandmail. */
export interface VersandPosten {
  run: PlanRun;
  /** Schritt der Empfängerin bzw. des Empfängers – nach dem Versandschritt. */
  step: RunStep;
  /** Der anstehende Schritt, an dem die vorbereitete Mail vermerkt wird. */
  vermerk: RunStep;
  anliegen: VersandAnliegen;
}

/**
 * Versandmails eines laufenden Planlaufs: Steht ein Versandschritt an (etwa
 * „PLM an BVB zur Freigabe“), gilt die Mail den Zuständigen der Schritte
 * danach (bei einem Block allen Zweiganfängen); steht ein Schritt direkt nach
 * einem erledigten Versandschritt an, gilt sie dessen Zuständigen. Vermerkt
 * wird jeweils am anstehenden Schritt.
 */
export function versandPosten(run: PlanRun): VersandPosten[] {
  if (run.status !== 'laufend') return [];
  const verlauf = verfolgen(run.steps);
  const ergebnis: VersandPosten[] = [];
  for (const anstehend of aktuelleSchritte(run)) {
    if (anstehend.versandAnliegen) {
      for (const [id, vor] of verlauf.vorgaenger) {
        const step = run.steps.find((s) => s.id === id);
        if (step && vor.includes(anstehend.id)) {
          ergebnis.push({ run, step, vermerk: anstehend, anliegen: anstehend.versandAnliegen });
        }
      }
      continue;
    }
    const versand = versandSchrittVor(run, anstehend.id);
    if (versand?.versandAnliegen) ergebnis.push({ run, step: anstehend, vermerk: anstehend, anliegen: versand.versandAnliegen });
  }
  return ergebnis;
}

const planName = (d: Pick<PlanDocument, 'nummer' | 'titel'>) => [d.nummer.trim(), d.titel.trim()].filter(Boolean).join(' ');
const nachNummer = (a: PlanDocument, b: PlanDocument) => a.nummer.localeCompare(b.nummer, 'de', { numeric: true });

/**
 * Liste der Unterlagen für die Versandmail ({{versandliste}}): je Planpaket
 * „<Paket>:“ und darunter „* <Codierung> <Titel>“, Planverzeichnisse mit ihren
 * mitlaufenden Plänen eingerückt („  – …“). Ohne Paket: ein einzelner Plan
 * steht mit seinem Namen als Überschrift, sonst gesammelt unter „Ohne
 * Planpaket:“. Gruppen durch eine Leerzeile getrennt.
 */
export function versandListe(documentIds: ID[], documents: PlanDocument[]): string {
  const docs = [...new Set(documentIds)]
    .map((id) => documents.find((d) => d.id === id))
    .filter((d): d is PlanDocument => Boolean(d));
  const gruppen = new Map<ID | null, PlanDocument[]>();
  for (const d of docs) {
    const paket = paketVon(documents, d);
    gruppen.set(paket, [...(gruppen.get(paket) ?? []), d]);
  }
  const zeilen = (liste: PlanDocument[]) =>
    [...liste].sort(nachNummer).flatMap((d) => [
      `* ${planName(d)}`,
      ...(d.kind === 'verzeichnis' ? mitlaufendePlaene(documents, d.id).sort(nachNummer).map((p) => `  – ${planName(p)}`) : []),
    ]);
  const pakete = [...gruppen.entries()]
    .filter(([id]) => id !== null)
    .map(([id, liste]) => {
      const paket = documents.find((d) => d.id === id);
      return { titel: paket ? planName(paket) : 'Planpaket', liste };
    })
    .sort((a, b) => a.titel.localeCompare(b.titel, 'de', { numeric: true }));
  const bloecke = pakete.map((p) => [`${p.titel}:`, ...zeilen(p.liste)].join('\n'));
  const ohne = gruppen.get(null) ?? [];
  if (ohne.length === 1 && ohne[0].kind === 'plan') bloecke.push(planName(ohne[0]));
  else if (ohne.length > 0) bloecke.push(['Ohne Planpaket:', ...zeilen(ohne)].join('\n'));
  return bloecke.join('\n\n');
}

const htmlEscape = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Eine Zeile als HTML: Links als Links, ORDNERNAME EINFÜGEN und fehlende Angaben rot und fett. */
function zeileHtml(zeile: string): string {
  return htmlEscape(zeile)
    .replace(/https?:\/\/[^\s<>"]+/g, (url) => `<a href="${url}">${url}</a>`)
    .replace(
      new RegExp(`${ORDNERNAME_PLATZHALTER}|\\[[^\\]]+ fehlt\\]`, 'g'),
      (t) => `<strong style="color:#c00000">${t}</strong>`,
    );
}

/**
 * Formatierte Fassung eines Mailtexts für „Kopieren (formatiert)“: Absätze,
 * Zeilen mit „* “ als Aufzählung (eingerückte „– “-Zeilen darunter), die
 * Zeile davor mit Doppelpunkt fett, Links anklickbar, „ORDNERNAME EINFÜGEN“
 * rot und fett.
 */
export function mailHtml(text: string): string {
  const absaetze = text.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  const teile = absaetze.map((absatz) => {
    const zeilen = absatz.split('\n');
    const html: string[] = [];
    let i = 0;
    while (i < zeilen.length) {
      const z = zeilen[i];
      if (/^\* /.test(z)) {
        const punkte: string[] = [];
        while (i < zeilen.length && /^\* /.test(zeilen[i])) {
          let punkt = `<li>${zeileHtml(zeilen[i].slice(2))}`;
          i++;
          // Eingerückte „– “-Zeilen gehören zum Punkt davor
          const unter: string[] = [];
          while (i < zeilen.length && /^\s+– /.test(zeilen[i])) {
            unter.push(`<li>${zeileHtml(zeilen[i].replace(/^\s+– /, ''))}</li>`);
            i++;
          }
          if (unter.length > 0) punkt += `<ul style="margin:0;list-style-type:circle">${unter.join('')}</ul>`;
          punkte.push(`${punkt}</li>`);
        }
        html.push(`<ul style="margin:0">${punkte.join('')}</ul>`);
        continue;
      }
      const ueberschrift = /:\s*$/.test(z) && /^\* /.test(zeilen[i + 1] ?? '');
      html.push(ueberschrift ? `<strong>${zeileHtml(z)}</strong>` : zeileHtml(z));
      i++;
    }
    // Zeilen eines Absatzes mit <br>, Listen ohne zusätzlichen Umbruch
    const inhalt = html.reduce(
      (acc, h, k) => (k === 0 ? h : /^<ul/.test(h) || /^<ul/.test(html[k - 1]) ? acc + h : `${acc}<br>${h}`),
      '',
    );
    return `<div style="margin:0 0 11pt 0">${inhalt}</div>`;
  });
  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${teile.join('')}</div>`;
}
