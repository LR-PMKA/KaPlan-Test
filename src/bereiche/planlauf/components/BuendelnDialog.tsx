/**
 * Führt Pläne mit eigenem Lauf wieder im gebündelten Lauf ihres Verzeichnisses
 * zusammen – die Umkehrung von „Herauslösen“ bzw. „Alle Pläne einzeln
 * weiterführen“. Welche Pläne zurückkehren, wird je Plan angekreuzt.
 */
import { useState } from 'react';
import { aktuelleSchritte, aktuellerSchritt } from '../domain/engine';
import { laufFortschritt } from '../domain/uebersicht';
import { INDEX_LABEL, type PlanDocument, type PlanRun } from '../domain/types';
import { useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import { Callout, Field, Modal, Select } from '../../../shared/ui';

/** Pläne eines Verzeichnisses, die derzeit einen eigenen Lauf haben. */
export function planeMitEigenemLauf(
  documents: PlanDocument[],
  runs: PlanRun[],
  verzeichnisId: string,
): { plan: PlanDocument; lauf: PlanRun }[] {
  return documents
    .filter((d) => d.kind === 'plan' && d.parentId === verzeichnisId)
    .map((plan) => ({ plan, lauf: runs.find((r) => r.documentId === plan.id && r.status !== 'abgebrochen') }))
    .filter((x): x is { plan: PlanDocument; lauf: PlanRun } => Boolean(x.lauf));
}

export function BuendelnDialog({
  verzeichnis,
  onClose,
  onGebuendelt,
}: {
  verzeichnis: PlanDocument;
  onClose: () => void;
  /** Nach dem Bündeln – etwa um den Verzeichnislauf zu öffnen. */
  onGebuendelt?: (runId: string) => void;
}) {
  const { data, planeBuendeln } = useStore();
  const toast = useToast();
  const kandidaten = planeMitEigenemLauf(data.documents, data.runs, verzeichnis.id);
  const verzeichnisLauf = data.runs.find((r) => r.documentId === verzeichnis.id && r.status === 'laufend');
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [quelle, setQuelle] = useState<string>('');

  const auswahl = kandidaten.filter((k) => gewaehlt.includes(k.plan.id));
  /** Fortschritt nach Fristen gewichtet – mit Arbeitstagen und Feiertagen des Projekts. */
  const fortschritt = (lauf: PlanRun) => laufFortschritt(data, lauf);
  // Ohne laufenden Verzeichnislauf entsteht ein neuer; vorgeschlagen wird der
  // Stand des am wenigsten weit gediehenen Plans, damit für keinen Plan ein
  // Schritt als erledigt gilt, der es nicht ist.
  const vorschlag = [...auswahl].sort((a, b) => fortschritt(a.lauf) - fortschritt(b.lauf))[0];
  const quelleWirksam = auswahl.some((k) => k.lauf.id === quelle) ? quelle : (vorschlag?.lauf.id ?? '');
  const schrittVon = (lauf: PlanRun) => {
    const fuehrend = aktuellerSchritt(lauf);
    const weitere = aktuelleSchritte(lauf).length - 1;
    return fuehrend ? `${fuehrend.name}${weitere > 0 ? ` (+${weitere} parallel)` : ''}` : 'ohne offenen Schritt';
  };

  const umschalten = (id: string) =>
    setGewaehlt((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  const alle = gewaehlt.length === kandidaten.length && kandidaten.length > 0;

  const buendeln = () => {
    const runId = planeBuendeln(verzeichnis.id, gewaehlt, verzeichnisLauf ? null : quelleWirksam);
    if (!runId) return;
    toast(
      gewaehlt.length === 1
        ? 'Plan wieder im Verzeichnis gebündelt.'
        : `${gewaehlt.length} Pläne wieder im Verzeichnis gebündelt.`,
    );
    onClose();
    onGebuendelt?.(runId);
  };

  return (
    <Modal
      titel="Pläne wieder bündeln"
      sub={`${verzeichnis.nummer} · ${verzeichnis.titel}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" disabled={gewaehlt.length === 0} onClick={buendeln}>
            {gewaehlt.length === 0
              ? 'Pläne bündeln'
              : gewaehlt.length === 1
                ? '1 Plan bündeln'
                : `${gewaehlt.length} Pläne bündeln`}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <Callout>
          {verzeichnisLauf
            ? `Die angekreuzten Pläne laufen danach wieder im Planlauf des Verzeichnisses mit – mit dessen Stand (derzeit „${schrittVon(verzeichnisLauf)}“). Ihr eigener Lauf endet.`
            : 'Das Verzeichnis läuft derzeit nicht gebündelt. Für die angekreuzten Pläne entsteht wieder ein gemeinsamer Verzeichnislauf; ihr eigener Lauf endet.'}{' '}
          Nicht angekreuzte Pläne behalten ihren eigenen Lauf.
        </Callout>

        {kandidaten.length === 0 ? (
          <p className="muted small">Kein Plan dieses Verzeichnisses hat derzeit einen eigenen Lauf.</p>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            <label className="checkbox small muted">
              <input
                type="checkbox"
                checked={alle}
                onChange={() => setGewaehlt(alle ? [] : kandidaten.map((k) => k.plan.id))}
              />
              Alle auswählen
            </label>
            {kandidaten.map(({ plan, lauf }) => (
              <label key={plan.id} className="checkbox buendeln-plan">
                <input type="checkbox" checked={gewaehlt.includes(plan.id)} onChange={() => umschalten(plan.id)} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="num">
                    {plan.nummer}
                    {plan.index ? ` · ${INDEX_LABEL.plan} ${plan.index}` : ''}
                  </span>
                  <strong style={{ display: 'block' }}>{plan.titel}</strong>
                </span>
                <span className="small tertiary" style={{ textAlign: 'right' }}>
                  {schrittVon(lauf)} · {fortschritt(lauf)}%
                  {/* Weiter als der Verzeichnislauf: beim Bündeln fällt der Plan zurück */}
                  {verzeichnisLauf && fortschritt(lauf) > fortschritt(verzeichnisLauf) ? (
                    <span style={{ display: 'block', color: 'var(--gelb-text)' }}>
                      weiter als das Verzeichnis – fällt zurück
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        )}

        {!verzeichnisLauf && auswahl.length > 0 ? (
          <Field
            label="Stand des Verzeichnislaufs übernehmen von"
            full
            hint="Vorgeschlagen ist der am wenigsten weit gediehene Plan – so gilt für keinen Plan ein Schritt als erledigt, der es nicht ist."
          >
            <Select
              value={quelleWirksam}
              onChange={setQuelle}
              options={auswahl.map((k) => ({
                value: k.lauf.id,
                label: `${k.plan.titel} – ${schrittVon(k.lauf)} (${fortschritt(k.lauf)}%)`,
              }))}
            />
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}
