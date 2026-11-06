/**
 * Auswertung für das Controlling: Stunden je Mitarbeiter und Projekt, je
 * Mitarbeiter und Monat sowie je Projekt mit erfasst, Aufschlag, abgerechnet
 * und „ohne Nachweis“ – für einen Zeitraum, wahlweise nur ein Projekt bzw.
 * ein Mitarbeiter. Alles rein; was die Ansicht zeigen darf, entscheidet
 * domain/rechte.ts (`darf(d, 'auswertung')`).
 *
 * Erfasst sind die Stunden der Leistungen im Zeitraum. Aufschläge gehören zu
 * Nachweiszeilen und zählen für den Zeitraum, in dem ihre Zeile beginnt
 * (bei abgeschlossenen Nachweisen aus dem festgeschriebenen Stand). Einer
 * Person lassen sie sich nicht zurechnen – mit Mitarbeiterfilter bleiben sie
 * außen vor (`mitAufschlag` false). Abgerechnet = erfasst + Aufschlag.
 */
import { leistungenOhneNachweis, nachweisFuer, zeilenFuerAnzeige } from './nachweis';
import { mitarbeiterName, type ID, type ISODate, type Leistung, type LeistungsnachweisDaten } from './types';
import { imZeitraum, monatsanfang, monatsende, monatText, monatVersetzt, runden } from './zeitraum';

/** Zeitraum und Filter der Auswertung. */
export interface AuswertungFilter {
  von: ISODate;
  bis: ISODate;
  /** Nur dieses Projekt; null/fehlend = alle. */
  projektId?: ID | null;
  /** Nur dieser Mitarbeiter; null/fehlend = alle. */
  mitarbeiterId?: ID | null;
}

/** Art des Zeitraums in der Auswahl. */
export type ZeitraumArt = 'monat' | 'quartal' | 'jahr' | 'frei';

