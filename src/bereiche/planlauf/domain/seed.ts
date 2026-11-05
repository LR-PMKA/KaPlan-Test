/**
 * Stammdaten und Demodatenbestand.
 *
 * Funktionen, Gewerke und die drei Workflows (VVBau) entsprechen der
 * vorgegebenen Aufstellung. Die Fristen sind dort nicht hinterlegt und daher
 * als Erfahrungswerte vorbelegt – sie lassen sich je Kette und je Planlauf
 * anpassen.
 */
import { addDays, istArbeitstag, today } from '../../../shared/dates';
import { aktuelleSchritte, kontaktFuerRolleUndGewerk, kontaktName, planlaufName, recalcRun, stepsAusTemplate } from './engine';
import { aenderungenAufLauf, braucheNachweis, schrittStatusSetzen } from './abschluss';
import { basisplanFestlegen } from './simulation';
import { laufAenderungenProtokollieren } from './protokoll';
import {
  DATEN_VERSION,
  EIGENE_ROLLE,
  STAMMDATEN_VERSION,
  versandAnliegenNachName,
  STANDARD_BEARBEITER,
  type AppData,
  type Antwort,
  type Contact,
  type EmailAnlass,
  type EmailTemplate,
  type Erinnerung,
  type ID,
  type ISODate,
  type Nachweis,
  type PlanDocument,
  type PlanRun,
  type ProcessTemplate,
  type ProcessTemplateStep,
  type Project,
  GEWERKE,
  type Role,
  type Seite,
  type StandardRolle,
  type StepType,
} from './types';

/* ------------------------------------------------------------------ */
/* Funktionen                                                      */
/* ------------------------------------------------------------------ */

/** Rolle „Planer“ in den Workflows – je Gewerk besetzt. */
export const ROLLE_PLANER = 'Fachplaner';
export const ROLLE_BVB = 'Bauvorlageberechtiger';
export const ROLLE_PL = 'Projektleitung';
export const ROLLE_PSV = 'Fachtechnischer Prüfer';
export const ROLLE_PRST = 'Prüfstatiker';

/**
 * Vorlage einer Funktion. `jeGewerk` bedeutet: die Funktion wird für jedes
 * Gewerk einzeln geführt und besetzt – „Fachplaner OLA“ ist damit eine andere
 * Funktion als „Fachplaner KIB“. Sonst gilt die Funktion übergreifend.
 * `seite` ordnet die Funktion im Terminnachweis einer Seite zu.
 */
interface RollenVorlage {
  id: string;
  name: string;
  kuerzel: string;
  farbe: string;
  beschreibung: string;
  jeGewerk: boolean;
  seite: Seite | null;
}

const ROLLEN_VORLAGEN: RollenVorlage[] = [
  { id: 'srol-plm', name: EIGENE_ROLLE, kuerzel: 'PLM', farbe: '#24456e', beschreibung: 'Eigene Bearbeitung', jeGewerk: false, seite: 'plm' },
  { id: 'srol-pl', name: ROLLE_PL, kuerzel: 'PL', farbe: '#5856d6', beschreibung: '', jeGewerk: false, seite: 'auftraggeber' },
  { id: 'srol-fp', name: ROLLE_PLANER, kuerzel: 'FP', farbe: '#ff9500', beschreibung: 'Fachplanung des Gewerks', jeGewerk: true, seite: 'planer' },
  { id: 'srol-fs', name: 'Fachspezialist', kuerzel: 'FS', farbe: '#c77700', beschreibung: '', jeGewerk: true, seite: 'planer' },
  { id: 'srol-bvb', name: ROLLE_BVB, kuerzel: 'BVB', farbe: '#ff3b30', beschreibung: 'Freigabeberechtigt', jeGewerk: true, seite: 'auftraggeber' },
  { id: 'srol-an', name: 'Bau AN', kuerzel: 'AN', farbe: '#af52de', beschreibung: '', jeGewerk: true, seite: null },
  { id: 'srol-buew', name: 'Bauüberwachung', kuerzel: 'BÜW', farbe: '#00a0a0', beschreibung: '', jeGewerk: true, seite: 'auftraggeber' },
  { id: 'srol-psv', name: ROLLE_PSV, kuerzel: 'PSV', farbe: '#34c759', beschreibung: 'Planprüfer des Gewerks', jeGewerk: true, seite: 'pruefer' },
  { id: 'srol-prst', name: ROLLE_PRST, kuerzel: 'PrSt', farbe: '#248a3d', beschreibung: '', jeGewerk: true, seite: 'pruefer' },
  { id: 'srol-vep', name: 'Vermessungsprüfer', kuerzel: 'VeP', farbe: '#2a9d8f', beschreibung: '', jeGewerk: true, seite: 'pruefer' },
  { id: 'srol-erp', name: 'Erdungsprüfer', kuerzel: 'ErP', farbe: '#457b9d', beschreibung: '', jeGewerk: true, seite: 'pruefer' },
  { id: 'srol-stp', name: 'Schweißtechnischer Prüfer', kuerzel: 'StP', farbe: '#6d597a', beschreibung: '', jeGewerk: true, seite: 'pruefer' },
  { id: 'srol-kop', name: 'Korrosionsschutzprüfer', kuerzel: 'KoP', farbe: '#b56576', beschreibung: '', jeGewerk: true, seite: 'pruefer' },
  { id: 'srol-ggp', name: 'Gleisgeometrie Prüfer', kuerzel: 'GgP', farbe: '#e07a5f', beschreibung: '', jeGewerk: true, seite: 'pruefer' },
  { id: 'srol-gtp', name: 'Geotechnischer Prüfer', kuerzel: 'GtP', farbe: '#8a5a44', beschreibung: '', jeGewerk: true, seite: 'pruefer' },
];

/** Funktionen je Gewerk: aus jeder Vorlage entsteht eine Funktion pro Gewerk. */
export const STANDARD_ROLLEN: StandardRolle[] = ROLLEN_VORLAGEN.flatMap((v) => {
  const { jeGewerk, id, ...rest } = v;
  return jeGewerk
    ? GEWERKE.map((g) => ({ ...rest, id: `${id}-${g.toLowerCase()}`, gewerk: g as string | null }))
    : [{ ...rest, id, gewerk: null }];
});

/* ------------------------------------------------------------------ */
/* Workflows (VVBau)                                               */
/* ------------------------------------------------------------------ */

/** Im Zweig eines Blocks: der Zweig ist beendet, weiter nach dem Block (gespeichert als `'ende'`). */
const ZWEIGENDE = 'zweigende';

