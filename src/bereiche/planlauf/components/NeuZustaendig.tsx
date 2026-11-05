/**
 * „E-Mail senden“: Nach einem Abschluss (auch nach dem Sammel-Erledigen)
 * stehen ein oder mehrere Schritte neu an – etwa alle Zweige eines parallelen
 * Blocks. Der Dialog zeigt je Person eine Zeile mit ihren neu anstehenden
 * Schritten, einer Vorlage und einer E-Mail (bei mehreren Schritten als
 * Sammel-E-Mail); ein Haken zeigt, für wen die E-Mail schon vorbereitet ist.
 * Steht ein Schritt nach einem Versandschritt an (Anliegen am Schritt), ist
 * die Vorlage „Versand“ vorgewählt.
 *
 * Übergeben werden nur IDs; Läufe und Schritte werden frisch aus dem Bestand
 * gelesen (Termine sind erst nach dem Neuberechnen im Store aktuell).
 */
import { useState } from 'react';
import { istErledigt } from '../domain/ablauf';
import { kontaktName } from '../domain/engine';
import { versandSchrittVor, vorlageVorschlagen } from '../domain/email';
import { VERSAND_ANLIEGEN_LABEL } from '../domain/types';
import type { ID, PlanRun, RunStep } from '../domain/types';
import { useStore } from '../store/store';
import { formatDate } from '../../../shared/dates';
import { Modal, Select } from '../../../shared/ui';
import { Icon } from '../../../shared/icons';
import { EmailDialog } from './EmailDialog';
import './planlauf.css';

/** Neu anstehende Schritte eines Laufs. */
export interface NeuZustaendigEintrag {
  runId: ID;
  stepIds: ID[];
}

interface Gruppe {
  schluessel: string;
  contactId: ID | null;
  posten: { run: PlanRun; step: RunStep }[];
}

