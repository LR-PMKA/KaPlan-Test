/**
 * Terminrechner – späteste Übergabe des Planers (rückwärts) bzw. Ende des
 * Planlaufs (vorwärts) aus den Fristen eines Workflows.
 *
 * Es gibt keine eigene Regelwelt: Gerechnet wird ausschließlich über die
 * Simulation (`simulieren`, `rueckwaerts` in domain/simulation.ts), also mit
 * denselben Regeln wie im Planlauf – parallele Zweige, Rücksprünge,
 * Nachreichungen und die Fristregel „ab dem tatsächlichen Eingang“.
 *
 * Anker: Beginnt der Workflow mit „Eingang PLM“, ist der Anker dessen
 * Abschluss – die Übergabe durch den Planer (wie das Eingang Soll eines
 * Eintrags). Sonst ist der Anker der Start des Planlaufs; das Soll des ersten
 * Schritts ist dann Anker + Frist.
 *
 * Szenario: je Entscheidung die Antwort im ersten Durchlauf (Index der
 * Antwort, Vorgabe die erste = Standardverlauf). Ab dem zweiten Durchlauf
 * gelten die Regeln der Simulation (erste Antwort ohne Nacharbeit).
 */
import { addDays, diffArbeitstage, diffDays, formatDate, naechsterArbeitstag, parseISO, today, wochentag } from '../../../shared/dates';
import { html } from '../../../shared/print';
import {
  laufSchritteFuerSimulation,
  rueckwaerts,
  simulieren,
  type AntwortFuer,
  type Ausfuehrung,
  type Simulation,
} from './simulation';
import { istEingangPLM, type ID, type ISODate, type ProcessTemplateStep } from './types';

export type Richtung = 'rueckwaerts' | 'vorwaerts';

/** Bedeutung des Ankers: Übergabe durch den Planer oder Start des Planlaufs. */
export type AnkerArt = 'uebergabe' | 'start';

export const ANKER_LABEL: Record<AnkerArt, string> = {
  uebergabe: 'Übergabe durch den Planer',
  start: 'Start des Planlaufs',
};

/** Beginnt der Workflow mit „Eingang PLM“, ist der Anker die Übergabe, sonst der Start. */
export function ankerArtVon(steps: ProcessTemplateStep[]): AnkerArt {
  const erster = steps[0];
  return erster && !erster.parallel && istEingangPLM(erster.name) ? 'uebergabe' : 'start';
}

export interface TerminrechnerEingabe {
  steps: ProcessTemplateStep[];
  richtung: Richtung;
  /** Rückwärts: Termin am Ziel; vorwärts: Anker. Leer = kein Datum. */
  datum: ISODate;
  arbeitstage: boolean;
  feiertage: ISODate[];
  /** Vorlagen-Schritt-ID einer Entscheidung → Index der Antwort im ersten Durchlauf. */
  szenario: Record<ID, number>;
  /** Zielschritt (maßgeblich ist sein letzter Abschluss); null = Ende des Planlaufs. */
  zielStepId: ID | null;
  heute?: ISODate;
}

/** Zweigkennung einer Zeile: „Prüfstatik · Zweig 2 von 2“ bzw. „Zweig 2 von 2“ (ohne Escaping). */
export function zweigKennung(z: Pick<TerminZeile, 'zweig' | 'zweige' | 'zweigName'>): string {
  if (!z.zweig) return '';
  return `${z.zweigName ? `${z.zweigName} · ` : ''}Zweig ${z.zweig}${z.zweige ? ` von ${z.zweige}` : ''}`;
}

