/**
 * Ablaufverfolgung – die eine Regel, nach der ein Workflow durchlaufen wird.
 *
 * Die Schritte liegen als flache Liste vor. Ein Übergang (Antwortziel bzw.
 * „weiter mit“) nennt eine Schritt-ID, `'ende'` oder `null` für „nächster
 * Schritt“. **Parallele Blöcke** sind zusammenhängende Abschnitte der Liste:
 * Schritte mit gleichem `parallel.block` stehen nach `zweig` sortiert
 * hintereinander. Ein Block wird immer als Ganzes betreten – alle Zweige
 * beginnen bei ihrem ersten Schritt –, weiter geht es am **Anschluss** (dem
 * Schritt hinter dem Block), wenn alle Zweige erledigt sind.
 *
 * `nachfolger` ist die einzige Stelle, die Ziele auflöst; Planlauf, Editor,
 * Terminrechnung und Simulation folgen ihr gemeinsam. Alles hier ist generisch
 * für Workflow-Schritte (ohne Status) und Laufschritte (mit Status).
 */
import type { Antwort, ID, ISODate, Parallel, RunStep, StepStatus, StepType } from './types';

/** Was die Ablaufverfolgung von einem Schritt braucht. */
export interface AblaufSchritt {
  id: ID;
  typ: StepType;
  antworten: Antwort[];
  naechster: ID | 'ende' | null;
  parallel?: Parallel | null;
  gewaehlteAntwortId?: ID | null;
  status?: StepStatus;
  istDatum?: ISODate | null;
  eingangIst?: ISODate | null;
}

/* ------------------------------------------------------------------ */
/* Antworten und Ziele                                                 */
/* ------------------------------------------------------------------ */

/** Die Antwort, die den weiteren Verlauf bestimmt (ohne Auswahl: die erste). */
export function massgeblicheAntwort(step: { antworten: Antwort[]; gewaehlteAntwortId?: ID | null }): Antwort | undefined {
  if (step.antworten.length === 0) return undefined;
  const gewaehlt = step.antworten.find((a) => a.id === step.gewaehlteAntwortId);
  return gewaehlt ?? step.antworten[0];
}

/**
 * Das Ziel eines Schritts: bei Entscheidungen das Ziel der maßgeblichen
 * Antwort, sonst der hinterlegte Nachfolger. `null` heißt „nächster Schritt“.
 */
export function zielVon<T extends AblaufSchritt>(
  step: T,
  antwort: (step: T) => Antwort | undefined = massgeblicheAntwort,
): ID | 'ende' | null {
  if (step.typ === 'entscheidung' && step.antworten.length > 0) return antwort(step)?.ziel ?? null;
  return step.naechster ?? null;
}

/** Erledigt oder übersprungen. */
export function istErledigt(s: { status?: StepStatus }): boolean {
  return s.status === 'erledigt' || s.status === 'uebersprungen';
}

/** Im laufenden Durchlauf begonnen: nicht mehr offen, mit Ist oder mit festem Eingang. */
export function istBegonnen(s: { status?: StepStatus; istDatum?: ISODate | null; eingangIst?: ISODate | null }): boolean {
  return (s.status !== undefined && s.status !== 'offen') || Boolean(s.istDatum) || Boolean(s.eingangIst);
}

/**
 * Läuft gerade bzw. hat schon ein Ist. Anders als `istBegonnen` ohne den
 * festen Eingang: Den setzt die Terminrechnung nach dem Verlauf – hinge der
 * Verlauf davon ab, könnte er sich durch das Rechnen selbst verschieben.
 */
function laeuft(s: { status?: StepStatus; istDatum?: ISODate | null }): boolean {
  return s.status === 'laufend' || Boolean(s.istDatum);
}

/* ------------------------------------------------------------------ */
/* Blöcke                                                              */
/* ------------------------------------------------------------------ */

/** Ein paralleler Block in der Schrittliste. */
export interface Block {
  id: ID;
  /** Erster Listenindex des Blocks. */
  start: number;
  /** Index hinter dem letzten Schritt des Blocks – dort steht der Anschluss. */
  ende: number;
  /** Listenindizes je Zweig (nach Zweignummer sortiert), jeweils in Listenreihenfolge. */
  zweige: number[][];
  /** Name des Blocks (siehe `Parallel.name`); '' = ohne Namen. */
  name: string;
  /** Name je Zweig in der Reihenfolge von `zweige`; '' = ohne Namen. */
  zweigNamen: string[];
}

/**
 * Die Blöcke einer Schrittliste. Ein Block reicht vom ersten bis zum letzten
 * Listenindex seiner Schritte; Zweige werden nach ihrer Nummer geordnet.
 */
export function bloeckeErmitteln(steps: readonly AblaufSchritt[]): Map<ID, Block> {
  const roh = new Map<ID, { start: number; ende: number; zweige: Map<number, number[]> }>();
  steps.forEach((s, i) => {
    const p = s.parallel ?? null;
    if (!p) return;
    let b = roh.get(p.block);
    if (!b) {
      b = { start: i, ende: i + 1, zweige: new Map() };
      roh.set(p.block, b);
    }
    b.ende = i + 1;
    const liste = b.zweige.get(p.zweig) ?? [];
    liste.push(i);
    b.zweige.set(p.zweig, liste);
  });
  const bloecke = new Map<ID, Block>();
  for (const [id, b] of roh) {
    const zweige = [...b.zweige.entries()].sort((x, y) => x[0] - y[0]).map(([, idx]) => idx);
    const name = (feld: 'name' | 'zweigName', idx: number[]) =>
      idx.map((i) => steps[i].parallel?.[feld]?.trim() ?? '').find(Boolean) ?? '';
    bloecke.set(id, {
      id,
      start: b.start,
      ende: b.ende,
      zweige,
      name: name('name', zweige.flat().sort((x, y) => x - y)),
      zweigNamen: zweige.map((idx) => name('zweigName', idx)),
    });
  }
  return bloecke;
}

