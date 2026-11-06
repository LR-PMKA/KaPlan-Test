/**
 * Rechte im Bereich „Leistungsnachweise“ – an genau einer Stelle, damit sie
 * später unverändert auf die gemeinsame Datenbank übergehen.
 *
 * Wer angemeldet ist (`einstellungen.mitarbeiterId`, ein aktiver Mitarbeiter),
 * erfasst, ändert und importiert nur eigene Leistungen und bearbeitet den
 * gemeinsamen Nachweis (Leistungstext, Bemerkung, „Ergänzen“), solange er
 * offen ist. Alles Übrige – Auswertung, Abschluss, Aufschläge, Export,
 * Sammel-Import, Nachweise anlegen, ändern und löschen, Projekte löschen,
 * Mitarbeiter verwalten – ist der Rolle Controlling vorbehalten. Leistungen
 * anderer ändert niemand, auch das Controlling nicht.
 *
 * Der Store (store/store.tsx) prüft jede Änderung hiermit; die Oberfläche
 * blendet Unerlaubtes zusätzlich aus. Alles rein, ohne React.
 */
import { mitarbeiterName, type ID, type Leistung, type LeistungsnachweisDaten, type Mitarbeiter, type NachweisZeile } from './types';

/** Hinweis an der Anmeldung (wörtlich). */
export const RECHTE_HINWEIS =
  'Solange die Daten nur in diesem Browser liegen, ist die Anmeldung eine Auswahl und keine Kennwortprüfung – mit der gemeinsamen Datenbank wird daraus eine echte Anmeldung mit Berechtigungen.';

/** Meldung, wenn die letzte Person mit der Rolle Controlling sie verlöre. */
export const LETZTE_ROLLE = 'Mindestens eine Person braucht die Rolle Controlling.';

/** Callout der Controlling-Ansichten ohne Rolle. */
export const KEIN_ZUGRIFF = 'Kein Zugriff – das Controlling ist Personen mit der Rolle Controlling vorbehalten.';

/** Meldung einer Aktion, die eine Anmeldung voraussetzt. */
export const NICHT_ANGEMELDET = 'Bitte zuerst anmelden.';

/** Meldung einer Aktion, die die Rolle Controlling voraussetzt. */
export const NUR_CONTROLLING = 'Das ist Personen mit der Rolle Controlling vorbehalten.';

/** Rechte, die allein die Rolle Controlling gewährt. */
export type Recht =
  | 'sammelImport'
  | 'projektLoeschen'
  | 'nachweisVerwalten'
  | 'abschliessen'
  | 'aufschlag'
  | 'export'
  | 'auswertung'
  | 'mitarbeiterVerwalten';

/** Die angemeldete Person – ein existierender, aktiver Mitarbeiter – oder null. */
export function angemeldet(d: Pick<LeistungsnachweisDaten, 'einstellungen' | 'mitarbeiter'>): Mitarbeiter | null {
  const id = d.einstellungen.mitarbeiterId;
  if (!id) return null;
  return d.mitarbeiter.find((m) => m.id === id && m.aktiv) ?? null;
}

/** Hat die angemeldete Person die Rolle Controlling? */
export function istControlling(d: Pick<LeistungsnachweisDaten, 'einstellungen' | 'mitarbeiter'>): boolean {
  return angemeldet(d)?.controlling === true;
}

/** Aktive Personen mit der Rolle Controlling. */
export function controller(d: Pick<LeistungsnachweisDaten, 'mitarbeiter'>): Mitarbeiter[] {
  return d.mitarbeiter.filter((m) => m.controlling && m.aktiv);
}

/**
 * Lässt sich die Rolle Controlling ohne sie zu haben übernehmen? Nur solange
 * niemand (aktiv) sie hat – zur Einrichtung.
 */
export function controllingEinrichtbar(d: Pick<LeistungsnachweisDaten, 'mitarbeiter'>): boolean {
  return controller(d).length === 0;
}

/** Darf die angemeldete Person das? Alle Rechte gewährt die Rolle Controlling. */
export function darf(d: Pick<LeistungsnachweisDaten, 'einstellungen' | 'mitarbeiter'>, recht: Recht): boolean {
  void recht;
  return istControlling(d);
}

/** Darf die angemeldete Person die Leistung ändern oder löschen? Nur eigene. */
export function darfLeistungAendern(d: Pick<LeistungsnachweisDaten, 'einstellungen' | 'mitarbeiter'>, l: Pick<Leistung, 'mitarbeiterId'>): boolean {
  const ich = angemeldet(d);
  return !!ich && l.mitarbeiterId === ich.id;
}

/** Darf die angemeldete Person die Leistung einzeln sehen? Eigene, mit der Rolle Controlling alle (nur lesen). */
export function darfLeistungSehen(d: Pick<LeistungsnachweisDaten, 'einstellungen' | 'mitarbeiter'>, l: Pick<Leistung, 'mitarbeiterId'>): boolean {
  return darfLeistungAendern(d, l) || istControlling(d);
}

