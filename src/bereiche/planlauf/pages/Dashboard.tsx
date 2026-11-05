/**
 * Startseite: Kennzahlen, eigene To-Dos und die laufenden Planläufe,
 * nach Projekten gegliedert. Angezeigt werden die markierten Projekte.
 */
import { eigeneTodos, eigenstaendigeLaeufe, istAktiv, offeneFristen } from '../domain/engine';
import { mittlererFortschritt } from '../domain/uebersicht';
import { formatDate, relativeLabel } from '../../../shared/dates';
import { useState } from 'react';
import { EIGENE_ROLLE, type PlanRun, type Project, type RunStep } from '../domain/types';
import type { Route } from '../lib/router';
import { useStore } from '../store/store';
import { AmpelBadge, AmpelPunkt } from '../components/common';
import { Card, CardHeader, EmptyState, Progress, Stat } from '../../../shared/ui';
import { EmailDialog } from '../components/EmailDialog';
import { Icon } from '../../../shared/icons';
import { ErledigtButton, useSchrittStatus } from '../components/SchrittStatus';

/** Markierte Projekte; ohne Markierung werden alle angezeigt. */
export function sichtbareProjekte(projects: Project[]): Project[] {
  const markiert = projects.filter((p) => p.markiert);
  return markiert.length > 0 ? markiert : projects;
}