/** Bezeichnung eines Zweigs: sein Name, sonst „Zweig n“ (`zweig`: Position ab 0). */
export function zweigTitel(name: string, zweig: number): string {
  return name || `Zweig ${zweig + 1}`;
}

/** Bezeichnung eines Blocks mit n Zweigen: „Versand · parallel, 4 Zweige“ bzw. „Parallel · 4 Zweige“. */
export function blockTitel(name: string, zweige: number): string {
  return name ? `${name} · parallel, ${zweige} Zweige` : `Parallel · ${zweige} Zweige`;
}

/** Marker mit den angegebenen Namen; leere Namen entfallen. */
export function markerMitNamen(p: Parallel, name: string | undefined, zweigName: string | undefined): Parallel {
  const m: Parallel = { block: p.block, zweig: p.zweig };
  if (name?.trim()) m.name = name;
  if (zweigName?.trim()) m.zweigName = zweigName;
  return m;
}

/**
 * Namen gelten für den ganzen Block bzw. Zweig und stehen an jedem seiner
 * Schritte: Je Block und je Zweig gilt der erste nicht leere Name in
 * Listenreihenfolge. So bleibt ein Name erhalten, wenn der Schritt, der ihn
 * trug, den Block verlässt, und neue Schritte im Block erhalten ihn. Ist das
 * schon so, bleibt die Liste unverändert.
 */
export function namenVereinheitlichen<T extends AblaufSchritt>(steps: T[]): T[] {
  const bloecke = new Map<ID, string>();
  const zweige = new Map<string, string>();
  for (const s of steps) {
    const p = s.parallel;
    if (!p) continue;
    if (!bloecke.has(p.block) && p.name?.trim()) bloecke.set(p.block, p.name);
    const k = `${p.block}#${p.zweig}`;
    if (!zweige.has(k) && p.zweigName?.trim()) zweige.set(k, p.zweigName);
  }
  let geaendert = false;
  const ergebnis = steps.map((s) => {
    const p = s.parallel;
    if (!p) return s;
    const m = markerMitNamen(p, bloecke.get(p.block), zweige.get(`${p.block}#${p.zweig}`));
    if (p.name === m.name && p.zweigName === m.zweigName && Object.keys(p).length === Object.keys(m).length) return s;
    geaendert = true;
    return { ...s, parallel: m };
  });
  return geaendert ? ergebnis : steps;
}

/** Lage eines Schritts in einem Block: Block, Position des Zweigs, Position im Zweig. */
interface Lage {
  block: Block;
  zweig: number;
  pos: number;
}

/** Einmal je Verfolgung berechnete Struktur der Liste. */
export interface Struktur {
  bloecke: Map<ID, Block>;
  /** Lage je Listenindex; null = außerhalb von Blöcken. */
  lage: (Lage | null)[];
  /** Listenindex je Schritt-ID. */
  index: Map<ID, number>;
}

export function strukturVon(steps: readonly AblaufSchritt[]): Struktur {
  const bloecke = bloeckeErmitteln(steps);
  const lage: (Lage | null)[] = steps.map(() => null);
  for (const block of bloecke.values()) {
    block.zweige.forEach((idx, zweig) => idx.forEach((i, pos) => (lage[i] = { block, zweig, pos })));
  }
  const index = new Map<ID, number>();
  steps.forEach((s, i) => {
    if (!index.has(s.id)) index.set(s.id, i);
  });
  return { bloecke, lage, index };
}

/* ------------------------------------------------------------------ */
/* Nachfolger – die einzige Auflösung von Zielen                       */
/* ------------------------------------------------------------------ */

/** Wohin ein Übergang führt. */
export type Folge =
  /** Weiter mit diesem Listenindex (außerhalb eines Blocks: ggf. Betreten eines Blocks; im Zweig: Schritt desselben Zweigs). */
  | { art: 'schritt'; index: number }
  /** Ende der Kette – ausdrücklich (`'ende'`) oder weil die Liste endet bzw. das Ziel fehlt. */
  | { art: 'ende'; ausdruecklich: boolean }
  /** Im Zweig: der Zweig ist beendet, weiter am Anschluss. `unzulaessig`: Ziel lag in einem anderen Zweig. */
  | { art: 'zweigende'; unzulaessig: boolean }
  /** Im Zweig: Ziel außerhalb des Blocks – nach dem Block geht es dort weiter. */
  | { art: 'ausstieg'; index: number };

/**
 * Löst das Ziel `ziel` des Schritts an Listenindex `i` auf.
 *
 * * außerhalb eines Blocks: `null` → nächster Listenschritt (am Ende der Liste:
 *   Ende), `'ende'` → Ende, ID → dorthin (ein unbekanntes Ziel beendet den Ablauf);
 * * im Zweig: `null` → nächster Schritt desselben Zweigs, sonst Zweigende;
 *   `'ende'` → Zweigende; ID im selben Zweig → dorthin; ID in einem anderen
 *   Zweig → unzulässig, wie Zweigende; ID außerhalb des Blocks → Ausstieg.
 *
 * Ein Ziel auf irgendeinen Schritt eines Blocks betritt den ganzen Block.
 */
export function nachfolger(
  steps: readonly AblaufSchritt[],
  i: number,
  ziel: ID | 'ende' | null,
  struktur: Struktur = strukturVon(steps),
): Folge {
  const lage = struktur.lage[i] ?? null;
  const zielIndex = ziel !== null && ziel !== 'ende' ? struktur.index.get(ziel) : undefined;
  if (!lage) {
    if (ziel === 'ende') return { art: 'ende', ausdruecklich: true };
    if (ziel === null) return i + 1 < steps.length ? { art: 'schritt', index: i + 1 } : { art: 'ende', ausdruecklich: false };
    return zielIndex === undefined ? { art: 'ende', ausdruecklich: false } : { art: 'schritt', index: zielIndex };
  }
  const eigener = lage.block.zweige[lage.zweig];
  if (ziel === 'ende') return { art: 'zweigende', unzulaessig: false };
  if (ziel === null) {
    const naechster = eigener[lage.pos + 1];
    return naechster === undefined ? { art: 'zweigende', unzulaessig: false } : { art: 'schritt', index: naechster };
  }
  if (zielIndex === undefined) return { art: 'zweigende', unzulaessig: false };
  const zielLage = struktur.lage[zielIndex] ?? null;
  if (zielLage && zielLage.block === lage.block) {
    return zielLage.zweig === lage.zweig ? { art: 'schritt', index: zielIndex } : { art: 'zweigende', unzulaessig: true };
  }
  return { art: 'ausstieg', index: zielIndex };
}

