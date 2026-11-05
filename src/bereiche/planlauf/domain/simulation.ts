/**
 * Simulation eines Planlaufs – Prognose (Grundlage des Fortschritts in
 * engine.ts), Plan-Ende im Regelweg, Basisplan und Rückwärtsrechnung.
 *
 * Es gibt keine zweite Regelwelt: Die Simulation erledigt die anstehenden
 * Schritte nacheinander mit `schrittStatusSetzen` und rechnet nach jedem
 * Schritt mit `recalcSollDaten` – genau wie der Planlauf selbst. Sie arbeitet
 * auf einer Kopie der Schritte; deren IDs bleiben erhalten.
 */
import { addDays, diffArbeitstage, diffDays, istArbeitstag, today } from '../../../shared/dates';
import { anstehendeSchritte, istErledigt, massgeblicheAntwort, statusAbgleichen, verfolgen } from './ablauf';
import { aenderungenAufLauf, schrittStatusSetzen } from './abschluss';
import { neueLaufFelder, recalcSollDaten } from './engine';
import type {
  Basisplan,
  ID,
  ISODate,
  Parallel,
  PlanRun,
  ProcessTemplateStep,
  Project,
  RunStep,
} from './types';

/** Höchstzahl der Abschlüsse einer Simulation (Schutz vor Endlosschleifen). */
export const SIMULATION_GRENZE = 500;

/** Rahmen eines simulierten Laufs. */
export interface SimulationsLauf {
  start: ISODate;
  /** Eingang Soll des Eintrags: Soll des ersten Schritts im ersten Durchlauf. */
  eingangSoll: ISODate | null;
  arbeitstage: boolean;
  feiertage: ISODate[];
  /**
   * Stichtag: Offene Schritte enden frühestens an diesem Tag (Prognose ab dem
   * Ist-Stand). Ohne Stichtag endet jeder Schritt genau an seinem Soll (Planung).
   */
  heute?: ISODate | null;
}

/**
 * Szenario: Index der Antwort, mit der eine Entscheidung in einem bestimmten
 * Durchlauf beantwortet wird; null/undefined = Regel (siehe simulieren).
 */
export type AntwortFuer = (stepId: ID, durchlauf: number) => number | null | undefined;

/** Eine simulierte Ausführung eines Schritts. */
export interface Ausfuehrung {
  stepId: ID;
  name: string;
  roleName: string;
  parallel: Parallel | null;
  durchlauf: number;
  blockDurchgang: number;
  eingang: ISODate;
  frist: number;
  soll: ISODate;
  ist: ISODate;
  /** Text der Antwort (Entscheidungen). */
  antwort: string | null;
  antwortNacharbeit: boolean;
  /** Indizes der Ausführungen, deren Abschluss den Eingang dieser Ausführung bildet. */
  vorgaengerAusfuehrungen: number[];
  /** Eingang ist das Ist des Auslösers eines Rücksprungs. */
  nachRuecksprung: boolean;
}

export interface Simulation {
  /** Ausführungen in Abschlussreihenfolge. */
  ausfuehrungen: Ausfuehrung[];
  /** Spätestes Ist (bei Prognosen auch der schon erledigten Schritte); null ohne Abschluss. */
  ende: ISODate | null;
  /**
   * `schleife`: der Ablauf kommt nicht zum Ende (Rücksprung wiederholt sich,
   * keine Regel-Antwort); `grenze`: mehr als SIMULATION_GRENZE Abschlüsse.
   */
  fehler?: 'schleife' | 'grenze';
  abgeschlossen: boolean;
  /** Stand der Schritte am Ende der Simulation. */
  steps: RunStep[];
}

/**
 * Simuliert einen Lauf bis zum Abschluss.
 *
 * Wiederholt: von den anstehenden Schritten wird der mit dem frühesten
 * Termin `max(Soll, heute)` erledigt, mit Ist = diesem Termin (ohne `heute`:
 * Ist = Soll). Antwort einer Entscheidung: `antwortFuer(stepId, durchlauf)`,
 * sonst eine schon gewählte, sonst im ersten Durchlauf die erste, ab dem
 * zweiten Durchlauf die erste Regel-Antwort (ohne Nacharbeit). Gibt es keine
 * oder wiederholt sich ein Rücksprung, ohne dass sich dazwischen etwas an den
 * Antworten geändert hat, endet die Simulation mit dem Fehler `schleife`.
 *
 * Wie beim Start eines Laufs werden die anstehenden Schritte zuerst „laufend“
 * (statusAbgleichen) – sonst beendete ein früher Ausstieg aus einem Block am
 * Anfang Zweige, die in Wirklichkeit schon laufen.
 */