/** Eine Zeile der Zwischenergebnisse – eine Ausführung der Simulation. */
export interface TerminZeile {
  nr: number;
  stepId: ID;
  name: string;
  roleName: string;
  /** Zweig (ab 1) und Zahl der Zweige eines parallelen Blocks; null außerhalb. */
  zweig: number | null;
  zweige: number | null;
  /** Name des Zweigs; null = ohne Namen bzw. außerhalb. */
  zweigName: string | null;
  durchlauf: number;
  /** Antwort der Entscheidung in dieser Ausführung. */
  antwort: string | null;
  frist: number;
  eingang: ISODate;
  /** Der Eingang ist der Beginn der Planerstellung (erster Schritt bei Übergabe als Anker). */
  eingangPlanerstellung: boolean;
  fristende: ISODate;
  /** Spätester Abschluss, der das Ziel noch hält; null = ohne Belang für das Ziel. */
  spaetestens: ISODate | null;
  puffer: number | null;
  /** Auf dem kritischen Weg (kleinster Puffer). */
  kritisch: boolean;
  /** Ausführung liegt nach dem Zielschritt bzw. hat keinen Einfluss auf ihn. */
  ohneBelang: 'nach_ziel' | 'ohne_einfluss' | null;
}

export type TerminZustand = 'ok' | 'kein_datum' | 'ungueltig' | 'leer' | 'schleife' | 'grenze' | 'ziel';

export interface TerminrechnerErgebnis {
  zustand: TerminZustand;
  richtung: Richtung;
  ankerArt: AnkerArt;
  /** Übergabe bzw. Start: rückwärts der späteste, vorwärts der eingegebene. */
  anker: ISODate | null;
  /** Abschluss am Ziel (Zielschritt bzw. Ende des Planlaufs). */
  ende: ISODate | null;
  /** Beginn der Planerstellung (nur bei Übergabe als Anker): Anker − Frist des Eingangs. */
  planerstellung: { beginn: ISODate; frist: number } | null;
  dauer: { arbeitstage: number; kalendertage: number } | null;
  zeilen: TerminZeile[];
  /** Rückwärts: der Anker läge vor heute – frühestes Ende bei Übergabe (bzw. Start) heute. */
  vergangenheit: { anker: ISODate; fruehestesEnde: ISODate | null } | null;
  /** Vorwärts: das eingegebene Datum liegt vor heute. */
  datumVorHeute: boolean;
}

/** Einheit der Fristen: „AT“ bzw. „KT“. */
export function einheit(arbeitstage: boolean): string {
  return arbeitstage ? 'AT' : 'KT';
}

/** „Mo 18.01.2027“ – Datum mit Wochentag; „–“ ohne Datum. */
export function mitWochentag(iso: ISODate | null | undefined): string {
  if (!iso) return '–';
  const tag = wochentag(iso);
  return tag ? `${tag} ${formatDate(iso)}` : formatDate(iso);
}

/** „1 Arbeitstag“ / „25 Arbeitstage“ bzw. Kalendertage. */
export function tageText(anzahl: number, arbeitstage: boolean): string {
  const eins = Math.abs(anzahl) === 1;
  return `${anzahl} ${arbeitstage ? (eins ? 'Arbeitstag' : 'Arbeitstage') : eins ? 'Kalendertag' : 'Kalendertage'}`;
}

/** Für „bei … Frist“: „bei 1 Arbeitstag“ / „bei 10 Arbeitstagen“ bzw. Kalendertage. */
export function fristText(anzahl: number, arbeitstage: boolean): string {
  const eins = Math.abs(anzahl) === 1;
  return `${anzahl} ${arbeitstage ? (eins ? 'Arbeitstag' : 'Arbeitstagen') : eins ? 'Kalendertag' : 'Kalendertagen'}`;
}

/** Entscheidungen des Workflows (in Listenreihenfolge) – Grundlage der Szenario-Auswahl. */
export function entscheidungenVon(steps: ProcessTemplateStep[]): ProcessTemplateStep[] {
  return steps.filter((s) => s.typ === 'entscheidung' && s.antworten.length > 0);
}

/** Szenario als Antwortwahl der Simulation: nur im ersten Durchlauf. */
function antwortFuerSzenario(szenario: Record<ID, number>): AntwortFuer {
  return (stepId, durchlauf) => (durchlauf <= 1 ? (szenario[stepId] ?? null) : null);
}

/**
 * Schritte, die im gewählten Szenario ausgeführt werden (unabhängig vom
 * Datum) – nicht erreichte Entscheidungen blendet die Szenario-Auswahl ab.
 */