/**
 * Ein Ziel in fester Schreibweise – so, dass es nach einem Umstellen der Liste
 * dieselbe Bedeutung behält: ein Schritt bleibt seine ID, Zweigende und Ende
 * werden `'ende'` (im Zweig heißt `'ende'` „Zweig beendet“).
 */
export function zielFest(
  steps: readonly AblaufSchritt[],
  i: number,
  ziel: ID | 'ende' | null,
  struktur: Struktur = strukturVon(steps),
): ID | 'ende' {
  if (ziel !== null) return ziel;
  const f = nachfolger(steps, i, null, struktur);
  return f.art === 'schritt' || f.art === 'ausstieg' ? steps[f.index].id : 'ende';
}

/** Schreibt jedes „nächster Schritt“ (null) als feste ID bzw. `'ende'` fest. */
export function zieleFestschreiben<T extends AblaufSchritt>(steps: T[]): T[] {
  const st = strukturVon(steps);
  return steps.map((s, i) => ({
    ...s,
    naechster: s.naechster === null ? zielFest(steps, i, null, st) : s.naechster,
    antworten: s.antworten.map((a) => (a.ziel === null ? { ...a, ziel: zielFest(steps, i, null, st) } : a)),
  }));
}

/** Feste Verweise, die genau „nächster Schritt“ bedeuten, werden wieder zu null. */
export function zieleVereinfachen<T extends AblaufSchritt>(steps: T[]): T[] {
  const st = strukturVon(steps);
  return steps.map((s, i) => {
    const lage = st.lage[i];
    let folge: ID | undefined;
    let zweigLetzter = false;
    if (lage) {
      const n = lage.block.zweige[lage.zweig][lage.pos + 1];
      folge = n === undefined ? undefined : steps[n].id;
      zweigLetzter = n === undefined;
    } else {
      folge = steps[i + 1]?.id;
    }
    const kurz = (z: ID | 'ende' | null) => {
      if (z === null) return null;
      if (folge !== undefined && z === folge) return null;
      // Am letzten Schritt eines Zweigs bedeuten 'ende' und null beide „Zweig beendet“
      if (zweigLetzter && z === 'ende') return null;
      return z;
    };
    return { ...s, naechster: kurz(s.naechster), antworten: s.antworten.map((a) => ({ ...a, ziel: kurz(a.ziel) })) };
  });
}

/** Alle Blöcke zusammenhängend, nach Zweig sortiert, Zweige 0 … n−1 und mindestens zwei. */
function bloeckeInOrdnung(steps: readonly AblaufSchritt[], st: Struktur): boolean {
  for (const b of st.bloecke.values()) {
    if (b.zweige.length < 2) return false;
    let k = b.start;
    for (const [nr, zweig] of b.zweige.entries()) {
      for (const i of zweig) {
        if (i !== k++ || steps[i].parallel!.zweig !== nr) return false;
      }
    }
    if (k !== b.ende) return false;
  }
  return true;
}

/** Ergebnis von `bloeckeOrdnenMitHinweis`. */
export interface Ordnung<T> {
  steps: T[];
  /**
   * Blöcke, hinter denen es nach dem Ordnen anders weitergeht als vorher –
   * dann ließ sich die Liste nicht umstellen, ohne den Ablauf zu ändern (siehe
   * bloeckeOrdnenMitHinweis). Leer, wenn der Ablauf erhalten bleibt.
   */
  anschlussGeaendert: ID[];
}

/**
 * Stellt die Blockregeln her: Schritte eines Blocks stehen zusammen (an der
 * Stelle seines ersten Schritts), nach Zweig sortiert, Zweige sind 0 … n−1
 * nummeriert; Blöcke mit nur einem Zweig werden aufgelöst (samt Namen). Die
 * Namen von Block und Zweigen stehen danach an jedem ihrer Schritte
 * (`namenVereinheitlichen`). Die Ziele werden
 * vorher festgeschrieben und danach vereinfacht, damit das Umstellen den
 * Ablauf nicht ändert: Beginn und Anschluss jedes Blocks bleiben erhalten,
 * soweit sich das widerspruchsfrei herstellen lässt. Ist alles schon in
 * Ordnung, bleibt die Liste unverändert.
 *
 * Beim Auflösen eines Ein-Zweig-Blocks führt ein Sprung von außen in seine
 * Mitte – wie bisher – zu seinem ersten Schritt (ein Ziel in einem Block
 * betritt ihn als Ganzes).
 *
 * Nicht widerspruchsfrei herstellbar ist der Anschluss in zwei Fällen; dann
 * ändert sich der Ablauf hinter dem Block, und `anschlussGeaendert` nennt ihn:
 * * Ein Block steht am Listenanfang und reicht bis ans Listenende, dazwischen
 *   liegen fremde Schritte (etwa nach „Aus dem Block lösen“). Bisher endete
 *   der Ablauf hinter dem Block; die fremden Schritte müssen aber vor oder
 *   hinter ihn – davor änderten sie den Beginn, dahinter laufen sie nun nach
 *   dem Block. Sie rücken dahinter.
 * * Ineinander verschränkte Blöcke (ein Block liegt zwischen den Schritten
 *   eines anderen): Bedingungen, die sich widersprechen, entfallen einzeln –
 *   der Beginn geht vor.
 */
