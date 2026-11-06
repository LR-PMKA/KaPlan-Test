/**
 * Leistungsnachweise aus den Leistungen eines Projekts. Ein Nachweis ist nur
 * ein Zeitraum; welche Leistungen er zeigt, ergibt sich allein aus deren
 * Datum. Seine Zeilen – je Tag, Woche oder Monat mit Leistungen – werden
 * jedes Mal neu gerechnet (`nachweisZeilen`); nur von Hand bearbeitete Texte
 * (`texte`) und beim Abschluss der festgeschriebene Stand (`stand`) werden
 * gespeichert.
 *
 * Nachweise eines Projekts überschneiden sich nie (`ueberschneidung`). Fehlt
 * für Leistungen ein Nachweis, legt `nachweiseErgaenzen` ihn nach der
 * Zeitraumregel des Projekts an oder verlängert den offenen. Beim Abschluss
 * eines fortlaufenden Nachweises endet sein Zeitraum am letzten Tag mit
 * Leistungen (`nachweisAbschliessenAnwenden`); abgeschlossene Nachweise
 * wachsen nie.
 *
 * Aufschläge des Controllings (`aufschlaege`, ± Stunden je Zeile und
 * Abschnitt) ändern die erfassten Stunden nicht; jede Zeile weist erfasst,
 * Aufschlag und abgerechnet aus (`abrechnen`).
 *
 * Alle Funktionen sind rein; Kennungen liefert der Aufrufer.
 */
import { addDays, toISO } from '../../../shared/dates';
import {
  OHNE_ABSCHNITT,
  aufschlagSchluessel,
  mitarbeiterName,
  type Abschnitt,
  type ID,
  type ISODate,
  type Leistung,
  type Leistungsnachweis,
  type LeistungsnachweisDaten,
  type NachweisStand,
  type NachweisZeile,
  type Projekt,
  type Raster,
} from './types';
import {
  datumText,
  imZeitraum,
  istDatum,
  istWochenende,
  monatsanfang,
  monatsende,
  periodeKuerzen,
  periodeVon,
  runden,
  zeitraumText,
} from './zeitraum';

const nachDatum = (a: { datum: ISODate }, b: { datum: ISODate }) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0);

/** Leistungen des Projekts im Zeitraum [von, bis], nach Datum sortiert. */
export function leistungenIm(daten: LeistungsnachweisDaten, projektId: ID, von: ISODate, bis: ISODate): Leistung[] {
  return daten.leistungen.filter((l) => l.projektId === projektId && imZeitraum(l.datum, von, bis)).sort(nachDatum);
}

/** Nachweis des Projekts, dessen Zeitraum das Datum enthält. */
export function nachweisFuer(daten: LeistungsnachweisDaten, projektId: ID, datum: ISODate): Leistungsnachweis | undefined {
  return daten.nachweise.find((n) => n.projektId === projektId && imZeitraum(datum, n.von, n.bis));
}

/** Leistungen des Projekts (ohne `projektId`: aller Projekte), die in keinem Nachweis liegen. */
export function leistungenOhneNachweis(daten: LeistungsnachweisDaten, projektId?: ID): Leistung[] {
  return daten.leistungen.filter(
    (l) => (projektId === undefined || l.projektId === projektId) && !nachweisFuer(daten, l.projektId, l.datum),
  );
}

/** Nachweise des Projekts nach `von` sortiert. */
export function nachweiseVon(daten: LeistungsnachweisDaten, projektId: ID): Leistungsnachweis[] {
  return daten.nachweise
    .filter((n) => n.projektId === projektId)
    .sort((a, b) => (a.von < b.von ? -1 : a.von > b.von ? 1 : 0));
}

/** Anderer Nachweis desselben Projekts, mit dem sich [von, bis] überschneidet (ohne `ohneId`). */
export function ueberschneidung(
  daten: Pick<LeistungsnachweisDaten, 'nachweise'>,
  projektId: ID,
  von: ISODate,
  bis: ISODate,
  ohneId?: ID,
): Leistungsnachweis | undefined {
  return daten.nachweise.find((n) => n.projektId === projektId && n.id !== ohneId && n.von <= bis && von <= n.bis);
}

/* ------------------------------------------------------------------ */
/* Leistungstexte                                                      */
/* ------------------------------------------------------------------ */

/** Vergleichsform eines Textteils: ohne Rücksicht auf Groß-/Kleinschreibung und Leerraum. */
export function textSchluessel(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '');
}

/** Platzhalter für ein Dezimalkomma beim Zerlegen. */
const DEZIMALKOMMA = '\u0000';

/**
 * Teile eines Leistungstexts: an „,“ und „;“ zerlegt, ohne leere Teile;
 * Zeilenumbrüche bleiben. Ein Komma zwischen zwei Ziffern trennt nicht – es
 * ist ein Dezimalkomma („km 12,5“, „45,300 bis 45,800“).
 */
export function textTeile(text: string): string[] {
  // Dezimalkommas vorübergehend verdecken (ohne Lookbehind, damit auch ältere Browser den Code laden)
  return text
    .replace(/(\d),(?=\d)/g, `$1${DEZIMALKOMMA}`)
    .split(/[,;]/)
    .map((t) => t.split(DEZIMALKOMMA).join(',').trim())
    .filter(Boolean);
}

