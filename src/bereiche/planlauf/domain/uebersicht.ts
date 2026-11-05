/**
 * Gliederung und Zeilenwerte der Planlaufübersicht eines Projekts.
 *
 * Dieselben Regeln gelten für die Liste im Reiter „Planläufe“ und für den
 * Export (Kurz- und Langfassung): Planpakete sind reine Überschriften, ein
 * gebündelt laufendes Planverzeichnis ist ein Planlauf, dessen Pläne mitlaufen,
 * und ein Verzeichnis mit einzeln laufenden Plänen fasst diese nur zusammen.
 * Abgebrochene Läufe stehen gesammelt am Ende.
 */
import {
  AMPEL_LABEL,
  aktuelleSchritte,
  aktuellerSchritt,
  ampelFuerSchritt,
  eigenstaendigeLaeufe,
  fortschritt,
  laufUeberfuehrt,
  verlaufDerKette,
  type Ampel,
} from './engine';
import { istErledigt, type Verlauf } from './ablauf';
import {
  RUN_STATUS_LABEL,
  hatEigenenPlanlauf,
  istEingangPLM,
  verzeichnisGebuendelt,
  type AppData,
  type ID,
  type PlanDocument,
  type PlanRun,
  type Project,
  type RunStatus,
  type RunStep,
} from './types';

/** Farbton einer Statusangabe – entspricht den Badges der Oberfläche. */
export type StatusTon = '' | 'green' | 'orange' | 'red' | 'blue' | 'gelb';

/** Eine Zeile der Übersicht: ein Planlauf mit seinem Eintrag. */
export interface UebersichtEintrag {
  run: PlanRun;
  doc: PlanDocument | undefined;
  /** Der führende anstehende Schritt – von mehreren der mit dem frühesten Soll. */
  step: RunStep | undefined;
  /**
   * Alle anstehenden Schritte, der führende zuerst, die übrigen nach Soll. In
   * parallelen Zweigen stehen mehrere Schritte eines Laufs zugleich an.
   */
  schritte: RunStep[];
}

/**
 * Ein Eintrag der obersten Ebene einer Gruppe: ein Planlauf – oder ein
 * Planverzeichnis, dessen Pläne einzeln laufen und das sie nur zusammenfasst.
 */
export type Knoten =
  | { art: 'lauf'; eintrag: UebersichtEintrag }
  | { art: 'klammer'; verzeichnis: PlanDocument; kinder: UebersichtEintrag[] };

/** Zusammengefasster Stand eines Planpakets bzw. einer Verzeichnisklammer. */
export interface Stand {
  pct: number;
  status: RunStatus | null;
  ampel: Ampel | null;
}

/**
 * Die Planläufe, die die Übersicht eines Projekts zeigt: je Eintrag der
 * laufende, sonst der abgeschlossene Lauf. Abgebrochene Läufe kommen
 * vollständig dazu – auch der Vorgänger eines neuen Index bleibt so sichtbar.
 * Aufgeteilte bzw. wieder gebündelte Läufe sind kein Abbruch und entfallen.
 * Läufe von Plänen, die in einem Planverzeichnis mitlaufen, zählen nicht.
 */
export function massgeblicheLaeufe(data: Pick<AppData, 'documents' | 'runs'>, projectId: ID): PlanRun[] {
  const laeufe = eigenstaendigeLaeufe(data.documents, data.runs).filter((r) => r.projectId === projectId);
  const rang = (r: PlanRun) => (r.status === 'laufend' ? 0 : 1);
  const verworfen = laeufe.filter((r) => r.status === 'abgebrochen' && !laufUeberfuehrt(r));
  const aktuell = laeufe
    .filter((r) => r.status !== 'abgebrochen')
    .sort((a, b) => rang(a) - rang(b))
    .filter((r, i, alle) => alle.findIndex((x) => x.documentId === r.documentId) === i);
  return [...aktuell, ...verworfen];
}

