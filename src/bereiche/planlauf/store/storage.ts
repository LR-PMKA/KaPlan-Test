/**
 * Lokale Persistenz im Browser (localStorage). Die Schnittstelle ist absichtlich
 * schmal gehalten, damit sie später gegen eine echte Datenbank-API getauscht
 * werden kann, ohne die Oberfläche anzufassen.
 */
import {
  DATEN_VERSION,
  EIGENE_ROLLE,
  GEWERKE,
  STAMMDATEN_VERSION,
  STANDARD_BEARBEITER,
  seiteAusFunktion,
  versandAnliegenNachName,
  type AppData,
  type EmailTemplate,
  type Erinnerung,
  type ID,
  type PlanRun,
  type ProcessTemplate,
  type ProcessTemplateStep,
  type ProtokollEintrag,
  type Role,
  type RunStep,
  type StandardRolle,
  type StepType,
} from '../domain/types';
import {
  STANDARD_FASSUNG4_FINGERABDRUCK,
  STANDARD_FASSUNG5_FINGERABDRUCK,
  STANDARD_ROLLEN,
  STANDARD_TEMPLATES,
  sammelVorlage,
  seedData,
  standardVorlagen,
  versandVorlage,
  workflowFingerabdruck,
} from '../domain/seed';
import { eigeneKontakteSichern, recalcRun, zustaendigkeitenNachziehen } from '../domain/engine';
import { anstehendeSchritte, istErledigt, statusAbgleichen, verfolgen } from '../domain/ablauf';
import { basisplanFestlegen } from '../domain/simulation';
import { gliedern } from '../domain/workflowGraph';
import { formatDate, today } from '../../../shared/dates';

/** Frühere Bezeichnung der eigenen Rolle. */
const ALTE_EIGENE_ROLLE = 'PLM';

/** Name der angemeldeten Person; frühere Kürzel werden ersetzt. */
const eigenerName = (b?: { name?: string }) => {
  const name = (b?.name ?? '').trim();
  return !name || name === 'PLM' ? STANDARD_BEARBEITER : name;
};

/** Hebt einen Rollennamen auf die aktuelle Bezeichnung. */
const rollenName = (name: string) => (name === ALTE_EIGENE_ROLLE ? EIGENE_ROLLE : name);

/**
 * Frühere Fassungen führten je Funktion eine Liste von Gewerken bzw. nur
 * „individuell“/„übergreifend“. Daraus wird die Liste der Gewerke, aus der
 * anschließend je Gewerk eine eigene Funktion entsteht.
 */
function gewerkeVon(rolle: { gewerke?: string[]; gewerk?: string | null; gewerkBezug?: string; name: string }): string[] {
  if (rolle.gewerk !== undefined) return rolle.gewerk === null ? [] : [rolle.gewerk];
  if (Array.isArray(rolle.gewerke)) return rolle.gewerke;
  if (rolle.gewerkBezug === 'uebergreifend') return [];
  if (rolle.gewerkBezug === 'individuell') return [...GEWERKE];
  const standard = STANDARD_ROLLEN.filter((s) => s.name === rollenName(rolle.name));
  if (standard.length === 0) return [...GEWERKE];
  return standard.every((s) => s.gewerk === null) ? [] : standard.map((s) => s.gewerk!).filter(Boolean);
}

/** Kennung der aus einer früheren Funktion je Gewerk entstehenden Funktion. */
const gewerkId = (id: string, gewerk: string | null) => (gewerk ? `${id}~${gewerk}` : id);

/**
 * Teilt eine Funktion mit mehreren Gewerken in je eine Funktion pro Gewerk auf
 * („Fachplaner OLA“ und „Fachplaner KIB“ sind verschiedene Funktionen).
 */
function rollenAufteilen<T extends { id: string; name: string }>(rollen: T[]): (Omit<T, 'gewerke'> & { gewerk: string | null })[] {
  return rollen.flatMap((r) => {
    const { gewerke: _alt, ...rest } = r as T & { gewerke?: string[] };
    const gewerke = gewerkeVon(r as never);
    if (gewerke.length === 0) return [{ ...rest, name: rollenName(r.name), gewerk: null } as never];
    return gewerke.map(
      (g) => ({ ...rest, id: gewerkId(r.id, g), name: rollenName(r.name), gewerk: g }) as never,
    );
  });
}

const KEY = 'planlauf-management.data.v1';

/** Präfix der Rohkopien vor einer Umstellung: `<KEY>.vor-fassung-<n>`. */
const VOR_FASSUNG = `${KEY}.vor-fassung-`;

