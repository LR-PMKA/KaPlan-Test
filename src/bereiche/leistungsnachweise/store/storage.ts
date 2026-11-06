/**
 * Lokale Persistenz des Bereichs „Leistungsnachweise“ unter einem eigenen
 * Schlüssel. Die Bestände der anderen Bereiche werden weder gelesen noch
 * geschrieben.
 *
 * Wie im Planlaufmanagement wird nur gespeichert, wenn der Bestand
 * einwandfrei geladen wurde (`LadeZustand` 'ok'): Nach einem Ladefehler oder
 * bei einem Stand aus einer neueren Fassung zeigt der Bereich Demodaten und
 * lässt den gespeicherten Stand unberührt. Vor jeder Umstellung auf eine
 * neue Fassung legt `ladeDaten` eine Rohkopie `<Schlüssel>.vor-fassung-<n>` an.
 *
 * Fassungen: 1 – erster Stand; 2 – Rolle Controlling am Mitarbeiter,
 * Aufschläge je Nachweiszeile, abgerechnete Stunden im festgeschriebenen Stand
 * (`migriere`).
 */
import { today } from '../../../shared/dates';
import { seedDaten } from '../domain/seed';
import {
  DATEN_VERSION,
  OHNE_ABSCHNITT,
  STANDARD_BEARBEITER,
  type Abschnitt,
  type Leistung,
  type Leistungsnachweis,
  type LeistungsnachweisDaten,
  type Logo,
  type Mitarbeiter,
  type NachweisStand,
  type NachweisZeile,
  type Projekt,
  type ZeilenText,
} from '../domain/types';
import { istDatum, runden } from '../domain/zeitraum';

export { DATEN_VERSION };

const KEY = 'leistungsnachweise.data.v1';

/** Präfix der Rohkopien vor einer Umstellung: `<KEY>.vor-fassung-<n>`. */
const VOR_FASSUNG = `${KEY}.vor-fassung-`;

/** Kennzeichen in Sicherungsdateien, damit sie dem richtigen Bereich zugeordnet werden. */
const SICHERUNG_BEREICH = 'leistungsnachweise';

/**
 * Zustand nach dem Laden: `ladefehler` – der gespeicherte Stand ließ sich nicht
 * lesen; `neuere_fassung` – er stammt aus einer neueren Fassung von KaPlan. In
 * beiden Fällen zeigt der Bereich Demodaten und speichert nicht, damit der
 * gespeicherte Stand erhalten bleibt.
 */
export type LadeZustand = 'ok' | 'ladefehler' | 'neuere_fassung';

/** Ergebnis von `ladeDaten`. */
export interface Geladen {
  daten: LeistungsnachweisDaten;
  zustand: LadeZustand;
}

type Roh = Record<string, unknown>;

const liste = (w: unknown): Roh[] => (Array.isArray(w) ? w.filter((x): x is Roh => !!x && typeof x === 'object') : []);
const objekt = (w: unknown): Roh | null => (w && typeof w === 'object' && !Array.isArray(w) ? (w as Roh) : null);
const text = (w: unknown) => (typeof w === 'string' ? w : '');
const datum = (w: unknown) => (istDatum(w) ? w : '');
const idOderNull = (w: unknown) => (typeof w === 'string' && w ? w : null);
const zufallsId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const ids = (w: unknown): string[] => (Array.isArray(w) ? w.filter((x): x is string => typeof x === 'string' && !!x) : []);
const auswahl = <T extends string>(w: unknown, werte: readonly T[], vorgabe: T): T =>
  (werte as readonly unknown[]).includes(w) ? (w as T) : vorgabe;

/** Stunden als Zahl – auch aus Text („6,5“); sonst 0. */
function stunden(w: unknown): number {
  if (typeof w === 'number') return Number.isFinite(w) ? w : 0;
  if (typeof w === 'string') {
    const z = Number(w.trim().replace(',', '.'));
    return Number.isFinite(z) ? z : 0;
  }
  return 0;
}