export function Dashboard({ navigate }: { navigate: (r: Route) => void }) {
  const { data } = useStore();
  const { setzeStatus, nachweisDialog } = useSchrittStatus();
  const [mail, setMail] = useState<{ project: Project; run: PlanRun; step: RunStep } | null>(null);
  const projekte = sichtbareProjekte(data.projects);
  const ids = projekte.map((p) => p.id);

  const fristen = offeneFristen(data, ids);
  const ueberfaellig = fristen.filter((f) => f.ampel === 'ueberfaellig');
  const faellig = fristen.filter((f) => f.ampel === 'faellig');
  const todos = eigeneTodos(data, ids);
  // Nur eigenständige Läufe zählen: Pläne eines gebündelten Verzeichnisses
  // laufen in dessen Lauf mit (siehe hatEigenenPlanlauf).
  const laufend = eigenstaendigeLaeufe(data.documents, data.runs).filter(
    (r) => ids.includes(r.projectId) && istAktiv(r),
  );

  const alleMarkiert = data.projects.filter((p) => p.markiert).length;

  return (
    <div className="stack">
      <div className="grid grid-4">
        <Stat wert={laufend.length} label="Laufende Planläufe" />
        <Stat wert={todos.length} label={`To-Dos (${EIGENE_ROLLE})`} ton="blue" />
        <Stat
          wert={ueberfaellig.length}
          label="Überfällige Schritte"
          ton={ueberfaellig.length ? 'red' : 'green'}
          onClick={() => navigate({ view: 'fristen' })}
        />
        <Stat
          wert={faellig.length}
          label="Demnächst fällig"
          ton={faellig.length ? 'orange' : ''}
          onClick={() => navigate({ view: 'fristen' })}
        />
      </div>

      {alleMarkiert === 0 ? (
        <p className="small tertiary">
          Kein Projekt markiert – es werden alle Projekte angezeigt. Unter <strong>Projekte</strong> lassen sich
          einzelne Projekte markieren; dann erscheinen nur diese hier und in der Seitenleiste.
        </p>
      ) : null}

      <Card>
        <CardHeader
          titel={`Meine To-Dos als ${EIGENE_ROLLE}`}
          sub="Laufende Schritte im eigenen Verantwortungsbereich"
        />
        {todos.length === 0 ? (
          <EmptyState icon="check" titel="Nichts offen" text="Derzeit liegt kein Schritt bei Ihnen." />
        ) : (
          <div className="table-scroll">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th className="col-optional" style={{ width: 22 }} />
                  <th>Schritt / Planlauf</th>
                  <th>Gewerk</th>
                  <th className="col-optional">Projekt</th>
                  <th>Soll-Termin</th>
                  <th>Status</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {todos.map((f) => (
                  <tr
                    key={`${f.run.id}-${f.step.id}`}
                    className="clickable"
                    onClick={() => navigate({ view: 'planlauf', projectId: f.project.id, runId: f.run.id })}
                  >
                    <td className="col-optional">
                      <AmpelPunkt ampel={f.ampel} />
                    </td>
                    <td>
                      <strong>{f.step.name}</strong>
                      <div className="small tertiary">
                        {(() => {
                          const doc = data.documents.find((d) => d.id === f.run.documentId);
                          return doc ? `${doc.nummer} · ${doc.titel}` : f.run.name;
                        })()}
                      </div>
                    </td>
                    <td className="small muted">
                      {data.documents.find((d) => d.id === f.run.documentId)?.gewerk || '–'}
                    </td>
                    <td className="small muted col-optional">
                      {f.project.nummer} {f.project.name}
                    </td>
                    <td className="small">
                      {formatDate(f.step.sollDatum)}
                      <div className="tertiary small">{relativeLabel(f.step.sollDatum)}</div>
                    </td>
                    <td>
                      <AmpelBadge ampel={f.ampel} />
                    </td>
                    <td className="actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        title="Vorbereitete E-Mail an die zuständige Person"
                        aria-label="Erinnerung vorbereiten"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMail({ project: f.project, run: f.run, step: f.step });
                        }}
                      >
                        <Icon name="mail" size={13} />
                      </button>{' '}
                      <ErledigtButton
                        run={f.run}
                        step={f.step}
                        onErledigen={(run, step) => setzeStatus(run, step, 'erledigt')}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader titel="Projekte" sub="Umfang und Fristenlage je Projekt" />
        {projekte.length === 0 ? (
          <EmptyState icon="projekt" titel="Kein Projekt" text="Legen Sie unter „Projekte“ ein Projekt an." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Projekt</th>
                  <th className="zahl">Pläne &amp; Verzeichnisse</th>
                  <th className="zahl">Laufende Planläufe</th>
                  <th className="zahl">Demnächst fällig</th>
                  <th className="zahl">Überfällig</th>
                  <th style={{ width: 170 }}>Fortschritt</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {projekte.map((project) => {
                  const eintraege = data.documents.filter(
                    (d) => d.projectId === project.id && d.kind !== 'paket',
                  );
                  const eigene = eigenstaendigeLaeufe(data.documents, data.runs).filter(
                    (r) => r.projectId === project.id,
                  );
                  const laufendeLaeufe = eigene.filter(istAktiv);
                  // Mittel der nach Fristen gewichteten Lauf-Werte (ohne abgebrochene)
                  const pct = mittlererFortschritt(data, eigene);
                  const projektFristen = fristen.filter((f) => f.project.id === project.id);
                  const bald = projektFristen.filter((f) => f.ampel === 'faellig').length;
                  const spaet = projektFristen.filter((f) => f.ampel === 'ueberfaellig').length;
                  return (
                    <tr
                      key={project.id}
                      className="clickable"
                      onClick={() => navigate({ view: 'projekt', projectId: project.id, tab: 'uebersicht' })}
                    >
                      <td>
                        <span className="num tertiary">{project.nummer}</span>
                        <div>
                          <strong>{project.name}</strong>
                        </div>
                      </td>
                      <td className={`zahl ${eintraege.length ? '' : 'leer'}`}>{eintraege.length}</td>
                      <td className={`zahl ${laufendeLaeufe.length ? '' : 'leer'}`}>{laufendeLaeufe.length}</td>
                      <td className={`zahl ${bald ? '' : 'leer'}`} style={{ color: bald ? 'var(--orange)' : undefined }}>
                        {bald}
                      </td>
                      <td className={`zahl ${spaet ? '' : 'leer'}`} style={{ color: spaet ? 'var(--red)' : undefined }}>
                        {spaet}
                      </td>
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <Progress wert={pct} />
                          <span className="small tertiary">{pct}%</span>
                        </span>
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate({ view: 'projekt', projectId: project.id, tab: 'uebersicht' });
                          }}
                        >
                          Projekt öffnen <Icon name="chevron" size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {mail ? (
        <EmailDialog project={mail.project} run={mail.run} step={mail.step} onClose={() => setMail(null)} />
      ) : null}
      {nachweisDialog}
    </div>
  );
}
