/**
 * Statuswechsel eines Prozessschritts – unabhängig von der Oberfläche.
 *
 * Die Funktionen beschreiben nur, was geschehen soll (die Änderungen am Lauf
 * und die Rückmeldung an die Bearbeiterin); geschrieben wird über den Store.
 * So verhalten sich der Planlauf, die Übersichtslisten – Fristen, Dashboard,
 * Pläne – und die Simulation (domain/simulation.ts) identisch.
 */
import { today } from '../../../shared/dates';
import {
  aktuelleSchritte,
  anstehendeSchritte,
  einfuegenMoeglich,
  folgeImVerlauf,
  istErledigt,
  massgeblicheAntwort,
  ortImVerlauf,
  schrittImLaufEinfuegen,
  statusAbgleichen,
  verfolgen,
  type EinfuegePosition,
  type Verlauf,
} from './ablauf';
import { kontaktName, rueckSprungAnwenden, seiteFuerSchritt, type AbschlussKontext } from './engine';
import {
  STEP_STATUS_LABEL,
  seiteAusFunktion,
  type AbschlussInfo,
  type ID,
  type ISODate,
  type PlanRun,
  type RunStep,
  type StepStatus,
} from './types';

/** Eine auszuführende Änderung am Lauf bzw. an einem Schritt. */
export type Aenderung =
  | { art: 'run'; patch: Partial<PlanRun> }
  | { art: 'step'; stepId: string; patch: Partial<RunStep> };

/** Ein ausgeführter Rücksprung bzw. eine erneute Bearbeitung. */
export interface Ruecksprung {
  /** `zweig`: innerhalb eines parallelen Zweigs; `oben`: im Hauptablauf; `wieder_geoeffnet`: erneute Bearbeitung. */
  art: 'zweig' | 'oben' | 'wieder_geoeffnet';
  zielId: ID;
  /**
   * Schritt, der zurückführte (null beim Wieder öffnen). Endet der Verlauf mit
   * einem Block, ist es von den letzten Schritten seiner Zweige der mit dem
   * spätesten Ist – sein Ist ist der Wiedereingang.
   */
  ausloeserId: ID | null;
  /**
   * Alle Schritte, deren Abschluss den Wiedereingang bildet: der Auslöser bzw.
   * bei einem Block die letzten Schritte aller Zweige (leer beim Wieder öffnen).
   */
  vorgaengerIds: ID[];
  /** Schritte, mit denen der neue Durchlauf beginnt. */
  eintritte: ID[];
}

export type Abschluss =
  /** Vor dem Erledigen muss erst die Freigabe- bzw. Prüfbericht-Nr. erfasst werden. */
  | { art: 'nachweis'; step: RunStep }
  | {
      art: 'aenderung';
      aenderungen: Aenderung[];
      meldung: string;
      /**
       * Alle Schritte, die nach dieser Änderung neu anstehen – Grundlage für
       * eine E-Mail. Termine erst nach dem Neuberechnen im Store aktuell; die
       * Oberfläche liest die Schritte daher über ihre IDs frisch aus dem Bestand.
       */
      naechste: RunStep[];
      ruecksprung: Ruecksprung | null;
      /** Der Lauf ist damit abgeschlossen. */
      abgeschlossen: boolean;
    };

export interface StatusOptionen {
  /** Ist-Datum des Abschlusses; ohne Angabe ein schon erfasstes Ist bzw. heute. */
  istDatum?: ISODate;
  /** Funktionen, Kontakte, Gewerk und Bearbeiter für die Momentaufnahme (abschlussInfo). */
  kontext?: AbschlussKontext;
  /** ISO-Zeitstempel des Vorgangs (Vorgabe: jetzt). */
  zeitpunkt?: string;
  /** Heutiges Datum (Vorgabe: today()). */
  heute?: ISODate;
  /** Wieder öffnen mit erneuter Bearbeitung: Eingang des neuen Durchlaufs (Vorgabe: heute). */
  eingang?: ISODate;
}

