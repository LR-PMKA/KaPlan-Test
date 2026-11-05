/**
 * Workflows der baubetrieblichen Anmeldungen. Mitgeliefert wird je Phase ein
 * Standard-Workflow nach der Tabelle „Ausprägung Merkmal Status Workflow“ des
 * Lastenhefts: SKM, MKM, KM (n-2 & n-1) und KKM (unterjährig) – im Lastenheft
 * SKM, PzE, Vorprozess N-x und unterjährige Anmeldung. Die
 * Workflows lassen sich unter „Workflows“ anpassen, duplizieren und ergänzen.
 *
 * Der Workflow bildet bewusst nicht den Genehmigungs- und Eskalationsprozess
 * 1:1 ab, und die einzelnen Schreibtische einer Änderungsabstimmung werden nicht
 * verfolgt. Neu angelegt wird immer im ersten Status eines Workflows.
 */
import {
  LOESCHEN,
  MASSNAHMENARTEN,
  PHASE_LABEL,
  type AnmeldungsArt,
  type Phase,
  type FristRegel,
  type ID,
  type RilBezug,
  type StatusArt,
  type Anmeldung,
  type Projekt,
  type StatusZiel,
  type Workflow,
  type WorkflowStatus,
  type Zustaendigkeit,
  ZUSTAENDIGKEIT_LABEL,
} from './types';

/* ------------------------------------------------------------------ */
/* Mitgelieferte Workflows                                             */
/* ------------------------------------------------------------------ */

const ril = (bezug: RilBezug, versatzTage = 0): FristRegel => ({ typ: 'ril', bezug, versatzTage });
const keine: FristRegel = { typ: 'keine' };

/** Nachhak-Termin der mitgelieferten Status („Nachhak-Termin!?“ im Lastenheft). */
export const NACHHAK_TAGE = 21;

/**
 * Zuständigkeit nach Art des Status – Vorgabe der mitgelieferten Status und
 * eigener Workflows älterer Bestände: MIC bereitet vor,
 * meldet an und führt nach Genehmigung oder Ablehnung weiter; während BBK-
 * Mitwirkung, Anmeldung und Änderungsabstimmung liegt der Ball bei der BBK.
 */
export const ZUSTAENDIG_NACH_ART: Record<StatusArt, Zustaendigkeit | null> = {
  entwurf: 'mic',
  abstimmung: 'bbk',
  angemeldet: 'bbk',
  verspaetet: 'bbk',
  genehmigt: 'mic',
  abgelehnt: 'mic',
  aenderung: 'bbk',
  leiche: null,
};

const status = (
  id: ID,
  name: string,
  art: StatusArt,
  frist: FristRegel,
  nachfolger: StatusZiel[],
  zusatz: Partial<Pick<WorkflowStatus, 'nachhaken' | 'bemerkung' | 'zustaendig'>> = {},
): WorkflowStatus => ({
  id,
  name,
  art,
  zustaendig: zusatz.zustaendig !== undefined ? zusatz.zustaendig : ZUSTAENDIG_NACH_ART[art],
  frist,
  nachfolger,
  nachhaken: zusatz.nachhaken ?? frist.typ === 'nachhaken',
  bemerkung: zusatz.bemerkung ?? '',
});

/**
 * Anmeldeleiche am Ende eines Standard-Workflows: Die Anmeldung bleibt rot
 * gekennzeichnet stehen und wird erst mit dem nächsten Schritt gelöscht.
 */
const anmeldeleiche = (id: ID): WorkflowStatus => status(id, 'Anmeldeleiche', 'leiche', keine, [LOESCHEN]);

/** Beschreibungen der Standard-Workflows KM und KKM (auch für die Migration). */
export const KM_BESCHREIBUNG =
  'Anmeldung im KM für N-2 bzw. N-1, tagesscharf, mit Mitwirkung der BBK. Es gilt die N-2-Frist, solange sie am Tag des Statuswechsels nicht verstrichen ist, sonst die N-1-Frist. Annahme: Anmeldungen im KM erfolgen immer fristgerecht.';