export function bloeckeOrdnen<T extends AblaufSchritt>(steps: T[]): T[] {
  return bloeckeOrdnenMitHinweis(steps).steps;
}

/** Wie `bloeckeOrdnen`, dazu die Blöcke, hinter denen sich der Ablauf ändern musste. */
export function bloeckeOrdnenMitHinweis<T extends AblaufSchritt>(steps: T[]): Ordnung<T> {
  if (!steps.some((s) => s.parallel)) return { steps, anschlussGeaendert: [] };
  const st = strukturVon(steps);
  if (bloeckeInOrdnung(steps, st)) return { steps: namenVereinheitlichen(steps), anschlussGeaendert: [] };
  const fest = zieleFestschreiben(steps);

  // Ein-Zweig-Blöcke auflösen: „Zweig beendet“ (auch über ein unbekanntes Ziel)
  // heißt dann „weiter am Anschluss“
  const aufloesen = new Set([...st.bloecke.values()].filter((b) => b.zweige.length < 2).map((b) => b.id));
  /**
   * Ein Ziel in einem aufgelösten Block betrat ihn bisher an seinem ersten
   * Schritt – auch wenn es auf einen späteren zeigte. Das bleibt so; nur
   * Sprünge innerhalb des Blocks selbst behalten ihr Ziel.
   */
  const eintritt = (z: ID | 'ende' | null, eigenerBlock: ID | null): ID | 'ende' | null => {
    if (z === null || z === 'ende') return z;
    const k = st.index.get(z);
    const lage = k === undefined ? null : st.lage[k];
    if (!lage || !aufloesen.has(lage.block.id) || lage.block.id === eigenerBlock) return z;
    return steps[lage.block.start].id;
  };
  const geloest = fest.map((s) => {
    const p = s.parallel ?? null;
    const eigener = p && aufloesen.has(p.block) ? st.bloecke.get(p.block)! : null;
    const anschluss: ID | 'ende' | null = eigener ? eintritt(steps[eigener.ende]?.id ?? 'ende', null) : null;
    const umbiegen = (z: ID | 'ende' | null) =>
      eintritt(eigener && (z === 'ende' || (z !== null && !st.index.has(z))) ? anschluss : z, eigener?.id ?? null);
    const naechster = umbiegen(s.naechster);
    const antworten = s.antworten.map((a) => {
      const ziel = umbiegen(a.ziel);
      return ziel === a.ziel ? a : { ...a, ziel };
    });
    if (!eigener && naechster === s.naechster && antworten.every((a, n) => a === s.antworten[n])) return s;
    return { ...s, parallel: eigener ? null : p, naechster, antworten };
  });

  // Einheiten: Einzelschritte und ganze Blöcke (zusammenhängend, nach Zweig sortiert, neu nummeriert)
  const rang = new Map<ID, Map<number, number>>();
  for (const b of st.bloecke.values()) {
    if (aufloesen.has(b.id)) continue;
    const nummern = [...new Set(b.zweige.map((idx) => steps[idx[0]].parallel!.zweig))].sort((x, y) => x - y);
    rang.set(b.id, new Map(nummern.map((n, k) => [n, k])));
  }
  interface Einheit {
    schritte: T[];
    /** Nur Blöcke: der Schritt, der bisher hinter dem Block stand (sein Anschluss); 'ende' = Listenende. */
    anschluss: ID | 'ende' | null;
  }
  const einheiten: Einheit[] = [];
  const einheitVon = new Map<ID, Einheit>();
  const blockEinheit = new Map<ID, Einheit>();
  geloest.forEach((s) => {
    const p = s.parallel ?? null;
    if (!p) {
      const e: Einheit = { schritte: [s], anschluss: null };
      einheiten.push(e);
      einheitVon.set(s.id, e);
      return;
    }
    if (blockEinheit.has(p.block)) return;
    const r = rang.get(p.block)!;
    const schritte = geloest
      .map((x, k) => ({ x, k }))
      .filter(({ x }) => x.parallel?.block === p.block)
      .sort((a, b) => r.get(a.x.parallel!.zweig)! - r.get(b.x.parallel!.zweig)! || a.k - b.k)
      .map(({ x }) => ({ ...x, parallel: { ...x.parallel!, zweig: r.get(x.parallel!.zweig)! } }));
    const e: Einheit = { schritte, anschluss: eintritt(steps[st.bloecke.get(p.block)!.ende]?.id ?? 'ende', null) };
    einheiten.push(e);
    blockEinheit.set(p.block, e);
    for (const x of schritte) einheitVon.set(x.id, e);
  });

  /*
   * Reihenfolge der Einheiten: Nach dem Festschreiben hängt die Bedeutung nur
   * noch an zwei Stellen von der Lage ab – am ersten Schritt (Beginn) und am
   * Anschluss jedes Blocks („Zweig beendet“). Deshalb Ketten bilden: Block →
   * Einheit mit seinem bisherigen Anschluss; die Kette mit dem bisherigen
   * ersten Schritt beginnt, ein Block am Listenende schließt ab, übrige Ketten
   * in bisheriger Reihenfolge. Bedingungen, die sich widersprechen (ineinander
   * verschränkte Blöcke), entfallen einzeln – der Beginn geht vor.
   */
  const erste = einheitVon.get(geloest[0].id)!;
  const nach = new Map<Einheit, Einheit>();
  const vor = new Map<Einheit, Einheit>();
  let schluss: Einheit | null = null;
  for (const e of einheiten) {
    if (e.anschluss === null) continue;
    if (e.anschluss === 'ende') {
      schluss ??= e;
      continue;
    }
    const f = einheitVon.get(e.anschluss);
    if (!f || f === e || f === erste || vor.has(f)) continue;
    // Kein Ring: f darf nicht schon (über Nachfolger) vor e stehen
    let ring = false;
    for (let x: Einheit | undefined = f; x; x = nach.get(x)) if (x === e) ring = true;
    if (ring) continue;
    nach.set(e, f);
    vor.set(f, e);
  }
  const ketten: Einheit[][] = [];
  for (const kopf of einheiten) {
    if (vor.has(kopf)) continue;
    const kette: Einheit[] = [];
    for (let e: Einheit | undefined = kopf; e; e = nach.get(e)) kette.push(e);
    ketten.push(kette);
  }
  const ersteKette = ketten.find((k) => k[0] === erste)!;
  const schlussKette = schluss ? ketten.find((k) => k[k.length - 1] === schluss) : undefined;
  const reihe = [
    ersteKette,
    ...ketten.filter((k) => k !== ersteKette && k !== schlussKette),
    ...(schlussKette && schlussKette !== ersteKette ? [schlussKette] : []),
  ].flat();
  // Blöcke, hinter denen nun eine andere Einheit steht als ihr bisheriger Anschluss
  const anschlussGeaendert: ID[] = [];
  reihe.forEach((e, k) => {
    if (e.anschluss === null) return;
    const bisher = e.anschluss === 'ende' ? 'ende' : (einheitVon.get(e.anschluss) ?? 'ende');
    const jetzt = reihe[k + 1] ?? 'ende';
    if (bisher !== jetzt) anschlussGeaendert.push(e.schritte[0].parallel!.block);
  });
  return { steps: namenVereinheitlichen(zieleVereinfachen(reihe.flatMap((e) => e.schritte))), anschlussGeaendert };
}