/**
 * Ein Nachweis wird verlangt, wenn der Schritt erfolgreich abgeschlossen
 * wird: bei Entscheidungen nur bei der ersten (zustimmenden) Antwort.
 */
export function braucheNachweis(step: RunStep, status: StepStatus): boolean {
  if (status !== 'erledigt' || step.nachweis === 'keine' || step.nachweisNummer) return false;
  if (step.typ !== 'entscheidung') return true;
  return massgeblicheAntwort(step)?.id === step.antworten[0]?.id;
}

/** Wendet Änderungen auf einen Lauf an (ohne Neuberechnung der Termine). */
export function aenderungenAufLauf(run: PlanRun, aenderungen: Aenderung[]): PlanRun {
  return aenderungen.reduce<PlanRun>(
    (lauf, a) =>
      a.art === 'run'
        ? { ...lauf, ...a.patch }
        : { ...lauf, steps: lauf.steps.map((s) => (s.id === a.stepId ? { ...s, ...a.patch } : s)) },
    run,
  );
}

/** Momentaufnahme beim Erledigen bzw. Überspringen. */
function abschlussInfoVon(step: RunStep, kontext: AbschlussKontext | undefined, zeitpunkt: string): AbschlussInfo {
  return {
    roleName: step.roleName,
    seite: kontext ? seiteFuerSchritt(step.roleName, kontext.rollen, kontext.gewerk) : seiteAusFunktion(step.roleName),
    kontaktName: kontext ? kontaktName(kontext.kontakte.find((c) => c.id === step.contactId)) : '',
    bearbeiter: kontext?.bearbeiter ?? '',
    zeitpunkt,
  };
}

/** Was ein Rücksprung zum Festhalten der Historie braucht. */
interface RueckKontext {
  zeitpunkt: string;
  heute: ISODate;
  kontext?: AbschlussKontext;
}

/** Ist eines Schritts als Vergleichswert (ohne Ist ganz vorn). */
const istVon = (s: RunStep) => s.istDatum ?? '';

/**
 * Auslöser eines Rücksprungs im Hauptablauf: von den Schritten am Ende des
 * Verlaufs (bei einem Block die letzten Schritte aller Zweige, auch der
 * Ausstieg) der mit dem spätesten Ist – bei Gleichstand `bevorzugt`, sonst der
 * erste. Der Wiedereingang liegt damit nie vor dem Abschluss eines Zweigs.
 */
function ausloeserImHauptablauf(
  steps: RunStep[],
  verlauf: Verlauf<RunStep>,
  bevorzugt: RunStep | null,
): { ausloeser: RunStep; vorgaenger: RunStep[] } | null {
  const vorgaenger = verlauf.schluss
    .map((id) => (bevorzugt && id === bevorzugt.id ? bevorzugt : steps.find((s) => s.id === id)))
    .filter((s): s is RunStep => Boolean(s));
  let ausloeser: RunStep | null = null;
  for (const s of vorgaenger) {
    if (!ausloeser || istVon(s) > istVon(ausloeser) || (istVon(s) === istVon(ausloeser) && s.id === bevorzugt?.id)) ausloeser = s;
  }
  return ausloeser ? { ausloeser, vorgaenger } : null;
}

/**
 * Holt Rücksprünge nach, die fällig sind, aber noch nicht ausgeführt wurden –
 * etwa weil eine Korrektur den Ausstieg eines anderen Zweigs aufgehoben hat
 * und ein Zweig nun wieder zu seiner Nachreichung zurückführt:
 * * jeder Zweig mit Rücksprung, dessen Schritte alle erledigt sind – sein Ziel
 *   ist sofort an der Reihe, auch wenn andere Zweige noch laufen;
 * * ein Rücksprung im Hauptablauf, wenn kein Verlaufsschritt mehr offen ist.
 * Weil der Rücksprung erst jetzt wirksam wird, ist der Wiedereingang heute
 * (frühestens das Ist des Auslösers).
 */
