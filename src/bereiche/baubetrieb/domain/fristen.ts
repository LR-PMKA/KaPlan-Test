/**
 * Fristenrechnung der Baubetriebsplanung: Fahrplanjahre, Fristen laut
 * Richtlinie, die Terminfrist einer Anmeldung in ihrem aktuellen Status,
 * Ampel und der Anmeldebedarf eines Projekts.
 */
import { addDays, diffDays, formatDate, parseISO, toISO, today } from '../../../shared/dates';
import {
  MASSNAHMENARTEN,
  RIL_BEZUG_KUERZEL,
  RIL_LABEL,
  RIL_PHASE,
  type Anmeldung,
  type AnmeldungsArt,
  type BaubetriebDaten,
  type Einstellungen,
  type FristRegel,
  type ID,
  type ISODate,
  type Projekt,
  type RilBezug,
  type RilFrist,
  type RilSchluessel,
  type Workflow,
} from './types';
import { istLeiche, statusVon, type StatusInfo } from './workflow';

/** Was die Fristenrechnung aus dem Bestand braucht. */
export type FristKontext = Pick<BaubetriebDaten, 'einstellungen' | 'workflows' | 'projekte'>;

/* ------------------------------------------------------------------ */
/* Fahrplanjahr                                                        */
/* ------------------------------------------------------------------ */

/**
 * Letzter Tag des Fahrplanjahres N: Fahrplanwechsel ist in der Nacht nach dem
 * zweiten Samstag im Dezember.
 */
export function fahrplanjahrEnde(n: number): ISODate {
  const erster = new Date(n, 11, 1);
  const bisSamstag = (6 - erster.getDay() + 7) % 7;
  return toISO(new Date(n, 11, 1 + bisSamstag + 7));
}

/** Erster Tag des Fahrplanjahres N – der Sonntag nach dem Fahrplanwechsel. */
export function fahrplanjahrBeginn(n: number): ISODate {
  return addDays(fahrplanjahrEnde(n - 1), 1);
}

/** Fahrplanjahr, in das ein Datum fällt. */
export function fahrplanjahrVon(datum: ISODate | null): number | null {
  const d = datum ? parseISO(datum) : null;
  if (!d || !datum) return null;
  const jahr = d.getFullYear();
  return datum > fahrplanjahrEnde(jahr) ? jahr + 1 : jahr;
}

/** Fahrplanjahre eines Zeitraums – höchstens zehn, ohne Beginn keines. */
export function fahrplanjahreZwischen(von: ISODate | null, bis: ISODate | null): number[] {
  const erstes = fahrplanjahrVon(von);
  if (!erstes) return [];
  const letztes = Math.max(erstes, Math.min(fahrplanjahrVon(bis) ?? erstes, erstes + 9));
  return Array.from({ length: letztes - erstes + 1 }, (_, i) => erstes + i);
}

/** Datum TT.MM.JJJJ; ein Tag jenseits des Monatsendes rückt auf den letzten Tag. */
function datumAus(jahr: number, monat: number, tag: number): ISODate {
  const letzter = new Date(jahr, monat, 0).getDate();
  return toISO(new Date(jahr, monat - 1, Math.min(Math.max(1, tag), letzter)));
}

/* ------------------------------------------------------------------ */
/* Richtlinienfristen                                                  */
/* ------------------------------------------------------------------ */

/** Toleranz um den ersten Anmeldetermin, der nur ein ca.-Wert ist. */
const CA_TOLERANZ_TAGE = 31;

/** Ab wann MIC ein Projekt betreut: erster Anmeldetermin abzüglich Toleranz. */
function betreuungAb(p: Pick<Projekt, 'ersterAnmeldetermin'> | undefined): ISODate | null {
  return p?.ersterAnmeldetermin ? addDays(p.ersterAnmeldetermin, -CA_TOLERANZ_TAGE) : null;
}

