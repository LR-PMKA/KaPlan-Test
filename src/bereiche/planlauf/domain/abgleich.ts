/**
 * Selektiver Abgleich mit einer Sicherung („Abgleichen und auswählen“).
 *
 * `abgleichErmitteln` vergleicht den Bestand mit einer gelesenen Sicherung und
 * liefert einen Baum aus wählbaren Elementen:
 *  - übergreifend: Gewerke, Funktionen, E-Mail-Vorlagen, Workflows,
 *  - je Projekt: Projektdaten, Funktionen, Kontakte, Projekt-Workflows und
 *    Eintragseinheiten (Einzelplan samt Läufen; Planverzeichnis samt Plänen und
 *    allen Läufen; Planpaket).
 * Zustände: neu, geändert, gleich, nur im Bestand (bleibt) und „im Bestand
 * gelöscht am …“ (Löschvermerk in `AppData.geloescht`). Verglichen werden nur
 * Eingabefelder – berechnete Termine, automatisch gesetzte Zuständigkeiten und
 * das Protokoll nicht. Fachliche Zuordnung: Funktionen über Projekt, Name und
 * Gewerk; eigene Kontakte (`eigen`) der Sicherung werden nie übernommen, ihre
 * Verweise zeigen auf den eigenen Kontakt im Bestand; Einträge gleicher
 * Codierung mit anderer Kennung gelten als „vermutlich dasselbe“.
 *
 * `abgleichAnwenden` übernimmt die gewählten Elemente samt Abhängigkeiten
 * (zentrale Tabelle `VERWEISFELDER`). Eine Eintragseinheit wird als Ganzes
 * übernommen: ihre Läufe kommen aus der Sicherung, Läufe gleicher Kennung
 * behalten Protokoll, frühere Durchläufe und Erinnerungen beider Seiten, nur im
 * Bestand vorhandene, nicht abgebrochene Läufe enden als „durch Sicherung
 * ersetzt“. Danach prüft eine Konsistenzprüfung den Stand; bei einem Verstoß
 * wird nichts übernommen.
 *
 * Beide Funktionen sind rein; der Store übernimmt das Ergebnis über
 * `datenAbgleichen` (ohne Vergleichsprotokoll).
 */
import { kontaktName } from './engine';
import {
  DOCUMENT_KIND_LABEL,
  funktionsName,
  hatEigenenPlanlauf,
  type AppData,
  type Contact,
  type EmailTemplate,
  type ID,
  type ISODate,
  type Loeschvermerk,
  type PlanDocument,
  type PlanRun,
  type ProcessTemplate,
  type Project,
  type ProtokollEintrag,
  type Role,
  type StandardRolle,
} from './types';

/* ------------------------------------------------------------------ */
/* Ergebnis des Abgleichs                                              */
/* ------------------------------------------------------------------ */

export type AbgleichZustand = 'neu' | 'geaendert' | 'gleich' | 'nur_bestand' | 'geloescht';

export const ZUSTAND_LABEL: Record<AbgleichZustand, string> = {
  neu: 'neu',
  geaendert: 'geändert',
  gleich: 'gleich',
  nur_bestand: 'nur im Bestand',
  geloescht: 'im Bestand gelöscht',
};

export type ElementArt =
  | 'gewerk'
  | 'standardFunktion'
  | 'emailVorlage'
  | 'workflow'
  | 'projekt'
  | 'funktion'
  | 'kontakt'
  | 'eintrag';

/** Einträge gleicher Codierung mit verschiedener Kennung. */
export interface VermutlichDasselbe {
  /** Kennung des obersten Eintrags in der Sicherung. */
  sicherungId: ID;
  /** Kennung des Eintrags im Bestand. */
  bestandId: ID;
  /** Bezeichnung des Eintrags im Bestand. */
  bestandBezeichnung: string;
  /** true: getrennt übernehmen; false: mit dem Eintrag im Bestand zusammenführen. */
  getrennt: boolean;
}

export interface AbgleichElement {
  /** Eindeutiger Schlüssel, z. B. `eintrag:doc-1` – Grundlage der Auswahl. */
  schluessel: string;
  art: ElementArt;
  /** Kennung im Bestand (nach Zuordnung) bzw. bei neuen Elementen in der Sicherung; Gewerke: Name. */
  id: ID;
  projectId: ID | null;
  bezeichnung: string;
  /** Kurze Angabe zum Inhalt, z. B. „3 Pläne, 2 Planläufe“. */
  zusatz: string;
  zustand: AbgleichZustand;
  /** Löschvermerk im Bestand (Zustand `geloescht`). */
  geloescht: Loeschvermerk | null;
  /** Zuletzt geändert (ISO-Zeitstempel) – null: unbekannt. */
  zuletztBestand: string | null;
  zuletztSicherung: string | null;
  /** Abweichungen der Sicherung gegenüber dem Bestand (Feldnamen bzw. kurze Sätze). */
  unterschiede: string[];
  /** Hinweise zur Übernahme (Zuordnung, Folgen). */
  hinweise: string[];
  vermutlichDasselbe: VermutlichDasselbe | null;
  /** Lässt sich übernehmen (neu, geändert, im Bestand gelöscht). */
  waehlbar: boolean;
  /** Vorbelegung der Auswahl. */
  vorbelegt: boolean;
  /** Schlüssel der Elemente, die bei einer Übernahme mitgenommen werden müssen. */
  abhaengigkeiten: string[];
}

export interface AbgleichGruppe {
  titel: string;
  elemente: AbgleichElement[];
}

export interface AbgleichProjekt {
  projectId: ID;
  bezeichnung: string;
  /** Die Projektdaten selbst. */
  projekt: AbgleichElement;
  /** Gleiche Kennung, aber andere Projektnummer – vermutlich ein anderes Projekt. */
  andereNummer: { bestand: string; sicherung: string } | null;
  gruppen: AbgleichGruppe[];
}

export interface Abgleich {
  global: AbgleichGruppe[];
  projekte: AbgleichProjekt[];
  elemente: Record<string, AbgleichElement>;
  /** Anzahl der Elemente mit Unterschied (neu, geändert, im Bestand gelöscht). */
  unterschiede: number;
}

/** Was übernommen wird. */
export interface AbgleichAuswahl {
  /** Gewählte Elemente (Schlüssel); Abhängigkeiten ergänzt `abgleichAnwenden`. */
  elemente: string[];
  /** Projekte der Sicherung (Kennung), die samt Inhalt mit neuen Kennungen als Kopie übernommen werden. */
  kopien?: ID[];
  /** Einträge der Sicherung (Kennung des obersten Eintrags), die trotz gleicher Codierung getrennt übernommen werden. */
  getrennt?: ID[];
  /** Für Protokoll und Abbruchgrund, z. B. „Sicherung vom 12.10.2026“. */
  quelle: string;
  zeitpunkt: string;
  bearbeiter: string;
  heute: ISODate;
}

export type AbgleichErgebnis =
  | {
      ok: true;
      daten: AppData;
      /** Ausdrücklich gewählte Elemente. */
      uebernommen: number;
      /** Als Abhängigkeit mitgenommene Elemente. */
      mitgenommen: number;
      /** Als Kopie übernommene Projekte. */
      kopien: number;
      /** Läufe, die als „durch Sicherung ersetzt“ beendet wurden. */
      beendet: number;
    }
  | { ok: false; fehler: string[] };

/* ------------------------------------------------------------------ */
/* Zentrale Tabelle der Verweisfelder                                  */
/* ------------------------------------------------------------------ */

export type VerweisZiel = 'projekt' | 'funktion' | 'kontakt' | 'eintrag' | 'workflow' | 'emailVorlage' | 'gewerk';

/**
 * pflicht: Ziel wird mitgenommen, auch wenn es im Bestand gelöscht wurde.
 * mitnehmen: Ziel wird mitgenommen, wenn es neu ist; sonst wird der Verweis geleert.
 * leeren: fehlt das Ziel, wird der Verweis geleert (null).
 */
export type VerweisRegel = 'pflicht' | 'mitnehmen' | 'leeren';

