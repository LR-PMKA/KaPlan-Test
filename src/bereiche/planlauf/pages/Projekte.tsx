/** Projektliste mit Anlage- und Bearbeitungsdialog. */
import { useState } from 'react';
import { offeneFristen } from '../domain/engine';
import type { Project, ProjectStatus } from '../domain/types';
import type { Route } from '../lib/router';
import { useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import { Badge, Card, EmptyState, Field, Modal, Search, Select, TextArea, TextInput } from '../../../shared/ui';
import { Icon } from '../../../shared/icons';

const STATUS_OPTIONEN = [
  { value: 'aktiv', label: 'Aktiv' },
  { value: 'pausiert', label: 'Pausiert' },
  { value: 'abgeschlossen', label: 'Abgeschlossen' },
];

const STATUS_TON: Record<ProjectStatus, '' | 'green' | 'orange'> = {
  aktiv: 'green',
  pausiert: 'orange',
  abgeschlossen: '',
};

export function Projekte({ navigate }: { navigate: (r: Route) => void }) {
  const { data, toggleMarkiert } = useStore();
  const [suche, setSuche] = useState('');
  const [dialog, setDialog] = useState<{ project?: Project } | null>(null);

  const projekte = data.projects.filter((p) =>
    [p.name, p.nummer, p.beschreibung].join(' ').toLowerCase().includes(suche.toLowerCase()),
  );

  return (
    <div className="stack">
      <div className="row-between wrap">
        <div className="row wrap">
          <Search value={suche} onChange={setSuche} placeholder="Projekt, Nummer, Bauherr …" />
          <span className="small tertiary">
            Alle Bearbeiter sehen alle Projekte. Mit ★ markierte Projekte erscheinen in der Übersicht und in der
            Seitenleiste.
          </span>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setDialog({})}>
          <Icon name="plus" size={14} /> Neues Projekt
        </button>
      </div>

      {projekte.length === 0 ? (
        <Card>
          <EmptyState
            icon="projekt"
            titel="Kein Projekt gefunden"
            text="Legen Sie ein Projekt an, um Planpakete und Planläufe zu verwalten."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setDialog({})}>
                <Icon name="plus" size={14} /> Neues Projekt
              </button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-2">
          {projekte.map((p) => {
            const fristen = offeneFristen(data, [p.id]);
            const ueberfaellig = fristen.filter((f) => f.ampel === 'ueberfaellig').length;
            const laeufe = data.runs.filter((r) => r.projectId === p.id && r.status === 'laufend').length;
            const dokumente = data.documents.filter((d) => d.projectId === p.id).length;
            return (
              <button
                key={p.id}
                type="button"
                className="card card-click"
                onClick={() => navigate({ view: 'projekt', projectId: p.id, tab: 'uebersicht' })}
              >
                <div className="card-pad">
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="mono tertiary">{p.nummer}</div>
                      <h2 style={{ marginTop: 2 }}>{p.name}</h2>
                      {p.beschreibung ? (
                        <div className="small muted truncate" style={{ marginTop: 3 }}>
                          {p.beschreibung}
                        </div>
                      ) : null}
                    </div>
                    <span className="row" style={{ gap: 6 }}>
                      <Badge ton={STATUS_TON[p.status]}>{STATUS_OPTIONEN.find((s) => s.value === p.status)?.label}</Badge>
                      <span
                        role="button"
                        tabIndex={0}
                        className={`stern ${p.markiert ? 'aktiv' : ''}`}
                        title={p.markiert ? 'Markierung aufheben' : 'Projekt markieren – erscheint in Übersicht und Seitenleiste'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMarkiert(p.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleMarkiert(p.id);
                          }
                        }}
                      >
                        {p.markiert ? '★' : '☆'}
                      </span>
                    </span>
                  </div>

                  <div className="row wrap" style={{ gap: 16, marginTop: 14 }}>
                    <span className="small muted">
                      <b>{dokumente}</b> Pläne / Pakete
                    </span>
                    <span className="small muted">
                      <b>{laeufe}</b> laufende Planläufe
                    </span>
                    {ueberfaellig > 0 ? (
                      <Badge ton="red">{ueberfaellig} überfällig</Badge>
                    ) : (
                      <Badge ton="green">im Plan</Badge>
                    )}
                  </div>


                </div>
              </button>
            );
          })}
        </div>
      )}

      {dialog ? <ProjektDialog project={dialog.project} onClose={() => setDialog(null)} navigate={navigate} /> : null}
    </div>
  );
}

export function ProjektDialog({
  project,
  onClose,
  navigate,
}: {
  project?: Project;
  onClose: () => void;
  navigate?: (r: Route) => void;
}) {
  const { data, addProject, updateProject, addRole } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({
    nummer: project?.nummer ?? '',
    name: project?.name ?? '',
    status: project?.status ?? ('aktiv' as ProjectStatus),
    markiert: project?.markiert ?? true,
    beschreibung: project?.beschreibung ?? '',
  });

  const set = <K extends keyof typeof form>(key: K, wert: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: wert }));

  const speichern = () => {
    if (!form.name.trim()) {
      toast('Bitte einen Projektnamen angeben.');
      return;
    }
    if (project) {
      updateProject(project.id, form);
      toast('Projekt aktualisiert.');
      onClose();
      return;
    }
    const id = addProject({
      ...form,
      settings: {
        erinnerungVorlaufTage: 5,
        fristenInArbeitstagen: true,
        feiertage: [],
        absenderName: '',
        absenderEmail: '',
      },
    });
    // Funktionen als Projektfunktionen übernehmen
    data.standardRollen.forEach((r) =>
      addRole({
        projectId: id,
        name: r.name,
        kuerzel: r.kuerzel,
        farbe: r.farbe,
        beschreibung: r.beschreibung,
        gewerk: r.gewerk,
        seite: r.seite ?? null,
      }),
    );
    toast('Projekt angelegt – die Funktionen wurden übernommen.');
    onClose();
    navigate?.({ view: 'projekt', projectId: id, tab: 'uebersicht' });
  };

  return (
    <Modal
      titel={project ? 'Projekt bearbeiten' : 'Neues Projekt'}
      sub={project ? project.nummer : 'Grunddaten erfassen – Rollen und Vorlagen werden vorbelegt'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={speichern}>
            {project ? 'Speichern' : 'Projekt anlegen'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Projektnummer">
          <TextInput value={form.nummer} onChange={(v) => set('nummer', v)} placeholder="2026-001" />
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(v) => set('status', v as ProjectStatus)} options={STATUS_OPTIONEN} />
        </Field>
        <Field label="Projektname" full>
          <TextInput value={form.name} onChange={(v) => set('name', v)} placeholder="Neubau …" />
        </Field>
        <Field label="Beschreibung" full>
          <TextArea value={form.beschreibung} onChange={(v) => set('beschreibung', v)} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}
