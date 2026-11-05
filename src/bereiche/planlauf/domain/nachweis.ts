/**
 * Terminnachweis eines Planlaufs: Wer hat wie viele Tage Verzug verursacht?
 *
 * Grundlage sind alle Ausführungen des Laufs – frühere Durchläufe (Historie),
 * der laufende Durchlauf und bei laufenden Läufen die Prognose bis zum Ende
 * (simulation.prognose). Gegenüber dem Basisplan (`run.basis`, beim Start
 * festgehalten) entsteht der Gesamtverzug = tage(Basis-Ende, Ende). Er wird in
 * Posten zerlegt – Fristüberschreitung, Nacharbeit, Planänderung, Soll von
 * Hand, Übergabelücke, Zeitgewinn –, jeder mit einer vorbelegten Seite, die
 * sich von Hand umordnen lässt (`verzugZuordnung`).
 *
 * Gezählt wird entlang der terminbestimmenden Kette: die Ausführungen in der
 * Reihenfolge ihrer Abschlüsse, jede vom Abschluss der vorigen bis zu ihrem
 * eigenen (so geht die Summe immer auf). Ein paralleler Block zählt als Ganzes
 * (je Block und Blockdurchgang): nur sein Blockverzug gegenüber dem längsten
 * Zweig des Basisplans, verteilt auf genau
 * einen maßgeblichen Zweig – von dessen spätester Ausführung rückwärts. Was
 * darüber hinausgeht, hat der Puffer des Blocks aufgefangen (angezeigt, nicht
 * gezählt). So gilt Gesamtverzug = Σ Seiten + Seite fehlt − Zeitgewinn; der
 * Rest `nichtErklaert` ist im Regelfall 0.
 */
import { addDays, diffArbeitstage, diffDays, naechsterArbeitstag, today } from '../../../shared/dates';
import { aktuelleSchritte, istErledigt, nachfolger, strukturVon, verfolgen, type Struktur } from './ablauf';
import { kontaktName, seiteFuerSchritt } from './engine';
import { prognose } from './simulation';
import {
  SEITE_LABEL,
  type Contact,
  type ID,
  type ISODate,
  type Parallel,
  type PlanDocument,
  type PlanRun,
  type Project,
  type Role,
  type RunStep,
  type SchrittDurchlauf,
  type Seite,
  type VerzugAnteil,
} from './types';

/* ------------------------------------------------------------------ */
/* Tage zählen                                                         */
/* ------------------------------------------------------------------ */

/** Wie Tage gezählt werden: Arbeitstage (mit Feiertagen) oder Kalendertage. */
export interface Zeitrahmen {
  arbeitstage: boolean;
  feiertage: ISODate[];
}

/** Zählweise eines Projekts (ohne Projekt: Arbeitstage ohne Feiertage). */
export function zeitrahmen(project?: Pick<Project, 'settings'> | null): Zeitrahmen {
  return {
    arbeitstage: project?.settings.fristenInArbeitstagen ?? true,
    feiertage: project?.settings.feiertage ?? [],
  };
}

/**
 * Tage von `a` bis `b`: Arbeitstage im Zeitraum (a, b] bzw. Kalendertage;
 * negativ, wenn `b` vor `a` liegt. Dieselbe Zählung gilt im Nachweis, in der
 * Mahnung ({{verzug}}) und in der Oberfläche.
 */
export function tage(a: ISODate, b: ISODate, rahmen: Zeitrahmen): number {
  return rahmen.arbeitstage ? diffArbeitstage(a, b, rahmen.feiertage) : diffDays(a, b);
}

/** „1 Arbeitstag“, „5 Arbeitstage“, „3 Kalendertage“. */
export function tageText(anzahl: number, arbeitstage: boolean): string {
  const wort = arbeitstage ? 'Arbeitstag' : 'Kalendertag';
  return `${anzahl} ${Math.abs(anzahl) === 1 ? wort : `${wort}e`}`;
}

/** Verzug eines Schritts bis heute (0, solange das Soll nicht überschritten ist). */
export function verzugBisHeute(step: Pick<RunStep, 'sollDatum'>, rahmen: Zeitrahmen, heute: ISODate = today()): number {
  return step.sollDatum ? Math.max(0, tage(step.sollDatum, heute, rahmen)) : 0;
}

/** Soll nach der Fristregel: Eingang + Frist, bei Arbeitstagen mindestens der nächste Arbeitstag. */
function fristSoll(eingang: ISODate, frist: number, rahmen: Zeitrahmen): ISODate {
  return rahmen.arbeitstage
    ? naechsterArbeitstag(addDays(eingang, frist, true, rahmen.feiertage), rahmen.feiertage)
    : addDays(eingang, frist);
}

/* ------------------------------------------------------------------ */
/* Ergebnis                                                            */
/* ------------------------------------------------------------------ */

/**
 * Art einer Ausführung: `regel` – im Basisplan, erster Durchlauf, auf dem
 * Regelweg; `nacharbeit` – nach einer Nacharbeit-Antwort erreicht oder ein
 * weiterer Durchlauf; `planaenderung` – Schritt nicht im Basisplan.
 */
export type AusfuehrungsArt = 'regel' | 'nacharbeit' | 'planaenderung';

export const AUSFUEHRUNGS_ART_LABEL: Record<AusfuehrungsArt, string> = {
  regel: 'Regelablauf',
  nacharbeit: 'Nacharbeit',
  planaenderung: 'Planänderung',
};

/** `laufend`: steht an, Ende voraussichtlich; `prognose`: künftige Ausführung laut Prognose. */
export type AusfuehrungsZustand = 'erledigt' | 'uebersprungen' | 'laufend' | 'prognose';

