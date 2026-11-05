/**
 * Mitgelieferte Stammdaten des Bereichs – Funktionen und Standardlogos – und
 * der Demodatenbestand. Alle Termine liegen relativ zum heutigen Tag.
 */
import { addDays, today } from '../../../shared/dates';
import { folgeprotokoll, neuerEintrag, neuerTop, neueReihe, neueZeile, teilnehmerAus } from './protokoll';
import {
  DATEN_VERSION,
  STANDARD_BEARBEITER,
  newId,
  type Beteiligter,
  type Eintrag,
  type EintragTyp,
  type Funktion,
  type ID,
  type Logo,
  type Projekt,
  type Protokoll,
  type ProjektsteuerungDaten,
  type Teilnahme,
} from './types';

const F = (
  id: ID,
  name: string,
  kuerzel: string,
  farbe: string,
  beschreibung = '',
  gewerk: string | null = null,
): Funktion => ({ id, name, kuerzel, farbe, beschreibung, gewerk });

/** Gewerke eines neuen Bestands. */
export const STANDARD_GEWERKE = ['50 Hz', 'KIB', 'LST', 'OLA', 'TK'];

/** Projektübergreifende Funktionen eines neuen Bestands – übergreifend und je Gewerk. */
export const STANDARD_FUNKTIONEN: Funktion[] = [
  F('fn-ag', 'Auftraggeber', 'AG', '#24456e', 'Vorhabenträger bzw. Bauherr, etwa DB InfraGO AG'),
  F('fn-pl', 'Projektleitung', 'PL', '#24456e', 'Projektleitung des Auftraggebers'),
  F('fn-tpl', 'Teilprojektleitung', 'TPL', '#5856d6', 'Teilprojektleitung des Auftraggebers'),
  F('fn-pi', 'Projektingenieur', 'PI', '#5856d6', 'Projektingenieurin bzw. Projektingenieur des Auftraggebers'),
  F('fn-ps', 'Projektsteuerung', 'PS', '#00a0a0', 'Externe Projektsteuerung'),
  F('fn-plm', 'Planlaufmanagement', 'PLM', '#00a0a0', 'Steuerung der Planläufe'),
  F('fn-op', 'Objektplanung', 'OP', '#ff9500', 'Objektplanung Verkehrsanlagen bzw. Ingenieurbauwerke'),
  F('fn-lst', 'Fachplanung', 'LST', '#ff9500', 'Leit- und Sicherungstechnik', 'LST'),
  F('fn-ola', 'Fachplanung', 'OLA', '#ff9500', 'Oberleitungsanlagen', 'OLA'),
  F('fn-kib', 'Fachplanung', 'KIB', '#ff9500', 'Konstruktiver Ingenieurbau', 'KIB'),
  F('fn-tk', 'Fachplanung', 'TK', '#ff9500', 'Telekommunikation', 'TK'),
  F('fn-50hz', 'Fachplanung', '50HZ', '#ff9500', 'Elektrische Energieanlagen 50 Hz', '50 Hz'),
  F('fn-bue-lst', 'Bauüberwachung', 'BÜ-LST', '#34c759', 'Bauüberwachung Leit- und Sicherungstechnik', 'LST'),
  F('fn-bue-ola', 'Bauüberwachung', 'BÜ-OLA', '#34c759', 'Bauüberwachung Oberleitungsanlagen', 'OLA'),
  F('fn-bue', 'Bauüberwachung', 'BÜ', '#34c759', 'Bauüberwachung Bahn'),
  F('fn-an', 'Bauunternehmen', 'AN', '#c77700', 'Ausführendes Bauunternehmen (Auftragnehmer)'),
  F('fn-psv', 'Prüfsachverständiger', 'PSV', '#af52de', 'Prüfsachverständiger bzw. Prüfingenieur'),
  F('fn-vm', 'Vermessung', 'VM', '#8e8e93'),
  F('fn-sigeko', 'SiGeKo', 'SGK', '#ff3b30', 'Sicherheits- und Gesundheitsschutzkoordination'),
  F('fn-ubue', 'Umweltfachliche Bauüberwachung', 'UBÜ', '#34c759'),
  F('fn-bbp', 'Baubetriebsplanung', 'BBP', '#5856d6', 'Baubetriebliche Anmeldungen und Betra'),
  F('fn-eba', 'Eisenbahn-Bundesamt', 'EBA', '#8e8e93', 'Aufsichts- und Genehmigungsbehörde'),
];