interface RohSchritt {
  /** Code laut Aufstellung, dient als Sprungziel. */
  code: string;
  name: string;
  typ: StepType;
  rolle: string;
  frist: number;
  nachweis?: Nachweis;
  /**
   * Nachfolger bei Aufgaben; fehlt er, folgt der nächste Schritt der Liste
   * (im Zweig: des Zweigs). `'ende'` beendet den Planlauf, `ZWEIGENDE` den Zweig.
   */
  next?: string;
  /** Sprungziele der Antworten einer Entscheidung „Ja“, „Nein“ und – falls angegeben – „Nachreichung“. */
  ja?: string;
  nein?: string;
  nachreichung?: string;
  /** Paralleler Block (Kennung innerhalb des Workflows) und Zweig 0 … n−1. */
  block?: string;
  zweig?: number;
}

/** Namen der parallelen Blöcke (nach ihrer Kennung) und ihrer Zweige 0 … n−1. */
const BLOCK_NAMEN: Record<string, { name: string; zweige: string[] }> = {
  pruefung: { name: 'Prüfung', zweige: ['Fachprüfung', 'Prüfstatik'] },
  versand: { name: 'Versand', zweige: ['Bau AN', 'BVB', 'BÜW', 'Plot'] },
  post: { name: 'Postversand', zweige: ['Bau AN', 'BÜW'] },
};

/** Baut aus der Aufstellung einen Workflow mit eindeutigen IDs. */
function kette(id: string, name: string, beschreibung: string, roh: RohSchritt[]): ProcessTemplate {
  const sid = (code: string | undefined): ID | 'ende' | null => {
    if (code === undefined) return null;
    if (code === 'ende' || code === ZWEIGENDE) return 'ende';
    return `${id}-${code}`;
  };

  const steps: ProcessTemplateStep[] = roh.map((r) => {
    const antworten: Antwort[] =
      r.typ === 'entscheidung'
        ? [
            { id: `${id}-${r.code}-ja`, text: 'Ja', ziel: sid(r.ja), nacharbeit: false },
            { id: `${id}-${r.code}-nein`, text: 'Nein', ziel: sid(r.nein), nacharbeit: true },
            ...(r.nachreichung !== undefined
              ? [{ id: `${id}-${r.code}-nachreichung`, text: 'Nachreichung', ziel: sid(r.nachreichung), nacharbeit: true }]
              : []),
          ]
        : [];
    return {
      id: `${id}-${r.code}`,
      name: r.name,
      typ: r.typ,
      roleName: r.rolle,
      fristTage: r.frist,
      beschreibung: '',
      antworten,
      naechster: r.typ === 'entscheidung' ? null : sid(r.next),
      nachweis: r.nachweis ?? 'keine',
      // Nachfrage nach einer E-Mail wird je Schritt im Workflow gesetzt
      mailFrage: false,
      mailVorlageId: null,
      // Versandschritte bitten die nächste Person um Freigabe, Prüfung …
      versandAnliegen: versandAnliegenNachName(r.name),
      parallel:
        r.block !== undefined
          ? {
              block: `${id}-blk-${r.block}`,
              zweig: r.zweig ?? 0,
              name: BLOCK_NAMEN[r.block].name,
              zweigName: BLOCK_NAMEN[r.block].zweige[r.zweig ?? 0],
            }
          : null,
    };
  });

  return { id, projectId: null, name, beschreibung, herkunft: 'standard', steps };
}

/** Fristen als Erfahrungswerte – in der Aufstellung nicht vorgegeben. */
const F = {
  planerstellung: 10,
  formalePruefung: 3,
  weiterleitung: 1,
  bvbFreigabe: 10,
  fachpruefung: 15,
  genehmigung: 5,
  versand: 1,
  plotEinreichen: 1,
  plotAbholen: 3,
  nachreichung: 5,
  nachpruefung: 5,
};

/**
 * Versand nach der Genehmigung (alle drei Workflows): digital an Bau AN, BVB
 * und BÜW sowie der Plotauftrag parallel, danach der Postversand an Bau AN und
 * BÜW parallel. `nr` ist der erste Code.
 */
function versand(nr: number): RohSchritt[] {
  const c = (k: number) => String(nr + k);
  return [
    { code: c(0), name: 'Digitaler Versand an Bau AN', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.versand, block: 'versand', zweig: 0 },
    { code: c(1), name: 'Digitaler Versand an BVB', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.versand, block: 'versand', zweig: 1 },
    { code: c(2), name: 'Digitaler Versand an BÜW', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.versand, block: 'versand', zweig: 2 },
    { code: c(3), name: 'Plotauftrag einreichen', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.plotEinreichen, block: 'versand', zweig: 3 },
    { code: c(4), name: 'Plotauftrag abholen', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.plotAbholen, block: 'versand', zweig: 3 },
    { code: c(5), name: 'Postversand an Bau AN', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.versand, block: 'post', zweig: 0 },
    { code: c(6), name: 'Postversand an BÜW', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.versand, block: 'post', zweig: 1 },
  ];
}

/**
 * Nachreichung zu einer Entscheidung: der Fachplaner reicht nach, dieselbe
 * Funktion prüft bzw. gibt die Nachreichung frei. „Ja“ führt wie das „Ja“ der
 * Ausgangsentscheidung weiter, „Nein“ zur Rückmeldung an den Planer,
 * „Nachreichung“ zurück zur Nachreichung. In einem Zweig bleiben beide
 * Schritte im Zweig.
 */
function nachreichung(
  code: string,
  an: string,
  pruefung: string,
  rolle: string,
  nachweis: Nachweis,
  ja: string,
  zweig?: { block: string; zweig: number },
): RohSchritt[] {
  const nachreichungCode = `${code}.n`;
  return [
    { code: nachreichungCode, name: `Nachreichung an ${an}`, typ: 'aufgabe', rolle: ROLLE_PLANER, frist: F.nachreichung, ...zweig },
    {
      code: `${code}.np`,
      name: pruefung,
      typ: 'entscheidung',
      rolle,
      frist: F.nachpruefung,
      nachweis,
      ja,
      nein: '3.2',
      nachreichung: nachreichungCode,
      ...zweig,
    },
  ];
}