export const KKM_BESCHREIBUNG =
  'Anmeldung je Maßnahmenart (A, B(0), B(S), B, C, Container), tagesscharf, mit Mitwirkung der BBK.';

/**
 * Die vier Standard-Workflows. Die Kennungen sind fest, damit ältere Stände
 * (Statusnummern V0 … Y9) zugeordnet werden können (`STATUS_AUS_NUMMER`) und
 * die Migration den Status „Anmeldeleiche“ dem passenden Workflow zuordnet.
 * `nachhakTage` ist der Abstand der Nachhak-Termine – die Migration übergibt
 * den Wert, der bisher in den Einstellungen für alle Status galt.
 */
export function standardWorkflows(nachhakTage: number = NACHHAK_TAGE): Workflow[] {
  const nachhakTermin = (): FristRegel => ({ typ: 'nachhaken', tage: nachhakTage });
  return [
    {
      id: 'wf-skm',
      name: 'SKM',
      kurz: 'SKM',
      beschreibung: 'Noch keine Anmeldung – Sammeleintrag nach Begriffen/tVE-Nr, Sperrzeitraum ganzes Fahrplanjahr.',
      herkunft: 'standard',
      bauzeitraum: 'fahrplanjahr',
      arten: ['SKM'],
      status: [
        status('skm-entwurf', 'Entwurf', 'entwurf', ril('skm'), ['skm-angemeldet', 'skm-anmeldeleiche']),
        status('skm-angemeldet', 'Angemeldet', 'angemeldet', { typ: 'stichtag', tag: 1, monat: 8 }, [
          'skm-genehmigt',
          'skm-abgelehnt',
        ], { nachhaken: true }),
        status('skm-genehmigt', 'Genehmigt', 'genehmigt', ril('mkm'), ['pze-entwurf']),
        status('skm-abgelehnt', 'Abgelehnt', 'abgelehnt', keine, ['skm-anmeldeleiche', 'skm-entwurf', 'pze-entwurf']),
        anmeldeleiche('skm-anmeldeleiche'),
      ],
    },
    {
      id: 'wf-pze',
      name: PHASE_LABEL.mkm,
      kurz: 'MKM',
      beschreibung: 'Noch keine Anmeldung – Sammeleintrag nach Begriffen/tVE-Nr, Sperrzeitraum ganzes Fahrplanjahr.',
      herkunft: 'standard',
      bauzeitraum: 'fahrplanjahr',
      arten: ['MKM'],
      status: [
        status('pze-entwurf', 'Entwurf', 'entwurf', ril('mkm'), ['pze-angemeldet', 'pze-anmeldeleiche']),
        status('pze-angemeldet', 'Angemeldet', 'angemeldet', { typ: 'stichtag', tag: 31, monat: 7 }, [
          'pze-genehmigt',
          'pze-abgelehnt',
        ], { nachhaken: true }),
        status('pze-genehmigt', 'Genehmigt', 'genehmigt', ril('N-2'), ['vp-entwurf']),
        status('pze-abgelehnt', 'Abgelehnt', 'abgelehnt', keine, [
          'pze-anmeldeleiche',
          'skm-entwurf',
          'pze-entwurf',
          'vp-entwurf',
        ]),
        anmeldeleiche('pze-anmeldeleiche'),
      ],
    },
    {
      id: 'wf-vorprozess',
      name: PHASE_LABEL.km,
      kurz: 'KM',
      beschreibung: KM_BESCHREIBUNG,
      herkunft: 'standard',
      bauzeitraum: 'tagesscharf',
      arten: ['A'],
      status: [
        status('vp-entwurf', 'Entwurf', 'entwurf', ril('Nx', -14), ['vp-mitwirkung', 'vp-anmeldeleiche']),
        status('vp-mitwirkung', 'Mitwirkung BBK', 'abstimmung', ril('Nx', -2), ['vp-zugestimmt', 'vp-abgelehnt'], {
          nachhaken: true,
        }),
        status('vp-zugestimmt', 'Zugestimmt', 'abstimmung', ril('Nx'), ['vp-angemeldet'], { zustaendig: 'mic' }),
        status('vp-angemeldet', 'Angemeldet (fristgerecht)', 'angemeldet', nachhakTermin(), [
          'vp-genehmigt',
          'vp-abgelehnt',
        ]),
        status('vp-genehmigt', 'Genehmigt', 'genehmigt', ril('A'), ['vp-aenderung', 'vp-genehmigt', 'uj-angemeldet']),
        status('vp-aenderung', 'Änderung angemeldet', 'aenderung', nachhakTermin(), [
          'vp-genehmigt',
          'vp-aenderung-abgelehnt',
        ]),
        status('vp-aenderung-abgelehnt', 'Änderung abgelehnt', 'abgelehnt', ril('A'), ['vp-abgelehnt', 'vp-genehmigt']),
        status('vp-abgelehnt', 'Abgelehnt', 'abgelehnt', keine, [
          'vp-anmeldeleiche',
          'vp-entwurf',
          'pze-entwurf',
          'uj-entwurf',
        ]),
        anmeldeleiche('vp-anmeldeleiche'),
      ],
    },
    {
      id: 'wf-unterjahr',
      name: PHASE_LABEL.kkm,
      kurz: 'KKM',
      beschreibung: KKM_BESCHREIBUNG,
      herkunft: 'standard',
      bauzeitraum: 'tagesscharf',
      arten: [...MASSNAHMENARTEN],
      status: [
        status('uj-entwurf', 'Entwurf', 'entwurf', ril('X', -14), ['uj-mitwirkung', 'uj-anmeldeleiche']),
        status('uj-mitwirkung', 'Mitwirkung BBK', 'abstimmung', ril('X', -2), ['uj-zugestimmt', 'uj-abgelehnt'], {
          nachhaken: true,
        }),
        status('uj-zugestimmt', 'Zugestimmt', 'abstimmung', ril('X'), ['uj-angemeldet', 'uj-verspaetet'], {
          zustaendig: 'mic',
        }),
        status('uj-angemeldet', 'Angemeldet (fristgerecht)', 'angemeldet', nachhakTermin(), [
          'uj-genehmigt',
          'uj-abgelehnt',
        ]),
        status('uj-verspaetet', 'Angemeldet (verspätet)', 'verspaetet', nachhakTermin(), [
          'uj-genehmigt',
          'uj-abgelehnt',
        ]),
        status('uj-genehmigt', 'Genehmigt', 'genehmigt', keine, ['uj-abgelehnt', 'uj-aenderung']),
        status('uj-aenderung', 'Änderung angestoßen', 'aenderung', nachhakTermin(), [
          'uj-genehmigt',
          'uj-aenderung-abgelehnt',
        ]),
        status('uj-aenderung-abgelehnt', 'Änderung abgelehnt', 'abgelehnt', keine, ['uj-genehmigt'], {
          bemerkung: 'Ggf. cfPeDi',
        }),
        status('uj-abgelehnt', 'Abgelehnt', 'abgelehnt', keine, ['uj-genehmigt', 'uj-anmeldeleiche']),
        anmeldeleiche('uj-anmeldeleiche'),
      ],
    },
  ];
}