/** Maßgebliches Planpaket – bei Plänen eines Verzeichnisses dessen Paket. */
export function paketVon(documents: PlanDocument[], doc: PlanDocument | undefined): ID | null {
  if (!doc) return null;
  if (doc.kind === 'plan' && doc.parentId) {
    const eltern = documents.find((d) => d.id === doc.parentId);
    if (eltern) return eltern.paketId;
  }
  return doc.paketId;
}

/**
 * Der „aktuelle Stand“ eines Laufs: der zuletzt erledigte Schritt vor dem
 * offenen. Übersprungene Schritte zählen nicht – es gilt der erledigte davor.
 * Ist ein früherer Schritt wieder geöffnet, zählen die erledigten Schritte
 * dahinter nicht – der Stand liegt nie hinter dem nächsten Schritt. In einem
 * parallelen Block zählt je Zweig, was vor seinem offenen Schritt erledigt ist;
 * von diesen Schritten aller Zweige gilt der mit dem spätesten Ist.
 * Nach einem Rücksprung setzt der Lauf die Schleife zurück; der auslösende
 * Schritt (etwa „Erneute Vorlage von Planer“) steht dann nur noch in der
 * Historie. Er zählt trotzdem, wenn er bis zum Wiedereingang eines anstehenden
 * Schritts erledigt wurde (siehe wiedereingangsStand).
 */
export function letzterAbgeschlossenerSchritt(run: PlanRun | undefined): LaufStand | undefined {
  if (!run) return undefined;
  const verlauf = verlaufDerKette(run.steps);
  return wiedereingangsStand(run, verlauf.schritte, standAufDemWeg(verlauf.abschnitte));
}

/** Aktueller Stand eines Laufs: Bezeichnung und Ist des zuletzt erledigten Schritts. */
export interface LaufStand {
  name: string;
  istDatum: string | null;
}

/** Später erledigter von zwei Schritten (nach Ist). */
const spaeter = <T extends LaufStand>(a: T | undefined, b: T) => (!a || (b.istDatum ?? '') >= (a.istDatum ?? '') ? b : a);

/**
 * Stand nach einem Wiedereingang: Ging ein anstehender Schritt im weiteren
 * Durchlauf nach dem bisherigen Stand wieder ein, gilt der zuletzt erledigte
 * Schritt bis zu diesem Wiedereingang – abseits des Wegs oder in der Historie
 * eines zurückgesetzten Schritts.
 */
function wiedereingangsStand(run: PlanRun, aufDemWeg: RunStep[], stand: LaufStand | undefined): LaufStand | undefined {
  if (run.status !== 'laufend') return stand;
  const eingang = aktuelleSchritte(run)
    .filter((s) => (s.durchlauf ?? 1) > 1 && s.eingangIst)
    .map((s) => s.eingangIst as string)
    .sort()
    .pop();
  if (!eingang || (stand?.istDatum && stand.istDatum >= eingang)) return stand;
  const weg = new Set(aufDemWeg.map((s) => s.id));
  const passt = (ist: string | null): ist is string =>
    Boolean(ist) && (ist as string) <= eingang && (!stand?.istDatum || (ist as string) >= stand.istDatum);
  let ausloeser: LaufStand | undefined;
  for (const s of run.steps) {
    for (const h of s.historie ?? []) {
      if (h.status === 'erledigt' && passt(h.ist)) ausloeser = spaeter(ausloeser, { name: h.name, istDatum: h.ist });
    }
    if (!weg.has(s.id) && s.status === 'erledigt' && passt(s.istDatum)) ausloeser = spaeter(ausloeser, s);
  }
  return ausloeser ?? stand;
}

/** Der zuletzt erledigte Schritt auf dem Weg vor dem ersten offenen. */
function standAufDemWeg(abschnitte: Verlauf<RunStep>['abschnitte']): RunStep | undefined {
  let stand: RunStep | undefined;
  for (const a of abschnitte) {
    if (a.art === 'schritt') {
      if (!istErledigt(a.step)) return stand;
      if (a.step.status === 'erledigt') stand = a.step;
      continue;
    }
    let imBlock: RunStep | undefined;
    let offen = false;
    for (const z of a.zweige) {
      for (const s of z.schritte) {
        if (!istErledigt(s)) {
          offen = true;
          break;
        }
        if (s.status === 'erledigt') imBlock = spaeter(imBlock, s);
      }
      if (z.rueckSprungZu) offen = true;
    }
    if (imBlock) stand = imBlock;
    if (offen) return stand;
  }
  return stand;
}

