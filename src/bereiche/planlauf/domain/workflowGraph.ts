/**
 * Ein Workflow als Ablaufbild – Grundlage des grafischen Workflow-Editors.
 *
 * Die Schritte liegen als Liste vor; ein Übergang ohne Ziel (`null`) führt zum
 * nächsten Schritt der Liste (im Zweig eines parallelen Blocks: des Zweigs).
 * Aufgelöst werden Ziele ausschließlich über `nachfolger` in ablauf.ts.
 * Daraus entsteht hier
 *  - der **Standardverlauf**: der Weg, den ein Planlauf nimmt, wenn jede
 *    Entscheidung mit ihrer ersten Antwort beantwortet wird (wie `pfad` in
 *    engine.ts) – flach als `haupt`, für das Bild als `hauptAnzeige`, in der
 *    ein paralleler Block eine einzige Stelle einnimmt,
 *  - je **paralleler Block** seine Zweige mit Standardweg, Abweichungen im
 *    Zweig und nicht erreichbaren Schritten,
 *  - die **Abweichungen**: Schritte (oder ganze Blöcke), die nur über eine
 *    andere Antwort erreicht werden (z. B. „Rückmeldung an Planer“), je mit der
 *    Stelle des Standardverlaufs, neben der sie stehen,
 *  - die **Kanten**: jeder Übergang mit aufgelöstem Ziel und seiner Wirkung.
 *
 * Dazu kommen die Bearbeitungen, die beim Einfügen, Entfernen und Umstellen den
 * übrigen Ablauf erhalten – auch über Blockgrenzen hinweg. Alles ist rein
 * fachlich und ohne Oberfläche; neue IDs werden von außen übergeben, damit die
 * Funktionen auch im StrictMode gefahrlos doppelt laufen können.
 */
import {
  bloeckeOrdnenMitHinweis,
  markerMitNamen,
  nachfolger,
  strukturVon,
  zieleFestschreiben,
  zieleVereinfachen,
  type Block,
  type Struktur,
} from './ablauf';
import { verlaufDerKette } from './engine';
import { STANDARD_ANTWORTEN, istPrueferRolle, type Antwort, type ID, type ProcessTemplateStep, type StepType } from './types';

export type NeueId = (prefix: string) => string;

/** Ziel eines Übergangs nach dem Auflösen: ein Schritt oder das Ende des Planlaufs. */
export type Ziel = ID | 'ende';

/** Ergebnis einer Bearbeitung, die den Ablauf hinter einem Block ändern kann. */
export interface Bearbeitung {
  steps: ProcessTemplateStep[];
  /** Hinweis für die Oberfläche (etwa: anderer Anschluss hinter einem Block); null = alles wie erwartet. */
  hinweis: string | null;
}

/** Hinweis, wenn `bloeckeOrdnenMitHinweis` den Ablauf hinter einem Block ändern musste. */
export const ANSCHLUSS_HINWEIS =
  'Hinter einem parallelen Block geht es jetzt mit einem anderen Schritt weiter als vorher – bitte den Ablauf prüfen.';

/* ------------------------------------------------------------------ */
/* Neue Schritte                                                       */
/* ------------------------------------------------------------------ */

/** „Ja“ und „Nein“; jede Antwort außer der ersten führt in Nacharbeit. */
export function standardAntworten(neueId: NeueId): Antwort[] {
  return STANDARD_ANTWORTEN.map((text, i) => ({ id: neueId('ant'), text, ziel: null, nacharbeit: i > 0 }));
}

/** Leerer Schritt – Entscheidungen mit den Antworten „Ja“ und „Nein“. */
export function neuerSchritt(typ: StepType, neueId: NeueId): ProcessTemplateStep {
  return {
    id: neueId('ts'),
    name: '',
    typ,
    roleName: '',
    fristTage: 5,
    beschreibung: '',
    antworten: typ === 'entscheidung' ? standardAntworten(neueId) : [],
    naechster: null,
    nachweis: 'keine',
    mailFrage: false,
    mailVorlageId: null,
    versandAnliegen: null,
    parallel: null,
  };
}

/* ------------------------------------------------------------------ */
/* Kanten                                                              */
/* ------------------------------------------------------------------ */

/**
 * Wirkung eines Übergangs (siehe `Folge` in ablauf.ts): weiter mit einem
 * Schritt (außerhalb eines Blocks ggf. Betreten eines Blocks, im Zweig ein
 * Schritt desselben Zweigs), Ende des Planlaufs, Zweig beendet (weiter am
 * Anschluss hinter dem Block) oder Ausstieg aus dem Block.
 */
export type KantenArt = 'schritt' | 'ende' | 'zweigende' | 'ausstieg';

/** Ein Übergang von einem Schritt zum nächsten. */
export interface Kante {
  von: ID;
  nach: Ziel;
  /** Antwort einer Entscheidung; null bei „weiter mit“ einer Aufgabe. */
  antwortId: ID | null;
  /** Antworttext, sonst null. */
  text: string | null;
  art: KantenArt;
  /** Im Zweig: Das Ziel liegt in einem anderen Zweig desselben Blocks – nicht zulässig, wirkt wie „Zweig beendet“. */
  unzulaessig: boolean;
  /**
   * Teil des Standardverlaufs: der Übergang zur nächsten Stelle des
   * Standardverlaufs (in einen Block hinein: zu einem seiner Schritte), vom
   * letzten Schritt zum Ende, im Zweig zum nächsten Schritt des Standardwegs
   * bzw. dessen Abschluss.
   */
  standard: boolean;
}

/**
 * Löst ein Ziel über `nachfolger` (ablauf.ts) auf: `null` ist der nächste
 * Schritt der Liste bzw. des Zweigs, ein unbekanntes Ziel beendet den Ablauf
 * wie in `verlaufDerKette`. Das Ende eines Zweigs („Zweig beendet“) führt zum
 * Anschluss hinter dem Block, ein Ausstieg zu seinem Ziel.
 */
export function zielAufloesen(
  steps: ProcessTemplateStep[],
  index: number,
  ziel: ID | 'ende' | null,
  struktur: Struktur = strukturVon(steps),
): Ziel {
  const f = nachfolger(steps, index, ziel, struktur);
  if (f.art === 'schritt' || f.art === 'ausstieg') return steps[f.index].id;
  if (f.art === 'zweigende') {
    const lage = struktur.lage[index];
    return lage ? (steps[lage.block.ende]?.id ?? 'ende') : 'ende';
  }
  return 'ende';
}

/** Alle Übergänge eines Schritts – bei Entscheidungen einer je Antwort. */
export function kantenVon(
  steps: ProcessTemplateStep[],
  index: number,
  struktur: Struktur = strukturVon(steps),
): Omit<Kante, 'standard'>[] {
  const step = steps[index];
  const kante = (ziel: ID | 'ende' | null, antwortId: ID | null, text: string | null): Omit<Kante, 'standard'> => {
    const f = nachfolger(steps, index, ziel, struktur);
    return {
      von: step.id,
      nach: zielAufloesen(steps, index, ziel, struktur),
      antwortId,
      text,
      art: f.art,
      unzulaessig: f.art === 'zweigende' && f.unzulaessig,
    };
  };
  if (step.typ === 'entscheidung' && step.antworten.length > 0) {
    return step.antworten.map((a) => kante(a.ziel, a.id, a.text));
  }
  return [kante(step.naechster, null, null)];
}