export const STANDARD_TEMPLATES: ProcessTemplate[] = [
  kette('tpl-vvbau-ohne', 'VVBau ohne Prüfstatik', 'Regelablauf ohne fachtechnische Prüfung.', [
    { code: '1', name: 'Eingang PLM', typ: 'aufgabe', rolle: ROLLE_PLANER, frist: F.planerstellung },
    { code: '2', name: 'Formale Prüfung', typ: 'entscheidung', rolle: EIGENE_ROLLE, frist: F.formalePruefung, ja: '3.1', nein: '3.2' },
    { code: '3.1', name: 'PLM an BVB zur Freigabe', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.weiterleitung, next: '4.1' },
    { code: '3.2', name: 'Rückmeldung an Planer', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.weiterleitung, next: '4.2' },
    { code: '4.1', name: 'BVB-Freigabe', typ: 'entscheidung', rolle: ROLLE_BVB, frist: F.bvbFreigabe, nachweis: 'freigabe', ja: '5', nein: '3.2', nachreichung: '4.1.n' },
    { code: '4.2', name: 'Erneute Vorlage von Planer', typ: 'aufgabe', rolle: ROLLE_PLANER, frist: F.planerstellung, next: '2' },
    ...nachreichung('4.1', 'BVB', 'Freigabe der Nachreichung', ROLLE_BVB, 'freigabe', '5'),
    { code: '5', name: 'PLM an PL zur Genehmigung', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.weiterleitung },
    { code: '6', name: 'Genehmigung zur Bauausführung', typ: 'aufgabe', rolle: ROLLE_PL, frist: F.genehmigung },
    ...versand(7),
  ]),

  kette('tpl-vvbau-mit', 'VVBau mit Prüfstatik', 'Ablauf mit fachtechnischer Prüfung und Prüfstatik vor der Freigabe.', [
    { code: '1', name: 'Eingang PLM', typ: 'aufgabe', rolle: ROLLE_PLANER, frist: F.planerstellung },
    { code: '2', name: 'Formale Prüfung', typ: 'entscheidung', rolle: EIGENE_ROLLE, frist: F.formalePruefung, ja: '3.1', nein: '3.2' },
    { code: '3.1', name: 'PLM an BVB zur Freigabe zur fachtechnischen Prüfung', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.weiterleitung, next: '4.1' },
    { code: '3.2', name: 'Rückmeldung an Planer', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.weiterleitung, next: '4.2' },
    { code: '4.1', name: 'BVB-Freigabe zur fachtechnischen Prüfung', typ: 'entscheidung', rolle: ROLLE_BVB, frist: F.bvbFreigabe, ja: '5', nein: '3.2', nachreichung: '4.1.n' },
    { code: '4.2', name: 'Erneute Vorlage von Planer', typ: 'aufgabe', rolle: ROLLE_PLANER, frist: F.planerstellung, next: '2' },
    ...nachreichung('4.1', 'BVB zur fachtechnischen Prüfung', 'Freigabe der Nachreichung zur fachtechnischen Prüfung', ROLLE_BVB, 'keine', '5'),
    { code: '5', name: 'PLM an Fachprüfer und Prüfstatiker', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.weiterleitung },
    // Fachprüfung und Prüfstatik laufen parallel; „Nein“ verlässt den Block zur Rückmeldung an den Planer
    { code: '6', name: 'Fachprüfung', typ: 'entscheidung', rolle: ROLLE_PSV, frist: F.fachpruefung, nachweis: 'pruefbericht', ja: ZWEIGENDE, nein: '3.2', nachreichung: '6.n', block: 'pruefung', zweig: 0 },
    ...nachreichung('6', 'Fachprüfer', 'Prüfung der Nachreichung', ROLLE_PSV, 'pruefbericht', ZWEIGENDE, { block: 'pruefung', zweig: 0 }),
    { code: '6.s', name: 'Prüfstatik', typ: 'entscheidung', rolle: ROLLE_PRST, frist: F.fachpruefung, nachweis: 'pruefbericht', ja: ZWEIGENDE, nein: '3.2', nachreichung: '6.s.n', block: 'pruefung', zweig: 1 },
    ...nachreichung('6.s', 'Prüfstatiker', 'Prüfung der Nachreichung', ROLLE_PRST, 'pruefbericht', ZWEIGENDE, { block: 'pruefung', zweig: 1 }),
    { code: '7', name: 'PLM an BVB zur Freigabe', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.weiterleitung },
    { code: '8', name: 'BVB-Freigabe', typ: 'entscheidung', rolle: ROLLE_BVB, frist: F.bvbFreigabe, nachweis: 'freigabe', ja: '9', nein: '3.2', nachreichung: '8.n' },
    ...nachreichung('8', 'BVB', 'Freigabe der Nachreichung', ROLLE_BVB, 'freigabe', '9'),
    { code: '9', name: 'PLM an PL zur Genehmigung', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.weiterleitung },
    { code: '10', name: 'Genehmigung zur Bauausführung', typ: 'aufgabe', rolle: ROLLE_PL, frist: F.genehmigung },
    ...versand(11),
  ]),

  kette('tpl-vvbau-ste', 'VVBau STE', 'Ablauf mit Planprüfung durch den fachtechnischen Prüfer.', [
    { code: '1', name: 'Eingang PLM', typ: 'aufgabe', rolle: ROLLE_PLANER, frist: F.planerstellung },
    { code: '2', name: 'Formale Prüfung', typ: 'entscheidung', rolle: EIGENE_ROLLE, frist: F.formalePruefung, ja: '3.1', nein: '3.2' },
    { code: '3.1', name: 'PLM an Planprüfer', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.weiterleitung, next: '4.1' },
    { code: '3.2', name: 'Rückmeldung an Planer', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.weiterleitung, next: '4.2' },
    { code: '4.1', name: 'Fachprüfung', typ: 'entscheidung', rolle: ROLLE_PSV, frist: F.fachpruefung, nachweis: 'pruefbericht', ja: '5', nein: '3.2', nachreichung: '4.1.n' },
    { code: '4.2', name: 'Erneute Vorlage von Planer', typ: 'aufgabe', rolle: ROLLE_PLANER, frist: F.planerstellung, next: '2' },
    ...nachreichung('4.1', 'Fachprüfer', 'Prüfung der Nachreichung', ROLLE_PSV, 'pruefbericht', '5'),
    { code: '5', name: 'PLM an BVB zur Freigabe', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.weiterleitung },
    { code: '6', name: 'BVB-Freigabe', typ: 'entscheidung', rolle: ROLLE_BVB, frist: F.bvbFreigabe, nachweis: 'freigabe', ja: '7', nein: '3.2', nachreichung: '6.n' },
    ...nachreichung('6', 'BVB', 'Freigabe der Nachreichung', ROLLE_BVB, 'freigabe', '7'),
    { code: '7', name: 'PLM an PL zur Genehmigung', typ: 'aufgabe', rolle: EIGENE_ROLLE, frist: F.weiterleitung },
    { code: '8', name: 'Genehmigung zur Bauausführung', typ: 'aufgabe', rolle: ROLLE_PL, frist: F.genehmigung },
    ...versand(9),
  ]),
];