/** Warum Ril_KM die N-1-Frist nimmt – oder null, wenn die N-2-Frist gilt. */
function kmGrundFuerN1(
  a: Pick<Anmeldung, 'statusSeit' | 'fahrplanjahr' | 'bauVon'>,
  e: Pick<Einstellungen, 'rilFristen'>,
  ab: ISODate | null,
): string | null {
  const n2 = rilDatum(e.rilFristen['N-2'], a.fahrplanjahr, a.bauVon);
  if (!n2) return null;
  if (a.statusSeit > n2) return 'die N-2-Frist war beim Statuswechsel verstrichen';
  if (ab && n2 < ab) return 'die N-2-Frist liegt vor dem ersten Anmeldetermin des Projekts';
  return null;
}

/**
 * Welche Richtlinienfrist gilt. Ril_KM nimmt die N-2-Frist, solange sie am Tag
 * des Statuswechsels nicht verstrichen ist und nicht vor der Betreuung durch
 * MIC (erster Anmeldetermin des Projekts) liegt, sonst die N-1-Frist. Ril_KKM
 * richtet sich nach der Maßnahmenart; Einträge der Art SKM oder MKM rechnen
 * dabei wie A.
 */
export function rilSchluesselFuer(
  bezug: RilBezug,
  a: Pick<Anmeldung, 'art' | 'statusSeit' | 'fahrplanjahr' | 'bauVon'>,
  e: Pick<Einstellungen, 'rilFristen'>,
  ab: ISODate | null = null,
): RilSchluessel {
  switch (bezug) {
    case 'skm':
    case 'mkm':
    case 'N-2':
    case 'A':
      return bezug;
    case 'Nx':
      return kmGrundFuerN1(a, e, ab) ? 'N-1' : 'N-2';
    case 'X':
      return MASSNAHMENARTEN.includes(a.art) ? (a.art as RilSchluessel) : 'A';
  }
}

/** Wochentag Mittwoch (Date.getDay). */
const MITTWOCH = 3;

/** Der Mittwoch an oder vor dem Datum – Stichtag einer Anmeldung im KKM. */
function vorigerMittwoch(datum: ISODate): ISODate {
  const tag = parseISO(datum)?.getDay() ?? MITTWOCH;
  return addDays(datum, -((tag - MITTWOCH + 7) % 7));
}

/**
 * Datum einer Richtlinienfrist für ein Fahrplanjahr bzw. einen Sperrbeginn.
 * Im KKM ist der Stichtag der Anmeldung immer ein Mittwoch: Eine Frist in
 * Wochen vor Sperrbeginn fällt auf den Mittwoch an oder vor diesem Datum.
 */
export function rilDatum(
  frist: RilFrist,
  fahrplanjahr: number | null,
  baubeginn: ISODate | null,
  stichtagMittwoch = false,
): ISODate | null {
  if (frist.bezug === 'stichtag') {
    return fahrplanjahr ? datumAus(fahrplanjahr - frist.jahreVorher, frist.monat, frist.tag) : null;
  }
  if (!baubeginn) return null;
  const datum = addDays(baubeginn, -7 * frist.wochenVorher);
  return stichtagMittwoch ? vorigerMittwoch(datum) : datum;
}

const zweistellig = (n: number) => String(n).padStart(2, '0');

/** „Stichtag 31.03. im Jahr N−4“ bzw. „12 Wochen vor Sperrbeginn“. */
export function rilFristText(frist: RilFrist): string {
  if (frist.bezug === 'stichtag') {
    const jahr = frist.jahreVorher === 0 ? 'N' : `N−${frist.jahreVorher}`;
    return `Stichtag ${zweistellig(frist.tag)}.${zweistellig(frist.monat)}. im Jahr ${jahr}`;
  }
  return `${frist.wochenVorher} ${frist.wochenVorher === 1 ? 'Woche' : 'Wochen'} vor Sperrbeginn`;
}

