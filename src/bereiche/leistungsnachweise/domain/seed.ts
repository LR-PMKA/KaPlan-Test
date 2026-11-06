/**
 * Mitgelieferte Logos des Bereichs und der Demodatenbestand. Die Demodaten
 * sind frei erfunden (Personen, Projekte, Nummern im Format „K9xxx“); ihre
 * Leistungen liegen in den letzten zwei bis drei Monaten vor dem heutigen
 * Tag, die Nachweise entstehen wie im Betrieb über `nachweiseErgaenzen`.
 * Angemeldet ist Anna Becker mit der Rolle Controlling, damit die Demo alles
 * zeigt; über „Angemeldet als“ lässt sich auf eine andere Person umschalten.
 */
import { addDays, istArbeitstag, today } from '../../../shared/dates';
import {
  ergaenzungAnwenden,
  mitAufschlag,
  mitZeilenText,
  nachweiseErgaenzen,
  nachweiseVon,
  nachweisZeilen,
  standErzeugen,
} from './nachweis';
import {
  DATEN_VERSION,
  mitarbeiterName,
  newId,
  type ID,
  type Leistung,
  type LeistungsnachweisDaten,
  type Logo,
  type Mitarbeiter,
  type Projekt,
  type Quelle,
} from './types';
import { monatVersetzt } from './zeitraum';

/**
 * Logos im Kopf des Leistungsnachweises, solange ein Projekt keine eigenen
 * führt. Die Dateien liegen unter `public/logos/`.
 */
export const STANDARD_LOGOS: Logo[] = [
  { id: 'logo-mailaender', name: 'Mailänder Consult', src: 'logos/Druck_Mailaender_Consult.png' },
];

/** Logos des Projekts – eigene oder die Standardlogos. */
export function logosVon(projekt: Pick<Projekt, 'logos'>): Logo[] {
  return projekt.logos ?? STANDARD_LOGOS;
}

/* ------------------------------------------------------------------ */
/* Demodaten                                                           */
/* ------------------------------------------------------------------ */

const person = (kuerzel: string, vorname: string, nachname: string, controlling = false): Mitarbeiter => ({
  id: newId('ma'),
  kuerzel,
  vorname,
  nachname,
  aktiv: true,
  controlling,
});

function projekt(werte: Omit<Projekt, 'id' | 'status' | 'markiert' | 'logos'>): Projekt {
  return { id: newId('pr'), status: 'aktiv', markiert: true, logos: null, ...werte };
}

/** Wer an welchen Wochentagen (0 = Montag) was für ein Projekt leistet. */
interface Regel {
  projekt: Projekt;
  person: Mitarbeiter;
  tage: number[];
  texte: string[];
  stunden: number[];
  /** Abschnitte im Wechsel, mit dem Projektelement aus der Zeiterfassung. */
  abschnitte?: { id: ID; element: string }[];
  quelle?: Quelle;
}

function demoLeistungen(regeln: Regel[], von: string, bis: string): Leistung[] {
  const leistungen: Leistung[] = [];
  let i = 0;
  for (let tag = von; tag <= bis; tag = addDays(tag, 1)) {
    if (!istArbeitstag(tag)) continue;
    const wochentag = (new Date(`${tag}T12:00:00`).getDay() + 6) % 7;
    regeln.forEach((r, ri) => {
      // Gelegentlich fehlt jemand – Urlaub, Termine in anderen Projekten
      if (!r.tage.includes(wochentag) || (i + ri * 3) % 11 === 7) return;
      const abschnitt = r.abschnitte?.[(i + ri) % r.abschnitte.length];
      leistungen.push({
        id: newId('le'),
        projektId: r.projekt.id,
        mitarbeiterId: r.person.id,
        datum: tag,
        text: r.texte[(i + ri) % r.texte.length],
        stunden: r.stunden[(i * 2 + ri) % r.stunden.length],
        abschnittId: abschnitt?.id ?? null,
        projektelement: abschnitt && r.quelle === 'import' ? abschnitt.element : '',
        quelle: r.quelle ?? 'manuell',
        erfasst: `${tag}T16:00:00.000Z`,
      });
    });
    i++;
  }
  return leistungen;
}

/**
 * Demodatenbestand: vier Mitarbeiter (Anna Becker mit der Rolle Controlling
 * und angemeldet), drei Projekte, Leistungen der letzten Monate, Nachweise –
 * der älteste der Brücke abgeschlossen mit einem Aufschlag von +1,5 Std., im
 * offenen Nachweis der Dammsanierung ein Aufschlag von −0,5 Std.
 */