/** Zahlen je Schlüssel (Stunden je Abschnitt bzw. Mitarbeiter). */
function zahlen(w: unknown): Record<string, number> {
  const o = objekt(w);
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, stunden(v)]));
}

/** Je Kennung nur der erste Eintrag – ein von Hand bearbeiteter Bestand kann Kennungen doppelt führen. */
function eindeutig<T extends { id: string }>(eintraege: T[]): T[] {
  const gesehen = new Set<string>();
  return eintraege.filter((e) => (gesehen.has(e.id) ? false : (gesehen.add(e.id), true)));
}

const RASTER = ['tag', 'woche', 'monat'] as const;

function abschnittAufbereiten(a: Roh): Abschnitt {
  return { id: text(a.id) || zufallsId('ab'), kennung: text(a.kennung), kurz: text(a.kurz), name: text(a.name) };
}

function zeileAufbereiten(z: Roh): NachweisZeile {
  const von = datum(z.von);
  const erfasst = stunden(z.stunden);
  const jeAbschnitt = zahlen(z.stundenJeAbschnitt);
  return {
    schluessel: text(z.schluessel),
    von,
    bis: datum(z.bis) || von,
    datumText: text(z.datumText),
    bearbeiter: Array.isArray(z.bearbeiter) ? z.bearbeiter.map(text) : [],
    text: text(z.text),
    textBearbeitet: z.textBearbeitet === true,
    stunden: erfasst,
    stundenJeAbschnitt: jeAbschnitt,
    stundenJeMitarbeiter: zahlen(z.stundenJeMitarbeiter),
    leistungIds: ids(z.leistungIds),
    // Fehlen die Felder (Fassung 1), gilt: kein Aufschlag, abgerechnet = erfasst
    aufschlag: stunden(z.aufschlag),
    aufschlagJeAbschnitt: ohneNull(zahlen(z.aufschlagJeAbschnitt)),
    abgerechnet: typeof z.abgerechnet === 'number' || typeof z.abgerechnet === 'string' ? stunden(z.abgerechnet) : erfasst,
    abgerechnetJeAbschnitt: objekt(z.abgerechnetJeAbschnitt) ? zahlen(z.abgerechnetJeAbschnitt) : { ...jeAbschnitt },
  };
}

/** Nur Einträge ≠ 0, auf zwei Nachkommastellen. */
function ohneNull(werte: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(werte)
      .map(([k, v]): [string, number] => [k, runden(v)])
      .filter(([, v]) => v !== 0),
  );
}

function standAufbereiten(w: unknown): NachweisStand | null {
  const s = objekt(w);
  if (!s || !Array.isArray(s.zeilen)) return null;
  const p = objekt(s.projekt) ?? {};
  const erfasst = stunden(s.stunden);
  return {
    zeilen: liste(s.zeilen).map(zeileAufbereiten),
    abschnitte: liste(s.abschnitte).map(abschnittAufbereiten),
    projekt: {
      nummer: text(p.nummer),
      name: text(p.name),
      kurzname: text(p.kurzname),
      leistungsbereich: text(p.leistungsbereich),
    },
    titel: text(s.titel),
    stunden: erfasst,
    abgerechnet: typeof s.abgerechnet === 'number' || typeof s.abgerechnet === 'string' ? stunden(s.abgerechnet) : erfasst,
  };
}

function texteAufbereiten(w: unknown): Record<string, ZeilenText> {
  const o = objekt(w);
  if (!o) return {};
  const ergebnis: Record<string, ZeilenText> = {};
  for (const [schluessel, wert] of Object.entries(o)) {
    const t = objekt(wert);
    if (t && typeof t.text === 'string') ergebnis[schluessel] = { text: t.text, leistungIds: ids(t.leistungIds) };
  }
  return ergebnis;
}