function ausstehendeRuecksprunge(steps: RunStep[], rk: RueckKontext): { steps: RunStep[]; ruecksprung: Ruecksprung | null } {
  let ruecksprung: Ruecksprung | null = null;
  for (let n = 0; n < steps.length; n++) {
    const verlauf = verfolgen(steps);
    let ziel: RunStep | null = null;
    let ausloeser: RunStep | null = null;
    let vorgaenger: RunStep[] = [];
    let art: Ruecksprung['art'] = 'zweig';
    for (const a of verlauf.abschnitte) {
      if (a.art !== 'parallel') continue;
      const z = a.zweige.find((x) => x.rueckSprungZu && x.schritte.every(istErledigt));
      if (z) {
        ziel = z.rueckSprungZu;
        ausloeser = z.schritte[z.schritte.length - 1];
        vorgaenger = [ausloeser];
        break;
      }
    }
    if (!ziel && verlauf.rueckSprungZu && verlauf.schritte.every(istErledigt)) {
      const ende = ausloeserImHauptablauf(steps, verlauf, null);
      if (ende) ({ ausloeser, vorgaenger } = ende);
      ziel = verlauf.rueckSprungZu;
      art = 'oben';
    }
    if (!ziel || !ausloeser) break;
    const alt = steps;
    const eingang = istVon(ausloeser) > rk.heute ? istVon(ausloeser) : rk.heute;
    steps = rueckSprungAnwenden(steps, ziel.id, ausloeser, 'ruecksprung', rk.zeitpunkt, {
      eingang,
      heute: rk.heute,
      kontext: rk.kontext,
    });
    ruecksprung = {
      art,
      zielId: ziel.id,
      ausloeserId: ausloeser.id,
      vorgaengerIds: vorgaenger.map((s) => s.id),
      eintritte: eintritteVon(steps, alt),
    };
  }
  return { steps, ruecksprung };
}

/** Ergebnis einer Änderung der Schrittliste: neu anstehende Schritte und ggf. Abschluss des Laufs. */
function ergebnis(
  run: PlanRun,
  vorher: Set<ID>,
  roh: RunStep[],
  meldung: string,
  ruecksprungBisher: Ruecksprung | null,
  rk: RueckKontext,
  extra: Partial<PlanRun> = {},
): Abschluss {
  const aufgeloest = ausstehendeRuecksprunge(roh, rk);
  const steps = aufgeloest.steps;
  const ruecksprung = ruecksprungBisher ?? aufgeloest.ruecksprung;
  const verlauf = verfolgen(steps);
  const anstehend = anstehendeSchritte(verlauf);
  const abgeschlossen =
    run.status === 'laufend' && anstehend.length === 0 && !verlauf.rueckSprungZu && verlauf.schritte.every(istErledigt);
  return {
    art: 'aenderung',
    aenderungen: [{ art: 'run', patch: { ...extra, steps, ...(abgeschlossen ? { status: 'abgeschlossen' as const } : {}) } }],
    meldung: abgeschlossen ? 'Alle Schritte erledigt – Planlauf abgeschlossen.' : meldung,
    naechste: anstehend.filter((s) => !vorher.has(s.id)),
    ruecksprung,
    abgeschlossen,
  };
}