export function erreichteSchritte(
  steps: ProcessTemplateStep[],
  szenario: Record<ID, number>,
  arbeitstage: boolean,
  feiertage: ISODate[],
): Set<ID> {
  if (steps.length === 0) return new Set();
  const sim = simulieren(
    laufSchritteFuerSimulation(steps),
    { start: today(), eingangSoll: null, arbeitstage, feiertage, heute: null },
    antwortFuerSzenario(szenario),
  );
  return new Set(sim.ausfuehrungen.map((a) => a.stepId));
}

/** Letzter Abschluss des Zielschritts bzw. Ende der Simulation. */
function endeAmZiel(sim: Simulation, zielStepId: ID | null): ISODate | null {
  if (!zielStepId) return sim.ende;
  const treffer = sim.ausfuehrungen.filter((a) => a.stepId === zielStepId);
  return treffer.length > 0 ? treffer[treffer.length - 1].ist : null;
}

/**
 * Späteste Abschlüsse je Ausführung bei gegebenem Ende (Rückwärtslauf über
 * die Abhängigkeiten der Ausführungen, wie in `rueckwaerts`) – für die
 * Vorwärtsrechnung, deren Ende aus der Simulation folgt.
 */
function spaetesteAbschluesse(
  ausf: Ausfuehrung[],
  ende: ISODate,
  zielStepId: ID | null,
  arbeitstage: boolean,
  feiertage: ISODate[],
): { spaetestens: (ISODate | null)[]; puffer: (number | null)[]; kritisch: boolean[] } {
  const tage = (a: ISODate, b: ISODate) => (arbeitstage ? diffArbeitstage(a, b, feiertage) : diffDays(a, b));
  const nachfolgende: number[][] = ausf.map(() => []);
  ausf.forEach((a, i) => a.vorgaengerAusfuehrungen.forEach((v) => nachfolgende[v].push(i)));
  let zielIndex = -1;
  let relevant = ausf.map(() => true);
  if (zielStepId) {
    ausf.forEach((a, i) => {
      if (a.stepId === zielStepId) zielIndex = i;
    });
    relevant = ausf.map(() => false);
    const stapel = zielIndex >= 0 ? [zielIndex] : [];
    while (stapel.length > 0) {
      const i = stapel.pop()!;
      if (relevant[i]) continue;
      relevant[i] = true;
      stapel.push(...ausf[i].vorgaengerAusfuehrungen);
    }
  }
  const spaetestens: (ISODate | null)[] = ausf.map(() => null);
  for (let i = ausf.length - 1; i >= 0; i--) {
    if (!relevant[i]) continue;
    const folgende = i === zielIndex ? [] : nachfolgende[i].filter((j) => relevant[j] && spaetestens[j]);
    if (folgende.length === 0) {
      spaetestens[i] = ende;
      continue;
    }
    let frueheste: ISODate | null = null;
    for (const j of folgende) {
      const eingang = addDays(spaetestens[j]!, -ausf[j].frist, arbeitstage, feiertage);
      if (!frueheste || eingang < frueheste) frueheste = eingang;
    }
    spaetestens[i] = frueheste;
  }
  const puffer = ausf.map((a, i) => (spaetestens[i] ? tage(a.ist, spaetestens[i]!) : null));
  const werte = puffer.filter((p): p is number => p !== null);
  const kleinster = werte.length > 0 ? Math.min(...werte) : 0;
  return { spaetestens, puffer, kritisch: puffer.map((p) => p !== null && p === kleinster) };
}

