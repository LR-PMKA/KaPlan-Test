/**
 * Rahmen der Leistungsnachweise: Seitenleiste, Kopfzeile, Hinweis nach einem
 * Ladefehler und Auswahl der Ansicht. Der Excel-Import ist projektübergreifend
 * und öffnet sich aus der Seitenleiste und der Übersicht.
 */
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../../shared/icons';
import { KaPlanLogo, MailaenderLogo } from '../../shared/logos';
import { useToast } from '../../shared/toast';
import { Callout, Card, ConfirmDialog, EmptyState, Field, Modal, Select, TextInput } from '../../shared/ui';
import { BereichWechsel } from '../../shell/BereichWechsel';
import { ImportDialog } from './components/ImportDialog';
import { SicherungEinspielenDialog, SicherungKnopf, SicherungWaehlen, type Sicherung } from './components/Sicherung';
import { mitarbeiterAuswahlText, nachNamen } from './components/common';
import { leistungenOhneNachweis, nachweisTitel } from './domain/nachweis';
import { STANDARD_BEARBEITER, mitarbeiterName, projektTitel, type Leistungsnachweis, type Projekt } from './domain/types';
import { useRoute, type Route } from './lib/router';
import { Mitarbeiter } from './pages/Mitarbeiter';
import { ProjektDetail } from './pages/ProjektDetail';
import { Projekte } from './pages/Projekte';
import { NachweisEditor } from './pages/projekt/NachweisEditor';
import { Uebersicht, sichtbareProjekte } from './pages/Uebersicht';
import { rohdatenHerunterladen } from './store/storage';
import { useStore } from './store/store';

