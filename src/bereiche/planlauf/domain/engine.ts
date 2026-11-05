/**
 * Planlauf-Logik: Weg durch die Workflow bestimmen, Eingänge und Soll-Termine
 * aus den tatsächlichen Abschlüssen und Fristen rechnen, Ampelstatus vergeben,
 * Rücksprünge ausführen und offene Aufgaben einsammeln. Die Ablaufregeln selbst
 * (Blöcke, Nachfolger, anstehende Schritte) stehen in ablauf.ts.
 */
import { addDays, diffDays, naechsterArbeitstag, today } from '../../../shared/dates';
import {
  aktuelleSchritte,
  anstehendeSchritte,
  istBegonnen,
  istErledigt,
  massgeblicheAntwort,
  nachfolger,
  ortImVerlauf,
  statusAbgleichen,
  strukturVon,
  verfolgen,
  zielVon,
  type Verlauf,
  type Zweigverlauf,
} from './ablauf';
import { prognose } from './simulation';
import {
  EIGENE_ROLLE,
  INDEX_LABEL,
  STANDARD_BEARBEITER,
  hatEigenenPlanlauf,
  seiteAusFunktion,
  type DocumentKind,
  type AppData,
  type Contact,
  type Role,
  type ID,
  type ISODate,
  type PlanDocument,
  type PlanRun,
  type ProcessTemplate,
  type ProcessTemplateStep,
  type Project,
  type ProtokollEintrag,
  type RunStep,
  type SchrittDurchlauf,
  type Seite,
} from './types';

export { aktuelleSchritte, massgeblicheAntwort } from './ablauf';
export type { Verlauf } from './ablauf';

export type Ampel = 'erledigt' | 'ueberfaellig' | 'faellig' | 'geplant' | 'neutral';

export const AMPEL_LABEL: Record<Ampel, string> = {
  erledigt: 'Erledigt',
  ueberfaellig: 'Überfällig',
  faellig: 'Fällig',
  geplant: 'Im Plan',
  neutral: 'Ohne Termin',
};

/* ------------------------------------------------------------------ */
/* Weg durch die Kette                                                 */
/* ------------------------------------------------------------------ */

/**
 * Der Nachfolger eines Schritts: bei Entscheidungen das Ziel der maßgeblichen
 * Antwort, sonst der hinterlegte Nachfolger. `null` heißt „nächster Schritt“
 * (im Zweig eines Blocks: des Zweigs) – aufgelöst wird es in `nachfolger`.
 */
export function zielVonSchritt(step: ProcessTemplateStep | RunStep): ID | 'ende' | null {
  return zielVon(step);
}

/**
 * Verfolgt den Ablauf durch die Kette nach den maßgeblichen Antworten
 * (gewählt, sonst die erste) – siehe `verfolgen` in ablauf.ts.
 */
export function verlaufDerKette<T extends ProcessTemplateStep | RunStep>(steps: T[]): Verlauf<T> {
  return verfolgen(steps, massgeblicheAntwort);
}

/** Reihenfolge der tatsächlich durchlaufenen Schritte (Blöcke flach, Zweig für Zweig). */
export function pfad<T extends ProcessTemplateStep | RunStep>(steps: T[]): T[] {
  return verlaufDerKette(steps).schritte;
}

/** Schritte, die im aktuellen Verlauf nicht durchlaufen werden. */
export function nichtImPfad<T extends ProcessTemplateStep | RunStep>(steps: T[]): T[] {
  const drin = new Set(pfad(steps).map((s) => s.id));
  return steps.filter((s) => !drin.has(s.id));
}

/* ------------------------------------------------------------------ */
/* Termine                                                             */
/* ------------------------------------------------------------------ */

/** Das späteste von mehreren Daten (leere Angaben zählen nicht). */
function spaetestes(daten: (ISODate | null | undefined)[]): ISODate | null {
  let ergebnis: ISODate | null = null;
  for (const d of daten) if (d && (ergebnis === null || d > ergebnis)) ergebnis = d;
  return ergebnis;
}

/**
 * Rechnet Eingänge und Soll-Termine der Schrittkette neu durch.
 *
 * Regeln (in Verlaufsreihenfolge, Vorgänger stehen immer davor):
 * 1. Ein Schritt, der ansteht oder erledigt ist, erhält – falls noch nicht
 *    vorhanden – einen festen Eingang (`eingangIst`): den spätesten Abschluss
 *    seiner Vorgänger (Ist, mindestens deren Eingang), ohne Vorgänger den
 *    Start. Danach ändert er sich nicht mehr von selbst. Offene, nicht
 *    anstehende Schritte haben keinen festen Eingang.
 * 2. Soll = Eingang + Frist (bei Arbeitstagen mindestens der nächste
 *    Arbeitstag). Ein von Hand gesetztes Soll bleibt; der erste Schritt im
 *    ersten Durchlauf erhält das Eingang Soll des Eintrags, falls hinterlegt –
 *    nicht aber ein Zweiganfang, dessen Eingang aus einem Rücksprung stammt.
 * 3. Künftige Schritte rechnen mit dem voraussichtlichen Eingang: erledigte
 *    Vorgänger mit ihrem Abschluss, offene mit ihrem Soll, frühestens heute.
 *    Diese Prognose liegt nie in der Vergangenheit.
 * Schritte außerhalb des Verlaufs erhalten weder Eingang noch Soll.
 */