/** Rechnet den Terminrechner für die Eingaben. */
export function terminBerechnen(e: TerminrechnerEingabe): TerminrechnerErgebnis {
  const ankerArt = ankerArtVon(e.steps);
  const heute = e.heute ?? today();
  const basis: TerminrechnerErgebnis = {
    zustand: 'ok',
    richtung: e.richtung,
    ankerArt,
    anker: null,
    ende: null,
    planerstellung: null,
    dauer: null,
    zeilen: [],
    vergangenheit: null,
    datumVorHeute: false,
  };
  if (e.steps.length === 0) return { ...basis, zustand: 'leer' };
  if (!e.datum) return { ...basis, zustand: 'kein_datum' };
  if (!parseISO(e.datum)) return { ...basis, zustand: 'ungueltig' };

  const { arbeitstage, feiertage } = e;
  const laufSteps = laufSchritteFuerSimulation(e.steps);
  const antwortFuer = antwortFuerSzenario(e.szenario);
  const ziel = e.zielStepId && e.steps.some((s) => s.id === e.zielStepId) ? e.zielStepId : null;
  const vorwaertsRechnen = (anker: ISODate) =>
    simulieren(
      laufSteps,
      { start: anker, eingangSoll: ankerArt === 'uebergabe' ? anker : null, arbeitstage, feiertage, heute: null },
      antwortFuer,
    );

  let anker: ISODate;
  let sim: Simulation;
  let ende: ISODate;
  let cpm: ReturnType<typeof spaetesteAbschluesse>;
  let vergangenheit: TerminrechnerErgebnis['vergangenheit'] = null;

  if (e.richtung === 'rueckwaerts') {
    const r = rueckwaerts(laufSteps, e.datum, {
      arbeitstage,
      feiertage,
      ankerArt: ankerArt === 'uebergabe' ? 'eingangSoll' : 'start',
      antwortFuer,
      zielStepId: ziel,
    });
    if (r.fehler || !r.anker || !r.simulation || !r.ende) return { ...basis, zustand: r.fehler ?? 'ziel' };
    anker = r.anker;
    sim = r.simulation;
    ende = r.ende;
    cpm = { spaetestens: r.spaetestens, puffer: r.puffer, kritisch: r.kritisch };
    if (anker < heute) {
      const ankerHeute = arbeitstage ? naechsterArbeitstag(heute, feiertage) : heute;
      const frueh = vorwaertsRechnen(ankerHeute);
      vergangenheit = { anker: ankerHeute, fruehestesEnde: frueh.fehler ? null : endeAmZiel(frueh, ziel) };
    }
  } else {
    anker = e.datum;
    sim = vorwaertsRechnen(anker);
    if (sim.fehler) return { ...basis, zustand: sim.fehler };
    const amZiel = endeAmZiel(sim, ziel);
    if (!amZiel) return { ...basis, zustand: 'ziel' };
    ende = amZiel;
    cpm = spaetesteAbschluesse(sim.ausfuehrungen, ende, ziel, arbeitstage, feiertage);
  }

  // Zahl der Zweige je Block
  const zweigeJeBlock = new Map<ID, Set<number>>();
  for (const s of e.steps) {
    if (!s.parallel) continue;
    const menge = zweigeJeBlock.get(s.parallel.block) ?? new Set<number>();
    menge.add(s.parallel.zweig);
    zweigeJeBlock.set(s.parallel.block, menge);
  }
  const zielIndex = ziel ? sim.ausfuehrungen.map((a) => a.stepId).lastIndexOf(ziel) : -1;
  // „Nach dem Zielschritt“ liegt nur, was vom Zielschritt aus erreichbar ist –
  // ein paralleler Nachbarzweig ist „ohne Einfluss“, auch wenn er später gelistet ist.
  const nachZiel = new Set<number>();
  if (zielIndex >= 0) {
    const nachfolger: number[][] = sim.ausfuehrungen.map(() => []);
    sim.ausfuehrungen.forEach((a, i) => a.vorgaengerAusfuehrungen.forEach((v) => nachfolger[v]?.push(i)));
    const stapel = [...nachfolger[zielIndex]];
    while (stapel.length > 0) {
      const i = stapel.pop() as number;
      if (nachZiel.has(i)) continue;
      nachZiel.add(i);
      stapel.push(...nachfolger[i]);
    }
  }
  const erster = e.steps[0];
  const planerstellung =
    ankerArt === 'uebergabe' ? { beginn: addDays(anker, -erster.fristTage, arbeitstage, feiertage), frist: erster.fristTage } : null;

  const zeilen: TerminZeile[] = sim.ausfuehrungen.map((a, i) => {
    const planung = planerstellung !== null && i === 0 && a.stepId === erster.id && a.durchlauf <= 1;
    const zweige = a.parallel ? (zweigeJeBlock.get(a.parallel.block)?.size ?? null) : null;
    const ohneBelang: TerminZeile['ohneBelang'] =
      cpm.spaetestens[i] !== null ? null : nachZiel.has(i) ? 'nach_ziel' : 'ohne_einfluss';
    return {
      nr: i + 1,
      stepId: a.stepId,
      name: a.name,
      roleName: a.roleName,
      zweig: a.parallel ? a.parallel.zweig + 1 : null,
      zweige,
      zweigName: a.parallel?.zweigName?.trim() || null,
      durchlauf: a.durchlauf,
      antwort: a.antwort,
      frist: a.frist,
      eingang: planung ? planerstellung.beginn : a.eingang,
      eingangPlanerstellung: planung,
      fristende: a.ist,
      spaetestens: cpm.spaetestens[i] ?? null,
      puffer: cpm.puffer[i] ?? null,
      kritisch: cpm.kritisch[i] ?? false,
      ohneBelang,
    };
  });

  return {
    ...basis,
    anker,
    ende,
    planerstellung,
    dauer: { arbeitstage: diffArbeitstage(anker, ende, feiertage), kalendertage: diffDays(anker, ende) },
    zeilen,
    vergangenheit,
    datumVorHeute: e.richtung === 'vorwaerts' && anker < heute,
  };
}