/** Der Übergang, dem der Standardverlauf folgt: die erste Antwort bzw. „weiter mit“. */
export function standardKante(steps: ProcessTemplateStep[], index: number): Omit<Kante, 'standard'> {
  return kantenVon(steps, index)[0];
}

/* ------------------------------------------------------------------ */
/* Gliederung für das Ablaufbild                                       */
/* ------------------------------------------------------------------ */

/** Stelle im Bild des Standardverlaufs: ein Schritt oder ein ganzer paralleler Block. */
export type Anzeige = ID | { block: ID };

/** Ein Zweig eines parallelen Blocks. */
export interface ZweigGliederung {
  /** Position des Zweigs im Block (0 … n−1). */
  zweig: number;
  /** Name des Zweigs; '' = ohne Namen (siehe `zweigTitel` in ablauf.ts). */
  name: string;
  /** Alle Schritte des Zweigs in Listenreihenfolge. */
  schritte: ID[];
  /** Standardweg im Zweig: ab seinem ersten Schritt mit der jeweils ersten Antwort. */
  standard: ID[];
  /** So endet der Standardweg: Zweig beendet, Ausstieg aus dem Block oder Schleife im Zweig. */
  schluss: { art: 'zweigende' } | { art: 'ausstieg'; nach: ID } | { art: 'rueck'; nach: ID };
  /** Schritte des Zweigs, die nur über andere Antworten erreicht werden. */
  abweichungen: ID[];
  /** Schritte des Zweigs, zu denen im Zweig kein Übergang führt. */
  unerreichbar: ID[];
}

export interface BlockGliederung {
  block: ID;
  /** Name des Blocks; '' = ohne Namen (siehe `blockTitel` in ablauf.ts). */
  name: string;
  /** Erster Schritt des Blocks – über ihn wird der Block betreten. */
  erster: ID;
  zweige: ZweigGliederung[];
  /** Schritt hinter dem Block (Anschluss); 'ende' = der Planlauf endet nach dem Block. */
  anschluss: Ziel;
  /** Der Block liegt im Standardverlauf. */
  imStandard: boolean;
  /** Der Block wird überhaupt erreicht (im Standardverlauf oder als Abweichung). */
  erreichbar: boolean;
}

export interface Gliederung {
  /** Schritte des Standardverlaufs in ihrer Reihenfolge, flach (Blöcke: Standardweg von Zweig 1, 2 …). */
  haupt: ID[];
  /** Der Standardverlauf für das Bild: Schritte und parallele Blöcke als je eine Stelle. */
  hauptAnzeige: Anzeige[];
  /** Der Standardverlauf endet mit einem Rücksprung zu diesem Schritt (Schleife). */
  rueckSprungZu: ID | null;
  /**
   * Schritte bzw. ganze Blöcke (dann die Block-ID, siehe `bloecke`), die nur
   * über andere Antworten erreicht werden; `anker` ist die Stelle in
   * `hauptAnzeige`, neben der sie stehen. Abweichungen innerhalb eines Zweigs
   * stehen beim Zweig.
   */
  abweichungen: { id: ID; anker: number }[];
  /** Alle Schritte, zu denen kein Übergang führt (auch innerhalb ihres Zweigs). */
  unerreichbar: ID[];
  /** Je paralleler Block seine Gliederung. */
  bloecke: Record<ID, BlockGliederung>;
  kanten: Kante[];
  /** Zahl aller Abweichungen – oben und in den Zweigen. */
  abweichungenGesamt: number;
}

/** Die Stelle ist ein paralleler Block. */
export function istBlockAnzeige(e: Anzeige): e is { block: ID } {
  return typeof e !== 'string';
}

function zweigGliedern(
  steps: ProcessTemplateStep[],
  roh: Omit<Kante, 'standard'>[][],
  st: Struktur,
  b: Block,
  zweig: number,
): ZweigGliederung {
  const idx = b.zweige[zweig];
  const schritte = idx.map((k) => steps[k].id);
  const standard: ID[] = [];
  let schluss: ZweigGliederung['schluss'] = { art: 'zweigende' };
  const gesehen = new Set<number>();
  let j = idx[0];
  for (let schutz = 0; schutz <= idx.length; schutz++) {
    gesehen.add(j);
    standard.push(steps[j].id);
    const k = roh[j][0];
    if (k.art === 'schritt' && k.nach !== 'ende') {
      const n = st.index.get(k.nach)!;
      if (gesehen.has(n)) {
        schluss = { art: 'rueck', nach: k.nach };
        break;
      }
      j = n;
      continue;
    }
    if (k.art === 'ausstieg' && k.nach !== 'ende') schluss = { art: 'ausstieg', nach: k.nach };
    break;
  }
  // Abweichungen im Zweig: vom Standardweg aus über die übrigen Antworten
  const erreicht = new Set(standard);
  const abweichungen: ID[] = [];
  const schlange = [...standard];
  while (schlange.length > 0) {
    const id = schlange.shift()!;
    for (const k of roh[st.index.get(id)!]) {
      if (k.art !== 'schritt' || k.nach === 'ende' || erreicht.has(k.nach)) continue;
      erreicht.add(k.nach);
      abweichungen.push(k.nach);
      schlange.push(k.nach);
    }
  }
  return {
    zweig,
    name: b.zweigNamen[zweig] ?? '',
    schritte,
    standard,
    schluss,
    abweichungen,
    unerreichbar: schritte.filter((id) => !erreicht.has(id)),
  };
}