/** Anstehende Schritte eines Laufs: der führende zuerst, die übrigen nach Soll. */
export function anstehendeSchritte(run: PlanRun): RunStep[] {
  if (run.status !== 'laufend') return [];
  const fuehrend = aktuellerSchritt(run);
  const uebrige = aktuelleSchritte(run)
    .filter((s) => s !== fuehrend)
    .sort((a, b) => (a.sollDatum ?? '9999').localeCompare(b.sollDatum ?? '9999'));
  return fuehrend ? [fuehrend, ...uebrige] : uebrige;
}

/** Zeilen der Übersicht zu den gegebenen Läufen. */
export function eintraegeVon(documents: PlanDocument[], runs: PlanRun[]): UebersichtEintrag[] {
  return runs.map((run) => {
    const schritte = anstehendeSchritte(run);
    return {
      run,
      doc: documents.find((d) => d.id === run.documentId),
      step: schritte[0],
      schritte,
    };
  });
}

/**
 * Fortschritt eines Laufs, gewichtet nach Fristen (engine.fortschritt) – mit
 * Arbeitstagen, Feiertagen und Eingang Soll seines Projekts bzw. Eintrags.
 */
export function laufFortschritt(data: Pick<AppData, 'projects' | 'documents'>, run: PlanRun): number {
  return fortschritt(
    run,
    data.projects.find((p) => p.id === run.projectId),
    data.documents.find((d) => d.id === run.documentId),
  );
}

/** Mittel der Lauf-Werte (Pakete, Projekte); abgebrochene Läufe zählen nicht. */
export function mittlererFortschritt(data: Pick<AppData, 'projects' | 'documents'>, runs: PlanRun[]): number {
  const gezaehlt = runs.filter((r) => r.status !== 'abgebrochen');
  if (gezaehlt.length === 0) return 0;
  return Math.round(gezaehlt.reduce((summe, r) => summe + laufFortschritt(data, r), 0) / gezaehlt.length);
}

/** Gliederung der Übersicht: Planpakete als Überschriften, abgebrochene Läufe am Ende. */
export interface Gliederung {
  /** Planpakete mit mindestens einem Eintrag – in der Reihenfolge des Bestands. */
  pakete: { paket: PlanDocument; eintraege: UebersichtEintrag[] }[];
  /** Einträge ohne Planpaket. */
  ohnePaket: UebersichtEintrag[];
  /** Abgebrochene Läufe. */
  verworfene: UebersichtEintrag[];
}

export function gliederungBilden(documents: PlanDocument[], eintraege: UebersichtEintrag[]): Gliederung {
  const verworfene = eintraege.filter((e) => e.run.status === 'abgebrochen');
  const laufende = eintraege.filter((e) => e.run.status !== 'abgebrochen');
  const pakete = documents
    .filter((d) => d.kind === 'paket' && laufende.some((e) => paketVon(documents, e.doc) === d.id))
    .map((paket) => ({ paket, eintraege: laufende.filter((e) => paketVon(documents, e.doc) === paket.id) }));
  const ohnePaket = laufende.filter((e) => !pakete.some((p) => p.paket.id === paketVon(documents, e.doc)));
  return { pakete, ohnePaket, verworfene };
}

/**
 * Oberste Ebene einer Gruppe – unsortiert. Pläne mit eigenem Lauf stehen unter
 * ihrem Verzeichnis: unter dessen Zeile, wenn es gebündelt läuft, sonst unter
 * einer Klammer. Ist das Verzeichnis nicht in der Liste, steht der Plan für sich.
 */