/* ------------------------------------------------------------------ */
/* Druck                                                               */
/* ------------------------------------------------------------------ */

export interface TerminDruckKopf {
  workflowName: string;
  projektName: string | null;
  zielName: string | null;
  /** Abweichende Antworten des Szenarios: „Formale Prüfung: Nein“. */
  szenario: string[];
}

/** Bezeichnung des Hauptergebnisses (Rückwärts: Anker, vorwärts: Ende). */
export function hauptLabel(erg: Pick<TerminrechnerErgebnis, 'richtung' | 'ankerArt'>, zielName: string | null): string {
  if (erg.richtung === 'rueckwaerts') {
    return erg.ankerArt === 'uebergabe' ? 'Späteste Übergabe durch den Planer' : 'Spätester Start des Planlaufs';
  }
  return zielName ? `Abschluss von „${zielName}“` : 'Ende des Planlaufs';
}

/** Bezeichnung des Endes am Ziel. */
export function endeLabel(zielName: string | null): string {
  return zielName ? `Abschluss von „${zielName}“` : 'Ende des Planlaufs';
}

export const DRUCK_STIL = `
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table.kennzahlen { width: auto; margin-bottom: 4mm; }
  table.kennzahlen td { border: none; padding: 0.8mm 6mm 0.8mm 0; }
  table.kennzahlen td:first-child { color: #6e6e73; }
  .haupt { font-size: 13pt; font-weight: 700; }
  td.zweig { padding-left: 7mm; }
  .klein { font-size: 8pt; color: #6e6e73; }
  .kritisch { font-weight: 600; }
  .ohne-belang td { color: #8e8e93; }
  .hinweis { border: 1px solid #c7c7cc; border-radius: 2mm; padding: 2mm 3mm; margin-bottom: 4mm; }
`;