/* ------------------------------------------------------------------ */
/* Verfolgung                                                          */
/* ------------------------------------------------------------------ */

/** Der Weg durch einen Zweig eines Blocks. */
export interface Zweigverlauf<T> {
  /** Position des Zweigs im Block (0 … n−1). */
  zweig: number;
  /** Name des Zweigs; '' = ohne Namen (siehe `zweigTitel`). */
  name: string;
  schritte: T[];
  /** Zweig-Rücksprung: ein schon durchlaufener Schritt dieses Zweigs (z. B. erneute Nachreichung). */
  rueckSprungZu: T | null;
  /** Ausstieg: Ziel außerhalb des Blocks, ausgelöst vom letzten Schritt des Zweigs. */
  ausstieg: ID | null;
  /** Nach einem wirksamen Ausstieg eines anderen Zweigs gekürzt. */
  abgeschnitten: boolean;
}

export type Abschnitt<T> =
  | { art: 'schritt'; step: T }
  | {
      art: 'parallel';
      block: ID;
      /** Name des Blocks; '' = ohne Namen (siehe `blockTitel`). */
      name: string;
      zweige: Zweigverlauf<T>[];
      /** Schritt, dessen Ausstieg nach dem Block gilt; null = weiter am Anschluss. */
      ausstiegVon: ID | null;
      ausstiegNach: ID | null;
      /** Der auslösende Schritt ist erledigt – die übrigen Zweige beginnen nichts Neues mehr. */
      ausstiegWirksam: boolean;
    };

/** Ergebnis der Ablaufverfolgung. */
export interface Verlauf<T> {
  /** Die durchlaufenen Schritte; Blöcke flach (Zweig 0, dann Zweig 1 …). */
  schritte: T[];
  abschnitte: Abschnitt<T>[];
  /**
   * Rücksprung auf oberster Ebene: der Ablauf führt zu diesem, schon
   * durchlaufenen Schritt zurück (bei einem Block: zu dessen erstem Schritt).
   */
  rueckSprungZu: T | null;
  /** Der Ablauf wird durch ein Ziel ausdrücklich beendet. */
  beendet: boolean;
  /**
   * Je Schritt die Schritte, deren Abschluss seinen Eingang bildet: der erste
   * Schritt der Kette keine, der erste Schritt eines Zweigs die Vorgänger des
   * Blocks, der Schritt nach einem Block die letzten Schritte aller Zweige,
   * sonst der vorige Schritt.
   */
  vorgaenger: Map<ID, ID[]>;
  /**
   * Die Schritte am Ende des Verlaufs – ihr Abschluss bildet den Eingang
   * dessen, was danach kommt (etwa des Ziels eines Rücksprungs): der letzte
   * Einzelschritt bzw., endet der Verlauf mit einem Block, die letzten
   * Schritte aller seiner Zweige (wie bei `vorgaenger` für den Anschluss).
   */
  schluss: ID[];
  /** Zuletzt genommener Ausstieg aus einem Block. */
  ausstieg?: { von: ID; nach: ID | 'ende' };
}

function zweigVerfolgen<T extends AblaufSchritt>(
  steps: T[],
  st: Struktur,
  block: Block,
  zweig: number,
  antwort: (step: T) => Antwort | undefined,
): Zweigverlauf<T> {
  const ergebnis: Zweigverlauf<T> = {
    zweig,
    name: block.zweigNamen[zweig] ?? '',
    schritte: [],
    rueckSprungZu: null,
    ausstieg: null,
    abgeschnitten: false,
  };
  const idx = block.zweige[zweig];
  if (idx.length === 0) return ergebnis;
  const besucht = new Set<number>();
  let j = idx[0];
  for (let schutz = 0; schutz <= idx.length; schutz++) {
    besucht.add(j);
    ergebnis.schritte.push(steps[j]);
    const f = nachfolger(steps, j, zielVon(steps[j], antwort), st);
    if (f.art === 'schritt') {
      if (besucht.has(f.index)) {
        ergebnis.rueckSprungZu = steps[f.index];
        break;
      }
      j = f.index;
      continue;
    }
    if (f.art === 'ausstieg') ergebnis.ausstieg = steps[f.index].id;
    break;
  }
  return ergebnis;
}

