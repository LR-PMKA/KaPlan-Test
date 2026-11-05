/**
 * Änderungen am Bestand als reine Funktionen – der Store (store/store.tsx)
 * ruft sie innerhalb von `mutate` mit dem jeweils aktuellen Stand auf. So
 * rechnen auch Sammelaktionen und mehrere Aufrufe hintereinander nie mit einer
 * veralteten Kopie.
 */
import { today } from '../../../shared/dates';
import { aktuelleSchritte, istErledigt } from './ablauf';
import { aenderungenAufLauf, schrittStatusSetzen, type Abschluss } from './abschluss';
import {
  eigeneKontakteSichern,
  kontaktName,
  laufUebernehmen,
  planlaufName,
  recalcRun,
  zustaendigkeitenNachziehen,
  type AbschlussKontext,
} from './engine';
import { protokollNachziehen } from './protokoll';
import {
  funktionsName,
  hatEigenenPlanlauf,
  type AppData,
  type ID,
  type ISODate,
  type Loeschvermerk,
  type PlanDocument,
  type PlanRun,
} from './types';

/** Wer wann eine Änderung vornimmt. */
export interface Vorgang {
  /** ISO-Zeitstempel. */
  zeitpunkt: string;
  bearbeiter: string;
  heute?: ISODate;
}

/** Funktionen, Kontakte, Gewerk und Bearbeiter für die Momentaufnahme beim Abschluss eines Schritts. */
export function kontextFuer(daten: AppData, run: Pick<PlanRun, 'projectId' | 'documentId'>): AbschlussKontext {
  return {
    rollen: daten.roles.filter((r) => r.projectId === run.projectId),
    kontakte: daten.contacts.filter((c) => c.projectId === run.projectId),
    gewerk: daten.documents.find((d) => d.id === run.documentId)?.gewerk ?? '',
    bearbeiter: daten.bearbeiter?.name ?? '',
  };
}

/** Rechnet einen Lauf mit den Einstellungen seines Projekts und seinem Eintrag neu. */
export function laufRechnen(daten: AppData, run: PlanRun, heute?: ISODate): PlanRun {
  return recalcRun(
    run,
    daten.projects.find((p) => p.id === run.projectId),
    daten.documents.find((d) => d.id === run.documentId),
    heute ?? today(),
  );
}

/** Ersetzt einen Lauf (Rückgabe von `fn`); unbekannte Läufe bleiben, wie sie sind. */
export function laufAendern(daten: AppData, runId: ID, fn: (run: PlanRun) => PlanRun): AppData {
  let geaendert = false;
  const runs = daten.runs.map((r) => {
    if (r.id !== runId) return r;
    const neu = fn(r);
    if (neu !== r) geaendert = true;
    return neu;
  });
  return geaendert ? { ...daten, runs } : daten;
}

/* ------------------------------------------------------------------ */
/* Eine Änderung anwenden (Kern von mutate im Store)                   */
/* ------------------------------------------------------------------ */

/**
 * Wendet eine Aktion an und zieht alles Abgeleitete nach: die eigene Person
 * in ihren markierten Projekten, Zuständigkeiten aus der Besetzung, Termine
 * aller Läufe, das Änderungsprotokoll der Läufe und den Änderungszeitpunkt
 * geänderter Objekte. `protokoll: false` (Ersetzen, Zurücksetzen, Abgleich)
 * lässt Protokoll und Änderungszeitpunkte aus. Liefert `alt`, wenn die Aktion
 * nichts ändert.
 */
export function bestandAendern(
  alt: AppData,
  fn: (d: AppData, vorgang: Vorgang) => AppData,
  optionen: { zeitpunkt: string; heute: ISODate; protokoll?: boolean },
  neueId: (prefix: string) => ID,
): AppData {
  const { zeitpunkt, heute } = optionen;
  const roh = fn(alt, { zeitpunkt, heute, bearbeiter: alt.bearbeiter?.name ?? '' });
  if (roh === alt) return alt;
  const neu = zustaendigkeitenNachziehen(eigeneKontakteSichern(roh, neueId));
  const gerechnet: AppData = { ...neu, runs: neu.runs.map((r) => laufRechnen(neu, r, heute)) };
  if (optionen.protokoll === false) return gerechnet;
  const mitProtokoll = protokollNachziehen(alt, gerechnet, gerechnet.bearbeiter?.name ?? '', zeitpunkt);
  return geaendertAmSetzen(alt, mitProtokoll, zeitpunkt);
}