export function gliedern(steps: ProcessTemplateStep[]): Gliederung {
  if (steps.length === 0) {
    return {
      haupt: [],
      hauptAnzeige: [],
      rueckSprungZu: null,
      abweichungen: [],
      unerreichbar: [],
      bloecke: {},
      kanten: [],
      abweichungenGesamt: 0,
    };
  }

  const st = strukturVon(steps);
  const verlauf = verlaufDerKette(steps);
  const haupt = verlauf.schritte.map((s) => s.id);
  const hauptAnzeige: Anzeige[] = verlauf.abschnitte.map((a) => (a.art === 'schritt' ? a.step.id : { block: a.block }));
  const roh = steps.map((_, i) => kantenVon(steps, i, st));
  const indexVon = (id: ID) => st.index.get(id)!;
  const blockVon = (id: ID): ID | null => {
    const k = st.index.get(id);
    return k === undefined ? null : (st.lage[k]?.block.id ?? null);
  };

  const imStandard = new Set(hauptAnzeige.filter(istBlockAnzeige).map((e) => e.block));
  const bloecke: Record<ID, BlockGliederung> = {};
  for (const b of st.bloecke.values()) {
    bloecke[b.id] = {
      block: b.id,
      name: b.name,
      erster: steps[b.start].id,
      zweige: b.zweige.map((_, z) => zweigGliedern(steps, roh, st, b, z)),
      anschluss: steps[b.ende]?.id ?? 'ende',
      imStandard: imStandard.has(b.id),
      erreichbar: false,
    };
  }

  // Erreichbarkeit und Anker: vom Standardverlauf aus in Breitensuche über Einheiten (Schritt bzw. Block)
  const anzeigePos = new Map<ID, number>(hauptAnzeige.map((e, k) => [istBlockAnzeige(e) ? e.block : e, k]));
  const einheit = (id: ID) => blockVon(id) ?? id;
  const ausgaenge = (u: ID): Ziel[] => {
    const b = bloecke[u];
    if (!b) return roh[indexVon(u)].map((k) => k.nach);
    // Ein Block führt über seine Ausstiege und – wenn ein Zweig endet – zum Anschluss
    return b.zweige.flatMap((z) =>
      [...z.standard, ...z.abweichungen].flatMap((id) =>
        roh[indexVon(id)].filter((k) => k.art === 'ausstieg' || k.art === 'zweigende').map((k) => k.nach),
      ),
    );
  };
  const anker = new Map<ID, number>();
  const reihenfolge: ID[] = [];
  const bekannt = new Set<ID>(anzeigePos.keys());
  const schlange: ID[] = [...anzeigePos.keys()];
  while (schlange.length > 0) {
    const u = schlange.shift()!;
    const eigenerAnker = anzeigePos.get(u) ?? anker.get(u) ?? 0;
    for (const z of ausgaenge(u)) {
      if (z === 'ende') continue;
      const t = einheit(z);
      if (bekannt.has(t)) continue;
      bekannt.add(t);
      anker.set(t, eigenerAnker);
      reihenfolge.push(t);
      schlange.push(t);
    }
  }
  for (const id of bekannt) if (bloecke[id]) bloecke[id].erreichbar = true;

  const abweichungen = reihenfolge
    .map((id, entdeckt) => ({ id, anker: anker.get(id)!, entdeckt }))
    .sort((a, b) => a.anker - b.anker || a.entdeckt - b.entdeckt)
    .map(({ id, anker: a }) => ({ id, anker: a }));

  const unerreichbar = steps
    .filter((s) => {
      const b = blockVon(s.id);
      if (!b) return !bekannt.has(s.id);
      return !bekannt.has(b) || bloecke[b].zweige.some((z) => z.unerreichbar.includes(s.id));
    })
    .map((s) => s.id);

  // Standardübergänge
  const imZweig = new Map<ID, { z: ZweigGliederung; j: number }>();
  for (const b of Object.values(bloecke)) for (const z of b.zweige) z.standard.forEach((id, j) => imZweig.set(id, { z, j }));
  const istStandard = (id: ID, k: Omit<Kante, 'standard'>): boolean => {
    const zw = imZweig.get(id);
    // Im Zweig: zum nächsten Schritt des Standardwegs; am letzten sein Abschluss (Zweigende, Ausstieg, Schleife)
    if (zw) return zw.j + 1 < zw.z.standard.length ? k.art === 'schritt' && k.nach === zw.z.standard[zw.j + 1] : true;
    if (blockVon(id)) return false;
    const p = anzeigePos.get(id);
    if (p === undefined) return false;
    const naechste = hauptAnzeige[p + 1];
    if (naechste === undefined) return k.nach === 'ende';
    if (!istBlockAnzeige(naechste)) return k.nach === naechste;
    return k.nach !== 'ende' && blockVon(k.nach) === naechste.block;
  };
  const kanten: Kante[] = steps.flatMap((s, i) => roh[i].map((k, nr) => ({ ...k, standard: nr === 0 && istStandard(s.id, k) })));

  const abweichungenGesamt =
    abweichungen.length +
    Object.values(bloecke)
      .filter((b) => b.erreichbar)
      .reduce((n, b) => n + b.zweige.reduce((m, z) => m + z.abweichungen.length, 0), 0);

  return {
    haupt,
    hauptAnzeige,
    rueckSprungZu: verlauf.rueckSprungZu?.id ?? null,
    abweichungen,
    unerreichbar,
    bloecke,
    kanten,
    abweichungenGesamt,
  };
}

/** Summe der Fristen im Standardverlauf; je paralleler Block zählt der längste Zweig. */
export function dauerImStandardverlauf(steps: ProcessTemplateStep[]): number {
  const frist = (liste: ProcessTemplateStep[]) => liste.reduce((summe, s) => summe + s.fristTage, 0);
  return verlaufDerKette(steps).abschnitte.reduce(
    (summe, a) =>
      summe + (a.art === 'schritt' ? a.step.fristTage : Math.max(0, ...a.zweige.map((z) => frist(z.schritte)))),
    0,
  );
}

/** Zahl der parallelen Blöcke. */
export function anzahlBloecke(steps: ProcessTemplateStep[]): number {
  return new Set(steps.filter((s) => s.parallel).map((s) => s.parallel!.block)).size;
}

/* ------------------------------------------------------------------ */
/* Bearbeiten                                                          */
/* ------------------------------------------------------------------ */

/**
 * Schreibt jedes „nächster Schritt“ (null) als feste ID bzw. Ende fest (im
 * Zweig: „Zweig beendet“ als `'ende'`). Danach darf die Liste umgestellt
 * werden, ohne dass sich der Ablauf ändert; `vereinfachen` macht daraus wieder
 * kurze Verweise. Beides über ablauf.ts.
 */
function festschreiben(steps: ProcessTemplateStep[]): ProcessTemplateStep[] {
  return zieleFestschreiben(steps);
}

/** Feste Verweise auf den nächsten Schritt der Liste bzw. des Zweigs werden wieder zu null. */
function vereinfachen(steps: ProcessTemplateStep[]): ProcessTemplateStep[] {
  return zieleVereinfachen(steps);
}

/** Stellt die Blockregeln her (bloeckeOrdnen) und meldet, wenn sich dabei der Ablauf hinter einem Block ändert. */
function geordnet(steps: ProcessTemplateStep[], hinweis: string | null = null): Bearbeitung {
  const o = bloeckeOrdnenMitHinweis(steps);
  return { steps: o.steps, hinweis: o.anschlussGeaendert.length > 0 ? ANSCHLUSS_HINWEIS : hinweis };
}

/** Ersetzt in allen Übergängen eines Schritts ein Ziel nach der Vorschrift `f`. */
function zieleUmbiegen(s: ProcessTemplateStep, f: (z: ID | 'ende' | null) => ID | 'ende' | null): ProcessTemplateStep {
  return { ...s, naechster: f(s.naechster), antworten: s.antworten.map((a) => ({ ...a, ziel: f(a.ziel) })) };
}

