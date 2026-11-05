/**
 * Pflege der Workflows: speichern, duplizieren, löschen. Reine Funktionen –
 * der Store ruft sie in `mutate()` auf, der Editor nutzt die Prüfungen vorab.
 *
 * Anmeldungen verweisen auf den Status, in dem sie stehen. Ein Status, in dem
 * noch Anmeldungen stehen, darf deshalb nicht entfallen; Nachfolger, die auf
 * einen entfallenen Status zeigen, werden in allen Workflows entfernt.
 */
import { LOESCHEN, type BaubetriebDaten, type ID, type Workflow, type WorkflowStatus } from './types';

/** Zahl der Anmeldungen je Status. */
export function anmeldungenJeStatus(d: Pick<BaubetriebDaten, 'anmeldungen'>): Map<ID, number> {
  const zahl = new Map<ID, number>();
  for (const a of d.anmeldungen) zahl.set(a.statusId, (zahl.get(a.statusId) ?? 0) + 1);
  return zahl;
}

/**
 * Status, die beim Speichern bzw. Löschen entfielen, obwohl noch Anmeldungen
 * in ihnen stehen.
 */
export function belegteEntfallendeStatus(
  d: Pick<BaubetriebDaten, 'anmeldungen' | 'workflows'>,
  workflowId: ID,
  bleibende: ID[],
): { status: WorkflowStatus; anzahl: number }[] {
  const bisher = d.workflows.find((w) => w.id === workflowId);
  if (!bisher) return [];
  const zahl = anmeldungenJeStatus(d);
  return bisher.status
    .filter((s) => !bleibende.includes(s.id) && (zahl.get(s.id) ?? 0) > 0)
    .map((status) => ({ status, anzahl: zahl.get(status.id) ?? 0 }));
}

/** Entfernt Nachfolger, die auf keinen vorhandenen Status (mehr) zeigen. */
function nachfolgerBereinigen(workflows: Workflow[]): Workflow[] {
  const vorhanden = new Set(workflows.flatMap((w) => w.status.map((s) => s.id)));
  return workflows.map((w) => ({
    ...w,
    status: w.status.map((s) => ({
      ...s,
      nachfolger: [...new Set(s.nachfolger)].filter((z) => z === LOESCHEN || vorhanden.has(z)),
    })),
  }));
}

/** Legt einen Workflow an oder ersetzt ihn. */
export function workflowSpeichern(d: BaubetriebDaten, workflow: Workflow): BaubetriebDaten {
  const vorhanden = d.workflows.some((w) => w.id === workflow.id);
  const workflows = vorhanden
    ? d.workflows.map((w) => (w.id === workflow.id ? workflow : w))
    : [...d.workflows, workflow];
  return { ...d, workflows: nachfolgerBereinigen(workflows) };
}

/** Löscht einen Workflow – nur, wenn keine Anmeldung mehr in ihm steht (siehe belegteEntfallendeStatus). */
export function workflowLoeschen(d: BaubetriebDaten, id: ID): BaubetriebDaten {
  if (belegteEntfallendeStatus(d, id, []).length > 0) return d;
  return { ...d, workflows: nachfolgerBereinigen(d.workflows.filter((w) => w.id !== id)) };
}

/**
 * Kopie eines Workflows mit neuen Kennungen. Nachfolger innerhalb des
 * Workflows zeigen auf die kopierten Status, Übernahmen in andere Workflows
 * bleiben erhalten.
 */
export function workflowKopie(w: Workflow, neueId: () => ID, workflowId: ID): Workflow {
  const idMap = new Map(w.status.map((s) => [s.id, neueId()]));
  return {
    ...w,
    id: workflowId,
    name: `${w.name} (Kopie)`,
    // Auch die Kurzbezeichnung unterscheidet sich, sonst sehen Auswahl und Kennzeichen gleich aus.
    kurz: `${w.kurz || w.name} (Kopie)`,
    herkunft: 'manuell',
    arten: [...w.arten],
    status: w.status.map((s) => ({
      ...s,
      id: idMap.get(s.id)!,
      frist: { ...s.frist },
      nachfolger: s.nachfolger.map((z) => idMap.get(z) ?? z),
    })),
  };
}