/**
 * Zuordnung der Statusnummern früherer Fassungen (V0 … Y9) zu den Status der
 * Standard-Workflows – für die Migration gespeicherter Stände.
 */
export const STATUS_AUS_NUMMER: Record<string, ID> = {
  V0: 'skm-entwurf',
  V2: 'skm-angemeldet',
  V3: 'skm-genehmigt',
  V4: 'skm-abgelehnt',
  W0: 'pze-entwurf',
  W2: 'pze-angemeldet',
  W3: 'pze-genehmigt',
  W4: 'pze-abgelehnt',
  X0: 'vp-entwurf',
  X2: 'vp-mitwirkung',
  X3: 'vp-zugestimmt',
  X4: 'vp-angemeldet',
  X5: 'vp-genehmigt',
  X6: 'vp-aenderung',
  X7: 'vp-aenderung-abgelehnt',
  X8: 'vp-abgelehnt',
  Y0: 'uj-entwurf',
  Y2: 'uj-mitwirkung',
  Y3: 'uj-zugestimmt',
  Y4: 'uj-angemeldet',
  Y5: 'uj-verspaetet',
  Y6: 'uj-genehmigt',
  Y7: 'uj-aenderung',
  Y8: 'uj-aenderung-abgelehnt',
  Y9: 'uj-abgelehnt',
};