/** Der Standardübergang eines (fest geschriebenen) Schritts. */
function standardZiel(s: ProcessTemplateStep): ID | 'ende' | null {
  return s.typ === 'entscheidung' && s.antworten.length > 0 ? s.antworten[0].ziel : s.naechster;
}

/** Setzt den Standardübergang (erste Antwort bzw. „weiter mit“); `alle` setzt alle Antworten. */
function mitStandardZiel(s: ProcessTemplateStep, ziel: ID | 'ende' | null, alle = false): ProcessTemplateStep {
  if (s.typ === 'entscheidung' && s.antworten.length > 0) {
    return { ...s, naechster: null, antworten: s.antworten.map((a, n) => (n === 0 || alle ? { ...a, ziel } : a)) };
  }
  return { ...s, naechster: ziel };
}

/** Setzt das Ziel eines Übergangs (Antwort oder „weiter mit“). */
export function zielSetzen(
  steps: ProcessTemplateStep[],
  vonId: ID,
  antwortId: ID | null,
  ziel: ID | 'ende' | null,
): ProcessTemplateStep[] {
  return steps.map((s) => {
    if (s.id !== vonId) return s;
    if (antwortId === null) return { ...s, naechster: ziel };
    return { ...s, antworten: s.antworten.map((a) => (a.id === antwortId ? { ...a, ziel } : a)) };
  });
}

/**
 * Fügt einen neuen Schritt in einen Übergang ein: vorher → neu → bisheriges
 * Ziel. Der neue Schritt steht in der Liste direkt hinter dem Ausgangsschritt
 * und gehört zu dessen Zweig; alle übrigen Übergänge behalten ihr Ziel.
 */
export function einfuegen(
  steps: ProcessTemplateStep[],
  vonId: ID,
  antwortId: ID | null,
  neu: ProcessTemplateStep,
  /** Neue Entscheidung: alle Antworten führen zunächst zum bisherigen Ziel. */
  alleAntworten = false,
): ProcessTemplateStep[] {
  const i = steps.findIndex((s) => s.id === vonId);
  if (i < 0) return [...steps, { ...neu, parallel: null }];
  // Feste Ziele: das Einfügen ändert sonst die Bedeutung von „nächster Schritt“
  const fest = festschreiben(steps);
  const von = fest[i];
  const antwort =
    von.typ === 'entscheidung' && von.antworten.length > 0
      ? (von.antworten.find((a) => a.id === antwortId) ?? von.antworten[0])
      : undefined;
  // Der neue Schritt führt dorthin, wohin der Übergang bisher führte
  const bisher: ID | 'ende' = (antwort ? antwort.ziel : von.naechster) ?? 'ende';
  const eingefuegt = mitStandardZiel({ ...neu, parallel: von.parallel ?? null }, bisher, alleAntworten);
  const angepasst: ProcessTemplateStep = antwort
    ? { ...von, antworten: von.antworten.map((a) => (a.id === antwort.id ? { ...a, ziel: eingefuegt.id } : a)) }
    : { ...von, naechster: eingefuegt.id };

  return vereinfachen([...fest.slice(0, i), angepasst, eingefuegt, ...fest.slice(i + 1)]);
}

/** Fügt einen neuen ersten Schritt ein; er führt zum bisherigen ersten Schritt. */
export function einfuegenAmAnfang(steps: ProcessTemplateStep[], neu: ProcessTemplateStep): ProcessTemplateStep[] {
  const eingefuegt =
    neu.typ === 'entscheidung' && neu.antworten.length > 0
      ? { ...neu, parallel: null, naechster: null, antworten: neu.antworten.map((a) => ({ ...a, ziel: null })) }
      : { ...neu, parallel: null, naechster: null };
  return [eingefuegt, ...steps];
}

/**
 * Setzt einen Schritt hinter einen Block (als neuen Anschluss, an Listenstelle
 * `ende`). Er führt zum bisherigen Anschluss; Ausstiege aus dem Block, die
 * zum bisherigen Anschluss führten („weiter nach dem Block“), führen nun zu
 * ihm. `fest`: Ziele fest geschrieben; `schritt` bringt seine Übergänge mit.
 */
function hinterBlockSetzen(fest: ProcessTemplateStep[], b: Block, schritt: ProcessTemplateStep): ProcessTemplateStep[] {
  const anschluss: ID | 'ende' = fest[b.ende]?.id ?? 'ende';
  const neu = mitStandardZiel({ ...schritt, parallel: null }, anschluss);
  const angepasst = fest.map((s, k) =>
    k >= b.start && k < b.ende && anschluss !== 'ende'
      ? zieleUmbiegen(s, (z) => (z === anschluss ? neu.id : z))
      : s,
  );
  return [...angepasst.slice(0, b.ende), neu, ...angepasst.slice(b.ende)];
}

/** Fügt einen neuen Schritt hinter einem parallelen Block ein (siehe hinterBlockSetzen). */
export function einfuegenNachBlock(steps: ProcessTemplateStep[], blockId: ID, neu: ProcessTemplateStep): ProcessTemplateStep[] {
  const b = strukturVon(steps).bloecke.get(blockId);
  if (!b) return steps;
  const n = neu.typ === 'entscheidung' && neu.antworten.length > 0 ? mitStandardZiel(neu, null, true) : neu;
  return vereinfachen(hinterBlockSetzen(festschreiben(steps), b, n));
}

/**
 * Fügt einen Schritt am Anfang eines Zweigs ein; er führt zum bisherigen
 * ersten Schritt des Zweigs. Beim ersten Zweig wird der Block nun über den
 * neuen Schritt betreten – Verweise von außen auf den bisherigen ersten
 * Schritt führen zu ihm.
 */
export function einfuegenAmZweiganfang(
  steps: ProcessTemplateStep[],
  blockId: ID,
  zweig: number,
  neu: ProcessTemplateStep,
  /** Neue Entscheidung: alle Antworten führen zunächst zum bisherigen ersten Schritt. */
  alleAntworten = false,
): ProcessTemplateStep[] {
  const st = strukturVon(steps);
  const b = st.bloecke.get(blockId);
  const idx = b?.zweige[zweig];
  if (!b || !idx || idx.length === 0) return steps;
  const fest = festschreiben(steps);
  const erster = fest[idx[0]];
  // Der neue Schritt übernimmt Block und Zweig samt ihren Namen
  const eingefuegt = mitStandardZiel({ ...neu, parallel: { ...erster.parallel! } }, erster.id, alleAntworten);
  const angepasst =
    idx[0] === b.start
      ? fest.map((s, k) => (st.lage[k]?.block.id === blockId ? s : zieleUmbiegen(s, (z) => (z === erster.id ? eingefuegt.id : z))))
      : fest;
  return vereinfachen([...angepasst.slice(0, idx[0]), eingefuegt, ...angepasst.slice(idx[0])]);
}

