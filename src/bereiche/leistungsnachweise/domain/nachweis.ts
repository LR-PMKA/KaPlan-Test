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
 * Zeitraumregel des Projekts an oder verlängert den offenen.
 *
 * Alle Funktionen sind rein; Kennungen liefert der Aufrufer.
 */
import { addDays } from '../../../shared/dates';
import {
  OHNE_ABSCHNITT,
  mitarbeiterName,
  type ID,
  type ISODate,
  type Leistung,
  type Leistungsnachweis,
  type LeistungsnachweisDaten,
  type NachweisStand,
  type NachweisZeile,
  type Projekt,
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

/** Teile eines Leistungstexts: an „,“ und „;“ zerlegt, ohne leere Teile; Zeilenumbrüche bleiben. */
export function textTeile(text: string): string[] {
  return text
    .split(/[,;]/)
    .map((t) => t.trim())
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
 * an „,“ und „;“ in Teile zerlegt, Dubletten (ohne Rücksicht auf Groß-/Kleinschreibung und
 * Leerraum) entfernt, mit „, “ verbunden. Zeilenumbrüche im Text bleiben erhalten.
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

/**
 * Zeilen des Nachweises aus den Leistungen (live – auch bei abgeschlossenen; für die Anzeige
 * abgeschlossener Nachweise `zeilenFuerAnzeige` verwenden). Nur Perioden mit Leistungen.
 * Bearbeiter: Namen in der Reihenfolge der ersten Leistung, unbekannte Mitarbeiter als „?“.
 * Text: `texte[schluessel].text`, sonst `automatikText`.
 */
export function nachweisZeilen(daten: LeistungsnachweisDaten, n: Leistungsnachweis): NachweisZeile[] {
  const projekt = daten.projekte.find((p) => p.id === n.projektId);
  const abschnittIds = new Set((projekt?.abschnitte ?? []).map((a) => a.id));
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
      return {
        schluessel,
        von,
        bis,
        datumText: datumText({ schluessel, von, bis }, n.raster, leistungen.some((l) => istWochenende(l.datum))),
        bearbeiter,
        text: bearbeitet ? bearbeitet.text : automatikText(leistungen),
        textBearbeitet: !!bearbeitet,
        stunden: runden(stunden),
        stundenJeAbschnitt: gerundet(stundenJeAbschnitt),
        stundenJeMitarbeiter: gerundet(stundenJeMitarbeiter),
        leistungIds: leistungen.map((l) => l.id),
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

/** Stand zum Festschreiben beim Abschließen. */
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

/** Weicht der Live-Stand eines abgeschlossenen Nachweises vom festgeschriebenen ab? (Stunden, Leistungen oder Texte) */
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
      !gleicheIds(a.leistungIds, z.leistungIds) ||
      !gleicheWerte(a.stundenJeAbschnitt, z.stundenJeAbschnitt) ||
      !gleicheWerte(a.stundenJeMitarbeiter, z.stundenJeMitarbeiter)
    );
  });
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
