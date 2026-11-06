/** Fachliche Anzeige-Bausteine und Texte, die in mehreren Ansichten gebraucht werden. */
import { formatDate, toISO } from '../../../shared/dates';
import { Badge } from '../../../shared/ui';
import {
  NACHWEIS_STATUS_LABEL,
  QUELLE_LABEL,
  RASTER_KURZ,
  RASTER_LABEL,
  ZEITRAUMREGEL_LABEL,
  mitarbeiterName,
  type Mitarbeiter,
  type NachweisStatus,
  type ProjektStatus,
  type Quelle,
  type Raster,
  type Zeitraumregel,
} from '../domain/types';

/** Farbe des Projektstatus – wie in der Projektsteuerung. */
export const STATUS_TON: Record<ProjektStatus, '' | 'green' | 'orange'> = {
  aktiv: 'green',
  pausiert: 'orange',
  abgeschlossen: '',
};

/** In Bearbeitung blau, abgeschlossen grün. */
export function NachweisStatusBadge({ status }: { status: NachweisStatus }) {
  return <Badge ton={status === 'abgeschlossen' ? 'green' : 'blue'}>{NACHWEIS_STATUS_LABEL[status]}</Badge>;
}

/** Tages-, wochen- oder monatsscharf – neutral. */
export function RasterBadge({ raster }: { raster: Raster }) {
  return <Badge>{RASTER_LABEL[raster]}</Badge>;
}

/** Herkunft einer Leistung: Import lila, händisch neutral. */
export function QuelleBadge({ quelle }: { quelle: Quelle }) {
  return <Badge ton={quelle === 'import' ? 'purple' : ''}>{QUELLE_LABEL[quelle]}</Badge>;
}

/** „1 Leistung“, „3 Leistungen“ */
export function anzahl(n: number, eins: string, mehr: string): string {
  return `${n} ${n === 1 ? eins : mehr}`;
}

/** Auswahl des Rasters (Tag/Woche/Monat) – im Projektdialog, in den Einstellungen und im Nachweisdialog. */
export const RASTER_OPTIONEN = (['tag', 'woche', 'monat'] as Raster[]).map((r) => ({ value: r, label: RASTER_KURZ[r] }));

/** Auswahl der Regel für neue Nachweise. */
export const REGEL_OPTIONEN = (Object.keys(ZEITRAUMREGEL_LABEL) as Zeitraumregel[]).map((r) => ({
  value: r,
  label: ZEITRAUMREGEL_LABEL[r],
}));

/** Mitarbeiter nach Nach- und Vorname. */
export function nachNamen(a: Mitarbeiter, b: Mitarbeiter): number {
  return a.nachname.localeCompare(b.nachname, 'de') || a.vorname.localeCompare(b.vorname, 'de');
}

/** Eintrag einer Mitarbeiterauswahl: „MM: Max Mustermann“, bei Ausgeschiedenen mit Zusatz. */
export function mitarbeiterAuswahlText(m: Mitarbeiter): string {
  return `${m.kuerzel ? `${m.kuerzel}: ` : ''}${mitarbeiterName(m) || m.kuerzel}${m.aktiv ? '' : ' (ausgeschieden)'}`;
}

/** Meldung nach „Nachweise anlegen“ – auf der Übersicht und im Reiter „Leistungsnachweise“. */
export function nachweiseAngelegtText({ neu, erweitert }: { neu: number; erweitert: number }): string {
  if (neu === 0) return `${anzahl(erweitert, 'Leistungsnachweis', 'Leistungsnachweise')} erweitert.`;
  return `${anzahl(neu, 'Leistungsnachweis', 'Leistungsnachweise')} angelegt${erweitert ? `, ${erweitert} erweitert` : ''}.`;
}

/** Zeitpunkt in Ortszeit: „am 23.10.2026 um 14:05 Uhr“; leer ohne gültige Angabe. */
export function zeitpunkt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `am ${formatDate(toISO(d))} um ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}