/** Wo ein neuer Schritt eingefügt wird. */
export type Einfuegestelle =
  /** Vor dem ersten Schritt. */
  | { art: 'anfang' }
  /** In einen Übergang (Antwort bzw. „weiter mit“) hinein. */
  | { art: 'uebergang'; vonId: ID; antwortId: ID | null }
  /** Hinter einem parallelen Block. */
  | { art: 'nachBlock'; block: ID }
  /** Am Anfang eines Zweigs (Position im Block). */
  | { art: 'zweiganfang'; block: ID; zweig: number };

/** Fügt einen neuen Schritt an einer Einfügestelle ein (neue Entscheidungen: alle Antworten zum bisherigen Ziel). */
export function einfuegenAn(steps: ProcessTemplateStep[], stelle: Einfuegestelle, neu: ProcessTemplateStep): ProcessTemplateStep[] {
  if (stelle.art === 'anfang') return einfuegenAmAnfang(steps, neu);
  if (stelle.art === 'nachBlock') return einfuegenNachBlock(steps, stelle.block, neu);
  if (stelle.art === 'zweiganfang') return einfuegenAmZweiganfang(steps, stelle.block, stelle.zweig, neu, true);
  return einfuegen(steps, stelle.vonId, stelle.antwortId, neu, true);
}

/**
 * Entfernt einen Schritt, ohne die Blockregeln wiederherzustellen (siehe
 * `entfernen`). Ergebnis mit vereinfachten Zielen.
 */
function entfernenRoh(steps: ProcessTemplateStep[], id: ID): ProcessTemplateStep[] {
  const i = steps.findIndex((s) => s.id === id);
  if (i < 0) return steps;
  const struktur = strukturVon(steps);
  const lage = struktur.lage[i];
  const fest = festschreiben(steps);
  const entfernt = fest[i];
  // Fest geschrieben: das Ziel des Standardübergangs (im Zweig: 'ende' = Zweig beendet)
  const weiterZu: ID | 'ende' = standardZiel(entfernt) ?? 'ende';
  const ersatz: ID | 'ende' = weiterZu === id ? 'ende' : weiterZu;
  /*
   * Erster Schritt eines Zweigs: Der Zweig beginnt danach bei seinem
   * Standardziel. Führte der Schritt aus dem Zweig hinaus (Zweig beendet,
   * Ausstieg), waren die übrigen Schritte des Zweigs nur über ihn erreichbar –
   * sie verlassen den Block (ans Listenende) und sind dann nicht erreichbar.
   */
  const zweigRest = lage && lage.pos === 0 ? lage.block.zweige[lage.zweig].map((k) => steps[k].id).filter((x) => x !== id) : [];
  const neuerAnfang = ersatz !== 'ende' && zweigRest.includes(ersatz) ? ersatz : null;
  const verlassen = new Set(neuerAnfang ? [] : zweigRest);
  // Verweise von außerhalb des Blocks führen weiter in den Block
  const blockErsatz = lage
    ? (lage.block.zweige.flat().map((k) => steps[k].id).find((x) => x !== id && !verlassen.has(x)) ?? ersatz)
    : ersatz;
  let rest = fest
    .map((s, k) => ({ s, k }))
    .filter(({ s }) => s.id !== id)
    .map(({ s, k }) => {
      const eigene = struktur.lage[k];
      const gleicherZweig = Boolean(lage && eigene && eigene.block === lage.block && eigene.zweig === lage.zweig);
      const andererZweig = Boolean(lage && eigene && eigene.block === lage.block && !gleicherZweig);
      const ziel = !lage || gleicherZweig ? ersatz : andererZweig ? 'ende' : blockErsatz;
      const ausserhalb = !lage || !eigene || eigene.block !== lage.block;
      // Ein Verweis, der nun auf den Schritt selbst zeigte, führt zum nächsten der Liste
      const umgebogen = zieleUmbiegen(s, (z) => {
        if (z === id) return ziel === s.id ? null : ziel;
        return ausserhalb && z !== null && verlassen.has(z) ? blockErsatz : z;
      });
      return verlassen.has(s.id) ? { ...umgebogen, parallel: null } : umgebogen;
    });
  if (neuerAnfang) {
    const start = rest.find((s) => s.id === neuerAnfang)!;
    const ohne = rest.filter((s) => s !== start);
    const pos = ohne.findIndex((s) => zweigRest.includes(s.id));
    if (pos >= 0) rest = [...ohne.slice(0, pos), start, ...ohne.slice(pos)];
  } else if (verlassen.size > 0) {
    rest = [...rest.filter((s) => !verlassen.has(s.id)), ...rest.filter((s) => verlassen.has(s.id))];
  }
  if (i === 0 && !lage && ersatz !== 'ende') {
    const start = rest.find((s) => s.id === ersatz);
    if (start) rest = [start, ...rest.filter((s) => s !== start)];
  }
  return vereinfachen(rest);
}

/**
 * Entfernt einen Schritt. Übergänge, die zu ihm führten, führen danach dorthin
 * weiter, wohin er im Standardverlauf geführt hat – der Ablauf reißt nicht ab.
 * War er der erste Schritt, beginnt der Ablauf bei seinem Ziel. Bei einem
 * Schritt eines Blocks gilt das innerhalb seines Zweigs; Verweise von außen
 * führen weiter in den Block. Zuletzt werden die Blockregeln wiederhergestellt
 * (ein Block mit nur noch einem Zweig wird aufgelöst).
 */
export function entfernenMitHinweis(steps: ProcessTemplateStep[], id: ID): Bearbeitung {
  if (!steps.some((s) => s.id === id)) return { steps, hinweis: null };
  return geordnet(entfernenRoh(steps, id));
}

export function entfernen(steps: ProcessTemplateStep[], id: ID): ProcessTemplateStep[] {
  return entfernenMitHinweis(steps, id).steps;
}

/* ---------------------------- parallele Blöcke ---------------------------- */

/** Einheiten einer Liste mit zusammenhängenden Blöcken: Einzelschritte und ganze Blöcke. */
interface Einheit {
  /** Schritt-ID bzw. Block-ID. */
  key: ID;
  block: boolean;
  schritte: ProcessTemplateStep[];
}

function einheitenVon(liste: ProcessTemplateStep[]): Einheit[] {
  const ergebnis: Einheit[] = [];
  for (const s of liste) {
    const b = s.parallel?.block ?? null;
    const letzte = ergebnis[ergebnis.length - 1];
    if (b && letzte?.block && letzte.key === b) letzte.schritte.push(s);
    else ergebnis.push({ key: b ?? s.id, block: Boolean(b), schritte: [s] });
  }
  return ergebnis;
}

/**
 * Sorgt dafür, dass hinter dem Block `blockId` die Einheit mit `ziel` steht
 * (bzw. bei `'ende'` das Listenende), ohne den übrigen Ablauf zu ändern. Die
 * Ziele sind fest geschrieben; dann zählt die Lage nur noch für den ersten
 * Schritt und für den Anschluss jedes Blocks. Darum wird nur umgestellt, wenn
 * dabei weder der Beginn noch der Anschluss eines anderen Blocks wechselt.
 */
