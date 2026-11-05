/**
 * Excel-Ausgaben des Bereichs: die Projektbeteiligtenliste, auch als leere
 * Vorlage für den Import.
 */
import { formatDate, today } from '../../../shared/dates';
import { dateiLaden, xlsxErzeugen, type Zelle } from '../../../shared/xlsx';
import { BETEILIGTE_KOPF } from './beteiligteImport';
import { kuerzelVon, type Beteiligter, type Funktion, type Projekt } from './types';

const KOPF_STIL = { fett: true, fuellung: 'E8EDF3', rahmen: true };
/** Spaltenbreiten der Beteiligtenliste in der Reihenfolge von `BETEILIGTE_KOPF`. */
const SPALTENBREITEN = [24, 10, 9, 8, 14, 16, 28, 30, 18, 18, 30, 30];
const kopf = (spalten: string[]): Zelle[] => spalten.map((wert) => ({ wert, stil: KOPF_STIL }));
const titelZeile = (text: string): Zelle[] => [{ wert: text, stil: { fett: true, groesse: 13 } }];

const UMLAUTE: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

/** Dateiname ohne Umlaute und Sonderzeichen – manche Browser verwerfen sonst den Namen. */
function dateiname(text: string): string {
  return text
    .replace(/[äöüÄÖÜß]/g, (z) => UMLAUTE[z])
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const projektTitel = (p: Projekt) => [p.nummer, p.name].filter(Boolean).join(' ');

/**
 * Projektbeteiligtenliste als Excel-Datei. Die Spalten entsprechen der
 * Importvorlage (`BETEILIGTE_KOPF`) – die Datei lässt sich in ein anderes
 * Projekt wieder einlesen.
 */
export function beteiligteExportieren(projekt: Projekt, beteiligte: Beteiligter[], funktionen: Funktion[]): void {
  const zeilen: Zelle[][] = beteiligte.map((b) => [
    funktionen.find((f) => f.id === b.funktionId)?.name ?? '',
    funktionen.find((f) => f.id === b.funktionId)?.gewerk ?? '',
    kuerzelVon(b, funktionen),
    b.anrede,
    b.vorname,
    b.nachname,
    b.firma,
    b.email,
    b.telefon,
    b.mobil,
    b.anschrift,
    b.notiz,
  ]);
  const blob = xlsxErzeugen([
    {
      name: 'Projektbeteiligte',
      kopfzeileFett: false,
      zeilen: [
        titelZeile(`Projektbeteiligte – ${projektTitel(projekt)}`),
        [`Stand: ${formatDate(today())}`],
        [],
        kopf(BETEILIGTE_KOPF),
        ...zeilen,
      ],
      fixierteZeilen: 4,
      querformat: true,
      spaltenbreiten: SPALTENBREITEN,
    },
  ]);
  dateiLaden(blob, `Projektbeteiligte_${dateiname(projekt.name)}_${today()}.xlsx`);
}

/** Leere Vorlage für den Import der Projektbeteiligten – mit einer Beispielzeile. */
export function beteiligteVorlageLaden(): void {
  const beispiel = ['Fachplanung', 'LST', '', 'Frau', 'Erika', 'Beispiel', 'Planungsbüro Beispiel GmbH', 'erika.beispiel@example.org', '', '', '', 'Beispielzeile – bitte ersetzen'];
  const blob = xlsxErzeugen([
    {
      name: 'Projektbeteiligte',
      zeilen: [BETEILIGTE_KOPF, beispiel],
      fixierteZeilen: 1,
      querformat: true,
      spaltenbreiten: SPALTENBREITEN,
    },
  ]);
  dateiLaden(blob, 'Vorlage_Projektbeteiligte.xlsx');
}