/**
 * Zustand nach dem Laden: `ladefehler` – der gespeicherte Stand ließ sich nicht
 * lesen; `neuere_fassung` – er stammt aus einer neueren Fassung von KaPlan. In
 * beiden Fällen zeigt die Anwendung Demodaten und speichert nicht, damit der
 * gespeicherte Stand erhalten bleibt (siehe rohdatenHerunterladen).
 */
export type LadeZustand = 'ok' | 'ladefehler' | 'neuere_fassung';

export interface Geladen {
  daten: AppData;
  zustand: LadeZustand;
  /** Namen der Kopien selbst geänderter Standard-Workflows („… (eigene Fassung)“) – für einen einmaligen Hinweis. */
  stammdatenKopien: string[];
}

export function ladeDaten(): Geladen {
  const demo = (zustand: LadeZustand): Geladen => ({ daten: durchrechnen(seedData()), zustand, stammdatenKopien: [] });
  let roh: string | null;
  try {
    roh = localStorage.getItem(KEY);
  } catch {
    return demo('ladefehler');
  }
  if (!roh) return demo('ok');
  let daten: AppData;
  try {
    daten = JSON.parse(roh) as AppData;
  } catch {
    return demo('ladefehler');
  }
  if (!daten || typeof daten !== 'object' || !Array.isArray(daten.projects)) return demo('ladefehler');
  if (typeof daten.version === 'number' && daten.version > DATEN_VERSION) return demo('neuere_fassung');
  // Vor einer Umstellung den gespeicherten Text einmalig sichern – scheitert das, wird trotzdem umgestellt
  if ((daten.version ?? 0) < DATEN_VERSION || (daten.stammdatenVersion ?? 0) < STAMMDATEN_VERSION) {
    try {
      const schluessel = `${VOR_FASSUNG}${daten.version ?? 0}`;
      if (localStorage.getItem(schluessel) === null) localStorage.setItem(schluessel, roh);
    } catch {
      /* kein Platz für die Kopie – der Stand lässt sich weiterhin herunterladen */
    }
  }
  try {
    const { daten: aufbereitet, kopien } = aufbereitenMitKopien(daten);
    return { daten: aufbereitet, zustand: 'ok', stammdatenKopien: kopien };
  } catch {
    return demo('ladefehler');
  }
}

/** Hebt einen gelesenen Bestand auf die aktuelle Fassung – beim Laden wie beim Einspielen einer Sicherung. */
function aufbereitenMitKopien(daten: AppData): { daten: AppData; kopien: string[] } {
  const gehoben = migriere(daten);
  const { daten: stamm, kopien } = stammdatenAktualisieren({ ...gehoben, geloescht: gehoben.geloescht ?? [] });
  return { daten: durchrechnen(zustaendigkeitenNachziehen(eigenerKontakt(stamm))), kopien };
}

function aufbereiten(daten: AppData): AppData {
  return aufbereitenMitKopien(daten).daten;
}

/** Listen, die ein Bestand der aktuellen Fassung immer führt. */
const LISTEN = [
  'gewerke',
  'standardRollen',
  'emailVorlagen',
  'projects',
  'roles',
  'contacts',
  'documents',
  'templates',
  'runs',
] as const satisfies readonly (keyof AppData)[];

/**
 * Liest eine Sicherung (die JSON-Datei aus „Sicherung“) und hebt sie wie beim
 * Laden auf die aktuelle Fassung. Ist die Datei keine verwendbare Sicherung,
 * entsteht ein Fehler mit einer Meldung für die Oberfläche.
 */
export function sicherungLesen(text: string): AppData {
  let daten: Partial<AppData> | null;
  try {
    daten = JSON.parse(text) as Partial<AppData> | null;
  } catch {
    throw new Error('Die Datei ist keine gültige JSON-Datei.');
  }
  if (!daten || typeof daten !== 'object' || !Array.isArray(daten.projects)) {
    throw new Error('Die Datei ist keine Sicherung von KaPlan.');
  }
  if (typeof daten.version === 'number' && daten.version > DATEN_VERSION) {
    throw new Error(
      'Die Sicherung stammt aus einer neueren Fassung von KaPlan. Bitte die Seite neu laden (Strg+Umschalt+R) und erneut einspielen.',
    );
  }
  if (
    daten.version === DATEN_VERSION &&
    (LISTEN.some((liste) => !Array.isArray(daten[liste])) || typeof daten.bearbeiter?.name !== 'string')
  ) {
    throw new Error('Die Sicherung ist unvollständig.');
  }
  try {
    return aufbereiten(daten as AppData);
  } catch {
    throw new Error('Die Sicherung konnte nicht gelesen werden.');
  }
}

/**
 * Rechnet alle Planläufe einmal mit den aktuellen Projekteinstellungen und
 * dem Eingangstermin des Eintrags durch, damit die Soll-Termine schon beim
 * Laden stimmen und nicht erst nach der ersten Änderung.
 */
