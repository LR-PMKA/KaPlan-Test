/**
 * Änderungsprotokoll der Planläufe: Nach jeder Änderung im Store vergleicht
 * `protokollNachziehen` den alten mit dem neuen Bestand und schreibt je Lauf,
 * was jemand getan hat – nicht, was das Programm daraus berechnet hat.
 *
 * Regeln:
 * * Ein Rücksprung bzw. „Wieder öffnen“ ergibt genau einen Eintrag je Lauf; die
 *   Feldänderungen der dabei zurückgesetzten Schritte erscheinen nicht einzeln.
 * * Wechselt die zuständige Person, weil sich die Besetzung einer Funktion
 *   geändert hat, zählen nur anstehende Schritte – zusammengefasst in einem
 *   Eintrag je Lauf. Von Hand gesetzte Personen erscheinen einzeln.
 * * Berechnete Felder (Soll-, Eingangsprognose, fester Eingang beim Anstehen)
 *   und der automatische Wechsel „offen → laufend“ erscheinen nie.
 * * Läufe, deren Protokoll die Aktion selbst geschrieben hat (das Protokoll-
 *   Array wurde ersetzt, z. B. beim Übernehmen eines Laufs), werden nicht
 *   verglichen.
 * * Änderungen an Arbeitstagen und Feiertagen eines Projekts bzw. am Eingang
 *   Soll eines Eintrags erscheinen an allen laufenden Läufen des Projekts bzw.
 *   des Eintrags – sie verschieben deren Termine.
 */
import { formatDate } from '../../../shared/dates';
import { aktuelleSchritte, istErledigt } from './ablauf';
import { kontaktName } from './engine';
import {
  ABBRUCH_ART_LABEL,
  NACHWEIS_LABEL,
  SEITE_LABEL,
  type AppData,
  type Contact,
  type ID,
  type PlanDocument,
  type PlanRun,
  type Project,
  type ProtokollEintrag,
  type RunStep,
  type VerzugAnteil,
} from './types';

/** Rahmen eines Protokolleintrags. */
export interface ProtokollRahmen {
  bearbeiter: string;
  /** ISO-Zeitstempel. */
  zeitpunkt: string;
  /** Kontakte (für Namen in Zuständigkeitswechseln). */
  kontakte: Contact[];
}

const datum = (d: string | null | undefined) => (d ? formatDate(d) : '–');

function antwortText(s: RunStep): string | null {
  if (s.typ !== 'entscheidung' || s.antworten.length === 0) return null;
  return (s.antworten.find((a) => a.id === s.gewaehlteAntwortId) ?? s.antworten[0])?.text ?? null;
}

function anteileText(anteile: VerzugAnteil[]): string {
  if (anteile.length === 0) return 'Zuordnung aufgehoben';
  return anteile.map((a) => `${SEITE_LABEL[a.seite]} ${a.tage}${a.grund ? ` (${a.grund})` : ''}`).join(', ');
}

/** Text zum Abschluss eines Schritts: „„X“ erledigt (Ist …, Antwort „…“, Prüfbericht-Nr. …)“. */
export function abschlussText(s: RunStep): string {
  const teile = [`Ist ${datum(s.istDatum)}`];
  const antwort = antwortText(s);
  if (antwort) teile.push(`Antwort „${antwort}“`);
  if (s.nachweisNummer && s.nachweis !== 'keine') teile.push(`${NACHWEIS_LABEL[s.nachweis]} ${s.nachweisNummer}`);
  return `„${s.name}“ ${s.status === 'uebersprungen' ? 'übersprungen' : 'erledigt'} (${teile.join(', ')})`;
}

/**
 * Protokolleinträge zu den Änderungen an einem Lauf (`alt` fehlt bei einem
 * neuen Lauf). Liefert eine leere Liste, wenn nichts zu protokollieren ist.
 */