export function recalcSollDaten(
  steps: RunStep[],
  start: ISODate,
  arbeitstage: boolean,
  feiertage: ISODate[],
  /**
   * Soll-Termin für den Eingang der Unterlage. Ist er hinterlegt, hat der
   * erste Schritt im ersten Durchlauf keine Frist, sondern genau dieses Datum.
   */
  eingangSoll: ISODate | null = null,
  /** Stichtag der Prognose; null = ohne Stichtag (reine Planung, z. B. Simulation). */
  heute: ISODate | null = today(),
): RunStep[] {
  const verlauf = verfolgen(steps);
  const anstehend = new Set(anstehendeSchritte(verlauf).map((s) => s.id));
  const berechnet = new Map<ID, RunStep>();

  const fertig = (s: RunStep): ISODate | null => spaetestes([s.istDatum, s.eingangIst]) ?? s.sollDatum;
  const prognoseFertig = (s: RunStep): ISODate | null =>
    istErledigt(s) ? fertig(s) : spaetestes([s.sollDatum, heute]);

  for (const step of verlauf.schritte) {
    const vorIds = verlauf.vorgaenger.get(step.id) ?? [];
    const ohneVorgaenger = vorIds.length === 0;
    const vorgaenger = vorIds.map((id) => berechnet.get(id)).filter((s): s is RunStep => Boolean(s));
    const steht = anstehend.has(step.id);
    const erledigt = istErledigt(step);

    // 1. Fester Eingang
    let eingangIst = step.eingangIst ?? null;
    if (steht || erledigt) {
      if (!eingangIst) {
        eingangIst = ohneVorgaenger ? start : spaetestes(vorgaenger.filter((v) => istErledigt(v)).map(fertig));
      }
    } else {
      eingangIst = null;
    }

    // 2. Eingang für die Rechnung: fest bzw. voraussichtlich
    let eingang: ISODate;
    if (eingangIst) eingang = eingangIst;
    else if (ohneVorgaenger) eingang = start;
    else {
      eingang = spaetestes(vorgaenger.map(prognoseFertig)) ?? start;
      if (heute && !steht && !erledigt && eingang < heute) eingang = heute;
    }

    // 3. Soll
    let soll: ISODate;
    if (step.sollManuell && step.sollDatum) soll = step.sollDatum;
    // Eingang Soll gilt nur im ersten Durchlauf und nicht für einen Zweiganfang,
    // der erst beim erneuten Betreten seines Blocks beginnt (Eingang aus dem Rücksprung)
    else if (ohneVorgaenger && (step.durchlauf ?? 1) <= 1 && (step.blockDurchgang ?? 1) <= 1 && eingangSoll) soll = eingangSoll;
    else {
      soll = addDays(eingang, step.fristTage, arbeitstage, feiertage);
      if (arbeitstage) soll = naechsterArbeitstag(soll, feiertage);
    }

    const gleich = step.eingangIst === eingangIst && step.eingangDatum === eingang && step.sollDatum === soll;
    berechnet.set(step.id, gleich ? step : { ...step, eingangIst, eingangDatum: eingang, sollDatum: soll });
  }

  let geaendert = false;
  const ergebnis = steps.map((step) => {
    const neu =
      berechnet.get(step.id) ??
      (step.sollDatum === null && step.eingangDatum === null && (istErledigt(step) || step.eingangIst === null)
        ? step
        : { ...step, sollDatum: null, eingangDatum: null, eingangIst: istErledigt(step) ? step.eingangIst : null });
    if (neu !== step) geaendert = true;
    return neu;
  });
  return geaendert ? ergebnis : steps;
}

/**
 * Rechnet einen kompletten Lauf mit den Projekteinstellungen durch. Liefert
 * den Lauf selbst, wenn sich nichts ändert.
 */