function durchrechnen(daten: AppData): AppData {
  return {
    ...daten,
    runs: daten.runs.map((r) =>
      recalcRun(
        r,
        daten.projects.find((p) => p.id === r.projectId),
        daten.documents.find((d) => d.id === r.documentId),
      ),
    ),
  };
}

const neueId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/** Führt die angemeldete Person in den Rollen ihrer markierten Projekte. */
const eigenerKontakt = (daten: AppData): AppData => eigeneKontakteSichern(daten, neueId);

/**
 * Fingerabdrücke der mitgelieferten Standard-Workflows je früherer
 * Stammdaten-Fassung (siehe workflowFingerabdruck); ab Fassung 5 mit Blöcken.
 */
const FINGERABDRUECKE: Record<number, { werte: Record<ID, string>; mitBloecken: boolean }> = {
  4: { werte: STANDARD_FASSUNG4_FINGERABDRUCK, mitBloecken: false },
  5: { werte: STANDARD_FASSUNG5_FINGERABDRUCK, mitBloecken: true },
};

/**
 * Übernimmt neue mitgelieferte Stammdaten in einen bestehenden Bestand:
 * Funktionen und Standard-Workflows werden auf den aktuellen Stand
 * gebracht und fehlende Rollen in jedes Projekt ergänzt. Eigene Rollen,
 * eigene Ketten, Projektvarianten und laufende Planläufe bleiben erhalten.
 */
function stammdatenAktualisieren(daten: AppData): { daten: AppData; kopien: string[] } {
  if ((daten.stammdatenVersion ?? 0) >= STAMMDATEN_VERSION) return { daten, kopien: [] };

  const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  /** Funktionen sind gleich, wenn Bezeichnung und Gewerk übereinstimmen. */
  const gleicheFunktion = (a: { name: string; gewerk: string | null }, b: { name: string; gewerk: string | null }) =>
    gleich(a.name, b.name) && (a.gewerk ?? '') === (b.gewerk ?? '');

  // Funktionen: mitgelieferte übernehmen, eigene behalten
  const eigeneStandards = (daten.standardRollen ?? []).filter(
    (r) => !STANDARD_ROLLEN.some((s) => gleicheFunktion(s, r)),
  );
  const standardRollen: StandardRolle[] = [
    ...STANDARD_ROLLEN.map((r) => ({ ...r })),
    ...eigeneStandards,
  ];

  // Standard-Workflows ersetzen, eigene Ketten und Projektvarianten behalten.
  // Beim Wechsel von Fassung 4 bzw. 5 bleibt ein selbst geänderter
  // Standard-Workflow als eigene Kopie „<Name> (eigene Fassung)“ erhalten –
  // erkannt am Fingerabdruck der damals mitgelieferten Fassung.
  const eigeneKetten = (daten.templates ?? []).filter(
    (t) => t.projectId !== null || t.herkunft !== 'standard',
  );
  const vergleich = FINGERABDRUECKE[daten.stammdatenVersion ?? 0];
  const kopien: ProcessTemplate[] = vergleich
    ? (daten.templates ?? [])
        .filter((t) => t.projectId === null && t.herkunft === 'standard')
        .filter((t) => {
          const soll = vergleich.werte[t.id];
          return soll !== undefined && workflowFingerabdruck(t, vergleich.mitBloecken) !== soll;
        })
        .map(eigeneFassung)
    : [];
  const templates: ProcessTemplate[] = [...STANDARD_TEMPLATES.map((t) => ({ ...t })), ...kopien, ...eigeneKetten];

  // Fehlende Rollen in jedes Projekt ergänzen
  const roles: Role[] = [...(daten.roles ?? [])];
  for (const projekt of daten.projects) {
    for (const standard of STANDARD_ROLLEN) {
      const vorhanden = roles.some((r) => r.projectId === projekt.id && gleicheFunktion(r, standard));
      if (vorhanden) continue;
      roles.push({
        id: neueId('rol'),
        projectId: projekt.id,
        name: standard.name,
        kuerzel: standard.kuerzel,
        farbe: standard.farbe,
        beschreibung: standard.beschreibung,
        gewerk: standard.gewerk,
        seite: standard.seite,
      });
    }
  }

  return {
    daten: { ...daten, stammdatenVersion: STAMMDATEN_VERSION, standardRollen, templates, roles },
    kopien: kopien.map((t) => t.name),
  };
}

