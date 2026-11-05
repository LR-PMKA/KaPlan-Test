/**
 * Excel-Ausgabe des Monitors: ein Blatt mit den Anmeldungen samt Status und
 * Terminfrist, ein Blatt mit den Projekten.
 */
import { formatDate, today } from '../../../shared/dates';
import { dateiLaden, xlsxErzeugen, type Zelle } from '../../../shared/xlsx';
import { AMPEL_LABEL, ampelFuer, terminfrist } from './fristen';
import { ANNEX_VII_LABEL, ERSTE_PHASE_LABEL, PROJEKT_STATUS_LABEL, type BaubetriebDaten, type ID } from './types';
import { statusVon, zustaendigText } from './workflow';

const KOPF_STIL = { fett: true, fuellung: 'E8EDF3', rahmen: true };

const ANMELDUNG_KOPF = [
  'Projekt',
  'DB-G-Nummer',
  'Vorhabenname',
  'Anmelde-ID / Begriff',
  'Maßnahmenart',
  'Workflow',
  'Status',
  'Status seit',
  'Zuständig',
  'Zuständiger BBK',
  'Sperrzeit von',
  'Sperrzeit bis',
  'Fahrplanjahr',
  'Terminfrist',
  'Regel',
  'Ampel',
  'Bf/Strecke',
  'Gewerk/Tätigkeit',
  'ÄAbst-Nr',
  'AnnexVII',
  'Bemerkungen',
];

const PROJEKT_KOPF = [
  'Projekt',
  'Projektleiter',
  'DB-G-Nummer',
  'Erster Anmeldetermin (ca.)',
  'Prozessphase',
  'Betroffene Fahrplanjahre',
  'Inbetriebnahme',
  'Hauptbearbeiter MIC',
  'MIC-Projektnummer (wiko)',
  'Status',
  'Anmeldungen',
  'Bemerkung',
];

const datum = (wert: string | null): Zelle => ({ wert, datum: true });

const UMLAUTE: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

/**
 * Dateiname ohne Umlaute und Sonderzeichen – manche Browser verwerfen sonst
 * den Namen und speichern als „download“.
 */
function dateiname(text: string): string {
  return text
    .replace(/[äöüÄÖÜß]/g, (z) => UMLAUTE[z])
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Lädt den Monitor der genannten (bzw. aller) Projekte als Excel-Datei herunter. */
export function monitorExportieren(d: BaubetriebDaten, projektIds?: ID[]): void {
  const projekte = d.projekte.filter((p) => !projektIds || projektIds.includes(p.id));
  const stand = `Stand: ${formatDate(today())}`;

  const anmeldungZeilen: Zelle[][] = projekte.flatMap((p) =>
    d.anmeldungen
      .filter((a) => a.projektId === p.id)
      .map((a): Zelle[] => {
        const { workflow, status } = statusVon(d.workflows, a.statusId);
        const frist = terminfrist(a, d);
        const ampel = ampelFuer(frist.datum, d.einstellungen.vorlaufTage);
        const fuellung = ampel === 'ueberfaellig' ? 'F8D0CC' : ampel === 'faellig' ? 'FCE4C4' : undefined;
        return [
          p.name,
          p.dbGNummer,
          a.vorhaben,
          a.anmeldeId,
          a.art,
          workflow.name,
          status.name,
          datum(a.statusSeit),
          zustaendigText(status, a, p) ?? '',
          a.bbk,
          datum(a.bauVon),
          datum(a.bauBis),
          a.fahrplanjahr,
          { wert: frist.datum, datum: true, stil: fuellung ? { fuellung } : undefined },
          frist.datum ? (frist.manuell ? 'von Hand' : frist.regel) : '',
          frist.datum ? AMPEL_LABEL[ampel] : '',
          a.bfStrecke,
          a.gewerk,
          a.aenderungsNr,
          a.annexVII ? ANNEX_VII_LABEL[a.annexVII] : '',
          a.bemerkung,
        ];
      }),
  );

  const projektZeilen: Zelle[][] = projekte.map((p) => [
    p.name,
    p.projektleiter,
    p.dbGNummer,
    datum(p.ersterAnmeldetermin),
    ERSTE_PHASE_LABEL[p.erstePhase],
    p.fahrplanjahre.join(', '),
    datum(p.inbetriebnahme),
    p.hauptbearbeiter,
    p.projektnummer,
    PROJEKT_STATUS_LABEL[p.status],
    d.anmeldungen.filter((a) => a.projektId === p.id).length,
    p.bemerkung,
  ]);

  const kopf = (spalten: string[]): Zelle[] => spalten.map((wert) => ({ wert, stil: KOPF_STIL }));
  const titel = projekte.length === 1 ? `Projekt: ${projekte[0].name}` : 'Baubetriebsplanung – Monitor';

  const blob = xlsxErzeugen([
    {
      name: 'Anmeldungen',
      kopfzeileFett: false,
      zeilen: [[{ wert: titel, stil: { fett: true, groesse: 13 } }], [stand], [], kopf(ANMELDUNG_KOPF), ...anmeldungZeilen],
      fixierteZeilen: 4,
      querformat: true,
      spaltenbreiten: [28, 14, 26, 22, 13, 20, 26, 12, 22, 18, 12, 12, 11, 12, 18, 11, 30, 30, 12, 26, 36],
    },
    {
      name: 'Projekte',
      kopfzeileFett: false,
      zeilen: [[{ wert: 'Projekte', stil: { fett: true, groesse: 13 } }], [stand], [], kopf(PROJEKT_KOPF), ...projektZeilen],
      fixierteZeilen: 4,
      querformat: true,
      spaltenbreiten: [32, 26, 14, 14, 16, 22, 14, 20, 18, 16, 12, 36],
    },
  ]);
  const name = projekte.length === 1 ? dateiname(projekte[0].name) : 'Monitor';
  dateiLaden(blob, `Baubetrieb_${name}_${today()}.xlsx`);
}
