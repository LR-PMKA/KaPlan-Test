/**
 * Fristenübersicht mit Erinnerungsfunktion: anstehende Prozessschritte über
 * alle Projekte – je anstehendem Schritt eine Zeile, in parallelen Zweigen also
 * mehrere je Planlauf –, gefiltert nach Dringlichkeit, mit Button für die
 * vorbereitete E-Mail.
 */
import { Fragment, useMemo, useState } from 'react';
import { aktuelleSchritte, offeneFristen, type Ampel } from '../domain/engine';
import { formatDate, relativeLabel } from '../../../shared/dates';
import type { PlanRun, Project, RunStep } from '../domain/types';
import type { Route } from '../lib/router';
import { useStore } from '../store/store';
import { AmpelBadge, AmpelPunkt } from '../components/common';
import { Card, CardHeader, EmptyState, Search, Segmented } from '../../../shared/ui';
import { EmailDialog } from '../components/EmailDialog';
import { ErledigtButton, useSchrittStatus } from '../components/SchrittStatus';
import { Icon } from '../../../shared/icons';

type Filter = 'alle' | 'ueberfaellig' | 'faellig' | 'geplant';

export function Fristen({
  navigate,
  projectId,
}: {
  navigate: (r: Route) => void;
  projectId?: string;
}) {
  const { data } = useStore();
  const { setzeStatus, nachweisDialog } = useSchrittStatus();
  const [filter, setFilter] = useState<Filter>('alle');
  const [suche, setSuche] = useState('');
  const [mail, setMail] = useState<{ project: Project; run: PlanRun; step: RunStep } | null>(null);

  const alle = useMemo(() => offeneFristen(data, projectId ? [projectId] : undefined), [data, projectId]);

  const eintraege = alle.filter((f) => {
    if (filter !== 'alle' && f.ampel !== (filter as Ampel)) return false;
    if (!suche.trim()) return true;
    const kontakt = data.contacts.find((c) => c.id === f.step.contactId);
    const heu = [f.step.name, f.run.name, f.project.name, f.step.roleName, kontakt?.nachname ?? '', kontakt?.firma ?? '']
      .join(' ')
      .toLowerCase();
    return heu.includes(suche.toLowerCase());
  });

  const zaehler = (a: Ampel) => alle.filter((f) => f.ampel === a).length;

  // In der Gesamtansicht nach Projekten gliedern; im Projekt genügt eine Liste.
  const projekte = projectId
    ? []
    : [...new Map(eintraege.map((f) => [f.project.id, f.project])).values()].sort((a, b) =>
        `${a.nummer} ${a.name}`.localeCompare(`${b.nummer} ${b.name}`, 'de', { numeric: true }),
      );
  const gruppen = projectId
    ? [{ project: null, zeilen: eintraege }]
    : projekte.map((p) => ({ project: p, zeilen: eintraege.filter((f) => f.project.id === p.id) }));

  return (
    <div className="stack">
      <div className="row-between wrap">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'alle', label: `Alle (${alle.length})` },
            { value: 'ueberfaellig', label: `Überfällig (${zaehler('ueberfaellig')})` },
            { value: 'faellig', label: `Fällig (${zaehler('faellig')})` },
            { value: 'geplant', label: `Im Plan (${zaehler('geplant')})` },
          ]}
        />
        <Search value={suche} onChange={setSuche} placeholder="Schritt, Person, Projekt …" />
      </div>

      <Card>
        <CardHeader
          titel="Anstehende Prozessschritte"
          sub="Alle anstehenden Schritte – bei parallelen Zweigen mehrere je Planlauf; Erinnerungen aus den E-Mail-Vorlagen"
        />
        {eintraege.length === 0 ? (
          <EmptyState icon="check" titel="Nichts offen" text="Für diese Auswahl gibt es keine offenen Fristen." />
        ) : (
          <div className="table-scroll"><table className="table table-stack">
            <thead>
              <tr>
                <th className="col-optional" style={{ width: 22 }} />
                <th>Schritt / Planlauf</th>
                <th className="col-optional">Rolle & Person</th>
                <th>Soll-Termin</th>
                <th>Status</th>
                <th className="actions">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {gruppen.map((gruppe) => (
                <Fragment key={gruppe.project?.id ?? 'alle'}>
                {gruppe.project ? (
                  <tr className="gruppe-zeile">
                    <td colSpan={6}>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() =>
                          navigate({ view: 'projekt', projectId: gruppe.project!.id, tab: 'uebersicht' })
                        }
                      >
                        <span className="num tertiary">{gruppe.project.nummer}</span>{' '}
                        <strong>{gruppe.project.name}</strong>
                      </button>
                      <span className="small tertiary">
                        {' '}
                        · {gruppe.zeilen.length} {gruppe.zeilen.length === 1 ? 'Schritt' : 'Schritte'}
                      </span>
                    </td>
                  </tr>
                ) : null}
                {gruppe.zeilen.map((f) => {
                const kontakt = data.contacts.find((c) => c.id === f.step.contactId);
                // Weitere Schritte desselben Laufs, die parallel anstehen
                const parallel = aktuelleSchritte(f.run).filter((s) => s.id !== f.step.id);
                return (
                  <tr key={`${f.run.id}-${f.step.id}`}>
                    <td className="col-optional"><AmpelPunkt ampel={f.ampel} /></td>
                    <td>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => navigate({ view: 'planlauf', projectId: f.project.id, runId: f.run.id })}
                      >
                        <strong>{f.step.name}</strong>
                      </button>
                      {parallel.length > 0 ? (
                        <span
                          className="badge zusatz"
                          title={`Parallel dazu: ${parallel.map((s) => s.name).join(', ')}`}
                        >
                          +{parallel.length} parallel
                        </span>
                      ) : null}
                      <div className="small tertiary">
                        {(() => {
                          const doc = data.documents.find((d) => d.id === f.run.documentId);
                          return doc ? `${doc.nummer} · ${doc.titel}` : f.run.name;
                        })()}
                        {projectId ? ` · ${f.project.nummer} ${f.project.name}` : ''}
                      </div>
                    </td>
                    <td className="small col-optional">
                      {f.step.roleName || <span className="tertiary">ohne Rolle</span>}
                      <div className="tertiary small">
                        {kontakt ? `${kontakt.vorname} ${kontakt.nachname}, ${kontakt.firma}` : 'keine Person zugeordnet'}
                      </div>
                    </td>
                    <td className="small">
                      {formatDate(f.step.sollDatum)}
                      <div className="tertiary small">{relativeLabel(f.step.sollDatum)}</div>
                    </td>
                    <td>
                      <AmpelBadge ampel={f.ampel} />
                      {f.step.letzteErinnerung ? (
                        <div className="tertiary small" title={new Date(f.step.letzteErinnerung).toLocaleString('de-DE')}>
                          E-Mail vorbereitet am {new Date(f.step.letzteErinnerung).toLocaleDateString('de-DE')}
                        </div>
                      ) : null}
                    </td>
                    <td className="actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => setMail({ project: f.project, run: f.run, step: f.step })}
                        title="Vorgefertigte E-Mail vorbereiten"
                      >
                        <Icon name="mail" size={13} /> Erinnern
                      </button>{' '}
                      <ErledigtButton
                        run={f.run}
                        step={f.step}
                        onErledigen={(run, step) => setzeStatus(run, step, 'erledigt')}
                      />
                    </td>
                  </tr>
                );
                })}
                </Fragment>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      {mail ? (
        <EmailDialog project={mail.project} run={mail.run} step={mail.step} onClose={() => setMail(null)} />
      ) : null}
      {nachweisDialog}
    </div>
  );
}