export function simulieren(steps: RunStep[], lauf: SimulationsLauf, antwortFuer?: AntwortFuer): Simulation {
  const heute = lauf.heute ?? null;
  const zeitpunkt = `${heute ?? lauf.start}T00:00:00.000Z`;
  const rechnen = (st: RunStep[]) =>
    recalcSollDaten(st, lauf.start, lauf.arbeitstage, lauf.feiertage, lauf.eingangSoll, heute);
  let run: PlanRun = {
    id: 'simulation',
    projectId: '',
    documentId: '',
    templateId: null,
    templateName: '',
    name: 'Simulation',
    index: '',
    start: lauf.start,
    status: 'laufend',
    abbruchGrund: null,
    abbruchDatum: null,
    abbruchArt: null,
    abbruchNeuerIndex: null,
    steps: rechnen(statusAbgleichen(steps)),
    bemerkung: '',
    protokoll: [],
    basis: null,
  };

  const ausfuehrungen: Ausfuehrung[] = [];
  const letzteAusfuehrung = new Map<ID, number>();
  /**
   * Eintritte eines Rücksprungs: ihr Eingang stammt vom Auslöser – bei einem
   * Block am Ende des Verlaufs von den letzten Schritten aller Zweige.
   */
  const quelle = new Map<ID, number[]>();
  /** Je Rücksprung (Auslöser → Ziel) der Stand der Antwortwechsel beim letzten Mal. */
  const ruecksprungStand = new Map<string, number>();
  let wechsel = 0;
  let fehler: Simulation['fehler'];
  let abgeschlossen = false;

  const termin = (s: RunStep): ISODate => {
    const soll = s.sollDatum ?? s.eingangDatum ?? lauf.start;
    return heute && soll < heute ? heute : soll;
  };

  for (let n = 0; ; n++) {
    const verlauf = verfolgen(run.steps);
    const anstehend = anstehendeSchritte(verlauf);
    if (anstehend.length === 0) {
      abgeschlossen = verlauf.schritte.every(istErledigt) && !verlauf.rueckSprungZu;
      if (!abgeschlossen) fehler = 'schleife';
      break;
    }
    if (n >= SIMULATION_GRENZE) {
      fehler = 'grenze';
      break;
    }

    let s = anstehend[0];
    for (const x of anstehend) if (termin(x) < termin(s)) s = x;
    const ist = termin(s);

    if (s.typ === 'entscheidung' && s.antworten.length > 0) {
      const index = antwortFuer?.(s.id, s.durchlauf);
      let gewaehlt = index !== null && index !== undefined ? s.antworten[index] : undefined;
      if (gewaehlt) wechsel++;
      else if (s.gewaehlteAntwortId && s.antworten.some((a) => a.id === s.gewaehlteAntwortId)) {
        gewaehlt = s.antworten.find((a) => a.id === s.gewaehlteAntwortId);
        wechsel++;
      } else if ((s.durchlauf ?? 1) <= 1) {
        gewaehlt = s.antworten[0];
        // Im nächsten Durchlauf gilt eine andere Regel – auch das ist ein Wechsel
        wechsel++;
      } else {
        gewaehlt = s.antworten.find((a) => !a.nacharbeit);
      }
      if (!gewaehlt) {
        fehler = 'schleife';
        break;
      }
      const mitAntwort = { ...s, gewaehlteAntwortId: gewaehlt.id };
      run = { ...run, steps: run.steps.map((x) => (x.id === s.id ? mitAntwort : x)) };
      s = mitAntwort;
    }

    const vorgaengerAusfuehrungen =
      quelle.has(s.id)
        ? quelle.get(s.id)!
        : (verlauf.vorgaenger.get(s.id) ?? [])
            .map((id) => letzteAusfuehrung.get(id))
            .filter((i): i is number => i !== undefined);
    const erg = schrittStatusSetzen(
      run,
      s,
      'erledigt',
      s.nachweis !== 'keine' ? (s.nachweisNummer ?? 'Simulation') : undefined,
      { istDatum: ist, heute: ist, zeitpunkt },
    );
    if (erg.art !== 'aenderung') {
      fehler = 'schleife';
      break;
    }
    const antwort = s.typ === 'entscheidung' ? massgeblicheAntwort(s) : undefined;
    ausfuehrungen.push({
      stepId: s.id,
      name: s.name,
      roleName: s.roleName,
      parallel: s.parallel ?? null,
      durchlauf: s.durchlauf ?? 1,
      blockDurchgang: s.blockDurchgang ?? 1,
      eingang: s.eingangIst ?? s.eingangDatum ?? lauf.start,
      frist: s.fristTage,
      soll: s.sollDatum ?? ist,
      ist,
      antwort: antwort?.text ?? null,
      antwortNacharbeit: antwort?.nacharbeit ?? false,
      vorgaengerAusfuehrungen,
      nachRuecksprung: quelle.has(s.id),
    });
    letzteAusfuehrung.set(s.id, ausfuehrungen.length - 1);
    quelle.delete(s.id);

    run = aenderungenAufLauf(run, erg.aenderungen);
    if (erg.ruecksprung) {
      const schluessel = `${erg.ruecksprung.ausloeserId}>${erg.ruecksprung.zielId}`;
      if (ruecksprungStand.get(schluessel) === wechsel) {
        fehler = 'schleife';
        run = { ...run, steps: rechnen(run.steps) };
        break;
      }
      ruecksprungStand.set(schluessel, wechsel);
      const von = erg.ruecksprung.vorgaengerIds
        .map((id) => letzteAusfuehrung.get(id))
        .filter((i): i is number => i !== undefined);
      for (const id of erg.ruecksprung.eintritte) quelle.set(id, von.length > 0 ? von : [ausfuehrungen.length - 1]);
    }
    run = { ...run, steps: rechnen(run.steps) };
    if (erg.abgeschlossen) {
      abgeschlossen = true;
      break;
    }
  }

  return { ausfuehrungen, ende: endeVon(ausfuehrungen, run.steps), fehler, abgeschlossen, steps: run.steps };
}