export function knotenBilden(documents: PlanDocument[], liste: UebersichtEintrag[]): Knoten[] {
  const mitLauf = new Set(liste.filter((e) => e.doc?.kind === 'verzeichnis').map((e) => e.doc!.id));
  const klammern = new Map<string, UebersichtEintrag[]>();
  const knoten: Knoten[] = [];
  for (const e of liste) {
    const elternId = e.doc?.kind === 'plan' ? e.doc.parentId : null;
    if (elternId && mitLauf.has(elternId)) continue;
    const eltern = elternId ? documents.find((d) => d.id === elternId) : undefined;
    if (eltern && !verzeichnisGebuendelt(eltern)) {
      // Klammer an der Stelle ihres ersten Plans einreihen
      if (!klammern.has(eltern.id)) {
        klammern.set(eltern.id, []);
        knoten.push({ art: 'klammer', verzeichnis: eltern, kinder: klammern.get(eltern.id)! });
      }
      klammern.get(eltern.id)!.push(e);
      continue;
    }
    knoten.push({ art: 'lauf', eintrag: e });
  }
  return knoten;
}

/**
 * Pläne eines gebündelt laufenden Verzeichnisses, die in dessen Lauf
 * mitlaufen (also keinen eigenen Lauf haben).
 */
export function mitlaufendePlaene(documents: PlanDocument[], verzeichnisId: ID): PlanDocument[] {
  return documents.filter(
    (d) => d.kind === 'plan' && d.parentId === verzeichnisId && !hatEigenenPlanlauf(d, documents),
  );
}

/**
 * Stand einer Klammer – eines Planpakets oder eines Verzeichnisses mit einzeln
 * laufenden Plänen: Sie laufen selbst nicht; Fortschritt und Status ergeben
 * sich aus den enthaltenen Einträgen mit eigenem Lauf. Je Eintrag zählt der
 * laufende, sonst der abgeschlossene Lauf; abgebrochene bleiben außen vor.
 */
export function standVon(zugehoerig: PlanDocument[], basis: PlanRun[], project: Project): Stand {
  const vorlaufTage = project.settings.erinnerungVorlaufTage;
  const laufendZuerst = (r: PlanRun) => (r.status === 'laufend' ? 0 : 1);
  const laeufe = zugehoerig
    .map(
      (d) =>
        basis
          .filter((r) => r.documentId === d.id && r.status !== 'abgebrochen')
          .sort((a, b) => laufendZuerst(a) - laufendZuerst(b))[0],
    )
    .filter((r): r is PlanRun => Boolean(r));
  if (laeufe.length === 0) return { pct: 0, status: null, ampel: null };
  const pct = Math.round(
    laeufe.reduce((sum, r) => sum + fortschritt(r, project, zugehoerig.find((d) => d.id === r.documentId)), 0) /
      laeufe.length,
  );
  const status: RunStatus = laeufe.some((r) => r.status === 'laufend') ? 'laufend' : 'abgeschlossen';
  // Dringlichkeit: der kritischste anstehende Schritt der laufenden Einträge
  const ampeln = laeufe
    .filter((r) => r.status === 'laufend')
    .map((r) => laufAmpel(aktuelleSchritte(r), vorlaufTage));
  const ampel = AMPEL_RANG.find((a) => a !== 'erledigt' && ampeln.includes(a)) ?? (ampeln.length ? 'neutral' : null);
  return { pct, status, ampel };
}

/** Ampeln nach Dringlichkeit – die erste vorkommende gilt. */
const AMPEL_RANG: Ampel[] = ['ueberfaellig', 'faellig', 'geplant', 'neutral', 'erledigt'];

/**
 * Dringlichste Ampel über alle anstehenden Schritte eines Laufs; ohne
 * anstehenden Schritt „erledigt“.
 */
export function laufAmpel(schritte: RunStep[], vorlaufTage: number): Ampel {
  const ampeln = schritte.map((s) => ampelFuerSchritt(s, vorlaufTage, true));
  return AMPEL_RANG.find((a) => ampeln.includes(a)) ?? 'erledigt';
}

/**
 * Status einer Zeile als Wert für Filter und Sortierung: abgeschlossen bzw.
 * abgebrochen, sonst die Ampel eines anstehenden Schritts – solange der
 * Eingang beim Planlaufmanagement aussteht „angekündigt“, ein überfälliger
 * Eingang zählt aber als überfällig.
 */