/** HTML der Druckfassung (für `druckeHtml`). */
export function terminDruckHtml(e: TerminrechnerEingabe, erg: TerminrechnerErgebnis, kopf: TerminDruckKopf): string {
  const ein = einheit(e.arbeitstage);
  const meta = [
    kopf.projektName ? `Projekt ${kopf.projektName}` : 'Ohne Projekt (Mo–Fr, ohne Feiertage)',
    e.richtung === 'rueckwaerts' ? 'Rückwärts gerechnet' : 'Vorwärts gerechnet',
    e.arbeitstage ? 'Fristen in Arbeitstagen' : 'Fristen in Kalendertagen',
    `Stand ${formatDate(e.heute ?? today())}`,
  ].join(' · ');
  const kennzahl = (label: string, wert: string, haupt = false) =>
    `<tr><td>${html(label)}</td><td${haupt ? ' class="haupt"' : ''}>${html(wert)}</td></tr>`;

  const kennzahlen: string[] = [];
  if (e.richtung === 'rueckwaerts') {
    kennzahlen.push(kennzahl(kopf.zielName ? `Termin für „${kopf.zielName}“` : 'Termin auf der Baustelle', mitWochentag(e.datum)));
    kennzahlen.push(kennzahl(hauptLabel(erg, kopf.zielName), mitWochentag(erg.anker), true));
  } else {
    kennzahlen.push(kennzahl(ANKER_LABEL[erg.ankerArt], mitWochentag(erg.anker)));
    kennzahlen.push(kennzahl(hauptLabel(erg, kopf.zielName), mitWochentag(erg.ende), true));
  }
  if (erg.planerstellung) {
    kennzahlen.push(
      kennzahl(
        `Beginn der Planerstellung bei ${fristText(erg.planerstellung.frist, e.arbeitstage)} Frist`,
        mitWochentag(erg.planerstellung.beginn),
      ),
    );
  }
  if (e.richtung === 'rueckwaerts' && erg.ende !== e.datum) {
    kennzahlen.push(kennzahl(endeLabel(kopf.zielName), mitWochentag(erg.ende)));
  }
  if (erg.dauer) {
    kennzahlen.push(
      kennzahl(
        'Dauer',
        `${tageText(erg.dauer.arbeitstage, true)} · ${tageText(erg.dauer.kalendertage, false)}`,
      ),
    );
  }
  if (kopf.szenario.length > 0) kennzahlen.push(kennzahl('Szenario', kopf.szenario.join('; ')));
  else kennzahlen.push(kennzahl('Szenario', 'Standardverlauf'));

  const hinweis = erg.vergangenheit
    ? `<div class="hinweis">Die ${html(ANKER_LABEL[erg.ankerArt])} läge vor heute. Frühestes Ende bei ${
        erg.ankerArt === 'uebergabe' ? 'Übergabe' : 'Start'
      } am ${html(mitWochentag(erg.vergangenheit.anker))}: <strong>${html(mitWochentag(erg.vergangenheit.fruehestesEnde))}</strong></div>`
    : '';

  const zeilen = erg.zeilen
    .map((z) => {
      const schritt = [
        `<strong>${html(z.name)}</strong>`,
        z.zweig ? `<div class="klein">${html(zweigKennung(z))}</div>` : '',
        z.durchlauf > 1 ? `<div class="klein">${z.durchlauf}. Durchlauf</div>` : '',
        z.antwort ? `<div class="klein">Antwort: ${html(z.antwort)}</div>` : '',
      ].join('');
      const fristende =
        e.richtung === 'rueckwaerts' && z.kritisch ? `spätestens ${mitWochentag(z.fristende)}` : mitWochentag(z.fristende);
      const puffer = z.ohneBelang
        ? z.ohneBelang === 'nach_ziel'
          ? 'nach dem Zielschritt'
          : 'ohne Einfluss'
        : z.kritisch
          ? 'kritischer Weg'
          : `${z.puffer} ${ein} (bis ${mitWochentag(z.spaetestens)})`;
      return `<tr class="${z.ohneBelang ? 'ohne-belang' : ''}"><td class="num">${z.nr}</td><td class="${z.zweig ? 'zweig' : ''}">${schritt}</td><td>${html(
        z.roleName,
      )}</td><td class="num">${z.frist} ${ein}</td><td class="num">${html(mitWochentag(z.eingang))}${
        z.eingangPlanerstellung ? '<div class="klein">Beginn der Planerstellung</div>' : ''
      }</td><td class="num${z.kritisch ? ' kritisch' : ''}">${html(fristende)}</td><td class="num">${html(puffer)}</td></tr>`;
    })
    .join('');

  return `<div class="kopf"><h1>Terminrechner – ${html(kopf.workflowName)}</h1><div class="meta">${html(meta)}</div></div>
${hinweis}
<table class="kennzahlen"><tbody>${kennzahlen.join('')}</tbody></table>
<h2>Zwischenergebnisse</h2>
<table><thead><tr><th>Nr.</th><th>Schritt</th><th>Funktion</th><th>Frist</th><th>Eingang</th><th>Fristende</th><th>Puffer</th></tr></thead>
<tbody>${zeilen}</tbody></table>
<div class="fuss">Gerechnet mit den Fristen des Workflows; jede Frist zählt ab dem tatsächlichen Eingang – dem Abschluss des vorherigen Schritts (bei parallelen Zweigen: aller Zweige).</div>`;
}
