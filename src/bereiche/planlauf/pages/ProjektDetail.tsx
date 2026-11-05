/** Projektarbeitsbereich mit Reitern für alle projektbezogenen Funktionen. */
import type { Project } from '../domain/types';
import type { ProjektTab, Route } from '../lib/router';
import { RollenFunktionen } from './projekt/RollenFunktionen';
import { Einstellungen } from './projekt/Einstellungen';
import { Plaene } from './projekt/Plaene';
import { Uebersicht } from './projekt/Uebersicht';
import { Workflows } from './Workflows';

const TABS: { id: ProjektTab; label: string }[] = [
  { id: 'uebersicht', label: 'Planläufe' },
  { id: 'plaene', label: 'Planliste' },
  { id: 'rollen', label: 'Funktion' },
  { id: 'ketten', label: 'Workflows' },
  { id: 'einstellungen', label: 'Einstellungen' },
];

export function ProjektDetail({
  project,
  tab,
  navigate,
}: {
  project: Project;
  tab: ProjektTab;
  navigate: (r: Route) => void;
}) {
  const gotoTab = (t: ProjektTab) => navigate({ view: 'projekt', projectId: project.id, tab: t });
  const oeffneLauf = (runId: string) => navigate({ view: 'planlauf', projectId: project.id, runId });

  return (
    <div className="stack">
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={t.id === tab ? 'active' : ''} onClick={() => gotoTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'uebersicht' ? <Uebersicht project={project} gotoTab={gotoTab} oeffneLauf={oeffneLauf} /> : null}
      {tab === 'plaene' ? <Plaene project={project} oeffneLauf={oeffneLauf} /> : null}
      {tab === 'rollen' ? <RollenFunktionen project={project} /> : null}
      {tab === 'ketten' ? <Workflows projectId={project.id} /> : null}
      {tab === 'einstellungen' ? <Einstellungen project={project} /> : null}

    </div>
  );
}