export function laufAenderungenProtokollieren(
  alt: PlanRun | undefined,
  neu: PlanRun,
  rahmen: ProtokollRahmen,
): ProtokollEintrag[] {
  const eintraege: ProtokollEintrag[] = [];
  const schreibe = (text: string, stepId: ID | null = null) =>
    eintraege.push({ zeitpunkt: rahmen.zeitpunkt, bearbeiter: rahmen.bearbeiter, stepId, text });
  const person = (id: ID | null) => (id ? kontaktName(rahmen.kontakte.find((c) => c.id === id)) || 'unbekannt' : '–');

  if (!alt) {
    if ((neu.protokoll ?? []).length > 0) return [];
    schreibe(`Planlauf gestartet – Workflow „${neu.templateName}“, Start ${datum(neu.start)}`);
    return eintraege;
  }
  if (alt === neu || alt.protokoll !== neu.protokoll) return [];

  const altSchritte = new Map(alt.steps.map((s) => [s.id, s]));
  const neuIds = new Set(neu.steps.map((s) => s.id));

  // Rücksprung bzw. erneute Bearbeitung: die Historie ist gewachsen
  const zurueckgesetzt = neu.steps.filter((s) => {
    const a = altSchritte.get(s.id);
    return a && (s.historie ?? []).length > (a.historie ?? []).length;
  });
  const unterdrueckt = new Set(zurueckgesetzt.map((s) => s.id));
  if (zurueckgesetzt.length > 0) {
    const letzter = (s: RunStep) => s.historie[s.historie.length - 1];
    const wieder = zurueckgesetzt.some((s) => letzter(s).grund === 'wieder_geoeffnet');
    const ziel = zurueckgesetzt.find((s) => s.status === 'laufend') ?? zurueckgesetzt[0];
    const ausloeser = zurueckgesetzt.find((s) => {
      const a = altSchritte.get(s.id)!;
      const h = letzter(s);
      return !istErledigt(a) && (h.status === 'erledigt' || h.status === 'uebersprungen');
    });
    const n = zurueckgesetzt.length;
    const umfang = `${n} ${n === 1 ? 'Schritt' : 'Schritte'} zurückgesetzt`;
    if (wieder) {
      schreibe(`„${ziel.name}“ wieder geöffnet – erneute Bearbeitung, Durchlauf ${ziel.durchlauf}, Eingang ${datum(ziel.eingangIst)} (${umfang})`, ziel.id);
    } else {
      const h = ausloeser ? letzter(ausloeser) : null;
      const vorher = ausloeser && h
        ? `„${ausloeser.name}“ ${h.status === 'uebersprungen' ? 'übersprungen' : 'erledigt'} (Ist ${datum(h.ist)}${h.antwort ? `, Antwort „${h.antwort}“` : ''}) – `
        : '';
      schreibe(`${vorher}Rücksprung zu „${ziel.name}“, Durchlauf ${ziel.durchlauf}, Wiedereingang ${datum(ziel.eingangIst)} (${umfang})`, ziel.id);
    }
  }

  // Zuständigkeitswechsel nach der Besetzung: nur anstehende Schritte, zusammengefasst
  const anstehend = new Set(aktuelleSchritte(neu).map((s) => s.id));
  const besetzung: string[] = [];

  for (const s of neu.steps) {
    const a = altSchritte.get(s.id);
    if (!a) {
      schreibe(`Schritt „${s.name}“ ergänzt (${s.roleName}, Frist ${s.fristTage} Tage)`, s.id);
      continue;
    }
    if (unterdrueckt.has(s.id) || a === s) continue;
    const erledigtNeu = istErledigt(s);
    const erledigtAlt = istErledigt(a);
    if (erledigtNeu && !erledigtAlt) schreibe(abschlussText(s), s.id);
    else if (!erledigtNeu && erledigtAlt) schreibe(`„${s.name}“ wieder geöffnet (Korrektur)`, s.id);
    else if (erledigtNeu && erledigtAlt) {
      if (a.status !== s.status) schreibe(`„${s.name}“ jetzt ${s.status === 'uebersprungen' ? 'übersprungen' : 'erledigt'}`, s.id);
      if (a.istDatum !== s.istDatum) schreibe(`Ist von „${s.name}“ geändert: ${datum(a.istDatum)} → ${datum(s.istDatum)}`, s.id);
      if (antwortText(a) !== antwortText(s)) schreibe(`Antwort von „${s.name}“ geändert: „${antwortText(a)}“ → „${antwortText(s)}“`, s.id);
      if ((a.nachweisNummer ?? null) !== (s.nachweisNummer ?? null)) {
        schreibe(`${NACHWEIS_LABEL[s.nachweis]} von „${s.name}“ geändert: ${a.nachweisNummer ?? '–'} → ${s.nachweisNummer ?? '–'}`, s.id);
      }
    }
    if (!erledigtNeu && !erledigtAlt && a.gewaehlteAntwortId !== s.gewaehlteAntwortId && s.gewaehlteAntwortId) {
      schreibe(`Antwort für „${s.name}“ vorgemerkt: „${antwortText(s)}“`, s.id);
    }
    // Ein fester Eingang entsteht bzw. entfällt beim Anstehen von selbst – nur eine Änderung zählt
    if (a.eingangIst && s.eingangIst && a.eingangIst !== s.eingangIst) {
      schreibe(`Eingang von „${s.name}“ geändert: ${datum(a.eingangIst)} → ${datum(s.eingangIst)}`, s.id);
    }
    if (s.sollManuell && (!a.sollManuell || a.sollDatum !== s.sollDatum)) {
      schreibe(`Soll von „${s.name}“ von Hand gesetzt: ${datum(s.sollDatum)}`, s.id);
    } else if (!s.sollManuell && a.sollManuell) {
      schreibe(`Soll von „${s.name}“ wird wieder berechnet`, s.id);
    }
    if (a.fristTage !== s.fristTage) schreibe(`Frist von „${s.name}“ geändert: ${a.fristTage} → ${s.fristTage} Tage`, s.id);
    if (a.name !== s.name) schreibe(`Bezeichnung geändert: „${a.name}“ → „${s.name}“`, s.id);
    if (a.roleName !== s.roleName) schreibe(`Funktion von „${s.name}“ geändert: ${a.roleName} → ${s.roleName}`, s.id);
    if (a.bemerkung !== s.bemerkung) schreibe(`Bemerkung zu „${s.name}“ geändert`, s.id);
    if (a.contactId !== s.contactId || a.contactManuell !== s.contactManuell) {
      if (s.contactManuell) schreibe(`Zuständig für „${s.name}“ von Hand: ${person(a.contactId)} → ${person(s.contactId)}`, s.id);
      else if (a.contactManuell) schreibe(`Zuständigkeit für „${s.name}“ folgt wieder der Besetzung: ${person(s.contactId)}`, s.id);
      else if (anstehend.has(s.id)) besetzung.push(`„${s.name}“ ${person(a.contactId)} → ${person(s.contactId)}`);
    }
    if ((s.erinnerungen ?? []).length > (a.erinnerungen ?? []).length) {
      for (const e of s.erinnerungen.slice((a.erinnerungen ?? []).length)) {
        const weg = { outlook: 'Outlook', web: 'Outlook im Web', kopie: 'Zwischenablage', sammel: 'Sammel-E-Mail' }[e.weg];
        schreibe(`E-Mail zu „${s.name}“ vorbereitet an ${e.kontaktName || e.an || 'unbekannt'} (${weg})`, s.id);
      }
    }
    if (JSON.stringify(a.verzugZuordnung ?? []) !== JSON.stringify(s.verzugZuordnung ?? [])) {
      schreibe(`Verzug von „${s.name}“ zugeordnet: ${anteileText(s.verzugZuordnung ?? [])}`, s.id);
    }
    if ((a.nacharbeitSeite ?? null) !== (s.nacharbeitSeite ?? null) && erledigtNeu && erledigtAlt) {
      schreibe(`Ursache der Nacharbeit bei „${s.name}“: ${s.nacharbeitSeite ? SEITE_LABEL[s.nacharbeitSeite] : 'nicht festgelegt'}`, s.id);
    }
    // Zuordnungen früherer Durchläufe
    if ((a.historie ?? []).length === (s.historie ?? []).length) {
      s.historie.forEach((h, k) => {
        const ah = a.historie[k];
        if (!ah || ah === h) return;
        if (JSON.stringify(ah.verzugZuordnung) !== JSON.stringify(h.verzugZuordnung)) {
          schreibe(`Verzug von „${s.name}“ (Durchlauf ${h.durchlauf}) zugeordnet: ${anteileText(h.verzugZuordnung)}`, s.id);
        }
        if (ah.nacharbeitSeite !== h.nacharbeitSeite) {
          schreibe(`Ursache der Nacharbeit bei „${s.name}“ (Durchlauf ${h.durchlauf}): ${h.nacharbeitSeite ? SEITE_LABEL[h.nacharbeitSeite] : 'nicht festgelegt'}`, s.id);
        }
      });
    }
  }
  for (const a of alt.steps) if (!neuIds.has(a.id)) schreibe(`Schritt „${a.name}“ entfernt`, null);
  if (besetzung.length > 0) schreibe(`Zuständigkeit nach der Besetzung geändert: ${besetzung.join('; ')}`);

  // Lauf
  if (alt.basis !== neu.basis && alt.basis && neu.basis && alt.basis.festgelegtAm !== neu.basis.festgelegtAm) {
    schreibe(
      `Basis neu festgelegt${neu.basis.grund ? ` (${neu.basis.grund})` : ''} – geplantes Ende ${datum(alt.basis.planEnde)} → ${datum(neu.basis.planEnde)}`,
    );
  }
  if (alt.start !== neu.start) schreibe(`Start des Planlaufs geändert: ${datum(alt.start)} → ${datum(neu.start)}`);
  if (alt.status !== neu.status) {
    if (neu.status === 'abgeschlossen') schreibe('Planlauf abgeschlossen');
    else if (neu.status === 'laufend') schreibe('Planlauf läuft wieder');
    else {
      const art = neu.abbruchArt ? ABBRUCH_ART_LABEL[neu.abbruchArt] : 'abgebrochen';
      const grund =
        neu.abbruchGrund && neu.abbruchGrund.trim().toLowerCase() !== art.toLowerCase() ? ` – ${neu.abbruchGrund}` : '';
      schreibe(
        neu.abbruchArt === 'ersatzlos' || !neu.abbruchArt
          ? `Planlauf abgebrochen${grund}`
          : `Planlauf beendet: ${art}${neu.abbruchNeuerIndex ? ` ${neu.abbruchNeuerIndex}` : ''}${grund}`,
      );
    }
  }
  return eintraege;
}