/**
 * Ergänzt fehlende Felder, damit ältere oder von Hand bearbeitete Stände
 * laden, und verwirft kaputte Verweise: Leistungen und Nachweise ohne
 * (bekanntes) Projekt oder ohne gültiges Datum fallen weg; ein unbekannter
 * Mitarbeiter bleibt als Verweis stehen (der Nachweis zeigt dann „?“), ein
 * unbekannter Abschnitt wird zu „ohne Abschnitt“. Für Prüfungen exportiert.
 */
export function aufbereiten(roh: Partial<LeistungsnachweisDaten>): LeistungsnachweisDaten {
  const e = objekt(roh.einstellungen) ?? {};
  const mitarbeiter = eindeutig(
    liste(roh.mitarbeiter).map(
      (m): Mitarbeiter => ({
        id: text(m.id) || zufallsId('ma'),
        kuerzel: text(m.kuerzel).trim(),
        vorname: text(m.vorname).trim(),
        nachname: text(m.nachname).trim(),
        aktiv: m.aktiv !== false,
        controlling: m.controlling === true,
      }),
    ),
  );
  const projekte = eindeutig(
    liste(roh.projekte).map(
      (p): Projekt => ({
        id: text(p.id) || zufallsId('pr'),
        nummer: text(p.nummer).trim(),
        name: text(p.name) || 'Ohne Bezeichnung',
        kurzname: text(p.kurzname),
        status: auswahl(p.status, ['aktiv', 'pausiert', 'abgeschlossen'] as const, 'aktiv'),
        markiert: p.markiert !== false,
        beschreibung: text(p.beschreibung),
        leistungsbereich: typeof p.leistungsbereich === 'string' ? p.leistungsbereich : 'Projektsteuerung',
        raster: auswahl(p.raster, RASTER, 'monat'),
        zeitraumregel: auswahl(p.zeitraumregel, ['monat', 'fortlaufend'] as const, 'monat'),
        abschnitte: eindeutig(liste(p.abschnitte).map(abschnittAufbereiten)),
        logos: Array.isArray(p.logos)
          ? liste(p.logos)
              .filter((l) => text(l.src))
              .map((l): Logo => ({ id: text(l.id) || zufallsId('logo'), name: text(l.name), src: text(l.src) }))
          : null,
      }),
    ),
  );
  const projektVon = new Map(projekte.map((p) => [p.id, p]));

  const leistungen = eindeutig(
    liste(roh.leistungen)
      .filter((l) => projektVon.has(text(l.projektId)) && istDatum(l.datum))
      .map((l): Leistung => {
        const projekt = projektVon.get(text(l.projektId))!;
        const abschnittId = idOderNull(l.abschnittId);
        return {
          id: text(l.id) || zufallsId('le'),
          projektId: projekt.id,
          mitarbeiterId: text(l.mitarbeiterId),
          datum: l.datum as string,
          text: text(l.text),
          stunden: stunden(l.stunden),
          abschnittId:
            abschnittId && abschnittId !== OHNE_ABSCHNITT && projekt.abschnitte.some((a) => a.id === abschnittId)
              ? abschnittId
              : null,
          projektelement: text(l.projektelement),
          quelle: l.quelle === 'import' ? 'import' : 'manuell',
          erfasst: text(l.erfasst),
        };
      }),
  );

  const nachweise = eindeutig(
    liste(roh.nachweise)
      .filter((n) => projektVon.has(text(n.projektId)) && istDatum(n.von) && istDatum(n.bis))
      .map((n): Leistungsnachweis => {
        const projekt = projektVon.get(text(n.projektId))!;
        const [von, bis] = [n.von as string, n.bis as string].sort();
        const status = n.status === 'abgeschlossen' ? 'abgeschlossen' : 'entwurf';
        const geaendert = text(n.geaendert) || text(n.erstellt) || new Date().toISOString();
        return {
          id: text(n.id) || zufallsId('ln'),
          projektId: projekt.id,
          titel: text(n.titel),
          von,
          bis,
          raster: auswahl(n.raster, RASTER, projekt.raster),
          status,
          texte: texteAufbereiten(n.texte),
          aufschlaege: ohneNull(zahlen(n.aufschlaege)),
          bemerkung: text(n.bemerkung),
          erstellt: text(n.erstellt) || geaendert,
          geaendert,
          abgeschlossen: status === 'abgeschlossen' ? text(n.abgeschlossen) || null : null,
          stand: status === 'abgeschlossen' ? standAufbereiten(n.stand) : null,
        };
      }),
  );

  const mitarbeiterId = idOderNull(e.mitarbeiterId);
  return {
    version: DATEN_VERSION,
    einstellungen: {
      bearbeiter: text(e.bearbeiter).trim() || STANDARD_BEARBEITER,
      mitarbeiterId: mitarbeiterId && mitarbeiter.some((m) => m.id === mitarbeiterId) ? mitarbeiterId : null,
      farbmodus: e.farbmodus === 'kontrast' ? 'kontrast' : 'standard',
    },
    mitarbeiter,
    projekte,
    leistungen,
    nachweise,
  };
}