/** Kopie eines Standard-Workflows als eigener Workflow – neue Kennungen, Ziele umgebogen. */
function eigeneFassung(t: ProcessTemplate): ProcessTemplate {
  const ids = new Map(t.steps.map((s) => [s.id, neueId('ts')]));
  const umbiegen = (z: ID | 'ende' | null) => (z === null || z === 'ende' ? z : (ids.get(z) ?? null));
  return {
    ...t,
    id: neueId('tpl'),
    name: `${t.name} (eigene Fassung)`,
    herkunft: 'manuell',
    steps: t.steps.map((s) => ({
      ...s,
      id: ids.get(s.id)!,
      naechster: umbiegen(s.naechster),
      antworten: s.antworten.map((a) => ({ ...a, id: neueId('ant'), ziel: umbiegen(a.ziel) })),
    })),
  };
}

/**
 * Ordnet die früheren Schrittarten den beiden aktuellen zu: Entscheidungen
 * bleiben Entscheidungen, alles andere – auch „Sonstiges“ und „Versand“ –
 * wird zur Aufgabe.
 */
function migriereTyp(alt: string): StepType {
  if (alt === 'gateway' || alt === 'entscheidung') return 'entscheidung';
  return 'aufgabe';
}

/**
 * Ziele, die auf keinen Schritt (mehr) zeigen – der frühere Editor entfernte
 * Schritte, ohne Verweise umzubiegen –, werden zu „nächster Schritt“. So
 * verhielten sich daraus gestartete Planläufe schon bisher.
 */
function zieleBereinigen<T extends ProcessTemplateStep | RunStep>(steps: T[]): T[] {
  const ids = new Set(steps.map((s) => s.id));
  const pruefe = (z: string | null) => (z === null || z === 'ende' || ids.has(z) ? z : null);
  return steps.map((s) => ({ ...s, naechster: pruefe(s.naechster), antworten: s.antworten.map((a) => ({ ...a, ziel: pruefe(a.ziel) })) }));
}

/**
 * Bis Fassung 11 fehlte in den mitgelieferten Workflows der Übergang von
 * „Rückmeldung an Planer“ zu „Erneute Vorlage von Planer“: Die Rückmeldung
 * führte zum nächsten Schritt der Liste – einer Entscheidung, deren „Nein“
 * selbst zur Rückmeldung führt –, die erneute Vorlage wurde nie erreicht.
 * Genau dieses Muster erhält den Übergang, auch in Kopien und in laufenden
 * Planläufen, solange die Rückmeldung dort noch nicht erledigt ist.
 */
/** Nur laufende Planläufe erhalten den Übergang der Rückmeldung. */
function laufVerbinden(status: string | undefined, steps: RunStep[]): RunStep[] {
  return status === 'laufend' || status === undefined ? rueckmeldungVerbinden(steps) : steps;
}

function rueckmeldungVerbinden<T extends ProcessTemplateStep | RunStep>(steps: T[]): T[] {
  const i = steps.findIndex((s) => s.name === 'Rückmeldung an Planer');
  const vorlage = steps.find((s) => s.name === 'Erneute Vorlage von Planer');
  const rueckmeldung = steps[i];
  if (!rueckmeldung || !vorlage || rueckmeldung.typ === 'entscheidung' || rueckmeldung.naechster !== null) return steps;
  if ('status' in rueckmeldung && (rueckmeldung.status === 'erledigt' || rueckmeldung.status === 'uebersprungen')) return steps;
  const folge = steps[i + 1];
  const altesMuster =
    folge?.typ === 'entscheidung' && folge.antworten.some((a) => a.ziel === rueckmeldung.id);
  const vorher = gliedern(steps as ProcessTemplateStep[]).unerreichbar;
  if (!altesMuster || !vorher.includes(vorlage.id)) return steps;
  const neu = steps.map((s) => (s === rueckmeldung ? { ...s, naechster: vorlage.id } : s));
  const nachher = gliedern(neu as ProcessTemplateStep[]).unerreichbar;
  // Kein anderer Schritt darf dadurch unerreichbar werden
  return nachher.every((id) => vorher.includes(id)) ? neu : steps;
}

/** Seite einer Funktion; ältere Bestände kennen sie nicht – Vorbelegung aus der Bezeichnung. */
function mitSeite<T extends { name: string; seite?: StandardRolle['seite'] }>(rolle: T): T & { seite: StandardRolle['seite'] } {
  return { ...rolle, seite: rolle.seite !== undefined ? rolle.seite : seiteAusFunktion(rolle.name) };
}

/** Antworten ab Fassung 13: jede Antwort außer der ersten führt (ohne Angabe) in Nacharbeit. */
function mitNacharbeit(antworten: { nacharbeit?: boolean }[]): never {
  return antworten.map((a, i) => ({ ...a, nacharbeit: a.nacharbeit ?? i > 0 })) as never;
}