/** Kurzform der Fristregel eines Status, wie im Lastenheft geschrieben. */
export function fristRegelText(regel: FristRegel): string {
  switch (regel.typ) {
    case 'keine':
      return '.-.';
    case 'stichtag':
      return `Nächster ${regel.tag}.${regel.monat}.`;
    case 'nachhaken':
      return `Nachhak-Termin (+${regel.tage} Tage)`;
    case 'ril': {
      const name = RIL_BEZUG_KUERZEL[regel.bezug];
      if (!regel.versatzTage) return name;
      return `${name} ${regel.versatzTage < 0 ? '−' : '+'} ${Math.abs(regel.versatzTage)} Tage`;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Terminfrist einer Anmeldung                                         */
/* ------------------------------------------------------------------ */

export interface Terminfrist {
  datum: ISODate | null;
  /** Regel in Kurzform, z. B. „Ril_KKM − 14 Tage“. */
  regel: string;
  /** Rechenweg in Worten. */
  erlaeuterung: string;
  manuell: boolean;
  nachhaken: boolean;
  /** Die zugrunde liegende Richtlinienfrist ist noch ein Platzhalter. */
  platzhalter: boolean;
}

/** Terminfrist der Anmeldung in ihrem aktuellen Status. */
export function terminfrist(a: Anmeldung, d: FristKontext): Terminfrist {
  const e = d.einstellungen;
  const { status } = statusVon(d.workflows, a.statusId);
  const regel = fristRegelText(status.frist);
  const basis = { regel, manuell: false, nachhaken: status.nachhaken, platzhalter: false };

  if (a.terminManuell) {
    return {
      ...basis,
      datum: a.terminManuell,
      manuell: true,
      nachhaken: true,
      erlaeuterung: 'Termin von Hand festgelegt',
    };
  }

  switch (status.frist.typ) {
    case 'keine':
      return { ...basis, datum: null, erlaeuterung: 'Keine Terminfrist in diesem Status' };
    case 'stichtag': {
      const { tag, monat } = status.frist;
      const jahr = parseISO(a.statusSeit)?.getFullYear() ?? new Date().getFullYear();
      let datum = datumAus(jahr, monat, tag);
      if (datum < a.statusSeit) datum = datumAus(jahr + 1, monat, tag);
      return { ...basis, datum, erlaeuterung: `Nächster ${tag}.${monat}. nach dem Statuswechsel am ${formatDate(a.statusSeit)}` };
    }
    case 'nachhaken': {
      const tage = status.frist.tage;
      return {
        ...basis,
        datum: addDays(a.statusSeit, tage),
        erlaeuterung: `${tage} Tage nach dem Statuswechsel am ${formatDate(a.statusSeit)}`,
      };
    }
    case 'ril': {
      const ab = betreuungAb(d.projekte.find((p) => p.id === a.projektId));
      const schluessel = rilSchluesselFuer(status.frist.bezug, a, e, ab);
      // Ril_KM: Hinweis, warum die N-1-Frist gilt
      const kmGrund = status.frist.bezug === 'Nx' ? kmGrundFuerN1(a, e, ab) : null;
      const n1 = kmGrund ? ` – ${kmGrund}` : '';
      const ril = e.rilFristen[schluessel];
      const mittwoch = RIL_PHASE[schluessel] === 'kkm' && ril.bezug === 'baubeginn';
      const grund = rilDatum(ril, a.fahrplanjahr, a.bauVon, mittwoch);
      const versatz = status.frist.versatzTage;
      const datum = grund ? addDays(grund, versatz) : null;
      const bezugText =
        ril.bezug === 'stichtag'
          ? a.fahrplanjahr
            ? `Fahrplanjahr ${a.fahrplanjahr}`
            : 'Fahrplanjahr fehlt'
          : a.bauVon
            ? `Sperrbeginn ${formatDate(a.bauVon)}`
            : 'Sperrbeginn fehlt';
      return {
        ...basis,
        datum,
        platzhalter: ril.platzhalter,
        erlaeuterung: `${RIL_LABEL[schluessel]}: ${rilFristText(ril)} (${bezugText})${
          grund ? ` = ${formatDate(grund)}${mittwoch ? ' (Stichtag Mittwoch)' : ''}` : ''
        }${versatz ? `, ${versatz < 0 ? 'abzüglich' : 'zuzüglich'} ${Math.abs(versatz)} Tage` : ''}${n1}`,
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Ampel                                                               */
/* ------------------------------------------------------------------ */

export type Ampel = 'ueberfaellig' | 'faellig' | 'geplant' | 'ohne';

export const AMPEL_LABEL: Record<Ampel, string> = {
  ueberfaellig: 'Überfällig',
  faellig: 'Fällig',
  geplant: 'Im Plan',
  ohne: 'Ohne Frist',
};

export function ampelFuer(datum: ISODate | null, vorlaufTage: number, heute: ISODate = today()): Ampel {
  if (!datum) return 'ohne';
  const rest = diffDays(heute, datum);
  if (rest < 0) return 'ueberfaellig';
  if (rest <= vorlaufTage) return 'faellig';
  return 'geplant';
}

/* ------------------------------------------------------------------ */
/* Offene Termine über alle Projekte                                   */
/* ------------------------------------------------------------------ */

export interface TerminEintrag {
  anmeldung: Anmeldung;
  projekt: Projekt;
  status: StatusInfo;
  frist: Terminfrist;
  ampel: Ampel;
}

/** Reihenfolge nach Dringlichkeit – Überfälliges zuerst. */
export const AMPEL_RANG: Record<Ampel, number> = { ueberfaellig: 0, faellig: 1, geplant: 2, ohne: 3 };

/** Alle Anmeldungen mit Terminfrist – Überfälliges zuerst, dann nach Datum. */
export function offeneTermine(d: BaubetriebDaten, projektIds?: ID[]): TerminEintrag[] {
  const eintraege: TerminEintrag[] = [];
  for (const anmeldung of d.anmeldungen) {
    if (projektIds && !projektIds.includes(anmeldung.projektId)) continue;
    const projekt = d.projekte.find((p) => p.id === anmeldung.projektId);
    if (!projekt) continue;
    const frist = terminfrist(anmeldung, d);
    if (!frist.datum) continue;
    eintraege.push({
      anmeldung,
      projekt,
      status: statusVon(d.workflows, anmeldung.statusId),
      frist,
      ampel: ampelFuer(frist.datum, d.einstellungen.vorlaufTage),
    });
  }
  return eintraege.sort(
    (a, b) => AMPEL_RANG[a.ampel] - AMPEL_RANG[b.ampel] || (a.frist.datum ?? '').localeCompare(b.frist.datum ?? ''),
  );
}

/* ------------------------------------------------------------------ */
/* Erstanmeldung                                                       */
/* ------------------------------------------------------------------ */

/** Woher die Frist der Erstanmeldung stammt. */
export type ErstanmeldungGrund = 'eingetragen' | 'vorschlag';

export const ERSTANMELDUNG_GRUND: Record<ErstanmeldungGrund, string> = {
  eingetragen: 'Erster Anmeldetermin (ca.) laut Projekt',
  vorschlag: 'laut Richtlinie ermittelt – im Projekt kein erster Anmeldetermin eingetragen',
};

/** Projekt ohne Anmeldung: Die Erstanmeldung steht aus. */
export interface ErstanmeldungEintrag {
  projekt: Projekt;
  /** Frist der Erstanmeldung – der erste Anmeldetermin, sonst der Vorschlag laut Richtlinie. */
  frist: ISODate | null;
  grund: ErstanmeldungGrund;
  ampel: Ampel;
}

/**
 * Ausstehende Erstanmeldung eines Projekts, solange es keine Anmeldung hat
 * (Anmeldeleichen zählen nicht) und nicht abgeschlossen ist – sonst null.
 */
export function erstanmeldungAusstehend(p: Projekt, d: BaubetriebDaten): ErstanmeldungEintrag | null {
  if (p.status === 'abgeschlossen') return null;
  if (d.anmeldungen.some((a) => a.projektId === p.id && !istLeiche(d.workflows, a.statusId))) return null;
  const frist = p.ersterAnmeldetermin ?? ersterTerminVorschlag(p, d.einstellungen);
  return {
    projekt: p,
    frist,
    grund: p.ersterAnmeldetermin ? 'eingetragen' : 'vorschlag',
    ampel: ampelFuer(frist, d.einstellungen.vorlaufTage),
  };
}

/** Alle (bzw. die genannten) Projekte mit ausstehender Erstanmeldung – Überfälliges zuerst. */
export function ausstehendeErstanmeldungen(d: BaubetriebDaten, projektIds?: ID[]): ErstanmeldungEintrag[] {
  return d.projekte
    .filter((p) => !projektIds || projektIds.includes(p.id))
    .map((p) => erstanmeldungAusstehend(p, d))
    .filter((e): e is ErstanmeldungEintrag => e !== null)
    .sort((a, b) => AMPEL_RANG[a.ampel] - AMPEL_RANG[b.ampel] || (a.frist ?? '').localeCompare(b.frist ?? ''));
}

/* ------------------------------------------------------------------ */
/* Anmeldebedarf eines Projekts                                        */
/* ------------------------------------------------------------------ */

/** Prozessphasen mit festem Anmeldetermin je Fahrplanjahr: SKM, MKM, KM N-2 und KM N-1. */
export type BedarfPhase = 'skm' | 'mkm' | 'N-2' | 'N-1';

export const BEDARF_PHASEN: BedarfPhase[] = ['skm', 'mkm', 'N-2', 'N-1'];

const BEDARF_RANG: Record<BedarfPhase, number> = { skm: 0, mkm: 1, 'N-2': 2, 'N-1': 3 };

/**
 * Wie weit eine Maßnahmenart im Ablauf steht – spätere Phasen decken frühere
 * ab. Einträge in KM und KKM (A, B, C …) decken beide KM-Fristen ab: Ob N-2
 * oder N-1 gilt, entscheidet der Zeitpunkt, nicht die Art.
 */
function rangDerArt(art: AnmeldungsArt): number {
  switch (art) {
    case 'SKM':
      return 0;
    case 'MKM':
      return 1;
    default:
      return 3;
  }
}

export type BedarfZustand = 'abgedeckt' | 'faellig' | 'kuenftig' | 'verstrichen' | 'vorBeginn' | 'offen';

export interface BedarfZelle {
  phase: BedarfPhase;
  fahrplanjahr: number;
  frist: ISODate | null;
  zustand: BedarfZustand;
  /** Eintrag, der diese Phase für das Fahrplanjahr abdeckt. */
  durch?: Anmeldung;
}

export interface BedarfZeile {
  fahrplanjahr: number;
  zellen: BedarfZelle[];
}

/**
 * Anmeldebedarf je betroffenem Fahrplanjahr: Für SKM, MKM, KM N-2 und KM N-1
 * die Frist laut Richtlinie und ob das Projekt dafür schon einen Eintrag hat.
 * Anmeldeleichen zählen nicht mit. Fristen vor dem ersten Anmeldetermin
 * liegen vor der Betreuung durch MIC.
 */
export function anmeldebedarf(
  p: Projekt,
  d: Pick<BaubetriebDaten, 'anmeldungen' | 'workflows' | 'einstellungen'>,
  heute: ISODate = today(),
): BedarfZeile[] {
  const e = d.einstellungen;
  const eigene = d.anmeldungen.filter((a) => a.projektId === p.id && !istLeiche(d.workflows, a.statusId));
  const beginnGrenze = betreuungAb(p);
  // Bei gleichem Rang zählt der frühere Workflow – ein KM-Eintrag vor einem KKM-Eintrag.
  const workflowRang = (a: Anmeldung) => {
    const i = d.workflows.findIndex((w) => w.status.some((s) => s.id === a.statusId));
    return i < 0 ? d.workflows.length : i;
  };

  const zeilen: BedarfZeile[] = [];
  for (const n of [...p.fahrplanjahre].sort((a, b) => a - b)) {
    const baubeginn = fahrplanjahrBeginn(n);
    const zellen = BEDARF_PHASEN.map((phase): BedarfZelle => {
      const frist = rilDatum(e.rilFristen[phase], n, baubeginn);
      const durch = eigene
        .filter((a) => a.fahrplanjahr === n && rangDerArt(a.art) >= BEDARF_RANG[phase])
        .sort((a, b) => rangDerArt(a.art) - rangDerArt(b.art) || workflowRang(a) - workflowRang(b))[0];
      let zustand: BedarfZustand;
      if (durch) zustand = 'abgedeckt';
      else if (!frist) zustand = 'offen';
      else if (beginnGrenze && frist < beginnGrenze) zustand = 'vorBeginn';
      else if (frist < heute) zustand = 'verstrichen';
      else if (diffDays(heute, frist) <= e.bedarfVorschauTage) zustand = 'faellig';
      else zustand = 'kuenftig';
      return { phase, fahrplanjahr: n, frist, zustand, durch };
    });
    zeilen.push({ fahrplanjahr: n, zellen });
  }
  return zeilen;
}

/** Nächster offener Anmeldetermin des Projekts, sonst null. */
export function naechsterBedarf(zeilen: BedarfZeile[]): BedarfZelle | null {
  const offen = zeilen
    .flatMap((z) => z.zellen)
    .filter((z) => (z.zustand === 'faellig' || z.zustand === 'kuenftig') && z.frist)
    .sort((a, b) => a.frist!.localeCompare(b.frist!));
  return offen[0] ?? null;
}

export interface BedarfEintrag {
  projekt: Projekt;
  zelle: BedarfZelle;
}

/** Anmeldebedarf aller (bzw. der genannten) Projekte, der in die Vorschau fällt. */
export function faelligerBedarf(d: BaubetriebDaten, projektIds?: ID[]): BedarfEintrag[] {
  return d.projekte
    .filter((p) => p.status !== 'abgeschlossen' && (!projektIds || projektIds.includes(p.id)))
    .flatMap((projekt) =>
      anmeldebedarf(projekt, d)
        .flatMap((z) => z.zellen)
        .filter((zelle) => zelle.zustand === 'faellig')
        .map((zelle) => ({ projekt, zelle })),
    )
    .sort((a, b) => (a.zelle.frist ?? '').localeCompare(b.zelle.frist ?? ''));
}

/**
 * Vorschlag für den ersten Anmeldetermin eines Projekts: die Frist laut
 * Richtlinie für die gewählte Prozessphase und das erste betroffene
 * Fahrplanjahr (im KKM für eine Sperrpause ab Beginn des Fahrplanjahres).
 */
export function ersterTerminVorschlag(
  p: Pick<Projekt, 'erstePhase' | 'fahrplanjahre'>,
  e: Einstellungen,
): ISODate | null {
  if (p.fahrplanjahre.length === 0) return null;
  const n = Math.min(...p.fahrplanjahre);
  const schluessel: RilSchluessel = p.erstePhase === 'kkm' ? 'A' : p.erstePhase;
  return rilDatum(e.rilFristen[schluessel], n, fahrplanjahrBeginn(n), RIL_PHASE[schluessel] === 'kkm');
}

/* ------------------------------------------------------------------ */
/* Darstellung                                                         */
/* ------------------------------------------------------------------ */

/** Der Workflow führt den Sperrzeitraum als ganzes Fahrplanjahr. */
export function ganzesFahrplanjahr(workflow: Pick<Workflow, 'bauzeitraum'>): boolean {
  return workflow.bauzeitraum === 'fahrplanjahr';
}

/** „Fahrplanjahr 2029“ bzw. „03.03.2027 – 17.03.2027“. */
export function bauzeitraumText(
  a: Pick<Anmeldung, 'bauVon' | 'bauBis' | 'fahrplanjahr' | 'statusId'>,
  workflows: Workflow[],
): string {
  if (ganzesFahrplanjahr(statusVon(workflows, a.statusId).workflow) && a.fahrplanjahr) {
    return `Fahrplanjahr ${a.fahrplanjahr}`;
  }
  if (!a.bauVon && !a.bauBis) return '–';
  return `${formatDate(a.bauVon)} – ${formatDate(a.bauBis)}`;
}