/**
 * Fassung 1 → 2: Die Rolle Controlling erhält, wer bisher als „Ich erfasse
 * als“ eingestellt war (er hatte alle Rechte); alle übrigen nicht. Nachweise
 * erhalten leere Aufschläge, festgeschriebene Stände abgerechnet = erfasst.
 */
function vonFassung1(roh: Roh): Roh {
  const e = objekt(roh.einstellungen) ?? {};
  const mitarbeiter = liste(roh.mitarbeiter);
  const ich = idOderNull(e.mitarbeiterId);
  const gueltig = !!ich && mitarbeiter.some((m) => text(m.id) === ich);
  const zeileV2 = (z: Roh): Roh => ({
    ...z,
    aufschlag: 0,
    aufschlagJeAbschnitt: {},
    abgerechnet: stunden(z.stunden),
    abgerechnetJeAbschnitt: { ...zahlen(z.stundenJeAbschnitt) },
  });
  return {
    ...roh,
    mitarbeiter: mitarbeiter.map((m) => ({ ...m, controlling: gueltig && text(m.id) === ich })),
    nachweise: liste(roh.nachweise).map((n) => {
      const stand = objekt(n.stand);
      return {
        ...n,
        aufschlaege: {},
        stand: stand
          ? { ...stand, zeilen: liste(stand.zeilen).map(zeileV2), abgerechnet: stunden(stand.stunden) }
          : n.stand,
      };
    }),
  };
}

/**
 * Hebt einen älteren Stand auf die aktuelle Fassung – in einem Aufruf, Schritt
 * für Schritt; neue Schritte kommen hier vor `aufbereiten` hinzu. Auch
 * Sicherungen älterer Fassungen laufen hierdurch.
 */
function migriere(roh: Partial<LeistungsnachweisDaten>): LeistungsnachweisDaten {
  let stand = roh as unknown as Roh;
  const fassung = typeof stand.version === 'number' ? stand.version : 0;
  if (fassung < 2) stand = vonFassung1(stand);
  return aufbereiten(stand as Partial<LeistungsnachweisDaten>);
}

/** Lädt den Bestand; ohne gespeicherten Stand die Demodaten. */
export function ladeDaten(): Geladen {
  const demo = (zustand: LadeZustand): Geladen => ({ daten: seedDaten(), zustand });
  let roh: string | null;
  try {
    roh = localStorage.getItem(KEY);
  } catch {
    return demo('ladefehler');
  }
  if (!roh) return demo('ok');
  let daten: Partial<LeistungsnachweisDaten>;
  try {
    daten = JSON.parse(roh) as Partial<LeistungsnachweisDaten>;
  } catch {
    return demo('ladefehler');
  }
  if (!daten || typeof daten !== 'object' || !Array.isArray(daten.projekte)) return demo('ladefehler');
  if (typeof daten.version === 'number' && daten.version > DATEN_VERSION) return demo('neuere_fassung');
  // Vor einer Umstellung den gespeicherten Text einmalig sichern – scheitert das, wird trotzdem umgestellt
  if ((daten.version ?? 0) < DATEN_VERSION) {
    try {
      const schluessel = `${VOR_FASSUNG}${daten.version ?? 0}`;
      if (localStorage.getItem(schluessel) === null) localStorage.setItem(schluessel, roh);
    } catch {
      /* kein Platz für die Kopie – der Stand lässt sich weiterhin herunterladen */
    }
  }
  try {
    return { daten: daten.version === DATEN_VERSION ? aufbereiten(daten) : migriere(daten), zustand: 'ok' };
  } catch {
    return demo('ladefehler');
  }
}