export interface NachweisAusfuehrung {
  /** Schlüssel der Ausführung: `<stepId>#<durchlauf>` (Grundlage der Zuordnung von Hand). */
  schluessel: string;
  stepId: ID;
  durchlauf: number;
  blockDurchgang: number;
  name: string;
  roleName: string;
  /** Seite der Funktion (abgeschlossen: Momentaufnahme; offen: aktuelle Funktion). */
  seite: Seite | null;
  kontaktName: string;
  parallel: Parallel | null;
  zustand: AusfuehrungsZustand;
  eingang: ISODate | null;
  eingangGeschaetzt: boolean;
  soll: ISODate | null;
  sollManuell: boolean;
  /** Ist bzw. bei laufenden und künftigen Ausführungen das voraussichtliche Ende. */
  ist: ISODate | null;
  frist: number;
  /** Frist laut Basisplan; null = Schritt nicht im Basisplan. */
  basisFrist: number | null;
  /** tage(Eingang, Ist); null beim ersten Schritt mit Eingang Soll (keine Dauer). */
  dauer: number | null;
  /** tage(Soll, Ist) – bei laufenden Ausführungen nur ein Überschreiten. */
  abweichung: number;
  art: AusfuehrungsArt;
  antwort: string | null;
  antwortNacharbeit: boolean;
  /** Nur Entscheidungen mit Nacharbeit-Antwort: Ursache der Nacharbeit. */
  nacharbeitSeite: Seite | null;
  /** Bei Nacharbeit: die auslösende Entscheidung. */
  ausloeser: { schluessel: string; name: string; antwort: string | null } | null;
  verzugZuordnung: VerzugAnteil[];
  /** Liegt auf der terminbestimmenden Kette (im Block: im maßgeblichen Zweig). */
  terminwirksam: boolean;
}

export type PostenArt =
  | 'frist'
  | 'nacharbeit'
  | 'planaenderung'
  | 'soll_hand'
  | 'uebergabe'
  | 'erster_termin'
  | 'block_nacharbeit'
  | 'zeitgewinn';

export const POSTEN_ART_LABEL: Record<PostenArt, string> = {
  frist: 'Fristüberschreitung',
  nacharbeit: 'Nacharbeit',
  planaenderung: 'Planänderung',
  soll_hand: 'Soll von Hand',
  uebergabe: 'Übergabelücke',
  erster_termin: 'Erster Termin verschoben',
  block_nacharbeit: 'Nacharbeit (paralleler Block)',
  zeitgewinn: 'Zeitgewinn',
};

export interface NachweisPosten {
  art: PostenArt;
  /** Ausführung, der der Posten zugeordnet ist (siehe NachweisAusfuehrung.schluessel). */
  schluessel: string;
  text: string;
  /** Wert in Tagen (> 0; beim Zeitgewinn der gewonnene Betrag). */
  tage: number;
  /** Davon terminwirksam gezählt – der Rest ist durch Puffer aufgefangen bzw. nicht terminwirksam. */
  gezaehlt: number;
  /** Vorbelegte Seite (Zeitgewinn: keine). */
  seite: Seite | null;
  /** Stammt aus der Prognose (noch nicht angefallen). */
  prognose: boolean;
}

/** Bilanz eines parallelen Blocks je Blockdurchgang. */
export interface BlockBilanz {
  block: ID;
  blockDurchgang: number;
  art: 'regel' | 'nacharbeit';
  eingang: ISODate;
  /** Dauer des längsten Zweigs im Basisplan. */
  geplanteDauer: number;
  geplantesEnde: ISODate;
  ende: ISODate;
  /** tage(geplantes Ende, Ende); negativ = Zeitgewinn des Blocks. */
  verzug: number;
  massgeblicherZweig: number;
  terminwirksam: boolean;
  prognose: boolean;
}

/** Verteilung der gezählten Tage einer Ausführung auf die Seiten. */
export interface Verteilung {
  schluessel: string;
  seite: Seite | null;
  tage: number;
  /** Von Hand zugeordnet (sonst Vorbelegung). */
  hand: boolean;
  grund?: string;
  prognose: boolean;
}

export interface Terminnachweis {
  arbeitstage: boolean;
  ausfuehrungen: NachweisAusfuehrung[];
  posten: NachweisPosten[];
  bloecke: BlockBilanz[];
  verteilung: Verteilung[];
  /** Gezählte Tage je Seite (nach Zuordnung von Hand). */
  summen: Record<Seite, number>;
  /** Gezählte Tage ohne Seite („Seite fehlt“). */
  seiteFehlt: number;
  zeitgewinn: number;
  /** Ursprünglich geplantes Ende (Basisplan). */
  basisEnde: ISODate | null;
  /** Ende: Ist bzw. bei laufenden Läufen die Prognose; null bei abgebrochenen Läufen. */
  ende: ISODate | null;
  endeIstPrognose: boolean;
  /** tage(Basis-Ende, Ende); null ohne Basisplan bzw. Ende (auch bei abgebrochenen Läufen). */
  gesamtverzug: number | null;
  /** Gesamtverzug − (Σ Seiten + Seite fehlt − Zeitgewinn); soll 0 sein. */
  nichtErklaert: number | null;
  warnungen: string[];
}

/* ------------------------------------------------------------------ */
/* Struktur: Regelweg und geplante Blockdauer                          */
/* ------------------------------------------------------------------ */

/**
 * Schritte, die vom Beginn aus ohne Nacharbeit-Antwort erreichbar sind (über
 * Nachfolger und Antworten ohne Nacharbeit, Blöcke als Ganzes). Eine
 * Ausführung eines anderen Schritts im ersten Durchlauf ist Nacharbeit.
 */
function regelErreichbar(steps: RunStep[], st: Struktur): Set<ID> {
  const erreicht = new Set<number>();
  const stapel: number[] = [];
  const hinein = (i: number, von: number | null) => {
    if (i < 0 || i >= steps.length) return;
    const lage = st.lage[i];
    const vonLage = von === null ? null : st.lage[von];
    const ziele = lage && lage.block !== vonLage?.block ? lage.block.zweige.map((z) => z[0]) : [i];
    for (const k of ziele) {
      if (erreicht.has(k)) continue;
      erreicht.add(k);
      stapel.push(k);
    }
  };
  if (steps.length > 0) hinein(0, null);
  while (stapel.length > 0) {
    const i = stapel.pop()!;
    const s = steps[i];
    const ziele =
      s.typ === 'entscheidung' && s.antworten.length > 0
        ? s.antworten.filter((a) => !a.nacharbeit).map((a) => a.ziel)
        : [s.naechster];
    for (const z of ziele) {
      const f = nachfolger(steps, i, z, st);
      if (f.art === 'schritt' || f.art === 'ausstieg') hinein(f.index, i);
      else if (f.art === 'zweigende') hinein(st.lage[i]!.block.ende, i);
    }
  }
  return new Set([...erreicht].map((i) => steps[i].id));
}