/** Bearbeiter der Protokolleinträge, die die Umstellung selbst schreibt. */
const UMSTELLUNG = 'KaPlan (Umstellung auf Fassung 13)';

/**
 * Erinnerungen ab Fassung 13: Aus der früheren „letzten Erinnerung“ wird ein
 * Eintrag – ohne Person und Durchlauf, weil beides seitdem gewechselt haben
 * kann. Zeitpunkte vor dem Start des Laufs stammen aus einem Vorgänger und
 * entfallen.
 */
function erinnerungenAus(s: RunStep, start: string | undefined): Erinnerung[] {
  if (Array.isArray(s.erinnerungen)) return s.erinnerungen;
  if (!s.letzteErinnerung || (start && s.letzteErinnerung.slice(0, 10) < start)) return [];
  return [
    { zeitpunkt: s.letzteErinnerung, contactId: null, kontaktName: '', an: '', betreff: '', anlass: null, weg: 'outlook', durchlauf: null },
  ];
}

/**
 * Wiedereingang nach einem Rücksprung vor Fassung 13: Damals wurde das Ist des
 * Auslösers gelöscht, der Eingang des neuen Durchlaufs ist unbekannt. Ein
 * anstehender Schritt in einem weiteren Durchlauf, dessen Vorgänger einen
 * früheren Durchlauf haben (bzw. der keinen Vorgänger hat), erhält das Datum
 * der Umstellung als geschätzten Eingang und einen Protokolleintrag; ein
 * erledigter solcher Schritt den Abschluss seiner Vorgänger (geschätzt).
 */
function wiedereingangSchaetzen(run: PlanRun, heute: string, zeitpunkt: string): PlanRun {
  if (run.steps.every((s) => (s.durchlauf ?? 1) <= 1)) return run;
  const verlauf = verfolgen(run.steps);
  const anstehend = new Set(anstehendeSchritte(verlauf).map((s) => s.id));
  const imVerlauf = new Set(verlauf.schritte.map((s) => s.id));
  const nachId = new Map(run.steps.map((s) => [s.id, s]));
  const protokoll: ProtokollEintrag[] = [];
  const steps = run.steps.map((s) => {
    if ((s.durchlauf ?? 1) <= 1 || s.eingangIst || !imVerlauf.has(s.id)) return s;
    const vor = (verlauf.vorgaenger.get(s.id) ?? []).map((id) => nachId.get(id)).filter((v): v is RunStep => Boolean(v));
    if (vor.length > 0 && vor.every((v) => (v.durchlauf ?? 1) >= s.durchlauf)) return s;
    if (istErledigt(s)) {
      const ist = vor.map((v) => v.istDatum).filter((d): d is string => Boolean(d)).sort().pop() ?? s.istDatum;
      return { ...s, eingangIst: ist, eingangGeschaetzt: true };
    }
    if (run.status !== 'laufend' || !anstehend.has(s.id)) return s;
    protokoll.push({
      zeitpunkt,
      bearbeiter: UMSTELLUNG,
      stepId: s.id,
      text: `Wiedereingang von „${s.name}“ war nicht gespeichert – auf ${formatDate(heute)} gesetzt, bitte prüfen`,
    });
    return { ...s, eingangIst: heute, eingangGeschaetzt: true, status: s.status === 'offen' ? ('laufend' as const) : s.status };
  });
  return protokoll.length > 0 || steps.some((s, k) => s !== run.steps[k])
    ? { ...run, steps, protokoll: [...run.protokoll, ...protokoll] }
    : run;
}

/**
 * E-Mail-Vorlagen ab Fassung 13: {{verzug}} nennt die Einheit („5 Arbeitstage“).
 * Wo eine Vorlage die Einheit selbst schreibt („seit {{verzug}} Tagen“), steht
 * fortan die reine Zahl {{verzug.zahl}}; die Sammelerinnerung kommt hinzu,
 * ab Fassung 14 die Vorlage „Versand“.
 */
function vorlagenFassung13(vorlagen: EmailTemplate[]): EmailTemplate[] {
  const zahl = (text: string) => text.replace(/\{\{\s*verzug\s*\}\}(\s+(?:Kalender|Arbeits)?[Tt]ag)/g, '{{verzug.zahl}}$1');
  const liste = vorlagen.map((v) => {
    const betreff = zahl(v.betreff);
    const text = zahl(v.text);
    return betreff === v.betreff && text === v.text ? v : { ...v, betreff, text };
  });
  // Mitgelieferte Vorlagen, die später hinzukamen, werden ergänzt
  return [sammelVorlage(), versandVorlage()].reduce(
    (alle, neu) => (alle.some((v) => v.id === neu.id) ? alle : [...alle, neu]),
    liste,
  );
}