/* ------------------------------------------------------------------ */
/* Nachschlagen                                                        */
/* ------------------------------------------------------------------ */

export interface StatusInfo {
  workflow: Workflow;
  status: WorkflowStatus;
  /** Position im Workflow (0 = Startstatus). */
  index: number;
}

export function statusInfo(workflows: Workflow[], statusId: ID | null): StatusInfo | null {
  if (!statusId) return null;
  for (const workflow of workflows) {
    const index = workflow.status.findIndex((s) => s.id === statusId);
    if (index >= 0) return { workflow, status: workflow.status[index], index };
  }
  return null;
}

/** Ersatz, falls ein Status fehlt (beschädigter Bestand): Status ohne Nachfolger und Frist. */
const UNBEKANNT_WORKFLOW: Workflow = {
  id: 'wf-unbekannt',
  name: 'Unbekannter Workflow',
  kurz: '?',
  beschreibung: '',
  herkunft: 'manuell',
  bauzeitraum: 'tagesscharf',
  arten: [],
  status: [],
};

/** Status einer Anmeldung; ein nicht (mehr) vorhandener Status erscheint als „unbekannt“. */
export function statusVon(workflows: Workflow[], statusId: ID): StatusInfo {
  return (
    statusInfo(workflows, statusId) ?? {
      workflow: UNBEKANNT_WORKFLOW,
      status: {
        id: statusId,
        name: 'Unbekannter Status',
        art: 'entwurf',
        zustaendig: null,
        frist: keine,
        nachhaken: false,
        bemerkung: '',
        nachfolger: [],
      },
      index: -1,
    }
  );
}

/** „MKM · Angemeldet“ */
export function statusText(info: Pick<StatusInfo, 'workflow' | 'status'>): string {
  return `${info.workflow.kurz || info.workflow.name} · ${info.status.name}`;
}

/** Text eines Wechselziels, z. B. für den Statusverlauf. */
export function zielText(workflows: Workflow[], ziel: StatusZiel): string {
  if (ziel === LOESCHEN) return 'Gelöscht';
  const info = statusInfo(workflows, ziel);
  return info ? statusText(info) : 'Unbekannter Status';
}

/** Nachfolger eines Status, soweit es sie (noch) gibt. */
export function nachfolgerVon(workflows: Workflow[], statusId: ID): StatusZiel[] {
  const info = statusInfo(workflows, statusId);
  if (!info) return [];
  return info.status.nachfolger.filter((z) => z === LOESCHEN || statusInfo(workflows, z) !== null);
}

/**
 * Der Wechsel führt in einen anderen Workflow – die Anmeldung wird in die neue
 * Phase übernommen. Fehlt einer der beiden Status (später aus dem Workflow
 * entfernt), gilt der Wechsel nicht als Übernahme.
 */
export function istUebernahme(workflows: Workflow[], von: ID, nach: StatusZiel): boolean {
  if (nach === LOESCHEN) return false;
  const ziel = statusInfo(workflows, nach);
  const herkunft = statusInfo(workflows, von);
  return !!ziel && !!herkunft && ziel.workflow.id !== herkunft.workflow.id;
}

/**
 * Die Anmeldung steht in einem Status der Art „Anmeldeleiche“: Sie ist
 * erledigt, deckt keinen Anmeldebedarf mehr ab und wartet aufs Löschen.
 */