/**
 * Verfolgt den Ablauf durch die Kette.
 *
 * Oberste Ebene: Schritte der Reihe nach; ein schon durchlaufenes Ziel (bzw.
 * ein schon betretener Block) beendet die Verfolgung als Rücksprung. Ein Block
 * wird als Ganzes betreten; jeder Zweig wird für sich verfolgt (Zweig-
 * Rücksprung, Zweigende oder Ausstieg). Ist der Ausstieg eines Zweigs
 * wirksam (sein auslösender Schritt erledigt), werden die übrigen Zweige nach
 * ihrem laufenden Schritt abgeschnitten: Laufendes wird noch erledigt, Neues
 * beginnt nicht, ihre Zweig-Rücksprünge entfallen. Mehrere Ausstiege: es gilt
 * der des ersten Zweigs (vorrangig ein wirksamer). Nach dem Block geht es am
 * Ausstieg weiter, sonst am Anschluss.
 */
export function verfolgen<T extends AblaufSchritt>(
  steps: T[],
  antwort: (step: T) => Antwort | undefined = massgeblicheAntwort,
): Verlauf<T> {
  const st = strukturVon(steps);
  const schritte: T[] = [];
  const abschnitte: Abschnitt<T>[] = [];
  const vorgaenger = new Map<ID, ID[]>();
  const besucht = new Set<number>();
  const bloeckeBesucht = new Set<ID>();
  let letzte: ID[] = [];
  let rueckSprungZu: T | null = null;
  let beendet = false;
  let ausstieg: Verlauf<T>['ausstieg'];

  const schonBesucht = (j: number) => {
    const lage = st.lage[j];
    return lage ? bloeckeBesucht.has(lage.block.id) : besucht.has(j);
  };
  const rueckZiel = (j: number) => {
    const lage = st.lage[j];
    return lage ? steps[lage.block.start] : steps[j];
  };

  let i = 0;
  for (let schutz = 0; i < steps.length && schutz <= steps.length; schutz++) {
    const lage = st.lage[i];
    if (lage) {
      const block = lage.block;
      bloeckeBesucht.add(block.id);
      const zweige = block.zweige.map((_, k) => zweigVerfolgen(steps, st, block, k, antwort));

      const mitAusstieg = zweige.filter((z) => z.ausstieg !== null);
      const wirksam = mitAusstieg.find((z) => istErledigt(z.schritte[z.schritte.length - 1]));
      const massgeblich = wirksam ?? mitAusstieg[0] ?? null;
      if (wirksam) {
        for (const z of zweige) {
          if (z === wirksam) continue;
          const behalten: T[] = [];
          for (const s of z.schritte) {
            if (istErledigt(s)) {
              behalten.push(s);
              continue;
            }
            if (laeuft(s)) behalten.push(s);
            break;
          }
          if (behalten.length < z.schritte.length || z.rueckSprungZu) z.abgeschnitten = true;
          z.schritte = behalten;
          z.rueckSprungZu = null;
        }
      }

      for (const z of zweige) {
        z.schritte.forEach((s, j) => {
          schritte.push(s);
          vorgaenger.set(s.id, j === 0 ? letzte : [z.schritte[j - 1].id]);
        });
      }
      const von = massgeblich ? massgeblich.schritte[massgeblich.schritte.length - 1].id : null;
      abschnitte.push({
        art: 'parallel',
        block: block.id,
        name: block.name,
        zweige,
        ausstiegVon: von,
        ausstiegNach: massgeblich?.ausstieg ?? null,
        ausstiegWirksam: Boolean(wirksam),
      });
      const nachBlock = zweige.filter((z) => z.schritte.length > 0).map((z) => z.schritte[z.schritte.length - 1].id);
      letzte = nachBlock.length > 0 ? nachBlock : letzte;

      let weiter: number;
      if (massgeblich && massgeblich.ausstieg !== null) {
        ausstieg = { von: von!, nach: massgeblich.ausstieg };
        weiter = st.index.get(massgeblich.ausstieg)!;
      } else {
        weiter = block.ende;
        if (weiter >= steps.length) break;
      }
      if (schonBesucht(weiter)) {
        rueckSprungZu = rueckZiel(weiter);
        break;
      }
      i = weiter;
      continue;
    }

    const step = steps[i];
    besucht.add(i);
    schritte.push(step);
    vorgaenger.set(step.id, letzte);
    letzte = [step.id];
    abschnitte.push({ art: 'schritt', step });

    const f = nachfolger(steps, i, zielVon(step, antwort), st);
    if (f.art === 'ende') {
      beendet = f.ausdruecklich;
      break;
    }
    if (f.art !== 'schritt') break;
    if (schonBesucht(f.index)) {
      rueckSprungZu = rueckZiel(f.index);
      break;
    }
    i = f.index;
  }

  return { schritte, abschnitte, rueckSprungZu, beendet, vorgaenger, schluss: letzte, ...(ausstieg ? { ausstieg } : {}) };
}

/* ------------------------------------------------------------------ */
/* Anstehende Schritte                                                 */
/* ------------------------------------------------------------------ */

/**
 * Die Schritte, die jetzt an der Reihe sind: der erste offene Einzelschritt –
 * bzw. in einem Block je Zweig der erste offene Schritt. Solange ein Zweig noch
 * offen ist (auch mit ausstehendem Zweig-Rücksprung), geht es nicht hinter den
 * Block hinaus.
 */
export function anstehendeSchritte<T extends AblaufSchritt>(verlauf: Verlauf<T>): T[] {
  for (const a of verlauf.abschnitte) {
    if (a.art === 'schritt') {
      if (!istErledigt(a.step)) return [a.step];
      continue;
    }
    const ergebnis: T[] = [];
    let offen = false;
    for (const z of a.zweige) {
      const s = z.schritte.find((x) => !istErledigt(x));
      if (s) {
        ergebnis.push(s);
        offen = true;
      } else if (z.rueckSprungZu) {
        offen = true;
      }
    }
    if (offen) return ergebnis;
  }
  return [];
}

/** Die anstehenden Schritte eines Laufs (siehe anstehendeSchritte). */
export function aktuelleSchritte<T extends AblaufSchritt>(run: { steps: T[] }): T[] {
  return anstehendeSchritte(verfolgen(run.steps));
}

