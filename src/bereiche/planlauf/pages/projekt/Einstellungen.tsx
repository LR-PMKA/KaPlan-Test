/** Projekteinstellungen: Fristenrechnung, Erinnerungen und E-Mail-Vorlagen. */
import { useState } from 'react';
import { type Project } from '../../domain/types';
import { useStore } from '../../store/store';
import { useToast } from '../../../../shared/toast';
import { ProjektDialog } from '../Projekte';
import { ExportDialog } from './ExportDialog';
import {
  Callout,
  Card,
  CardHeader,
  ConfirmDialog,
  Field,
  TextInput,
} from '../../../../shared/ui';
import { Icon } from '../../../../shared/icons';

export function Einstellungen({ project }: { project: Project }) {
  const { updateProject, deleteProject } = useStore();
  const toast = useToast();
  const [projektDialog, setProjektDialog] = useState(false);
  const [loeschen, setLoeschen] = useState(false);
  const [neuerFeiertag, setNeuerFeiertag] = useState('');
  const [exportOffen, setExportOffen] = useState(false);

  const s = project.settings;
  const setSettings = (patch: Partial<typeof s>) => updateProject(project.id, { settings: { ...s, ...patch } });

  return (
    <div className="stack">
      <Card>
        <CardHeader
          titel="Projektdaten"
          sub="Grunddaten des Projekts"
          actions={
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setProjektDialog(true)}>
              <Icon name="bearbeiten" size={13} /> Bearbeiten
            </button>
          }
        />
        <div className="card-pad">
          <dl className="kv">
            <dt>Projektnummer</dt>
            <dd className="mono">{project.nummer || '–'}</dd>
            <dt>Beschreibung</dt>
            <dd>{project.beschreibung || '–'}</dd>
          </dl>
        </div>
      </Card>

      <Card>
        <CardHeader titel="Fristen & Erinnerungen" sub="Grundlage der Soll-Termin-Berechnung" />
        <div className="card-pad">
          <div className="form-grid">
            <Field label="Vorlaufzeit für Erinnerungen (Tage)" hint="Ab wann ein Schritt als „fällig“ gemeldet wird.">
              <TextInput
                value={String(s.erinnerungVorlaufTage)}
                onChange={(v) => setSettings({ erinnerungVorlaufTage: Number(v.replace(/\D/g, '')) || 0 })}
                inputMode="numeric"
              />
            </Field>
            <Field label="Fristenrechnung">
              <label className="checkbox" style={{ paddingTop: 7 }}>
                <input
                  type="checkbox"
                  checked={s.fristenInArbeitstagen}
                  onChange={(e) => setSettings({ fristenInArbeitstagen: e.target.checked })}
                />
                In Arbeitstagen rechnen (Mo–Fr, ohne Feiertage)
              </label>
            </Field>
            <Field label="Absendername" hint="wird als {{absender}} in E-Mails eingesetzt">
              <TextInput value={s.absenderName} onChange={(v) => setSettings({ absenderName: v })} />
            </Field>
            <Field label="Absender-E-Mail">
              <TextInput value={s.absenderEmail} onChange={(v) => setSettings({ absenderEmail: v })} type="email" />
            </Field>
            <Field label="Feiertage" full hint="Werden bei der Fristenrechnung in Arbeitstagen übersprungen.">
              <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
                {s.feiertage.length === 0 ? <span className="tertiary small">keine hinterlegt</span> : null}
                {s.feiertage.map((f) => (
                  <span key={f} className="badge">
                    {new Date(f).toLocaleDateString('de-DE')}
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ padding: 0, marginLeft: 2 }}
                      onClick={() => setSettings({ feiertage: s.feiertage.filter((x) => x !== f) })}
                      aria-label="Feiertag entfernen"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="row">
                <TextInput value={neuerFeiertag} onChange={setNeuerFeiertag} type="date" />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    if (!neuerFeiertag || s.feiertage.includes(neuerFeiertag)) return;
                    setSettings({ feiertage: [...s.feiertage, neuerFeiertag].sort() });
                    setNeuerFeiertag('');
                  }}
                >
                  <Icon name="plus" size={14} />
                </button>
              </div>
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          titel="Export"
          sub="Planläufe als Excel-Datei oder PDF ausgeben"
          actions={
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setExportOffen(true)}>
              <Icon name="export" size={13} /> Export
            </button>
          }
        />
        <div className="card-pad">
          <p className="small muted">
            Auswahl der Einträge nach Planpaketen gegliedert, wahlweise als Kurz- oder Langfassung – auch über „Export“ im Reiter „Planläufe“.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader titel="E-Mail-Texte" sub="Projektübergreifend im Reiter „Vorlagen“ gepflegt" />
        <div className="card-pad">
          <Callout icon="i">
            Die Standardtexte der E-Mails stehen unter <strong>Vorlagen</strong> in der Seitenleiste. Sie gelten
            für alle Projekte; Absender und Vorlaufzeit bleiben projektbezogen.
          </Callout>
        </div>
      </Card>

      <Card>
        <CardHeader titel="Projekt löschen" sub="Entfernt Pläne, Rollen und Planläufe dauerhaft" />
        <div className="card-pad">
          <button type="button" className="btn btn-danger" onClick={() => setLoeschen(true)}>
            <Icon name="loeschen" size={14} /> Projekt löschen
          </button>
        </div>
      </Card>

      {exportOffen ? <ExportDialog project={project} onClose={() => setExportOffen(false)} /> : null}
      {projektDialog ? <ProjektDialog project={project} onClose={() => setProjektDialog(false)} /> : null}
      {loeschen ? (
        <ConfirmDialog
          titel="Projekt löschen?"
          text={`„${project.name}“ wird mit allen Plänen, Kontakten und Planläufen gelöscht.`}
          onConfirm={() => {
            deleteProject(project.id);
            toast('Projekt gelöscht.');
            window.location.hash = '#/projekte';
          }}
          onClose={() => setLoeschen(false)}
        />
      ) : null}
    </div>
  );
}