/** Texte zu Projektänderungen, die die Termine laufender Läufe verschieben. */
export function projektAenderungen(alt: Project, neu: Project): string[] {
  const texte: string[] = [];
  if (alt.settings.fristenInArbeitstagen !== neu.settings.fristenInArbeitstagen) {
    texte.push(`Projekt: Fristen jetzt in ${neu.settings.fristenInArbeitstagen ? 'Arbeitstagen' : 'Kalendertagen'}`);
  }
  const vorher = new Set(alt.settings.feiertage ?? []);
  const nachher = new Set(neu.settings.feiertage ?? []);
  const dazu = [...nachher].filter((d) => !vorher.has(d)).sort();
  const weg = [...vorher].filter((d) => !nachher.has(d)).sort();
  if (dazu.length > 0 || weg.length > 0) {
    const teile = [
      ...(dazu.length > 0 ? [`ergänzt ${dazu.map(datum).join(', ')}`] : []),
      ...(weg.length > 0 ? [`entfernt ${weg.map(datum).join(', ')}`] : []),
    ];
    texte.push(`Projekt: Feiertage ${teile.join('; ')}`);
  }
  return texte;
}

/** Texte zu Änderungen an einem Eintrag, die die Termine seines Laufs verschieben. */
export function eintragAenderungen(alt: PlanDocument, neu: PlanDocument): string[] {
  return (alt.eingangSoll ?? null) !== (neu.eingangSoll ?? null)
    ? [`Eingang Soll des Eintrags geändert: ${datum(alt.eingangSoll)} → ${datum(neu.eingangSoll)}`]
    : [];
}