/** Spätestes Ist: der Ausführungen, sonst der erledigten Schritte des Verlaufs. */
function endeVon(ausfuehrungen: Ausfuehrung[], steps: RunStep[]): ISODate | null {
  let ende: ISODate | null = null;
  for (const a of ausfuehrungen) if (!ende || a.ist > ende) ende = a.ist;
  for (const s of verfolgen(steps).schritte) if (istErledigt(s) && s.istDatum && (!ende || s.istDatum > ende)) ende = s.istDatum;
  return ende;
}

/* ------------------------------------------------------------------ */
/* Prognose                                                            */
/* ------------------------------------------------------------------ */

export interface Prognose {
  /** Voraussichtliches Ende (bei abgeschlossenen Läufen das tatsächliche). */
  ende: ISODate | null;
  /** Die noch ausstehenden Ausführungen. */
  ausfuehrungen: Ausfuehrung[];
  /** Summe der Fristen der ausstehenden Ausführungen. */
  verbleibendeFristen: number;
  fehler?: Simulation['fehler'];
}

/**
 * Prognose eines Laufs ab seinem Ist-Stand: offene Schritte enden frühestens
 * heute, anstehende Rücksprünge werden ausgeführt, danach gelten die Regeln
 * der Simulation (gewählte, sonst Regel-Antworten).
 */