/** Teile der Leistungen in zeitlicher Reihenfolge, Dubletten entfernt. */
function teileVon(leistungen: Leistung[]): string[] {
  const gesehen = new Set<string>();
  const teile: string[] = [];
  for (const l of [...leistungen].sort(nachDatum)) {
    for (const teil of textTeile(l.text)) {
      const k = textSchluessel(teil);
      if (gesehen.has(k)) continue;
      gesehen.add(k);
      teile.push(teil);
    }
  }
  return teile;
}

/**
 * Automatischer Leistungstext einer Zeile: die Texte der Leistungen in zeitlicher Reihenfolge,
 * an „,“ und „;“ in Teile zerlegt (nicht an Dezimalkommas, `textTeile`), Dubletten (ohne
 * Rücksicht auf Groß-/Kleinschreibung und Leerraum) entfernt, mit „, “ verbunden.
 * Zeilenumbrüche im Text bleiben erhalten.
 */
export function automatikText(leistungen: Leistung[]): string {
  return teileVon(leistungen).join(', ');
}

/** Kommt der Teil im Text vor – als ganze Wörter, ohne Rücksicht auf Groß-/Kleinschreibung und Leerraum? */
function kommtVor(text: string, teil: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const t = norm(teil);
  if (!t) return true;
  const muster = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${muster}($|[^\\p{L}\\p{N}])`, 'u').test(norm(text));
}

/** Text um die automatischen Teile neuer Leistungen ergänzen, die noch nicht im Text vorkommen. */
export function textErgaenzen(text: string, neue: Leistung[]): string {
  const fehlend = teileVon(neue).filter((teil) => !kommtVor(text, teil));
  if (fehlend.length === 0) return text;
  const basis = text.replace(/\s+$/, '');
  return basis ? `${basis}, ${fehlend.join(', ')}` : fehlend.join(', ');
}

/* ------------------------------------------------------------------ */
/* Zeilen                                                              */
/* ------------------------------------------------------------------ */

const addieren = (ziel: Record<string, number>, schluessel: string, stunden: number) => {
  ziel[schluessel] = (ziel[schluessel] ?? 0) + stunden;
};

const gerundet = (werte: Record<string, number>) =>
  Object.fromEntries(Object.entries(werte).map(([k, v]) => [k, runden(v)]));

/* ------------------------------------------------------------------ */
/* Aufschläge                                                          */
/* ------------------------------------------------------------------ */

/** Ab so vielen Abschnitten weist ein Nachweis die Stunden je Abschnitt in eigenen Spalten aus (wie die Vorlage Woche.xlsx). */
export const ABSCHNITTSSPALTEN_AB = 2;

/**
 * Zeigt ein Nachweis die Stunden je Abschnitt in eigenen Spalten? Erst ab zwei
 * Abschnitten; mit einem oder keinem steht nur eine Stundenspalte da (wie die
 * Vorlage Monat.xlsx). Danach richten sich auch die Aufschläge: mit Spalten je
 * Abschnitt (und „ohne“), sonst einer je Zeile (`abschnittId` null).
 */
export function mitAbschnittsspalten(abschnitte: Pick<Abschnitt, 'id'>[]): boolean {
  return abschnitte.length >= ABSCHNITTSSPALTEN_AB;
}

/** Meldung bei einer Aufschlags-Eingabe, die keine Zahl ist (wörtlich). */
export const AUFSCHLAG_KEINE_ZAHL = 'Bitte eine Zahl angeben, z. B. 1,5 oder -0,5.';
/** Meldung, wenn ein Aufschlag die abgerechneten Stunden unter 0 drückte (wörtlich). */
export const AUFSCHLAG_UNTER_NULL = 'Abgerechnet kann nicht unter 0 Std. liegen.';

/**
 * Aufschläge einer Zeile, die wirken: Schlüssel ist der Abschnitt
 * (`OHNE_ABSCHNITT` für „ohne“ bzw. die ganze Zeile). Mit Abschnittsspalten
 * zählen die Abschnitte des Projekts und „ohne“, sonst nur „ohne“; alle
 * anderen bleiben stehen, wirken aber nicht.
 */
function aufschlaegeDerZeile(
  aufschlaege: Record<string, number>,
  zeilenSchluessel: string,
  abschnittIds: Set<ID>,
  spalten: boolean,
): Record<string, number> {
  const praefix = `${zeilenSchluessel}|`;
  const ergebnis: Record<string, number> = {};
  for (const [k, wert] of Object.entries(aufschlaege)) {
    if (!k.startsWith(praefix) || !Number.isFinite(wert) || wert === 0) continue;
    const abschnitt = k.slice(praefix.length);
    if (abschnitt === OHNE_ABSCHNITT || (spalten && abschnittIds.has(abschnitt))) ergebnis[abschnitt] = wert;
  }
  return ergebnis;
}

/** Ergebnis von `abrechnen`. */
interface Abrechnung {
  aufschlag: number;
  aufschlagJeAbschnitt: Record<string, number>;
  abgerechnet: number;
  abgerechnetJeAbschnitt: Record<string, number>;
  /** Summe nach den Aufschlägen der Abschnitte, vor dem der ganzen Zeile („ohne“). */
  vorZeile: number;
}

/**
 * Abgerechnete Stunden einer Zeile aus den erfassten je Abschnitt und den
 * Aufschlägen: Ein Aufschlag auf einen Abschnitt wirkt in dessen Spalte (nie
 * unter 0). Der Aufschlag „ohne“ gilt der ganzen Zeile: Mehr Stunden kommen
 * in die Spalte „ohne“, weniger mindern zuerst „ohne“, dann die übrigen
 * Abschnitte der Reihe nach – so ist `abgerechnet` stets die Summe der
 * Spalten und nie unter 0.
 */
function abrechnen(stundenJeAbschnitt: Record<string, number>, eingaben: Record<string, number>): Abrechnung {
  const werte: Record<string, number> = { ...stundenJeAbschnitt };
  for (const [k, v] of Object.entries(eingaben)) {
    if (k === OHNE_ABSCHNITT) continue;
    werte[k] = Math.max(0, runden((werte[k] ?? 0) + v));
  }
  const vorZeile = runden(Object.values(werte).reduce((s, v) => s + v, 0));
  const zeile = eingaben[OHNE_ABSCHNITT] ?? 0;
  if (zeile > 0) werte[OHNE_ABSCHNITT] = runden((werte[OHNE_ABSCHNITT] ?? 0) + zeile);
  else if (zeile < 0) {
    let rest = -zeile;
    const reihenfolge = [OHNE_ABSCHNITT, ...Object.keys(werte).filter((k) => k !== OHNE_ABSCHNITT)];
    for (const k of reihenfolge) {
      if (rest <= 0) break;
      const vorhanden = werte[k] ?? 0;
      if (vorhanden <= 0) continue;
      const weg = Math.min(vorhanden, rest);
      werte[k] = runden(vorhanden - weg);
      rest = runden(rest - weg);
    }
  }
  const abgerechnetJeAbschnitt: Record<string, number> = {};
  const aufschlagJeAbschnitt: Record<string, number> = {};
  for (const [k, v] of Object.entries(werte)) {
    const erfasst = stundenJeAbschnitt[k];
    if (erfasst !== undefined || v !== 0) abgerechnetJeAbschnitt[k] = runden(v);
    const differenz = runden(v - (erfasst ?? 0));
    if (differenz !== 0) aufschlagJeAbschnitt[k] = differenz;
  }
  const abgerechnet = runden(Object.values(abgerechnetJeAbschnitt).reduce((s, v) => s + v, 0));
  const erfasst = runden(Object.values(stundenJeAbschnitt).reduce((s, v) => s + v, 0));
  return { aufschlag: runden(abgerechnet - erfasst), aufschlagJeAbschnitt, abgerechnet, abgerechnetJeAbschnitt, vorZeile };
}

/** Eingegebener Aufschlag einer Zeile und eines Abschnitts (null = ganze Zeile bzw. „ohne“) – für das Eingabefeld. */
export function aufschlagEingabe(n: Pick<Leistungsnachweis, 'aufschlaege'>, zeilenSchluessel: string, abschnittId: ID | null): number {
  return n.aufschlaege[aufschlagSchluessel(zeilenSchluessel, abschnittId)] ?? 0;
}

/**
 * Aufschlag, der zu einer Eingabe „abgerechnet“ führt: mit Abschnittsspalten
 * die Differenz zu den erfassten Stunden der Spalte (Abschnitt bzw. „ohne“ für
 * null), sonst zu denen der ganzen Zeile. `spalten` = `mitAbschnittsspalten`.
 */
export function aufschlagFuerAbgerechnet(
  zeile: Pick<NachweisZeile, 'stunden' | 'stundenJeAbschnitt'>,
  abschnittId: ID | null,
  abgerechnet: number,
  spalten: boolean,
): number {
  const erfasst = spalten ? (zeile.stundenJeAbschnitt[abschnittId ?? OHNE_ABSCHNITT] ?? 0) : zeile.stunden;
  return runden(abgerechnet - erfasst);
}

/**
 * Aufschläge eines Nachweises mit einem geänderten Wert – rein; so arbeitet
 * `aufschlagSetzen` im Store. Gerundet auf zwei Nachkommastellen; null oder 0
 * entfernt den Aufschlag. Ohne Abschnittsspalten gilt jeder Aufschlag der
 * ganzen Zeile (`abschnittId` wird zu null).
 */
export function mitAufschlag(
  n: Leistungsnachweis,
  projekt: Pick<Projekt, 'abschnitte'> | undefined,
  zeilenSchluessel: string,
  abschnittId: ID | null,
  stunden: number | null,
): Leistungsnachweis {
  const spalten = mitAbschnittsspalten(projekt?.abschnitte ?? []);
  const schluessel = aufschlagSchluessel(zeilenSchluessel, spalten ? abschnittId : null);
  const wert = stunden === null || !Number.isFinite(stunden) ? 0 : runden(stunden);
  const aufschlaege = { ...n.aufschlaege };
  if (wert === 0) delete aufschlaege[schluessel];
  else aufschlaege[schluessel] = wert;
  return { ...n, aufschlaege };
}

/**
 * Prüft einen Aufschlag vor dem Setzen: eine Zahl, die Zeile hat Leistungen,
 * der Abschnitt gehört zum Projekt und die abgerechneten Stunden fielen nicht
 * unter 0 (je Abschnitt bzw. für die ganze Zeile). Entfernen (null/0) geht
 * immer. Liefert die Meldung oder null.
 */
export function aufschlagPruefen(
  daten: LeistungsnachweisDaten,
  n: Leistungsnachweis,
  zeilenSchluessel: string,
  abschnittId: ID | null,
  stunden: number | null,
): string | null {
  if (stunden !== null && !Number.isFinite(stunden)) return AUFSCHLAG_KEINE_ZAHL;
  const wert = stunden === null ? 0 : runden(stunden);
  if (wert === 0) return null;
  const projekt = daten.projekte.find((p) => p.id === n.projektId);
  const zeile = nachweisZeilen(daten, n).find((z) => z.schluessel === zeilenSchluessel);
  if (!zeile) return 'Diese Zeile hat keine Leistungen.';
  const abschnitte = projekt?.abschnitte ?? [];
  const spalten = mitAbschnittsspalten(abschnitte);
  if (spalten && abschnittId !== null && !abschnitte.some((a) => a.id === abschnittId)) return 'Diesen Abschnitt gibt es nicht (mehr).';
  const neu = mitAufschlag(n, projekt, zeilenSchluessel, abschnittId, stunden);
  const eingaben = aufschlaegeDerZeile(neu.aufschlaege, zeilenSchluessel, new Set(abschnitte.map((a) => a.id)), spalten);
  const r = abrechnen(zeile.stundenJeAbschnitt, eingaben);
  if (spalten && abschnittId !== null) {
    if (runden((zeile.stundenJeAbschnitt[abschnittId] ?? 0) + wert) < 0) return AUFSCHLAG_UNTER_NULL;
  } else if (runden(r.vorZeile + wert) < 0) return AUFSCHLAG_UNTER_NULL;
  return null;
}

/** Anzahl wirksamer Aufschläge (Einträge ≠ 0) eines Nachweises. */
export function anzahlAufschlaege(n: Pick<Leistungsnachweis, 'aufschlaege'>): number {
  return Object.values(n.aufschlaege).filter((v) => v !== 0).length;
}

/**
 * Zeilen des Nachweises aus den Leistungen (live – auch bei abgeschlossenen; für die Anzeige
 * abgeschlossener Nachweise `zeilenFuerAnzeige` verwenden). Nur Perioden mit Leistungen.
 * Bearbeiter: Namen in der Reihenfolge der ersten Leistung, unbekannte Mitarbeiter als „?“.
 * Text: `texte[schluessel].text`, sonst `automatikText`. Dazu Aufschlag und abgerechnete
 * Stunden aus `aufschlaege` (`abrechnen`).
 */
export function nachweisZeilen(daten: LeistungsnachweisDaten, n: Leistungsnachweis): NachweisZeile[] {
  const projekt = daten.projekte.find((p) => p.id === n.projektId);
  const abschnittIds = new Set((projekt?.abschnitte ?? []).map((a) => a.id));
  const spalten = mitAbschnittsspalten(projekt?.abschnitte ?? []);
  const mitarbeiter = new Map(daten.mitarbeiter.map((m) => [m.id, m]));
  const gruppen = new Map<string, { von: ISODate; bis: ISODate; leistungen: Leistung[] }>();
  for (const l of leistungenIm(daten, n.projektId, n.von, n.bis)) {
    const p = periodeKuerzen(periodeVon(l.datum, n.raster), n.von, n.bis);
    const gruppe = gruppen.get(p.schluessel);
    if (gruppe) gruppe.leistungen.push(l);
    else gruppen.set(p.schluessel, { von: p.von, bis: p.bis, leistungen: [l] });
  }
  return [...gruppen.entries()]
    .sort(([, a], [, b]) => (a.von < b.von ? -1 : a.von > b.von ? 1 : 0))
    .map(([schluessel, { von, bis, leistungen }]): NachweisZeile => {
      const bearbeiter: string[] = [];
      const stundenJeAbschnitt: Record<string, number> = {};
      const stundenJeMitarbeiter: Record<ID, number> = {};
      let stunden = 0;
      for (const l of leistungen) {
        const m = mitarbeiter.get(l.mitarbeiterId);
        const name = m ? mitarbeiterName(m) || m.kuerzel || '?' : '?';
        if (!bearbeiter.includes(name)) bearbeiter.push(name);
        stunden += l.stunden;
        addieren(stundenJeAbschnitt, l.abschnittId && abschnittIds.has(l.abschnittId) ? l.abschnittId : OHNE_ABSCHNITT, l.stunden);
        addieren(stundenJeMitarbeiter, l.mitarbeiterId, l.stunden);
      }
      const bearbeitet = n.texte[schluessel];
      const jeAbschnitt = gerundet(stundenJeAbschnitt);
      const abrechnung = abrechnen(jeAbschnitt, aufschlaegeDerZeile(n.aufschlaege ?? {}, schluessel, abschnittIds, spalten));
      return {
        schluessel,
        von,
        bis,
        datumText: datumText({ schluessel, von, bis }, n.raster, leistungen.some((l) => istWochenende(l.datum))),
        bearbeiter,
        text: bearbeitet ? bearbeitet.text : automatikText(leistungen),
        textBearbeitet: !!bearbeitet,
        stunden: runden(stunden),
        stundenJeAbschnitt: jeAbschnitt,
        stundenJeMitarbeiter: gerundet(stundenJeMitarbeiter),
        leistungIds: leistungen.map((l) => l.id),
        aufschlag: abrechnung.aufschlag,
        aufschlagJeAbschnitt: abrechnung.aufschlagJeAbschnitt,
        abgerechnet: abrechnung.abgerechnet,
        abgerechnetJeAbschnitt: abrechnung.abgerechnetJeAbschnitt,
      };
    });
}

/** Abgeschlossen mit Stand → `stand.zeilen`, sonst `nachweisZeilen`. */
export function zeilenFuerAnzeige(daten: LeistungsnachweisDaten, n: Leistungsnachweis): NachweisZeile[] {
  return n.status === 'abgeschlossen' && n.stand ? n.stand.zeilen : nachweisZeilen(daten, n);
}

/** Leistungen einer Zeile, die nach der Textbearbeitung hinzukamen (leer ohne Bearbeitung). */
export function neueLeistungenSeitText(
  daten: Pick<LeistungsnachweisDaten, 'leistungen'>,
  n: Leistungsnachweis,
  zeile: NachweisZeile,
): Leistung[] {
  const bearbeitet = n.texte[zeile.schluessel];
  if (!bearbeitet) return [];
  const bekannt = new Set(bearbeitet.leistungIds);
  const neu = new Set(zeile.leistungIds.filter((id) => !bekannt.has(id)));
  return daten.leistungen.filter((l) => neu.has(l.id)).sort(nachDatum);
}

/**
 * Text einer Zeile setzen – mit den Leistungs-IDs der Zeile, damit später
 * hinzukommende Leistungen erkannt werden; null = wieder automatisch. Rein;
 * so arbeitet `zeilenTextSetzen` im Store.
 */
export function mitZeilenText(n: Leistungsnachweis, zeile: NachweisZeile, text: string | null): Leistungsnachweis {
  const texte = { ...n.texte };
  if (text === null) delete texte[zeile.schluessel];
  else texte[zeile.schluessel] = { text, leistungIds: [...zeile.leistungIds] };
  return { ...n, texte };
}

/** Summe der Stunden. */
export function summeStunden(zeilen: NachweisZeile[]): number {
  return runden(zeilen.reduce((s, z) => s + z.stunden, 0));
}

/** Summe der abgerechneten Stunden. */
export function summeAbgerechnet(zeilen: Pick<NachweisZeile, 'abgerechnet'>[]): number {
  return runden(zeilen.reduce((s, z) => s + z.abgerechnet, 0));
}

/** Erfasst, Aufschlag und abgerechnet über Zeilen (abgerechnet = erfasst + Aufschlag). */
export function nachweisSummen(zeilen: Pick<NachweisZeile, 'stunden' | 'aufschlag' | 'abgerechnet'>[]): {
  erfasst: number;
  aufschlag: number;
  abgerechnet: number;
} {
  const erfasst = runden(zeilen.reduce((s, z) => s + z.stunden, 0));
  const abgerechnet = runden(zeilen.reduce((s, z) => s + z.abgerechnet, 0));
  return { erfasst, aufschlag: runden(abgerechnet - erfasst), abgerechnet };
}

/** Summe der Stunden einer Auswahl von Leistungen. */
export function stundenVon(leistungen: Pick<Leistung, 'stunden'>[]): number {
  return runden(leistungen.reduce((s, l) => s + l.stunden, 0));
}

/** Überschrift: `titel` oder „Leistungsnachweis <zeitraumText>“. */
export function nachweisTitel(n: Pick<Leistungsnachweis, 'titel' | 'von' | 'bis'>): string {
  return n.titel.trim() || `Leistungsnachweis ${zeitraumText(n.von, n.bis)}`;
}

/** Namen aller Bearbeiter des Nachweises – in der Reihenfolge ihres ersten Auftretens. */
export function bearbeiterVon(zeilen: NachweisZeile[]): string[] {
  return [...new Set(zeilen.flatMap((z) => z.bearbeiter))];
}

/** Stand zum Festschreiben beim Abschließen – mit den Aufschlägen und abgerechneten Stunden. */
export function standErzeugen(daten: LeistungsnachweisDaten, n: Leistungsnachweis): NachweisStand {
  const projekt = daten.projekte.find((p) => p.id === n.projektId);
  const zeilen = nachweisZeilen(daten, n);
  return {
    zeilen,
    abschnitte: (projekt?.abschnitte ?? []).map((a) => ({ ...a })),
    projekt: {
      nummer: projekt?.nummer ?? '',
      name: projekt?.name ?? '',
      kurzname: projekt?.kurzname ?? '',
      leistungsbereich: projekt?.leistungsbereich ?? '',
    },
    titel: nachweisTitel(n),
    stunden: summeStunden(zeilen),
    abgerechnet: summeAbgerechnet(zeilen),
  };
}

const gleicheWerte = (a: Record<string, number>, b: Record<string, number>) => {
  const ka = Object.keys(a).filter((k) => a[k] !== 0);
  const kb = Object.keys(b).filter((k) => b[k] !== 0);
  return ka.length === kb.length && ka.every((k) => runden(a[k]) === runden(b[k] ?? 0));
};

const gleicheIds = (a: ID[], b: ID[]) => {
  if (a.length !== b.length) return false;
  const menge = new Set(a);
  return b.every((id) => menge.has(id));
};

/** Weicht der Live-Stand eines abgeschlossenen Nachweises vom festgeschriebenen ab? (Stunden, Leistungen, Texte oder abgerechnete Stunden) */
export function standVeraltet(daten: LeistungsnachweisDaten, n: Leistungsnachweis): boolean {
  if (n.status !== 'abgeschlossen' || !n.stand) return false;
  const alt = n.stand.zeilen;
  const live = nachweisZeilen(daten, n);
  if (alt.length !== live.length) return true;
  return live.some((z, i) => {
    const a = alt[i];
    return (
      a.schluessel !== z.schluessel ||
      a.text !== z.text ||
      runden(a.stunden) !== z.stunden ||
      runden(a.abgerechnet) !== z.abgerechnet ||
      !gleicheIds(a.leistungIds, z.leistungIds) ||
      !gleicheWerte(a.stundenJeAbschnitt, z.stundenJeAbschnitt) ||
      !gleicheWerte(a.stundenJeMitarbeiter, z.stundenJeMitarbeiter)
    );
  });
}

/**
 * Für die Rückfrage vor „Wieder öffnen“: Zahlen des festgeschriebenen Stands
 * und der aktuellen Leistungen, und ob sie voneinander abweichen.
 */
export function standVergleich(
  daten: LeistungsnachweisDaten,
  n: Leistungsnachweis,
): { veraltet: boolean; stand: { erfasst: number; abgerechnet: number }; aktuell: { erfasst: number; abgerechnet: number } } {
  const live = nachweisSummen(nachweisZeilen(daten, n));
  const stand = n.stand ? { erfasst: n.stand.stunden, abgerechnet: n.stand.abgerechnet } : { erfasst: live.erfasst, abgerechnet: live.abgerechnet };
  return { veraltet: standVeraltet(daten, n), stand, aktuell: { erfasst: live.erfasst, abgerechnet: live.abgerechnet } };
}

/* ------------------------------------------------------------------ */
/* Rasterwechsel                                                       */
/* ------------------------------------------------------------------ */

const RASTER_PRAEFIX: Record<Raster, string> = { tag: 'T', woche: 'W', monat: 'M' };

/**
 * Was ein Wechsel des Rasters verdeckt: von Hand bearbeitete Texte und
 * Aufschläge, die zu Zeilen des bisherigen Rasters gehören. Sie bleiben
 * gespeichert und kehren zurück, wenn das Raster wieder umgestellt wird.
 */
export function rasterwechselVerdeckt(n: Pick<Leistungsnachweis, 'raster' | 'texte' | 'aufschlaege'>, raster: Raster): { texte: number; aufschlaege: number } {
  if (raster === n.raster) return { texte: 0, aufschlaege: 0 };
  const bisher = RASTER_PRAEFIX[n.raster];
  return {
    texte: Object.keys(n.texte).filter((k) => k.startsWith(bisher)).length,
    aufschlaege: Object.entries(n.aufschlaege).filter(([k, v]) => k.startsWith(bisher) && v !== 0).length,
  };
}

/**
 * Warnung im Dialog „Zeitraum ändern“ bei einem Rasterwechsel, etwa
 * „2 bearbeitete Texte und 1 Aufschlag gehören zu einem anderen Raster und
 * werden nicht mehr angezeigt – sie kehren zurück, wenn das Raster wieder
 * umgestellt wird.“; null, wenn nichts verdeckt wird.
 */
export function rasterwechselHinweis(verdeckt: { texte: number; aufschlaege: number }): string | null {
  const teile: string[] = [];
  if (verdeckt.texte > 0) teile.push(verdeckt.texte === 1 ? '1 bearbeiteter Text' : `${verdeckt.texte} bearbeitete Texte`);
  if (verdeckt.aufschlaege > 0) teile.push(verdeckt.aufschlaege === 1 ? '1 Aufschlag' : `${verdeckt.aufschlaege} Aufschläge`);
  if (teile.length === 0) return null;
  const einer = verdeckt.texte + verdeckt.aufschlaege === 1;
  return einer
    ? `${teile[0]} gehört zu einem anderen Raster und wird nicht mehr angezeigt – er kehrt zurück, wenn das Raster wieder umgestellt wird.`
    : `${teile.join(' und ')} gehören zu einem anderen Raster und werden nicht mehr angezeigt – sie kehren zurück, wenn das Raster wieder umgestellt wird.`;
}

/* ------------------------------------------------------------------ */
/* Anlegen und Ergänzen                                                */
/* ------------------------------------------------------------------ */

/** Leerer Nachweis mit Vorgaben des Projekts. */
export function neuerNachweis(id: ID, projekt: Projekt, von: ISODate, bis: ISODate, jetzt: string): Leistungsnachweis {
  return {
    id,
    projektId: projekt.id,
    titel: '',
    von,
    bis,
    raster: projekt.raster,
    status: 'entwurf',
    texte: {},
    aufschlaege: {},
    bemerkung: '',
    erstellt: jetzt,
    geaendert: jetzt,
    abgeschlossen: null,
    stand: null,
  };
}

/** Ergebnis von `nachweiseErgaenzen`. */
export interface Ergaenzung {
  neu: Leistungsnachweis[];
  erweitert: { id: ID; von: ISODate; bis: ISODate }[];
}

/**
 * Nachweise anlegen bzw. erweitern, damit die genannten Tage des Projekts in einem Nachweis liegen –
 * nach `projekt.zeitraumregel`:
 * * „monat“: je Kalendermonat ein neuer Nachweis [Monatsanfang, Monatsende], gekürzt, damit er sich
 *   nicht mit vorhandenen überschneidet.
 * * „fortlaufend“: Liegt vor dem Tag der zeitlich letzte Nachweis des Projekts und ist er in
 *   Bearbeitung (und liegt kein anderer dazwischen), wird sein `bis` bis zum Monatsende des Tages
 *   verlängert (gekürzt vor dem nächsten Nachweis); sonst neuer Nachweis ab Monatsanfang.
 * Tage in abgeschlossenen Nachweisen sind bereits abgedeckt. Rein; `neueId` liefert IDs (vorab erzeugt
 * an der Oberfläche oder im Plan).
 */
export function nachweiseErgaenzen(
  daten: Pick<LeistungsnachweisDaten, 'nachweise'>,
  projekt: Projekt,
  tage: ISODate[],
  jetzt: string,
  neueId: () => ID,
): Ergaenzung {
  // Arbeitsstand: die Nachweise des Projekts samt der in diesem Aufruf angelegten bzw. verlängerten
  const stand = daten.nachweise
    .filter((n) => n.projektId === projekt.id)
    .map((n) => ({ id: n.id, von: n.von, bis: n.bis, offen: n.status === 'entwurf', neu: null as Leistungsnachweis | null }));
  const ausgangBis = new Map(stand.map((s) => [s.id, s.bis]));

  for (const tag of [...new Set(tage.filter(istDatum))].sort()) {
    if (stand.some((s) => imZeitraum(tag, s.von, s.bis))) continue;
    // Nachbarn: der letzte Nachweis vor dem Tag und der erste danach
    let vorher: (typeof stand)[number] | undefined;
    let danach: (typeof stand)[number] | undefined;
    for (const s of stand) {
      if (s.bis < tag && (!vorher || s.bis > vorher.bis)) vorher = s;
      if (s.von > tag && (!danach || s.von < danach.von)) danach = s;
    }
    const ende = danach && danach.von <= monatsende(tag) ? addDays(danach.von, -1) : monatsende(tag);
    if (projekt.zeitraumregel === 'fortlaufend' && vorher?.offen) {
      vorher.bis = ende;
      if (vorher.neu) vorher.neu = { ...vorher.neu, bis: ende };
      continue;
    }
    const anfang = vorher && vorher.bis >= monatsanfang(tag) ? addDays(vorher.bis, 1) : monatsanfang(tag);
    const n = neuerNachweis(neueId(), projekt, anfang, ende, jetzt);
    stand.push({ id: n.id, von: n.von, bis: n.bis, offen: true, neu: n });
  }

  return {
    neu: stand.flatMap((s) => (s.neu ? [s.neu] : [])),
    erweitert: stand
      .filter((s) => !s.neu && ausgangBis.get(s.id) !== s.bis)
      .map((s) => ({ id: s.id, von: s.von, bis: s.bis })),
  };
}

/** Wendet das Ergebnis von `nachweiseErgaenzen` an: neue Nachweise anfügen, erweiterte verlängern. */
export function ergaenzungAnwenden<T extends Pick<LeistungsnachweisDaten, 'nachweise'>>(
  daten: T,
  ergaenzung: Ergaenzung,
  jetzt: string,
): T {
  if (ergaenzung.neu.length === 0 && ergaenzung.erweitert.length === 0) return daten;
  const erweitert = new Map(ergaenzung.erweitert.map((e) => [e.id, e]));
  const vorhanden = new Set(daten.nachweise.map((n) => n.id));
  return {
    ...daten,
    nachweise: [
      ...daten.nachweise.map((n) => {
        const e = erweitert.get(n.id);
        return e ? { ...n, von: e.von, bis: e.bis, geaendert: jetzt } : n;
      }),
      ...ergaenzung.neu.filter((n) => !vorhanden.has(n.id)),
    ],
  };
}

/**
 * Sorgt dafür, dass die Tage des Projekts in einem Nachweis liegen: rechnet
 * `nachweiseErgaenzen` und wendet das Ergebnis an. Liefert den neuen Bestand
 * und die Ergänzung (etwa für eine Meldung „… angelegt“).
 */
export function nachweiseSichern(
  daten: LeistungsnachweisDaten,
  projektId: ID,
  tage: ISODate[],
  jetzt: string,
  neueId: () => ID,
): { daten: LeistungsnachweisDaten; ergaenzung: Ergaenzung } {
  const projekt = daten.projekte.find((p) => p.id === projektId);
  if (!projekt || tage.length === 0) return { daten, ergaenzung: { neu: [], erweitert: [] } };
  const ergaenzung = nachweiseErgaenzen(daten, projekt, tage, jetzt, neueId);
  return { daten: ergaenzungAnwenden(daten, ergaenzung, jetzt), ergaenzung };
}

/* ------------------------------------------------------------------ */
/* Abschließen                                                         */
/* ------------------------------------------------------------------ */

/** Lokales Datum (JJJJ-MM-TT) eines Zeitpunkts (ISO). */
export function tagVon(zeitpunkt: string): ISODate {
  const d = new Date(zeitpunkt);
  return Number.isNaN(d.getTime()) ? zeitpunkt.slice(0, 10) : toISO(d);
}

/**
 * Ende eines Nachweises beim Abschluss: Bei der Regel „Fortlaufend bis zum
 * Abschluss“ endet er am letzten Tag mit Leistungen in ihm, spätestens heute
 * (ohne Leistungen heute) – nie später als bisher und nie vor seinem Beginn.
 * Sonst bleibt `bis`. Dazu die Leistungen, die danach liegen und deshalb in
 * einen neuen Nachweis kommen.
 */
export function abschlussZeitraum(
  daten: LeistungsnachweisDaten,
  n: Leistungsnachweis,
  heute: ISODate,
): { bis: ISODate; gekuerzt: boolean; spaetere: Leistung[] } {
  const projekt = daten.projekte.find((p) => p.id === n.projektId);
  if (projekt?.zeitraumregel !== 'fortlaufend' || n.status !== 'entwurf') return { bis: n.bis, gekuerzt: false, spaetere: [] };
  const leistungen = leistungenIm(daten, n.projektId, n.von, n.bis);
  const letzte = leistungen.length ? leistungen[leistungen.length - 1].datum : null;
  const ende = letzte && letzte < heute ? letzte : heute;
  if (ende < n.von || ende >= n.bis) return { bis: n.bis, gekuerzt: false, spaetere: [] };
  return { bis: ende, gekuerzt: true, spaetere: leistungen.filter((l) => l.datum > ende) };
}

/**
 * Schließt einen Nachweis ab – rein; so arbeitet `nachweisAbschliessen` im
 * Store: Zeitraum nach `abschlussZeitraum`, Stand festschreiben (mit
 * Aufschlägen), Status abgeschlossen. Leistungen nach einem gekürzten Ende
 * erhalten gleich einen neuen Nachweis (`nachweiseSichern`, Kennungen über
 * `neueId`). Ein abgeschlossener Nachweis bleibt unverändert.
 */
export function nachweisAbschliessenAnwenden(
  daten: LeistungsnachweisDaten,
  id: ID,
  jetzt: string,
  neueId: () => ID,
): LeistungsnachweisDaten {
  const n = daten.nachweise.find((x) => x.id === id);
  if (!n || n.status !== 'entwurf') return daten;
  const { bis, gekuerzt, spaetere } = abschlussZeitraum(daten, n, tagVon(jetzt));
  const gekuerzterNachweis: Leistungsnachweis = gekuerzt ? { ...n, bis } : n;
  const zwischen = gekuerzt ? { ...daten, nachweise: daten.nachweise.map((x) => (x.id === id ? gekuerzterNachweis : x)) } : daten;
  const zu: Leistungsnachweis = {
    ...gekuerzterNachweis,
    status: 'abgeschlossen',
    abgeschlossen: jetzt,
    geaendert: jetzt,
    stand: standErzeugen(zwischen, gekuerzterNachweis),
  };
  const ergebnis = { ...zwischen, nachweise: zwischen.nachweise.map((x) => (x.id === id ? zu : x)) };
  if (spaetere.length === 0) return ergebnis;
  return nachweiseSichern(ergebnis, n.projektId, spaetere.map((l) => l.datum), jetzt, neueId).daten;
}

/* ------------------------------------------------------------------ */
/* Nach jeder Änderung                                                 */
/* ------------------------------------------------------------------ */

/**
 * Läuft nach jeder Änderung (`mutate` im Store): entfernt Nachweise ohne
 * Projekt und setzt `geaendert` an geänderten Nachweisen – auch an solchen in
 * Bearbeitung, in deren Zeitraum sich Leistungen geändert haben. Bearbeitete
 * Texte bleiben stehen, auch wenn ihre Zeile gerade keine Leistungen hat oder
 * außerhalb des Zeitraums liegt: Kehrt sie zurück, erscheint der Text wieder.
 * Ohne `zeitstempel` (Einspielen, Zurücksetzen) bleiben die Zeitpunkte unberührt.
 */
export function nachweiseBereinigen(
  alt: LeistungsnachweisDaten,
  neu: LeistungsnachweisDaten,
  jetzt: string,
  zeitstempel = true,
): LeistungsnachweisDaten {
  const projektIds = new Set(neu.projekte.map((p) => p.id));
  const ohneProjekt = neu.nachweise.some((n) => !projektIds.has(n.projektId));
  if (!zeitstempel) return ohneProjekt ? { ...neu, nachweise: neu.nachweise.filter((n) => projektIds.has(n.projektId)) } : neu;

  // Tage mit geänderten, neuen oder entfernten Leistungen
  const betroffen: { projektId: ID; datum: ISODate }[] = [];
  if (alt.leistungen !== neu.leistungen) {
    const alteLeistungen = new Map(alt.leistungen.map((l) => [l.id, l]));
    const bleiben = new Set<ID>();
    for (const l of neu.leistungen) {
      const a = alteLeistungen.get(l.id);
      bleiben.add(l.id);
      if (a === l) continue;
      betroffen.push(l);
      if (a) betroffen.push(a);
    }
    for (const a of alt.leistungen) if (!bleiben.has(a.id)) betroffen.push(a);
  }

  const vorher = new Map(alt.nachweise.map((n) => [n.id, n]));
  let geaendert = ohneProjekt;
  const nachweise = neu.nachweise
    .filter((n) => projektIds.has(n.projektId))
    .map((n) => {
      const a = vorher.get(n.id);
      if (!a || n.geaendert === jetzt) return n;
      // Selbst geändert, ohne dass die Aktion den Zeitpunkt gesetzt hat
      const selbst = a !== n && a.geaendert === n.geaendert;
      const inhalt =
        n.status === 'entwurf' && betroffen.some((b) => b.projektId === n.projektId && imZeitraum(b.datum, n.von, n.bis));
      if (!selbst && !inhalt) return n;
      geaendert = true;
      return { ...n, geaendert: jetzt };
    });
  return geaendert ? { ...neu, nachweise } : neu;
}
