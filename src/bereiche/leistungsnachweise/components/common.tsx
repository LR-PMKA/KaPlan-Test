/** Fachliche Anzeige-Bausteine, die in mehreren Ansichten gebraucht werden. */
import { Badge } from '../../../shared/ui';
import {
  NACHWEIS_STATUS_LABEL,
  QUELLE_LABEL,
  RASTER_LABEL,
  type NachweisStatus,
  type ProjektStatus,
  type Quelle,
  type Raster,
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