/** Wo ein Schritt im Verlauf steht: oben oder in einem Zweig eines Blocks. */
export type OrtImVerlauf<T> =
  | { art: 'oben'; abschnitt: number }
  | { art: 'zweig'; abschnitt: number; zweig: Zweigverlauf<T>; pos: number };

export function ortImVerlauf<T extends AblaufSchritt>(verlauf: Verlauf<T>, stepId: ID): OrtImVerlauf<T> | null {
  for (const [k, a] of verlauf.abschnitte.entries()) {
    if (a.art === 'schritt') {
      if (a.step.id === stepId) return { art: 'oben', abschnitt: k };
      continue;
    }
    for (const z of a.zweige) {
      const pos = z.schritte.findIndex((s) => s.id === stepId);
      if (pos >= 0) return { art: 'zweig', abschnitt: k, zweig: z, pos };
    }
  }
  return null;
}

/** Alle Schritte der Abschnitte ab `k` (Blöcke mit allen Zweigen). */
function schritteAb<T>(verlauf: Verlauf<T>, k: number): T[] {
  return verlauf.abschnitte
    .slice(k)
    .flatMap((a) => (a.art === 'schritt' ? [a.step] : a.zweige.flatMap((z) => z.schritte)));
}

/**
 * Der Schritt und alles, was im Verlauf auf ihn folgt: oben die Schritte ab
 * ihm; in einem Zweig der Rest des Zweigs und alles nach dem Block (andere
 * Zweige nicht). Mit `ganzerBlock` zählt bei einem Blockschritt der ganze
 * Block (Wiedereintritt). null, wenn der Schritt nicht im Verlauf liegt.
 */
export function folgeImVerlauf<T extends AblaufSchritt>(verlauf: Verlauf<T>, stepId: ID, ganzerBlock = false): T[] | null {
  const ort = ortImVerlauf(verlauf, stepId);
  if (!ort) return null;
  if (ort.art === 'oben' || ganzerBlock) return schritteAb(verlauf, ort.abschnitt);
  return [...ort.zweig.schritte.slice(ort.pos), ...schritteAb(verlauf, ort.abschnitt + 1)];
}

/**
 * Hebt den Status auf den Verlauf an: anstehende offene Schritte werden
 * „laufend“, nicht (mehr) anstehende laufende Schritte ohne Ist wieder „offen“.
 */
export function statusAbgleichen<T extends AblaufSchritt & { status: StepStatus }>(steps: T[]): T[] {
  const anstehend = new Set(aktuelleSchritte({ steps }).map((s) => s.id));
  let geaendert = false;
  const neu = steps.map((s) => {
    if (anstehend.has(s.id) && s.status === 'offen') {
      geaendert = true;
      return { ...s, status: 'laufend' as const };
    }
    if (!anstehend.has(s.id) && s.status === 'laufend' && !s.istDatum) {
      geaendert = true;
      return { ...s, status: 'offen' as const };
    }
    return s;
  });
  return geaendert ? neu : steps;
}

/* ------------------------------------------------------------------ */
/* Einfügen im laufenden Planlauf                                      */
/* ------------------------------------------------------------------ */

export type EinfuegePosition = 'danach' | 'zweigende' | 'nach_block';

/**
 * Fügt einen Schritt in einen laufenden Planlauf ein – blockbewusst.
 *
 * * `danach`: direkt hinter `nachId` im Ablauf; der neue Schritt übernimmt den
 *   maßgeblichen Übergang von `nachId` und dessen Zweig.
 * * `zweigende`: ans Ende des Zweigs von `nachId`; alles, was den Zweig
 *   beendete, führt nun zum neuen Schritt.
 * * `nach_block`: hinter den Block von `nachId`, vor den Anschluss.
 *
 * Außerhalb eines Blocks wirken `zweigende` und `nach_block` wie `danach`.
 * Kanten anderer Zweige bleiben unberührt; im Zweig übernimmt der neue Schritt
 * Block, Zweig und Blockdurchgang. Direkt hinter Erledigtem läuft der neue
 * Schritt sofort; steht er danach an, wird er „laufend“ mit Eingang `heute`.
 * Anstehende Schritte, die nun auf ihn warten, werden wieder „offen“ (wie bei
 * einer Korrektur; ihr Eingang ergibt sich neu aus seinem Abschluss).
 * Ohne `nachId` wird er erster Schritt.
 *
 * Zulässig ist das Einfügen nur, wo es nichts Erledigtes überholt (siehe
 * `einfuegenMoeglich`); sonst bleibt die Liste unverändert.
 */
export function schrittImLaufEinfuegen(
  steps: RunStep[],
  nachId: ID | null,
  neu: RunStep,
  position: EinfuegePosition = 'danach',
  heute?: ISODate,
): RunStep[] {
  const ergebnis = einfuegen(steps, nachId, neu, position, heute);
  return einfuegenZulaessig(steps, ergebnis, neu.id) ? ergebnis : steps;
}

/**
 * Lässt sich an dieser Stelle ein Schritt einfügen? Nein, wenn im Verlauf
 * hinter dem neuen Schritt schon etwas erledigt ist (bzw. ein Ist hat) – er
 * käme vor bereits geleistete Arbeit –, oder wenn ein begonnener Schritt dadurch
 * aus dem Verlauf fiele (etwa in einem Zweig, der nach einem Ausstieg nichts
 * Neues mehr beginnt). Hinter dem anstehenden Schritt bzw. weiter hinten geht
 * es immer.
 */
export function einfuegenMoeglich(steps: RunStep[], nachId: ID | null, position: EinfuegePosition = 'danach'): boolean {
  if (steps.length === 0) return true;
  const probe: RunStep = {
    ...steps[0],
    id: '\u0000probe',
    typ: 'aufgabe',
    antworten: [],
    naechster: null,
    parallel: null,
    status: 'offen',
    istDatum: null,
    eingangIst: null,
    gewaehlteAntwortId: null,
  };
  return einfuegenZulaessig(steps, einfuegen(steps, nachId, probe, position), probe.id);
}

