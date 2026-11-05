/** Rahmen der Baubetriebsplanung: Seitenleiste, Kopfzeile und Auswahl der Ansicht. */
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../../shared/icons';
import { KaPlanLogo, MailaenderLogo } from '../../shared/logos';
import { useToast } from '../../shared/toast';
import { Card, ConfirmDialog, EmptyState, Field, Modal, TextInput } from '../../shared/ui';
import { BereichWechsel } from '../../shell/BereichWechsel';
import { SicherungEinspielenDialog, SicherungWaehlen, type Sicherung } from './components/Sicherung';
import { ausstehendeErstanmeldungen, offeneTermine } from './domain/fristen';
import { STANDARD_BEARBEITER } from './domain/types';
import { anmeldungBezeichnung } from './domain/workflow';
import { useRoute, type Route } from './lib/router';
import { AnmeldungDetail } from './pages/AnmeldungDetail';
import { Einstellungen } from './pages/Einstellungen';
import { ProjektDetail } from './pages/ProjektDetail';
import { Projekte } from './pages/Projekte';
import { Termine } from './pages/Termine';
import { Uebersicht, sichtbareProjekte } from './pages/Uebersicht';
import { Workflows } from './pages/Workflows';
import { exportiereDaten } from './store/storage';
import { useStore } from './store/store';