export interface Verweisfeld<T> {
  feld: string;
  ziel: VerweisZiel;
  regel: VerweisRegel;
  werte: (o: T) => (string | null | undefined)[];
}

/**
 * Alle Verweise zwischen den Objektarten – Grundlage der Abhängigkeiten im
 * Abgleich. Neue Verweisfelder hier nachtragen. (Verweise innerhalb einer
 * Eintragseinheit – parentId, documentId – gehören zur Einheit selbst.)
 */
export const VERWEISFELDER = {
  standardFunktion: [
    { feld: 'gewerk', ziel: 'gewerk', regel: 'pflicht', werte: (r) => [r.gewerk] },
  ] as Verweisfeld<StandardRolle>[],
  funktion: [
    { feld: 'projectId', ziel: 'projekt', regel: 'pflicht', werte: (r) => [r.projectId] },
    { feld: 'gewerk', ziel: 'gewerk', regel: 'pflicht', werte: (r) => [r.gewerk] },
  ] as Verweisfeld<Role>[],
  kontakt: [
    { feld: 'projectId', ziel: 'projekt', regel: 'pflicht', werte: (c) => [c.projectId] },
    { feld: 'zuordnungen.roleId', ziel: 'funktion', regel: 'pflicht', werte: (c) => c.zuordnungen.map((z) => z.roleId) },
    { feld: 'zuordnungen.gewerk', ziel: 'gewerk', regel: 'pflicht', werte: (c) => c.zuordnungen.map((z) => z.gewerk) },
  ] as Verweisfeld<Contact>[],
  workflow: [
    { feld: 'projectId', ziel: 'projekt', regel: 'pflicht', werte: (t) => [t.projectId] },
    { feld: 'steps.mailVorlageId', ziel: 'emailVorlage', regel: 'leeren', werte: (t) => t.steps.map((s) => s.mailVorlageId) },
  ] as Verweisfeld<ProcessTemplate>[],
  eintrag: [
    { feld: 'projectId', ziel: 'projekt', regel: 'pflicht', werte: (d) => [d.projectId] },
    { feld: 'paketId', ziel: 'eintrag', regel: 'mitnehmen', werte: (d) => [d.paketId] },
    { feld: 'gewerk', ziel: 'gewerk', regel: 'pflicht', werte: (d) => [d.gewerk] },
  ] as Verweisfeld<PlanDocument>[],
  lauf: [
    { feld: 'projectId', ziel: 'projekt', regel: 'pflicht', werte: (r) => [r.projectId] },
    { feld: 'templateId', ziel: 'workflow', regel: 'mitnehmen', werte: (r) => [r.templateId] },
    { feld: 'steps.contactId', ziel: 'kontakt', regel: 'pflicht', werte: (r) => r.steps.map((s) => s.contactId) },
    {
      feld: 'steps.historie.contactId',
      ziel: 'kontakt',
      regel: 'pflicht',
      werte: (r) => r.steps.flatMap((s) => s.historie.map((h) => h.contactId)),
    },
    {
      feld: 'steps.erinnerungen.contactId',
      ziel: 'kontakt',
      regel: 'pflicht',
      werte: (r) => r.steps.flatMap((s) => s.erinnerungen.map((e) => e.contactId)),
    },
    { feld: 'steps.mailVorlageId', ziel: 'emailVorlage', regel: 'leeren', werte: (r) => r.steps.map((s) => s.mailVorlageId) },
  ] as Verweisfeld<PlanRun>[],
};

/* ------------------------------------------------------------------ */
/* Hilfen                                                              */
/* ------------------------------------------------------------------ */

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** JSON mit sortierten Schlüsseln, ohne undefinierte Felder – für Vergleiche. */
function stabil(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x) ?? 'null';
  if (Array.isArray(x)) return `[${x.map(stabil).join(',')}]`;
  const o = x as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stabil(o[k])}`)
    .join(',')}}`;
}

function ohne(o: object, ...felder: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== undefined && !felder.includes(k)));
}

const FELDNAMEN: Record<string, string> = {
  nummer: 'Nummer',
  name: 'Name',
  titel: 'Titel',
  index: 'Index',
  status: 'Status',
  beschreibung: 'Beschreibung',
  settings: 'Einstellungen',
  kuerzel: 'Kürzel',
  farbe: 'Farbe',
  gewerk: 'Gewerk',
  seite: 'Seite',
  anrede: 'Anrede',
  vorname: 'Vorname',
  nachname: 'Nachname',
  firma: 'Firma',
  email: 'E-Mail',
  telefon: 'Telefon',
  anschrift: 'Anschrift',
  sharepointEingang: 'SharePoint-Link Eingang',
  sharepointAusgang: 'SharePoint-Link Ausgang',
  zuordnungen: 'Funktionen',
  notiz: 'Notiz',
  herkunft: 'Herkunft',
  steps: 'Schritte',
  anlass: 'Anlass',
  betreff: 'Betreff',
  text: 'Text',
  kind: 'Art',
  parentId: 'Verzeichnis',
  planlaufModus: 'Planlauf',
  eigenerLauf: 'eigener Planlauf',
  paketId: 'Planpaket',
  planungsphase: 'Planungsphase',
  eingangSoll: 'Eingang Soll',
  datum: 'Datum',
  bemerkung: 'Bemerkung',
  templateId: 'Workflow',
  templateName: 'Workflow',
  start: 'Start',
  abbruchGrund: 'Abbruch',
  abbruchDatum: 'Abbruch',
  abbruchArt: 'Abbruch',
  abbruchNeuerIndex: 'Abbruch',
  basis: 'Basisplan',
  projectId: 'Projekt',
  documentId: 'Eintrag',
};

function feldUnterschiede(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const felder = new Set([...Object.keys(a), ...Object.keys(b)]);
  const namen = [...felder].filter((k) => stabil(a[k]) !== stabil(b[k])).map((k) => FELDNAMEN[k] ?? k);
  return [...new Set(namen)];
}

const juengster = (werte: (string | null | undefined)[]): string | null =>
  werte.reduce<string | null>((m, w) => (w && (!m || w > m) ? w : m), null);

/** Zuletzt geändert: Änderungszeitpunkt bzw. jüngster Protokolleintrag, der nicht aus einem Abgleich stammt. */
const laufZuletzt = (r: PlanRun): string | null =>
  juengster(r.protokoll.filter((p) => p.quelle !== 'import').map((p) => p.zeitpunkt));

const eintragName = (d: Pick<PlanDocument, 'kind' | 'nummer' | 'titel'>) =>
  `${DOCUMENT_KIND_LABEL[d.kind]} ${[d.nummer, d.titel].filter(Boolean).join(' – ')}`.trim();

const anzahl = (n: number, eins: string, mehr: string) => `${n} ${n === 1 ? eins : mehr}`;

/** Ersetzt Objekte gleicher Kennung an ihrer Stelle und hängt neue an. */
function einsetzen<T extends { id: ID }>(liste: T[], neue: T[]): T[] {
  if (neue.length === 0) return liste;
  const nachId = new Map(neue.map((x) => [x.id, x]));
  const ersetzt = liste.map((x) => nachId.get(x.id) ?? x);
  const vorhanden = new Set(liste.map((x) => x.id));
  return [...ersetzt, ...neue.filter((x) => !vorhanden.has(x.id))];
}

/* ------------------------------------------------------------------ */
/* Fachliche Zuordnung                                                 */
/* ------------------------------------------------------------------ */

interface Zuordnung {
  /** Projektfunktionen der Sicherung → Funktion im Bestand (Kennung, sonst Projekt + Name + Gewerk). */
  funktion: Map<ID, ID>;
  /** Übergreifende Funktionen der Sicherung → Funktion im Bestand. */
  standard: Map<ID, ID>;
  /** Eigene Kontakte der Sicherung → eigener Kontakt im Bestand (null: keiner). */
  eigen: Map<ID, ID | null>;
  /** Kennungen von Kontakten der Sicherung, die nicht übernommen werden (eigene). */
  ohneKontakt: Set<ID>;
  /** Zusammengeführte Einträge: Kennung in der Sicherung → Kennung im Bestand. */
  eintrag: Map<ID, ID>;
  /** Vermutlich dasselbe: oberster Eintrag im Bestand → oberster Eintrag in der Sicherung. */
  vermutlich: Map<ID, ID>;
  getrennt: ReadonlySet<ID>;
}