export function seedDaten(): LeistungsnachweisDaten {
  const heute = today();
  const jetzt = new Date().toISOString();
  const beginn = monatVersetzt(heute, -2);
  const ende = addDays(heute, -1);

  const ab = person('AB', 'Anna', 'Becker', true);
  const jk = person('JK', 'Jonas', 'Keller');
  const mv = person('MV', 'Miriam', 'Vogt');
  const tb = person('TB', 'Tobias', 'Brandt');

  const bruecke = projekt({
    nummer: 'K9101',
    name: 'EÜ Beispielbach – Ersatzneubau',
    kurzname: 'EÜ Beispielbach',
    beschreibung: 'Ersatzneubau einer Eisenbahnüberführung (Beispielprojekt)',
    leistungsbereich: 'Projektsteuerung',
    raster: 'monat',
    zeitraumregel: 'monat',
    abschnitte: [],
  });
  const nord = { id: newId('ab'), kennung: '01', kurz: 'Abschn.1', name: 'Nordheim, Strecke 9401' };
  const sued = { id: newId('ab'), kennung: '02', kurz: 'Abschn.2', name: 'Südheim, Strecke 9402' };
  const damm = projekt({
    nummer: 'K9102',
    name: 'Dammsanierung Musterstrecke',
    kurzname: '',
    beschreibung: 'Sanierung zweier Dammabschnitte (Beispielprojekt)',
    leistungsbereich: 'Projektmanagement',
    raster: 'woche',
    zeitraumregel: 'fortlaufend',
    abschnitte: [nord, sued],
  });
  const halt = projekt({
    nummer: 'K9103',
    name: 'Hp Musterstadt – Neubau',
    kurzname: 'Hp Musterstadt',
    beschreibung: 'Neubau eines Haltepunkts (Beispielprojekt)',
    leistungsbereich: 'Planlaufmanagement',
    raster: 'tag',
    zeitraumregel: 'monat',
    abschnitte: [],
  });
  const dammAbschnitte = [
    { id: nord.id, element: `01: ${nord.name}` },
    { id: sued.id, element: `02: ${sued.name}` },
  ];

  const leistungen = demoLeistungen(
    [
      {
        projekt: bruecke,
        person: ab,
        tage: [0, 1, 3],
        texte: [
          'Abstimmung PL',
          'Teilnahme Jour fixe einschl. Nachbereitung',
          'Fortschreibung Terminplan',
          'Prüfung Planunterlagen',
          'Vorbereitung Baubesprechung',
        ],
        stunden: [2, 3, 2.5, 4, 1.5],
      },
      {
        projekt: bruecke,
        person: jk,
        tage: [2, 4],
        texte: ['Prüfung Planunterlagen', 'Abstimmung Bauüberwachung', 'Kostenverfolgung', 'Fortschreibung Terminplan'],
        stunden: [3, 2, 1.5, 2.5],
      },
      {
        projekt: damm,
        person: mv,
        tage: [0, 2, 3],
        texte: [
          'Begehung Damm',
          'Abstimmung Sperrpausen',
          'Teilnahme Jour fixe einschl. Nachbereitung',
          'Fortschreibung Bauablaufplan',
        ],
        stunden: [3, 1.5, 2, 2.5],
        abschnitte: dammAbschnitte,
        quelle: 'import',
      },
      {
        projekt: damm,
        person: tb,
        tage: [1, 4],
        texte: ['Prüfung Planunterlagen', 'Abstimmung PL', 'Mengenermittlung'],
        stunden: [2, 1, 3],
        abschnitte: dammAbschnitte,
      },
      {
        projekt: halt,
        person: tb,
        tage: [0, 3],
        texte: ['Planlaufbesprechung', 'Fortschreibung Planlaufliste', 'Prüfung Planunterlagen'],
        stunden: [1.5, 2, 3],
      },
      {
        projekt: halt,
        person: jk,
        tage: [1],
        texte: ['Abstimmung Planprüfung', 'Teilnahme Jour fixe einschl. Nachbereitung'],
        stunden: [1, 2],
      },
    ],
    beginn,
    ende,
  );

  let daten: LeistungsnachweisDaten = {
    version: DATEN_VERSION,
    einstellungen: { bearbeiter: mitarbeiterName(ab), mitarbeiterId: ab.id, farbmodus: 'standard' },
    mitarbeiter: [ab, jk, mv, tb],
    projekte: [bruecke, damm, halt],
    leistungen,
    nachweise: [],
  };
  for (const p of daten.projekte) {
    const tage = leistungen.filter((l) => l.projektId === p.id).map((l) => l.datum);
    daten = ergaenzungAnwenden(daten, nachweiseErgaenzen(daten, p, tage, jetzt, () => newId('ln')), jetzt);
  }

  // Der älteste Monatsnachweis der Brücke ist abgegeben – mit bearbeitetem Text
  const erster = nachweiseVon(daten, bruecke.id)[0];
  if (erster && erster.bis < heute) {
    const zeile = nachweisZeilen(daten, erster)[0];
    let n = zeile
      ? mitZeilenText(
          erster,
          zeile,
          'Abstimmungen mit der Projektleitung, Teilnahme an den Jours fixes einschl. Nachbereitung, ' +
            'Fortschreibung des Terminplans, Prüfung der Planunterlagen und Kostenverfolgung',
        )
      : erster;
    n = { ...n, bemerkung: 'Abrechnung nach Stundennachweis gemäß Vertrag.' };
    // Aufschlag des Controllings: +1,5 Std. auf die Monatszeile
    if (zeile) n = mitAufschlag(n, bruecke, zeile.schluessel, null, 1.5);
    const abgeschlossen = `${addDays(monatVersetzt(erster.bis, 1), 2)}T09:30:00.000Z`;
    n = { ...n, status: 'abgeschlossen', abgeschlossen, geaendert: abgeschlossen, stand: standErzeugen(daten, n) };
    daten = { ...daten, nachweise: daten.nachweise.map((x) => (x.id === n.id ? n : x)) };
  }

  // Im offenen Nachweis der Dammsanierung −0,5 Std. auf den Abschnitt Nordheim einer Woche
  const offen = nachweiseVon(daten, damm.id).find((x) => x.status === 'entwurf');
  const woche = offen ? nachweisZeilen(daten, offen).find((z) => (z.stundenJeAbschnitt[nord.id] ?? 0) >= 1) : undefined;
  if (offen && woche) {
    const n = mitAufschlag(offen, damm, woche.schluessel, nord.id, -0.5);
    daten = { ...daten, nachweise: daten.nachweise.map((x) => (x.id === n.id ? n : x)) };
  }
  return daten;
}