/* ------------------------------------------------------------------ */
/* Änderungszeitpunkt                                                  */
/* ------------------------------------------------------------------ */

function stempeln<T extends { id: ID; geaendertAm?: string }>(alt: T[], neu: T[], zeitpunkt: string): T[] {
  if (alt === neu) return neu;
  const vorher = new Map(alt.map((x) => [x.id, x]));
  let geaendert = false;
  const liste = neu.map((x) => {
    if (vorher.get(x.id) === x || x.geaendertAm === zeitpunkt) return x;
    geaendert = true;
    return { ...x, geaendertAm: zeitpunkt };
  });
  return geaendert ? liste : neu;
}

/**
 * Setzt `geaendertAm` an Projekten, Einträgen, Kontakten, Funktionen und
 * Workflows, deren Objekt sich gegenüber `alt` geändert hat (Vergleich der
 * Referenz – unveränderte Objekte behalten ihre Referenz).
 */
export function geaendertAmSetzen(alt: AppData, neu: AppData, zeitpunkt: string): AppData {
  if (alt === neu) return neu;
  const projects = stempeln(alt.projects, neu.projects, zeitpunkt);
  const documents = stempeln(alt.documents, neu.documents, zeitpunkt);
  const contacts = stempeln(alt.contacts, neu.contacts, zeitpunkt);
  const roles = stempeln(alt.roles, neu.roles, zeitpunkt);
  const templates = stempeln(alt.templates, neu.templates, zeitpunkt);
  if (
    projects === neu.projects &&
    documents === neu.documents &&
    contacts === neu.contacts &&
    roles === neu.roles &&
    templates === neu.templates
  ) {
    return neu;
  }
  return { ...neu, projects, documents, contacts, roles, templates };
}

/* ------------------------------------------------------------------ */
/* Löschen mit Vermerk                                                 */
/* ------------------------------------------------------------------ */

/** Ein Löschvermerk (für den Abgleich mit Sicherungen). */
export function loeschvermerk(
  art: Loeschvermerk['art'],
  id: ID,
  projectId: ID | null,
  bezeichnung: string,
  vorgang: Vorgang,
): Loeschvermerk {
  return { id, art, projectId, bezeichnung, am: vorgang.zeitpunkt, bearbeiter: vorgang.bearbeiter };
}

const eintragName = (d: Pick<PlanDocument, 'nummer' | 'titel'>) => [d.nummer, d.titel].filter(Boolean).join(' – ');

/** Vermerke für gelöschte Läufe. */
function laufVermerke(runs: PlanRun[], vorgang: Vorgang): Loeschvermerk[] {
  return runs.map((r) => loeschvermerk('lauf', r.id, r.projectId, r.name, vorgang));
}

/**
 * Löscht ein Projekt samt Funktionen, Kontakten, Einträgen, Planläufen und
 * Projekt-Workflows – mit einem Löschvermerk für jedes Element.
 */
export function projektLoeschen(daten: AppData, id: ID, vorgang: Vorgang): AppData {
  const projekt = daten.projects.find((p) => p.id === id);
  if (!projekt) return daten;
  const imProjekt = <T extends { projectId: ID | null }>(x: T) => x.projectId === id;
  const vermerke: Loeschvermerk[] = [
    loeschvermerk('projekt', id, id, [projekt.nummer, projekt.name].filter(Boolean).join(' '), vorgang),
    ...daten.roles.filter(imProjekt).map((r) => loeschvermerk('funktion', r.id, id, funktionsName(r), vorgang)),
    ...daten.contacts.filter(imProjekt).map((c) => loeschvermerk('kontakt', c.id, id, kontaktName(c), vorgang)),
    ...daten.documents.filter(imProjekt).map((d) => loeschvermerk('eintrag', d.id, id, eintragName(d), vorgang)),
    ...laufVermerke(daten.runs.filter(imProjekt), vorgang),
    ...daten.templates.filter(imProjekt).map((t) => loeschvermerk('workflow', t.id, id, t.name, vorgang)),
  ];
  return {
    ...daten,
    projects: daten.projects.filter((p) => p.id !== id),
    roles: daten.roles.filter((r) => !imProjekt(r)),
    contacts: daten.contacts.filter((c) => !imProjekt(c)),
    documents: daten.documents.filter((d) => !imProjekt(d)),
    runs: daten.runs.filter((r) => !imProjekt(r)),
    templates: daten.templates.filter((t) => !imProjekt(t)),
    geloescht: [...(daten.geloescht ?? []), ...vermerke],
  };
}

