/**
 * Projektarbeitsbereich mit drei Seiten: Leistungsnachweise, Leistungen und
 * Einstellungen (Nachweis-Vorgaben, Abschnitte, Logos). Darüber
 * Projektnummer, Status, Raster und Leistungsbereich sowie „Bearbeiten“ (jede
 * angemeldete Person) und „Löschen“ (nur mit der Rolle Controlling).
 */
import { useState } from 'react';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Badge, ConfirmDialog } from '../../../shared/ui';
import { useMitAnmeldung } from '../components/AnmeldeDialog';
import { RasterBadge, STATUS_TON, anzahl } from '../components/common';
import { darf } from '../domain/rechte';
import { PROJEKT_STATUS_LABEL, ZEITRAUMREGEL_LABEL, projektKurzname, type Projekt } from '../domain/types';
import type { ProjektTab, Route } from '../lib/router';
import { useStore } from '../store/store';
import { ProjektEinstellungen } from './projekt/Einstellungen';
import { Leistungen } from './projekt/Leistungen';
import { Nachweise } from './projekt/Nachweise';
import { ProjektDialog } from './Projekte';

const TABS: { id: ProjektTab; label: string; titel: string }[] = [
  { id: 'nachweise', label: 'Leistungsnachweise', titel: 'Leistungsnachweise des Projekts' },
  { id: 'leistungen', label: 'Leistungen', titel: 'Erfasste und importierte Leistungen' },
  { id: 'einstellungen', label: 'Einstellungen', titel: 'Vorgaben für Leistungsnachweise, Abschnitte und Logos' },
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
  const mitAnmeldung = useMitAnmeldung();
  const loeschenErlaubt = darf(data, 'projektLoeschen');
  const [bearbeiten, setBearbeiten] = useState(false);
  const [loeschen, setLoeschen] = useState(false);

  const gotoTab = (t: ProjektTab) => navigate({ view: 'projekt', projektId: projekt.id, tab: t });
  const umfang = {
    nachweise: data.nachweise.filter((n) => n.projektId === projekt.id).length,
    leistungen: data.leistungen.filter((l) => l.projektId === projekt.id).length,
  };
  const kurzname = projektKurzname(projekt);

  return (
    <div className="stack">
      <div className="ln-projektkopf">
        <div className="ln-projektinfo">
          {projekt.nummer ? <span className="mono tertiary">{projekt.nummer}</span> : null}
          <Badge ton={STATUS_TON[projekt.status]}>{PROJEKT_STATUS_LABEL[projekt.status]}</Badge>
          <span title={`Neue Nachweise: ${ZEITRAUMREGEL_LABEL[projekt.zeitraumregel]}`}>
            <RasterBadge raster={projekt.raster} />
          </span>
          {projekt.leistungsbereich ? <span className="small muted">{projekt.leistungsbereich}</span> : null}
          {kurzname !== projekt.name ? (
            <span className="small tertiary truncate" title="Bezeichnung im Nachweis">
              im Nachweis: {kurzname}
            </span>
          ) : null}
        </div>
        <div className="row">
          <button type="button" className="btn btn-sm btn-outline" onClick={() => mitAnmeldung(() => setBearbeiten(true))}>
            <Icon name="bearbeiten" size={12} /> Bearbeiten
          </button>
          {loeschenErlaubt ? (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setLoeschen(true)}>
              <Icon name="loeschen" size={12} /> Löschen
            </button>
          ) : null}
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

      {tab === 'nachweise' ? <Nachweise projekt={projekt} navigate={navigate} /> : null}
      {tab === 'leistungen' ? <Leistungen projekt={projekt} navigate={navigate} /> : null}
      {tab === 'einstellungen' ? <ProjektEinstellungen projekt={projekt} /> : null}

      {bearbeiten ? <ProjektDialog projekt={projekt} onClose={() => setBearbeiten(false)} /> : null}

      {loeschen && loeschenErlaubt ? (
        <ConfirmDialog
          titel="Projekt löschen?"
          text={`„${projekt.name}“ wird mit ${anzahl(umfang.nachweise, 'Leistungsnachweis', 'Leistungsnachweisen')} und ${anzahl(
            umfang.leistungen,
            'Leistung',
            'Leistungen',
          )} endgültig gelöscht.`}
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