export function App() {
  const { data, zuruecksetzen } = useStore();
  const toast = useToast();
  const [route, navigate] = useRoute();
  const [menuOffen, setMenuOffen] = useState(false);
  const [bearbeiterDialog, setBearbeiterDialog] = useState(false);
  const [zuruecksetzenDialog, setZuruecksetzenDialog] = useState(false);
  const [sicherung, setSicherung] = useState<Sicherung | null>(null);

  const markierte = sichtbareProjekte(data.projekte);
  const termine = offeneTermine(data);
  // Überfällig: Terminfristen der Anmeldungen und ausstehende Erstanmeldungen
  const ueberfaellig = [...termine, ...ausstehendeErstanmeldungen(data)].filter((t) => t.ampel === 'ueberfaellig');
  const projekt =
    route.view === 'projekt' || route.view === 'anmeldung'
      ? data.projekte.find((p) => p.id === route.projektId)
      : undefined;
  const anmeldung =
    route.view === 'anmeldung' ? data.anmeldungen.find((a) => a.id === route.anmeldungId) : undefined;

  const gehe = (r: Route) => {
    navigate(r);
    setMenuOffen(false);
  };

  const farbmodus = data.einstellungen.farbmodus;
  useEffect(() => {
    // Eigene Einstellung dieses Bereichs – unabhängig vom Planlaufmanagement.
    document.documentElement.dataset.farbmodus = farbmodus;
  }, [farbmodus]);

  const kopf = kopfzeile(route, projekt?.name, anmeldung ? anmeldungBezeichnung(anmeldung) : undefined);

  return (
    <div className="app">
      <aside className={`sidebar ${menuOffen ? 'open' : ''}`}>
        <button
          type="button"
          className="sidebar-brand"
          onClick={() => gehe({ view: 'uebersicht' })}
          title="Zur Übersicht"
        >
          <KaPlanLogo variante="Baubetriebsplanung" width="100%" />
        </button>

        <NavItem icon="dashboard" label="Übersicht" aktiv={route.view === 'uebersicht'} onClick={() => gehe({ view: 'uebersicht' })} />
        <NavItem
          icon="frist"
          label="Termine & Nachhaken"
          aktiv={route.view === 'termine'}
          badge={ueberfaellig.length > 0 ? String(ueberfaellig.length) : undefined}
          badgeAlarm
          onClick={() => gehe({ view: 'termine' })}
        />
        <NavItem icon="projekt" label="Projekte" aktiv={route.view === 'projekte'} onClick={() => gehe({ view: 'projekte' })} />
        <NavItem icon="kette" label="Workflows" aktiv={route.view === 'workflows'} onClick={() => gehe({ view: 'workflows' })} />
        <NavItem
          icon="einstellungen"
          label="Einstellungen"
          aktiv={route.view === 'einstellungen'}
          onClick={() => gehe({ view: 'einstellungen' })}
        />

        <div className="nav-group-label">
          Projekte
          {markierte.length < data.projekte.length ? <span className="tertiary"> (markierte)</span> : null}
        </div>
        {markierte.map((p) => {
          const spaet = ueberfaellig.filter((t) => t.projekt.id === p.id).length;
          return (
            <NavItem
              key={p.id}
              icon="projekt"
              label={p.name}
              aktiv={projekt?.id === p.id}
              badge={spaet > 0 ? String(spaet) : undefined}
              badgeAlarm
              onClick={() => gehe({ view: 'projekt', projektId: p.id })}
            />
          );
        })}

        <div className="sidebar-footer">
          <button type="button" className="bearbeiter" onClick={() => setBearbeiterDialog(true)}>
            <span className="avatar" style={{ width: 26, height: 26 }}>
              {initialen(data.einstellungen.bearbeiter)}
            </span>
            <span style={{ minWidth: 0 }}>
              <strong className="truncate">{data.einstellungen.bearbeiter}</strong>
            </span>
          </button>
          <div className="sicherung-knoepfe">
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => exportiereDaten(data)}
              title="Gesamten Datenbestand der Baubetriebsplanung als JSON sichern"
            >
              <Icon name="export" size={12} /> Sicherung
            </button>
            <SicherungWaehlen onGelesen={setSicherung} />
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setZuruecksetzenDialog(true)}>
              Zurücksetzen
            </button>
          </div>
          Daten werden lokal im Browser gespeichert.
          <BereichWechsel />
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button type="button" className="btn-icon menu-toggle" onClick={() => setMenuOffen((o) => !o)} aria-label="Menü">
            <Icon name="menu" size={18} />
          </button>
          <div className="topbar-title">
            <h1>{kopf.titel}</h1>
            {kopf.sub ? <div className="sub">{kopf.sub}</div> : null}
          </div>
          <div className="topbar-logo">
            <MailaenderLogo height={34} />
          </div>
        </header>

        <div className="content">
          <div className="content-inner">
            {route.view === 'uebersicht' ? <Uebersicht navigate={gehe} /> : null}
            {route.view === 'termine' ? <Termine navigate={gehe} /> : null}
            {route.view === 'projekte' ? <Projekte navigate={gehe} /> : null}
            {route.view === 'workflows' ? <Workflows navigate={gehe} /> : null}
            {route.view === 'einstellungen' ? <Einstellungen /> : null}
            {route.view === 'projekt' ? (
              projekt ? (
                <ProjektDetail projekt={projekt} navigate={gehe} />
              ) : (
                <NichtGefunden onZurueck={() => gehe({ view: 'projekte' })} />
              )
            ) : null}
            {route.view === 'anmeldung' ? (
              projekt && anmeldung ? (
                <AnmeldungDetail projekt={projekt} anmeldung={anmeldung} navigate={gehe} />
              ) : (
                <NichtGefunden onZurueck={() => gehe({ view: 'projekte' })} />
              )
            ) : null}
          </div>
        </div>
      </main>

      {menuOffen ? (
        <div className="overlay" style={{ background: 'rgba(0,0,0,0.18)', zIndex: 80 }} onClick={() => setMenuOffen(false)} />
      ) : null}

      {bearbeiterDialog ? <BearbeiterDialog onClose={() => setBearbeiterDialog(false)} /> : null}

      {sicherung ? (
        <SicherungEinspielenDialog
          sicherung={sicherung}
          onClose={() => setSicherung(null)}
          onEingespielt={() => gehe({ view: 'uebersicht' })}
        />
      ) : null}

      {zuruecksetzenDialog ? (
        <ConfirmDialog
          titel="Daten zurücksetzen?"
          text="Alle lokal gespeicherten Projekte, Anmeldungen und Workflows der Baubetriebsplanung werden verworfen und der Demodatenbestand samt Standard-Workflows wird neu geladen. Das Planlaufmanagement bleibt unberührt."
          bestaetigenLabel="Zurücksetzen"
          onConfirm={() => {
            zuruecksetzen();
            toast('Demodaten wiederhergestellt.');
            gehe({ view: 'uebersicht' });
          }}
          onClose={() => setZuruecksetzenDialog(false)}
        />
      ) : null}
    </div>
  );
}

