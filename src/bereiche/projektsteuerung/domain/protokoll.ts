/**
 * Fachlogik der Protokolle: Reihen und Folgeprotokolle, Zeilen mit ihrem
 * Ursprungsprotokoll und ihrer Art, Kennzeichnung neuer, geänderter und
 * gestrichener Angaben, Aufgaben aus den Protokollen, Teilnehmende aus der
 * Projektbeteiligtenliste und die Übernahme von Dateien des Protokoll-Tools.
 * Alle Funktionen sind rein; geschrieben wird nur über den Store.
 *
 * Gestrichen werden kann auf drei Ebenen – Tagesordnungspunkt, Eintrag und
 * Zeile. Gestrichenes steht im Protokoll der Änderung durchgestrichen und
 * entfällt im Folgeprotokoll. Erledigte Aufgaben stehen im Folgeprotokoll
 * noch einmal durchgestrichen und entfallen danach.
 *
 * Eine Ergänzung mit eigener Art (`Zeile.typ`) ist ein eigener Punkt unter
 * dem Eintrag – mit eigenem Verantwortlich, Termin und Erledigung. Ohne
 * eigene Art läuft sie unter dem Ursprung mit.
 */
import { today } from '../../../shared/dates';
import {
  STANDARD_HINWEIS,
  TEILNAHME,
  funktionsName,
  kuerzelVon,
  newId,
  personName,
  type Beteiligter,
  type Eintrag,
  type EintragTyp,
  type EintragVorstand,
  type Erledigung,
  type Funktion,
  type ID,
  type Protokoll,
  type ProjektsteuerungDaten,
  type Teilnahme,
  type Teilnehmer,
  type Top,
  type Zeile,
  type ZeileVorstand,
} from './types';

/* ------------------------------------------------------------------ */
/* Zeilen und Kennzeichnung                                            */
/* ------------------------------------------------------------------ */

/** Ergänzung mit eigener Art – ein eigener Punkt unter dem Eintrag. */
export const eigeneArt = (z: Zeile): boolean => z.typ !== null;

/** Text des Ursprungs: die mitlaufenden, nicht gestrichenen Zeilen. */
export function eintragText(e: Eintrag): string {
  return e.zeilen
    .filter((z) => !eigeneArt(z) && !z.entfaellt)
    .map((z) => z.text.trim())
    .filter(Boolean)
    .join('\n');
}

/** Ganzer Eintrag neu in diesem Protokoll – im Druck blau. */
export const eintragNeu = (e: Eintrag): boolean => !e.vor && e.zeilen.every((z) => z.herkunft === null);

/** Angabe gegenüber dem Vorprotokoll geändert bzw. neu – im Druck blau. */
export function feldNeu(e: Eintrag, k: Exclude<keyof EintragVorstand, 'entfaellt'>): boolean {
  return e.vor ? e[k] !== e.vor[k] : eintragNeu(e);
}

/** Angabe einer Ergänzung mit eigener Art gegenüber dem Vorprotokoll geändert bzw. neu. */
export function zeileFeldNeu(z: Zeile, k: Exclude<keyof ZeileVorstand, 'text' | 'entfaellt'>): boolean {
  return z.vor ? z[k] !== z.vor[k] : true;
}

export const topNeu = (top: Top): boolean => top.vorTitel === null || top.titel !== top.vorTitel;

/** „aus Prot. 1“ – Ursprung einer übernommenen Zeile; leer bei neuen Zeilen. */
export const zeileHerkunft = (z: Zeile): string => (z.herkunft !== null ? `aus Prot. ${z.herkunft}` : '');

/** Erledigt (Aufgabe) oder gestrichen. */
export function abgeschlossen(x: { typ?: EintragTyp | null; status: Erledigung; entfaellt?: boolean }): boolean {
  return !!x.entfaellt || (x.typ === 'A' && x.status === 'erledigt');
}

/** Gestrichen – über den Punkt oder den Eintrag –, aber nicht bloß erledigt. */
export const eintragEntfaellt = (top: Top, e: Eintrag): boolean => top.entfaellt || e.entfaellt;