/**
 * Logos im Kopf von Protokoll und Beteiligtenliste, solange ein Projekt keine
 * eigenen führt. Die Dateien liegen unter `public/logos/`.
 */
export const STANDARD_LOGOS: Logo[] = [
  { id: 'logo-db-infrago', name: 'DB InfraGO', src: 'logos/Druck_DB_InfraGO.png' },
  { id: 'logo-mailaender', name: 'Mailänder Consult', src: 'logos/Druck_Mailaender_Consult.png' },
];

export function logosVon(projekt: Projekt): Logo[] {
  return projekt.logos ?? STANDARD_LOGOS;
}

/* ------------------------------------------------------------------ */
/* Demodaten                                                           */
/* ------------------------------------------------------------------ */

const tag = (n: number) => addDays(today(), n);

function person(
  projektId: ID,
  funktionId: ID,
  vorname: string,
  nachname: string,
  firma: string,
  anrede: 'Frau' | 'Herr',
): Beteiligter {
  const mail = `${vorname}.${nachname}`.toLowerCase().replace(/[^a-z.]/g, '');
  return {
    id: newId('bt'),
    projektId,
    funktionId,
    anrede,
    vorname,
    nachname,
    firma,
    kuerzel: '',
    email: `${mail}@example.org`,
    telefon: '',
    mobil: '',
    anschrift: '',
    notiz: '',
  };
}

function eintrag(typ: EintragTyp, text: string, werte: Partial<Eintrag> = {}): Eintrag {
  return { ...neuerEintrag(typ), zeilen: [neueZeile(text)], ...werte };
}

function demoProtokolle(projektId: ID, b: Record<string, Beteiligter>): Protokoll[] {
  const status: [Beteiligter, Teilnahme][] = [
    [b.pl, 'anwesend'],
    [b.tpl, 'entschuldigt'],
    [b.op, 'anwesend'],
    [b.lst, 'anwesend'],
    [b.bue, 'anwesend'],
    [b.an, 'anwesend'],
    [b.psv, 'nur Verteiler'],
  ];
  const erstes = neueReihe(
    newId('pt'),
    projektId,
    { art: 'Baubesprechung', datum: tag(-14), beginn: '09:00', ort: 'Baucontainer Rheinstraße' },
    b.ps,
    STANDARD_FUNKTIONEN,
  );
  erstes.ende = '11:00';
  erstes.naechster = tag(0);
  erstes.teilnehmer.push(...status.map(([p, s]) => teilnehmerAus(p, STANDARD_FUNKTIONEN, s)));
  erstes.tops = [
    {
      ...neuerTop('Allgemeines'),
      eintraege: [
        eintrag('I', 'Die Sperrpause für den Einhub des Überbaus ist bestätigt.'),
        eintrag('F', 'Baubesprechungen finden zweiwöchentlich dienstags um 9:00 Uhr im Baucontainer statt.'),
      ],
    },
    {
      ...neuerTop('Planung'),
      eintraege: [
        eintrag('A', 'Ausführungsplanung Widerlager Achse 10 zur Prüfung an den PSV übergeben.', {
          wer: 'OP',
          termin: tag(-3),
        }),
        eintrag('A', 'Kabeltrasse der LST im Bereich der Baugrube einmessen und übergeben.', {
          wer: 'LST',
          termin: tag(-7),
          status: 'erledigt',
        }),
      ],
    },
    {
      ...neuerTop('Bauablauf'),
      eintraege: [
        eintrag('I', 'Die Baustelleneinrichtung ist abgeschlossen.'),
        eintrag('A', 'Bauzeitenplan mit den Sperrpausen aktualisieren und verteilen.', { wer: 'AN', termin: tag(5) }),
      ],
    },
  ];

  const { neu: zweites, vorher } = folgeprotokoll(erstes, newId('pt'));
  zweites.beginn = '09:00';
  zweites.naechster = tag(14);
  zweites.tops = zweites.tops.map((top) => ({
    ...top,
    eintraege: top.eintraege.map((e) => {
      const text = e.zeilen[0]?.text ?? '';
      // Ergänzung als neue Zeile: im Druck blau, in Nr. 3 „aus Prot. 2“
      if (text.startsWith('Ausführungsplanung')) {
        return { ...e, zeilen: [...e.zeilen, neueZeile('Teil 1 übergeben, Teil 2 folgt.')], termin: tag(4) };
      }
      // Ergänzung mit eigener Art: eine Aufgabe unter der Information
      if (text.startsWith('Die Sperrpause')) {
        const betra = neueZeile('Betra für den Einhub des Überbaus beantragen.', newId('z'), 'A');
        return { ...e, zeilen: [...e.zeilen, { ...betra, wer: 'TPL', termin: tag(6) }] };
      }
      if (text.startsWith('Bauzeitenplan')) return { ...e, status: 'erledigt' as const };
      // Gestrichen: steht im Druck von Nr. 2 blau durchgestrichen und entfällt in Nr. 3
      if (text.startsWith('Die Baustelleneinrichtung')) return { ...e, entfaellt: true };
      return e;
    }),
  }));
  zweites.tops[2].eintraege.push(
    eintrag('A', 'Verkehrsrechtliche Anordnung für die Umleitung beantragen.', { wer: 'AN', termin: tag(10) }),
  );
  return [vorher, zweites];
}

