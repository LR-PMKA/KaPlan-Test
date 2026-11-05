/**
 * Vorbelegung des Bereichs: Richtlinienfristen (Platzhalter), Einstellungen
 * und ein Demodatenbestand mit Terminen relativ zum heutigen Tag.
 */
import { addDays, today } from '../../../shared/dates';
import { fahrplanjahrBeginn, fahrplanjahrEnde, fahrplanjahreZwischen, fahrplanjahrVon } from './fristen';
import {
  DATEN_VERSION,
  STANDARD_BEARBEITER,
  type Anmeldung,
  type AnmeldungsArt,
  type AnnexVIIGrund,
  type BaubetriebDaten,
  type Einstellungen,
  type ID,
  type ISODate,
  type Projekt,
  type RilFrist,
  type RilSchluessel,
  type VerlaufEintrag,
  type Workflow,
} from './types';
import { STATUS_AUS_NUMMER, standardWorkflows, statusVon, zielText } from './workflow';

export function newId(prefix = 'id'): ID {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

const stichtag = (tag: number, monat: number, jahreVorher: number): RilFrist => ({
  bezug: 'stichtag',
  tag,
  monat,
  jahreVorher,
  wochenVorher: 0,
  platzhalter: true,
});

const vorBaubeginn = (wochenVorher: number): RilFrist => ({
  bezug: 'baubeginn',
  tag: 1,
  monat: 1,
  jahreVorher: 0,
  wochenVorher,
  platzhalter: true,
});

/**
 * Fristen laut Richtlinie. Die Werte sind Platzhalter für den Entwurf und noch
 * nicht mit der Richtlinie abgeglichen – sie sind unter „Einstellungen“
 * anzupassen.
 */
export function standardRilFristen(): Record<RilSchluessel, RilFrist> {
  return {
    skm: stichtag(31, 3, 4),
    mkm: stichtag(31, 3, 3),
    'N-2': stichtag(31, 10, 2),
    'N-1': stichtag(30, 4, 1),
    A: vorBaubeginn(26),
    'B(0)': vorBaubeginn(20),
    'B(S)': vorBaubeginn(16),
    B: vorBaubeginn(12),
    C: vorBaubeginn(6),
    Container: vorBaubeginn(4),
  };
}

export function standardEinstellungen(): Einstellungen {
  return {
    farbmodus: 'standard',
    bearbeiter: STANDARD_BEARBEITER,
    vorlaufTage: 14,
    nachhakTage: 21,
    bedarfVorschauTage: 180,
    rilFristen: standardRilFristen(),
  };
}

export function leererBestand(): BaubetriebDaten {
  return {
    version: DATEN_VERSION,
    einstellungen: standardEinstellungen(),
    workflows: standardWorkflows(),
    projekte: [],
    anmeldungen: [],
  };
}

/* ------------------------------------------------------------------ */
/* Demodaten                                                           */
/* ------------------------------------------------------------------ */

/**
 * Statusverlauf aus einer Folge von Status mit Datum. Die Demodaten nennen die
 * Status kurz mit den Nummern des Lastenhefts (V0 … Y9).
 */
function verlaufAus(schritte: [string, ISODate][], bearbeiter: string, workflows: Workflow[]): VerlaufEintrag[] {
  const id = (nummer: string) => STATUS_AUS_NUMMER[nummer];
  return schritte.map(([nummer, datum], i) => ({
    id: newId('vl'),
    typ: i === 0 ? 'anlage' : 'wechsel',
    datum,
    erfasst: `${datum}T09:00:00.000Z`,
    bearbeiter,
    von: i === 0 ? null : id(schritte[i - 1][0]),
    nach: id(nummer),
    vonText: i === 0 ? '' : zielText(workflows, id(schritte[i - 1][0])),
    nachText: zielText(workflows, id(nummer)),
    text: i === 0 ? 'Eintrag angelegt' : '',
  }));
}

interface DemoAnmeldung {
  art: AnmeldungsArt;
  anmeldeId: string;
  vorhaben?: string;
  bbk?: string;
  verlauf: [string, ISODate][];
  bauVon?: ISODate;
  bauBis?: ISODate;
  fahrplanjahr?: number;
  bfStrecke: string;
  gewerk: string;
  bemerkung?: string;
  aenderungsNr?: string;
  annexVII?: AnnexVIIGrund;
}

function demoAnmeldung(projektId: ID, d: DemoAnmeldung, bearbeiter: string, workflows: Workflow[]): Anmeldung {
  const [nummer, statusSeit] = d.verlauf[d.verlauf.length - 1];
  const statusId = STATUS_AUS_NUMMER[nummer];
  const aenderung = statusVon(workflows, statusId).status.art === 'aenderung';
  const ganzesJahr = d.fahrplanjahr !== undefined;
  const bauVon = ganzesJahr ? fahrplanjahrBeginn(d.fahrplanjahr!) : (d.bauVon ?? null);
  return {
    id: newId('an'),
    projektId,
    anmeldeId: d.anmeldeId,
    vorhaben: d.vorhaben ?? '',
    bbk: d.bbk ?? '',
    art: d.art,
    statusId,
    statusSeit,
    bauVon,
    bauBis: ganzesJahr ? fahrplanjahrEnde(d.fahrplanjahr!) : (d.bauBis ?? null),
    fahrplanjahr: ganzesJahr ? d.fahrplanjahr! : fahrplanjahrVon(bauVon),
    bfStrecke: d.bfStrecke,
    gewerk: d.gewerk,
    aenderungsNr: aenderung ? (d.aenderungsNr ?? '') : '',
    annexVII: aenderung ? (d.annexVII ?? null) : null,
    terminManuell: null,
    bemerkung: d.bemerkung ?? '',
    herkunftId: null,
    verlauf: verlaufAus(d.verlauf, bearbeiter, workflows),
  };
}

export function seedDaten(): BaubetriebDaten {
  const heute = today();
  const tag = (n: number) => addDays(heute, n);
  const jahr = new Date().getFullYear();
  const einstellungen = standardEinstellungen();
  const workflows = standardWorkflows();
  const wer = 'M. Muster';

  const projekt = (p: Omit<Projekt, 'id' | 'markiert' | 'status'> & Partial<Projekt>): Projekt => ({
    id: newId('pr'),
    markiert: true,
    status: 'aktiv',
    ...p,
  });

  const alb = projekt({
    name: 'EÜ Alb – Erneuerung Überbau',
    projektleiter: 'Projektleitung DB InfraGO (Muster)',
    dbGNummer: 'G.40001234',
    ersterAnmeldetermin: `${jahr - 1}-03-31`,
    erstePhase: 'mkm',
    fahrplanjahre: fahrplanjahreZwischen(`${jahr + 2}-03-01`, `${jahr + 3}-06-30`),
    inbetriebnahme: `${jahr + 3}-06-02`,
    hauptbearbeiter: wer,
    projektnummer: 'MIC-25-0412',
    bemerkung: 'Überbautausch mit Totalsperrung; Vorarbeiten unter Betrieb.',
  });

  const durmersheim = projekt({
    name: 'ESTW Durmersheim – Inbetriebnahme',
    projektleiter: 'Projektleitung DB InfraGO (Muster)',
    dbGNummer: 'G.40005678',
    ersterAnmeldetermin: `${jahr - 1}-10-31`,
    erstePhase: 'N-1',
    fahrplanjahre: fahrplanjahreZwischen(tag(-20), tag(220)),
    inbetriebnahme: tag(192),
    hauptbearbeiter: wer,
    projektnummer: 'MIC-24-0815',
    bemerkung: '',
  });

  const durlach = projekt({
    name: 'Kabeltiefbau Karlsruhe-Durlach – Bruchsal',
    projektleiter: 'Projektleitung DB InfraGO (Muster)',
    dbGNummer: 'G.40009012',
    ersterAnmeldetermin: `${jahr}-03-31`,
    erstePhase: 'skm',
    fahrplanjahre: fahrplanjahreZwischen(`${jahr + 3}-04-01`, `${jahr + 5}-03-31`),
    inbetriebnahme: null,
    hauptbearbeiter: wer,
    projektnummer: 'MIC-26-0107',
    status: 'pausiert',
    bemerkung: 'Betreuungspause bis zur Entwurfsplanung.',
  });

  const anmeldungen: Anmeldung[] = [
    demoAnmeldung(
      alb.id,
      {
        art: 'A',
        anmeldeId: 'A-4000-0812',
        bbk: 'Fr. Weber',
        verlauf: [
          ['W0', `${jahr - 1}-02-10`],
          ['W2', `${jahr - 1}-03-20`],
          ['W3', `${jahr - 1}-07-31`],
          ['X0', tag(-40)],
          ['X2', tag(-5)],
        ],
        bauVon: `${jahr + 2}-03-04`,
        bauBis: `${jahr + 2}-03-20`,
        bfStrecke: 'Strecke 4000, km 92,1–95,4',
        gewerk: 'Totalsperrung Einhub Überbau',
      },
      wer,
      workflows,
    ),
    demoAnmeldung(
      alb.id,
      {
        art: 'MKM',
        anmeldeId: 'tVE 4000-17',
        verlauf: [
          ['W0', `${jahr}-02-12`],
          ['W2', `${jahr}-03-20`],
        ],
        fahrplanjahr: jahr + 3,
        bfStrecke: 'Strecke 4000, Bereich Bf Durmersheim',
        gewerk: 'Restarbeiten Überbau, Rückbau Hilfsbrücke',
        bemerkung: 'Sammeleintrag – wird im KM in Einzelanmeldungen aufgeteilt.',
      },
      wer,
      workflows,
    ),
    demoAnmeldung(
      alb.id,
      {
        art: 'B',
        anmeldeId: 'B-4000-2231',
        bbk: 'Fr. Weber',
        verlauf: [
          ['Y0', tag(-110)],
          ['Y2', tag(-95)],
          ['Y3', tag(-90)],
          ['Y4', tag(-86)],
          ['Y6', tag(-30)],
        ],
        bauVon: tag(40),
        bauBis: tag(44),
        bfStrecke: 'Bf Rastatt, Gl. 3',
        gewerk: 'Vorarbeiten Kabeltrog',
      },
      wer,
      workflows,
    ),
    demoAnmeldung(
      durmersheim.id,
      {
        art: 'C',
        anmeldeId: '',
        verlauf: [['Y0', tag(-6)]],
        bauVon: tag(60),
        bauBis: tag(61),
        bfStrecke: 'Bf Durmersheim, W 12–14',
        gewerk: 'Weichenprüfung nach IBN-Vorbereitung',
      },
      wer,
      workflows,
    ),
    demoAnmeldung(
      durmersheim.id,
      {
        art: 'B(S)',
        anmeldeId: 'BS-4000-1187',
        bbk: 'Hr. Kaya',
        verlauf: [
          ['Y0', tag(-160)],
          ['Y2', tag(-150)],
          ['Y3', tag(-146)],
          ['Y4', tag(-140)],
          ['Y6', tag(-70)],
          ['Y7', tag(-30)],
        ],
        bauVon: tag(75),
        bauBis: tag(82),
        bfStrecke: 'Strecke 4000, Durmersheim – Rastatt',
        gewerk: 'Kabelumlegung, Signalaufstellung',
        aenderungsNr: 'ÄA-0815',
        annexVII: 'anlagemangel',
        bemerkung: 'Verschiebung um eine Woche wegen Lieferverzug Signalausleger.',
      },
      wer,
      workflows,
    ),
    demoAnmeldung(
      durmersheim.id,
      {
        art: 'A',
        anmeldeId: 'A-4000-0977',
        bbk: 'Hr. Kaya',
        verlauf: [
          ['X0', tag(-420)],
          ['X2', tag(-400)],
          ['X3', tag(-396)],
          ['X4', tag(-390)],
          ['X5', tag(-300)],
          ['Y4', tag(-3)],
        ],
        bauVon: tag(150),
        bauBis: tag(158),
        bfStrecke: 'Bf Durmersheim',
        gewerk: 'IBN ESTW, Totalsperrung',
      },
      wer,
      workflows,
    ),
    demoAnmeldung(
      durmersheim.id,
      {
        art: 'Container',
        anmeldeId: 'CT-4000-0033',
        verlauf: [
          ['Y0', tag(-60)],
          ['Y2', tag(-50)],
          ['Y9', tag(-35)],
        ],
        bauVon: tag(20),
        bauBis: tag(20),
        bfStrecke: 'Bf Durmersheim, Ladestraße',
        gewerk: 'Containerstellung Baustelleneinrichtung',
        bemerkung: 'Abgelehnt – Kollision mit Sperrpause Nachbarmaßnahme.',
      },
      wer,
      workflows,
    ),
    demoAnmeldung(
      durlach.id,
      {
        art: 'SKM',
        vorhaben: 'Kabeltiefbau Abschnitt Nord',
        anmeldeId: 'tVE 4000-23',
        verlauf: [['V0', tag(-12)]],
        fahrplanjahr: jahr + 5,
        bfStrecke: 'Strecke 4020, Durlach – Weingarten',
        gewerk: 'Kabeltiefbau, Querungen',
      },
      wer,
      workflows,
    ),
  ];

  return { version: DATEN_VERSION, einstellungen, workflows, projekte: [alb, durmersheim, durlach], anmeldungen };
}