/** Gestrichen – über Punkt, Eintrag oder die Zeile selbst –, aber nicht bloß erledigt. */
export const zeileEntfaellt = (top: Top, e: Eintrag, z: Zeile): boolean => eintragEntfaellt(top, e) || z.entfaellt;

/**
 * Zeile erscheint durchgestrichen. Eine Ergänzung mit eigener Art folgt ihrer
 * eigenen Erledigung, eine mitlaufende der des Ursprungs.
 */
export function zeileGestrichen(top: Top, e: Eintrag, z: Zeile): boolean {
  if (zeileEntfaellt(top, e, z)) return true;
  return eigeneArt(z) ? abgeschlossen(z) : abgeschlossen(e);
}

/** Zeile war schon im Vorprotokoll durchgestrichen. */
function zeileVorherGestrichen(top: Top, e: Eintrag, z: Zeile): boolean {
  if (!z.vor) return false;
  const erledigt = z.vor.typ !== null ? abgeschlossen(z.vor) : !!e.vor && abgeschlossen(e.vor);
  return erledigt || z.vor.entfaellt || !!e.vor?.entfaellt || (top.vorTitel !== null && top.vorEntfaellt);
}

/** In diesem Protokoll gestrichen bzw. erledigt – die Linie wird blau, der Text bleibt schwarz. */
export const zeileNeuGestrichen = (top: Top, e: Eintrag, z: Zeile): boolean =>
  zeileGestrichen(top, e, z) && !zeileVorherGestrichen(top, e, z);

/** Gestrichen-Stand des Eintrags gegenüber dem Vorprotokoll gewechselt (gestrichen oder wiederhergestellt). */
export function entfallenGeaendert(top: Top, e: Eintrag): boolean {
  const vorher = !!e.vor && (e.vor.entfaellt || (top.vorTitel !== null && top.vorEntfaellt));
  return eintragEntfaellt(top, e) !== vorher;
}

/** Gestrichen-Stand einer Zeile gegenüber dem Vorprotokoll gewechselt. */
export function zeileEntfallenGeaendert(top: Top, e: Eintrag, z: Zeile): boolean {
  const vorher = !!z.vor && (z.vor.entfaellt || !!e.vor?.entfaellt || (top.vorTitel !== null && top.vorEntfaellt));
  return zeileEntfaellt(top, e, z) !== vorher;
}

/** Punkt in diesem Protokoll gestrichen – die Linie wird blau. */
export const topNeuGestrichen = (top: Top): boolean => top.entfaellt && !(top.vorTitel !== null && top.vorEntfaellt);

/** „Baubesprechung Nr. 3“. */
export function bezeichnung(p: Pick<Protokoll, 'art' | 'nr'>): string {
  return `${p.art || 'Protokoll'} Nr. ${p.nr}`;
}

/** „9:00–11:00 Uhr“. */
export function zeitText(p: Pick<Protokoll, 'beginn' | 'ende'>): string {
  return p.beginn ? `${p.beginn}${p.ende ? `–${p.ende}` : ''} Uhr` : '';
}

export function fuehrerVon(p: Protokoll): Teilnehmer | undefined {
  return p.fuehrerId ? p.teilnehmer.find((t) => t.id === p.fuehrerId) : undefined;
}

/* ------------------------------------------------------------------ */
/* Anlegen                                                             */
/* ------------------------------------------------------------------ */

/** Neue Zeile dieses Protokolls; mit `typ` eine Ergänzung mit eigener Art. */
export function neueZeile(text = '', id: ID = newId('z'), typ: EintragTyp | null = null): Zeile {
  return { id, text, herkunft: null, typ, wer: '', termin: '', status: 'offen', entfaellt: false, vor: null };
}

export function neuerEintrag(typ: EintragTyp): Eintrag {
  return {
    id: newId('e'),
    typ,
    zeilen: [neueZeile()],
    wer: '',
    termin: '',
    status: 'offen',
    uebernommenIn: null,
    entfaellt: false,
    vor: null,
  };
}

export function neuerTop(titel = ''): Top {
  return { id: newId('top'), titel, vorTitel: null, entfaellt: false, vorEntfaellt: false, eintraege: [] };
}