/**
 * Geplante Dauer eines Blocks: der längste Zweig im Regelweg (erste Antworten)
 * mit den Fristen des Basisplans. Dazu je Zweig die Schritte dieses Wegs.
 */
function blockPlan(
  steps: RunStep[],
  st: Struktur,
  blockId: ID,
  basisFrist: (id: ID) => number | null,
): { dauer: number; regelweg: Set<ID>; zweige: { erster: ID; dauer: number }[] } {
  const block = st.bloecke.get(blockId);
  const regelweg = new Set<ID>();
  const zweige: { erster: ID; dauer: number }[] = [];
  if (!block) return { dauer: 0, regelweg, zweige };
  let dauer = 0;
  for (const zweig of block.zweige) {
    let summe = 0;
    const besucht = new Set<number>();
    let i: number | undefined = zweig[0];
    while (i !== undefined && !besucht.has(i)) {
      besucht.add(i);
      const s = steps[i];
      const b = basisFrist(s.id);
      if (b !== null) {
        summe += b;
        regelweg.add(s.id);
      }
      const ziel = s.typ === 'entscheidung' && s.antworten.length > 0 ? s.antworten[0].ziel : s.naechster;
      const f = nachfolger(steps, i, ziel, st);
      i = f.art === 'schritt' ? f.index : undefined;
    }
    dauer = Math.max(dauer, summe);
    zweige.push({ erster: steps[zweig[0]].id, dauer: summe });
  }
  return { dauer, regelweg, zweige };
}

/* ------------------------------------------------------------------ */
/* Ausführungen sammeln                                                */
/* ------------------------------------------------------------------ */

interface Roh extends NachweisAusfuehrung {
  /** Reihenfolge bei gleichen Daten (Historie, laufender Durchlauf, Prognose). */
  seq: number;
  /** Rechengrößen: Eingang und Ist ohne Lücken. */
  e: ISODate;
  i: ISODate;
  /** Ende für die Kette (= Ist). */
  ende: ISODate;
  /** max(Ist, Eingang) – ein Ist vor dem Eingang zählt als Eingang. */
  fertig: ISODate;
  /** Erster Schritt im ersten Durchlauf mit Eingang Soll des Eintrags. */
  mitEingangSoll: boolean;
  /** Erster Schritt des Laufs im ersten Durchlauf. */
  anfang: boolean;
  /** Position in der Abschlussreihenfolge. */
  pos: number;
  /** Nur frühere Durchläufe (Historie): wodurch die Ausführung ihre Geltung verlor. */
  endeGrund?: SchrittDurchlauf['grund'];
}

const spaeter = (a: ISODate, b: ISODate) => (a > b ? a : b);

/** Sortierschlüssel der Abschlussreihenfolge. */
interface Folge {
  fertig: ISODate;
  e: ISODate;
  i: ISODate;
  /** Erste Ausführung des Laufs (erster Schritt im ersten Durchlauf) – bei gleichen Daten vorn. */
  anfang: boolean;
  durchlauf: number;
  seq: number;
}

/**
 * Abschlussreihenfolge: die erste Ausführung des Laufs vorn (an ihr hängt der
 * Vergleich mit dem Basisplan), sonst nach Abschluss (Ist, mindestens
 * Eingang) und Eingang; bei gleichen Daten der frühere Durchlauf, dann
 * Historie vor laufendem Durchlauf vor Prognose. Die Summe der Posten hängt
 * von der Reihenfolge gleichzeitiger Ausführungen nicht ab.
 */
function vergleich(a: Folge, b: Folge): number {
  if (a.anfang !== b.anfang) return a.anfang ? -1 : 1;
  if (a.fertig !== b.fertig) return a.fertig < b.fertig ? -1 : 1;
  if (a.e !== b.e) return a.e < b.e ? -1 : 1;
  if (a.durchlauf !== b.durchlauf) return a.durchlauf - b.durchlauf;
  return a.seq - b.seq;
}

/* ------------------------------------------------------------------ */
/* Terminnachweis                                                      */
/* ------------------------------------------------------------------ */

/**
 * Terminnachweis eines Laufs (reine Funktion). `rollen` und `kontakte` sind
 * die des Projekts (Seite und Person offener Ausführungen), `doc` ist der
 * Eintrag des Laufs (Eingang Soll, Gewerk).
 */