/**
 * Setzt den Status eines Schritts und rückt den Lauf weiter.
 *
 * Beim Erledigen bzw. Überspringen: Ist = `optionen.istDatum`, sonst ein schon
 * erfasstes Ist, sonst heute; dazu die Momentaufnahme (Funktion, Seite, Person,
 * Bearbeiter, Zeitpunkt). Eine Entscheidung mit Nacharbeit-Antwort erhält die
 * Ursache „Planer“ als Vorbelegung. Danach wird – nur für den Zweig bzw. den
 * Verlauf des abgeschlossenen Schritts – geprüft:
 * * Zweig-Rücksprung, wenn der Zweig zurückführt und alle seine Schritte erledigt
 *   sind – Wiedereingang ist das Ist des Schritts;
 * * Rücksprung im Hauptablauf, wenn er zurückführt und kein Verlaufsschritt mehr
 *   offen ist – Wiedereingang ist das späteste Ist am Ende des Verlaufs (bei
 *   einem Block über alle Zweigenden);
 * * sonst: nichts mehr offen → Lauf abgeschlossen; andernfalls werden alle jetzt
 *   anstehenden Schritte „laufend“.
 * Danach werden Rücksprünge anderer Zweige nachgeholt, die fällig geworden sind
 * (siehe ausstehendeRuecksprunge).
 * „Offen“ bzw. „laufend“ an einem erledigten Schritt heißt Wieder öffnen.
 */
export function schrittStatusSetzen(
  run: PlanRun,
  step: RunStep,
  status: StepStatus,
  nachweisNummer?: string,
  optionen: StatusOptionen = {},
): Abschluss {
  const aktuell = run.steps.find((s) => s.id === step.id) ?? step;
  if (braucheNachweis(aktuell, status) && nachweisNummer === undefined) {
    return { art: 'nachweis', step: aktuell };
  }
  const heute = optionen.heute ?? today();
  const zeitpunkt = optionen.zeitpunkt ?? new Date().toISOString();
  const vorher = new Set(aktuelleSchritte(run).map((s) => s.id));
  const rk: RueckKontext = { zeitpunkt, heute, kontext: optionen.kontext };

  if (status === 'offen' || status === 'laufend') {
    if (istErledigt(aktuell)) return wiederOeffnen(run, aktuell, undefined, optionen);
    const steps = run.steps.map((s) => (s.id === aktuell.id ? { ...s, status } : s));
    return ergebnis(run, vorher, steps, `„${aktuell.name}“: ${STEP_STATUS_LABEL[status]}`, null, rk);
  }

  const antwort = aktuell.typ === 'entscheidung' ? massgeblicheAntwort(aktuell) : undefined;
  const abgeschlossenerSchritt: RunStep = {
    ...aktuell,
    status,
    istDatum: optionen.istDatum ?? aktuell.istDatum ?? heute,
    nachweisNummer: nachweisNummer !== undefined ? nachweisNummer : aktuell.nachweisNummer,
    gewaehlteAntwortId: antwort ? antwort.id : aktuell.gewaehlteAntwortId,
    abschlussInfo: abschlussInfoVon(aktuell, optionen.kontext, zeitpunkt),
    nacharbeitSeite: antwort?.nacharbeit ? (aktuell.nacharbeitSeite ?? 'planer') : null,
  };
  let steps = run.steps.map((s) => (s.id === aktuell.id ? abgeschlossenerSchritt : s));
  const verlauf = verfolgen(steps);
  const ort = ortImVerlauf(verlauf, aktuell.id);
  const optRueck = { heute, kontext: optionen.kontext };

  // Zweig-Rücksprung: der Zweig des Schritts führt zurück und ist durchlaufen
  if (ort?.art === 'zweig' && ort.zweig.rueckSprungZu && ort.zweig.schritte.every(istErledigt)) {
    const ziel = ort.zweig.rueckSprungZu;
    const ausloeser = ort.zweig.schritte[ort.zweig.schritte.length - 1];
    steps = rueckSprungAnwenden(steps, ziel.id, ausloeser, 'ruecksprung', zeitpunkt, optRueck);
    return ergebnis(
      run,
      vorher,
      steps,
      `Rücksprung zu „${ziel.name}“ – weiterer Durchlauf gestartet.`,
      { art: 'zweig', zielId: ziel.id, ausloeserId: ausloeser.id, vorgaengerIds: [ausloeser.id], eintritte: eintritteVon(steps, run.steps) },
      rk,
    );
  }

  // Rücksprung im Hauptablauf: der Verlauf führt zurück und nichts ist mehr offen.
  // Auslöser ist der Schritt am Ende des Verlaufs mit dem spätesten Ist – endet
  // er mit einem Block, nicht unbedingt der gerade erledigte Schritt.
  const ende = ort && verlauf.rueckSprungZu && verlauf.schritte.every(istErledigt)
    ? ausloeserImHauptablauf(steps, verlauf, abgeschlossenerSchritt)
    : null;
  if (ende && verlauf.rueckSprungZu) {
    const ziel = verlauf.rueckSprungZu;
    steps = rueckSprungAnwenden(steps, ziel.id, ende.ausloeser, 'ruecksprung', zeitpunkt, optRueck);
    return ergebnis(
      run,
      vorher,
      steps,
      `Rücksprung zu „${ziel.name}“ – weiterer Durchlauf gestartet.`,
      {
        art: 'oben',
        zielId: ziel.id,
        ausloeserId: ende.ausloeser.id,
        vorgaengerIds: ende.vorgaenger.map((s) => s.id),
        eintritte: eintritteVon(steps, run.steps),
      },
      rk,
    );
  }

  return ergebnis(run, vorher, statusAbgleichen(steps), `„${aktuell.name}“: ${STEP_STATUS_LABEL[status]}`, null, rk);
}