export type StatusWert = Ampel | 'angekuendigt' | 'abgeschlossen' | 'abgebrochen';

function schrittStatusWert(step: RunStep, vorlaufTage: number): StatusWert {
  const ampel = ampelFuerSchritt(step, vorlaufTage, true);
  if (ampel !== 'ueberfaellig' && istEingangPLM(step.name)) return 'angekuendigt';
  return ampel;
}

/** Maßgeblicher Status einer Zeile – der dringlichste ihrer anstehenden Schritte. */
export function statusWert(run: PlanRun, schritte: RunStep[], vorlaufTage: number): StatusWert {
  if (run.status !== 'laufend') return run.status;
  const ampel = laufAmpel(schritte, vorlaufTage);
  if (ampel === 'ueberfaellig') return ampel;
  if (schritte.some((s) => istEingangPLM(s.name))) return 'angekuendigt';
  return schritte.length ? ampel : 'neutral';
}

/**
 * Alle Statuswerte einer Zeile – je anstehendem Schritt einer. Der
 * Statusfilter trifft eine Zeile, sobald einer ihrer Schritte passt.
 */
export function statusWerte(run: PlanRun, schritte: RunStep[], vorlaufTage: number): StatusWert[] {
  if (run.status !== 'laufend') return [run.status];
  if (schritte.length === 0) return ['neutral'];
  return [...new Set(schritte.map((s) => schrittStatusWert(s, vorlaufTage)))];
}

/** Stand eines Planpakets aus seinen Einträgen mit eigenem Lauf. */
export function paketStand(documents: PlanDocument[], paketId: ID, basis: PlanRun[], project: Project): Stand {
  return standVon(
    documents.filter(
      (d) => d.kind !== 'paket' && paketVon(documents, d) === paketId && hatEigenenPlanlauf(d, documents),
    ),
    basis,
    project,
  );
}

/** Stand eines Verzeichnisses mit einzeln laufenden Plänen. */
export function verzeichnisStand(
  documents: PlanDocument[],
  verzeichnisId: ID,
  basis: PlanRun[],
  project: Project,
): Stand {
  return standVon(
    documents.filter(
      (d) => d.kind === 'plan' && d.parentId === verzeichnisId && hatEigenenPlanlauf(d, documents),
    ),
    basis,
    project,
  );
}

const AMPEL_TON: Record<Ampel, StatusTon> = {
  erledigt: 'green',
  ueberfaellig: 'red',
  faellig: 'orange',
  geplant: 'blue',
  neutral: '',
};

const RUN_STATUS_TON: Record<RunStatus, StatusTon> = {
  laufend: 'blue',
  abgeschlossen: 'green',
  abgebrochen: '',
};

/** Der Lauf wartet auf den Eingang beim Planlaufmanagement – er ist angekündigt. */
export function wartetAufEingang(run: PlanRun, schritte: RunStep[]): boolean {
  return run.status === 'laufend' && schritte.some((s) => istEingangPLM(s.name));
}

/**
 * Statusangabe einer Zeile, wie sie die Übersicht zeigt: abgeschlossen bzw.
 * abgebrochen, sonst „Angekündigt“ oder die dringlichste Ampel der anstehenden
 * Schritte. Ein überfälliger Eingang zählt als überfällig.
 */
export function statusAnzeige(
  run: PlanRun,
  schritte: RunStep[],
  vorlaufTage: number,
): { text: string; ton: StatusTon } {
  if (run.status !== 'laufend') return { text: RUN_STATUS_LABEL[run.status], ton: RUN_STATUS_TON[run.status] };
  const ampel = laufAmpel(schritte, vorlaufTage);
  if (wartetAufEingang(run, schritte) && ampel !== 'ueberfaellig') return { text: 'Angekündigt', ton: 'gelb' };
  return { text: AMPEL_LABEL[ampel], ton: AMPEL_TON[ampel] };
}