export function App() {
  const { data, ladeZustand, zuruecksetzen } = useStore();
  const toast = useToast();
  const [route, navigate] = useRoute();
  const [menuOffen, setMenuOffen] = useState(false);
  const [bearbeiterDialog, setBearbeiterDialog] = useState(false);
  const [zuruecksetzenDialog, setZuruecksetzenDialog] = useState(false);
  const [sicherung, setSicherung] = useState<Sicherung | null>(null);
  const [importOffen, setImportOffen] = useState(false);

  const markierte = sichtbareProjekte(data.projekte);
  const sichtbar = new Set(markierte.map((p) => p.id));
  const ohneNachweis = leistungenOhneNachweis(data).filter((l) => sichtbar.has(l.projektId)).length;
  const projekt =
    route.view === 'projekt' || route.view === 'nachweis'
      ? data.projekte.find((p) => p.id === route.projektId)
      : undefined;
  const nachweis =
    route.view === 'nachweis'
      ? data.nachweise.find((n) => n.id === route.nachweisId && n.projektId === route.projektId)
      : undefined;
  const ich = data.mitarbeiter.find((m) => m.id === data.einstellungen.mitarbeiterId);

  const gehe = (r: Route) => {
    navigate(r);
    setMenuOffen(false);
  };

  const importOeffnen = () => {
    setImportOffen(true);
    setMenuOffen(false);
  };

  const farbmodus = data.einstellungen.farbmodus;
  useEffect(() => {
    // Eigene Einstellung dieses Bereichs – unabhängig von den anderen Bereichen.
    document.documentElement.dataset.farbmodus = farbmodus;
  }, [farbmodus]);

  const kopf = kopfzeile(route, projekt, nachweis);

  return (
    <div className="app ln-app">
      <aside className={`sidebar ${menuOffen ? 'open' : ''}`}>
        <button type="button" className="sidebar-brand" onClick={() => gehe({ view: 'uebersicht' })} title="Zur Übersicht">
          <KaPlanLogo variante="Leistungsnachweise" width="100%" />
        </button>

        <NavItem
          icon="dashboard"
          label="Übersicht"
          aktiv={route.view === 'uebersicht'}
          badge={ohneNachweis > 0 ? String(ohneNachweis) : undefined}
          badgeAlarm
          titel={ohneNachweis > 0 ? `Übersicht – ${ohneNachweis} Leistungen ohne Leistungsnachweis` : undefined}
          onClick={() => gehe({ view: 'uebersicht' })}
        />
        <NavItem icon="projekt" label="Projekte" aktiv={route.view === 'projekte'} onClick={() => gehe({ view: 'projekte' })} />
        <NavItem
          icon="person"
          label="Mitarbeiter"
          aktiv={route.view === 'mitarbeiter'}
          onClick={() => gehe({ view: 'mitarbeiter' })}
        />
        <NavItem
          icon="importieren"
          label="Excel-Import"
          aktiv={false}
          titel="Leistungen aus der Zeiterfassung (Excel) übernehmen"
          onClick={importOeffnen}
        />

        <div className="nav-group-label">
          Projekte
          {markierte.length < data.projekte.length ? <span className="tertiary"> (markierte)</span> : null}
        </div>
        {markierte.map((p) => {
          const offen = data.nachweise.filter((n) => n.projektId === p.id && n.status === 'entwurf').length;
          return (
            <NavItem
              key={p.id}
              icon="stunden"
              label={projektTitel(p)}
              aktiv={projekt?.id === p.id}
              badge={offen > 0 ? String(offen) : undefined}
              titel={offen > 0 ? `${projektTitel(p)} – ${offen} Leistungsnachweise in Bearbeitung` : undefined}
              onClick={() => gehe({ view: 'projekt', projektId: p.id, tab: 'nachweise' })}
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
              {ich ? <span className="truncate ln-erfasst-als">erfasst als {ich.kuerzel || mitarbeiterName(ich)}</span> : null}
            </span>
          </button>
          <div className="sicherung-knoepfe">
            <SicherungKnopf />
            <SicherungWaehlen onGelesen={setSicherung} />
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setZuruecksetzenDialog(true)}
              disabled={ladeZustand === 'neuere_fassung'}
              title={
                ladeZustand === 'neuere_fassung'
                  ? 'Gesperrt, damit der Stand aus der neueren Fassung erhalten bleibt'
                  : undefined
              }
            >
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
            <LadeHinweis />
            {route.view === 'uebersicht' ? <Uebersicht navigate={gehe} onImport={importOeffnen} /> : null}
            {route.view === 'projekte' ? <Projekte navigate={gehe} /> : null}
            {route.view === 'mitarbeiter' ? <Mitarbeiter /> : null}
            {route.view === 'projekt' ? (
              projekt ? (
                <ProjektDetail projekt={projekt} tab={route.tab} navigate={gehe} />
              ) : (
                <NichtGefunden label="Zu den Projekten" onZurueck={() => gehe({ view: 'projekte' })} />
              )
            ) : null}
            {route.view === 'nachweis' ? (
              projekt && nachweis ? (
                <NachweisEditor key={nachweis.id} projekt={projekt} nachweis={nachweis} navigate={gehe} />
              ) : (
                <NichtGefunden
                  label={projekt ? 'Zu den Leistungsnachweisen' : 'Zu den Projekten'}
                  onZurueck={() =>
                    gehe(projekt ? { view: 'projekt', projektId: projekt.id, tab: 'nachweise' } : { view: 'projekte' })
                  }
                />
              )
            ) : null}
          </div>
        </div>
      </main>

      {menuOffen ? (
        <div className="overlay" style={{ background: 'rgba(0,0,0,0.18)', zIndex: 80 }} onClick={() => setMenuOffen(false)} />
      ) : null}

      {bearbeiterDialog ? <BearbeiterDialog onClose={() => setBearbeiterDialog(false)} /> : null}

      {importOffen ? <ImportDialog onClose={() => setImportOffen(false)} navigate={gehe} /> : null}

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
          text="Alle lokal gespeicherten Projekte, Mitarbeiter, Leistungen und Leistungsnachweise dieses Bereichs werden verworfen und der Demodatenbestand wird neu geladen. Die anderen Bereiche bleiben unberührt."
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

/**
 * Hinweis über dem Inhalt, solange der gespeicherte Stand nicht geladen werden
 * konnte oder aus einer neueren Fassung stammt. Der Bereich zeigt dann
 * Demodaten und speichert nichts (store/storage.ts `ladeDaten`).
 */
function LadeHinweis() {
  const { ladeZustand, zuruecksetzen } = useStore();
  const toast = useToast();
  const [neuBeginnen, setNeuBeginnen] = useState(false);

  if (ladeZustand === 'ok') return null;

  const gespeichertHerunterladen = () => {
    if (!rohdatenHerunterladen()) toast('Es ist kein gespeicherter Stand vorhanden, der sich herunterladen ließe.');
  };

  return (
    <div className="ln-ladehinweis" role="alert">
      {ladeZustand === 'ladefehler' ? (
        <Callout ton="error" icon="!">
          <strong>Der gespeicherte Stand ließ sich nicht laden.</strong> Angezeigt werden Demodaten. Damit der gespeicherte
          Stand erhalten bleibt, wird nichts gespeichert – bitte herunterladen und aufbewahren.
          <div className="row wrap ln-ladehinweis-knoepfe">
            <button type="button" className="btn btn-sm btn-outline" onClick={gespeichertHerunterladen}>
              Gespeicherten Stand herunterladen
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setNeuBeginnen(true)}>
              Mit Demodaten neu beginnen
            </button>
          </div>
        </Callout>
      ) : (
        <Callout ton="warn" icon="!">
          <strong>Die gespeicherten Daten stammen aus einer neueren Fassung von KaPlan.</strong> Diese Seite zeigt Demodaten
          und speichert nichts, damit der neuere Stand erhalten bleibt. Bitte die Seite neu laden.
          <div className="row wrap ln-ladehinweis-knoepfe">
            <button type="button" className="btn btn-sm btn-outline" onClick={() => window.location.reload()}>
              Seite neu laden
            </button>
          </div>
        </Callout>
      )}
      {neuBeginnen ? (
        <ConfirmDialog
          titel="Mit Demodaten neu beginnen?"
          text="Der gespeicherte, nicht lesbare Stand wird durch die Demodaten ersetzt. Wer ihn noch braucht, lädt ihn vorher herunter."
          bestaetigenLabel="Neu beginnen"
          onConfirm={() => {
            zuruecksetzen();
            toast('Mit Demodaten neu begonnen.');
          }}
          onClose={() => setNeuBeginnen(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * „Angemeldet als“: Name der Person, der Mitarbeiter, als der sie Leistungen
 * erfasst („Ich erfasse als“), und der Farbmodus.
 */
function BearbeiterDialog({ onClose }: { onClose: () => void }) {
  const { data, setEinstellungen } = useStore();
  const [name, setName] = useState(data.einstellungen.bearbeiter);
  const [mitarbeiterId, setMitarbeiterId] = useState(data.einstellungen.mitarbeiterId ?? '');
  const [kontrast, setKontrast] = useState(data.einstellungen.farbmodus === 'kontrast');

  // Zur Wahl stehen die aktiven Mitarbeiter – und die bisher gewählte Person, auch wenn sie ausgeschieden ist
  const wahl = data.mitarbeiter
    .filter((m) => m.aktiv || m.id === data.einstellungen.mitarbeiterId)
    .sort(nachNamen);
  const optionen = [{ value: '', label: '– keiner –' }, ...wahl.map((m) => ({ value: m.id, label: mitarbeiterAuswahlText(m) }))];

  const mitarbeiterWaehlen = (id: string) => {
    setMitarbeiterId(id);
    const m = data.mitarbeiter.find((x) => x.id === id);
    if (!m) return;
    // Den Namen nur vorschlagen: Ein selbst gewählter Name bleibt stehen
    const bisher = name.trim();
    const vorgeschlagen = !bisher || bisher === STANDARD_BEARBEITER || data.mitarbeiter.some((x) => mitarbeiterName(x) === bisher);
    if (vorgeschlagen) setName(mitarbeiterName(m));
  };

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
                mitarbeiterId: mitarbeiterId || null,
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
        <Field label="Name" full hint="Steht in der Seitenleiste; die Auswahl darunter schlägt ihn vor.">
          <TextInput value={name} onChange={setName} placeholder="Vor- und Nachname" />
        </Field>
        <Field
          label="Ich erfasse als"
          full
          hint="Diese Person wird beim Erfassen von Leistungen und für Importzeilen ohne Mitarbeiter vorgegeben."
        >
          <Select value={mitarbeiterId} onChange={mitarbeiterWaehlen} options={optionen} />
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
        Die Einstellungen gelten nur für die Leistungsnachweise; die anderen Bereiche führen eigene.
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
  titel,
  onClick,
}: {
  icon: IconName;
  label: string;
  aktiv: boolean;
  badge?: string;
  badgeAlarm?: boolean;
  /** Tooltip; ohne Angabe die Beschriftung. */
  titel?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`nav-item ${aktiv ? 'active' : ''}`} onClick={onClick} title={titel ?? label}>
      <span className="nav-icon">
        <Icon name={icon} size={16} />
      </span>
      <span className="nav-label">{label}</span>
      {badge ? <span className={`nav-badge ${badgeAlarm ? 'alert' : ''}`}>{badge}</span> : null}
    </button>
  );
}

function NichtGefunden({ label, onZurueck }: { label: string; onZurueck: () => void }) {
  return (
    <Card>
      <EmptyState
        icon="projekt"
        titel="Nicht gefunden"
        text="Der aufgerufene Eintrag existiert nicht (mehr) – etwa weil das Projekt oder der Leistungsnachweis gelöscht wurde."
        action={
          <button type="button" className="btn btn-primary" onClick={onZurueck}>
            {label}
          </button>
        }
      />
    </Card>
  );
}

function kopfzeile(route: Route, projekt?: Projekt, nachweis?: Leistungsnachweis): { titel: string; sub?: string } {
  switch (route.view) {
    case 'uebersicht':
      return { titel: 'Übersicht', sub: 'Leistungsnachweise und Stunden aller Projekte' };
    case 'projekte':
      return { titel: 'Projekte', sub: 'Projektverwaltung' };
    case 'mitarbeiter':
      return { titel: 'Mitarbeiter', sub: 'Projektübergreifend – wer Leistungen erbringt' };
    case 'projekt':
      return { titel: projekt?.name ?? 'Projekt', sub: 'Projektarbeitsbereich' };
    case 'nachweis':
      return { titel: nachweis ? nachweisTitel(nachweis) : 'Leistungsnachweis', sub: projekt ? projektTitel(projekt) : undefined };
  }
}