export function istLeiche(workflows: Workflow[], statusId: ID | null): boolean {
  return statusInfo(workflows, statusId)?.status.art === 'leiche';
}

/**
 * Wer im Status zuständig ist, mit Namen, soweit bekannt: „BBK · Fr. Weber“,
 * „MIC · M. Muster“ – oder null, wenn der Status niemanden nennt.
 */
export function zustaendigText(
  s: Pick<WorkflowStatus, 'zustaendig'>,
  a: Pick<Anmeldung, 'bbk'>,
  p: Pick<Projekt, 'hauptbearbeiter' | 'projektleiter'> | undefined,
): string | null {
  if (!s.zustaendig) return null;
  const name =
    s.zustaendig === 'bbk' ? a.bbk : s.zustaendig === 'mic' ? p?.hauptbearbeiter : p?.projektleiter;
  const rolle = ZUSTAENDIGKEIT_LABEL[s.zustaendig];
  return name?.trim() ? `${rolle} · ${name.trim()}` : rolle;
}

/** Im SKM führt der Vorhabenname, sonst die Nummer (Anmelde-ID bzw. tVE-Nr). */
export function vorhabenFuehrend(a: Pick<Anmeldung, 'art'>): boolean {
  return a.art === 'SKM';
}

/** Welches Feld eine Anmeldung bezeichnet: im SKM der Vorhabenname, sonst die Nummer. */
export function titelFeld(a: Pick<Anmeldung, 'art' | 'vorhaben' | 'anmeldeId'>): 'vorhaben' | 'anmeldeId' | null {
  if (vorhabenFuehrend(a) && a.vorhaben.trim()) return 'vorhaben';
  if (a.anmeldeId.trim()) return 'anmeldeId';
  if (a.vorhaben.trim()) return 'vorhaben';
  return null;
}

/** Bezeichnung einer Anmeldung in Listen und Köpfen – ohne Nummer „ohne ID“. */
export function anmeldungTitel(a: Pick<Anmeldung, 'art' | 'vorhaben' | 'anmeldeId'>): string {
  const feld = titelFeld(a);
  return feld ? a[feld].trim() : 'ohne ID';
}

/** Bezeichnung für Rückfragen und Vermerke – ohne Nummer notfalls das Gewerk. */
export function anmeldungBezeichnung(a: Pick<Anmeldung, 'art' | 'vorhaben' | 'anmeldeId' | 'gewerk'>): string {
  return titelFeld(a) ? anmeldungTitel(a) : a.gewerk.trim() || 'ohne ID';
}

/** Während einer Änderungsabstimmung sind ÄAbst-Nr und AnnexVII relevant. */
export function istAenderung(workflows: Workflow[], statusId: ID | null): boolean {
  return statusInfo(workflows, statusId)?.status.art === 'aenderung';
}

/** Workflow, dessen Maßnahmenarten die Art enthalten – etwa für die Neuanlage aus dem Anmeldebedarf. */
export function workflowFuerArt(workflows: Workflow[], art: AnmeldungsArt): Workflow | undefined {
  return workflows.find((w) => w.status.length > 0 && w.arten.includes(art));
}

/** Feste IDs der Standard-Workflows je Phase. */
export const STANDARD_WORKFLOW_ID: Record<Phase, ID> = {
  skm: 'wf-skm',
  mkm: 'wf-pze',
  km: 'wf-vorprozess',
  kkm: 'wf-unterjahr',
};

/** Workflow, in dem „Neue Anmeldung“ ohne Vorgabe anlegt: KKM (unterjährig). */
export const NEUANLAGE_WORKFLOW = STANDARD_WORKFLOW_ID.kkm;

/** Workflows, in denen neu angelegt werden kann – jeder mit mindestens einem Status. */
export function startbareWorkflows(workflows: Workflow[]): Workflow[] {
  return workflows.filter((w) => w.status.length > 0);
}