/**
 * Die Schritte, mit denen nach einem Rücksprung der neue Durchlauf beginnt:
 * anstehend und zurückgesetzt (anderer Durchlauf) bzw. – noch nie begonnene
 * Zweiganfänge eines erneut betretenen Blocks – mit neuem Blockdurchgang.
 * Schritte, die nur nebenher an die Reihe kommen (etwa in einem Zweig, der
 * nach aufgehobenem Ausstieg weiterläuft), gehören nicht dazu.
 */
function eintritteVon(steps: RunStep[], alt: RunStep[]): ID[] {
  const vorher = new Map(alt.map((s) => [s.id, s]));
  return aktuelleSchritte({ steps })
    .filter((s) => {
      const a = vorher.get(s.id);
      return !a || a.durchlauf !== s.durchlauf || (a.blockDurchgang ?? 1) !== (s.blockDurchgang ?? 1);
    })
    .map((s) => s.id);
}

/** Wie ein erledigter Schritt wieder geöffnet wird. */
export type WiederOeffnenArt = 'korrektur' | 'erneut';

/**
 * Korrektur (Fehlbedienung) ist möglich, solange kein Nachfolger im Verlauf
 * bzw. Zweig ein Ist hat; sonst nur erneute Bearbeitung.
 */
export function wiederOeffnenArt(run: Pick<PlanRun, 'steps'>, step: Pick<RunStep, 'id'>): WiederOeffnenArt {
  const folge = folgeImVerlauf(verfolgen(run.steps), step.id) ?? [];
  return folge.some((s) => s.id !== step.id && s.istDatum) ? 'erneut' : 'korrektur';
}

/**
 * Öffnet einen erledigten bzw. übersprungenen Schritt wieder.
 *
 * * **Korrektur**: Ist leeren, Schritt „laufend“; Nachfolger, die dadurch nicht
 *   mehr anstehen, warten wieder (ihr fester Eingang entfällt beim Neuberechnen).
 *   Nur zulässig, solange kein Nachfolger ein Ist hat – sonst wird erneut bearbeitet.
 * * **Erneute Bearbeitung**: ab diesem Schritt beginnt ein weiterer Durchlauf
 *   (wie ein Rücksprung mit Grund „wieder geöffnet“), Eingang = heute bzw.
 *   `optionen.eingang`; der bisherige Durchlauf bleibt in der Historie.
 *
 * Ein abgeschlossener Lauf läuft danach wieder.
 */