export function seedDaten(): ProjektsteuerungDaten {
  const p1: Projekt = {
    id: newId('pr'),
    nummer: 'P-2026-031',
    name: 'EÜ Rheinstraße – Ersatzneubau',
    status: 'aktiv',
    markiert: true,
    beschreibung: 'Ersatzneubau einer Eisenbahnüberführung (Beispielprojekt)',
    logos: null,
  };
  const p2: Projekt = {
    id: newId('pr'),
    nummer: 'P-2025-118',
    name: 'Bf Waldstadt – Bahnsteigverlängerung',
    status: 'aktiv',
    markiert: true,
    beschreibung: 'Verlängerung des Außenbahnsteigs (Beispielprojekt)',
    logos: null,
  };
  const b = {
    pl: person(p1.id, 'fn-pl', 'Anna', 'Berger', 'DB InfraGO AG', 'Frau'),
    tpl: person(p1.id, 'fn-tpl', 'Markus', 'Weber', 'DB InfraGO AG', 'Herr'),
    ps: person(p1.id, 'fn-ps', 'Lena', 'Roth', 'Mailänder Consult GmbH', 'Frau'),
    op: person(p1.id, 'fn-op', 'Thomas', 'Klein', 'Ingenieurbüro Klein & Partner', 'Herr'),
    lst: person(p1.id, 'fn-lst', 'Sabine', 'Hoffmann', 'SignalPlan GmbH', 'Frau'),
    bue: person(p1.id, 'fn-bue', 'Jens', 'Fischer', 'Bauüberwachung Süd GmbH', 'Herr'),
    an: person(p1.id, 'fn-an', 'Peter', 'Wagner', 'Muster Bau GmbH', 'Herr'),
    psv: person(p1.id, 'fn-psv', 'Karl', 'Schulz', 'Prüfbüro Schulz', 'Herr'),
  };
  const zweite = [
    person(p2.id, 'fn-pl', 'Julia', 'Neumann', 'DB InfraGO AG', 'Frau'),
    person(p2.id, 'fn-ps', 'Lena', 'Roth', 'Mailänder Consult GmbH', 'Frau'),
    person(p2.id, 'fn-op', 'Stefan', 'Braun', 'Planungsgruppe Nord', 'Herr'),
  ];

  return {
    version: DATEN_VERSION,
    einstellungen: { bearbeiter: STANDARD_BEARBEITER, farbmodus: 'standard' },
    gewerke: [...STANDARD_GEWERKE],
    funktionen: STANDARD_FUNKTIONEN.map((f) => ({ ...f })),
    projekte: [p1, p2],
    beteiligte: [...Object.values(b), ...zweite],
    protokolle: demoProtokolle(p1.id, b),
  };
}