/** Oberster Eintrag einer Eintragseinheit: das Verzeichnis eines Plans, sonst der Eintrag selbst. */
function obersterEintrag(d: PlanDocument, nachId: Map<ID, PlanDocument>): ID {
  if (d.kind === 'plan' && d.parentId) {
    const eltern = nachId.get(d.parentId);
    if (eltern && eltern.kind === 'verzeichnis') return eltern.id;
  }
  return d.id;
}

function zuordnen(bestand: AppData, sicherung: AppData, getrennt: ReadonlySet<ID>): Zuordnung {
  const gleicheFunktion = (a: { name: string; gewerk: string | null }, b: { name: string; gewerk: string | null }) =>
    norm(a.name) === norm(b.name) && (a.gewerk ?? null) === (b.gewerk ?? null);

  function funktionenZuordnen<T extends { id: ID; name: string; gewerk: string | null }>(
    b: T[],
    s: T[],
    projekt: (x: T) => ID | null,
  ): Map<ID, ID> {
    const karte = new Map<ID, ID>();
    const vergeben = new Set<ID>();
    const imBestand = new Set(b.map((x) => x.id));
    for (const x of s) {
      if (imBestand.has(x.id)) {
        karte.set(x.id, x.id);
        vergeben.add(x.id);
      }
    }
    for (const x of s) {
      if (karte.has(x.id)) continue;
      const treffer = b.find((y) => !vergeben.has(y.id) && projekt(y) === projekt(x) && gleicheFunktion(x, y));
      if (treffer) {
        karte.set(x.id, treffer.id);
        vergeben.add(treffer.id);
      }
    }
    return karte;
  }

  const funktion = funktionenZuordnen(bestand.roles, sicherung.roles, (r) => r.projectId);
  const standard = funktionenZuordnen(bestand.standardRollen, sicherung.standardRollen, () => null);

  // Eigene Kontakte: nie übernehmen, Verweise auf den eigenen Kontakt im Bestand umbiegen
  const eigen = new Map<ID, ID | null>();
  const ohneKontakt = new Set<ID>();
  const eigeneImBestand = new Set(bestand.contacts.filter((c) => c.eigen).map((c) => c.id));
  for (const c of sicherung.contacts) {
    if (c.eigen) {
      eigen.set(c.id, bestand.contacts.find((b) => b.projectId === c.projectId && b.eigen)?.id ?? null);
      ohneKontakt.add(c.id);
    } else if (eigeneImBestand.has(c.id)) {
      // Kennung des eigenen Kontakts im Bestand – nie überschreiben
      ohneKontakt.add(c.id);
    }
  }

  // Einträge gleicher Codierung mit verschiedener Kennung
  const eintrag = new Map<ID, ID>();
  const vermutlich = new Map<ID, ID>();
  const bNachId = new Map(bestand.documents.map((d) => [d.id, d]));
  const sNachId = new Map(sicherung.documents.map((d) => [d.id, d]));
  const geloescht = new Set(bestand.geloescht.filter((v) => v.art === 'eintrag').map((v) => v.id));
  const bOben = bestand.documents.filter((d) => obersterEintrag(d, bNachId) === d.id && !sNachId.has(d.id));
  for (const s of sicherung.documents) {
    if (obersterEintrag(s, sNachId) !== s.id || bNachId.has(s.id) || geloescht.has(s.id) || !norm(s.nummer)) continue;
    const kandidaten = bOben.filter(
      (b) => b.projectId === s.projectId && b.kind === s.kind && norm(b.nummer) === norm(s.nummer) && !vermutlich.has(b.id),
    );
    if (kandidaten.length !== 1) continue;
    const b = kandidaten[0];
    vermutlich.set(b.id, s.id);
    if (getrennt.has(s.id)) continue;
    eintrag.set(s.id, b.id);
    if (s.kind !== 'verzeichnis') continue;
    // Pläne des Verzeichnisses über die Plancodierung
    const bPlaene = bestand.documents.filter((d) => d.parentId === b.id && !sNachId.has(d.id));
    const verwendet = new Set<ID>();
    for (const plan of sicherung.documents.filter((d) => d.parentId === s.id && !bNachId.has(d.id))) {
      const t = bPlaene.find((d) => !verwendet.has(d.id) && norm(d.nummer) !== '' && norm(d.nummer) === norm(plan.nummer));
      if (t) {
        eintrag.set(plan.id, t.id);
        verwendet.add(t.id);
      }
    }
  }

  return { funktion, standard, eigen, ohneKontakt, eintrag, vermutlich, getrennt };
}