function anschlussHerstellen(liste: ProcessTemplateStep[], blockId: ID, ziel: ID | 'ende'): ProcessTemplateStep[] | null {
  const e = einheitenVon(liste);
  const bi = e.findIndex((x) => x.block && x.key === blockId);
  if (bi < 0) return null;
  const flach = (reihe: Einheit[]) => reihe.flatMap((x) => x.schritte);
  const vorBlock = (k: number) => k > 0 && e[k - 1].block;
  if (ziel === 'ende') {
    if (bi === e.length - 1) return liste;
    // Den Block ans Listenende stellen
    if (bi > 0 && !vorBlock(bi) && !e[e.length - 1].block) return flach([...e.slice(0, bi), ...e.slice(bi + 1), e[bi]]);
    return null;
  }
  const zi = e.findIndex((x) => x.schritte.some((s) => s.id === ziel));
  if (zi < 0 || zi === bi) return null;
  if (zi === bi + 1) return liste;
  // a) Die Ziel-Einheit (ein Einzelschritt) direkt hinter den Block holen
  if (zi > 0 && !e[zi].block && !vorBlock(zi)) {
    const ohne = e.filter((_, k) => k !== zi);
    const b = ohne.indexOf(e[bi]);
    return flach([...ohne.slice(0, b + 1), e[zi], ...ohne.slice(b + 1)]);
  }
  // b) Den Block direkt vor die Ziel-Einheit stellen
  if (bi > 0 && !vorBlock(bi) && zi > 0 && !vorBlock(zi)) {
    const ohne = e.filter((_, k) => k !== bi);
    const z = ohne.indexOf(e[zi]);
    return flach([...ohne.slice(0, z), e[bi], ...ohne.slice(z)]);
  }
  return null;
}

const NICHT_PARALLEL =
  'Das geht an dieser Stelle nicht, ohne den übrigen Ablauf zu ändern – der bisherige Nachfolger lässt sich nicht hinter den Block stellen.';

/**
 * „Parallel dazu ausführen“: Aus einem Schritt außerhalb von Blöcken wird ein
 * paralleler Block – der Schritt ist Zweig 1, der neue Schritt Zweig 2. Beide
 * enden mit „Zweig beendet“; hinter dem Block geht es dort weiter, wohin der
 * Schritt bisher im Standardverlauf führte. Andere Antworten des Schritts
 * führen nun aus dem Block heraus (Ausstieg).
 */
export function parallelDazu(steps: ProcessTemplateStep[], id: ID, neu: ProcessTemplateStep, blockId: ID): Bearbeitung {
  const st = strukturVon(steps);
  const i = st.index.get(id);
  if (i === undefined || st.lage[i]) return { steps, hinweis: null };
  const fest = festschreiben(steps);
  const x = fest[i];
  const bisher: ID | 'ende' = standardZiel(x) ?? 'ende';
  if (bisher === id) return { steps, hinweis: NICHT_PARALLEL };
  const xNeu = mitStandardZiel({ ...x, parallel: { block: blockId, zweig: 0 } }, 'ende');
  const yNeu = mitStandardZiel({ ...neu, parallel: { block: blockId, zweig: 1 } }, 'ende', true);
  const liste = anschlussHerstellen([...fest.slice(0, i), xNeu, yNeu, ...fest.slice(i + 1)], blockId, bisher);
  if (!liste) return { steps, hinweis: NICHT_PARALLEL };
  return geordnet(vereinfachen(liste));
}

/**
 * Neuer paralleler Block mit zwei neuen Schritten an einer Einfügestelle
 * außerhalb von Blöcken (Menü „Parallele Zweige“).
 */
export function parallelBlockEinfuegen(
  steps: ProcessTemplateStep[],
  stelle: Einfuegestelle,
  a: ProcessTemplateStep,
  b: ProcessTemplateStep,
  blockId: ID,
): Bearbeitung {
  if (steps.length === 0) {
    return {
      steps: [
        { ...a, parallel: { block: blockId, zweig: 0 } },
        { ...b, parallel: { block: blockId, zweig: 1 } },
      ],
      hinweis: null,
    };
  }
  if (stelle.art === 'zweiganfang') return { steps, hinweis: 'Parallele Blöcke lassen sich nicht ineinander schachteln.' };
  if (stelle.art === 'uebergang') {
    const von = steps.find((s) => s.id === stelle.vonId);
    if (von?.parallel) return { steps, hinweis: 'Parallele Blöcke lassen sich nicht ineinander schachteln.' };
  }
  const mitA = einfuegenAn(steps, stelle, a);
  return parallelDazu(mitA, a.id, b, blockId);
}

/** Fügt einem Block einen weiteren Zweig mit einem neuen Schritt hinzu („Zweig beendet“ am Ende). */
export function zweigHinzufuegen(steps: ProcessTemplateStep[], blockId: ID, neu: ProcessTemplateStep): Bearbeitung {
  const st = strukturVon(steps);
  const b = st.bloecke.get(blockId);
  if (!b) return { steps, hinweis: null };
  const nr = Math.max(...b.zweige.map((idx) => steps[idx[0]].parallel!.zweig)) + 1;
  const fest = festschreiben(steps);
  const eingefuegt = mitStandardZiel({ ...neu, parallel: { block: blockId, zweig: nr } }, 'ende', true);
  return geordnet(vereinfachen([...fest.slice(0, b.ende), eingefuegt, ...fest.slice(b.ende)]));
}

/**
 * Benennt einen Block (z. B. „Versand“); der Name steht an jedem Schritt des
 * Blocks. Leer = ohne Namen. Getippt wird ungekürzt, `bereinigen` kürzt.
 */
export function blockBenennen(steps: ProcessTemplateStep[], blockId: ID, name: string): ProcessTemplateStep[] {
  return steps.map((s) =>
    s.parallel?.block === blockId ? { ...s, parallel: markerMitNamen(s.parallel, name, s.parallel.zweigName) } : s,
  );
}

/** Benennt einen Zweig (`zweig`: die Zweignummer am Marker); der Name steht an jedem Schritt des Zweigs. */
export function zweigBenennen(steps: ProcessTemplateStep[], blockId: ID, zweig: number, name: string): ProcessTemplateStep[] {
  return steps.map((s) =>
    s.parallel?.block === blockId && s.parallel.zweig === zweig
      ? { ...s, parallel: markerMitNamen(s.parallel, s.parallel.name, name) }
      : s,
  );
}

/**
 * „Aus dem Block lösen“: Der Schritt verlässt seinen Zweig und folgt nach dem
 * Block (vor dem bisherigen Anschluss). Im Zweig führen Verweise auf ihn zu
 * seinem Standardziel, wie beim Entfernen. Seine Übergänge, die im Block
 * blieben („Zweig beendet“ oder ein Schritt des Blocks), führen nun zum
 * bisherigen Anschluss; Ausstiege bleiben. Bleibt nur ein Zweig übrig, wird
 * der Block aufgelöst.
 */