export function terminnachweis(
  run: PlanRun,
  project: Pick<Project, 'settings'> | undefined,
  rollen: Role[],
  kontakte: Contact[],
  doc: Pick<PlanDocument, 'eingangSoll' | 'gewerk'> | undefined,
  heute: ISODate = today(),
): Terminnachweis {
  const rahmen = zeitrahmen(project);
  const t = (a: ISODate, b: ISODate) => tage(a, b, rahmen);
  const gewerk = doc?.gewerk ?? '';
  const warnungen: string[] = [];
  const basis = run.basis;
  if (!basis) warnungen.push('Für diesen Planlauf ist kein Basisplan festgelegt – der Gesamtverzug lässt sich nicht bestimmen.');
  else if (!basis.planEnde) warnungen.push('Das geplante Ende des Basisplans ließ sich nicht berechnen (der Regelweg endet nicht).');
  const basisFrist = (id: ID): number | null => (basis ? (basis.fristen[id] ?? null) : null);
  const steps = run.steps;
  const st = strukturVon(steps);
  const regel = regelErreichbar(steps, st);
  const schrittVon = new Map(steps.map((s) => [s.id, s]));
  const verlauf = verfolgen(steps);
  const verlaufIndex = new Map(verlauf.schritte.map((s, i) => [s.id, i]));
  // Erste Schritte des Laufs (ohne Vorgänger): Listenanfang bzw. Zweiganfänge eines Blocks am Anfang
  const anfang = new Set<ID>(
    steps.length === 0 ? [] : st.lage[0] ? st.lage[0].block.zweige.map((z) => steps[z[0]].id) : [steps[0].id],
  );
  const eingangSoll = doc?.eingangSoll ?? null;
  const seiteOffen = (s: Pick<RunStep, 'roleName'>) => seiteFuerSchritt(s.roleName, rollen, gewerk);
  const kontaktOffen = (s: Pick<RunStep, 'contactId'>) => kontaktName(kontakte.find((c) => c.id === s.contactId));

  /** Art der ersten abgeschlossenen Ausführung eines Schritts (spätere sind Nacharbeit, siehe unten). */
  const artVon = (stepId: ID): AusfuehrungsArt => {
    if (basis && basisFrist(stepId) === null) return 'planaenderung';
    return regel.has(stepId) ? 'regel' : 'nacharbeit';
  };

  const roh: Roh[] = [];
  const hinzu = (
    a: Omit<Roh, 'schluessel' | 'art' | 'basisFrist' | 'dauer' | 'abweichung' | 'e' | 'i' | 'ende' | 'fertig' | 'mitEingangSoll' | 'anfang' | 'pos' | 'ausloeser' | 'terminwirksam'>,
  ) => {
    const ist = a.ist ?? a.soll ?? a.eingang;
    if (!ist) return;
    const e = a.eingang ?? a.soll ?? ist;
    const istAnfang = anfang.has(a.stepId) && a.durchlauf === 1 && a.blockDurchgang === 1;
    const mitEingangSoll = istAnfang && eingangSoll !== null;
    const offen = a.zustand === 'laufend' || a.zustand === 'prognose';
    const abw = a.soll ? t(a.soll, ist) : 0;
    roh.push({
      ...a,
      ist,
      schluessel: `${a.stepId}#${a.durchlauf}`,
      art: artVon(a.stepId),
      basisFrist: basis ? basisFrist(a.stepId) : a.frist,
      dauer: mitEingangSoll ? null : t(e, ist),
      abweichung: offen ? Math.max(0, abw) : abw,
      e,
      i: ist,
      ende: ist,
      fertig: spaeter(ist, e),
      mitEingangSoll,
      anfang: istAnfang,
      pos: 0,
      ausloeser: null,
      terminwirksam: false,
    });
  };

  // Frühere Durchläufe
  steps.forEach((s, k) => {
    for (const h of s.historie ?? []) {
      if (!h.ist || (h.status !== 'erledigt' && h.status !== 'uebersprungen')) continue;
      hinzu({
        stepId: s.id,
        durchlauf: h.durchlauf,
        blockDurchgang: h.blockDurchgang ?? 1,
        name: h.name,
        roleName: h.roleName,
        seite: h.seite,
        kontaktName: h.kontaktName,
        parallel: s.parallel ?? null,
        zustand: h.status === 'erledigt' ? 'erledigt' : 'uebersprungen',
        eingang: h.eingang,
        eingangGeschaetzt: h.eingangGeschaetzt,
        soll: h.soll,
        sollManuell: h.sollManuell,
        ist: h.ist,
        frist: h.fristTage,
        antwort: h.antwort,
        antwortNacharbeit: h.antwortNacharbeit,
        nacharbeitSeite: h.nacharbeitSeite,
        verzugZuordnung: h.verzugZuordnung ?? [],
        seq: (Date.parse(h.beendetAm) || 0) / 1000 + k / 1000 - 1e12,
        endeGrund: h.grund,
      });
    }
  });
  // Laufender Durchlauf: abgeschlossene Schritte
  steps.forEach((s, k) => {
    if (!istErledigt(s) || !s.istDatum) return;
    const antwort = s.typ === 'entscheidung' ? (s.antworten.find((a) => a.id === s.gewaehlteAntwortId) ?? s.antworten[0]) : undefined;
    hinzu({
      stepId: s.id,
      durchlauf: s.durchlauf ?? 1,
      blockDurchgang: s.blockDurchgang ?? 1,
      name: s.name,
      roleName: s.abschlussInfo?.roleName ?? s.roleName,
      seite: s.abschlussInfo ? s.abschlussInfo.seite : seiteOffen(s),
      kontaktName: s.abschlussInfo?.kontaktName ?? kontaktOffen(s),
      parallel: s.parallel ?? null,
      zustand: s.status === 'erledigt' ? 'erledigt' : 'uebersprungen',
      eingang: s.eingangIst ?? s.eingangDatum,
      eingangGeschaetzt: s.eingangGeschaetzt ?? false,
      soll: s.sollDatum,
      sollManuell: s.sollManuell,
      ist: s.istDatum,
      frist: s.fristTage,
      antwort: antwort?.text ?? null,
      antwortNacharbeit: antwort?.nacharbeit ?? false,
      nacharbeitSeite: s.nacharbeitSeite ?? null,
      verzugZuordnung: s.verzugZuordnung ?? [],
      seq: (verlaufIndex.get(s.id) ?? steps.length + k) + 1e6,
    });
  });
  // Laufende und künftige Ausführungen laut Prognose
  const laufend = run.status === 'laufend';
  if (laufend) {
    const pg = prognose(run, project, doc ?? undefined, heute);
    if (pg.fehler) warnungen.push('Die Prognose endet nicht (Schleife bzw. zu viele Schritte) – das Ende ist unsicher.');
    const anstehend = new Set(aktuelleSchritte(run).map((s) => s.id));
    pg.ausfuehrungen.forEach((a, k) => {
      const s = schrittVon.get(a.stepId);
      const jetzt = Boolean(s && anstehend.has(a.stepId) && (s.durchlauf ?? 1) === a.durchlauf);
      hinzu({
        stepId: a.stepId,
        durchlauf: a.durchlauf,
        blockDurchgang: a.blockDurchgang,
        name: a.name,
        roleName: a.roleName,
        seite: seiteOffen(a),
        kontaktName: s ? kontaktOffen(s) : '',
        parallel: a.parallel ?? s?.parallel ?? null,
        zustand: jetzt ? 'laufend' : 'prognose',
        eingang: a.eingang,
        eingangGeschaetzt: jetzt ? (s?.eingangGeschaetzt ?? false) : false,
        soll: a.soll,
        sollManuell: jetzt ? Boolean(s?.sollManuell) : false,
        ist: a.ist,
        frist: a.frist,
        antwort: a.antwort,
        antwortNacharbeit: a.antwortNacharbeit,
        nacharbeitSeite: a.antwortNacharbeit ? 'planer' : null,
        verzugZuordnung: jetzt ? (s?.verzugZuordnung ?? []) : [],
        seq: k + 2e6,
      });
    });
  }

  roh.sort(vergleich);
  roh.forEach((a, k) => (a.pos = k));
  const nachSchluessel = new Map(roh.map((a) => [a.schluessel, a]));

  /*
   * Eine weitere Ausführung eines Schritts ist Nacharbeit – aber nur, wenn es
   * eine frühere abgeschlossene Ausführung gibt. Ein Durchlauf, der begonnen,
   * aber nie abgeschlossen wurde (etwa der anstehende Nachfolger beim Wieder
   * öffnen), hinterlässt einen Historieneintrag ohne Ist und erhöht den
   * Durchlauf; die erste tatsächliche Ausführung zählt dann wie im ersten
   * Durchlauf gegen den Basisplan.
   */
  const vorherVon = new Map<Roh, Roh>();
  for (const a of roh) {
    let vorher: Roh | null = null;
    for (const b of roh) {
      if (b.stepId === a.stepId && b.durchlauf < a.durchlauf && (!vorher || b.durchlauf > vorher.durchlauf)) vorher = b;
    }
    if (vorher) {
      vorherVon.set(a, vorher);
      a.art = 'nacharbeit';
    }
  }

  /**
   * Auslösende Entscheidung einer Nacharbeit: die zuletzt davor mit
   * Nacharbeit-Antwort beendete (im Block bevorzugt im selben Zweig), frühestens
   * mit dem Abschluss der Ausführung, die die Nacharbeit wiederholt (`ab`).
   */
  const ausloeserVon = (
    pos: number,
    eingang: ISODate,
    lage: { parallel: Parallel | null; blockDurchgang: number } | null,
    ab: ISODate | null,
  ): Roh | null => {
    let gefunden: Roh | null = null;
    let imZweig: Roh | null = null;
    for (const d of roh) {
      if (d.pos >= pos || !d.antwortNacharbeit || d.fertig > eingang || (ab !== null && d.fertig < ab)) continue;
      if (!gefunden || d.pos > gefunden.pos) gefunden = d;
      if (
        lage?.parallel &&
        d.parallel?.block === lage.parallel.block &&
        d.parallel.zweig === lage.parallel.zweig &&
        d.blockDurchgang === lage.blockDurchgang &&
        (!imZweig || d.pos > imZweig.pos)
      )
        imZweig = d;
    }
    return imZweig ?? gefunden;
  };
  const ursacheVon = (d: Roh | null): Seite => d?.nacharbeitSeite ?? 'planer';
  for (const a of roh) {
    if (a.art !== 'nacharbeit') continue;
    const vorher = vorherVon.get(a);
    // Erneute Bearbeitung nach „Wieder öffnen“: keine Entscheidung hat sie ausgelöst (Vorgabe Planer)
    if (vorher?.endeGrund === 'wieder_geoeffnet') continue;
    const d = ausloeserVon(a.pos, a.e, a, vorher ? vorher.fertig : null);
    if (d) a.ausloeser = { schluessel: d.schluessel, name: d.name, antwort: d.antwort };
  }

  /* -------- Einheiten: Einzelausführungen und Blockdurchgänge -------- */

  interface Einheit extends Folge {
    art: 'einzel' | 'block';
    ausf: Roh[];
    block: ID | null;
    blockDurchgang: number;
    ende: ISODate;
    pos: number;
  }
  const einheiten: Einheit[] = [];
  const bloeckeNachSchluessel = new Map<string, Einheit>();
  for (const a of roh) {
    if (!a.parallel || !st.bloecke.has(a.parallel.block)) {
      einheiten.push({
        art: 'einzel', ausf: [a], block: null, blockDurchgang: 1, e: a.e, i: a.i, ende: a.i, fertig: a.fertig,
        anfang: a.anfang, durchlauf: a.durchlauf, seq: a.seq, pos: 0,
      });
      continue;
    }
    const k = `${a.parallel.block}#${a.blockDurchgang}`;
    const vorhanden = bloeckeNachSchluessel.get(k);
    if (vorhanden) {
      vorhanden.ausf.push(a);
      if (a.e < vorhanden.e) vorhanden.e = a.e;
      vorhanden.ende = spaeter(vorhanden.ende, a.i);
      vorhanden.i = vorhanden.ende;
      vorhanden.fertig = spaeter(vorhanden.fertig, a.fertig);
      vorhanden.anfang = vorhanden.anfang || a.anfang;
      vorhanden.durchlauf = Math.min(vorhanden.durchlauf, a.durchlauf);
      vorhanden.seq = Math.min(vorhanden.seq, a.seq);
    } else {
      const neu: Einheit = {
        art: 'block',
        ausf: [a],
        block: a.parallel.block,
        blockDurchgang: a.blockDurchgang,
        e: a.e,
        i: a.i,
        ende: a.i,
        fertig: a.fertig,
        anfang: a.anfang,
        durchlauf: a.durchlauf,
        seq: a.seq,
        pos: 0,
      };
      bloeckeNachSchluessel.set(k, neu);
      einheiten.push(neu);
    }
  }
  /** Ausführungen eines Blocks je Zweig, in Abschlussreihenfolge. */
  const zweigeVon = (u: Einheit) => {
    const nummern = [...new Set(u.ausf.map((a) => a.parallel!.zweig))].sort((x, y) => x - y);
    return nummern.map((zweig) => ({ zweig, ausf: u.ausf.filter((a) => a.parallel!.zweig === zweig) }));
  };
  // Ein Block endet mit dem Abschluss seines spätesten Zweigs
  for (const u of einheiten) {
    if (u.art === 'block') u.ende = zweigeVon(u).reduce((x, z) => spaeter(x, z.ausf[z.ausf.length - 1].i), u.e);
  }
  /*
   * Terminbestimmende Kette: Auf oberster Ebene und in jedem Zweig folgen die
   * Ausführungen in Abschlussreihenfolge aufeinander – jede beginnt mit dem
   * Abschluss der vorigen. Liegt ein Eingang vor dem Abschluss der vorigen
   * (etwa ein Ist vor dem Eingang), ergibt sich eine negative Übergabe, also ein
   * Zeitgewinn; die Summe bleibt so stets genau.
   */
  einheiten.sort(vergleich);
  einheiten.forEach((u, k) => (u.pos = k));
  const ende = einheiten.length > 0 ? einheiten[einheiten.length - 1].ende : null;

  /* -------- Posten -------- */

  const posten: NachweisPosten[] = [];
  const bloecke: BlockBilanz[] = [];
  const prognoseVon = (a: Roh) => a.zustand === 'laufend' || a.zustand === 'prognose';
  const neuerPosten = (
    liste: NachweisPosten[],
    a: Roh,
    art: PostenArt,
    wert: number,
    seite: Seite | null,
    text: string,
  ) => {
    if (wert === 0) return;
    if (wert < 0) {
      liste.push({ art: 'zeitgewinn', schluessel: a.schluessel, text, tage: -wert, gezaehlt: 0, seite: null, prognose: prognoseVon(a) });
      return;
    }
    liste.push({ art, schluessel: a.schluessel, text, tage: wert, gezaehlt: 0, seite, prognose: prognoseVon(a) });
  };

  /**
   * Posten einer Ausführung (ohne die Übergabe davor): Soll von Hand bzw.
   * verschobenes Soll, und – je nachdem, ob ihre Frist geplant war (`geplant`)
   * – Friständerung + Abweichung oder Nacharbeit/Planänderung + Überschreitung.
   */
  const postenVon = (a: Roh, geplant: boolean, uebergabe: number, vorSeite: Seite | null): NachweisPosten[] => {
    const liste: NachweisPosten[] = [];
    const fs = fristSoll(a.e, a.frist, rahmen);
    const rundung = t(a.e, fs) - a.frist; // Frist 0 an einem arbeitsfreien Tag
    const ueb = uebergabe + rundung;
    neuerPosten(
      liste,
      a,
      'uebergabe',
      ueb,
      a.eingangGeschaetzt ? null : vorSeite,
      a.eingangGeschaetzt
        ? 'Eingang bei der Umstellung geschätzt (Altbestand) – Zeit seit dem Vorgänger'
        : 'Eingang später als der Abschluss des Vorgängers',
    );
    const sollVerschoben = a.soll ? t(fs, a.soll) : 0;
    if (a.sollManuell) neuerPosten(liste, a, 'soll_hand', sollVerschoben, a.seite, 'Soll von Hand gesetzt (vereinbarte Fristverlängerung)');
    else neuerPosten(liste, a, 'planaenderung', sollVerschoben, 'auftraggeber', 'Soll abweichend von Eingang + Frist (Kalender geändert)');
    const abw = a.soll ? t(a.soll, a.i) : 0;
    if (geplant) {
      const b = a.basisFrist ?? a.frist;
      neuerPosten(liste, a, 'planaenderung', a.frist - b, 'auftraggeber', `Frist gegenüber dem Basisplan geändert (${b} → ${a.frist})`);
      neuerPosten(liste, a, 'frist', abw, a.seite, abw >= 0 ? 'Frist überschritten' : 'Vor dem Soll erledigt');
    } else {
      const zusatz = a.frist + Math.min(0, abw);
      if (a.art === 'planaenderung') {
        neuerPosten(liste, a, 'planaenderung', zusatz, 'auftraggeber', 'Zusätzlicher Schritt (nicht im Basisplan)');
      } else {
        const ausloeser = a.ausloeser ? nachSchluessel.get(a.ausloeser.schluessel) ?? null : null;
        neuerPosten(
          liste,
          a,
          'nacharbeit',
          zusatz,
          ursacheVon(ausloeser),
          ausloeser
            ? `Nacharbeit nach „${ausloeser.name}“${ausloeser.antwort ? ` (${ausloeser.antwort})` : ''}`
            : 'Nacharbeit (erneute Bearbeitung)',
        );
      }
      if (abw > 0) neuerPosten(liste, a, 'frist', abw, a.seite, 'Frist überschritten');
    }
    return liste;
  };

  /** Seite einer Einheit für die Übergabe danach: die der zuletzt fertigen Ausführung. */
  const seiteNach = (u: Einheit | null): Seite | null => {
    if (!u) return null;
    let letzte = u.ausf[0];
    for (const a of u.ausf) if (a.i > letzte.i || (a.i === letzte.i && a.pos > letzte.pos)) letzte = a;
    return letzte.seite;
  };

  const zaehlen = (liste: NachweisPosten[]) => {
    for (const p of liste) p.gezaehlt = p.tage;
  };

  /**
   * Liegt der geplante Abschluss des ersten Schritts (etwa das Eingang Soll)
   * auf einem arbeitsfreien Tag, rollt im Basisplan eine folgende Frist 0 auf
   * den nächsten Arbeitstag – ein Tag, den der Lauf nicht braucht, wenn der
   * erste Schritt an einem Arbeitstag endet. Nur dort kann der Basisplan so
   * runden; alle späteren Termine des Basisplans liegen auf Arbeitstagen.
   */
  const planRundung = (stepId: ID, geplant: ISODate): number => {
    let i = st.index.get(stepId);
    if (!rahmen.arbeitstage || i === undefined || st.lage[i]) return 0;
    // Nachfolger im Regelweg – eingefügte Schritte (nicht im Basisplan) gab es damals nicht
    let f: ReturnType<typeof nachfolger> | null = null;
    for (let n = 0; n < steps.length; n++) {
      const s = steps[i];
      const ziel = s.typ === 'entscheidung' && s.antworten.length > 0 ? s.antworten[0].ziel : s.naechster;
      f = nachfolger(steps, i, ziel, st);
      if (f.art !== 'schritt' || st.lage[f.index] || !basis || basisFrist(steps[f.index].id) !== null) break;
      i = f.index;
    }
    if (!f || f.art !== 'schritt') return 0;
    const frist = (id: ID) => (basis ? basisFrist(id) : null) ?? schrittVon.get(id)?.fristTage ?? 0;
    const rundung = (id: ID) => t(geplant, fristSoll(geplant, frist(id), rahmen)) - frist(id);
    const lage = st.lage[f.index];
    if (!lage) return rundung(steps[f.index].id);
    const plan = blockPlan(steps, st, lage.block.id, (id) => (basis ? basisFrist(id) : (schrittVon.get(id)?.fristTage ?? null)));
    return plan.zweige.reduce((m, z) => Math.max(m, z.dauer + rundung(z.erster)), 0) - plan.dauer;
  };

  /** Geplantes Soll des ersten Schritts laut Basisplan. */
  const basisErsterSoll = (a: Roh): ISODate | null => {
    if (!basis) return null;
    const mitSoll = basis.eingangSoll !== undefined ? basis.eingangSoll : basis.anker !== run.start ? basis.anker : null;
    return mitSoll ?? fristSoll(basis.anker, a.basisFrist ?? a.frist, rahmen);
  };

  let vorige: Einheit | null = null;
  for (const u of einheiten) {
    const pred = vorige;
    vorige = u;
    const istErste = einheiten[0] === u;
    const uebergabe = pred ? t(pred.ende, u.e) : 0;
    const vorSeite = seiteNach(pred);

    if (u.art === 'einzel') {
      const a = u.ausf[0];
      a.terminwirksam = true;
      let liste: NachweisPosten[];
      if (istErste) {
        liste = [];
        const geplant = basisErsterSoll(a);
        const ohneHand = a.sollManuell ? (a.mitEingangSoll && eingangSoll ? eingangSoll : fristSoll(a.e, a.frist, rahmen)) : (a.soll ?? a.i);
        if (geplant) {
          neuerPosten(
            liste,
            a,
            'erster_termin',
            t(geplant, ohneHand),
            'auftraggeber',
            a.mitEingangSoll ? 'Eingang Soll gegenüber dem Basisplan verschoben' : 'Termin des ersten Schritts gegenüber dem Basisplan verschoben',
          );
        }
        if (a.sollManuell && a.soll) neuerPosten(liste, a, 'soll_hand', t(ohneHand, a.soll), a.seite, 'Soll von Hand gesetzt (vereinbarte Fristverlängerung)');
        const abw = a.soll ? t(a.soll, a.i) : 0;
        neuerPosten(liste, a, 'frist', abw, a.seite, abw >= 0 ? (a.mitEingangSoll ? 'Eingang nach dem Eingang Soll' : 'Frist überschritten') : 'Vor dem Soll erledigt');
        if (geplant) {
          neuerPosten(liste, a, 'zeitgewinn', -planRundung(a.stepId, geplant), null, 'Basisplan: Frist 0 nach einem arbeitsfreien Tag eingeplant');
        }
      } else {
        liste = postenVon(a, a.art === 'regel', uebergabe, vorSeite);
      }
      zaehlen(liste);
      posten.push(...liste);
      continue;
    }

    // Paralleler Block
    const blockId = u.block!;
    const plan = blockPlan(steps, st, blockId, (id) => (basis ? basisFrist(id) : (schrittVon.get(id)?.fristTage ?? null)));
    const blockStart = st.bloecke.get(blockId)!.start;
    // Erneuter Blockdurchgang: Nacharbeit nur, wenn ein früherer Durchgang dieses Blocks ausgeführt wurde
    let frueher: Einheit | null = null;
    for (const x of einheiten) {
      if (x.block === blockId && x.blockDurchgang < u.blockDurchgang && (!frueher || x.blockDurchgang > frueher.blockDurchgang)) frueher = x;
    }
    const blockArt: 'regel' | 'nacharbeit' = frueher || !regel.has(steps[blockStart].id) ? 'nacharbeit' : 'regel';
    const ersteAusf = u.ausf.reduce((x, a) => (a.e < x.e || (a.e === x.e && a.pos < x.pos) ? a : x), u.ausf[0]);
    const blockListe: NachweisPosten[] = [];
    if (istErste && basis) {
      neuerPosten(blockListe, ersteAusf, 'erster_termin', t(basis.anker, u.e), 'auftraggeber', 'Beginn gegenüber dem Basisplan verschoben');
    }
    neuerPosten(blockListe, ersteAusf, 'uebergabe', uebergabe, ersteAusf.eingangGeschaetzt ? null : vorSeite, 'Eingang des Blocks später als der Abschluss des Vorgängers');
    if (blockArt === 'nacharbeit') {
      // Wodurch der frühere Durchgang endete: Grund der zuletzt abgeschlossenen Ausführung darin
      const letzte = frueher ? frueher.ausf.reduce((x, a) => (a.pos > x.pos ? a : x), frueher.ausf[0]) : null;
      const ab = frueher ? frueher.ausf.reduce((x, a) => (a.fertig < x ? a.fertig : x), frueher.ausf[0].fertig) : null;
      const d = letzte?.endeGrund === 'wieder_geoeffnet' ? null : ausloeserVon(ersteAusf.pos, u.e, null, ab);
      neuerPosten(
        blockListe,
        ersteAusf,
        'block_nacharbeit',
        plan.dauer,
        ursacheVon(d),
        d ? `Block erneut durchlaufen nach „${d.name}“${d.antwort ? ` (${d.antwort})` : ''}` : 'Block erneut durchlaufen',
      );
    }

    // Zweige: je Zweig seine Ausführungen in Abschlussreihenfolge; die erste
    // Ausführung eines Schritts auf dem Regelweg des Zweigs ist geplant (bzw.
    // im erneuten Durchgang durch die Nacharbeit des Blocks abgedeckt)
    const zweige = zweigeVon(u).map(({ zweig, ausf }) => {
      const gesehen = new Set<ID>();
      const liste: NachweisPosten[] = [];
      let vor: Roh | null = null;
      for (const a of ausf) {
        const grund = plan.regelweg.has(a.stepId) && !gesehen.has(a.stepId);
        gesehen.add(a.stepId);
        liste.push(...postenVon(a, grund, t(vor ? vor.i : u.e, a.e), vor ? vor.seite : vorSeite));
        vor = a;
      }
      const eigene = liste.reduce((s, p) => s + (p.art === 'zeitgewinn' ? -p.tage : p.tage), 0);
      return { zweig, ausf, liste, ende: vor ? vor.i : u.e, eigene };
    });
    let massgeblich = zweige[0];
    for (const z of zweige) {
      if (z.ende > massgeblich.ende || (z.ende === massgeblich.ende && z.eigene > massgeblich.eigene)) massgeblich = z;
    }
    const geplantesEnde = rahmen.arbeitstage ? addDays(u.e, plan.dauer, true, rahmen.feiertage) : addDays(u.e, plan.dauer);
    const verzug = t(geplantesEnde, u.ende);
    for (const z of zweige) for (const a of z.ausf) a.terminwirksam = z === massgeblich;
    zaehlen(blockListe);
    if (verzug >= 0) {
      // Von der spätesten Ausführung des maßgeblichen Zweigs rückwärts, bis der
      // Blockverzug erreicht ist; der Rest ist durch den Puffer aufgefangen
      let rest = verzug;
      for (let k = massgeblich.liste.length - 1; k >= 0 && rest > 0; k--) {
        const p = massgeblich.liste[k];
        if (p.art === 'zeitgewinn') continue;
        p.gezaehlt = Math.min(p.tage, rest);
        rest -= p.gezaehlt;
      }
    } else {
      blockListe.push({
        art: 'zeitgewinn',
        schluessel: ersteAusf.schluessel,
        text: 'Block früher fertig als geplant',
        tage: -verzug,
        gezaehlt: -verzug,
        seite: null,
        prognose: prognoseVon(ersteAusf),
      });
    }
    posten.push(...blockListe, ...zweige.flatMap((z) => z.liste));
    bloecke.push({
      block: blockId,
      blockDurchgang: u.blockDurchgang,
      art: blockArt,
      eingang: u.e,
      geplanteDauer: plan.dauer,
      geplantesEnde,
      ende: u.ende,
      verzug,
      massgeblicherZweig: massgeblich.zweig,
      terminwirksam: true,
      prognose: u.ausf.some(prognoseVon),
    });
  }

  /* -------- Zuordnung von Hand und Summen -------- */

  const verteilung: Verteilung[] = [];
  for (const a of roh) {
    const eigene = posten.filter((p) => p.schluessel === a.schluessel && p.art !== 'zeitgewinn' && p.gezaehlt > 0);
    const kapazitaet = eigene.reduce((s, p) => s + p.gezaehlt, 0);
    let rest = kapazitaet;
    for (const anteil of a.verzugZuordnung ?? []) {
      if (!(anteil.tage > 0)) continue;
      const n = Math.min(anteil.tage, rest);
      if (anteil.tage > rest) {
        warnungen.push(
          `Zuordnung von Hand bei „${a.name}“ (Durchlauf ${a.durchlauf}) übersteigt den Verzug um ${anteil.tage - rest} ${rahmen.arbeitstage ? 'AT' : 'KT'} (${SEITE_LABEL[anteil.seite]}).`,
        );
      }
      if (n > 0) verteilung.push({ schluessel: a.schluessel, seite: anteil.seite, tage: n, hand: true, grund: anteil.grund, prognose: prognoseVon(a) });
      rest -= n;
    }
    let abzug = kapazitaet - rest;
    for (let k = eigene.length - 1; k >= 0; k--) {
      const p = eigene[k];
      const weg = Math.min(p.gezaehlt, abzug);
      abzug -= weg;
      const bleibt = p.gezaehlt - weg;
      if (bleibt > 0) verteilung.push({ schluessel: a.schluessel, seite: p.seite, tage: bleibt, hand: false, prognose: p.prognose });
    }
  }

  const summen: Record<Seite, number> = { planer: 0, pruefer: 0, auftraggeber: 0, plm: 0 };
  let seiteFehlt = 0;
  for (const v of verteilung) {
    if (v.seite) summen[v.seite] += v.tage;
    else seiteFehlt += v.tage;
  }
  const zeitgewinn = posten.filter((p) => p.art === 'zeitgewinn').reduce((s, p) => s + p.gezaehlt, 0);
  const basisEnde = basis?.planEnde ?? null;
  // Ein abgebrochener Lauf hat kein Ende: Die Posten zeigen den Verzug bis zum Abbruch, ein Gesamtverzug fehlt
  const abgebrochen = run.status === 'abgebrochen';
  if (abgebrochen) {
    warnungen.push(
      `Der Planlauf wurde abgebrochen${run.abbruchDatum ? ` (${run.abbruchDatum})` : ''} – er hat kein Ende; die Posten zeigen den Verzug bis zum Abbruch, ein Gesamtverzug lässt sich nicht bestimmen.`,
    );
  }
  // Altbestand: Durchläufe vor der Umstellung (ohne Historie) fehlen in der Kette
  if (steps.some((s) => (s.durchlauf ?? 1) > (s.historie ?? []).length + 1)) {
    warnungen.push(
      'Frühere Durchläufe einzelner Schritte stammen aus der Zeit vor der Umstellung und sind nicht gespeichert – ihre Zeit erscheint als Übergabelücke, ein Rest ist möglich.',
    );
  }
  const gesamtverzug = basisEnde && ende && !abgebrochen ? t(basisEnde, ende) : null;
  const erklaert = Object.values(summen).reduce((s, n) => s + n, 0) + seiteFehlt - zeitgewinn;
  const nichtErklaert = gesamtverzug === null ? null : gesamtverzug - erklaert;

  const ausfuehrungen: NachweisAusfuehrung[] = roh.map((a) => {
    const { seq: _s, e: _e, i: _i, ende: _en, fertig: _f, mitEingangSoll: _m, anfang: _a, pos: _p, endeGrund: _g, ...rest } = a;
    return rest;
  });

  return {
    arbeitstage: rahmen.arbeitstage,
    ausfuehrungen,
    posten,
    bloecke,
    verteilung,
    summen,
    seiteFehlt,
    zeitgewinn,
    basisEnde,
    ende: abgebrochen ? null : ende,
    endeIstPrognose: laufend,
    gesamtverzug,
    nichtErklaert,
    warnungen,
  };
}
