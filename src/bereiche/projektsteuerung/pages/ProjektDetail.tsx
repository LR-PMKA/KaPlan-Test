/**
 * Projektarbeitsbereich mit zwei Seiten: Projektbeteiligte und Protokolle.
 * Darüber Projektnummer, Status sowie „Bearbeiten“ und „Löschen“.
 */
import { useState } from 'react';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Badge, ConfirmDialog } from '../../../shared/ui';
import { PROJEKT_STATUS_LABEL, type Projekt } from '../domain/types';
import type { ProjektTab, Route } from '../lib/router';
import { useStore } from '../store/store';
import { Beteiligte } from './projekt/Beteiligte';
import { Protokolle } from './projekt/Protokolle';
import { ProjektDialog, STATUS_TON } from './Projekte';

const TABS: { id: ProjektTab; label: string; titel: string }[] = [
  { id: 'beteiligte', label: 'Projektbeteiligte', titel: 'Projektbeteiligtenliste' },
  { id: 'protokolle', label: 'Protokolle', titel: 'Besprechungsprotokolle' },
];

export function ProjektDetail({
  projekt,
  tab,
  navigate,
}: {
  projekt: Projekt;
  tab: ProjektTab;
  navigate: (r: Route) => void;
}) {
  const { data, deleteProjekt } = useStore();
  const toast = useToast();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [loeschen, setLoeschen] = useState(false);

  const gotoTab = (t: ProjektTab) => navigate({ view: 'projekt', projektId: projekt.id, tab: t });
  const umfang = {
    beteiligte: data.beteiligte.filter((b) => b.projektId === projekt.id).length,
    protokolle: data.protokolle.filter((p) => p.projektId === projekt.id).length,
  };

  return (
    <div className="stack">
      <div className="ps-projektkopf">
        <div className="ps-projektinfo">
          {projekt.nummer ? <span className="mono tertiary">{projekt.nummer}</span> : null}
          <Badge ton={STATUS_TON[projekt.status]}>{PROJEKT_STATUS_LABEL[projekt.status]}</Badge>
          {projekt.beschreibung ? <span className="small muted truncate">{projekt.beschreibung}</span> : null}
        </div>
        <div className="row">
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setBearbeiten(true)}>
            <Icon name="bearbeiten" size={12} /> Bearbeiten
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => setLoeschen(true)}>
            <Icon name="loeschen" size={12} /> Löschen
          </button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === tab ? 'active' : ''}
            title={t.titel}
            onClick={() => gotoTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'beteiligte' ? <Beteiligte projekt={projekt} /> : null}
      {tab === 'protokolle' ? <Protokolle projekt={projekt} navigate={navigate} /> : null}

      {bearbeiten ? <ProjektDialog projekt={projekt} onClose={() => setBearbeiten(false)} /> : null}

      {loeschen ? (
        <ConfirmDialog
          titel="Projekt löschen?"
          text={`„${projekt.name}“ wird mit ${umfang.beteiligte} Projektbeteiligten und ${umfang.protokolle} Protokollen endgültig gelöscht.`}
          onConfirm={() => {
            deleteProjekt(projekt.id);
            toast('Projekt gelöscht.');
            navigate({ view: 'projekte' });
          }}
          onClose={() => setLoeschen(false)}
        />
      ) : null}
    </div>
  );
}