/** Ist die Person die letzte aktive mit der Rolle Controlling? */
export function letzterController(d: Pick<LeistungsnachweisDaten, 'mitarbeiter'>, mitarbeiterId: ID): boolean {
  const alle = controller(d);
  return alle.length === 1 && alle[0].id === mitarbeiterId;
}

/**
 * Prüft einen Wechsel der Rolle Controlling: Vergeben und Entziehen darf das
 * Controlling; sich selbst die Rolle geben darf jeder Angemeldete, solange
 * niemand sie hat (`controllingEinrichtbar`). Die letzte Person behält sie.
 * Liefert die Meldung oder null, wenn der Wechsel erlaubt ist.
 */
export function rolleSetzenPruefen(d: LeistungsnachweisDaten, mitarbeiterId: ID, controlling: boolean): string | null {
  const m = d.mitarbeiter.find((x) => x.id === mitarbeiterId);
  if (!m) return 'Diesen Mitarbeiter gibt es nicht (mehr).';
  if (m.controlling === controlling) return null;
  const ich = angemeldet(d);
  if (!ich) return NICHT_ANGEMELDET;
  if (controlling) {
    if (!m.aktiv) return 'Ausgeschiedene Mitarbeiter erhalten die Rolle Controlling nicht.';
    if (istControlling(d)) return null;
    if (controllingEinrichtbar(d) && ich.id === mitarbeiterId) return null;
    return 'Die Rolle Controlling vergibt nur, wer sie selbst hat.';
  }
  if (!istControlling(d)) return 'Die Rolle Controlling entzieht nur, wer sie selbst hat.';
  if (letzterController(d, mitarbeiterId)) return LETZTE_ROLLE;
  return null;
}

/**
 * Prüft das Ändern eines Mitarbeiters (Controlling): Die letzte Person mit
 * der Rolle Controlling lässt sich nicht als ausgeschieden markieren.
 */
export function mitarbeiterAendernPruefen(d: LeistungsnachweisDaten, mitarbeiterId: ID, patch: Partial<Pick<Mitarbeiter, 'aktiv'>>): string | null {
  if (!darf(d, 'mitarbeiterVerwalten')) return NUR_CONTROLLING;
  if (!d.mitarbeiter.some((m) => m.id === mitarbeiterId)) return 'Diesen Mitarbeiter gibt es nicht (mehr).';
  if (patch.aktiv === false && letzterController(d, mitarbeiterId)) return LETZTE_ROLLE;
  return null;
}

/**
 * Prüft das Löschen eines Mitarbeiters (Controlling): nur ohne Leistungen und
 * nicht die letzte Person mit der Rolle Controlling.
 */
export function mitarbeiterLoeschenPruefen(d: LeistungsnachweisDaten, mitarbeiterId: ID): string | null {
  if (!darf(d, 'mitarbeiterVerwalten')) return NUR_CONTROLLING;
  const m = d.mitarbeiter.find((x) => x.id === mitarbeiterId);
  if (!m) return 'Diesen Mitarbeiter gibt es nicht (mehr).';
  const anzahl = d.leistungen.filter((l) => l.mitarbeiterId === mitarbeiterId).length;
  if (anzahl > 0) {
    return `„${mitarbeiterName(m) || m.kuerzel}“ hat noch ${anzahl} ${anzahl === 1 ? 'Leistung' : 'Leistungen'} und lässt sich deshalb nicht löschen – stattdessen als ausgeschieden markieren.`;
  }
  if (letzterController(d, mitarbeiterId)) return LETZTE_ROLLE;
  return null;
}

/** Eigene Leistungen der angemeldeten Person aus einer Liste (ohne Anmeldung keine). */
export function eigeneLeistungen<T extends Pick<Leistung, 'mitarbeiterId'>>(
  d: Pick<LeistungsnachweisDaten, 'einstellungen' | 'mitarbeiter'>,
  leistungen: T[],
): T[] {
  const ich = angemeldet(d);
  return ich ? leistungen.filter((l) => l.mitarbeiterId === ich.id) : [];
}

/**
 * Leistungen einer Nachweiszeile, wie sie die angemeldete Person aufklappen
 * darf: die eigenen einzeln, die der anderen nur als Zahl
 * („+ 3 Leistungen von Kolleginnen und Kollegen“). Mit der Rolle Controlling
 * stehen auch die der anderen einzeln darin (`andere`, nur lesen).
 */
export function leistungenDerZeile(
  d: Pick<LeistungsnachweisDaten, 'einstellungen' | 'mitarbeiter' | 'leistungen'>,
  zeile: Pick<NachweisZeile, 'leistungIds'>,
): { eigene: Leistung[]; andere: Leistung[]; andereAnzahl: number } {
  const ids = new Set(zeile.leistungIds);
  const alle = d.leistungen.filter((l) => ids.has(l.id)).sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  const ich = angemeldet(d);
  const eigene = ich ? alle.filter((l) => l.mitarbeiterId === ich.id) : [];
  const fremd = alle.filter((l) => !ich || l.mitarbeiterId !== ich.id);
  return { eigene, andere: istControlling(d) ? fremd : [], andereAnzahl: fremd.length };
}
