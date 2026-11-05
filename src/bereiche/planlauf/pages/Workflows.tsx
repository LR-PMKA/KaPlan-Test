/**
 * Verwaltung der Workflows: projektübergreifende (mitgelieferte Standard-
 * Workflows und eigene) und – nur im Reiter „Workflows“ eines Projekts – dessen
 * Projektvarianten. Jede Karte zeigt den
 * Standardverlauf als Punktkette; „Öffnen“ führt in den grafischen
 * Workflow-Editor (components/WorkflowEditor.tsx).
 */
import { useState } from 'react';
import { vorlagenSchritte } from '../domain/engine';
import { neuerSchritt } from '../domain/workflowGraph';
import { EIGENE_ROLLE, type ProcessTemplate, type ProcessTemplateStep } from '../domain/types';
import { newId, useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import { Badge, Card, CardHeader, ConfirmDialog, EmptyState } from '../../../shared/ui';
import { Icon } from '../../../shared/icons';
import { AblaufVorschau, ablaufZahlen } from '../components/AblaufVorschau';
import { WorkflowEditor } from '../components/WorkflowEditor';

export function Workflows({ projectId }: { projectId?: string }) {
  const { data, addTemplate, updateTemplate, deleteTemplate } = useStore();
  const toast = useToast();
  const [editor, setEditor] = useState<{ template?: ProcessTemplate; steps: ProcessTemplateStep[] } | null>(null);
  const [loeschen, setLoeschen] = useState<ProcessTemplate | null>(null);

  // Projektvarianten erscheinen nur im eigenen Projekt, nicht im übergreifenden Menü
  const vorlagen = data.templates.filter((t) => t.projectId === null || (projectId !== undefined && t.projectId === projectId));
  const uebergreifend = vorlagen.filter((t) => t.projectId === null);
  const varianten = vorlagen.filter((t) => t.projectId !== null);

  /** Vorschläge für die verantwortliche Funktion – im Projekt dessen Funktionen. */
  const rollen = [
    EIGENE_ROLLE,
    ...data.standardRollen.map((r) => r.name),
    ...data.roles.filter((r) => !projectId || r.projectId === projectId).map((r) => r.name),
  ];

  const duplizieren = (t: ProcessTemplate) => {
    addTemplate({
      projectId: projectId ?? null,
      name: `${t.name} (Kopie)`,
      beschreibung: t.beschreibung,
      herkunft: 'manuell',
      // Neue IDs; „weiter mit“ und Antwortziele zeigen auf die Kopien
      steps: vorlagenSchritte(t, newId),
    });
    toast(projectId ? 'Workflow als Projektvariante dupliziert.' : 'Workflow dupliziert – jetzt individuell anpassbar.');
  };

  const projektName = (id: string | null) => {
    const p = data.projects.find((x) => x.id === id);
    return p ? (p.nummer ? `${p.nummer} ${p.name}` : p.name) : '';
  };

  const karte = (t: ProcessTemplate) => {
    const z = ablaufZahlen(t.steps);
    const mitgeliefert = t.herkunft === 'standard' && t.projectId === null;
    return (
      // Die ganze Karte öffnet den Editor; per Tastatur über „Öffnen“
      <div key={t.id} className="wf-liste-karte" onClick={() => setEditor({ template: t, steps: t.steps })}>
        <div className="wf-liste-kopf">
          <span className="wf-typ-zeichen">
            <Icon name="kette" size={16} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{t.name}</strong>
            <div className="row wrap" style={{ gap: 6, marginTop: 3 }}>
              {mitgeliefert ? (
                <Badge>Standard</Badge>
              ) : t.projectId === null ? (
                <Badge ton="blue">Eigener Workflow</Badge>
              ) : (
                <Badge ton="blue">Projektvariante</Badge>
              )}
              {!projectId && t.projectId ? <span className="small tertiary">{projektName(t.projectId)}</span> : null}
            </div>
          </div>
        </div>
        {t.beschreibung ? <p className="wf-liste-text">{t.beschreibung}</p> : null}
        <AblaufVorschau steps={t.steps} />
        <div className="wf-liste-zahlen">
          <span>
            <b>{z.schritte}</b> {z.schritte === 1 ? 'Schritt' : 'Schritte'}
          </span>
          <span>
            <b>{z.entscheidungen}</b> {z.entscheidungen === 1 ? 'Entscheidung' : 'Entscheidungen'}
          </span>
          {z.bloecke > 0 ? (
            <span>
              <b>{z.bloecke}</b> {z.bloecke === 1 ? 'paralleler Block' : 'parallele Blöcke'}
            </span>
          ) : null}
          <span>
            <b>{z.tage}</b> {z.tage === 1 ? 'Tag' : 'Tage'} im Standardverlauf
          </span>
        </div>
        <div className="wf-liste-fuss" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditor({ template: t, steps: t.steps })}>
            <Icon name="bearbeiten" size={13} /> Öffnen
          </button>
          <button type="button" className="btn btn-sm" onClick={() => duplizieren(t)}>
            <Icon name="kopieren" size={13} /> Duplizieren
          </button>
          <span className="spacer" />
          {!mitgeliefert ? (
            <button
              type="button"
              className="btn-icon"
              onClick={() => setLoeschen(t)}
              aria-label="Workflow löschen"
              title="Workflow löschen"
            >
              <Icon name="loeschen" size={15} />
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  const abschnitt = (titel: string, sub: string, eintraege: ProcessTemplate[], leer: string) => (
    <Card>
      <CardHeader titel={titel} sub={sub} />
      <div className="card-pad">
        {eintraege.length === 0 ? (
          <EmptyState icon="kette" titel="Noch kein Workflow" text={leer} />
        ) : (
          <div className="wf-liste">{eintraege.map(karte)}</div>
        )}
      </div>
    </Card>
  );

  const offen = editor?.template;
  return (
    <div className="stack">
      <div className="row-between wrap">
        <p className="muted small" style={{ maxWidth: 680 }}>
          Ein Workflow legt die Schritte eines Planlaufs fest. Projektübergreifende Workflows sind in allen Projekten
          wählbar; für Abweichungen in einem Projekt duplizieren Sie einen Workflow im Projekt als Projektvariante. Einzelne
          Planläufe lassen sich beim Anlegen zusätzlich individuell anpassen.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setEditor({ steps: [neuerSchritt('aufgabe', newId)] })}
        >
          <Icon name="plus" size={14} /> Neuer Workflow
        </button>
      </div>

      {abschnitt(
        'Projektübergreifende Workflows',
        'Mitgelieferte Standard-Workflows und eigene – in allen Projekten wählbar',
        uebergreifend,
        'Legen Sie einen Workflow an oder duplizieren Sie einen vorhandenen.',
      )}
      {projectId
        ? abschnitt(
            'Projektvarianten',
            'Nur in diesem Projekt wählbar',
            varianten,
            'Duplizieren Sie hier einen Workflow, um eine Variante nur für dieses Projekt anzulegen.',
          )
        : null}

      {editor ? (
        <WorkflowEditor
          titel={offen ? 'Workflow bearbeiten' : projectId ? 'Neue Projektvariante' : 'Neuer Workflow'}
          untertitel={
            offen?.projectId
              ? `Projektvariante · ${projektName(offen.projectId)}`
              : offen
                ? 'Projektübergreifend – in allen Projekten wählbar'
                : projectId
                  ? `Nur in diesem Projekt wählbar · ${projektName(projectId)}`
                  : 'Projektübergreifend – in allen Projekten wählbar'
          }
          hinweis={
            offen && offen.projectId === null
              ? `Projektübergreifender Workflow: Änderungen gelten für alle künftigen Planläufe aller Projekte; laufende Planläufe bleiben unverändert.${
                  offen.herkunft === 'standard'
                    ? ' Mitgelieferte Standard-Workflows ersetzt eine neue Fassung von KaPlan samt Änderungen – eigene Anpassungen daher besser als Kopie („Duplizieren“).'
                    : ''
                }`
              : undefined
          }
          steps={editor.steps}
          name={offen?.name ?? ''}
          beschreibung={offen?.beschreibung ?? ''}
          rollen={rollen}
          speichernLabel="Speichern"
          onSpeichern={({ steps, name, beschreibung }) => {
            if (offen) {
              updateTemplate(offen.id, { name, beschreibung, steps });
              toast('Workflow gespeichert.');
            } else {
              addTemplate({ projectId: projectId ?? null, name, beschreibung, herkunft: 'manuell', steps });
              toast('Workflow angelegt.');
            }
            setEditor(null);
          }}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {loeschen ? (
        <ConfirmDialog
          titel="Workflow löschen?"
          text={`„${loeschen.name}“ wird gelöscht. Bereits gestartete Planläufe bleiben unverändert.`}
          onConfirm={() => {
            deleteTemplate(loeschen.id);
            toast('Workflow gelöscht.');
          }}
          onClose={() => setLoeschen(null)}
        />
      ) : null}
    </div>
  );
}