/**
 * Hebt einen älteren Bestand auf die aktuelle Fassung. Fehlende Felder werden
 * nur ergänzt (vorhandene bleiben), damit Eingaben erhalten bleiben. Ab
 * Fassung 13: Antworten mit Nacharbeit (alle außer der ersten), Funktionen mit
 * Seite, Erinnerungen aus der letzten Erinnerung, geschätzter Wiedereingang
 * laufender Rücksprünge (siehe wiedereingangSchaetzen) und ein Basisplan für
 * jeden Lauf. Ab Fassung 14: SharePoint-Links an Kontakten (leer) und das
 * Anliegen der Versandmail an Workflow- und Laufschritten – nach dem
 * Schrittnamen der mitgelieferten Versandschritte, sonst keins.
 */
function migriere(daten: AppData): AppData {
  if (daten.version === DATEN_VERSION) return daten;

  const alsAntworten = (typ: StepType, vorhanden: unknown) => {
    if (Array.isArray(vorhanden) && vorhanden.length > 0) return vorhanden as never;
    if (typ !== 'entscheidung') return [];
    return [
      { id: `ant-${Math.random().toString(36).slice(2, 9)}`, text: 'Ja', ziel: null },
      { id: `ant-${Math.random().toString(36).slice(2, 9)}`, text: 'Nein', ziel: null },
    ] as never;
  };

  // Gewerke sind gepflegte Stammdaten. Ein vorhandener Bestand bleibt
  // maßgeblich – gelöschte Gewerke kommen also nicht zurück; ergänzt wird nur,
  // was Funktionen tatsächlich führen. Beim ersten Mal entsteht die Liste aus
  // den mitgelieferten Gewerken und allem, was im Bestand vorkommt.
  const ausFunktionen = [...(daten.standardRollen ?? []), ...(daten.roles ?? [])].map((r) => r.gewerk);
  const quellen =
    daten.gewerke && daten.gewerke.length > 0
      ? [...daten.gewerke, ...ausFunktionen]
      : [...GEWERKE, ...ausFunktionen, ...(daten.documents ?? []).map((d) => d.gewerk)];
  const gewerkeBestand = [
    ...new Set(quellen.filter((g): g is string => Boolean(g && g.trim()))),
  ].sort((a, b) => a.localeCompare(b, 'de'));

  return laeufeFassung13({
    version: DATEN_VERSION,
    stammdatenVersion: daten.stammdatenVersion ?? 0,
    gewerke: gewerkeBestand,
    // Rolle und E-Mail der angemeldeten Person entfallen: die Funktion ist
    // immer das Planlaufmanagement, die Kommunikation läuft über Outlook.
    bearbeiter: {
      name: eigenerName(daten.bearbeiter),
      mailNachfrage: daten.bearbeiter?.mailNachfrage ?? true,
      farbmodus: daten.bearbeiter?.farbmodus === 'kontrast' ? 'kontrast' : 'standard',
    },
    standardRollen:
      daten.standardRollen && daten.standardRollen.length > 0
        ? rollenAufteilen(daten.standardRollen).map(mitSeite)
        : STANDARD_ROLLEN.map((r) => ({ ...r })),
    // E-Mail-Vorlagen werden projektübergreifend gepflegt; frühere
    // Projektvorlagen wandern beim ersten Laden in die gemeinsame Liste.
    emailVorlagen:
      daten.emailVorlagen && daten.emailVorlagen.length > 0
        ? vorlagenFassung13(daten.emailVorlagen)
        : ((daten.projects ?? []).flatMap(
            (p) => (p.settings as { emailTemplates?: EmailTemplate[] }).emailTemplates ?? [],
          ).length > 0
            ? vorlagenFassung13([
                ...new Map(
                  (daten.projects ?? [])
                    .flatMap((p) => (p.settings as { emailTemplates?: EmailTemplate[] }).emailTemplates ?? [])
                    .map((t) => [t.name, t]),
                ).values(),
              ])
            : standardVorlagen()),
    projects: (daten.projects ?? []).map((p) => {
      const { emailTemplates: _alt, ...settings } = p.settings as typeof p.settings & {
        emailTemplates?: EmailTemplate[];
      };
      return { ...p, markiert: p.markiert ?? true, settings };
    }),
    roles: rollenAufteilen(daten.roles ?? []).map(mitSeite),
    contacts: (daten.contacts ?? []).map((c) => {
      const alt = c as unknown as { roleIds?: string[] };
      const alteRollen = daten.roles ?? [];
      const zuordnungen = c.zuordnungen ?? (alt.roleIds ?? []).map((roleId) => ({ roleId, gewerk: null }));
      return {
        ...c,
        anschrift: c.anschrift ?? '',
        sharepointEingang: c.sharepointEingang ?? '',
        sharepointAusgang: c.sharepointAusgang ?? '',
        eigen: c.eigen ?? false,
        // Zuordnungen zeigen jetzt auf die Funktion des jeweiligen Gewerks
        zuordnungen: zuordnungen.flatMap((z) => {
          const alteRolle = alteRollen.find((r) => r.id === z.roleId);
          if (!alteRolle) return [z];
          const gewerke = gewerkeVon(alteRolle as never);
          if (gewerke.length === 0) return [{ roleId: z.roleId, gewerk: null }];
          // Ohne angegebenes Gewerk galt die Besetzung für alle Gewerke der Funktion
          const ziele = z.gewerk ? [z.gewerk] : gewerke;
          return ziele
            .filter((g) => gewerke.includes(g))
            .map((g) => ({ roleId: gewerkId(z.roleId, g), gewerk: g }));
        }),
      };
    }),
    documents: (daten.documents ?? []).map((d) => {
      const alt = d as unknown as Record<string, unknown>;
      // Planpakete haben keinen eigenen Planlauf mehr. Pakete, an denen ein
      // Lauf hängt, werden daher zu Planverzeichnissen – der Lauf und die
      // untergeordneten Pläne bleiben so erhalten.
      const mitLauf = (x: { id: string; kind: string }) =>
        x.kind === 'paket' && (daten.runs ?? []).some((r) => r.documentId === x.id);
      const eltern = (daten.documents ?? []).find((x) => x.id === d.parentId);
      // Ein übergeordnetes Paket ohne Lauf wird zum reinen Ordnungsmerkmal.
      const paketEltern = Boolean(eltern && eltern.kind === 'paket' && !mitLauf(eltern));
      return {
        id: d.id,
        projectId: d.projectId,
        kind: mitLauf(d) ? ('verzeichnis' as const) : d.kind,
        parentId: paketEltern ? null : (d.parentId ?? null),
        paketId: (alt.paketId as string) ?? (paketEltern ? eltern!.id : null),
        nummer: d.nummer,
        titel: d.titel,
        index: d.index ?? '',
        gewerk: d.gewerk ?? '',
        planungsphase: (alt.planungsphase as string) ?? '',
        eingangSoll: (alt.eingangSoll as string) ?? null,
        datum: (alt.datum as string) ?? null,
        bemerkung: d.bemerkung ?? '',
        // Ohne Angabe gilt gebündelt – ältere Bestände bleiben unverändert.
        planlaufModus: d.planlaufModus,
        eigenerLauf: d.eigenerLauf,
        ...(d.geaendertAm ? { geaendertAm: d.geaendertAm } : {}),
      };
    }),
    templates: (daten.templates ?? []).map((t) => ({
      ...t,
      herkunft: t.herkunft === 'standard' ? 'standard' : 'manuell',
      steps: rueckmeldungVerbinden(zieleBereinigen(
        (t.steps ?? []).map((s) => {
        const typ = migriereTyp(s.typ as unknown as string);
        return {
          ...s,
          typ,
          roleName: rollenName(s.roleName),
          antworten: mitNacharbeit(alsAntworten(typ, s.antworten)),
          naechster: s.naechster ?? null,
          nachweis: s.nachweis ?? 'keine',
          mailFrage: s.mailFrage ?? false,
          mailVorlageId: s.mailVorlageId ?? null,
          // Fassung 14: Anliegen der Versandmail nach dem Schrittnamen
          versandAnliegen: s.versandAnliegen !== undefined ? s.versandAnliegen : versandAnliegenNachName(s.name),
          parallel: s.parallel ?? null,
        };
      }))),
    })),
    runs: (daten.runs ?? []).map((r) => ({
      ...r,
      index: r.index ?? (daten.documents ?? []).find((d) => d.id === r.documentId)?.index ?? '',
      status: r.status === 'abgeschlossen' || r.status === 'abgebrochen' ? r.status : 'laufend',
      abbruchGrund: r.abbruchGrund ?? null,
      abbruchDatum: r.abbruchDatum ?? null,
      abbruchArt: r.abbruchArt ?? (r.status === 'abgebrochen' ? 'ersatzlos' : null),
      abbruchNeuerIndex: r.abbruchNeuerIndex ?? null,
      protokoll: r.protokoll ?? [],
      basis: r.basis ?? null,
      steps: laufVerbinden(r.status, zieleBereinigen((r.steps ?? []).map((s) => {
        const typ = migriereTyp(s.typ as unknown as string);
        return {
          ...s,
          typ,
          roleName: rollenName(s.roleName),
          antworten: mitNacharbeit(alsAntworten(typ, s.antworten)),
          parallel: s.parallel ?? null,
          eingangIst: s.eingangIst ?? null,
          eingangGeschaetzt: s.eingangGeschaetzt ?? false,
          eingangDatum: s.eingangDatum ?? null,
          abschlussInfo: s.abschlussInfo ?? null,
          historie: s.historie ?? [],
          erinnerungen: erinnerungenAus(s, r.start),
          verzugZuordnung: s.verzugZuordnung ?? [],
          nacharbeitSeite: s.nacharbeitSeite ?? null,
          blockDurchgang: s.blockDurchgang ?? 1,
          naechster: s.naechster ?? null,
          gewaehlteAntwortId: s.gewaehlteAntwortId ?? null,
          durchlauf: s.durchlauf ?? 1,
          nachweis: s.nachweis ?? 'keine',
          nachweisNummer: s.nachweisNummer ?? null,
          // Bisher fest vergebene Zuständigkeiten folgen künftig der Besetzung
          contactManuell: s.contactManuell ?? false,
          mailFrage: s.mailFrage ?? false,
          mailVorlageId: s.mailVorlageId ?? null,
          versandAnliegen: s.versandAnliegen !== undefined ? s.versandAnliegen : versandAnliegenNachName(s.name),
        };
      }))),
    })),
    geloescht: daten.geloescht ?? [],
  });
}