/** Kürzel der angemeldeten Person für das Namensfeld. */
function initialen(name: string): string {
  const teile = name.trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return '?';
  if (teile.length === 1) return teile[0].slice(0, 2).toUpperCase();
  return (teile[0][0] + teile[teile.length - 1][0]).toUpperCase();
}

function BearbeiterDialog({ onClose }: { onClose: () => void }) {
  const { data, setEinstellungen } = useStore();
  const [name, setName] = useState(data.einstellungen.bearbeiter);
  const [kontrast, setKontrast] = useState(data.einstellungen.farbmodus === 'kontrast');

  return (
    <Modal
      titel="Angemeldet als"
      sub="Eigene Angaben und persönliche Einstellungen"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEinstellungen({
                bearbeiter: name.trim() || STANDARD_BEARBEITER,
                farbmodus: kontrast ? 'kontrast' : 'standard',
              });
              onClose();
            }}
          >
            Übernehmen
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name" full hint="Erscheint im Statusverlauf jeder Anmeldung bei den Wechseln, die Sie erfassen.">
          <TextInput value={name} onChange={setName} placeholder="Vor- und Nachname" />
        </Field>
        <Field
          label="Darstellung"
          full
          hint="Farben für eine Rot-Grün-Sehschwäche: Blaugrün, Bernstein und Magenta statt Grün, Orange und Rot – zusätzlich mit stärkeren Kontrasten."
        >
          <label className="checkbox">
            <input type="checkbox" checked={kontrast} onChange={(e) => setKontrast(e.target.checked)} />
            Farbmodus für Rot-Grün-Sehschwäche (hoher Kontrast)
          </label>
        </Field>
      </div>
      <p className="small tertiary" style={{ marginTop: 12 }}>
        Die Einstellungen gelten nur für die Baubetriebsplanung; das Planlaufmanagement führt eigene.
      </p>
    </Modal>
  );
}

function NavItem({
  icon,
  label,
  aktiv,
  badge,
  badgeAlarm,
  onClick,
}: {
  icon: IconName;
  label: string;
  aktiv: boolean;
  badge?: string;
  badgeAlarm?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`nav-item ${aktiv ? 'active' : ''}`} onClick={onClick} title={label}>
      <span className="nav-icon">
        <Icon name={icon} size={16} />
      </span>
      <span className="nav-label">{label}</span>
      {badge ? <span className={`nav-badge ${badgeAlarm ? 'alert' : ''}`}>{badge}</span> : null}
    </button>
  );
}

function NichtGefunden({ onZurueck }: { onZurueck: () => void }) {
  return (
    <Card>
      <EmptyState
        icon="projekt"
        titel="Nicht gefunden"
        text="Der aufgerufene Eintrag existiert nicht (mehr) – etwa weil er als Anmeldeleiche gelöscht wurde."
        action={
          <button type="button" className="btn btn-primary" onClick={onZurueck}>
            Zu den Projekten
          </button>
        }
      />
    </Card>
  );
}

function kopfzeile(route: Route, projektName?: string, anmeldungName?: string): { titel: string; sub?: string } {
  switch (route.view) {
    case 'uebersicht':
      return { titel: 'Übersicht', sub: 'Baubetriebliche Anmeldungen für Sperrpausen' };
    case 'termine':
      return { titel: 'Termine & Nachhaken', sub: 'Terminfristen aller Anmeldungen und Anmeldebedarf' };
    case 'projekte':
      return { titel: 'Projekte', sub: 'Je Baumaßnahme ein Projekt mit seinen Anmeldungen' };
    case 'workflows':
      return { titel: 'Workflows', sub: 'Status, Terminfristen und Nachfolger je Phase – anpassbar' };
    case 'einstellungen':
      return { titel: 'Einstellungen', sub: 'Fristen laut Richtlinie, Ampel und Nachhaken' };
    case 'projekt':
      return { titel: projektName ?? 'Projekt', sub: 'Projekt' };
    case 'anmeldung':
      return { titel: anmeldungName || 'Anmeldung', sub: projektName };
  }
}