export function wiederOeffnen(
  run: PlanRun,
  step: RunStep,
  modus?: WiederOeffnenArt,
  optionen: StatusOptionen = {},
): Abschluss {
  const aktuell = run.steps.find((s) => s.id === step.id) ?? step;
  const vorher = new Set(aktuelleSchritte(run).map((s) => s.id));
  const wieder: Partial<PlanRun> = run.status === 'abgeschlossen' ? { status: 'laufend' } : {};
  const laufend = { ...run, status: 'laufend' as const };
  const heute = optionen.heute ?? today();
  const zeitpunkt = optionen.zeitpunkt ?? new Date().toISOString();
  const rk: RueckKontext = { zeitpunkt, heute, kontext: optionen.kontext };
  if (!istErledigt(aktuell)) {
    return ergebnis(laufend, vorher, run.steps, `„${aktuell.name}“ ist nicht abgeschlossen.`, null, rk, wieder);
  }

  const art: WiederOeffnenArt = modus === 'erneut' ? 'erneut' : wiederOeffnenArt(run, aktuell);
  if (art === 'korrektur') {
    const steps = statusAbgleichen(
      run.steps.map((s) =>
        s.id === aktuell.id ? { ...s, status: 'laufend' as const, istDatum: null, abschlussInfo: null, nacharbeitSeite: null } : s,
      ),
    );
    return ergebnis(laufend, vorher, steps, `„${aktuell.name}“ wieder geöffnet.`, null, rk, wieder);
  }

  const steps = rueckSprungAnwenden(run.steps, aktuell.id, null, 'wieder_geoeffnet', zeitpunkt, {
    eingang: optionen.eingang ?? heute,
    heute,
    kontext: optionen.kontext,
  });
  return ergebnis(
    laufend,
    vorher,
    steps,
    `„${aktuell.name}“ wieder geöffnet – neuer Durchlauf begonnen.`,
    { art: 'wieder_geoeffnet', zielId: aktuell.id, ausloeserId: null, vorgaengerIds: [], eintritte: eintritteVon(steps, run.steps) },
    rk,
    wieder,
  );
}

/**
 * Ergänzt einen Schritt im laufenden Lauf (Einfügen siehe
 * `schrittImLaufEinfuegen` in ablauf.ts) und rückt den Lauf weiter wie jeder
 * Statuswechsel: Übernimmt der neue Schritt etwa den Ausstieg aus einem Block,
 * laufen die übrigen Zweige wieder weiter – ein dort entfallener Rücksprung
 * wird dann jetzt fällig und gleich ausgeführt (siehe ausstehendeRuecksprunge).
 * `naechste` nennt die neu anstehenden Schritte. Ist das Einfügen an dieser
 * Stelle unzulässig (siehe einfuegenMoeglich), bleibt der Lauf unverändert.
 */
export function schrittErgaenzen(
  run: PlanRun,
  nachId: ID | null,
  neu: RunStep,
  position: EinfuegePosition = 'danach',
  optionen: StatusOptionen = {},
): Abschluss {
  const heute = optionen.heute ?? today();
  const zeitpunkt = optionen.zeitpunkt ?? new Date().toISOString();
  if (!einfuegenMoeglich(run.steps, nachId, position)) {
    return {
      art: 'aenderung',
      aenderungen: [],
      meldung: 'Dort lässt sich kein Schritt einfügen – dahinter ist schon etwas erledigt.',
      naechste: [],
      ruecksprung: null,
      abgeschlossen: false,
    };
  }
  const vorher = new Set(aktuelleSchritte(run).map((s) => s.id));
  const steps = schrittImLaufEinfuegen(run.steps, nachId, neu, position, heute);
  return ergebnis(run, vorher, steps, `„${neu.name}“ eingefügt.`, null, { zeitpunkt, heute, kontext: optionen.kontext });
}
