/** Rahmen der Projektsteuerung: Seitenleiste, Kopfzeile und Auswahl der Ansicht. */
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../../shared/icons';
import { KaPlanLogo, MailaenderLogo } from '../../shared/logos';
import { useToast } from '../../shared/toast';
import { Card, ConfirmDialog, EmptyState, Field, Modal, TextInput } from '../../shared/ui';
import { BereichWechsel } from '../../shell/BereichWechsel';
import { SicherungEinspielenDialog, SicherungWaehlen, type Sicherung } from './components/Sicherung';
import { bezeichnung } from './domain/protokoll';
import { offenePunkte } from './domain/punkte';
import { STANDARD_BEARBEITER } from './domain/types';
import { useRoute, type Route } from './lib/router';
import { Funktionen } from './pages/Funktionen';
import { ProjektDetail } from './pages/ProjektDetail';
import { Projekte } from './pages/Projekte';
import { ProtokollEditor } from './pages/projekt/ProtokollEditor';
import { Uebersicht, sichtbareProjekte } from './pages/Uebersicht';
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
  const ueberfaellig = offenePunkte(data, markierte.map((p) => p.id)).filter((p) => p.ampel === 'ueberfaellig');
  const projekt =
    route.view === 'projekt' || route.view === 'protokoll'
      ? data.projekte.find((p) => p.id === route.projektId)
      : undefined;
  const protokoll =
    route.view === 'protokoll'
      ? data.protokolle.find((p) => p.id === route.protokollId && p.projektId === route.projektId)
      : undefined;

  const gehe = (r: Route) => {
    navigate(r);
    setMenuOffen(false);
  };

  const farbmodus = data.einstellungen.farbmodus;
  useEffect(() => {
    // Eigene Einstellung dieses Bereichs – unabhängig von den anderen Bereichen.
    document.documentElement.dataset.farbmodus = farbmodus;
  }, [farbmodus]);

  const kopf = kopfzeile(route, projekt?.name, protokoll ? bezeichnung(protokoll) : undefined);

  return (
    <div className="app">
      <aside className={`sidebar ${menuOffen ? 'open' : ''}`}>
        <button type="button" className="sidebar-brand" onClick={() => gehe({ view: 'uebersicht' })} title="Zur Übersicht">
          <KaPlanLogo variante="Projektsteuerung" width="100%" />
        </button>

        <NavItem
          icon="dashboard"
          label="Übersicht"
          aktiv={route.view === 'uebersicht'}
          badge={ueberfaellig.length > 0 ? String(ueberfaellig.length) : undefined}
          badgeAlarm
          onClick={() => gehe({ view: 'uebersicht' })}
        />
        <NavItem icon="projekt" label="Projekte" aktiv={route.view === 'projekte'} onClick={() => gehe({ view: 'projekte' })} />
        <NavItem icon="person" label="Funktionen" aktiv={route.view === 'funktionen'} onClick={() => gehe({ view: 'funktionen' })} />

        <div className="nav-group-label">
          Projekte
          {markierte.length < data.projekte.length ? <span className="tertiary"> (markierte)</span> : null}
        </div>
        {markierte.map((p) => {
          const spaet = ueberfaellig.filter((x) => x.projekt.id === p.id).length;
          return (
            <NavItem
              key={p.id}
              icon="projekt"
              label={p.nummer ? `${p.nummer} ${p.name}` : p.name}
              aktiv={projekt?.id === p.id}
              badge={spaet > 0 ? String(spaet) : undefined}
              badgeAlarm
              onClick={() => gehe({ view: 'projekt', projektId: p.id, tab: 'beteiligte' })}
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
              title="Gesamten Datenbestand der Projektsteuerung als JSON sichern"
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
            {route.view === 'projekte' ? <Projekte navigate={gehe} /> : null}
            {route.view === 'funktionen' ? <Funktionen /> : null}
            {route.view === 'projekt' ? (
              projekt ? (
                <ProjektDetail projekt={projekt} tab={route.tab} navigate={gehe} />
              ) : (
                <NichtGefunden onZurueck={() => gehe({ view: 'projekte' })} />
              )
            ) : null}
            {route.view === 'protokoll' ? (
              projekt && protokoll ? (
                <ProtokollEditor key={protokoll.id} projekt={projekt} protokoll={protokoll} navigate={gehe} />
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
          text="Alle lokal gespeicherten Projekte, Projektbeteiligten und Protokolle der Projektsteuerung werden verworfen und der Demodatenbestand samt Standard-Funktionen wird neu geladen. Die anderen Bereiche bleiben unberührt."
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
        <Field
          label="Name"
          full
          hint="Steht dieser Name in der Projektbeteiligtenliste, übernehmen Sie die Protokollführung neuer Protokollreihen."
        >
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
        Die Einstellungen gelten nur für die Projektsteuerung; die anderen Bereiche führen eigene.
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
        text="Der aufgerufene Eintrag existiert nicht (mehr) – etwa weil das Projekt oder Protokoll gelöscht wurde."
        action={
          <button type="button" className="btn btn-primary" onClick={onZurueck}>
            Zu den Projekten
          </button>
        }
      />
    </Card>
  );
}

function kopfzeile(route: Route, projektName?: string, protokollName?: string): { titel: string; sub?: string } {
  switch (route.view) {
    case 'uebersicht':
      return { titel: 'Übersicht', sub: 'Offene Punkte und Besprechungen aller Projekte' };
    case 'projekte':
      return { titel: 'Projekte', sub: 'Projektverwaltung' };
    case 'funktionen':
      return { titel: 'Funktionen', sub: 'Projektübergreifend, gegliedert nach Gewerken' };
    case 'projekt':
      return { titel: projektName ?? 'Projekt', sub: 'Projektarbeitsbereich' };
    case 'protokoll':
      return { titel: protokollName ?? 'Protokoll', sub: projektName };
  }
}