export function prognose(
  run: PlanRun,
  project?: Pick<Project, 'settings'>,
  doc?: { eingangSoll: ISODate | null },
  heute: ISODate = today(),
): Prognose {
  const sim = simulieren(run.steps, {
    start: run.start,
    eingangSoll: doc?.eingangSoll ?? null,
    arbeitstage: project?.settings.fristenInArbeitstagen ?? true,
    feiertage: project?.settings.feiertage ?? [],
    heute,
  });
  return {
    ende: sim.ende,
    ausfuehrungen: sim.ausfuehrungen,
    verbleibendeFristen: sim.ausfuehrungen.reduce((summe, a) => summe + a.frist, 0),
    ...(sim.fehler ? { fehler: sim.fehler } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Regelweg und Basisplan                                              */
/* ------------------------------------------------------------------ */

/** Kopie der Laufschritte mit gleichen IDs, alles zurückgesetzt – Ausgangslage des Regelwegs. */
export function regelwegSchritte(steps: RunStep[]): RunStep[] {
  return steps.map((s) => ({ ...s, ...neueLaufFelder() }));
}

/** Laufschritte aus Workflow-Schritten für eine Simulation – die IDs bleiben erhalten. */
export function laufSchritteFuerSimulation(steps: ProcessTemplateStep[]): RunStep[] {
  return steps.map((s) => ({
    ...neueLaufFelder(),
    id: s.id,
    name: s.name,
    typ: s.typ,
    roleName: s.roleName,
    contactId: null,
    contactManuell: false,
    fristTage: s.fristTage,
    abweichung: false,
    bemerkung: s.beschreibung,
    antworten: s.antworten.map((a, i) => ({ ...a, nacharbeit: a.nacharbeit ?? i > 0 })),
    naechster: s.naechster,
    nachweis: s.nachweis,
    mailFrage: s.mailFrage,
    mailVorlageId: s.mailVorlageId,
    versandAnliegen: s.versandAnliegen ?? null,
    parallel: s.parallel ?? null,
  }));
}

/**
 * Ende im Regelweg: die Schritte von vorn, jede Entscheidung im ersten
 * Durchlauf mit ihrer ersten Antwort, jeder Schritt genau zu seinem Soll.
 */
export function planEndeImRegelweg(steps: RunStep[], lauf: Omit<SimulationsLauf, 'heute'>): Simulation {
  return simulieren(regelwegSchritte(steps), { ...lauf, heute: null });
}

/**
 * Basisplan eines Laufs – festgehalten beim Start: Anker (Eingang Soll bzw.
 * Start), Fristen aller Schritte und Plan-Ende im Regelweg (null bei Schleife).
 */
export function basisplanFestlegen(
  run: Pick<PlanRun, 'start' | 'steps'>,
  project: Pick<Project, 'settings'> | undefined,
  doc: { eingangSoll: ISODate | null } | undefined,
  grund: string,
  festgelegtAm: string = new Date().toISOString(),
): Basisplan {
  const arbeitstage = project?.settings.fristenInArbeitstagen ?? true;
  const sim = planEndeImRegelweg(run.steps, {
    start: run.start,
    eingangSoll: doc?.eingangSoll ?? null,
    arbeitstage,
    feiertage: project?.settings.feiertage ?? [],
  });
  return {
    festgelegtAm,
    anker: doc?.eingangSoll ?? run.start,
    eingangSoll: doc?.eingangSoll ?? null,
    planEnde: sim.fehler ? null : sim.ende,
    arbeitstage,
    fristen: Object.fromEntries(run.steps.map((s) => [s.id, s.fristTage])),
    grund,
  };
}

/* ------------------------------------------------------------------ */
/* Rückwärtsrechnung                                                   */
/* ------------------------------------------------------------------ */

export interface RueckwaertsOptionen {
  arbeitstage: boolean;
  feiertage: ISODate[];
  /**
   * Was der Anker ist: `start` – Start des Laufs (Soll des ersten Schritts =
   * Anker + Frist); `eingangSoll` – Soll des ersten Schritts (z. B. die
   * Übergabe durch den Planer bei „Eingang PLM“).
   */
  ankerArt?: 'start' | 'eingangSoll';
  antwortFuer?: AntwortFuer;
  /** Zielschritt: maßgeblich ist sein letzter Abschluss; ohne Angabe das Ende des Laufs. */
  zielStepId?: ID | null;
}

export interface Rueckwaerts {
  /** Spätester Anker, dessen Simulation spätestens am Ziel endet. */
  anker: ISODate | null;
  /** Simulation mit diesem Anker. */
  simulation: Simulation | null;
  /** Ende dieser Simulation (am Zielschritt bzw. Ende des Laufs). */
  ende: ISODate | null;
  /** Je Ausführung der späteste Abschluss, der das Ziel noch hält (null = für das Ziel ohne Belang). */
  spaetestens: (ISODate | null)[];
  /** Je Ausführung der Puffer in Tagen bis `spaetestens`. */
  puffer: (number | null)[];
  /** Ausführungen auf dem kritischen Weg (kleinster Puffer). */
  kritisch: boolean[];
  /** `leer`: keine Schritte; `ziel`: Zielschritt wird nie abgeschlossen. */
  fehler?: Simulation['fehler'] | 'leer' | 'ziel';
}

/**
 * Rückwärtsrechnung: der späteste Anker (bei Arbeitstagen ein Arbeitstag),
 * dessen Simulation bis `zielEnde` fertig ist – geschätzt über die Dauer,
 * dann tageweise nachgeführt. Dazu je Ausführung der späteste Abschluss
 * (CPM-Rückwärtslauf über die Abhängigkeiten der Ausführungen) und der Puffer.
 * Bei Arbeitstagen zählt als spätestes Ende der letzte Arbeitstag bis
 * `zielEnde` – an einem Wochenende bzw. Feiertag endet kein Schritt.
 */
export function rueckwaerts(steps: RunStep[], zielEnde: ISODate, optionen: RueckwaertsOptionen): Rueckwaerts {
  const leer: Rueckwaerts = { anker: null, simulation: null, ende: null, spaetestens: [], puffer: [], kritisch: [] };
  if (steps.length === 0) return { ...leer, fehler: 'leer' };
  const { arbeitstage, feiertage } = optionen;
  const tage = (a: ISODate, b: ISODate) => (arbeitstage ? diffArbeitstage(a, b, feiertage) : diffDays(a, b));
  const schieben = (d: ISODate, n: number) => (arbeitstage ? addDays(d, n, true, feiertage) : addDays(d, n));
  const aufArbeitstag = (d: ISODate) => {
    if (!arbeitstage) return d;
    let x = d;
    for (let i = 0; i < 400 && !istArbeitstag(x, feiertage); i++) x = addDays(x, -1);
    return x;
  };
  const rechnen = (anker: ISODate) => {
    const sim = simulieren(
      steps,
      {
        start: anker,
        eingangSoll: optionen.ankerArt === 'eingangSoll' ? anker : null,
        arbeitstage,
        feiertage,
        heute: null,
      },
      optionen.antwortFuer,
    );
    let ende: ISODate | null = sim.ende;
    if (optionen.zielStepId) {
      const treffer = sim.ausfuehrungen.filter((a) => a.stepId === optionen.zielStepId);
      ende = treffer.length > 0 ? treffer[treffer.length - 1].ist : null;
    }
    return { sim, ende };
  };

  // Bei Arbeitstagen endet jeder Schritt an einem Arbeitstag: Ein Ziel am
  // Wochenende bzw. Feiertag heißt „spätestens am Arbeitstag davor“.
  const spaetestesEnde = aufArbeitstag(zielEnde);
  let anker = spaetestesEnde;
  let probe = rechnen(anker);
  if (probe.sim.fehler) return { ...leer, simulation: probe.sim, fehler: probe.sim.fehler };
  if (!probe.ende) return { ...leer, simulation: probe.sim, fehler: 'ziel' };
  // Schätzung über die Dauer, dann tageweise nachführen
  anker = aufArbeitstag(schieben(spaetestesEnde, -tage(anker, probe.ende)));
  probe = rechnen(anker);
  for (let i = 0; i < 1000 && probe.ende && probe.ende > spaetestesEnde; i++) {
    anker = schieben(anker, -1);
    probe = rechnen(anker);
  }
  for (let i = 0; i < 1000; i++) {
    const weiter = schieben(anker, 1);
    const naechste = rechnen(weiter);
    if (!naechste.ende || naechste.ende > spaetestesEnde) break;
    anker = weiter;
    probe = naechste;
  }
  if (!probe.ende) return { ...leer, simulation: probe.sim, fehler: 'ziel' };

  // CPM-Rückwärtslauf: Vorgänger stehen in der Abschlussreihenfolge immer vorn
  const ausf = probe.sim.ausfuehrungen;
  const nachfolgende: number[][] = ausf.map(() => []);
  ausf.forEach((a, i) => a.vorgaengerAusfuehrungen.forEach((v) => nachfolgende[v].push(i)));
  let relevant = ausf.map(() => true);
  let zielIndex = -1;
  if (optionen.zielStepId) {
    ausf.forEach((a, i) => {
      if (a.stepId === optionen.zielStepId) zielIndex = i;
    });
    relevant = ausf.map(() => false);
    const stapel = zielIndex >= 0 ? [zielIndex] : [];
    while (stapel.length > 0) {
      const i = stapel.pop()!;
      if (relevant[i]) continue;
      relevant[i] = true;
      stapel.push(...ausf[i].vorgaengerAusfuehrungen);
    }
  }
  const spaetestens: (ISODate | null)[] = ausf.map(() => null);
  for (let i = ausf.length - 1; i >= 0; i--) {
    if (!relevant[i]) continue;
    const folgende = i === zielIndex ? [] : nachfolgende[i].filter((j) => relevant[j] && spaetestens[j]);
    if (folgende.length === 0) {
      spaetestens[i] = spaetestesEnde;
      continue;
    }
    let frueheste: ISODate | null = null;
    for (const j of folgende) {
      const eingang = schieben(spaetestens[j]!, -ausf[j].frist);
      if (!frueheste || eingang < frueheste) frueheste = eingang;
    }
    spaetestens[i] = frueheste;
  }
  const puffer = ausf.map((a, i) => (spaetestens[i] ? tage(a.ist, spaetestens[i]!) : null));
  const kleinster = Math.min(...puffer.filter((p): p is number => p !== null));
  return {
    anker,
    simulation: probe.sim,
    ende: probe.ende,
    spaetestens,
    puffer,
    kritisch: puffer.map((p) => p !== null && p === kleinster),
  };
}