/** Löscht ein Gewerk samt seiner Funktionen (Stammdaten und Projekte) und deren Besetzung. */
export function gewerkLoeschen(daten: AppData, name: string, vorgang: Vorgang): AppData {
  const gleich = (g: string | null) => (g ?? '').trim().toLowerCase() === name.trim().toLowerCase();
  const rollen = daten.roles.filter((r) => gleich(r.gewerk));
  const rollenIds = new Set(rollen.map((r) => r.id));
  const standard = daten.standardRollen.filter((r) => gleich(r.gewerk));
  const gewerk = daten.gewerke.find((g) => gleich(g));
  return {
    ...daten,
    gewerke: daten.gewerke.filter((g) => !gleich(g)),
    standardRollen: daten.standardRollen.filter((r) => !gleich(r.gewerk)),
    roles: daten.roles.filter((r) => !rollenIds.has(r.id)),
    contacts: daten.contacts.map((c) =>
      c.zuordnungen.some((z) => rollenIds.has(z.roleId))
        ? { ...c, zuordnungen: c.zuordnungen.filter((z) => !rollenIds.has(z.roleId)) }
        : c,
    ),
    geloescht: [
      ...(daten.geloescht ?? []),
      ...(gewerk ? [loeschvermerk('gewerk', gewerk, null, gewerk, vorgang)] : []),
      ...standard.map((r) => loeschvermerk('funktion', r.id, null, funktionsName(r), vorgang)),
      ...rollen.map((r) => loeschvermerk('funktion', r.id, r.projectId, funktionsName(r), vorgang)),
    ],
  };
}

/** Löscht eine Projektfunktion samt ihrer Besetzung. */
export function funktionLoeschen(daten: AppData, id: ID, vorgang: Vorgang): AppData {
  const rolle = daten.roles.find((r) => r.id === id);
  if (!rolle) return daten;
  return {
    ...daten,
    roles: daten.roles.filter((r) => r.id !== id),
    contacts: daten.contacts.map((c) =>
      c.zuordnungen.some((z) => z.roleId === id) ? { ...c, zuordnungen: c.zuordnungen.filter((z) => z.roleId !== id) } : c,
    ),
    geloescht: [...(daten.geloescht ?? []), loeschvermerk('funktion', id, rolle.projectId, funktionsName(rolle), vorgang)],
  };
}

/**
 * Löscht einen Kontakt. Offene Schritte verlieren die Person (die Besetzung
 * zieht danach nach); erledigte Schritte, frühere Durchläufe und Erinnerungen
 * behalten den Verweis – sie belegen, wer den Schritt bearbeitet hat.
 */
export function kontaktLoeschen(daten: AppData, id: ID, vorgang: Vorgang): AppData {
  const kontakt = daten.contacts.find((c) => c.id === id);
  if (!kontakt) return daten;
  return {
    ...daten,
    contacts: daten.contacts.filter((c) => c.id !== id),
    runs: daten.runs.map((r) =>
      r.steps.some((s) => s.contactId === id && !istErledigt(s))
        ? { ...r, steps: r.steps.map((s) => (s.contactId === id && !istErledigt(s) ? { ...s, contactId: null } : s)) }
        : r,
    ),
    geloescht: [...(daten.geloescht ?? []), loeschvermerk('kontakt', id, kontakt.projectId, kontaktName(kontakt), vorgang)],
  };
}

