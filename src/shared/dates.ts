/**
 * Datumshilfen ohne fachlichen Bezug. Der Datumstyp ist hier eigenständig
 * erklärt, damit dieser Baustein von keinem Bereich abhängt.
 */
export type ISODate = string;

/** Formatiert ein ISO-Datum als "14.03.2026". */
export function formatDate(iso: ISODate | null | undefined): string {
  if (!iso) return '–';
  const d = parseISO(iso);
  if (!d) return '–';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Formatiert ein ISO-Datum kurz als "14. Mär". */
export function formatDateShort(iso: ISODate | null | undefined): string {
  if (!iso) return '–';
  const d = parseISO(iso);
  if (!d) return '–';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
}

export function parseISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toISO(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(): ISODate {
  return toISO(new Date());
}

/** Differenz in Kalendertagen (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  const da = parseISO(a);
  const db = parseISO(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Addiert Tage auf ein Datum. Mit `arbeitstage` werden Wochenenden und
 * projektbezogene Feiertage übersprungen.
 */
export function addDays(
  iso: ISODate,
  tage: number,
  arbeitstage = false,
  feiertage: ISODate[] = [],
): ISODate {
  const d = parseISO(iso);
  if (!d) return iso;
  if (!arbeitstage) {
    d.setDate(d.getDate() + tage);
    return toISO(d);
  }
  const holidays = new Set(feiertage);
  let rest = Math.abs(tage);
  const schritt = tage >= 0 ? 1 : -1;
  while (rest > 0) {
    d.setDate(d.getDate() + schritt);
    if (!isWeekend(d) && !holidays.has(toISO(d))) rest--;
  }
  return toISO(d);
}

/** Ist der Tag ein Arbeitstag (Mo–Fr und kein Feiertag)? */
export function istArbeitstag(iso: ISODate, feiertage: ISODate[] = []): boolean {
  const d = parseISO(iso);
  if (!d) return false;
  return !isWeekend(d) && !feiertage.includes(toISO(d));
}

/** Der Tag selbst, wenn er ein Arbeitstag ist, sonst der nächste Arbeitstag. */
export function naechsterArbeitstag(iso: ISODate, feiertage: ISODate[] = []): ISODate {
  const d = parseISO(iso);
  if (!d) return iso;
  const holidays = new Set(feiertage);
  // Höchstens ein paar Wochen weit – eine Liste nur aus Feiertagen wäre ein Datenfehler
  for (let i = 0; i < 400 && (isWeekend(d) || holidays.has(toISO(d))); i++) d.setDate(d.getDate() + 1);
  return toISO(d);
}

/**
 * Zahl der Arbeitstage im Zeitraum (a, b] – a selbst zählt nicht, b schon.
 * Liegt b vor a, ist das Ergebnis negativ: −(Arbeitstage in (b, a]).
 * Für n ≥ 0 gilt `diffArbeitstage(a, addDays(a, n, true, f), f) === n`.
 */
export function diffArbeitstage(a: ISODate, b: ISODate, feiertage: ISODate[] = []): number {
  const da = parseISO(a);
  const db = parseISO(b);
  if (!da || !db) return 0;
  if (db.getTime() < da.getTime()) return -diffArbeitstage(b, a, feiertage);
  const holidays = new Set(feiertage);
  let anzahl = 0;
  const d = new Date(da);
  while (d.getTime() < db.getTime()) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d) && !holidays.has(toISO(d))) anzahl++;
  }
  return anzahl;
}

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const;

/** Kurzer Wochentag eines Datums: "Mo" … "So" (leer bei ungültigem Datum). */
export function wochentag(iso: ISODate | null | undefined): string {
  const d = iso ? parseISO(iso) : null;
  return d ? WOCHENTAGE[d.getDay()] : '';
}

/** "1 Tag" / "5 Tage" */
export function tageLabel(anzahl: number): string {
  return `${anzahl} ${Math.abs(anzahl) === 1 ? 'Tag' : 'Tage'}`;
}

/** "in 3 Tagen", "heute", "seit 2 Tagen überfällig" */
export function relativeLabel(iso: ISODate | null): string {
  if (!iso) return 'kein Termin';
  const delta = diffDays(today(), iso);
  if (delta === 0) return 'heute fällig';
  if (delta === 1) return 'morgen fällig';
  if (delta === -1) return '1 Tag überfällig';
  if (delta < 0) return `${Math.abs(delta)} Tage überfällig`;
  return `in ${delta} Tagen`;
}