/** Speichert den Bestand; der Store ruft das nur bei `ladeZustand === 'ok'` auf. */
export function speichereDaten(daten: LeistungsnachweisDaten): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(daten));
  } catch (err) {
    console.warn('Daten konnten nicht lokal gespeichert werden:', err);
  }
}

function herunterladen(inhalt: string, dateiname: string): void {
  const blob = new Blob([inhalt], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  a.click();
  URL.revokeObjectURL(url);
}

/** Lädt den gesamten Bestand des Bereichs als JSON-Datei herunter. */
export function exportiereDaten(daten: LeistungsnachweisDaten): void {
  herunterladen(JSON.stringify({ bereich: SICHERUNG_BEREICH, ...daten }, null, 2), `leistungsnachweise-sicherung-${today()}.json`);
}

/**
 * Lädt den gespeicherten Stand unverändert herunter – für den Hinweis nach
 * einem Ladefehler oder bei einer neueren Fassung, wenn der Bereich Demodaten
 * zeigt. false, wenn kein Stand gespeichert ist.
 */
export function rohdatenHerunterladen(): boolean {
  let roh: string | null = null;
  try {
    roh = localStorage.getItem(KEY);
  } catch {
    return false;
  }
  if (roh === null) return false;
  herunterladen(roh, `leistungsnachweise-gespeicherter-stand-${today()}.json`);
  return true;
}

/**
 * Liest eine Sicherung und hebt sie auf die aktuelle Fassung. Wirft einen
 * Fehler mit verständlicher Meldung, wenn die Datei nicht passt – auch bei
 * Sicherungen der anderen Bereiche.
 */
export function sicherungLesen(inhalt: string): LeistungsnachweisDaten {
  let roh: unknown;
  try {
    roh = JSON.parse(inhalt);
  } catch {
    throw new Error('Die Datei ist keine gültige JSON-Datei.');
  }
  if (!roh || typeof roh !== 'object') throw new Error('Die Datei enthält keine Sicherung.');
  const daten = roh as Partial<LeistungsnachweisDaten> & { bereich?: unknown; projects?: unknown };
  if (Array.isArray(daten.projects)) {
    throw new Error('Die Datei ist eine Sicherung des Planlaufmanagements – bitte dort einspielen.');
  }
  if (daten.bereich === 'baubetrieb') {
    throw new Error('Die Datei ist eine Sicherung der Baubetriebsplanung – bitte dort einspielen.');
  }
  if (daten.bereich === 'projektsteuerung') {
    throw new Error('Die Datei ist eine Sicherung der Projektsteuerung – bitte dort einspielen.');
  }
  if (daten.bereich !== SICHERUNG_BEREICH || !Array.isArray(daten.projekte) || !Array.isArray(daten.leistungen)) {
    throw new Error('Die Datei ist keine Sicherung der Leistungsnachweise.');
  }
  if (typeof daten.version === 'number' && daten.version > DATEN_VERSION) {
    throw new Error(
      'Die Sicherung stammt aus einer neueren Fassung von KaPlan. Bitte die Seite neu laden (Strg+Umschalt+R) und erneut einspielen.',
    );
  }
  return migriere(daten);
}