/**
 * Schreibt das Protokoll aller Läufe nach einer Änderung des Bestands
 * (`alt` → `neu`, siehe Regeln oben). Liefert `neu` unverändert, wenn es
 * nichts zu protokollieren gibt.
 */
export function protokollNachziehen(alt: AppData, neu: AppData, bearbeiter: string, zeitpunkt: string): AppData {
  if (alt === neu) return neu;
  const rahmen: ProtokollRahmen = { bearbeiter, zeitpunkt, kontakte: [...neu.contacts, ...alt.contacts] };
  const altLaeufe = new Map(alt.runs.map((r) => [r.id, r]));
  const extra = new Map<ID, string[]>();
  const vermerke = (runs: PlanRun[], texte: string[]) => {
    if (texte.length === 0) return;
    for (const r of runs) if (r.status === 'laufend') extra.set(r.id, [...(extra.get(r.id) ?? []), ...texte]);
  };

  if (alt.projects !== neu.projects) {
    const altProjekte = new Map(alt.projects.map((p) => [p.id, p]));
    for (const p of neu.projects) {
      const a = altProjekte.get(p.id);
      if (a && a !== p) vermerke(neu.runs.filter((r) => r.projectId === p.id), projektAenderungen(a, p));
    }
  }
  if (alt.documents !== neu.documents) {
    const altDokumente = new Map(alt.documents.map((d) => [d.id, d]));
    for (const d of neu.documents) {
      const a = altDokumente.get(d.id);
      if (a && a !== d) vermerke(neu.runs.filter((r) => r.documentId === d.id), eintragAenderungen(a, d));
    }
  }

  let geaendert = false;
  const runs = neu.runs.map((r) => {
    const a = altLaeufe.get(r.id);
    const eintraege = a === r ? [] : laufAenderungenProtokollieren(a, r, rahmen);
    for (const text of extra.get(r.id) ?? []) eintraege.push({ zeitpunkt, bearbeiter, stepId: null, text });
    if (eintraege.length === 0) return r;
    geaendert = true;
    return { ...r, protokoll: [...(r.protokoll ?? []), ...eintraege] };
  });
  return geaendert ? { ...neu, runs } : neu;
}