export function recalcRun(
  run: PlanRun,
  project: Project | undefined,
  doc?: { eingangSoll: ISODate | null },
  heute: ISODate | null = today(),
): PlanRun {
  // Ein neu gestarteter bzw. durch eine Sicherung ersetzter Lauf bleibt zum
  // Nachschlagen so stehen, wie er endete – ein neues Eingang Soll des Eintrags
  // gilt nur noch für den neuen Lauf.
  if (run.status === 'abgebrochen' && (run.abbruchArt === 'neu_gestartet' || run.abbruchArt === 'aus_sicherung')) {
    return run;
  }
  const arbeitstage = project?.settings.fristenInArbeitstagen ?? true;
  const feiertage = project?.settings.feiertage ?? [];
  const steps = recalcSollDaten(run.steps, run.start, arbeitstage, feiertage, doc?.eingangSoll ?? null, heute);
  return steps === run.steps ? run : { ...run, steps };
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

/**
 * Ampel eines Schritts. Nur anstehende Schritte können fällig oder überfällig
 * sein; künftige Schritte (`anstehend = false`) stehen höchstens „Im Plan“ –
 * ihr Soll ist eine Prognose. Ob ein Schritt ansteht, weiß nur der Aufrufer
 * (siehe aktuelleSchritte); deshalb gibt es dafür keine Vorgabe.
 */
export function ampelFuerSchritt(step: RunStep, vorlaufTage: number, anstehend: boolean, heute: ISODate = today()): Ampel {
  if (step.status === 'erledigt' || step.status === 'uebersprungen') return 'erledigt';
  if (!step.sollDatum) return 'neutral';
  if (!anstehend) return 'geplant';
  const delta = diffDays(heute, step.sollDatum);
  if (delta < 0) return 'ueberfaellig';
  if (delta <= vorlaufTage) return 'faellig';
  return 'geplant';
}

/**
 * Der führende anstehende Schritt: von den anstehenden der mit dem frühesten
 * Soll (bei parallelen Zweigen können mehrere Schritte zugleich anstehen –
 * siehe aktuelleSchritte).
 */
export function aktuellerSchritt(run: Pick<PlanRun, 'steps'>): RunStep | undefined {
  let fuehrend: RunStep | undefined;
  for (const s of aktuelleSchritte(run)) {
    if (!fuehrend) fuehrend = s;
    else if (s.sollDatum && (!fuehrend.sollDatum || s.sollDatum < fuehrend.sollDatum)) fuehrend = s;
  }
  return fuehrend;
}

/** Verzug des Laufs in Kalendertagen (>0 = überfällig): der größte unter den anstehenden Schritten. */
export function verzugTage(run: Pick<PlanRun, 'steps'>, heute: ISODate = today()): number {
  let verzug = 0;
  for (const step of aktuelleSchritte(run)) {
    if (!step.sollDatum) continue;
    const delta = diffDays(heute, step.sollDatum);
    if (delta < 0) verzug = Math.max(verzug, -delta);
  }
  return verzug;
}

const fortschrittSpeicher = new WeakMap<PlanRun, number>();

/**
 * Fortschritt eines Laufs in Prozent, gewichtet nach Fristen: Fristen der im
 * laufenden Durchlauf erledigten Verlaufsschritte ÷ (diese + Fristen aller
 * laut Prognose noch ausstehenden Ausführungen, Rücksprünge und Wiederholungen
 * eingeschlossen). Ohne Fristen zählen die Schritte. Ein Rücksprung senkt den
 * Fortschritt also, weil die Wiederholung aussteht. 100 % hat nur ein
 * abgeschlossener Lauf; ein laufender bleibt höchstens bei 99 % – auch wenn nur
 * noch Schritte ohne Frist ausstehen. Das Ergebnis wird je Lauf-Objekt
 * zwischengespeichert – jede Änderung erzeugt ein neues Objekt. Pakete und
 * Projekte bilden das Mittel der Lauf-Werte.
 */
export function fortschritt(
  run: PlanRun,
  project?: Pick<Project, 'settings'>,
  doc?: { eingangSoll: ISODate | null },
): number {
  const gespeichert = fortschrittSpeicher.get(run);
  if (gespeichert !== undefined) return gespeichert;
  let wert: number;
  if (run.steps.length === 0) wert = 0;
  else if (run.status === 'abgeschlossen') wert = 100;
  else {
    const erledigt = verfolgen(run.steps).schritte.filter(istErledigt);
    const rest = prognose(run, project, doc).ausfuehrungen;
    const fertig = erledigt.reduce((summe, s) => summe + s.fristTage, 0);
    const offen = rest.reduce((summe, a) => summe + a.frist, 0);
    if (fertig + offen > 0) wert = Math.round((fertig / (fertig + offen)) * 100);
    else if (erledigt.length + rest.length > 0) wert = Math.round((erledigt.length / (erledigt.length + rest.length)) * 100);
    else wert = 0;
    wert = Math.min(99, wert);
  }
  fortschrittSpeicher.set(run, wert);
  return wert;
}

/**
 * Hinweis zu einem abgebrochenen Lauf: ersatzlos beendet oder durch einen
 * neuen Index bzw. eine neue Ausgabe ersetzt.
 */
export function abbruchHinweis(run: PlanRun, kind: DocumentKind = 'plan'): string {
  if (run.status !== 'abgebrochen') return '';
  if (run.abbruchArt === 'aufgeteilt') return 'in Einzelläufe der Pläne aufgeteilt';
  if (run.abbruchArt === 'gebuendelt') return 'wieder im Planlauf des Verzeichnisses gebündelt';
  if (run.abbruchArt === 'neu_gestartet') return 'mit geändertem Workflow neu gestartet';
  if (run.abbruchArt === 'aus_sicherung') return 'durch den Stand einer Sicherung ersetzt';
  if (run.abbruchArt !== 'neuer_index') return 'ersatzlos abgebrochen';
  const label = INDEX_LABEL[kind];
  return run.abbruchNeuerIndex ? `ersetzt durch ${label} ${run.abbruchNeuerIndex}` : `ersetzt durch neuen ${label}`;
}

/** Läuft noch und ist nicht abgebrochen. */
export function istAktiv(run: PlanRun): boolean {
  return run.status === 'laufend';
}

/* ------------------------------------------------------------------ */
/* Auswertungen                                                        */
/* ------------------------------------------------------------------ */

export interface FristEintrag {
  run: PlanRun;
  step: RunStep;
  project: Project;
  ampel: Ampel;
  tageBisSoll: number;
}

/**
 * Die anstehenden Schritte aller laufenden Planläufe, sortiert nach
 * Dringlichkeit – ein Eintrag je anstehendem Schritt (in parallelen Zweigen
 * stehen mehrere Schritte eines Laufs zugleich an). Kommende Schritte
 * erscheinen erst, wenn sie an der Reihe sind; abgebrochene und
 * abgeschlossene Läufe bleiben außen vor.
 */
export function offeneFristen(data: AppData, projectIds?: ID[]): FristEintrag[] {
  const eintraege: FristEintrag[] = [];
  for (const run of eigenstaendigeLaeufe(data.documents, data.runs)) {
    if (projectIds && !projectIds.includes(run.projectId)) continue;
    if (!istAktiv(run)) continue;
    const project = data.projects.find((p) => p.id === run.projectId);
    if (!project) continue;
    for (const step of aktuelleSchritte(run)) {
      const ampel = ampelFuerSchritt(step, project.settings.erinnerungVorlaufTage, true);
      if (ampel === 'erledigt') continue;
      eintraege.push({
        run,
        step,
        project,
        ampel,
        tageBisSoll: step.sollDatum ? diffDays(today(), step.sollDatum) : 9999,
      });
    }
  }
  return eintraege.sort((a, b) => a.tageBisSoll - b.tageBisSoll);
}

/**
 * Anstehende Schritte im eigenen Verantwortungsbereich (Rolle des Bearbeiters)
 * – alle, die gerade an der Reihe sind, nicht dagegen Schritte, die erst später
 * an die Reihe kommen.
 */
export function eigeneTodos(data: AppData, projectIds?: ID[]): FristEintrag[] {
  const rolle = EIGENE_ROLLE.toLowerCase();
  return offeneFristen(data, projectIds).filter((f) => f.step.roleName.trim().toLowerCase() === rolle);
}

/**
 * Ermittelt die Person, die eine Rolle für ein bestimmtes Gewerk ausfüllt.
 * Rollen ohne Gewerkbezug sind einmal für alle Gewerke besetzt.
 */
/**
 * Funktionen, die für einen Eintrag eines Gewerks in Frage kommen: die des
 * Gewerks und die übergreifenden – je Bezeichnung einmal. Ein Schritt merkt sich
 * nur die Bezeichnung; welche Funktion und damit welche Person gemeint ist,
 * ergibt sich aus dem Gewerk des Eintrags (siehe kontaktFuerRolleUndGewerk).
 * Ohne Gewerk kommen alle Funktionen in Frage.
 */
export function funktionenFuerGewerk(rollen: Role[], gewerk: string): string[] {
  const passend = rollen.filter((r) => !gewerk || r.gewerk === null || r.gewerk === gewerk);
  return [...new Set(passend.map((r) => r.name))];
}

export function kontaktFuerRolleUndGewerk(
  kontakte: Contact[],
  rollen: Role[],
  roleName: string,
  gewerk: string,
): ID | null {
  const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const passende = rollen.filter((r) => gleich(r.name, roleName));
  // Funktion des Gewerks; ersatzweise die übergreifende Funktion gleichen Namens
  const rolle = passende.find((r) => r.gewerk === gewerk) ?? passende.find((r) => r.gewerk === null);
  if (!rolle) return null;
  return kontakte.find((c) => c.zuordnungen.some((z) => z.roleId === rolle.id))?.id ?? null;
}

/** Angezeigter Name einer Person: Vor- und Nachname, ersatzweise die Firma. */
export function kontaktName(kontakt: Pick<Contact, 'vorname' | 'nachname' | 'firma'> | undefined): string {
  if (!kontakt) return '';
  return `${kontakt.vorname} ${kontakt.nachname}`.trim() || kontakt.firma.trim();
}

/**
 * Seite, der ein Schritt im Terminnachweis zugerechnet wird: die Seite der
 * Projektfunktion (Funktion des Gewerks, ersatzweise die übergreifende gleichen
 * Namens – wie bei der Zuständigkeit), ohne passende Funktion die Vorbelegung
 * aus der Bezeichnung.
 */
export function seiteFuerSchritt(roleName: string, rollen: Role[], gewerk: string): Seite | null {
  const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const passende = rollen.filter((r) => gleich(r.name, roleName));
  const rolle = passende.find((r) => r.gewerk === gewerk) ?? passende.find((r) => r.gewerk === null);
  if (!rolle) return seiteAusFunktion(roleName);
  return rolle.seite !== undefined ? rolle.seite : seiteAusFunktion(rolle.name);
}

/** Was beim Abschluss eines Schritts als Momentaufnahme festgehalten wird. */
export interface AbschlussKontext {
  /** Funktionen des Projekts. */
  rollen: Role[];
  /** Kontakte des Projekts. */
  kontakte: Contact[];
  /** Gewerk des Eintrags. */
  gewerk: string;
  /** Angemeldete Person. */
  bearbeiter: string;
}

/** Name eines Planlaufs: Codierung bzw. Titel des Eintrags, dazu Index bzw. Ausgabe. */
export function planlaufName(eintrag: { kind: DocumentKind; nummer: string; titel: string; index: string }): string {
  return `Planlauf ${eintrag.nummer || eintrag.titel}${
    eintrag.index ? ` ${INDEX_LABEL[eintrag.kind]} ${eintrag.index}` : ''
  }`;
}

/**
 * Neuer Planlauf eines Eintrags nach einem Workflow: die Schritte der Vorlage,
 * die Zuständigen nach der Besetzung der Funktionen für das Gewerk des Eintrags.
 * Planläufe starten immer mit dem Eintrag – beim Anlegen wie beim Import.
 */
export function planlaufAusWorkflow(
  vorlage: ProcessTemplate,
  eintrag: {
    projectId: ID;
    documentId: ID;
    kind: DocumentKind;
    nummer: string;
    titel: string;
    index: string;
    gewerk: string;
  },
  kontakte: Contact[],
  rollen: Role[],
  start: ISODate,
  newId: () => string,
): Omit<PlanRun, 'id'> {
  return {
    projectId: eintrag.projectId,
    documentId: eintrag.documentId,
    templateId: vorlage.id,
    templateName: vorlage.name,
    name: planlaufName(eintrag),
    index: eintrag.index,
    start,
    status: 'laufend',
    abbruchGrund: null,
    abbruchDatum: null,
    abbruchArt: null,
    abbruchNeuerIndex: null,
    steps: stepsAusTemplate(
      vorlage,
      (roleName) => kontaktFuerRolleUndGewerk(kontakte, rollen, roleName, eintrag.gewerk),
      newId,
    ),
    bemerkung: '',
    protokoll: [],
    basis: null,
  };
}

/**
 * Eigenständig geführte Planläufe.
 *
 * Maßgeblich ist hatEigenenPlanlauf: Pläne eines gebündelten Verzeichnisses
 * laufen im Lauf des Verzeichnisses mit, ein Verzeichnis mit Plänen einzeln
 * hat selbst keinen Lauf. Läufe, die nach dieser Regel nicht (mehr) zählen –
 * etwa der Lauf eines später zugeordneten Plans –, bleiben erhalten, gelten
 * aber nicht als eigenständig.
 */
/**
 * Lauf, der nicht abgebrochen, sondern in eine andere Form überführt wurde:
 * aufgeteilt in Einzelläufe, wieder im Verzeichnis gebündelt, mit geändertem
 * Workflow neu gestartet oder durch den Stand einer Sicherung ersetzt. Solche
 * Läufe zählen nicht als Abbruch des Eintrags.
 */
export function laufUeberfuehrt(run: Pick<PlanRun, 'status' | 'abbruchArt'>): boolean {
  return (
    run.status === 'abgebrochen' &&
    (run.abbruchArt === 'aufgeteilt' ||
      run.abbruchArt === 'gebuendelt' ||
      run.abbruchArt === 'neu_gestartet' ||
      run.abbruchArt === 'aus_sicherung')
  );
}

export function eigenstaendigeLaeufe(documents: PlanDocument[], runs: PlanRun[]): PlanRun[] {
  return runs.filter((r) => {
    const doc = documents.find((d) => d.id === r.documentId);
    return !doc || hatEigenenPlanlauf(doc, documents);
  });
}

/**
 * Übernimmt einen Planlauf samt Stand für einen anderen Eintrag – etwa wenn
 * ein Plan aus dem gebündelten Lauf seines Verzeichnisses herausgelöst wird.
 * Erledigte Schritte bleiben erledigt, der offene Schritt bleibt offen, Start
 * und Termine laufen weiter; frühere Durchläufe, Erinnerungen, Basisplan und
 * Protokoll gehen mit. Schritte und Antworten erhalten neue Kennungen;
 * Verweise (Nachfolger, Antwortziele, gewählte Antwort, Protokoll, Basis-
 * Fristen) werden umgebogen. Das Protokoll erhält den Eintrag „Stand
 * übernommen aus …“.
 */
export function laufUebernehmen(
  quelle: PlanRun,
  ziel: { documentId: ID; name: string; index: string; bemerkung: string },
  neueId: (prefix: string) => ID,
  vermerk: { zeitpunkt?: string; bearbeiter?: string } = {},
): Omit<PlanRun, 'id'> {
  const schrittIds = new Map(quelle.steps.map((s) => [s.id, neueId('rs')]));
  const umbiegen = (z: ID | 'ende' | null) => (z === 'ende' || z === null ? z : (schrittIds.get(z) ?? null));
  const protokoll: ProtokollEintrag[] = [
    ...(quelle.protokoll ?? []).map((e) => ({
      ...e,
      stepId: e.stepId === null ? null : (schrittIds.get(e.stepId) ?? null),
    })),
    {
      zeitpunkt: vermerk.zeitpunkt ?? new Date().toISOString(),
      bearbeiter: vermerk.bearbeiter ?? '',
      stepId: null,
      text: `Stand übernommen aus „${quelle.name}“`,
    },
  ];
  const basis = quelle.basis
    ? {
        ...quelle.basis,
        fristen: Object.fromEntries(
          Object.entries(quelle.basis.fristen).map(([id, frist]) => [schrittIds.get(id) ?? id, frist]),
        ),
      }
    : null;
  return {
    projectId: quelle.projectId,
    documentId: ziel.documentId,
    templateId: quelle.templateId,
    templateName: quelle.templateName,
    name: ziel.name,
    index: ziel.index,
    start: quelle.start,
    status: 'laufend',
    abbruchGrund: null,
    abbruchDatum: null,
    abbruchArt: null,
    abbruchNeuerIndex: null,
    bemerkung: ziel.bemerkung,
    protokoll,
    basis,
    steps: quelle.steps.map((s) => {
      const antwortIds = new Map(s.antworten.map((a) => [a.id, neueId('ant')]));
      return {
        ...s,
        id: schrittIds.get(s.id)!,
        naechster: umbiegen(s.naechster),
        antworten: s.antworten.map((a) => ({ ...a, id: antwortIds.get(a.id)!, ziel: umbiegen(a.ziel) })),
        gewaehlteAntwortId: s.gewaehlteAntwortId ? (antwortIds.get(s.gewaehlteAntwortId) ?? null) : null,
      };
    }),
  };
}

/**
 * Laufende Nummerierung der Pläne und Planverzeichnisse eines Projekts.
 *
 * Planverzeichnisse und Einzelpläne werden in der Reihenfolge ihrer Anlage
 * fortlaufend nummeriert; die Pläne eines Verzeichnisses erhalten dessen
 * Nummer mit angehängtem Zähler (3.1, 3.2 …). Planpakete bleiben ohne Nummer.
 * Gelöschte Einträge geben ihre Nummer wieder frei, da stets neu durchgezählt
 * wird; abgebrochene Einträge behalten sie, weil der Eintrag bestehen bleibt.
 */
export function lfdNummern(documents: PlanDocument[]): Map<ID, string> {
  const nummern = new Map<ID, string>();
  const eintraege = documents.filter((d) => d.kind !== 'paket');
  const istKind = (d: PlanDocument) =>
    d.kind === 'plan' && d.parentId !== null && eintraege.some((x) => x.id === d.parentId);

  let zaehler = 0;
  for (const d of eintraege) {
    if (!istKind(d)) nummern.set(d.id, String(++zaehler));
  }

  const unterZaehler = new Map<ID, number>();
  for (const d of eintraege) {
    if (!istKind(d)) continue;
    const eltern = nummern.get(d.parentId!);
    if (!eltern) continue;
    const n = (unterZaehler.get(d.parentId!) ?? 0) + 1;
    unterZaehler.set(d.parentId!, n);
    nummern.set(d.id, `${eltern}.${n}`);
  }
  return nummern;
}

/**
 * Erzeugt aus einer Vorlage die Schritte eines neuen Laufs: neue Kennungen
 * (Ziele werden mitgezogen), alle Lauffelder leer, die ersten anstehenden
 * Schritte „laufend“.
 */
export function stepsAusTemplate(
  template: ProcessTemplate,
  contactFuerRolle: (roleName: string) => ID | null,
  newId: () => string,
): RunStep[] {
  // Schritt-IDs werden neu vergeben; Antwortziele müssen mitgezogen werden.
  const idMap = new Map<ID, ID>();
  template.steps.forEach((s) => idMap.set(s.id, newId()));

  // Die ersten anstehenden Schritte (bei einem Block am Anfang: alle Zweiganfänge) laufen
  return statusAbgleichen(template.steps.map((s): RunStep => ({
    ...neueLaufFelder(),
    id: idMap.get(s.id)!,
    name: s.name,
    typ: s.typ,
    roleName: s.roleName,
    contactId: contactFuerRolle(s.roleName),
    contactManuell: false,
    fristTage: s.fristTage,
    abweichung: false,
    bemerkung: s.beschreibung,
    antworten: s.antworten.map((a, i) => ({
      id: newId(),
      text: a.text,
      ziel: a.ziel === 'ende' || a.ziel === null ? a.ziel : (idMap.get(a.ziel) ?? null),
      nacharbeit: a.nacharbeit ?? i > 0,
    })),
    naechster: s.naechster === 'ende' || s.naechster === null ? s.naechster : (idMap.get(s.naechster) ?? null),
    nachweis: s.nachweis,
    mailFrage: s.mailFrage,
    mailVorlageId: s.mailVorlageId,
    versandAnliegen: s.versandAnliegen ?? null,
    parallel: s.parallel ?? null,
  })));
}

/**
 * Die Felder eines Laufschritts, die zu Beginn eines Laufs leer sind –
 * Termine, Ist, Antwort, Durchlauf, Historie, Erinnerungen, Nachweis.
 */
export function neueLaufFelder(): Pick<
  RunStep,
  | 'sollDatum'
  | 'sollManuell'
  | 'istDatum'
  | 'status'
  | 'letzteErinnerung'
  | 'gewaehlteAntwortId'
  | 'durchlauf'
  | 'nachweisNummer'
  | 'eingangIst'
  | 'eingangGeschaetzt'
  | 'eingangDatum'
  | 'abschlussInfo'
  | 'historie'
  | 'erinnerungen'
  | 'verzugZuordnung'
  | 'nacharbeitSeite'
  | 'blockDurchgang'
> {
  return {
    sollDatum: null,
    sollManuell: false,
    istDatum: null,
    status: 'offen',
    letzteErinnerung: null,
    gewaehlteAntwortId: null,
    durchlauf: 1,
    nachweisNummer: null,
    eingangIst: null,
    eingangGeschaetzt: false,
    eingangDatum: null,
    abschlussInfo: null,
    historie: [],
    erinnerungen: [],
    verzugZuordnung: [],
    nacharbeitSeite: null,
    blockDurchgang: 1,
  };
}

/**
 * Schritte für einen neuen Lauf aus den Schritten eines bisherigen (neuer
 * Index bzw. neue Ausgabe): gleiche Kette mit neuen Kennungen, alle Termine,
 * Ergebnisse, Historie und Erinnerungen zurückgesetzt. Die ersten
 * anstehenden Schritte sind „laufend“. Abweichungen bleiben gekennzeichnet.
 */
export function schritteFuerNeuenLauf(steps: RunStep[], neueId: (prefix: string) => ID): RunStep[] {
  const idMap = new Map(steps.map((s) => [s.id, neueId('rs')]));
  const umbiegen = (z: ID | 'ende' | null) => (z === 'ende' || z === null ? z : (idMap.get(z) ?? null));
  return statusAbgleichen(
    steps.map((s) => ({
      ...s,
      ...neueLaufFelder(),
      id: idMap.get(s.id)!,
      naechster: umbiegen(s.naechster),
      antworten: s.antworten.map((a) => ({ ...a, id: neueId('ant'), ziel: umbiegen(a.ziel) })),
    })),
  );
}

/**
 * Bearbeitbare Kopie der Schritte eines Workflows für einen neuen Planlauf –
 * mit neuen IDs und umgebogenen Antwortzielen. Die Vorlage selbst bleibt
 * unberührt.
 */
export function vorlagenSchritte(
  vorlage: ProcessTemplate | undefined,
  neueId: (prefix: string) => string,
): ProcessTemplateStep[] {
  if (!vorlage) return [];
  const idMap = new Map(vorlage.steps.map((s) => [s.id, neueId('ts')]));
  const umbiegen = (ziel: ID | 'ende' | null) => (ziel === 'ende' || ziel === null ? ziel : (idMap.get(ziel) ?? null));
  return vorlage.steps.map((s) => ({
    ...s,
    id: idMap.get(s.id)!,
    // „Weiter mit“ und Antwortziele zeigen auf die neuen IDs – sonst gingen Sprünge verloren
    naechster: umbiegen(s.naechster),
    antworten: s.antworten.map((a, i) => ({
      ...a,
      id: neueId('ant'),
      ziel: umbiegen(a.ziel),
      nacharbeit: a.nacharbeit ?? i > 0,
    })),
    parallel: s.parallel ?? null,
  }));
}

/**
 * Schritte eines neuen Planlaufs aus den für ihn bearbeiteten Workflow-
 * Schritten. Was vom Workflow abweicht – andere Zahl, Bezeichnung, Frist,
 * Funktion oder Art –, wird als Abweichung gekennzeichnet.
 */
export function laufSchritteAusVorlage(
  vorlage: ProcessTemplate | undefined,
  bearbeitet: ProcessTemplateStep[],
  kontaktFuerRolle: (roleName: string) => ID | null,
  neueId: () => string,
): RunStep[] {
  const schritte = stepsAusTemplate(
    { id: vorlage?.id ?? '', projectId: null, name: '', beschreibung: '', herkunft: 'manuell', steps: bearbeitet },
    kontaktFuerRolle,
    neueId,
  );
  const original = vorlage?.steps ?? [];
  return schritte.map((s, i) => {
    const o = original[i];
    const abweichend =
      !o ||
      original.length !== schritte.length ||
      o.name !== s.name ||
      o.fristTage !== s.fristTage ||
      o.roleName !== s.roleName ||
      o.typ !== s.typ ||
      (o.parallel?.zweig ?? null) !== (s.parallel?.zweig ?? null) ||
      Boolean(o.parallel) !== Boolean(s.parallel);
    return abweichend ? { ...s, abweichung: true } : s;
  });
}

/**
 * „Erledigte Schritte übernehmen“ beim Neustart mit geändertem Workflow:
 * Entlang des neuen Verlaufs ab Beginn erhält jeder anstehende Schritt den
 * Stand des erledigten (bzw. übersprungenen) Schritts gleicher Bezeichnung und
 * Funktion aus dem laufenden Durchlauf des alten Laufs – Status, Ist, Eingang,
 * Antwort (über ihren Text), Nachweis-Nr., Momentaufnahme und Nacharbeit-
 * Ursache. Beim ersten anstehenden Schritt ohne Gegenstück (in einem Block:
 * sobald kein anstehender mehr eines hat) endet die Übernahme; ebenso, bevor
 * eine übernommene Antwort einen Rücksprung auslösen würde. Jeder alte
 * Schritt wird höchstens einmal verwendet.
 */
export function erledigteUebernehmen(alt: RunStep[], neu: RunStep[]): RunStep[] {
  const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const verwendet = new Set<ID>();
  let steps = neu;
  for (let runde = 0; runde < neu.length; runde++) {
    let uebernommen = false;
    for (const s of aktuelleSchritte({ steps })) {
      const vorlage = alt.find(
        (a) => !verwendet.has(a.id) && istErledigt(a) && gleich(a.name, s.name) && gleich(a.roleName, s.roleName),
      );
      if (!vorlage) continue;
      let gewaehlteAntwortId: ID | null = null;
      if (s.typ === 'entscheidung' && s.antworten.length > 0) {
        const text = massgeblicheAntwort(vorlage)?.text ?? '';
        const antwort = s.antworten.find((a) => gleich(a.text, text));
        if (!antwort) continue;
        gewaehlteAntwortId = antwort.id;
      }
      const kandidat = steps.map((x) =>
        x.id === s.id
          ? {
              ...x,
              status: vorlage.status,
              istDatum: vorlage.istDatum,
              eingangIst: vorlage.eingangIst,
              eingangGeschaetzt: vorlage.eingangGeschaetzt,
              gewaehlteAntwortId: gewaehlteAntwortId ?? x.gewaehlteAntwortId,
              nachweisNummer: vorlage.nachweisNummer,
              abschlussInfo: vorlage.abschlussInfo,
              nacharbeitSeite: vorlage.nacharbeitSeite,
            }
          : x,
      );
      // Würde die übernommene Antwort zurückführen, endet die Übernahme davor
      const verlauf = verfolgen(kandidat);
      const ort = ortImVerlauf(verlauf, s.id);
      const zweigZurueck = ort?.art === 'zweig' && ort.zweig.rueckSprungZu && ort.zweig.schritte.every(istErledigt);
      const obenZurueck = verlauf.rueckSprungZu && verlauf.schritte.every(istErledigt);
      if (!ort || zweigZurueck || obenZurueck) continue;
      verwendet.add(vorlage.id);
      steps = statusAbgleichen(kandidat);
      uebernommen = true;
    }
    if (!uebernommen) break;
  }
  return steps;
}

/** Text und Art der maßgeblichen Antwort eines Schritts (nur Entscheidungen). */
function antwortVon(s: RunStep): { text: string | null; nacharbeit: boolean } {
  if (s.typ !== 'entscheidung' || s.antworten.length === 0) return { text: null, nacharbeit: false };
  const a = istErledigt(s) ? massgeblicheAntwort(s) : s.antworten.find((x) => x.id === s.gewaehlteAntwortId);
  return { text: a?.text ?? null, nacharbeit: a?.nacharbeit ?? false };
}

/** Hält den laufenden Durchlauf eines Schritts als Historieneintrag fest. */
export function durchlaufFesthalten(
  s: RunStep,
  grund: SchrittDurchlauf['grund'],
  zeitpunkt: string,
  kontext?: AbschlussKontext,
): SchrittDurchlauf {
  const antwort = antwortVon(s);
  const seite = s.abschlussInfo
    ? s.abschlussInfo.seite
    : kontext
      ? seiteFuerSchritt(s.roleName, kontext.rollen, kontext.gewerk)
      : seiteAusFunktion(s.roleName);
  return {
    durchlauf: s.durchlauf ?? 1,
    blockDurchgang: s.blockDurchgang ?? 1,
    name: s.name,
    roleName: s.roleName,
    seite,
    contactId: s.contactId,
    kontaktName:
      s.abschlussInfo?.kontaktName ?? (kontext ? kontaktName(kontext.kontakte.find((c) => c.id === s.contactId)) : ''),
    eingang: s.eingangIst ?? null,
    eingangGeschaetzt: s.eingangGeschaetzt ?? false,
    soll: s.sollDatum,
    sollManuell: s.sollManuell,
    ist: s.istDatum,
    status: s.status,
    fristTage: s.fristTage,
    antwort: antwort.text,
    antwortNacharbeit: antwort.nacharbeit,
    nacharbeitSeite: s.nacharbeitSeite ?? null,
    nachweisNummer: s.nachweisNummer,
    bemerkung: s.bemerkung,
    verzugZuordnung: s.verzugZuordnung ?? [],
    grund,
    beendetAm: zeitpunkt,
  };
}

/** Alle Schritte, die von Index `i` über irgendeinen Übergang erreichbar sind (Blöcke als Ganzes). */
function erreichbarVon(steps: RunStep[], i: number): Set<number> {
  const st = strukturVon(steps);
  const erreicht = new Set<number>();
  const warteschlange = [i];
  const hinzu = (j: number) => {
    const lage = st.lage[j];
    const ziele = lage ? lage.block.zweige.flat() : [j];
    for (const k of ziele) {
      if (erreicht.has(k)) continue;
      erreicht.add(k);
      warteschlange.push(k);
    }
  };
  erreicht.add(i);
  while (warteschlange.length > 0) {
    const j = warteschlange.shift()!;
    const s = steps[j];
    const ziele = s.typ === 'entscheidung' && s.antworten.length > 0 ? s.antworten.map((a) => a.ziel) : [s.naechster];
    for (const z of ziele) {
      const f = nachfolger(steps, j, z, st);
      if (f.art === 'schritt' || f.art === 'ausstieg') hinzu(f.index);
      else if (f.art === 'zweigende') {
        const ende = st.lage[j]!.block.ende;
        if (ende < steps.length) hinzu(ende);
      }
    }
  }
  return erreicht;
}

/**
 * Beginnt ab `zielId` einen weiteren Durchlauf – nach einem Rücksprung
 * (Auslöser: der Schritt, der zurückführt) oder bei erneuter Bearbeitung
 * eines wieder geöffneten Schritts.
 *
 * Bereich: das Ziel und alles, was im laufenden Durchlauf ab ihm begonnen
 * war – bei einem Zweig-Rücksprung nur der Rest des Zweigs, beim Wiedereintritt
 * in einen Block der ganze Block, bei einem wieder geöffneten Zweigschritt der
 * Rest seines Zweigs und alles nach dem Block. Dazu begonnene Schritte
 * außerhalb des Verlaufs, die vom Ziel aus erreichbar sind. Jeder dieser
 * Schritte erhält einen Historieneintrag und wird zurückgesetzt (offen, ohne
 * Ist, Antwort, Nachweis, festes Soll, Zuordnung; Durchlauf + 1). Die Schritte,
 * mit denen es weitergeht (das Ziel bzw. bei einem Block alle Zweiganfänge),
 * werden „laufend“ mit Eingang = Ist des Auslösers (bzw. `optionen.eingang`).
 * Wird ein Block erneut ganz betreten, zählt sein Blockdurchgang hoch.
 */
export function rueckSprungAnwenden(
  steps: RunStep[],
  zielId: ID,
  ausloeser: Pick<RunStep, 'id' | 'istDatum'> | null,
  grund: SchrittDurchlauf['grund'],
  zeitpunkt: string,
  optionen: { eingang?: ISODate; heute?: ISODate; kontext?: AbschlussKontext } = {},
): RunStep[] {
  const zielIndex = steps.findIndex((s) => s.id === zielId);
  if (zielIndex < 0) return steps;
  const verlauf = verfolgen(steps);
  const datum = optionen.eingang ?? ausloeser?.istDatum ?? optionen.heute ?? today();

  // Zweig-Rücksprung: ein Zweig, der zum Ziel zurückführt und den Auslöser enthält
  let zweigRueck: { schritte: RunStep[] } | null = null;
  if (grund === 'ruecksprung' && ausloeser) {
    for (const a of verlauf.abschnitte) {
      if (a.art !== 'parallel') continue;
      const z = a.zweige.find((x) => x.rueckSprungZu?.id === zielId && x.schritte.some((s) => s.id === ausloeser.id));
      if (z) zweigRueck = { schritte: z.schritte.slice(Math.max(0, z.schritte.findIndex((s) => s.id === zielId))) };
    }
  }

  const basis: RunStep[] = [];
  /** Blöcke, die nicht als Ganzes erneut betreten werden (Zweig-Rücksprung, erneute Bearbeitung im Zweig). */
  const nurZweig = new Set<ID>();
  if (zweigRueck) {
    basis.push(...zweigRueck.schritte);
    for (const s of zweigRueck.schritte) if (s.parallel) nurZweig.add(s.parallel.block);
  } else {
    // Ein Ziel in einem Block, dessen Zweig im Verlauf abgeschnitten ist, liegt über seinen Block im Verlauf
    const zielBlockId = steps[zielIndex].parallel?.block;
    const blockAbschnitt = verlauf.abschnitte.findIndex((a) => a.art === 'parallel' && a.block === zielBlockId);
    const ort: { art: 'oben' | 'zweig'; abschnitt: number; zweig?: Zweigverlauf<RunStep>; pos?: number } | null =
      ortImVerlauf(verlauf, zielId) ?? (blockAbschnitt >= 0 ? { art: 'zweig', abschnitt: blockAbschnitt } : null);
    if (ort) {
      let k = ort.abschnitt;
      if (ort.art === 'zweig' && ort.zweig && grund === 'wieder_geoeffnet') {
        basis.push(...ort.zweig.schritte.slice(ort.pos));
        const block = verlauf.abschnitte[k];
        if (block.art === 'parallel') nurZweig.add(block.block);
        k += 1;
      }
      for (const a of verlauf.abschnitte.slice(k)) {
        if (a.art === 'schritt') basis.push(a.step);
        else basis.push(...a.zweige.flatMap((z) => z.schritte));
      }
    } else {
      basis.push(steps[zielIndex]);
    }
    // Begonnene Schritte außerhalb des Verlaufs, die vom Ziel aus erreichbar sind
    const imVerlauf = new Set(verlauf.schritte.map((s) => s.id));
    for (const j of erreichbarVon(steps, zielIndex)) {
      if (!imVerlauf.has(steps[j].id)) basis.push(steps[j]);
    }
  }

  const bereich = new Set(basis.filter((s) => s.id === zielId || istBegonnen(s)).map((s) => s.id));
  // Erneut ganz betreten wird jeder Block, in dem etwas zurückgesetzt wird – außer
  // beim Rücksprung bzw. bei der erneuten Bearbeitung innerhalb eines Zweigs
  const bloeckeWieder = new Set<ID>();
  for (const s of steps) {
    if (s.parallel && bereich.has(s.id) && !nurZweig.has(s.parallel.block)) bloeckeWieder.add(s.parallel.block);
  }

  const zurueckgesetzt = steps.map((s): RunStep => {
    const imBlock = s.parallel ? bloeckeWieder.has(s.parallel.block) : false;
    const blockDurchgang = (s.blockDurchgang ?? 1) + (imBlock ? 1 : 0);
    if (!bereich.has(s.id)) return imBlock ? { ...s, blockDurchgang } : s;
    return {
      ...s,
      historie: [...(s.historie ?? []), durchlaufFesthalten(s, grund, zeitpunkt, optionen.kontext)],
      status: 'offen',
      istDatum: null,
      // Die Entscheidung wird im neuen Durchlauf erneut beantwortet.
      gewaehlteAntwortId: s.typ === 'entscheidung' ? null : s.gewaehlteAntwortId,
      nachweisNummer: null,
      sollManuell: false,
      verzugZuordnung: [],
      abschlussInfo: null,
      nacharbeitSeite: null,
      letzteErinnerung: null,
      durchlauf: (s.durchlauf ?? 1) + 1,
      eingangIst: null,
      eingangGeschaetzt: false,
      blockDurchgang,
    };
  });

  // Weiter geht es mit dem Ziel und jedem Schritt des Bereichs, dessen Vorgänger
  // im bisherigen Verlauf außerhalb des Bereichs liegen; wird ein Block als Ganzes
  // erneut betreten, mit den Anfängen aller seiner Zweige
  const eintritte = new Set<ID>([zielId]);
  for (const s of verlauf.schritte) {
    if (!bereich.has(s.id)) continue;
    const vor = verlauf.vorgaenger.get(s.id) ?? [];
    if (vor.every((v) => !bereich.has(v))) eintritte.add(s.id);
  }
  const zielBlock = steps[zielIndex].parallel?.block;
  if (zielBlock && bloeckeWieder.has(zielBlock)) {
    const block = strukturVon(steps).bloecke.get(zielBlock);
    for (const zweig of block?.zweige ?? []) {
      // Zurückgesetzte bzw. noch nicht begonnene Zweiganfänge – Erledigtes bleibt unberührt
      const anfang = steps[zweig[0]];
      if (bereich.has(anfang.id) || !istBegonnen(anfang)) eintritte.add(anfang.id);
    }
  }
  return statusAbgleichen(
    zurueckgesetzt.map((s) => (eintritte.has(s.id) ? { ...s, status: 'laufend' as const, eingangIst: datum } : s)),
  );
}

/**
 * Gewerke, die in einem Projekt zur Auswahl stehen: die gepflegten Stammdaten
 * und zusätzlich jedes Gewerk, für das das Projekt eine Funktion führt. So
 * passen Planliste, Planläufe und der Reiter „Funktion“ immer zusammen.
 */
export function gewerkeFuerProjekt(
  data: Pick<AppData, 'gewerke' | 'roles'>,
  projectId: ID,
): string[] {
  const ausRollen = data.roles
    .filter((r) => r.projectId === projectId)
    .map((r) => r.gewerk)
    .filter((g): g is string => Boolean(g));
  return [...new Set([...data.gewerke, ...ausRollen])].sort((a, b) => a.localeCompare(b, 'de'));
}

/* ------------------------------------------------------------------ */
/* Eigener Kontakt in den markierten Projekten                         */
/* ------------------------------------------------------------------ */

/** Zerlegt den angezeigten Namen in Vor- und Nachname. */
function namensTeile(name: string): { vorname: string; nachname: string } {
  const teile = name.trim().split(/\s+/);
  if (teile.length < 2) return { vorname: teile[0] ?? '', nachname: '' };
  return { vorname: teile.slice(0, -1).join(' '), nachname: teile[teile.length - 1] };
}

/**
 * Führt die angemeldete Person in jedem markierten Projekt und
 * besetzt dort das Planlaufmanagement.
 *
 * Markiert jemand ein Projekt („meine Projekte“), ist er dort immer der
 * Zuständige des Planlaufmanagements – auch wenn er dort noch nicht
 * geführt wurde. Der Eintrag wird deshalb bei jeder Änderung angelegt bzw.
 * nachgezogen, die Funktion bei anderen Kontakten desselben Projekts
 * entfernt und die zugehörigen Schritte laufender Planläufe umgehängt.
 */
export function eigeneKontakteSichern(daten: AppData, neueId: (prefix: string) => string): AppData {
  const { vorname, nachname } = namensTeile(daten.bearbeiter?.name || STANDARD_BEARBEITER);
  let contacts = daten.contacts;
  let geaendert = false;

  for (const projekt of daten.projects.filter((p) => p.markiert)) {
    const rolle = daten.roles.find(
      (r) => r.projectId === projekt.id && r.name === EIGENE_ROLLE && r.gewerk === null,
    );
    const vorhanden = contacts.find((c) => c.projectId === projekt.id && c.eigen);

    // Eintrag anlegen oder Namen und Funktion nachziehen
    let eigenerId: ID;
    if (!vorhanden) {
      eigenerId = neueId('con');
      contacts = [
        {
          id: eigenerId,
          projectId: projekt.id,
          anrede: '',
          vorname,
          nachname,
          firma: EIGENE_ROLLE,
          email: '',
          telefon: '',
          anschrift: '',
          sharepointEingang: '',
          sharepointAusgang: '',
          zuordnungen: rolle ? [{ roleId: rolle.id, gewerk: null }] : [],
          notiz: '',
          eigen: true,
        },
        ...contacts,
      ];
      geaendert = true;
    } else {
      eigenerId = vorhanden.id;
      const fehlt = rolle ? !vorhanden.zuordnungen.some((z) => z.roleId === rolle.id) : false;
      if (vorhanden.vorname !== vorname || vorhanden.nachname !== nachname || fehlt) {
        contacts = contacts.map((c) =>
          c.id === eigenerId
            ? {
                ...c,
                vorname,
                nachname,
                zuordnungen: fehlt ? [...c.zuordnungen, { roleId: rolle!.id, gewerk: null }] : c.zuordnungen,
              }
            : c,
        );
        geaendert = true;
      }
    }

    // Das Planlaufmanagement ist in diesem Projekt allein Sache der eigenen Person
    if (rolle) {
      const doppelt = contacts.some(
        (c) => c.projectId === projekt.id && c.id !== eigenerId && c.zuordnungen.some((z) => z.roleId === rolle.id),
      );
      if (doppelt) {
        contacts = contacts.map((c) =>
          c.projectId === projekt.id && c.id !== eigenerId
            ? { ...c, zuordnungen: c.zuordnungen.filter((z) => z.roleId !== rolle.id) }
            : c,
        );
        geaendert = true;
      }
    }

  }

  return geaendert ? { ...daten, contacts } : daten;
}

/**
 * Zieht die Zuständigkeiten laufender Planläufe aus der Besetzung nach.
 *
 * Ein Schritt nennt eine Funktion; wer sie ausfüllt, steht unter Rollen &
 * Funktionen des Projekts. Wird eine Person erst später eingetragen oder wechselt sie
 * während des Projekts, gilt die neue Besetzung sofort – auch für bereits
 * gestartete Planläufe. Von Hand gesetzte Personen (`contactManuell`) und
 * abgeschlossene Schritte bleiben unangetastet: sie halten fest, wer den
 * Schritt tatsächlich bearbeitet hat.
 */
export function zustaendigkeitenNachziehen(daten: AppData): AppData {
  let geaendert = false;

  const runs = daten.runs.map((run) => {
    if (run.status !== 'laufend') return run;
    const kontakte = daten.contacts.filter((c) => c.projectId === run.projectId);
    const rollen = daten.roles.filter((r) => r.projectId === run.projectId);
    const gewerk = daten.documents.find((d) => d.id === run.documentId)?.gewerk ?? '';

    let laufGeaendert = false;
    const steps = run.steps.map((step) => {
      if (step.contactManuell || step.status === 'erledigt') return step;
      const contactId = kontaktFuerRolleUndGewerk(kontakte, rollen, step.roleName, gewerk);
      if (contactId === step.contactId) return step;
      laufGeaendert = true;
      return { ...step, contactId };
    });
    if (!laufGeaendert) return run;
    geaendert = true;
    return { ...run, steps };
  });

  return geaendert ? { ...daten, runs } : daten;
}