export function NeuZustaendig({
  runId,
  stepIds,
  eintraege,
  vorlageId,
  onClose,
}: {
  /** Ein Lauf: seine neu anstehenden Schritte … */
  runId?: ID;
  stepIds?: ID[];
  /** … oder mehrere Läufe (Sammel-Erledigen). */
  eintraege?: NeuZustaendigEintrag[];
  /** Im Workflow hinterlegte Vorlage (Vorauswahl). */
  vorlageId?: ID | null;
  onClose: () => void;
}) {
  const { data } = useStore();
  const [gewaehlt, setGewaehlt] = useState<Record<string, string>>({});
  const [vermerkt, setVermerkt] = useState<string[]>([]);
  const [mailFuer, setMailFuer] = useState<string | null>(null);

  const liste: NeuZustaendigEintrag[] = eintraege ?? (runId ? [{ runId, stepIds: stepIds ?? [] }] : []);
  // Frisch aus dem Bestand: nur Schritte, die noch offen sind, in laufenden Läufen
  const gruppen: Gruppe[] = [];
  for (const { runId: r, stepIds: ids } of liste) {
    const run = data.runs.find((x) => x.id === r);
    if (!run || run.status !== 'laufend') continue;
    for (const id of ids) {
      const step = run.steps.find((s) => s.id === id);
      if (!step || istErledigt(step)) continue;
      const schluessel = step.contactId ?? `ohne:${step.roleName}`;
      let gruppe = gruppen.find((g) => g.schluessel === schluessel);
      if (!gruppe) {
        gruppe = { schluessel, contactId: step.contactId, posten: [] };
        gruppen.push(gruppe);
      }
      if (!gruppe.posten.some((p) => p.run.id === run.id && p.step.id === step.id)) gruppe.posten.push({ run, step });
    }
  }

  const vorlagen = data.emailVorlagen;
  /** Anliegen, wenn der Schritt nach einem Versandschritt ansteht (z. B. „Freigabe“). */
  const anliegenVon = (g: Gruppe) => {
    const versand = g.posten.map((p) => versandSchrittVor(p.run, p.step.id)).find(Boolean);
    return versand?.versandAnliegen ?? null;
  };
  /**
   * Vorauswahl: hinterlegte Vorlage; nach einem Versandschritt die Vorlage
   * „Versand“ (Platzhalter {{versandliste}}); bei mehreren Schritten die
   * Sammelerinnerung, sonst „Übergabe“.
   */
  const vorgabe = (g: Gruppe): string => {
    const hinterlegt = vorlageId ? vorlagen.find((v) => v.id === vorlageId) : undefined;
    const versand = anliegenVon(g) ? vorlagen.find((v) => /\{\{\s*versandliste\s*\}\}/.test(v.text)) : undefined;
    const sammel = g.posten.length > 1 ? vorlagen.find((v) => /\{\{\s*liste\s*\}\}/.test(v.text)) : undefined;
    const uebergabe = vorlagen.find((v) => v.anlass === 'uebergabe');
    return (hinterlegt ?? versand ?? sammel ?? uebergabe ?? vorlageVorschlagen(vorlagen, false))?.id ?? '';
  };
  const vorlageVon = (g: Gruppe) => gewaehlt[g.schluessel] ?? vorgabe(g);

  const offen = mailFuer ? gruppen.find((g) => g.schluessel === mailFuer) : undefined;
  if (offen) {
    return (
      <EmailDialog
        posten={offen.posten.map((p) => ({ runId: p.run.id, stepId: p.step.id }))}
        vorlageId={vorlageVon(offen) || null}
        onVermerkt={() => setVermerkt((v) => (v.includes(offen.schluessel) ? v : [...v, offen.schluessel]))}
        onClose={() => setMailFuer(null)}
      />
    );
  }

  return (
    <Modal
      titel="E-Mail senden"
      sub={
        gruppen.length === 0
          ? 'Keine neu anstehenden Schritte'
          : 'Diese Schritte sind jetzt an der Reihe – auf Wunsch die Zuständigen per E-Mail informieren'
      }
      wide
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {vermerkt.length > 0 ? 'Fertig' : 'Schließen'}
        </button>
      }
    >
      {gruppen.length === 0 ? (
        <p className="small muted">Die neu anstehenden Schritte sind bereits erledigt.</p>
      ) : (
        <div>
          {gruppen.map((g) => {
            const kontakt = data.contacts.find((c) => c.id === g.contactId);
            const fertig = vermerkt.includes(g.schluessel);
            const anliegen = anliegenVon(g);
            return (
              <div className="pl-zustaendig" key={g.schluessel}>
                <span
                  className={`pl-zustaendig-haken ${fertig ? '' : 'offen'}`}
                  title={fertig ? 'E-Mail vorbereitet' : 'Noch keine E-Mail vorbereitet'}
                >
                  <Icon name={fertig ? 'check' : 'mail'} size={16} strokeWidth={fertig ? 2.4 : 1.6} />
                </span>
                <div className="pl-zustaendig-person">
                  <strong>{kontakt ? kontaktName(kontakt) : 'Keine Person zugeordnet'}</strong>
                  {kontakt?.email ? <span>{kontakt.email}</span> : null}
                  {anliegen ? (
                    <span>
                      Versand zur {VERSAND_ANLIEGEN_LABEL[anliegen]}
                      {kontakt && !kontakt.sharepointEingang?.trim() ? ' · SharePoint-Link Eingang fehlt' : ''}
                    </span>
                  ) : null}
                  {!kontakt ? (
                    <span>Funktion „{g.posten[0]?.step.roleName || '–'}“ ist im Projekt nicht besetzt.</span>
                  ) : null}
                  {g.posten.map(({ run, step }) => (
                    <span key={`${run.id}/${step.id}`}>
                      {step.name}
                      {step.roleName ? ` (${step.roleName})` : ''} · {run.name} · Soll {formatDate(step.sollDatum)}
                    </span>
                  ))}
                </div>
                <Select
                  value={vorlageVon(g)}
                  onChange={(v) => setGewaehlt((alt) => ({ ...alt, [g.schluessel]: v }))}
                  options={vorlagen.map((v) => ({ value: v.id, label: v.name }))}
                />
                <button
                  type="button"
                  className={`btn btn-sm ${fertig ? 'btn-outline' : 'btn-primary'}`}
                  onClick={() => setMailFuer(g.schluessel)}
                  disabled={vorlagen.length === 0}
                >
                  <Icon name="mail" size={13} /> {fertig ? 'Erneut …' : 'E-Mail …'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