/** Prüft das Ergebnis eines Einfügens (siehe einfuegenMoeglich). */
function einfuegenZulaessig(vorher: RunStep[], nachher: RunStep[], neuId: ID): boolean {
  const neuVerlauf = verfolgen(nachher);
  const drin = new Set(neuVerlauf.schritte.map((s) => s.id));
  if (verfolgen(vorher).schritte.some((s) => istBegonnen(s) && !drin.has(s.id))) return false;
  const folge = folgeImVerlauf(neuVerlauf, neuId) ?? [];
  return !folge.some((s) => s.id !== neuId && (istErledigt(s) || Boolean(s.istDatum)));
}

function einfuegen(
  steps: RunStep[],
  nachId: ID | null,
  neu: RunStep,
  position: EinfuegePosition,
  heute?: ISODate,
): RunStep[] {
  const st = strukturVon(steps);
  const i = nachId === null ? -1 : (st.index.get(nachId) ?? -1);
  let ergebnis: RunStep[];
  /** Ist der Schritt, hinter dem eingefügt wird, schon erledigt, beginnt der neue sofort. */
  let direktNachErledigtem = false;
  /** Im Zweig gehört der neue Schritt zum laufenden Blockdurchgang. */
  const imZweigVon = (bezug: RunStep): Pick<RunStep, 'parallel' | 'blockDurchgang'> =>
    bezug.parallel ? { parallel: bezug.parallel, blockDurchgang: bezug.blockDurchgang ?? 1 } : { parallel: null, blockDurchgang: neu.blockDurchgang };

  if (i < 0) {
    ergebnis = [{ ...neu, parallel: null, naechster: neu.typ === 'entscheidung' && neu.antworten.length > 0 ? null : neu.naechster }, ...steps];
  } else {
    const lage = st.lage[i];
    const art: EinfuegePosition = lage ? position : 'danach';
    if (art === 'danach') {
      const vorgaenger = steps[i];
      direktNachErledigtem = istErledigt(vorgaenger);
      const antwort = vorgaenger.typ === 'entscheidung' ? massgeblicheAntwort(vorgaenger) : undefined;
      const bisher = antwort ? antwort.ziel : vorgaenger.naechster;
      const eingefuegt = mitZiel({ ...neu, ...imZweigVon(vorgaenger) }, bisher);
      // Übrige Übergänge des Vorgängers ohne Ziel behalten ihre Bedeutung
      const angepasst: RunStep = antwort
        ? {
            ...vorgaenger,
            abweichung: true,
            antworten: vorgaenger.antworten.map((a) =>
              a.id === antwort.id ? { ...a, ziel: eingefuegt.id } : a.ziel === null ? { ...a, ziel: zielFest(steps, i, null, st) } : a,
            ),
          }
        : { ...vorgaenger, abweichung: true, naechster: eingefuegt.id };
      ergebnis = [...steps.slice(0, i), angepasst, eingefuegt, ...steps.slice(i + 1)];
    } else if (art === 'zweigende') {
      const zweig = lage!.block.zweige[lage!.zweig];
      const letzter = zweig[zweig.length - 1];
      direktNachErledigtem = zweig.every((k) => istErledigt(steps[k]));
      const eingefuegt: RunStep = mitZiel({ ...neu, ...imZweigVon(steps[i]) }, null);
      const imZweig = new Set(zweig);
      // Was den Zweig bisher beendete, führt nun zum neuen Schritt
      const umbiegen = (k: number, z: ID | 'ende' | null) => {
        const f = nachfolger(steps, k, z, st);
        return f.art === 'zweigende' && !f.unzulaessig ? (k === letzter && z === null ? null : eingefuegt.id) : z;
      };
      const angepasst = steps.map((s, k) => {
        if (!imZweig.has(k)) return s;
        const naechster = umbiegen(k, s.naechster);
        const antworten = s.antworten.map((a) => {
          const ziel = umbiegen(k, a.ziel);
          return ziel === a.ziel ? a : { ...a, ziel };
        });
        const anders = naechster !== s.naechster || antworten.some((a, n) => a !== s.antworten[n]);
        return anders ? { ...s, naechster, antworten, abweichung: true } : s;
      });
      ergebnis = [...angepasst.slice(0, letzter + 1), eingefuegt, ...angepasst.slice(letzter + 1)];
    } else {
      const ende = lage!.block.ende;
      const eingefuegt = mitZiel({ ...neu, parallel: null }, null);
      direktNachErledigtem = lage!.block.zweige.flat().every((k) => istErledigt(steps[k]));
      ergebnis = [...steps.slice(0, ende), eingefuegt, ...steps.slice(ende)];
    }
  }

  // Direkt hinter Erledigtem läuft der neue Schritt sofort – auch in einem Zweig,
  // der nach einem Ausstieg nichts Neues mehr beginnt. Steht er an, beginnt er
  // heute; wer nun auf ihn wartet, wird wieder „offen“.
  if (direktNachErledigtem) ergebnis = ergebnis.map((s) => (s.id === neu.id ? { ...s, status: 'laufend' as const } : s));
  const anstehend = new Set(aktuelleSchritte({ steps: ergebnis }).map((s) => s.id));
  return statusAbgleichen(
    ergebnis.map((s) =>
      s.id === neu.id && anstehend.has(s.id) && !s.eingangIst && heute ? { ...s, eingangIst: heute } : s,
    ),
  );
}

/** Der neue Schritt führt dorthin, wohin der Übergang bisher führte. */
function mitZiel(neu: RunStep, ziel: ID | 'ende' | null): RunStep {
  if (neu.typ === 'entscheidung' && neu.antworten.length > 0) {
    return { ...neu, naechster: null, antworten: neu.antworten.map((a) => (a.ziel === null ? { ...a, ziel } : a)) };
  }
  return { ...neu, naechster: ziel };
}