export function ausBlockLoesen(steps: ProcessTemplateStep[], id: ID): Bearbeitung {
  const st = strukturVon(steps);
  const i = st.index.get(id);
  const lage = i === undefined ? null : st.lage[i];
  if (i === undefined || !lage) return { steps, hinweis: null };
  const blockId = lage.block.id;
  const imBlock = new Set(lage.block.zweige.flat().map((k) => steps[k].id));
  const anschluss: ID | 'ende' = steps[lage.block.ende]?.id ?? 'ende';
  const schritt = zieleUmbiegen(festschreiben(steps)[i], (z) =>
    z === null || z === 'ende' || imBlock.has(z) || !st.index.has(z) ? anschluss : z,
  );
  const rest = festschreiben(entfernenRoh(steps, id));
  const b = strukturVon(rest).bloecke.get(blockId);
  if (!b) return { steps, hinweis: null };
  return geordnet(vereinfachen(hinterBlockSetzen(rest, b, mitStandardZiel(schritt, anschluss))));
}

/**
 * „Block auflösen“: Die Zweige laufen nacheinander – das Ende eines Zweigs
 * führt zum ersten Schritt des nächsten, das des letzten zum Anschluss.
 * Ausstiege bleiben Sprünge zu ihrem Ziel. Verweise von außen in die Mitte des
 * Blocks führen (wie bisher: Betreten des ganzen Blocks) zu seinem ersten Schritt.
 */
export function blockAufloesen(steps: ProcessTemplateStep[], blockId: ID): Bearbeitung {
  const st = strukturVon(steps);
  const b = st.bloecke.get(blockId);
  if (!b) return { steps, hinweis: null };
  const fest = festschreiben(steps);
  const anschluss: ID | 'ende' = steps[b.ende]?.id ?? 'ende';
  const zweigStart = b.zweige.map((idx) => steps[idx[0]].id);
  const erster = steps[b.start].id;
  const neu = fest.map((s, k) => {
    const lage = st.lage[k];
    if (lage?.block.id !== blockId) {
      return zieleUmbiegen(s, (z) => {
        if (z === null || z === 'ende') return z;
        const zk = st.index.get(z);
        return zk !== undefined && st.lage[zk]?.block.id === blockId ? erster : z;
      });
    }
    const weiter = zweigStart[lage.zweig + 1] ?? anschluss;
    const eigener = new Set(lage.block.zweige[lage.zweig].map((x) => steps[x].id));
    return {
      ...zieleUmbiegen(s, (z) => {
        if (z === 'ende' || z === null) return weiter;
        const zk = st.index.get(z);
        if (zk === undefined) return weiter;
        // Ziel in einem anderen Zweig (unzulässig) wirkte wie „Zweig beendet“
        if (st.lage[zk]?.block.id === blockId && !eigener.has(z)) return weiter;
        return z;
      }),
      parallel: null,
    };
  });
  return geordnet(vereinfachen(neu));
}

/* ------------------------------ Verschieben ------------------------------ */

/** Lage eines Schritts im Bild: Stelle im Standardverlauf bzw. im Standardweg seines Zweigs. */
function lageImBild(g: Gliederung, id: ID): { art: 'oben'; k: number } | { art: 'zweig'; b: BlockGliederung; z: ZweigGliederung; j: number } | null {
  const k = g.hauptAnzeige.indexOf(id);
  if (k >= 0) return { art: 'oben', k };
  for (const b of Object.values(g.bloecke)) {
    for (const z of b.zweige) {
      const j = z.standard.indexOf(id);
      if (j >= 0) return { art: 'zweig', b, z, j };
    }
  }
  return null;
}

/** Ob sich ein Schritt im Standardverlauf (bzw. im Standardweg seines Zweigs) früher bzw. später stellen lässt. */
export function verschiebbar(g: Gliederung, id: ID): { frueher: boolean; spaeter: boolean } {
  const l = lageImBild(g, id);
  if (!l) return { frueher: false, spaeter: false };
  if (l.art === 'oben') return { frueher: l.k > 0, spaeter: l.k < g.hauptAnzeige.length - 1 };
  return { frueher: l.j > 0, spaeter: l.j < l.z.standard.length - 1 };
}

/**
 * Verschiebt einen Schritt des Standardverlaufs um eine Stelle nach vorn bzw.
 * hinten – im Ablauf, nicht nur in der Liste; ein paralleler Block zählt als
 * eine Stelle. Im Zweig eines Blocks bewegt er sich im Standardweg des Zweigs.
 * Abweichungen bleiben, wo sie sind.
 */
export function imVerlaufVerschieben(steps: ProcessTemplateStep[], id: ID, richtung: -1 | 1): Bearbeitung {
  const g = gliedern(steps);
  const l = lageImBild(g, id);
  const ok = verschiebbar(g, id);
  const unveraendert: Bearbeitung = { steps, hinweis: null };
  if (!l || (richtung === -1 ? !ok.frueher : !ok.spaeter)) return unveraendert;
  const schritt = festschreiben(steps).find((s) => s.id === id)!;
  const ohne = festschreiben(entfernen(steps, id));
  // Einfügen hinter der Stelle, die danach unmittelbar davor stehen soll
  let ergebnis: ProcessTemplateStep[];
  const hinter = (vor: ID) => {
    const vi = ohne.findIndex((s) => s.id === vor);
    return einfuegen(ohne, vor, standardKante(ohne, vi).antwortId, schritt);
  };
  if (l.art === 'oben') {
    const vor = richtung === -1 ? (l.k >= 2 ? g.hauptAnzeige[l.k - 2] : null) : g.hauptAnzeige[l.k + 1];
    if (vor === null) {
      ergebnis = [mitStandardZiel(schritt, ohne[0]?.id ?? 'ende'), ...ohne];
    } else if (istBlockAnzeige(vor)) {
      const b = strukturVon(ohne).bloecke.get(vor.block);
      if (!b) return unveraendert;
      ergebnis = hinterBlockSetzen(ohne, b, schritt);
    } else {
      ergebnis = hinter(vor);
    }
  } else {
    const vor = richtung === -1 ? (l.j >= 2 ? l.z.standard[l.j - 2] : null) : l.z.standard[l.j + 1];
    ergebnis = vor === null ? einfuegenAmZweiganfang(ohne, l.b.block, l.z.zweig, schritt) : hinter(vor);
  }
  return geordnet(vereinfachen(festschreiben(ergebnis)));
}

/** Kopie eines Schritts, eingefügt direkt hinter ihm im Standardverlauf (im selben Zweig). */
export function duplizieren(steps: ProcessTemplateStep[], id: ID, neueId: NeueId): ProcessTemplateStep[] {
  const original = steps.find((s) => s.id === id);
  if (!original) return steps;
  const kopie: ProcessTemplateStep = {
    ...original,
    id: neueId('ts'),
    name: original.name ? `${original.name} (Kopie)` : '',
    antworten: original.antworten.map((a) => ({ ...a, id: neueId('ant') })),
  };
  return einfuegen(steps, id, standardKante(steps, steps.indexOf(original)).antwortId, kopie);
}