/**
 * Nach dem Umbau der Felder: geschätzter Wiedereingang, Status passend zum Weg
 * (anstehend = „laufend“) und Basisplan für jeden Lauf, der noch keinen hat
 * (festgelegt mit dem Stand der Umstellung).
 */
function laeufeFassung13(daten: AppData): AppData {
  const heute = today();
  const zeitpunkt = new Date().toISOString();
  return {
    ...daten,
    runs: daten.runs.map((r) => {
      const geschaetzt = wiedereingangSchaetzen(r, heute, zeitpunkt);
      const steps = geschaetzt.status === 'laufend' ? statusAbgleichen(geschaetzt.steps) : geschaetzt.steps;
      const lauf = steps === geschaetzt.steps ? geschaetzt : { ...geschaetzt, steps };
      if (lauf.basis) return lauf;
      const project = daten.projects.find((p) => p.id === lauf.projectId);
      const doc = daten.documents.find((d) => d.id === lauf.documentId);
      return { ...lauf, basis: basisplanFestlegen(lauf, project, doc, 'bei Umstellung auf Fassung 13 festgelegt', zeitpunkt) };
    }),
  };
}

/** Der Speicher des Browsers ist voll. */
function speicherVoll(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014;
}

/** Ergebnis des Speicherns: gespeichert, Speicher voll oder Speicher nicht nutzbar (gesperrt). */
export type SpeicherZustand = 'ok' | 'voll' | 'gesperrt';

