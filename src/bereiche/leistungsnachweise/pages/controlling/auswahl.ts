/**
 * Auswahl der Filter im Controlling – nur im Speicher der geöffneten Seite,
 * damit sie beim Wechsel der Reiter und zurück aus der Abrechnung erhalten
 * bleibt. Nichts davon gehört zum Datenbestand.
 */
import { today } from '../../../../shared/dates';
import type { ZeitraumArt } from '../../domain/auswertung';
import type { ID, ISODate, NachweisStatus } from '../../domain/types';
import { monatsanfang, monatsende } from '../../domain/zeitraum';

/** Zeitraum und Filter der Auswertung – Vorgabe: laufender Monat, alle Projekte und Mitarbeiter. */
export interface AuswertungAuswahl {
  art: ZeitraumArt;
  /** Bezugstag für Monat, Quartal und Jahr. */
  datum: ISODate;
  /** Freier Zeitraum. */
  von: ISODate;
  bis: ISODate;
  projektId: ID | '';
  mitarbeiterId: ID | '';
}

export const auswertungAuswahl: { wert: AuswertungAuswahl } = {
  wert: {
    art: 'monat',
    datum: today(),
    von: monatsanfang(today()),
    bis: monatsende(today()),
    projektId: '',
    mitarbeiterId: '',
  },
};

/** Filter der Liste „Leistungsnachweise“. */
export interface NachweisAuswahl {
  status: NachweisStatus | 'alle';
  projektId: ID | '';
  /** '' = alle Zeiträume, „2026“ = ein Jahr, „2026-10“ = ein Monat. */
  zeitraum: string;
}

export const nachweisAuswahl: { wert: NachweisAuswahl } = {
  wert: { status: 'alle', projektId: '', zeitraum: '' },
};