/** Die Sicherung in den Kennungen des Bestands (Funktionen, eigene Kontakte, zusammengeführte Einträge). */
function abbilden(sicherung: AppData, z: Zuordnung): AppData {
  const rolle = (id: ID) => z.funktion.get(id) ?? id;
  const kontakt = (id: ID | null) => (id !== null && z.eigen.has(id) ? (z.eigen.get(id) ?? null) : id);
  const eintrag = (id: ID | null) => (id === null ? null : (z.eintrag.get(id) ?? id));
  return {
    ...sicherung,
    standardRollen: sicherung.standardRollen.map((r) => ({ ...r, id: z.standard.get(r.id) ?? r.id })),
    roles: sicherung.roles.map((r) => ({ ...r, id: rolle(r.id) })),
    contacts: sicherung.contacts
      .filter((c) => !z.ohneKontakt.has(c.id))
      .map((c) => ({ ...c, zuordnungen: c.zuordnungen.map((zu) => ({ ...zu, roleId: rolle(zu.roleId) })) })),
    documents: sicherung.documents.map((d) => ({
      ...d,
      id: eintrag(d.id) ?? d.id,
      parentId: eintrag(d.parentId),
      paketId: eintrag(d.paketId),
    })),
    runs: sicherung.runs.map((r) => ({
      ...r,
      documentId: eintrag(r.documentId) ?? r.documentId,
      steps: r.steps.map((s) => ({
        ...s,
        contactId: kontakt(s.contactId),
        historie: s.historie.map((h) => ({ ...h, contactId: kontakt(h.contactId) })),
        erinnerungen: s.erinnerungen.map((e) => ({ ...e, contactId: kontakt(e.contactId) })),
      })),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Vergleich                                                           */
/* ------------------------------------------------------------------ */

const formProjekt = (p: Project) => ohne(p, 'geaendertAm', 'markiert');
const formFunktion = (r: Role | StandardRolle) => ohne(r, 'id', 'geaendertAm');
const formKontakt = (c: Contact) => ({
  ...ohne(c, 'geaendertAm'),
  zuordnungen: c.zuordnungen.map(stabil).sort(),
});
const formWorkflow = (t: ProcessTemplate) => ohne(t, 'geaendertAm');
const formVorlage = (t: EmailTemplate) => ohne(t);
const formEintrag = (d: PlanDocument) => ({
  ...ohne(d, 'geaendertAm', 'planlaufModus', 'eigenerLauf'),
  planlaufModus: d.kind === 'verzeichnis' ? (d.planlaufModus ?? 'gebuendelt') : undefined,
  eigenerLauf: d.eigenerLauf ? true : undefined,
});
/**
 * Eingabefelder eines Laufs: ohne Protokoll, berechnete Termine, automatische
 * Zuständigkeit und geschätzten Wiedereingang. Beim Basisplan zählt der Inhalt,
 * nicht der Zeitpunkt – die Umstellung auf Fassung 13 legt ihn mit dem Zeitpunkt
 * der Umstellung fest, Bestand und ältere Sicherung unterscheiden sich sonst stets.
 */
const formLauf = (r: PlanRun) => ({
  ...ohne(r, 'protokoll', 'basis'),
  basis: r.basis ? ohne(r.basis, 'festgelegtAm') : r.basis,
  steps: r.steps.map((s) => ({
    ...ohne(s, 'eingangDatum', 'historie', 'erinnerungen', 'letzteErinnerung', 'sollDatum', 'contactId', 'eingangIst', 'eingangGeschaetzt'),
    sollDatum: s.sollManuell ? s.sollDatum : null,
    contactId: s.contactManuell ? s.contactId : null,
    eingangIst: s.eingangGeschaetzt ? null : s.eingangIst,
  })),
});

const historieSchluessel = (h: { durchlauf: number; blockDurchgang: number; beendetAm: string }) =>
  `${h.durchlauf}|${h.blockDurchgang}|${h.beendetAm}`;
const erinnerungSchluessel = (e: { zeitpunkt: string; an: string; betreff: string }) => `${e.zeitpunkt}|${e.an}|${e.betreff}`;

/** Was die Sicherung an einem Lauf gegenüber dem Bestand ändern würde. */
function laufUnterschiede(b: PlanRun, s: PlanRun): string[] {
  const u = feldUnterschiede(formLauf(b), formLauf(s));
  const bSchritte = new Map(b.steps.map((x) => [x.id, x]));
  let historie = false;
  let erinnerungen = false;
  for (const st of s.steps) {
    const bt = bSchritte.get(st.id);
    const bh = new Set((bt?.historie ?? []).map(historieSchluessel));
    if (st.historie.some((h) => !bh.has(historieSchluessel(h)))) historie = true;
    const be = new Set((bt?.erinnerungen ?? []).map(erinnerungSchluessel));
    if (st.erinnerungen.some((e) => !be.has(erinnerungSchluessel(e)))) erinnerungen = true;
  }
  if (historie) u.push('frühere Durchläufe');
  if (erinnerungen) u.push('Erinnerungen');
  return u;
}

/* ------------------------------------------------------------------ */
/* Eintragseinheiten                                                   */
/* ------------------------------------------------------------------ */

interface Einheit {
  oben: PlanDocument;
  docs: PlanDocument[];
  runs: PlanRun[];
}

function einheitenVon(daten: AppData): Map<ID, Einheit> {
  const nachId = new Map(daten.documents.map((d) => [d.id, d]));
  const einheiten = new Map<ID, Einheit>();
  const obenVon = new Map<ID, ID>();
  for (const d of daten.documents) {
    const oben = obersterEintrag(d, nachId);
    obenVon.set(d.id, oben);
    if (!einheiten.has(oben)) einheiten.set(oben, { oben: nachId.get(oben)!, docs: [], runs: [] });
    einheiten.get(oben)!.docs.push(d);
  }
  for (const r of daten.runs) {
    const oben = obenVon.get(r.documentId);
    if (oben) einheiten.get(oben)!.runs.push(r);
  }
  return einheiten;
}

function einheitZusatz(e: Einheit): string {
  const teile: string[] = [];
  const plaene = e.docs.filter((d) => d.id !== e.oben.id).length;
  if (e.oben.kind === 'verzeichnis') teile.push(anzahl(plaene, 'Plan', 'Pläne'));
  if (e.oben.kind !== 'paket') {
    const laufend = e.runs.filter((r) => r.status === 'laufend').length;
    teile.push(`${anzahl(e.runs.length, 'Planlauf', 'Planläufe')}${laufend ? ` (${laufend} laufend)` : ''}`);
  }
  return teile.join(', ');
}

const einheitZuletzt = (e: Einheit | undefined): string | null =>
  e ? juengster([...e.docs.map((d) => d.geaendertAm), ...e.runs.map(laufZuletzt)]) : null;

/** „Planlauf …“ – ohne doppeltes „Planlauf“, wenn der Name schon damit beginnt. */
const laufName = (r: PlanRun) =>
  `${/^Planlauf\s/.test(r.name) ? r.name : `Planlauf „${r.name}“`}${r.index ? ` (Index ${r.index})` : ''}`;

/** Läufe des Bestands, die bei Übernahme der Einheit als „durch Sicherung ersetzt“ enden. */
function endendeLaeufe(b: Einheit, s: Einheit): PlanRun[] {
  const sDocs = new Set(s.docs.map((d) => d.id));
  const sRuns = new Set(s.runs.map((r) => r.id));
  return b.runs.filter((r) => r.status !== 'abgebrochen' && !sRuns.has(r.id) && sDocs.has(r.documentId));
}

/** Was die Übernahme der Einheit am Bestand ändern würde. */
function einheitUnterschiede(b: Einheit, s: Einheit, vermerke: Map<string, Loeschvermerk>): string[] {
  const geloescht = (art: 'eintrag' | 'lauf', id: ID) => {
    const v = vermerke.get(`${art}:${id}`);
    return v ? ` (im Bestand gelöscht am ${v.am.slice(8, 10)}.${v.am.slice(5, 7)}.${v.am.slice(0, 4)})` : '';
  };
  const u: string[] = [];
  const bDocs = new Map(b.docs.map((d) => [d.id, d]));
  for (const d of s.docs) {
    const alt = bDocs.get(d.id);
    if (!alt) u.push(`${eintragName(d)} nur in der Sicherung${geloescht('eintrag', d.id)}`);
    else {
      const felder = feldUnterschiede(formEintrag(alt), formEintrag(d));
      if (felder.length) u.push(`${d.id === s.oben.id ? DOCUMENT_KIND_LABEL[d.kind] : eintragName(d)}: ${felder.join(', ')}`);
    }
  }
  const bRuns = new Map(b.runs.map((r) => [r.id, r]));
  for (const r of s.runs) {
    const alt = bRuns.get(r.id);
    if (!alt) u.push(`${laufName(r)} nur in der Sicherung${geloescht('lauf', r.id)}`);
    else {
      const felder = laufUnterschiede(alt, r);
      if (felder.length) u.push(`${laufName(r)}: ${felder.join(', ')}`);
    }
  }
  for (const r of endendeLaeufe(b, s)) u.push(`${laufName(r)} nur im Bestand – endet als „durch Sicherung ersetzt“`);
  return u;
}

/* ------------------------------------------------------------------ */
/* Ermitteln                                                           */
/* ------------------------------------------------------------------ */

const schluessel = (art: ElementArt, id: ID) => `${art}:${id}`;

const ZIEL_ART: Record<VerweisZiel, ElementArt> = {
  projekt: 'projekt',
  funktion: 'funktion',
  kontakt: 'kontakt',
  eintrag: 'eintrag',
  workflow: 'workflow',
  emailVorlage: 'emailVorlage',
  gewerk: 'gewerk',
};

const LOESCH_ART: Record<ElementArt, Loeschvermerk['art']> = {
  gewerk: 'gewerk',
  standardFunktion: 'funktion',
  emailVorlage: 'emailVorlage',
  workflow: 'workflow',
  projekt: 'projekt',
  funktion: 'funktion',
  kontakt: 'kontakt',
  eintrag: 'eintrag',
};

interface Vorlage {
  art: ElementArt;
  id: ID;
  projectId: ID | null;
  bezeichnung: string;
  zusatz?: string;
  bestand: boolean;
  sicherung: boolean;
  unterschiede: string[];
  zuletztBestand: string | null;
  zuletztSicherung: string | null;
}

/** Interner Stand des Abgleichs: Ergebnis samt abgebildeter Sicherung (für die Übernahme). */
interface Ermittelt {
  abgleich: Abgleich;
  sicherung: AppData;
  zuordnung: Zuordnung;
  bEinheiten: Map<ID, Einheit>;
  sEinheiten: Map<ID, Einheit>;
}

function ermitteln(bestand: AppData, sicherungRoh: AppData, getrennt: ReadonlySet<ID>): Ermittelt {
  const z = zuordnen(bestand, sicherungRoh, getrennt);
  const s = abbilden(sicherungRoh, z);
  const vermerke = new Map<string, Loeschvermerk>();
  for (const v of bestand.geloescht ?? []) vermerke.set(`${v.art}:${v.id}`, v);

  const elemente: Record<string, AbgleichElement> = {};
  const element = (v: Vorlage, andereNummer = false): AbgleichElement => {
    const vermerk = !v.bestand && v.sicherung ? (vermerke.get(`${LOESCH_ART[v.art]}:${v.id}`) ?? null) : null;
    const zustand: AbgleichZustand = !v.bestand
      ? vermerk
        ? 'geloescht'
        : 'neu'
      : !v.sicherung
        ? 'nur_bestand'
        : v.unterschiede.length
          ? 'geaendert'
          : 'gleich';
    const waehlbar = zustand === 'neu' || zustand === 'geaendert' || zustand === 'geloescht';
    const e: AbgleichElement = {
      schluessel: schluessel(v.art, v.id),
      art: v.art,
      id: v.id,
      projectId: v.projectId,
      bezeichnung: v.bezeichnung,
      zusatz: v.zusatz ?? '',
      zustand,
      geloescht: vermerk,
      zuletztBestand: v.zuletztBestand,
      zuletztSicherung: v.zuletztSicherung,
      unterschiede: v.unterschiede,
      hinweise: [],
      vermutlichDasselbe: null,
      waehlbar,
      // Neue Elemente sind vorbelegt – außer in einem Projekt, das vermutlich ein anderes ist
      vorbelegt: zustand === 'neu' && !andereNummer,
      abhaengigkeiten: [],
    };
    elemente[e.schluessel] = e;
    return e;
  };

  /** Elemente einer Liste nach Kennung. */
  function liste<T extends { id: ID }>(
    art: ElementArt,
    b: T[],
    sl: T[],
    form: (x: T) => Record<string, unknown>,
    name: (x: T) => string,
    projectId: (x: T) => ID | null,
    andereNummer = false,
    zuletzt: (x: T) => string | null = (x) => (x as { geaendertAm?: string }).geaendertAm ?? null,
  ): AbgleichElement[] {
    const bNachId = new Map(b.map((x) => [x.id, x]));
    const sNachId = new Map(sl.map((x) => [x.id, x]));
    const ids = [...new Set([...b.map((x) => x.id), ...sl.map((x) => x.id)])];
    return ids
      .map((id) => {
        const alt = bNachId.get(id);
        const neu = sNachId.get(id);
        const x = (neu ?? alt)!;
        return element(
          {
            art,
            id,
            projectId: projectId(x),
            bezeichnung: name(x),
            bestand: !!alt,
            sicherung: !!neu,
            unterschiede: alt && neu ? feldUnterschiede(form(alt), form(neu)) : [],
            zuletztBestand: alt ? zuletzt(alt) : null,
            zuletztSicherung: neu ? zuletzt(neu) : null,
          },
          andereNummer,
        );
      })
      .sort((a, c) => a.bezeichnung.localeCompare(c.bezeichnung, 'de'));
  }

  // Übergreifend
  const gewerkeListe = (g: string[]) => g.map((name) => ({ id: name }));
  const global: AbgleichGruppe[] = [
    {
      titel: 'Gewerke',
      elemente: liste(
        'gewerk',
        gewerkeListe(bestand.gewerke),
        gewerkeListe(s.gewerke),
        () => ({}),
        (x) => x.id,
        () => null,
      ),
    },
    {
      titel: 'Funktionen',
      elemente: liste('standardFunktion', bestand.standardRollen, s.standardRollen, formFunktion, funktionsName, () => null),
    },
    {
      titel: 'E-Mail-Vorlagen',
      elemente: liste(
        'emailVorlage',
        bestand.emailVorlagen,
        s.emailVorlagen,
        formVorlage,
        (t) => t.name,
        () => null,
      ),
    },
    {
      titel: 'Workflows',
      elemente: liste(
        'workflow',
        bestand.templates.filter((t) => t.projectId === null),
        s.templates.filter((t) => t.projectId === null),
        formWorkflow,
        (t) => t.name,
        () => null,
      ),
    },
  ];
  for (const e of global[1].elemente) {
    const roh = sicherungRoh.standardRollen.find((r) => z.standard.get(r.id) === e.id && r.id !== e.id);
    if (roh && e.zustand !== 'nur_bestand') e.hinweise.push('über Name und Gewerk zugeordnet');
  }

  // Je Projekt
  const bEinheiten = einheitenVon(bestand);
  const sEinheiten = einheitenVon(s);
  const projektIds = [...new Set([...bestand.projects.map((p) => p.id), ...s.projects.map((p) => p.id)])];
  const projekte: AbgleichProjekt[] = [];
  for (const pid of projektIds) {
    const bp = bestand.projects.find((p) => p.id === pid);
    const sp = s.projects.find((p) => p.id === pid);
    const p = (sp ?? bp)!;
    const andere = !!bp && !!sp && norm(bp.nummer) !== norm(sp.nummer);
    const projekt = element(
      {
        art: 'projekt',
        id: pid,
        projectId: pid,
        bezeichnung: [p.nummer, p.name].filter(Boolean).join(' '),
        zusatz: 'Projektdaten',
        bestand: !!bp,
        sicherung: !!sp,
        unterschiede: bp && sp ? feldUnterschiede(formProjekt(bp), formProjekt(sp)) : [],
        zuletztBestand: bp?.geaendertAm ?? null,
        zuletztSicherung: sp?.geaendertAm ?? null,
      },
      andere,
    );
    const eintrag: AbgleichProjekt = {
      projectId: pid,
      bezeichnung: projekt.bezeichnung,
      projekt,
      andereNummer: andere ? { bestand: bp!.nummer, sicherung: sp!.nummer } : null,
      gruppen: [],
    };
    projekte.push(eintrag);
    if (!sp) continue; // Nur im Bestand: bleibt unverändert

    const imProjekt = <T extends { projectId: ID | null }>(x: T) => x.projectId === pid;
    const funktionen = liste(
      'funktion',
      bestand.roles.filter(imProjekt),
      s.roles.filter(imProjekt),
      formFunktion,
      funktionsName,
      () => pid,
      andere,
    );
    for (const e of funktionen) {
      if (e.zustand !== 'nur_bestand' && sicherungRoh.roles.some((r) => r.id !== e.id && z.funktion.get(r.id) === e.id)) {
        e.hinweise.push('über Name und Gewerk zugeordnet');
      }
    }
    const kontakte = liste(
      'kontakt',
      bestand.contacts.filter((c) => imProjekt(c) && !c.eigen),
      s.contacts.filter(imProjekt),
      formKontakt,
      (c) => [kontaktName(c), c.vorname || c.nachname ? c.firma : ''].filter(Boolean).join(', ') || 'Ohne Namen',
      () => pid,
      andere,
    );
    const workflows = liste(
      'workflow',
      bestand.templates.filter(imProjekt),
      s.templates.filter(imProjekt),
      formWorkflow,
      (t) => t.name,
      () => pid,
      andere,
    );

    // Eintragseinheiten
    const obenIds = [
      ...new Set([
        ...[...bEinheiten.values()].filter((e) => e.oben.projectId === pid).map((e) => e.oben.id),
        ...[...sEinheiten.values()].filter((e) => e.oben.projectId === pid).map((e) => e.oben.id),
      ]),
    ];
    const eintraege = obenIds
      .map((id) => {
        const be = bEinheiten.get(id);
        const se = sEinheiten.get(id);
        const e = element(
          {
            art: 'eintrag',
            id,
            projectId: pid,
            bezeichnung: eintragName((se ?? be)!.oben),
            zusatz: einheitZusatz((se ?? be)!),
            bestand: !!be,
            sicherung: !!se,
            unterschiede: be && se ? einheitUnterschiede(be, se, vermerke) : [],
            zuletztBestand: einheitZuletzt(be),
            zuletztSicherung: einheitZuletzt(se),
          },
          andere,
        );
        if (be && se) {
          const enden = endendeLaeufe(be, se).length;
          if (enden && e.waehlbar) {
            e.hinweise.push(
              `Bei Übernahme ${enden === 1 ? 'endet 1 Planlauf' : `enden ${enden} Planläufe`} des Bestands als „durch Sicherung ersetzt“.`,
            );
          }
        }
        // Vermutlich dasselbe: zusammengeführt (Kennung des Bestands) oder getrennt (Kennung der Sicherung)
        const sid = z.vermutlich.get(id);
        if (sid !== undefined && !getrennt.has(sid)) {
          e.vermutlichDasselbe = {
            sicherungId: sid,
            bestandId: id,
            bestandBezeichnung: be ? eintragName(be.oben) : e.bezeichnung,
            getrennt: false,
          };
          e.vorbelegt = false;
          e.hinweise.push('Vermutlich derselbe Eintrag wie im Bestand – gleiche Codierung, andere Kennung.');
        }
        for (const [bid, sidG] of z.vermutlich) {
          if (sidG === id && getrennt.has(sidG)) {
            const bOben = bEinheiten.get(bid)?.oben;
            const bezeichnung = bOben ? eintragName(bOben) : e.bezeichnung;
            e.vermutlichDasselbe = { sicherungId: id, bestandId: bid, bestandBezeichnung: bezeichnung, getrennt: true };
          }
        }
        return e;
      })
      .sort((a, c) => a.bezeichnung.localeCompare(c.bezeichnung, 'de'));

    eintrag.gruppen = [
      { titel: 'Funktionen', elemente: funktionen },
      { titel: 'Kontakte', elemente: kontakte },
      { titel: 'Workflows', elemente: workflows },
      { titel: 'Einträge', elemente: eintraege },
    ];
  }

  // Abhängigkeiten aus der Tabelle der Verweisfelder
  const sEinheitVonDoc = new Map<ID, ID>();
  for (const [id, e] of sEinheiten) for (const d of e.docs) sEinheitVonDoc.set(d.id, id);
  const zielSchluessel = (ziel: VerweisZiel, id: ID) =>
    schluessel(ZIEL_ART[ziel], ziel === 'eintrag' ? (sEinheitVonDoc.get(id) ?? id) : id);
  function verweise<T>(e: AbgleichElement, felder: Verweisfeld<T>[], objekte: T[]) {
    for (const o of objekte) {
      for (const f of felder) {
        // „leeren“: fehlt das Ziel, wird der Verweis geleert – keine Abhängigkeit
        if (f.regel === 'leeren') continue;
        for (const wert of f.werte(o)) {
          if (!wert) continue;
          const k = zielSchluessel(f.ziel, wert);
          const ziel = elemente[k];
          if (!ziel || ziel === e) continue;
          if (ziel.zustand === 'neu' || (ziel.zustand === 'geloescht' && f.regel === 'pflicht')) {
            if (!e.abhaengigkeiten.includes(k)) e.abhaengigkeiten.push(k);
          }
        }
      }
    }
  }
  for (const e of Object.values(elemente)) {
    if (e.zustand === 'nur_bestand' || e.zustand === 'gleich') continue;
    if (e.art === 'standardFunktion')
      verweise(
        e,
        VERWEISFELDER.standardFunktion,
        s.standardRollen.filter((r) => r.id === e.id),
      );
    if (e.art === 'funktion')
      verweise(
        e,
        VERWEISFELDER.funktion,
        s.roles.filter((r) => r.id === e.id),
      );
    if (e.art === 'kontakt')
      verweise(
        e,
        VERWEISFELDER.kontakt,
        s.contacts.filter((c) => c.id === e.id),
      );
    if (e.art === 'workflow')
      verweise(
        e,
        VERWEISFELDER.workflow,
        s.templates.filter((t) => t.id === e.id),
      );
    if (e.art === 'eintrag') {
      const einheit = sEinheiten.get(e.id);
      if (!einheit) continue;
      verweise(e, VERWEISFELDER.eintrag, einheit.docs);
      verweise(e, VERWEISFELDER.lauf, einheit.runs);
    }
  }

  const unterschiede = Object.values(elemente).filter((e) => e.waehlbar).length;
  return {
    abgleich: { global, projekte, elemente, unterschiede },
    sicherung: s,
    zuordnung: z,
    bEinheiten,
    sEinheiten,
  };
}

/**
 * Vergleicht den Bestand mit einer Sicherung. `getrennt`: Einträge der
 * Sicherung (Kennung), die trotz gleicher Codierung nicht mit dem Eintrag im
 * Bestand zusammengeführt werden.
 */
export function abgleichErmitteln(bestand: AppData, sicherung: AppData, getrennt: ID[] = []): Abgleich {
  return ermitteln(bestand, sicherung, new Set(getrennt)).abgleich;
}

/** Vorbelegte Auswahl eines Abgleichs. */
export function vorbelegung(abgleich: Abgleich): string[] {
  return Object.values(abgleich.elemente)
    .filter((e) => e.waehlbar && e.vorbelegt)
    .map((e) => e.schluessel);
}

/** Die Auswahl samt aller Abhängigkeiten (nur wählbare Elemente). */
export function mitAbhaengigkeiten(abgleich: Abgleich, gewaehlt: Iterable<string>): Set<string> {
  const ergebnis = new Set<string>();
  const offen = [...gewaehlt];
  while (offen.length) {
    const k = offen.pop()!;
    const e = abgleich.elemente[k];
    if (!e || !e.waehlbar || ergebnis.has(k)) continue;
    ergebnis.add(k);
    offen.push(...e.abhaengigkeiten);
  }
  return ergebnis;
}

/* ------------------------------------------------------------------ */
/* Übernehmen                                                          */
/* ------------------------------------------------------------------ */

interface Vermerk {
  zeitpunkt: string;
  bearbeiter: string;
  heute: ISODate;
  quelle: string;
}

const protokollEintrag = (v: Vermerk, text: string): ProtokollEintrag => ({
  zeitpunkt: v.zeitpunkt,
  bearbeiter: v.bearbeiter,
  stepId: null,
  text,
  quelle: 'import',
});

function vereinigen<T>(vorne: T[], hinten: T[], schl: (x: T) => string): T[] {
  const da = new Set(vorne.map(schl));
  return [...vorne, ...hinten.filter((x) => !da.has(schl(x)))];
}

/**
 * Lauf gleicher Kennung: Stand aus der Sicherung; Protokoll, frühere
 * Durchläufe und Erinnerungen beider Seiten vereinigt.
 */
export function laufVereinigen(bestand: PlanRun, sicherung: PlanRun): PlanRun {
  const protokoll = vereinigen(sicherung.protokoll, bestand.protokoll, (p) => `${p.zeitpunkt}|${p.stepId ?? ''}|${p.text}`).sort(
    (a, b) => (a.zeitpunkt < b.zeitpunkt ? -1 : a.zeitpunkt > b.zeitpunkt ? 1 : 0),
  );
  const bSchritte = new Map(bestand.steps.map((s) => [s.id, s]));
  const steps = sicherung.steps.map((st) => {
    const bt = bSchritte.get(st.id);
    if (!bt) return st;
    // Frühere Durchläufe nur ergänzen, wenn sie vor dem Durchlauf der Sicherung liegen
    const historie = vereinigen(
      st.historie,
      bt.historie.filter((h) => h.durchlauf < st.durchlauf),
      (h) => `${h.durchlauf}|${h.blockDurchgang}`,
    ).sort((a, b) => a.durchlauf - b.durchlauf || a.blockDurchgang - b.blockDurchgang);
    const erinnerungen = vereinigen(st.erinnerungen, bt.erinnerungen, erinnerungSchluessel).sort((a, b) =>
      a.zeitpunkt < b.zeitpunkt ? -1 : a.zeitpunkt > b.zeitpunkt ? 1 : 0,
    );
    const letzte = juengster([st.letzteErinnerung, bt.letzteErinnerung, ...erinnerungen.map((e) => e.zeitpunkt)]);
    return { ...st, historie, erinnerungen, letzteErinnerung: letzte };
  });
  return { ...sicherung, protokoll, steps };
}

const laufGleich = (b: PlanRun, s: PlanRun) => laufUnterschiede(b, s).length === 0;

function laufBeenden(r: PlanRun, v: Vermerk): PlanRun {
  return {
    ...r,
    status: 'abgebrochen',
    abbruchArt: 'aus_sicherung',
    abbruchGrund: `Durch den Stand der ${v.quelle} ersetzt`,
    abbruchDatum: v.heute,
    abbruchNeuerIndex: null,
    protokoll: [...r.protokoll, protokollEintrag(v, `Beendet – durch den Stand der ${v.quelle} ersetzt`)],
  };
}

/** Übernimmt eine Eintragseinheit samt ihrer Läufe aus der (abgebildeten) Sicherung. */
function einheitUebernehmen(d: AppData, b: Einheit | undefined, s: Einheit, v: Vermerk): { daten: AppData; beendet: number } {
  const sDocIds = new Set(s.docs.map((x) => x.id));
  const documents = einsetzen(d.documents, s.docs);
  const vorher = new Map(d.runs.map((r) => [r.id, r]));
  const neueLaeufe = s.runs.map((r) => {
    const alt = vorher.get(r.id);
    if (alt && laufGleich(alt, r)) return alt;
    const lauf = alt ? laufVereinigen(alt, r) : r;
    return { ...lauf, protokoll: [...lauf.protokoll, protokollEintrag(v, `Aus ${v.quelle} übernommen`)] };
  });
  let runs = einsetzen(d.runs, neueLaeufe);

  // Läufe der Einheit, die nur im Bestand stehen
  const sRunIds = new Set(s.runs.map((r) => r.id));
  const einheitDocs = new Set([...sDocIds, ...(b?.docs.map((x) => x.id) ?? [])]);
  let beendet = 0;
  runs = runs.map((r) => {
    if (sRunIds.has(r.id) || !einheitDocs.has(r.documentId) || r.status === 'abgebrochen') return r;
    if (!sDocIds.has(r.documentId)) {
      // Eintrag nur im Bestand: der Lauf bleibt, solange er der einzige eigenständige ist
      const doc = documents.find((x) => x.id === r.documentId);
      const allein = !runs.some((x) => x.id !== r.id && x.documentId === r.documentId && x.status !== 'abgebrochen');
      if (doc && hatEigenenPlanlauf(doc, documents) && allein) return r;
    }
    beendet++;
    return laufBeenden(r, v);
  });
  return { daten: { ...d, documents, runs }, beendet };
}

/** Übernimmt ein Projekt der Sicherung samt Inhalt mit neuen Kennungen. */
function projektKopieren(d: AppData, sicherung: AppData, pid: ID, neueId: (prefix: string) => ID, v: Vermerk): AppData {
  const p = sicherung.projects.find((x) => x.id === pid);
  if (!p) return d;
  const ids = new Map<ID, ID>();
  const neu = (alt: ID, prefix: string) => {
    const id = neueId(prefix);
    ids.set(alt, id);
    return id;
  };
  const projektId = neueId('prj');
  const imProjekt = <T extends { projectId: ID | null }>(x: T) => x.projectId === pid;
  const roles = sicherung.roles.filter(imProjekt).map((r) => ({ ...r, id: neu(r.id, 'rol'), projectId: projektId }));
  const contacts = sicherung.contacts
    .filter((c) => imProjekt(c) && !c.eigen)
    .map((c) => ({ ...c, id: neu(c.id, 'con'), projectId: projektId }))
    .map((c) => ({ ...c, zuordnungen: c.zuordnungen.map((z) => ({ ...z, roleId: ids.get(z.roleId) ?? z.roleId })) }));
  const templates = sicherung.templates.filter(imProjekt).map((t) => ({ ...t, id: neu(t.id, 'tpl'), projectId: projektId }));
  const docs = sicherung.documents.filter(imProjekt);
  for (const x of docs) neu(x.id, 'doc');
  const documents = docs.map((x) => ({
    ...x,
    id: ids.get(x.id)!,
    projectId: projektId,
    parentId: x.parentId ? (ids.get(x.parentId) ?? null) : null,
    paketId: x.paketId ? (ids.get(x.paketId) ?? null) : null,
  }));
  // Eigene und unbekannte Kontakte: ohne Verweis (der Name bleibt in Historie und Erinnerungen)
  const kontakt = (id: ID | null) => (id === null ? null : (ids.get(id) ?? null));
  const runs = sicherung.runs.filter(imProjekt).map((r) => ({
    ...r,
    id: neueId('run'),
    projectId: projektId,
    documentId: ids.get(r.documentId) ?? r.documentId,
    templateId: r.templateId ? (ids.get(r.templateId) ?? r.templateId) : null,
    steps: r.steps.map((s) => ({
      ...s,
      contactId: kontakt(s.contactId),
      historie: s.historie.map((h) => ({ ...h, contactId: kontakt(h.contactId) })),
      erinnerungen: s.erinnerungen.map((e) => ({ ...e, contactId: kontakt(e.contactId) })),
    })),
    protokoll: [...r.protokoll, protokollEintrag(v, `Aus ${v.quelle} übernommen (als Kopie des Projekts)`)],
  }));
  return {
    ...d,
    projects: [...d.projects, { ...p, id: projektId }],
    roles: [...d.roles, ...roles],
    contacts: [...d.contacts, ...contacts],
    templates: [...d.templates, ...templates],
    documents: [...d.documents, ...documents],
    runs: [...d.runs, ...runs],
  };
}

/** Verweise ohne Ziel leeren (Regel „leeren“/„mitnehmen“) und fehlende Gewerke ergänzen. */
function verweiseBereinigen(d: AppData, beruehrteLaeufe: ReadonlySet<ID>): AppData {
  const vorlagen = new Set(d.emailVorlagen.map((x) => x.id));
  const workflows = new Set(d.templates.map((x) => x.id));
  const docs = new Set(d.documents.map((x) => x.id));
  const kontakte = new Set(d.contacts.map((x) => x.id));
  const rollen = new Set(d.roles.map((x) => x.id));
  const mail = <T extends { mailVorlageId: ID | null }>(s: T): T =>
    s.mailVorlageId && !vorlagen.has(s.mailVorlageId) ? { ...s, mailVorlageId: null } : s;

  const templates = d.templates.map((t) =>
    t.steps.some((s) => s.mailVorlageId && !vorlagen.has(s.mailVorlageId)) ? { ...t, steps: t.steps.map(mail) } : t,
  );
  const runs = d.runs.map((r) => {
    if (!beruehrteLaeufe.has(r.id)) return r;
    const offen = (s: PlanRun['steps'][number]) => s.status === 'offen' || s.status === 'laufend';
    const steps = r.steps.map((s) => {
      let x = mail(s);
      // Offene Schritte ohne Ziel: die Zuständigkeit zieht der Store aus der Besetzung nach
      if (x.contactId && !kontakte.has(x.contactId) && offen(x)) x = { ...x, contactId: null, contactManuell: false };
      return x;
    });
    const templateId = r.templateId && !workflows.has(r.templateId) ? null : r.templateId;
    return steps.some((s, i) => s !== r.steps[i]) || templateId !== r.templateId ? { ...r, steps, templateId } : r;
  });
  const documents = d.documents.map((x) => (x.paketId && !docs.has(x.paketId) ? { ...x, paketId: null } : x));
  const contacts = d.contacts.map((c) =>
    c.zuordnungen.some((z) => !rollen.has(z.roleId))
      ? { ...c, zuordnungen: c.zuordnungen.filter((z) => rollen.has(z.roleId)) }
      : c,
  );
  const genutzt = [
    ...d.roles.map((r) => r.gewerk),
    ...d.standardRollen.map((r) => r.gewerk),
    ...contacts.flatMap((c) => c.zuordnungen.map((z) => z.gewerk)),
    ...documents.map((x) => x.gewerk),
  ].filter((g): g is string => !!g && g.trim() !== '');
  const fehlend = [...new Set(genutzt)].filter((g) => !d.gewerke.includes(g));
  return {
    ...d,
    templates,
    runs,
    documents,
    contacts,
    gewerke: fehlend.length ? [...d.gewerke, ...fehlend] : d.gewerke,
  };
}

/**
 * Verstöße gegen die Konsistenz: fehlende Verweise und mehr als ein nicht
 * abgebrochener Lauf je Eintrag mit eigenem Planlauf bzw. ein laufender Lauf
 * an einem mitlaufenden Plan.
 */
export function konsistenzVerstoesse(d: AppData): string[] {
  const fehler: string[] = [];
  const projekte = new Set(d.projects.map((p) => p.id));
  const docs = new Map(d.documents.map((x) => [x.id, x]));
  const rollen = new Set(d.roles.map((r) => r.id));
  for (const r of d.roles) if (!projekte.has(r.projectId)) fehler.push(`Funktion „${funktionsName(r)}“: Projekt fehlt`);
  for (const c of d.contacts) {
    if (!projekte.has(c.projectId)) fehler.push(`Kontakt „${kontaktName(c)}“: Projekt fehlt`);
    if (c.zuordnungen.some((z) => !rollen.has(z.roleId))) fehler.push(`Kontakt „${kontaktName(c)}“: Funktion fehlt`);
  }
  for (const t of d.templates) if (t.projectId && !projekte.has(t.projectId)) fehler.push(`Workflow „${t.name}“: Projekt fehlt`);
  for (const x of d.documents) {
    if (!projekte.has(x.projectId)) fehler.push(`${eintragName(x)}: Projekt fehlt`);
    if (x.parentId && docs.get(x.parentId)?.kind !== 'verzeichnis') fehler.push(`${eintragName(x)}: Planverzeichnis fehlt`);
    if (x.paketId && docs.get(x.paketId)?.kind !== 'paket') fehler.push(`${eintragName(x)}: Planpaket fehlt`);
  }
  const laeufeJeEintrag = new Map<ID, PlanRun[]>();
  for (const r of d.runs) {
    if (!projekte.has(r.projectId)) fehler.push(`${laufName(r)}: Projekt fehlt`);
    if (!docs.has(r.documentId)) fehler.push(`${laufName(r)}: Eintrag fehlt`);
    if (r.status !== 'abgebrochen') laeufeJeEintrag.set(r.documentId, [...(laeufeJeEintrag.get(r.documentId) ?? []), r]);
  }
  for (const [id, laeufe] of laeufeJeEintrag) {
    const x = docs.get(id);
    if (!x) continue;
    if (hatEigenenPlanlauf(x, d.documents)) {
      if (laeufe.length > 1) fehler.push(`${eintragName(x)}: mehr als ein nicht abgebrochener Planlauf`);
    } else if (laeufe.some((r) => r.status === 'laufend')) {
      fehler.push(`${eintragName(x)}: laufender Planlauf, obwohl der Eintrag keinen eigenen Planlauf hat`);
    }
  }
  return fehler;
}

/**
 * Übernimmt die gewählten Elemente der Sicherung in den Bestand. Liefert bei
 * einem Verstoß gegen die Konsistenz (nur neue Verstöße zählen) nichts
 * Übernommenes, sondern die Meldungen.
 */
export function abgleichAnwenden(
  bestand: AppData,
  sicherungRoh: AppData,
  auswahl: AbgleichAuswahl,
  neueId: (prefix: string) => ID,
): AbgleichErgebnis {
  const kopien = new Set(auswahl.kopien ?? []);
  const { abgleich, sicherung: s, bEinheiten, sEinheiten } = ermitteln(bestand, sicherungRoh, new Set(auswahl.getrennt ?? []));
  const v: Vermerk = {
    zeitpunkt: auswahl.zeitpunkt,
    bearbeiter: auswahl.bearbeiter,
    heute: auswahl.heute,
    quelle: auswahl.quelle,
  };
  const ausKopie = (k: string) => {
    const e = abgleich.elemente[k];
    return !!e && e.projectId !== null && kopien.has(e.projectId);
  };
  const direkt = new Set(auswahl.elemente.filter((k) => abgleich.elemente[k]?.waehlbar && !ausKopie(k)));
  const gewaehlt = [...mitAbhaengigkeiten(abgleich, direkt)].filter((k) => !ausKopie(k));

  let d: AppData = { ...bestand, geloescht: bestand.geloescht ?? [] };
  const finde = <T extends { id: ID }>(liste: T[], id: ID) => liste.filter((x) => x.id === id);
  let beendet = 0;
  const beruehrteLaeufe = new Set<ID>();
  for (const k of gewaehlt) {
    const e = abgleich.elemente[k];
    switch (e.art) {
      case 'gewerk':
        if (!d.gewerke.includes(e.id)) d = { ...d, gewerke: [...d.gewerke, e.id] };
        break;
      case 'standardFunktion':
        d = { ...d, standardRollen: einsetzen(d.standardRollen, finde(s.standardRollen, e.id)) };
        break;
      case 'emailVorlage':
        d = { ...d, emailVorlagen: einsetzen(d.emailVorlagen, finde(s.emailVorlagen, e.id)) };
        break;
      case 'workflow':
        d = { ...d, templates: einsetzen(d.templates, finde(s.templates, e.id)) };
        break;
      case 'projekt': {
        // Die Markierung („meine Projekte“) bleibt eine Sache dieses Browsers
        const alt = bestand.projects.find((p) => p.id === e.id);
        const neu = finde(s.projects, e.id).map((p) => (alt ? { ...p, markiert: alt.markiert } : p));
        d = { ...d, projects: einsetzen(d.projects, neu) };
        break;
      }
      case 'funktion':
        d = { ...d, roles: einsetzen(d.roles, finde(s.roles, e.id)) };
        break;
      case 'kontakt':
        d = { ...d, contacts: einsetzen(d.contacts, finde(s.contacts, e.id)) };
        break;
      case 'eintrag': {
        const se = sEinheiten.get(e.id);
        if (!se) break;
        const r = einheitUebernehmen(d, bEinheiten.get(e.id), se, v);
        d = r.daten;
        beendet += r.beendet;
        for (const run of se.runs) beruehrteLaeufe.add(run.id);
        break;
      }
    }
  }
  for (const pid of kopien) {
    const vorher = new Set(d.runs.map((r) => r.id));
    d = projektKopieren(d, sicherungRoh, pid, neueId, v);
    for (const r of d.runs) if (!vorher.has(r.id)) beruehrteLaeufe.add(r.id);
  }
  d = verweiseBereinigen(d, beruehrteLaeufe);

  // Wieder vorhandene Elemente verlieren ihren Löschvermerk
  const vorhanden = new Set<string>([
    ...d.projects.map((x) => `projekt:${x.id}`),
    ...d.documents.map((x) => `eintrag:${x.id}`),
    ...d.runs.map((x) => `lauf:${x.id}`),
    ...d.contacts.map((x) => `kontakt:${x.id}`),
    ...d.roles.map((x) => `funktion:${x.id}`),
    ...d.standardRollen.map((x) => `funktion:${x.id}`),
    ...d.templates.map((x) => `workflow:${x.id}`),
    ...d.gewerke.map((x) => `gewerk:${x}`),
    ...d.emailVorlagen.map((x) => `emailVorlage:${x.id}`),
  ]);
  if (d.geloescht.some((x) => vorhanden.has(`${x.art}:${x.id}`))) {
    d = { ...d, geloescht: d.geloescht.filter((x) => !vorhanden.has(`${x.art}:${x.id}`)) };
  }

  // Konsistenz: nur Verstöße, die der Abgleich neu hervorbringt
  const vorher = new Set(konsistenzVerstoesse(bestand));
  const fehler = [...new Set(konsistenzVerstoesse(d).filter((f) => !vorher.has(f)))];
  if (fehler.length) return { ok: false, fehler };
  return {
    ok: true,
    daten: d,
    uebernommen: gewaehlt.filter((k) => direkt.has(k)).length,
    mitgenommen: gewaehlt.filter((k) => !direkt.has(k)).length,
    kopien: [...kopien].filter((pid) => sicherungRoh.projects.some((p) => p.id === pid)).length,
    beendet,
  };
}