/** Löscht einen Planlauf mit Vermerk. */
export function laufLoeschen(daten: AppData, id: ID, vorgang: Vorgang): AppData {
  const lauf = daten.runs.find((r) => r.id === id);
  if (!lauf) return daten;
  return {
    ...daten,
    runs: daten.runs.filter((r) => r.id !== id),
    geloescht: [...(daten.geloescht ?? []), ...laufVermerke([lauf], vorgang)],
  };
}

/**
 * Löscht Einträge (Pläne, Planverzeichnisse, Planpakete) samt ihrer Planläufe.
 *
 * * Pläne eines gelöschten Verzeichnisses, die nicht selbst gelöscht werden,
 *   werden Einzelpläne im Paket des Verzeichnisses. Lief ein solcher Plan im
 *   Lauf des Verzeichnisses mit, führt er dessen Stand in einem eigenen Lauf
 *   weiter – kein Plan bleibt ohne Planlauf.
 * * Einträge eines gelöschten Planpakets sind keinem Paket mehr zugeordnet.
 * * Jeder gelöschte Eintrag und Lauf erhält einen Löschvermerk.
 */
export function eintraegeLoeschen(
  daten: AppData,
  ids: ID[],
  neueId: (prefix: string) => ID,
  vorgang: Vorgang,
): AppData {
  const weg = new Set(ids.filter((id) => daten.documents.some((d) => d.id === id)));
  if (weg.size === 0) return daten;
  const nachId = new Map(daten.documents.map((d) => [d.id, d]));
  const uebernommen: PlanRun[] = [];
  for (const id of weg) {
    const verzeichnis = nachId.get(id)!;
    if (verzeichnis.kind !== 'verzeichnis') continue;
    const quelle = daten.runs
      .filter((r) => r.documentId === id && r.status !== 'abgebrochen')
      .sort((a, b) => (a.status === 'laufend' ? 0 : 1) - (b.status === 'laufend' ? 0 : 1))[0];
    if (!quelle) continue;
    for (const plan of daten.documents) {
      if (plan.kind !== 'plan' || plan.parentId !== id || weg.has(plan.id)) continue;
      if (hatEigenenPlanlauf(plan, daten.documents)) continue;
      if (daten.runs.some((r) => r.documentId === plan.id && r.status !== 'abgebrochen')) continue;
      uebernommen.push({
        ...laufUebernehmen(
          quelle,
          {
            documentId: plan.id,
            name: planlaufName(plan),
            index: plan.index,
            bemerkung: `Stand von „${quelle.name}“ übernommen – Planverzeichnis gelöscht`,
          },
          neueId,
          { bearbeiter: vorgang.bearbeiter, zeitpunkt: vorgang.zeitpunkt },
        ),
        status: quelle.status,
        id: neueId('run'),
      });
    }
  }
  const paketNach = (x: PlanDocument): ID | null => {
    const eltern = x.parentId ? nachId.get(x.parentId) : undefined;
    const paket = eltern && weg.has(eltern.id) ? eltern.paketId : x.paketId;
    return paket && weg.has(paket) ? null : paket;
  };
  const documents = daten.documents
    .filter((x) => !weg.has(x.id))
    .map((x) => {
      const elternWeg = x.parentId !== null && weg.has(x.parentId);
      const paketWeg = x.paketId !== null && weg.has(x.paketId);
      if (!elternWeg && !paketWeg) return x;
      return elternWeg
        ? { ...x, parentId: null, eigenerLauf: undefined, paketId: paketNach(x) }
        : { ...x, paketId: null };
    });
  const geloeschteLaeufe = daten.runs.filter((r) => weg.has(r.documentId));
  return {
    ...daten,
    documents,
    runs: [...daten.runs.filter((r) => !weg.has(r.documentId)), ...uebernommen],
    geloescht: [
      ...(daten.geloescht ?? []),
      ...[...weg].map((id) => {
        const d = nachId.get(id)!;
        return loeschvermerk('eintrag', id, d.projectId, eintragName(d), vorgang);
      }),
      ...laufVermerke(geloeschteLaeufe, vorgang),
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Mehrfachauswahl in der Planliste                                    */
/* ------------------------------------------------------------------ */

/**
 * Einträge, die eine Paketzuordnung der Auswahl `ids` betrifft: gewählte
 * Einträge außer Planpaketen und Plänen eines Verzeichnisses, dazu die Pläne
 * gewählter Verzeichnisse (Pläne eines Verzeichnisses gehören zum Paket ihres
 * Verzeichnisses). Mit `projectId` nur Einträge dieses Projekts.
 */
export function paketBetroffene(daten: AppData, ids: ID[], projectId?: ID): PlanDocument[] {
  const gewaehlt = new Set(ids);
  const vorhanden = new Set(daten.documents.map((d) => d.id));
  return daten.documents.filter((d) => {
    if (d.kind === 'paket' || (projectId !== undefined && d.projectId !== projectId)) return false;
    const imVerzeichnis = d.kind === 'plan' && d.parentId !== null && vorhanden.has(d.parentId);
    return imVerzeichnis ? gewaehlt.has(d.parentId!) : gewaehlt.has(d.id);
  });
}

/**
 * Ordnet Einträge einem Planpaket zu (`null` = keinem). Pläne eines
 * Verzeichnisses gehören zum Paket ihres Verzeichnisses: Sie folgen ihm, wenn
 * das Verzeichnis gewählt ist, und bleiben sonst unverändert. Planpakete
 * selbst lassen sich keinem Paket zuordnen. Ziel muss ein Planpaket sein;
 * zugeordnet werden nur Einträge seines Projekts – sonst bleibt der Stand
 * unverändert. Liefert den neuen Stand und die Zahl der zugeordneten gewählten
 * Einträge.
 */
export function paketZuweisen(daten: AppData, ids: ID[], paketId: ID | null): { daten: AppData; zugeordnet: number } {
  const gewaehlt = new Set(ids);
  let projectId: ID | undefined;
  if (paketId !== null) {
    const ziel = daten.documents.find((d) => d.id === paketId);
    if (!ziel || ziel.kind !== 'paket') return { daten, zugeordnet: 0 };
    projectId = ziel.projectId;
  }
  const betroffene = new Set(paketBetroffene(daten, ids, projectId).map((d) => d.id));
  let zugeordnet = 0;
  let geaendert = false;
  const documents = daten.documents.map((d) => {
    if (!betroffene.has(d.id)) return d;
    if (gewaehlt.has(d.id)) zugeordnet++;
    if (d.paketId === paketId) return d;
    geaendert = true;
    return { ...d, paketId };
  });
  return { daten: geaendert ? { ...daten, documents } : daten, zugeordnet };
}

/**
 * Legt ein Planpaket `id` für die Auswahl an und ordnet ihr die betroffenen
 * Einträge zu (siehe `paketBetroffene`; Projekt des ersten betroffenen
 * Eintrags, Gewerk und Leistungsphase, wenn allen gemeinsam). Betrifft die
 * Auswahl nichts – etwa nur Pläne eines nicht gewählten Verzeichnisses –,
 * entsteht kein Paket.
 */
export function paketAnlegen(daten: AppData, name: string, ids: ID[], id: ID): { daten: AppData; angelegt: boolean } {
  const alle = paketBetroffene(daten, ids);
  if (alle.length === 0) return { daten, angelegt: false };
  const projectId = alle[0].projectId;
  const gewaehlt = alle.filter((x) => x.projectId === projectId);
  const gemeinsam = (k: 'gewerk' | 'planungsphase') => (gewaehlt.every((x) => x[k] === gewaehlt[0][k]) ? gewaehlt[0][k] : '');
  const paket: PlanDocument = {
    id,
    projectId,
    kind: 'paket',
    parentId: null,
    paketId: null,
    nummer: '',
    titel: name.trim(),
    index: '',
    gewerk: gemeinsam('gewerk'),
    planungsphase: gemeinsam('planungsphase'),
    eingangSoll: null,
    datum: null,
    bemerkung: '',
  };
  return { daten: paketZuweisen({ ...daten, documents: [...daten.documents, paket] }, ids, id).daten, angelegt: true };
}

/** Felder, die sich für mehrere Einträge zugleich ändern lassen. */
export type EintragsPatch = Partial<Pick<PlanDocument, 'gewerk' | 'planungsphase' | 'eingangSoll' | 'bemerkung' | 'index'>>;

/** Ändert Felder mehrerer Einträge zugleich (unveränderte behalten ihre Referenz). */
export function eintraegeAendern(daten: AppData, ids: ID[], patch: EintragsPatch): AppData {
  const gewaehlt = new Set(ids);
  const schluessel = Object.keys(patch) as (keyof EintragsPatch)[];
  let geaendert = false;
  const documents = daten.documents.map((d) => {
    if (!gewaehlt.has(d.id) || schluessel.every((k) => d[k] === patch[k])) return d;
    geaendert = true;
    return { ...d, ...patch };
  });
  return geaendert ? { ...daten, documents } : daten;
}

/* ------------------------------------------------------------------ */
/* Schritte abschließen (auch mehrere zugleich)                        */
/* ------------------------------------------------------------------ */

export interface SchrittAbschluss {
  runId: ID;
  stepId: ID;
  status: 'erledigt' | 'uebersprungen';
  /** Ist-Datum; ohne Angabe ein schon erfasstes Ist bzw. heute. */
  istDatum?: ISODate;
  /** Freigabe- bzw. Prüfbericht-Nr. */
  nachweisNummer?: string;
  /** Antwort einer Entscheidung (ohne Angabe die gewählte bzw. erste). */
  antwortId?: ID | null;
}

export interface AbschlussErgebnis {
  runId: ID;
  stepId: ID;
  /**
   * null: Lauf bzw. Schritt nicht (mehr) vorhanden, Lauf nicht laufend, Schritt
   * schon abgeschlossen oder (auf dem Stand vor dem Eintrag) nicht anstehend.
   */
  ergebnis: Abschluss | null;
}

/**
 * Schließt anstehende Schritte nacheinander ab (wie `schrittStatusSetzen`),
 * jeweils auf dem Stand nach dem vorigen – auch mehrere Schritte desselben
 * Laufs. Ein Schritt, der dort nicht ansteht (etwa nach dem Rücksprung eines
 * früheren Eintrags), bleibt unverändert; außer der Reihe abschließen lässt
 * sich ein Schritt nur einzeln (`schrittStatusSetzen`). Verlangt ein Schritt
 * eine Nachweis-Nr., die fehlt, bleibt er ebenfalls unverändert (Ergebnis
 * `art: 'nachweis'`).
 */
export function abschluesseAnwenden(
  daten: AppData,
  eintraege: SchrittAbschluss[],
  vorgang: Vorgang,
): { daten: AppData; ergebnisse: AbschlussErgebnis[] } {
  const heute = vorgang.heute ?? today();
  const laeufe = new Map(daten.runs.map((r) => [r.id, r]));
  const ergebnisse: AbschlussErgebnis[] = [];
  for (const e of eintraege) {
    let run = laeufe.get(e.runId);
    const vorhanden = run?.steps.find((s) => s.id === e.stepId);
    if (
      !run ||
      run.status !== 'laufend' ||
      !vorhanden ||
      istErledigt(vorhanden) ||
      !aktuelleSchritte(run).some((s) => s.id === e.stepId)
    ) {
      ergebnisse.push({ runId: e.runId, stepId: e.stepId, ergebnis: null });
      continue;
    }
    let step = vorhanden;
    if (e.antwortId !== undefined && step.typ === 'entscheidung' && step.antworten.some((a) => a.id === e.antwortId)) {
      step = { ...step, gewaehlteAntwortId: e.antwortId };
      run = { ...run, steps: run.steps.map((s) => (s.id === step.id ? step : s)) };
    }
    const ergebnis = schrittStatusSetzen(run, step, e.status, e.nachweisNummer, {
      istDatum: e.istDatum,
      kontext: kontextFuer(daten, run),
      zeitpunkt: vorgang.zeitpunkt,
      heute,
    });
    ergebnisse.push({ runId: e.runId, stepId: e.stepId, ergebnis });
    if (ergebnis.art === 'aenderung') laeufe.set(run.id, laufRechnen(daten, aenderungenAufLauf(run, ergebnis.aenderungen), heute));
  }
  const runs = daten.runs.map((r) => laeufe.get(r.id) ?? r);
  return { daten: runs.some((r, k) => r !== daten.runs[k]) ? { ...daten, runs } : daten, ergebnisse };
}