/**
 * Wechselt die Art eines Schritts. Der Standardverlauf bleibt dabei erhalten:
 * Aus „weiter mit“ wird das Ziel der ersten Antwort und umgekehrt.
 */
export function artSetzen(step: ProcessTemplateStep, typ: StepType, neueId: NeueId): ProcessTemplateStep {
  if (step.typ === typ) return step;
  if (typ === 'entscheidung') {
    const antworten = step.antworten.length > 0 ? step.antworten : standardAntworten(neueId);
    return {
      ...step,
      typ,
      naechster: null,
      // Bisher vorhandene Antworten behalten ihr Ziel, neue führen dorthin, wohin die Aufgabe führte
      antworten: step.antworten.length > 0 ? antworten : antworten.map((a) => ({ ...a, ziel: step.naechster })),
    };
  }
  return { ...step, typ, naechster: step.antworten.length > 0 ? step.antworten[0].ziel : step.naechster, antworten: [] };
}

/** Prüfende Funktionen verlangen regelmäßig einen Prüfbericht. */
export function funktionSetzen(step: ProcessTemplateStep, roleName: string): ProcessTemplateStep {
  return {
    ...step,
    roleName,
    nachweis: step.nachweis === 'keine' && istPrueferRolle(roleName) ? 'pruefbericht' : step.nachweis,
  };
}

/** Macht eine Antwort zur ersten – ihr Weg wird damit zum Standardverlauf. */
export function alsStandard(steps: ProcessTemplateStep[], vonId: ID, antwortId: ID): ProcessTemplateStep[] {
  return steps.map((s) => {
    if (s.id !== vonId) return s;
    const a = s.antworten.find((x) => x.id === antwortId);
    if (!a) return s;
    return { ...s, antworten: [a, ...s.antworten.filter((x) => x.id !== antwortId)] };
  });
}

/* ------------------------------------------------------------------ */
/* Prüfung                                                             */
/* ------------------------------------------------------------------ */

export interface Hinweis {
  stepId: ID | null;
  text: string;
  /** Verhindert das Speichern. */
  sperrt: boolean;
}

export function pruefen(steps: ProcessTemplateStep[]): Hinweis[] {
  if (steps.length === 0) return [{ stepId: null, text: 'Der Workflow hat noch keinen Schritt.', sperrt: true }];
  const g = gliedern(steps);
  const st = strukturVon(steps);
  const nr = (id: ID) => String((st.index.get(id) ?? 0) + 1).padStart(2, '0');
  const hinweise: Hinweis[] = [];
  steps.forEach((s) => {
    if (!s.name.trim()) hinweise.push({ stepId: s.id, text: `Schritt ${nr(s.id)} hat keine Bezeichnung.`, sperrt: true });
    if (s.typ === 'entscheidung' && s.antworten.length === 0)
      hinweise.push({ stepId: s.id, text: `Entscheidung ${nr(s.id)} hat keine Antwort.`, sperrt: true });
    if (!s.roleName.trim())
      hinweise.push({ stepId: s.id, text: `Schritt ${nr(s.id)} hat keine verantwortliche Funktion.`, sperrt: false });
  });

  const blockVon = (id: ID) => {
    const k = st.index.get(id);
    return k === undefined ? null : (st.lage[k]?.block ?? null);
  };
  const uebergang = (k: Kante) => (k.text ? `„${k.text}“` : '„Weiter mit“');
  for (const k of g.kanten) {
    if (k.unzulaessig) {
      hinweise.push({
        stepId: k.von,
        text: `Schritt ${nr(k.von)}: ${uebergang(k)} führt in einen anderen Zweig desselben Blocks – ein Zweig kann nur zu Schritten im eigenen Zweig führen.`,
        sperrt: true,
      });
      continue;
    }
    if (k.nach === 'ende' || (k.art !== 'schritt' && k.art !== 'ausstieg')) continue;
    const ziel = blockVon(k.nach);
    if (!ziel || blockVon(k.von) === ziel || steps[ziel.start].id === k.nach) continue;
    hinweise.push({
      stepId: k.von,
      text: `Schritt ${nr(k.von)}: ${uebergang(k)} springt mitten in einen parallelen Block – der Block beginnt dann von vorn mit allen Zweigen.`,
      sperrt: false,
    });
  }

  if (g.rueckSprungZu) {
    const letzte = g.hauptAnzeige[g.hauptAnzeige.length - 1];
    const von = istBlockAnzeige(letzte) ? g.bloecke[letzte.block].erster : letzte;
    hinweise.push({
      stepId: von,
      text: `Der Standardverlauf endet in einer Schleife zurück zu Schritt ${nr(g.rueckSprungZu)} – ein Planlauf käme mit den ersten Antworten nie zum Ende.`,
      sperrt: false,
    });
  }
  for (const b of Object.values(g.bloecke)) {
    for (const z of b.zweige) {
      if (z.schluss.art !== 'rueck') continue;
      hinweise.push({
        stepId: z.standard[z.standard.length - 1],
        text: `Zweig ${z.zweig + 1}${z.name ? ` („${z.name}“)` : ''} des Blocks ${b.name ? `„${b.name}“ ` : ''}ab Schritt ${nr(b.erster)}: Der Standardweg endet in einer Schleife – der Zweig käme mit den ersten Antworten nie zum Ende.`,
        sperrt: false,
      });
    }
  }

  for (const id of g.unerreichbar) {
    const b = blockVon(id);
    const imZweig = b && g.bloecke[b.id]?.erreichbar;
    hinweise.push({
      stepId: id,
      text: imZweig
        ? `Schritt ${nr(id)} wird in seinem Zweig nie erreicht – kein Übergang im Zweig führt zu ihm.`
        : `Schritt ${nr(id)} wird nie erreicht – kein Übergang führt zu ihm.`,
      sperrt: false,
    });
  }
  return hinweise;
}

/**
 * Antworten ohne Text erhalten beim Speichern „Ja“, „Nein“ bzw. „Antwort n“;
 * Namen von Blöcken und Zweigen werden gekürzt; parallele Blöcke werden
 * geordnet (siehe `bloeckeOrdnen` in ablauf.ts).
 */
export function bereinigen(steps: ProcessTemplateStep[]): ProcessTemplateStep[] {
  return geordnet(
    steps.map((s) => ({
      ...s,
      name: s.name.trim(),
      roleName: s.roleName.trim(),
      // Bei Entscheidungen bestimmen die Antworten den Verlauf
      naechster: s.typ === 'entscheidung' && s.antworten.length > 0 ? null : s.naechster,
      antworten:
        s.typ === 'entscheidung'
          ? s.antworten.map((a, i) => ({
              ...a,
              text: a.text.trim() || STANDARD_ANTWORTEN[i] || `Antwort ${i + 1}`,
              nacharbeit: a.nacharbeit ?? i > 0,
            }))
          : [],
      parallel: s.parallel ? markerMitNamen(s.parallel, s.parallel.name?.trim(), s.parallel.zweigName?.trim()) : null,
    })),
  ).steps;
}