/** Statusangabe eines Planpakets bzw. einer Verzeichnisklammer. */
export function standAnzeige(stand: Stand): { text: string; ton: StatusTon } | null {
  if (stand.status === 'laufend' && stand.ampel) return { text: AMPEL_LABEL[stand.ampel], ton: AMPEL_TON[stand.ampel] };
  if (stand.status) return { text: RUN_STATUS_LABEL[stand.status], ton: RUN_STATUS_TON[stand.status] };
  return null;
}

/* ------------------------------------------------------------------ */
/* Mehrfachauswahl im Reiter „Planläufe“                               */
/* ------------------------------------------------------------------ */

/**
 * Auswahlschlüssel einer Lauf-Zeile – dieselben wie `zeilenSchluessel` im
 * Export: der Lauf selbst und bei einem gebündelt laufenden Verzeichnis die
 * Pläne, die darin mitlaufen. Abgebrochene Läufe sind nicht wählbar.
 */
export function auswahlSchluessel(documents: PlanDocument[], eintrag: Pick<UebersichtEintrag, 'run' | 'doc'>): ID[] {
  if (eintrag.run.status === 'abgebrochen') return [];
  const doc = eintrag.doc;
  const plaene = doc?.kind === 'verzeichnis' ? mitlaufendePlaene(documents, doc.id).map((p) => p.id) : [];
  return [eintrag.run.id, ...plaene];
}

/** Alle wählbaren Schlüssel der angezeigten Läufe (ohne abgebrochene). */
export function waehlbareSchluessel(documents: PlanDocument[], runs: PlanRun[]): Set<ID> {
  return new Set(
    runs.flatMap((run) => auswahlSchluessel(documents, { run, doc: documents.find((d) => d.id === run.documentId) })),
  );
}

/** Ein mitlaufender Plan wurde gewählt, ohne sein Verzeichnis – die Aktion wirkt auf dessen Lauf. */
export interface MitlaufendeWahl {
  verzeichnis: PlanDocument;
  lauf: PlanRun;
  /** Die gewählten Pläne … */
  gewaehlt: PlanDocument[];
  /** … von so vielen, die im Lauf mitlaufen. */
  plaene: number;
}

/**
 * Löst eine Auswahl in Planläufe auf (ohne Dubletten, in der Reihenfolge der
 * Läufe): gewählte Lauf-Zeilen und – für gewählte mitlaufende Pläne – der Lauf
 * ihres Verzeichnisses. Ist das Verzeichnis selbst nicht gewählt, nennt
 * `mitlaufend` den Lauf, damit die Oberfläche darauf hinweisen kann.
 * Abgebrochene Läufe bleiben außen vor.
 */
export function auswahlAufloesen(
  documents: PlanDocument[],
  runs: PlanRun[],
  auswahl: Set<ID>,
): { laeufe: PlanRun[]; mitlaufend: MitlaufendeWahl[] } {
  const laeufe: PlanRun[] = [];
  const mitlaufend: MitlaufendeWahl[] = [];
  for (const run of runs) {
    if (run.status === 'abgebrochen') continue;
    const doc = documents.find((d) => d.id === run.documentId);
    const plaene = doc?.kind === 'verzeichnis' ? mitlaufendePlaene(documents, doc.id) : [];
    const gewaehlt = plaene.filter((p) => auswahl.has(p.id));
    if (auswahl.has(run.id)) laeufe.push(run);
    else if (doc && gewaehlt.length > 0) {
      laeufe.push(run);
      mitlaufend.push({ verzeichnis: doc, lauf: run, gewaehlt, plaene: plaene.length });
    }
  }
  return { laeufe, mitlaufend };
}

/** Hinweis zu einer mitlaufenden Wahl: „wirkt auf den Planlauf von <Verzeichnis> (n Pläne)“. */
export function mitlaufendHinweis(m: MitlaufendeWahl): string {
  const plan = m.gewaehlt.length === 1 ? `„${m.gewaehlt[0].titel}“` : `${m.gewaehlt.length} gewählte Pläne`;
  const name = [m.verzeichnis.nummer, m.verzeichnis.titel].filter(Boolean).join(' ');
  return `${plan} wirkt auf den Planlauf von ${name} (${m.plaene} ${m.plaene === 1 ? 'Plan' : 'Pläne'}).`;
}