/** Teilnehmende Person aus der Projektbeteiligtenliste. */
export function teilnehmerAus(b: Beteiligter, funktionen: Funktion[], status: Teilnahme = 'anwesend'): Teilnehmer {
  return {
    id: newId('tn'),
    beteiligterId: b.id,
    name: personName(b),
    funktion: ((f) => (f ? funktionsName(f) : ''))(funktionen.find((f) => f.id === b.funktionId)),
    firma: b.firma,
    kuerzel: kuerzelVon(b, funktionen),
    status,
  };
}

/** Teilnehmende Person ohne Eintrag in der Projektbeteiligtenliste. */
export function freierTeilnehmer(): Teilnehmer {
  return { id: newId('tn'), beteiligterId: null, name: '', funktion: '', firma: '', kuerzel: '', status: 'anwesend' };
}

/** Wert für „Verantwortlich“: das Kürzel, ohne Kürzel der Name. */
export const zuordnung = (t: Teilnehmer): string => t.kuerzel.trim() || t.name.trim();

/**
 * Erstes Protokoll einer neuen Reihe. Die Protokollführung übernimmt die
 * angemeldete Person, sofern sie in der Projektbeteiligtenliste steht.
 */
export function neueReihe(
  id: ID,
  projektId: ID,
  werte: Pick<Protokoll, 'art' | 'datum' | 'beginn' | 'ort'>,
  fuehrung: Beteiligter | undefined,
  funktionen: Funktion[],
): Protokoll {
  const fuehrer = fuehrung ? teilnehmerAus(fuehrung, funktionen) : null;
  return {
    id,
    projektId,
    reiheId: newId('rh'),
    art: werte.art,
    nr: 1,
    datum: werte.datum,
    beginn: werte.beginn,
    ende: '',
    ort: werte.ort,
    fuehrerId: fuehrer?.id ?? null,
    naechster: '',
    verteiler: '',
    hinweis: STANDARD_HINWEIS,
    teilnehmer: fuehrer ? [fuehrer] : [],
    tops: [neuerTop('Allgemeines')],
    geaendert: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Folgeprotokoll                                                      */
/* ------------------------------------------------------------------ */

/** Erledigt und schon im Vorprotokoll erledigt: Der Ursprung steht hier zum letzten Mal. */
const letztmalig = (e: Eintrag): boolean => abgeschlossen(e) && !!e.vor && abgeschlossen(e.vor);

/** Ergänzung mit eigener Art, erledigt und schon im Vorprotokoll erledigt. */
const zeileLetztmalig = (z: Zeile): boolean =>
  eigeneArt(z) && abgeschlossen(z) && !!z.vor && z.vor.typ !== null && abgeschlossen(z.vor);

/** Enthält der Eintrag eine Aufgabe – als Art des Ursprungs oder einer Ergänzung? */
const mitAufgabe = (e: Eintrag): boolean => e.typ === 'A' || e.zeilen.some((z) => z.typ === 'A');

/**
 * Eintrag im Folgeprotokoll – oder null, wenn nichts von ihm bleibt.
 * Gestrichenes (Eintrag oder Zeile) bleibt zurück, ebenso leere Zeilen,
 * Aufgaben, die schon im Vorprotokoll erledigt waren, und Einträge, die
 * bereits in ein Folgeprotokoll weitergeführt wurden. Ist der Ursprung
 * erledigt, laufen nur noch offene Ergänzungen mit eigener Art weiter; ohne
 * mitlaufende Zeile wird die erste von ihnen zum Eintrag selbst.
 */
function eintragUebernehmen(e: Eintrag, vorherNr: number): Eintrag | null {
  if (e.entfaellt || e.uebernommenIn) return null;
  let zeilen = e.zeilen.filter((z) => z.text.trim() && !z.entfaellt && !zeileLetztmalig(z));
  if (letztmalig(e)) zeilen = zeilen.filter(eigeneArt);
  if (zeilen.length === 0) return null;
  const neu = zeilen.map(
    (z): Zeile => ({
      ...z,
      id: newId('z'),
      herkunft: z.herkunft ?? vorherNr,
      vor: { text: z.text, typ: z.typ, wer: z.wer, termin: z.termin, status: z.status, entfaellt: false },
    }),
  );
  const eintrag: Eintrag = {
    ...e,
    id: newId('e'),
    zeilen: neu,
    uebernommenIn: null,
    vor: { typ: e.typ, wer: e.wer, termin: e.termin, status: e.status, entfaellt: false },
  };
  if (neu.some((z) => !eigeneArt(z))) return eintrag;
  const [erste, ...rest] = neu;
  const art = { typ: erste.typ!, wer: erste.wer, termin: erste.termin, status: erste.status };
  const mitlaufend = { typ: null, wer: '', termin: '', status: 'offen' as const };
  return {
    ...eintrag,
    ...art,
    vor: { ...art, entfaellt: false },
    zeilen: [{ ...erste, ...mitlaufend, vor: { ...erste.vor!, ...mitlaufend } }, ...rest],
  };
}

/**
 * Tagesordnung eines Folgeprotokolls: gestrichene Punkte bleiben zurück, die
 * übrigen mit ihren Einträgen (`eintragUebernehmen`). Jede übernommene Zeile
 * behält ihr Ursprungsprotokoll; neue Zeilen erhalten die Nummer des
 * Vorprotokolls. `mitgenommen` nennt die übernommenen Einträge des
 * Vorprotokolls.
 */
function uebernahme(vorher: Protokoll): { tops: Top[]; mitgenommen: Set<ID> } {
  const mitgenommen = new Set<ID>();
  const tops = vorher.tops
    .filter((top) => !top.entfaellt)
    .map(
      (top): Top => ({
        id: newId('top'),
        titel: top.titel,
        vorTitel: top.titel,
        entfaellt: false,
        vorEntfaellt: false,
        eintraege: top.eintraege.flatMap((e): Eintrag[] => {
          const neu = eintragUebernehmen(e, vorher.nr);
          if (!neu) return [];
          mitgenommen.add(e.id);
          return [neu];
        }),
      }),
    );
  return { tops, mitgenommen };
}

/**
 * Folgeprotokoll: übernimmt Kopfdaten, Teilnehmende und Tagesordnung mit
 * allen Einträgen (`uebernahme`). Das Vorprotokoll vermerkt bei Einträgen mit
 * Aufgaben, wohin sie übernommen wurden.
 */
export function folgeprotokoll(
  vorher: Protokoll,
  id: ID,
  nr = vorher.nr + 1,
): { neu: Protokoll; vorher: Protokoll } {
  const neueIds = new Map<ID, ID>();
  const teilnehmer = vorher.teilnehmer.map((t): Teilnehmer => {
    const neu = newId('tn');
    neueIds.set(t.id, neu);
    return { ...t, id: neu, status: t.status === 'nur Verteiler' ? t.status : 'anwesend' };
  });
  const { tops, mitgenommen } = uebernahme(vorher);

  const neu: Protokoll = {
    id,
    projektId: vorher.projektId,
    reiheId: vorher.reiheId,
    art: vorher.art,
    nr,
    datum: vorher.naechster || today(),
    beginn: '',
    ende: '',
    ort: vorher.ort,
    fuehrerId: vorher.fuehrerId ? (neueIds.get(vorher.fuehrerId) ?? null) : null,
    naechster: '',
    verteiler: vorher.verteiler,
    hinweis: vorher.hinweis,
    teilnehmer,
    tops: tops.length > 0 ? tops : [neuerTop('Allgemeines')],
    geaendert: new Date().toISOString(),
  };

  const vorherNeu: Protokoll = {
    ...vorher,
    tops: vorher.tops.map((top) => ({
      ...top,
      eintraege: top.eintraege.map((e) => (mitgenommen.has(e.id) && mitAufgabe(e) ? { ...e, uebernommenIn: id } : e)),
    })),
  };
  return { neu, vorher: vorherNeu };
}

/** Zahl der Einträge, die ein Folgeprotokoll aus diesem Protokoll übernähme. */
export const mitgehendeEintraege = (p: Protokoll): number => uebernahme(p).mitgenommen.size;

/** Nummer des nächsten Protokolls einer Reihe. */
export const naechsteNr = (protokolle: Protokoll[], reiheId: ID): number =>
  protokolle.filter((p) => p.reiheId === reiheId).reduce((m, p) => Math.max(m, p.nr), 0) + 1;

/** Zahl der Einträge, die ein Protokoll aus seinem Vorprotokoll übernommen hat. */
export const uebernommeneEintraege = (p: Protokoll): number =>
  p.tops.reduce((n, t) => n + t.eintraege.filter((e) => e.vor).length, 0);

/* ------------------------------------------------------------------ */
/* Reihen und Aufgaben                                                 */
/* ------------------------------------------------------------------ */

export interface Reihe {
  id: ID;
  /** Protokolle nach Nummer aufsteigend. */
  protokolle: Protokoll[];
  letztes: Protokoll;
}

/** Protokolle eines Projekts nach Reihen; die Reihe mit dem jüngsten Protokoll zuerst. */
export function reihenVon(protokolle: Protokoll[]): Reihe[] {
  const gruppen = new Map<ID, Protokoll[]>();
  for (const p of protokolle) gruppen.set(p.reiheId, [...(gruppen.get(p.reiheId) ?? []), p]);
  const reihen = [...gruppen.entries()].map(([id, liste]) => {
    const sortiert = [...liste].sort((a, b) => a.nr - b.nr);
    return { id, protokolle: sortiert, letztes: sortiert[sortiert.length - 1] };
  });
  const juengstes = (r: Reihe) => r.protokolle.reduce((m, p) => (p.datum > m ? p.datum : m), '');
  return reihen.sort((a, b) => juengstes(b).localeCompare(juengstes(a)));
}

export interface ProtokollAufgabe {
  protokoll: Protokoll;
  top: Top;
  eintrag: Eintrag;
  /** Ergänzung mit eigener Art „Aufgabe“; null = der Eintrag selbst ist die Aufgabe. */
  zeile: Zeile | null;
  /** Punktnummer im Protokoll, z. B. „2.1“. */
  nr: string;
}

/**
 * Aufgaben aus Protokollen – Einträge vom Typ A und Ergänzungen mit eigener
 * Art „Aufgabe“, je Aufgabe nur ihr jüngstes Vorkommen: Wurde der Eintrag in
 * ein Folgeprotokoll übernommen, zählt er dort. Gestrichenes zählt nicht.
 */
export function protokollAufgaben(protokolle: Protokoll[]): ProtokollAufgabe[] {
  const aufgaben: ProtokollAufgabe[] = [];
  for (const protokoll of protokolle) {
    protokoll.tops.forEach((top, ti) =>
      top.eintraege.forEach((eintrag, ei) => {
        if (eintrag.uebernommenIn || eintragEntfaellt(top, eintrag)) return;
        const nr = `${ti + 1}.${ei + 1}`;
        if (eintrag.typ === 'A' && eintrag.zeilen.some((z) => !eigeneArt(z))) {
          aufgaben.push({ protokoll, top, eintrag, zeile: null, nr });
        }
        for (const zeile of eintrag.zeilen) {
          if (zeile.typ === 'A' && !zeile.entfaellt && zeile.text.trim()) {
            aufgaben.push({ protokoll, top, eintrag, zeile, nr });
          }
        }
      }),
    );
  }
  return aufgaben;
}

/* ------------------------------------------------------------------ */
/* Teilnehmende nachziehen                                             */
/* ------------------------------------------------------------------ */

/**
 * Hält Teilnehmende auf dem Stand der Projektbeteiligtenliste: Name,
 * Funktion, Firma und Kürzel folgen der Person. Ist sie gelöscht, bleiben die
 * Angaben stehen und der Verweis entfällt. Läuft nach jeder Änderung im Store.
 */
export function teilnehmerNachziehen(d: ProjektsteuerungDaten): ProjektsteuerungDaten {
  const beteiligte = new Map(d.beteiligte.map((b) => [b.id, b]));
  let geaendert = false;
  const protokolle = d.protokolle.map((p) => {
    let anders = false;
    const teilnehmer = p.teilnehmer.map((t) => {
      if (!t.beteiligterId) return t;
      const b = beteiligte.get(t.beteiligterId);
      if (!b || b.projektId !== p.projektId) {
        anders = true;
        return { ...t, beteiligterId: null };
      }
      const soll = teilnehmerAus(b, d.funktionen);
      if (t.name === soll.name && t.funktion === soll.funktion && t.firma === soll.firma && t.kuerzel === soll.kuerzel) {
        return t;
      }
      anders = true;
      return { ...t, name: soll.name, funktion: soll.funktion, firma: soll.firma, kuerzel: soll.kuerzel };
    });
    if (!anders) return p;
    geaendert = true;
    return { ...p, teilnehmer };
  });
  return geaendert ? { ...d, protokolle } : d;
}

/* ------------------------------------------------------------------ */
/* Frühere Form der Einträge                                           */
/* ------------------------------------------------------------------ */

/**
 * Zeilen aus der früheren Form eines Eintrags – ein Text, eine Ergänzung und
 * eine Fundstelle wie „Prot. 2, Pkt. 1.3“ – für ältere Bestände und Dateien
 * des Protokoll-Tools. Der Text wird eine Zeile aus dem Protokoll der
 * Fundstelle, die Ergänzung eine neue Zeile; beide laufen unter dem Ursprung
 * mit. `nr` ist die Nummer des Protokolls, in dem der Eintrag steht.
 */
export function zeilenAusAltform(
  alt: { text: string; zusatz: string; herkunft: string; vorText: string | null },
  nr: number,
): Zeile[] {
  const uebernommen = alt.herkunft.trim() !== '' || alt.vorText !== null;
  const fundstelle = /Prot\.?\s*(\d+)/i.exec(alt.herkunft);
  const zeilen: Zeile[] = [];
  if (alt.text.trim() || !alt.zusatz.trim()) {
    zeilen.push({
      ...neueZeile(alt.text),
      herkunft: uebernommen ? (fundstelle ? Number(fundstelle[1]) : Math.max(1, nr - 1)) : null,
      vor:
        alt.vorText !== null
          ? { text: alt.vorText, typ: null, wer: '', termin: '', status: 'offen', entfaellt: false }
          : null,
    });
  }
  if (alt.zusatz.trim()) zeilen.push(neueZeile(alt.zusatz));
  return zeilen;
}

/* ------------------------------------------------------------------ */
/* Übernahme aus dem Protokoll-Tool                                    */
/* ------------------------------------------------------------------ */

type Roh = Record<string, unknown>;
const text = (w: unknown) => (typeof w === 'string' ? w : typeof w === 'number' ? String(w) : '');
const datum = (w: unknown) => (typeof w === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w) ? w : '');
const uhrzeit = (w: unknown) => (typeof w === 'string' && /^\d{1,2}:\d{2}$/.test(w) ? w : '');
const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Liest eine Datei des eigenständigen Protokoll-Tools (`.protokoll`, eine
 * Reihe; oder dessen Sicherung mit allen Reihen) und bildet sie auf
 * Protokolle des Projekts ab. Teilnehmende, deren Name in der
 * Projektbeteiligtenliste steht, werden mit ihr verknüpft. Protokolle, die es
 * im Projekt bereits gibt (gleiche Kennung), werden ersetzt; sonst entstehen
 * neue Kennungen, wenn die alte schon vergeben ist.
 */
export function ausProtokollTool(
  inhalt: string,
  projektId: ID,
  daten: ProjektsteuerungDaten,
): Protokoll[] {
  let d: Roh;
  try {
    d = JSON.parse(inhalt) as Roh;
  } catch {
    throw new Error('ist keine gültige JSON-Datei');
  }
  if (!d || typeof d !== 'object') throw new Error('enthält keine Protokolle');
  const liste: unknown = d.protocol
    ? [d.protocol]
    : Array.isArray(d.protocols)
      ? d.protocols
      : Array.isArray(d.tops)
        ? [d]
        : null;
  if (!Array.isArray(liste) || liste.length === 0) throw new Error('enthält keine Protokolle');
  const roh = liste as Roh[];
  if (!roh.every((x) => x && typeof x === 'object' && text(x.id) && Array.isArray(x.tops))) {
    throw new Error('ist keine gültige Protokolldatei');
  }

  const imProjekt = new Set(daten.protokolle.filter((p) => p.projektId === projektId).map((p) => p.id));
  const vergeben = new Set(daten.protokolle.map((p) => p.id));
  const kennung = new Map<string, ID>();
  for (const x of roh) {
    const alt = text(x.id);
    kennung.set(alt, imProjekt.has(alt) || !vergeben.has(alt) ? alt : newId('pt'));
  }
  const beteiligte = daten.beteiligte.filter((b) => b.projektId === projektId);

  return roh.map((x): Protokoll => {
    const serie = text(x.serie) || text(d.serie) || `pa:${text(x.projekt)}|${text(x.art)}`;
    const fuehrerName = text(x.fuehrer).trim();
    let fuehrerId: ID | null = null;
    const teilnehmer = (Array.isArray(x.teilnehmer) ? (x.teilnehmer as Roh[]) : [])
      .filter((t) => t && typeof t === 'object')
      .map((t): Teilnehmer => {
        const name = text(t.name).trim();
        const b = name ? beteiligte.find((p) => normName(personName(p)) === normName(name)) : undefined;
        const id = newId('tn');
        if (!fuehrerId && (t.auto === 'fuehrer' || (fuehrerName && name === fuehrerName))) fuehrerId = id;
        return {
          id,
          beteiligterId: b?.id ?? null,
          name,
          funktion: text(t.funktion),
          firma: text(t.firma),
          kuerzel: text(t.kuerzel),
          status: (TEILNAHME as readonly string[]).includes(text(t.status)) ? (text(t.status) as Teilnahme) : 'anwesend',
        };
      });
    if (!fuehrerId && fuehrerName) {
      const t = { ...freierTeilnehmer(), name: fuehrerName, funktion: 'Projektsteuerung' };
      teilnehmer.unshift(t);
      fuehrerId = t.id;
    }
    const typ = (w: unknown): EintragTyp => (w === 'F' || w === 'A' ? w : 'I');
    const zahl = Number.parseInt(text(x.nr), 10);
    const nr = Number.isFinite(zahl) && zahl > 0 ? zahl : 1;
    const eintrag = (e: Roh): Eintrag => {
      const vor = e.vor && typeof e.vor === 'object' ? (e.vor as Roh) : null;
      return {
        id: newId('e'),
        typ: typ(e.typ),
        zeilen: zeilenAusAltform(
          { text: text(e.text), zusatz: text(e.zusatz), herkunft: text(e.herkunft), vorText: vor ? text(vor.text) : null },
          nr,
        ),
        wer: text(e.wer),
        termin: datum(e.termin),
        status: e.status === 'erledigt' ? 'erledigt' : 'offen',
        entfaellt: false,
        uebernommenIn: e.carriedTo
          ? (kennung.get(text(e.carriedTo)) ?? (imProjekt.has(text(e.carriedTo)) ? text(e.carriedTo) : null))
          : null,
        vor: vor
          ? {
              typ: vor.typ === undefined ? typ(e.typ) : typ(vor.typ),
              wer: text(vor.wer),
              termin: datum(vor.termin),
              status: vor.status === 'erledigt' ? 'erledigt' : 'offen',
              entfaellt: false,
            }
          : null,
      };
    };
    const tops = (x.tops as Roh[])
      .filter((t) => t && typeof t === 'object')
      .map(
        (t): Top => ({
          ...neuerTop(text(t.titel)),
          vorTitel: typeof t.vorTitel === 'string' ? t.vorTitel : null,
          eintraege: (Array.isArray(t.eintraege) ? (t.eintraege as Roh[]) : [])
            .filter((e) => e && typeof e === 'object')
            .map(eintrag),
        }),
      );
    return {
      id: kennung.get(text(x.id))!,
      projektId,
      reiheId: `${projektId}:${serie}`,
      art: text(x.art) || 'Besprechung',
      nr,
      datum: datum(x.datum) || today(),
      beginn: uhrzeit(x.beginn),
      ende: uhrzeit(x.ende),
      ort: text(x.ort),
      fuehrerId,
      naechster: datum(x.naechster),
      verteiler: text(x.verteiler),
      hinweis: typeof x.hinweis === 'string' ? x.hinweis : STANDARD_HINWEIS,
      teilnehmer,
      tops: tops.length > 0 ? tops : [neuerTop('Allgemeines')],
      geaendert: new Date().toISOString(),
    };
  });
}