/**
 * Speichert den Bestand. Ist der Speicher voll, werden zuerst die Rohkopien
 * früherer Fassungen entfernt und das Speichern wiederholt. Liefert, ob der
 * Bestand gespeichert ist bzw. warum nicht – dann zeigt die Anwendung einen
 * dauerhaften Hinweis.
 */
export function speichereDaten(daten: AppData): SpeicherZustand {
  const text = JSON.stringify(daten);
  try {
    localStorage.setItem(KEY, text);
    return 'ok';
  } catch (err) {
    if (!speicherVoll(err)) {
      console.warn('Daten konnten nicht lokal gespeichert werden:', err);
      return 'gesperrt';
    }
  }
  try {
    const alt: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(VOR_FASSUNG)) alt.push(k);
    }
    if (alt.length === 0) return 'voll';
    alt.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(KEY, text);
    return 'ok';
  } catch (err) {
    console.warn('Daten konnten nicht lokal gespeichert werden:', err);
    return speicherVoll(err) ? 'voll' : 'gesperrt';
  }
}

export function loescheDaten(): void {
  localStorage.removeItem(KEY);
}

function herunterladen(text: string, dateiname: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportiereDaten(daten: AppData): void {
  herunterladen(JSON.stringify(daten, null, 2), `planlauf-export-${new Date().toISOString().slice(0, 10)}.json`);
}

/**
 * Lädt den gespeicherten Rohtext herunter – unverändert, auch wenn er sich
 * nicht lesen lässt oder aus einer neueren Fassung stammt (Hinweisleiste nach
 * einem Ladefehler). Liefert false, wenn nichts gespeichert ist.
 */
export function rohdatenHerunterladen(): boolean {
  let roh: string | null = null;
  try {
    roh = localStorage.getItem(KEY);
  } catch {
    return false;
  }
  if (roh === null) return false;
  herunterladen(roh, `planlauf-gespeicherter-stand-${new Date().toISOString().slice(0, 10)}.json`);
  return true;
}