/* ------------------------------------------------------------------ */
/* Fingerabdruck der mitgelieferten Workflows                          */
/* ------------------------------------------------------------------ */

/** cyrb53 – kurzer, stabiler Streuwert eines Textes. */
function streuwert(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/**
 * Fingerabdruck eines Workflows: Name, Beschreibung und je Schritt
 * Bezeichnung, Art, Funktion, Frist, Nachweis, E-Mail-Einstellungen,
 * Beschreibung und die Ziele (als Listenposition, „nächster Schritt“
 * aufgelöst; Antworten mit ihrem Text). IDs und spätere Felder (Blöcke,
 * Nacharbeit) zählen nicht – so lässt sich erkennen, ob ein gespeicherter
 * Standard-Workflow noch dem mitgelieferten Stand einer Fassung entspricht.
 * Ohne `mitBloecken` gilt er für Workflows ohne parallele Blöcke (bis
 * Stammdaten-Fassung 4); mit `mitBloecken` zählen zusätzlich je Schritt der
 * Block (als Position seines ersten Schritts), Zweig und Namen sowie die
 * Nacharbeit-Kennung der Antworten (Fassung 5). Das Anliegen der Versandmail
 * zählt nicht – es kam erst mit Fassung 6.
 */
export function workflowFingerabdruck(
  t: Pick<ProcessTemplate, 'name' | 'beschreibung' | 'steps'>,
  mitBloecken = false,
): string {
  const steps = t.steps ?? [];
  const blockStart = (block: ID) => steps.findIndex((x) => x.parallel?.block === block);
  const index = new Map(steps.map((s, i) => [s.id, i]));
  const ziel = (i: number, z: ID | 'ende' | null | undefined) => {
    if (z === 'ende') return 'E';
    if (z === null || z === undefined) return i + 1 < steps.length ? String(i + 1) : 'E';
    return index.has(z) ? String(index.get(z)) : 'E';
  };
  const zeilen = steps.map((s, i) =>
    [
      (s.name ?? '').trim(),
      s.typ,
      (s.roleName ?? '').trim(),
      s.fristTage,
      s.nachweis ?? 'keine',
      s.mailFrage ? 1 : 0,
      s.mailVorlageId ?? '',
      (s.beschreibung ?? '').trim(),
      s.typ === 'entscheidung' && (s.antworten ?? []).length > 0
        ? s.antworten.map((a) => `${(a.text ?? '').trim()}>${ziel(i, a.ziel)}`).join(',')
        : `>${ziel(i, s.naechster)}`,
      ...(mitBloecken
        ? [
            s.parallel
              ? `${blockStart(s.parallel.block)}:${s.parallel.zweig}:${(s.parallel.name ?? '').trim()}:${(s.parallel.zweigName ?? '').trim()}`
              : '-',
            (s.antworten ?? []).map((a) => (a.nacharbeit ? 1 : 0)).join(''),
          ]
        : []),
    ].join('|'),
  );
  return streuwert([(t.name ?? '').trim(), (t.beschreibung ?? '').trim(), ...zeilen].join('\n'));
}

/**
 * Fingerabdrücke der mitgelieferten Standard-Workflows in Stammdaten-Fassung 4
 * (vor parallelen Blöcken und Nachreichung), berechnet mit
 * `workflowFingerabdruck` aus dem damaligen Stand. Weicht ein gespeicherter
 * Standard-Workflow davon ab, wurde er selbst angepasst und bleibt beim
 * Wechsel auf Fassung 5 als eigene Kopie erhalten.
 */
export const STANDARD_FASSUNG4_FINGERABDRUCK: Record<ID, string> = {
  'tpl-vvbau-ohne': '1f5fc6b675401c',
  'tpl-vvbau-mit': '1bd0b072bcd0ce',
  'tpl-vvbau-ste': '19027a5acc299c',
};

/**
 * Fingerabdrücke der Standard-Workflows in Stammdaten-Fassung 5 (mit
 * parallelen Blöcken und Nachreichung, vor dem Anliegen der Versandmail),
 * berechnet mit `workflowFingerabdruck(t, true)`. Weicht ein gespeicherter
 * Standard-Workflow davon ab, bleibt er beim Wechsel auf Fassung 6 als eigene
 * Kopie erhalten.
 */
export const STANDARD_FASSUNG5_FINGERABDRUCK: Record<ID, string> = {
  'tpl-vvbau-ohne': '16223f3fc0d271',
  'tpl-vvbau-mit': '026ef092b1835b',
  'tpl-vvbau-ste': '0a0d74703eb137',
};

/* ------------------------------------------------------------------ */
/* E-Mail-Vorlagen                                                     */
/* ------------------------------------------------------------------ */

export function standardVorlagen(): EmailTemplate[] {
  return [
    {
      id: 'mail-erinnerung',
      name: 'Freundliche Erinnerung',
      anlass: 'erinnerung',
      betreff: '[{{projekt.nummer}}] Erinnerung: {{schritt}} – {{plan.nummer}} (fällig {{soll}})',
      text: `{{anrede}}

im Projekt „{{projekt}}“ ({{projekt.nummer}}) steht der Prozessschritt „{{schritt}}“ für den Planlauf „{{planlauf}}“ aus.

  Plan:        {{plan.nummer}} – {{plan}}
  Gewerk:      {{plan.gewerk}}
  Ihre Rolle:  {{rolle}}
  Soll-Termin: {{soll}} ({{frist}})

Bitte geben Sie uns bis zum genannten Termin eine kurze Rückmeldung, damit der weitere Planlauf eingehalten werden kann.

Vielen Dank und freundliche Grüße
{{absender}}`,
    },
    {
      id: 'mail-ueberfaellig',
      name: 'Mahnung bei Fristüberschreitung',
      anlass: 'ueberfaellig',
      betreff: '[{{projekt.nummer}}] Überfällig ({{verzug}} Verzug): {{schritt}} – {{plan.nummer}}',
      text: `{{anrede}}

der Prozessschritt „{{schritt}}“ im Projekt „{{projekt}}“ ({{projekt.nummer}}) ist überfällig – Verzug: {{verzug}}.

  Plan:        {{plan.nummer}} – {{plan}}
  Gewerk:      {{plan.gewerk}}
  Ihre Rolle:  {{rolle}}
  Soll-Termin: {{soll}}

Da der weitere Planlauf hiervon abhängt, bitten wir um Erledigung bis spätestens Ende dieser Woche oder um eine kurze Information, bis wann mit der Rückmeldung zu rechnen ist.

Mit freundlichen Grüßen
{{absender}}`,
    },
    {
      id: 'mail-freigabe',
      name: 'Freigabe erteilt',
      anlass: 'freigabe',
      betreff: '[{{projekt.nummer}}] Freigabe: {{plan.nummer}} – {{plan}}',
      text: `{{anrede}}

der Plan {{plan.nummer}} – {{plan}} wurde am {{heute}} freigegeben und kann der Bauausführung zugrunde gelegt werden.

Mit freundlichen Grüßen
{{absender}}`,
    },
    {
      id: 'mail-uebergabe',
      name: 'Versand / Übergabe',
      anlass: 'uebergabe',
      betreff: '[{{projekt.nummer}}] Planversand: {{plan.nummer}} – {{plan}}',
      text: `{{anrede}}

anbei erhalten Sie den Plan {{plan.nummer}} – {{plan}} aus dem Planlauf „{{planlauf}}“ zur weiteren Bearbeitung.

Wir bitten um Rückmeldung bis zum {{soll}}.

Mit freundlichen Grüßen
{{absender}}`,
    },
    sammelVorlage(),
    versandVorlage(),
  ];
}

/**
 * Vorlage „Versand“: Nach einem Versandschritt (Anliegen am Schritt) erhält
 * die danach zuständige Person die Links zu ihren SharePoint-Ordnern, das
 * Anliegen und die Liste der Unterlagen nach Planpaketen ({{versandliste}},
 * siehe domain/email.ts). „ORDNERNAME EINFÜGEN“ trägt man vor dem Absenden ein.
 */
export function versandVorlage(): EmailTemplate {
  return {
    id: 'mail-versand',
    name: 'Versand',
    anlass: 'uebergabe',
    betreff: '[{{projekt.nummer}}] Unterlagen zur {{anliegen}} – {{projekt}}',
    text: `{{anrede}}

auf Ihrem SharePoint-Ordner {{sharepoint.eingang}} haben wir Ihnen die folgenden Unterlagen bereitgestellt und bitten um {{anliegen}}.

Hier der Link zum Hochladen der Unterlagen nach Ihrer {{anliegen}}:
{{sharepoint.ausgang}}

Ordnername: ORDNERNAME EINFÜGEN

{{versandliste}}`,
  };
}

/**
 * Vorlage der Sammelerinnerung: eine E-Mail je Person mit allen Plänen, deren
 * Schritt bei ihr ansteht ({{liste}}, siehe domain/email.ts).
 */
export function sammelVorlage(): EmailTemplate {
  return {
    id: 'mail-sammel',
    name: 'Sammelerinnerung',
    anlass: 'erinnerung',
    betreff: '[{{projekt.nummer}}] Offene Prozessschritte ({{anzahl}})',
    text: `{{anrede}}

im Projekt „{{projekt}}“ ({{projekt.nummer}}) stehen bei Ihnen folgende Prozessschritte aus:

{{liste}}

Bitte geben Sie uns bis zu den genannten Terminen eine kurze Rückmeldung, damit der weitere Planlauf eingehalten werden kann.

Vielen Dank und freundliche Grüße
{{absender}}`,
  };
}

/* ------------------------------------------------------------------ */
/* Demodaten                                                           */
/* ------------------------------------------------------------------ */

/**
 * Kennungen der Demodaten sind zufällig – zwei Geräte, die beide mit den
 * Demodaten begonnen haben, verwechseln deren Inhalte beim Abgleich nicht.
 * Fest bleiben nur Stammdaten (Funktionen srol-…, E-Mail-Vorlagen mail-…,
 * Standard-Workflows tpl-…).
 */
const zufallsId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/** Legt die Funktionen als Projektfunktionen an. */
function projektRollen(projectId: string): Role[] {
  return STANDARD_ROLLEN.map((r) => ({
    id: zufallsId('rol'),
    projectId,
    name: r.name,
    kuerzel: r.kuerzel,
    farbe: r.farbe,
    beschreibung: r.beschreibung,
    gewerk: r.gewerk,
    seite: r.seite,
  }));
}

/** Ein Schritt, den die Demodaten erledigen: Name, Antwort, Verzug gegenüber dem Soll in Arbeitstagen. */
interface DemoSchritt {
  name: string;
  antwort?: string;
  verzug?: number;
}

/** Eine vorbereitete Erinnerung der Demodaten: Arbeitstage relativ zu heute. */
interface DemoErinnerung {
  schritt: string;
  tage: number;
  anlass: EmailAnlass;
  weg: Erinnerung['weg'];
}

export function seedData(): AppData {
  const heute = today();
  /** Arbeitstage relativ zu einem Datum. */
  const at = (d: ISODate, n: number) => addDays(d, n, true);
  const projectId = zufallsId('prj');
  const rollen = projektRollen(projectId);
  /** Funktion eines Gewerks (bzw. die übergreifende Funktion) im Projekt. */
  const rolle = (kuerzel: string, gewerk: string | null = null) =>
    rollen.find((r) => r.kuerzel === kuerzel && r.gewerk === gewerk)!.id;

  // Starttermine der Planläufe – so gewählt, dass die Läufe heute an der gewünschten Stelle stehen
  // (gezählt ab dem letzten Arbeitstag, damit die Überfälligkeit auch am Wochenende stimmt)
  const bezug = istArbeitstag(heute) ? heute : at(heute, -1);
  const start = {
    pruefblock: at(bezug, -47),
    nachreichung: at(bezug, -33),
    zweiterDurchlauf: at(bezug, -30),
    abgeschlossen: at(bezug, -52),
    versand: at(bezug, -16),
  };

  const project: Project = {
    id: projectId,
    nummer: '2026-014',
    name: 'Ausbaustrecke Nordkreuz',
    status: 'aktiv',
    markiert: true,
    beschreibung: 'Streckenausbau mit Anpassung von Oberleitung, LST und Verkehrsanlagen.',
    settings: {
      erinnerungVorlaufTage: 5,
      fristenInArbeitstagen: true,
      feiertage: [],
      absenderName: 'Planlaufmanagement Nordkreuz',
      absenderEmail: 'planlauf@example.de',
    },
  };

  const kontakt = (
    c: Omit<Contact, 'id' | 'projectId' | 'eigen' | 'notiz' | 'sharepointEingang' | 'sharepointAusgang'> &
      Partial<Pick<Contact, 'notiz' | 'eigen' | 'sharepointEingang' | 'sharepointAusgang'>>,
  ): Contact => ({
    id: zufallsId('con'),
    projectId,
    notiz: '',
    eigen: false,
    sharepointEingang: '',
    sharepointAusgang: '',
    ...c,
  });
  const jeGewerk = (kuerzel: string) => ['KIB', 'LST', 'OLA', 'VA'].map((g) => ({ roleId: rolle(kuerzel, g), gewerk: g }));
  const contacts: Contact[] = [
    // Eigener Eintrag: die angemeldete Person führt das Planlaufmanagement
    kontakt({ anrede: '', vorname: 'Max', nachname: 'Mustermann', firma: EIGENE_ROLLE, email: '', telefon: '', anschrift: '', zuordnungen: [{ roleId: rolle('PLM'), gewerk: null }], eigen: true }),
    kontakt({ anrede: 'Frau', vorname: 'Sabine', nachname: 'Ortmann', firma: 'Projektleitung', email: 's.ortmann@example.de', telefon: '+49 40 123456-01', anschrift: 'Hafenstraße 12\n20359 Hamburg', zuordnungen: [{ roleId: rolle('PL'), gewerk: null }], sharepointEingang: 'https://example.sharepoint.com/sites/Nordkreuz-Projektleitung/Freigegebene%20Dokumente/Eingang', sharepointAusgang: 'https://example.sharepoint.com/sites/Nordkreuz-Projektleitung/Freigegebene%20Dokumente/Ausgang' }),
    kontakt({ anrede: 'Frau', vorname: 'Katrin', nachname: 'Berger', firma: 'Ingenieurbüro Berger', email: 'k.berger@example.de', telefon: '+49 40 998877-12', anschrift: 'Billstraße 88\n20539 Hamburg', zuordnungen: [{ roleId: rolle('FP', 'KIB'), gewerk: 'KIB' }], notiz: 'Fachplanung Ingenieurbau' }),
    kontakt({ anrede: 'Herr', vorname: 'Ali', nachname: 'Sarikaya', firma: 'LST Nord Ingenieure', email: 'sarikaya@example.de', telefon: '+49 40 998877-30', anschrift: 'Billstraße 90\n20539 Hamburg', zuordnungen: [{ roleId: rolle('FP', 'LST'), gewerk: 'LST' }], notiz: 'Fachplanung Leit- und Sicherungstechnik' }),
    kontakt({ anrede: 'Herr', vorname: 'Piet', nachname: 'Osterkamp', firma: 'Osterkamp Fahrleitungsbau', email: 'p.osterkamp@example.de', telefon: '+49 4101 7788-0', anschrift: 'Industriering 9\n25436 Tornesch', zuordnungen: [{ roleId: rolle('FP', 'OLA'), gewerk: 'OLA' }], notiz: 'Fachplanung Oberleitung' }),
    kontakt({ anrede: 'Herr', vorname: 'Robert', nachname: 'Lindqvist', firma: 'Bauvorlageberechtigung Nord', email: 'r.lindqvist@example.de', telefon: '+49 40 224466-0', anschrift: 'Nordpark 1\n22415 Hamburg', zuordnungen: [{ roleId: rolle('BVB', 'KIB'), gewerk: 'KIB' }], notiz: 'Freigaben nur donnerstags', sharepointEingang: 'https://example.sharepoint.com/sites/Nordkreuz-BVB/Freigegebene%20Dokumente/Eingang', sharepointAusgang: 'https://example.sharepoint.com/sites/Nordkreuz-BVB/Freigegebene%20Dokumente/Ausgang' }),
    kontakt({ anrede: 'Frau', vorname: 'Marlene', nachname: 'Hoffstedt', firma: 'Bauvorlageberechtigung Nord', email: 'm.hoffstedt@example.de', telefon: '+49 40 224466-4', anschrift: 'Nordpark 1\n22415 Hamburg', zuordnungen: [{ roleId: rolle('BVB', 'LST'), gewerk: 'LST' }, { roleId: rolle('BVB', 'OLA'), gewerk: 'OLA' }], sharepointEingang: 'https://example.sharepoint.com/sites/Nordkreuz-BVB/Freigegebene%20Dokumente/Eingang', sharepointAusgang: 'https://example.sharepoint.com/sites/Nordkreuz-BVB/Freigegebene%20Dokumente/Ausgang' }),
    kontakt({ anrede: 'Herr', vorname: 'Dietmar', nachname: 'Krause', firma: 'Prüfstelle Krause', email: 'd.krause@example.de', telefon: '+49 4131 309-0', anschrift: 'Am Ochsenmarkt 1\n21335 Lüneburg', zuordnungen: [{ roleId: rolle('PSV', 'LST'), gewerk: 'LST' }], notiz: 'Fachtechnische Prüfung LST', sharepointEingang: 'https://example.sharepoint.com/sites/Nordkreuz-Pruefung/Freigegebene%20Dokumente/Eingang', sharepointAusgang: 'https://example.sharepoint.com/sites/Nordkreuz-Pruefung/Freigegebene%20Dokumente/Ausgang' }),
    kontakt({ anrede: 'Frau', vorname: 'Yuki', nachname: 'Tanaka', firma: 'Prüfstelle Tanaka', email: 'y.tanaka@example.de', telefon: '+49 40 556677-1', anschrift: 'Alsterdorfer Damm 4\n22297 Hamburg', zuordnungen: [{ roleId: rolle('PSV', 'KIB'), gewerk: 'KIB' }, { roleId: rolle('PrSt', 'KIB'), gewerk: 'KIB' }], notiz: 'Fachtechnische Prüfung und Prüfstatik KIB', sharepointEingang: 'https://example.sharepoint.com/sites/Nordkreuz-Pruefung/Freigegebene%20Dokumente/Eingang', sharepointAusgang: 'https://example.sharepoint.com/sites/Nordkreuz-Pruefung/Freigegebene%20Dokumente/Ausgang' }),
    kontakt({ anrede: 'Herr', vorname: 'Tobias', nachname: 'Reinhold', firma: 'Prüfstelle Erdung', email: 't.reinhold@example.de', telefon: '+49 40 445566-8', anschrift: 'Wandsbeker Chaussee 3\n22089 Hamburg', zuordnungen: [{ roleId: rolle('ErP', 'OLA'), gewerk: 'OLA' }], notiz: 'Erdungsprüfung' }),
    kontakt({ anrede: 'Herr', vorname: 'Sven', nachname: 'Dallmann', firma: 'Dallmann Bau GmbH', email: 's.dallmann@example.de', telefon: '+49 4101 5566-0', anschrift: 'Gewerbepark 4\n25469 Halstenbek', zuordnungen: jeGewerk('AN') }),
    kontakt({ anrede: 'Frau', vorname: 'Heike', nachname: 'Petersen', firma: 'Bauüberwachung Nord', email: 'h.petersen@example.de', telefon: '+49 40 334455-2', anschrift: 'Nordpark 1\n22415 Hamburg', zuordnungen: jeGewerk('BÜW') }),
  ];

  const eintrag = (d: Omit<PlanDocument, 'id' | 'projectId'>): PlanDocument => ({ id: zufallsId('doc'), projectId, ...d });
  // Planpaket – reines Ordnungsmerkmal, ohne eigenen Planlauf
  const paket = eintrag({ kind: 'paket', parentId: null, paketId: null, nummer: 'PP-Nordkanal', titel: 'Eisenbahnüberführung Nordkanal', index: '', gewerk: 'KIB', planungsphase: 'Ausführungsplanung', eingangSoll: null, datum: null, bemerkung: 'Bündelt die Unterlagen zum Bauwerk' });
  // Planverzeichnis mit eigenem Planlauf; die Pläne laufen darin mit
  const verzeichnis = eintrag({ kind: 'verzeichnis', parentId: null, paketId: paket.id, nummer: 'NK-KIB-PV-001', titel: 'Planverzeichnis Überbau', index: 'C', gewerk: 'KIB', planungsphase: 'Ausführungsplanung', eingangSoll: at(start.pruefblock, 10), datum: start.pruefblock, bemerkung: '' });
  const plan = (nummer: string, titel: string, d: Partial<PlanDocument>) =>
    eintrag({ kind: 'plan', parentId: null, paketId: null, nummer, titel, index: '', gewerk: 'KIB', planungsphase: 'Ausführungsplanung', eingangSoll: null, datum: null, bemerkung: '', ...d });
  const grundriss = plan('NK-KIB-EÜ-001-GR', 'Grundriss Überbau', { parentId: verzeichnis.id, paketId: paket.id, index: 'C', eingangSoll: verzeichnis.eingangSoll });
  const schnitt = plan('NK-KIB-EÜ-001-SC', 'Längsschnitt', { parentId: verzeichnis.id, paketId: paket.id, index: 'C', eingangSoll: verzeichnis.eingangSoll });
  // Einzelpläne mit eigenem Planlauf
  const signallageplan = plan('NK-LST-SP-102', 'Signallageplan Bereich Nord', { paketId: paket.id, index: 'B', gewerk: 'LST', eingangSoll: at(start.nachreichung, 10) });
  const fahrleitung = plan('NK-OLA-FL-210', 'Fahrleitungsplan km 12,4 – 13,8', { gewerk: 'OLA', eingangSoll: at(start.zweiterDurchlauf, 10) });
  const widerlager = plan('NK-KIB-EÜ-002', 'Widerlager Nord', { paketId: paket.id, index: 'A', eingangSoll: at(start.abgeschlossen, 10) });
  // Zwei Pläne warten auf den Versand an die BVB (Versandmail „Versand“)
  const lager = plan('NK-KIB-EÜ-003', 'Lager und Fahrbahnübergänge', { paketId: paket.id, index: 'A', eingangSoll: at(start.versand, 10) });
  const entwaesserung = plan('NK-KIB-EÜ-004', 'Entwässerung Überbau', { paketId: paket.id, index: 'A', eingangSoll: at(start.versand, 10) });
  const verkehrsanlagen = eintrag({ kind: 'verzeichnis', parentId: null, paketId: null, nummer: 'NK-VA-PV-001', titel: 'Planverzeichnis Verkehrsanlagen', index: '02', gewerk: 'VA', planungsphase: 'Entwurfsplanung', eingangSoll: at(heute, 22), datum: null, bemerkung: 'Eingang angekündigt' });

  const data: AppData = {
    version: DATEN_VERSION,
    stammdatenVersion: STAMMDATEN_VERSION,
    bearbeiter: { name: STANDARD_BEARBEITER, mailNachfrage: true, farbmodus: 'standard' },
    gewerke: [...GEWERKE],
    standardRollen: STANDARD_ROLLEN.map((r) => ({ ...r })),
    emailVorlagen: standardVorlagen(),
    projects: [project],
    roles: rollen,
    contacts,
    documents: [paket, verzeichnis, grundriss, schnitt, signallageplan, fahrleitung, widerlager, lager, entwaesserung, verkehrsanlagen],
    templates: STANDARD_TEMPLATES,
    runs: [],
    geloescht: [],
  };

  /*
   * Planläufe aus den Workflows – je Gewerk mit eigenen Verantwortlichen. Der
   * Stand entsteht über die Ablauflogik selbst: Die genannten Schritte werden
   * nacheinander mit festen Ist-Daten erledigt (Soll + Verzug in Arbeitstagen),
   * das Protokoll entsteht wie im Store. So passen Status, Eingänge,
   * Soll-Termine, Historie und Protokoll immer zum Workflow.
   */
  const rahmen = (zeitpunkt: string) => ({ bearbeiter: STANDARD_BEARBEITER, zeitpunkt, kontakte: contacts });
  /** Zeitpunkt an einem Tag (UTC-Uhrzeit), höchstens jetzt – kein Vermerk liegt in der Zukunft. */
  const jetzt = new Date().toISOString();
  const zeitpunktAm = (datum: ISODate, uhrzeit: string) => {
    const z = `${datum}T${uhrzeit}:00.000Z`;
    return z < jetzt ? z : jetzt;
  };
  const laufAus = (
    template: ProcessTemplate,
    doc: PlanDocument,
    beginn: ISODate,
    schritte: DemoSchritt[],
    erinnerungen: DemoErinnerung[] = [],
  ): PlanRun => {
    const kontext = { rollen, kontakte: contacts, gewerk: doc.gewerk, bearbeiter: STANDARD_BEARBEITER };
    const rechnen = (r: PlanRun): PlanRun => recalcRun(r, project, doc, heute);
    let run: PlanRun = rechnen({
      id: zufallsId('run'),
      projectId,
      documentId: doc.id,
      templateId: template.id,
      templateName: template.name,
      name: planlaufName(doc),
      index: doc.index,
      start: beginn,
      status: 'laufend',
      abbruchGrund: null,
      abbruchDatum: null,
      abbruchArt: null,
      abbruchNeuerIndex: null,
      steps: stepsAusTemplate(
        template,
        (roleName) => kontaktFuerRolleUndGewerk(contacts, rollen, roleName, doc.gewerk),
        () => zufallsId('rs'),
      ),
      bemerkung: '',
      protokoll: [],
      basis: null,
    });
    const gestartet = zeitpunktAm(beginn, '08:00');
    run = {
      ...run,
      basis: basisplanFestlegen(run, project, doc, 'beim Start festgelegt', gestartet),
      protokoll: laufAenderungenProtokollieren(undefined, run, rahmen(gestartet)),
    };

    let nr = 0;
    for (const { name, antwort, verzug = 0 } of schritte) {
      let step = aktuelleSchritte(run).find((s) => s.name === name);
      if (!step) break;
      if (antwort && step.typ === 'entscheidung') {
        const gewaehlt = step.antworten.find((a) => a.text === antwort);
        step = { ...step, gewaehlteAntwortId: gewaehlt?.id ?? null };
        run = { ...run, steps: run.steps.map((s) => (s.id === step!.id ? step! : s)) };
      }
      const ist = at(step.sollDatum ?? beginn, verzug);
      const nummer = braucheNachweis(step, 'erledigt')
        ? `${step.nachweis === 'freigabe' ? 'FG' : 'PB'}-2026-${String(++nr).padStart(4, '0')}`
        : undefined;
      const zeitpunkt = zeitpunktAm(ist, '09:00');
      const ergebnis = schrittStatusSetzen(run, step, 'erledigt', nummer, { istDatum: ist, heute: ist, zeitpunkt, kontext });
      if (ergebnis.art !== 'aenderung') break;
      const neu = rechnen(aenderungenAufLauf(run, ergebnis.aenderungen));
      run = { ...neu, protokoll: [...neu.protokoll, ...laufAenderungenProtokollieren(run, neu, rahmen(zeitpunkt))] };
    }

    for (const e of erinnerungen) {
      const step = aktuelleSchritte(run).find((s) => s.name === e.schritt);
      const person = contacts.find((c) => c.id === step?.contactId);
      if (!step || !person) continue;
      const zeitpunkt = zeitpunktAm(at(heute, e.tage), '10:00');
      const vorlage = data.emailVorlagen.find((v) => v.anlass === e.anlass);
      const erinnerung: Erinnerung = {
        zeitpunkt,
        contactId: person.id,
        kontaktName: kontaktName(person),
        an: person.email,
        betreff: vorlage ? `${vorlage.name}: ${step.name}` : step.name,
        anlass: e.anlass,
        weg: e.weg,
        durchlauf: step.durchlauf,
      };
      const neu: PlanRun = {
        ...run,
        steps: run.steps.map((s) =>
          s.id === step.id ? { ...s, erinnerungen: [...s.erinnerungen, erinnerung], letzteErinnerung: zeitpunkt } : s,
        ),
      };
      run = { ...neu, protokoll: [...neu.protokoll, ...laufAenderungenProtokollieren(run, neu, rahmen(zeitpunkt))] };
    }
    return run;
  };

  const [ohne, mit, ste] = ['tpl-vvbau-ohne', 'tpl-vvbau-mit', 'tpl-vvbau-ste'].map(
    (id) => STANDARD_TEMPLATES.find((t) => t.id === id)!,
  );

  data.runs = [
    // Im parallelen Prüfblock: Prüfstatik früh erledigt, Fachprüfung 5 Arbeitstage überfällig (Verzug beim Prüfer)
    laufAus(
      mit,
      verzeichnis,
      start.pruefblock,
      [
        { name: 'Eingang PLM' },
        { name: 'Formale Prüfung', antwort: 'Ja' },
        { name: 'PLM an BVB zur Freigabe zur fachtechnischen Prüfung' },
        { name: 'BVB-Freigabe zur fachtechnischen Prüfung', antwort: 'Ja', verzug: 2 },
        { name: 'PLM an Fachprüfer und Prüfstatiker' },
        { name: 'Prüfstatik', antwort: 'Ja', verzug: -2 },
      ],
      [
        { schritt: 'Fachprüfung', tage: -8, anlass: 'erinnerung', weg: 'outlook' },
        { schritt: 'Fachprüfung', tage: -1, anlass: 'ueberfaellig', weg: 'web' },
      ],
    ),
    // Nachreichung: die Fachprüfung verlangt Unterlagen nach
    laufAus(
      ste,
      signallageplan,
      start.nachreichung,
      [
        { name: 'Eingang PLM', verzug: 1 },
        { name: 'Formale Prüfung', antwort: 'Ja' },
        { name: 'PLM an Planprüfer' },
        { name: 'Fachprüfung', antwort: 'Nachreichung', verzug: 1 },
      ],
      [{ schritt: 'Nachreichung an Fachprüfer', tage: 0, anlass: 'erinnerung', weg: 'kopie' }],
    ),
    // Zweiter Durchlauf: die formale Prüfung wies die Unterlagen zurück
    laufAus(ohne, fahrleitung, start.zweiterDurchlauf, [
      { name: 'Eingang PLM' },
      { name: 'Formale Prüfung', antwort: 'Nein' },
      { name: 'Rückmeldung an Planer' },
      { name: 'Erneute Vorlage von Planer', verzug: 3 },
    ]),
    // Abgeschlossen – mit etwas Verzug bei Freigabe, Genehmigung und Plot
    laufAus(ohne, widerlager, start.abgeschlossen, [
      { name: 'Eingang PLM' },
      { name: 'Formale Prüfung', antwort: 'Ja' },
      { name: 'PLM an BVB zur Freigabe' },
      { name: 'BVB-Freigabe', antwort: 'Ja', verzug: 3 },
      { name: 'PLM an PL zur Genehmigung' },
      { name: 'Genehmigung zur Bauausführung', verzug: 1 },
      { name: 'Digitaler Versand an Bau AN' },
      { name: 'Digitaler Versand an BVB' },
      { name: 'Digitaler Versand an BÜW' },
      { name: 'Plotauftrag einreichen' },
      { name: 'Plotauftrag abholen', verzug: 1 },
      { name: 'Postversand an Bau AN' },
      { name: 'Postversand an BÜW' },
    ]),
    // Formal geprüft – der Versand an die BVB zur Freigabe steht an
    ...[lager, entwaesserung].map((doc) =>
      laufAus(ohne, doc, start.versand, [{ name: 'Eingang PLM' }, { name: 'Formale Prüfung', antwort: 'Ja' }]),
    ),
    // Planläufe starten immer mit dem Eintrag – dieser wartet noch auf den Eingang
    laufAus(ohne, verkehrsanlagen, heute, []),
  ];

  return data;
}