/** Monat, Quartal oder Jahr, in dem das Datum liegt. */
export function zeitraumVon(art: Exclude<ZeitraumArt, 'frei'>, datum: ISODate): { von: ISODate; bis: ISODate } {
  if (art === 'monat') return { von: monatsanfang(datum), bis: monatsende(datum) };
  const jahr = datum.slice(0, 4);
  if (art === 'jahr') return { von: `${jahr}-01-01`, bis: `${jahr}-12-31` };
  const monat = Number(datum.slice(5, 7));
  const erster = `${jahr}-${String(Math.floor((monat - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  return { von: erster, bis: monatsende(monatVersetzt(erster, 2)) };
}

/** Bezeichnung eines Zeitraums: „Oktober 2026“, „Q4 2026“, „2026“, sonst „01.10.2026 – 15.11.2026“. */
export function zeitraumBezeichnung(von: ISODate, bis: ISODate): string {
  const voll = von === monatsanfang(von) && bis === monatsende(bis);
  if (voll && von.slice(0, 7) === bis.slice(0, 7)) return monatText(von);
  if (voll && von.slice(5) === '01-01' && bis.slice(5) === '12-31' && von.slice(0, 4) === bis.slice(0, 4)) return von.slice(0, 4);
  const q = (Number(von.slice(5, 7)) - 1) / 3;
  if (voll && Number.isInteger(q) && von.slice(0, 4) === bis.slice(0, 4) && monatVersetzt(von, 2).slice(0, 7) === bis.slice(0, 7)) {
    return `Q${q + 1} ${von.slice(0, 4)}`;
  }
  const lang = (d: ISODate) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
  return von === bis ? lang(von) : `${lang(von)} – ${lang(bis)}`;
}

/** Monate (JJJJ-MM), die der Zeitraum berührt, aufsteigend. */
export function monateIm(von: ISODate, bis: ISODate): string[] {
  if (!von || !bis || von > bis) return [];
  const monate: string[] = [];
  for (let m = monatsanfang(von); m <= bis; m = monatVersetzt(m, 1)) monate.push(m.slice(0, 7));
  return monate;
}

const passt = (filter: AuswertungFilter, l: Pick<Leistung, 'projektId' | 'mitarbeiterId' | 'datum'>) =>
  imZeitraum(l.datum, filter.von, filter.bis) &&
  (!filter.projektId || l.projektId === filter.projektId) &&
  (!filter.mitarbeiterId || l.mitarbeiterId === filter.mitarbeiterId);

/** Leistungen im Zeitraum und nach den Filtern, nach Datum sortiert. */
export function leistungenFuer(daten: Pick<LeistungsnachweisDaten, 'leistungen'>, filter: AuswertungFilter): Leistung[] {
  return daten.leistungen
    .filter((l) => passt(filter, l))
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
}

const addieren = (ziel: Record<string, number>, k: string, v: number) => {
  ziel[k] = runden((ziel[k] ?? 0) + v);
};

/** Name zur Anzeige; unbekannte Mitarbeiter „?“. */
function nameVon(daten: Pick<LeistungsnachweisDaten, 'mitarbeiter'>, id: ID): { name: string; kuerzel: string } {
  const m = daten.mitarbeiter.find((x) => x.id === id);
  return m ? { name: mitarbeiterName(m) || m.kuerzel || '?', kuerzel: m.kuerzel } : { name: '?', kuerzel: '' };
}

/** Eine Zeile einer Tabelle „Stunden je Mitarbeiter …“. */
export interface MitarbeiterZeile {
  mitarbeiterId: ID;
  name: string;
  kuerzel: string;
  /** Stunden je Spalte (Projekt-ID bzw. Monat JJJJ-MM). */
  werte: Record<string, number>;
  summe: number;
}

/** Tabelle Mitarbeiter × Spalten mit Summen je Spalte (Fußzeile). */
export interface MitarbeiterTabelle {
  /** Spalten (Projekt-IDs nach Nummer bzw. Monate), nur mit Stunden. */
  spalten: string[];
  zeilen: MitarbeiterZeile[];
  summen: Record<string, number>;
  summe: number;
}

function tabelle(daten: LeistungsnachweisDaten, leistungen: Leistung[], spalteVon: (l: Leistung) => string, spalten: string[]): MitarbeiterTabelle {
  const je = new Map<ID, Record<string, number>>();
  const summen: Record<string, number> = {};
  for (const l of leistungen) {
    const k = spalteVon(l);
    const werte = je.get(l.mitarbeiterId) ?? {};
    addieren(werte, k, l.stunden);
    je.set(l.mitarbeiterId, werte);
    addieren(summen, k, l.stunden);
  }
  const zeilen = [...je.entries()]
    .map(([mitarbeiterId, werte]): MitarbeiterZeile => ({
      mitarbeiterId,
      ...nameVon(daten, mitarbeiterId),
      werte,
      summe: runden(Object.values(werte).reduce((s, v) => s + v, 0)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return {
    spalten: spalten.filter((s) => (summen[s] ?? 0) !== 0),
    zeilen,
    summen,
    summe: runden(Object.values(summen).reduce((s, v) => s + v, 0)),
  };
}

/** Projekt-IDs in der Reihenfolge ihrer Nummer. */
function projektReihenfolge(daten: Pick<LeistungsnachweisDaten, 'projekte'>): ID[] {
  return [...daten.projekte]
    .sort((a, b) => a.nummer.localeCompare(b.nummer, 'de', { numeric: true }) || a.name.localeCompare(b.name, 'de'))
    .map((p) => p.id);
}

/** Tabelle „Stunden je Mitarbeiter“: Zeilen Mitarbeiter, Spalten Projekte (erfasst). */
export function stundenJeMitarbeiter(daten: LeistungsnachweisDaten, filter: AuswertungFilter): MitarbeiterTabelle {
  return tabelle(daten, leistungenFuer(daten, filter), (l) => l.projektId, projektReihenfolge(daten));
}

/** Tabelle „Stunden je Mitarbeiter und Monat“: Zeilen Mitarbeiter, Spalten Monate JJJJ-MM (erfasst). */
export function stundenJeMitarbeiterUndMonat(daten: LeistungsnachweisDaten, filter: AuswertungFilter): MitarbeiterTabelle {
  const t = tabelle(daten, leistungenFuer(daten, filter), (l) => l.datum.slice(0, 7), monateIm(filter.von, filter.bis));
  // Alle Monate des Zeitraums als Spalten – auch ohne Stunden
  return { ...t, spalten: monateIm(filter.von, filter.bis) };
}

/**
 * Aufschläge im Zeitraum je Projekt: Summe der wirksamen Aufschläge aller
 * Nachweiszeilen, die im Zeitraum beginnen (abgeschlossene Nachweise aus dem
 * Stand). Ohne Mitarbeiterfilter; mit ihm leer.
 */
export function aufschlaegeJeProjekt(daten: LeistungsnachweisDaten, filter: AuswertungFilter): Record<ID, number> {
  const ergebnis: Record<ID, number> = {};
  if (filter.mitarbeiterId) return ergebnis;
  for (const n of daten.nachweise) {
    if (filter.projektId && n.projektId !== filter.projektId) continue;
    if (n.bis < filter.von || n.von > filter.bis) continue;
    for (const z of zeilenFuerAnzeige(daten, n)) {
      if (z.aufschlag !== 0 && imZeitraum(z.von, filter.von, filter.bis)) addieren(ergebnis, n.projektId, z.aufschlag);
    }
  }
  return ergebnis;
}

/** Eine Zeile der Tabelle „Stunden je Projekt“. */
export interface ProjektZeile {
  projektId: ID;
  nummer: string;
  name: string;
  erfasst: number;
  aufschlag: number;
  abgerechnet: number;
  /** Erfasste Stunden von Leistungen, die in keinem Nachweis liegen. */
  ohneNachweis: number;
}

/** Tabelle „Stunden je Projekt“ – Projekte mit Stunden oder Aufschlag im Zeitraum, nach Nummer. */
export function stundenJeProjekt(daten: LeistungsnachweisDaten, filter: AuswertungFilter): ProjektZeile[] {
  const leistungen = leistungenFuer(daten, filter);
  const aufschlaege = aufschlaegeJeProjekt(daten, filter);
  const erfasst: Record<ID, number> = {};
  const ohne: Record<ID, number> = {};
  for (const l of leistungen) {
    addieren(erfasst, l.projektId, l.stunden);
    if (!nachweisFuer(daten, l.projektId, l.datum)) addieren(ohne, l.projektId, l.stunden);
  }
  return projektReihenfolge(daten)
    .filter((id) => (erfasst[id] ?? 0) !== 0 || (aufschlaege[id] ?? 0) !== 0)
    .map((id): ProjektZeile => {
      const p = daten.projekte.find((x) => x.id === id)!;
      const e = erfasst[id] ?? 0;
      const a = aufschlaege[id] ?? 0;
      return { projektId: id, nummer: p.nummer, name: p.name, erfasst: e, aufschlag: a, abgerechnet: Math.max(0, runden(e + a)), ohneNachweis: ohne[id] ?? 0 };
    });
}

/** Kennzahlen der Auswertung. */
export interface AuswertungKennzahlen {
  erfasst: number;
  aufschlag: number;
  abgerechnet: number;
  /** Zahl der Mitarbeiter mit Stunden im Zeitraum. */
  mitarbeiter: number;
  /** Erfasste Stunden ohne Nachweis. */
  ohneNachweis: number;
  /** false mit Mitarbeiterfilter: Aufschläge lassen sich keiner Person zurechnen. */
  mitAufschlag: boolean;
}

/** Kennzahlen: Stunden erfasst, Aufschlag, abgerechnet, Mitarbeiter mit Stunden. */
export function auswertungKennzahlen(daten: LeistungsnachweisDaten, filter: AuswertungFilter): AuswertungKennzahlen {
  const projekte = stundenJeProjekt(daten, filter);
  const summe = (f: 'erfasst' | 'aufschlag' | 'abgerechnet' | 'ohneNachweis') => runden(projekte.reduce((s, p) => s + p[f], 0));
  return {
    erfasst: summe('erfasst'),
    aufschlag: summe('aufschlag'),
    abgerechnet: summe('abgerechnet'),
    mitarbeiter: new Set(leistungenFuer(daten, filter).map((l) => l.mitarbeiterId)).size,
    ohneNachweis: summe('ohneNachweis'),
    mitAufschlag: !filter.mitarbeiterId,
  };
}

/** Die ganze Auswertung auf einmal (für Ansicht und Excel). */
export interface Auswertung {
  filter: AuswertungFilter;
  kennzahlen: AuswertungKennzahlen;
  jeMitarbeiter: MitarbeiterTabelle;
  /** Nur sinnvoll bei mehr als einem Monat im Zeitraum (`monate.length > 1`). */
  jeMitarbeiterUndMonat: MitarbeiterTabelle;
  jeProjekt: ProjektZeile[];
  monate: string[];
  leistungen: Leistung[];
}

export function auswertung(daten: LeistungsnachweisDaten, filter: AuswertungFilter): Auswertung {
  return {
    filter,
    kennzahlen: auswertungKennzahlen(daten, filter),
    jeMitarbeiter: stundenJeMitarbeiter(daten, filter),
    jeMitarbeiterUndMonat: stundenJeMitarbeiterUndMonat(daten, filter),
    jeProjekt: stundenJeProjekt(daten, filter),
    monate: monateIm(filter.von, filter.bis),
    leistungen: leistungenFuer(daten, filter),
  };
}

/** Erfasste Stunden einer Person im Zeitraum (Reiter „Mitarbeiter“: laufender Monat). */
export function stundenVonMitarbeiter(daten: Pick<LeistungsnachweisDaten, 'leistungen'>, mitarbeiterId: ID, von: ISODate, bis: ISODate): number {
  return runden(
    daten.leistungen.filter((l) => l.mitarbeiterId === mitarbeiterId && imZeitraum(l.datum, von, bis)).reduce((s, l) => s + l.stunden, 0),
  );
}

/** Zahl der Leistungen ohne Nachweis im Zeitraum (über alle bzw. das gefilterte Projekt). */
export function anzahlOhneNachweis(daten: LeistungsnachweisDaten, filter: AuswertungFilter): number {
  return leistungenOhneNachweis(daten, filter.projektId ?? undefined).filter((l) => passt(filter, l)).length;
}
