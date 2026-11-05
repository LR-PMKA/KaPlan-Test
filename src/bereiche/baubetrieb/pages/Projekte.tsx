/** Projekte: Liste mit Anlage- und Bearbeitungsdialog. */
import { useState } from 'react';
import { formatDate, today } from '../../../shared/dates';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Badge, Card, EmptyState, Field, Modal, Search, Select, TextArea, TextInput } from '../../../shared/ui';
import {
  anmeldebedarf,
  erstanmeldungAusstehend,
  ersterTerminVorschlag,
  fahrplanjahrBeginn,
  fahrplanjahrEnde,
  fahrplanjahrVon,
  naechsterBedarf,
  offeneTermine,
} from '../domain/fristen';
import {
  ERSTE_PHASE_LABEL,
  PROJEKT_STATUS_LABEL,
  RIL_LABEL,
  type ErstePhase,
  type Projekt,
  type ProjektStatus,
} from '../domain/types';
import type { Route } from '../lib/router';
import { useStore } from '../store/store';

export const PROJEKT_STATUS_TON: Record<ProjektStatus, '' | 'green' | 'orange'> = {
  aktiv: 'green',
  pausiert: 'orange',
  abgeschlossen: '',
};

export function Projekte({ navigate }: { navigate: (r: Route) => void }) {
  const { data, toggleMarkiert } = useStore();
  const [suche, setSuche] = useState('');
  const [dialog, setDialog] = useState(false);

  const projekte = data.projekte.filter((p) =>
    [p.name, p.dbGNummer, p.projektnummer, p.projektleiter, p.hauptbearbeiter, p.bemerkung]
      .join(' ')
      .toLowerCase()
      .includes(suche.toLowerCase()),
  );

  return (
    <div className="stack">
      <div className="row-between wrap">
        <div className="row wrap">
          <Search value={suche} onChange={setSuche} placeholder="Bezeichnung, DB-G-Nr., MIC-Nr. …" />
          <span className="small tertiary">
            Das Projekt wird bei der MIC-Beauftragung angelegt. Mit ★ markierte erscheinen in der Übersicht und
            in der Seitenleiste.
          </span>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setDialog(true)}>
          <Icon name="plus" size={14} /> Neues Projekt
        </button>
      </div>

      {projekte.length === 0 ? (
        <Card>
          <EmptyState
            icon="projekt"
            titel="Kein Projekt gefunden"
            text="Legen Sie ein Projekt an, um die baubetrieblichen Anmeldungen der Maßnahme zu verfolgen."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setDialog(true)}>
                <Icon name="plus" size={14} /> Neues Projekt
              </button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-2">
          {projekte.map((p) => {
            const anzahl = data.anmeldungen.filter((a) => a.projektId === p.id).length;
            const termine = offeneTermine(data, [p.id]);
            const ueberfaellig =
              termine.filter((t) => t.ampel === 'ueberfaellig').length +
              (erstanmeldungAusstehend(p, data)?.ampel === 'ueberfaellig' ? 1 : 0);
            const bedarf = naechsterBedarf(anmeldebedarf(p, data));
            return (
              <button
                key={p.id}
                type="button"
                className="card card-click"
                onClick={() => navigate({ view: 'projekt', projektId: p.id })}
              >
                <div className="card-pad">
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="mono tertiary">
                        {[p.dbGNummer, p.projektnummer].filter(Boolean).join(' · ') || 'ohne Nummer'}
                      </div>
                      <h2 style={{ marginTop: 2 }}>{p.name}</h2>
                      <div className="small muted truncate" style={{ marginTop: 3 }}>
                        {p.fahrplanjahre.length > 0 ? `Fahrplanjahre ${p.fahrplanjahre.join(', ')}` : 'ohne Fahrplanjahr'}
                        {p.hauptbearbeiter ? ` · ${p.hauptbearbeiter}` : ''}
                      </div>
                    </div>
                    <span className="row" style={{ gap: 6 }}>
                      <Badge ton={PROJEKT_STATUS_TON[p.status]}>{PROJEKT_STATUS_LABEL[p.status]}</Badge>
                      <span
                        role="button"
                        tabIndex={0}
                        className={`stern ${p.markiert ? 'aktiv' : ''}`}
                        title={p.markiert ? 'Markierung aufheben' : 'Markieren – erscheint in Übersicht und Seitenleiste'}
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
                      <b>{anzahl}</b> {anzahl === 1 ? 'Anmeldung' : 'Anmeldungen'}
                    </span>
                    {ueberfaellig > 0 ? (
                      <Badge ton="red">{ueberfaellig} überfällig</Badge>
                    ) : (
                      <Badge ton="green">im Plan</Badge>
                    )}
                    {bedarf ? (
                      <span className="small muted">
                        Nächste Anmeldung: <b>{RIL_LABEL[bedarf.phase]}</b> FPJ {bedarf.fahrplanjahr} bis{' '}
                        <b>{formatDate(bedarf.frist)}</b>
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {dialog ? <ProjektDialog onClose={() => setDialog(false)} navigate={navigate} /> : null}
    </div>
  );
}

export function ProjektDialog({
  projekt,
  onClose,
  navigate,
}: {
  projekt?: Projekt;
  onClose: () => void;
  navigate?: (r: Route) => void;
}) {
  const { data, addProjekt, updateProjekt } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({
    name: projekt?.name ?? '',
    projektleiter: projekt?.projektleiter ?? '',
    dbGNummer: projekt?.dbGNummer ?? '',
    ersterAnmeldetermin: projekt?.ersterAnmeldetermin ?? '',
    erstePhase: projekt?.erstePhase ?? ('skm' as ErstePhase),
    fahrplanjahre: projekt?.fahrplanjahre ?? [],
    inbetriebnahme: projekt?.inbetriebnahme ?? '',
    hauptbearbeiter: projekt?.hauptbearbeiter ?? data.einstellungen.bearbeiter,
    projektnummer: projekt?.projektnummer ?? '',
    status: projekt?.status ?? ('aktiv' as ProjektStatus),
    bemerkung: projekt?.bemerkung ?? '',
  });
  const set = <K extends keyof typeof form>(key: K, wert: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: wert }));

  const vorschlag = ersterTerminVorschlag(form, data.einstellungen);

  // Zur Wahl: das vorige bis zehn Jahre nach dem laufenden Fahrplanjahr, dazu bereits gewählte
  const jetzt = fahrplanjahrVon(today()) ?? new Date().getFullYear();
  const jahre = [
    ...new Set([...Array.from({ length: 12 }, (_, i) => jetzt - 1 + i), ...form.fahrplanjahre]),
  ].sort((a, b) => a - b);
  const jahrUmschalten = (n: number, an: boolean) =>
    set(
      'fahrplanjahre',
      (an ? [...form.fahrplanjahre, n] : form.fahrplanjahre.filter((x) => x !== n)).sort((a, b) => a - b),
    );

  const speichern = () => {
    if (!form.name.trim()) {
      toast('Bitte eine Bezeichnung angeben.');
      return;
    }
    const werte = {
      ...form,
      name: form.name.trim(),
      ersterAnmeldetermin: form.ersterAnmeldetermin || null,
      inbetriebnahme: form.inbetriebnahme || null,
    };
    if (projekt) {
      updateProjekt(projekt.id, werte);
      toast('Projekt gespeichert.');
      onClose();
      return;
    }
    const id = addProjekt({ ...werte, markiert: true });
    toast('Projekt angelegt.');
    onClose();
    navigate?.({ view: 'projekt', projektId: id });
  };

  return (
    <Modal
      titel={projekt ? 'Projekt bearbeiten' : 'Neues Projekt'}
      sub={projekt ? projekt.name : 'Wird bei der MIC-Beauftragung angelegt'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={speichern}>
            {projekt ? 'Speichern' : 'Anlegen'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Bezeichnung" full>
          <TextInput value={form.name} onChange={(v) => set('name', v)} placeholder="EÜ … – Erneuerung …" />
        </Field>
        <Field label="Projektleiter">
          <TextInput value={form.projektleiter} onChange={(v) => set('projektleiter', v)} />
        </Field>
        <Field label="DB-G-Nummer">
          <TextInput value={form.dbGNummer} onChange={(v) => set('dbGNummer', v)} placeholder="G.…" />
        </Field>
        <Field label="Hauptbearbeiter MIC">
          <TextInput value={form.hauptbearbeiter} onChange={(v) => set('hauptbearbeiter', v)} />
        </Field>
        <Field label="MIC-Projektnummer (wiko)">
          <TextInput value={form.projektnummer} onChange={(v) => set('projektnummer', v)} />
        </Field>

        <Field label="Betroffene Fahrplanjahre" full hint="Daraus ergeben sich der Anmeldebedarf in Übersicht und Terminen und der Vorschlag für den ersten Anmeldetermin.">
          <div className="row wrap" style={{ gap: '6px 16px' }}>
            {jahre.map((n) => (
              <label
                key={n}
                className="checkbox"
                title={`Fahrplanjahr ${n}: ${formatDate(fahrplanjahrBeginn(n))} – ${formatDate(fahrplanjahrEnde(n))}`}
              >
                <input
                  type="checkbox"
                  checked={form.fahrplanjahre.includes(n)}
                  onChange={(e) => jahrUmschalten(n, e.target.checked)}
                />
                {n}
              </label>
            ))}
          </div>
        </Field>

        {/* Eine Zeile mit einzeiligen Beschriftungen – Eingaben stehen auf gleicher Höhe, Hinweise darunter. */}
        <Field label="Prozessphase" hint="des ersten Anmeldetermins">
          <Select
            value={form.erstePhase}
            onChange={(v) => set('erstePhase', v as ErstePhase)}
            options={(Object.keys(ERSTE_PHASE_LABEL) as ErstePhase[]).map((k) => ({
              value: k,
              label: ERSTE_PHASE_LABEL[k],
            }))}
          />
        </Field>
        <Field label="Erster Anmeldetermin (ca.)">
          <TextInput type="date" value={form.ersterAnmeldetermin} onChange={(v) => set('ersterAnmeldetermin', v)} />
          <span className="hint">
            {vorschlag ? (
              <>
                Laut Richtlinie: {formatDate(vorschlag)}
                {vorschlag !== form.ersterAnmeldetermin ? (
                  <>
                    {' · '}
                    <button
                      type="button"
                      className="link-btn"
                      style={{ fontSize: 'inherit', color: 'var(--accent)' }}
                      onClick={() => set('ersterAnmeldetermin', vorschlag)}
                    >
                      übernehmen
                    </button>
                  </>
                ) : null}
              </>
            ) : (
              'Vorschlag laut Richtlinie, sobald Fahrplanjahre gewählt sind'
            )}
          </span>
        </Field>
        <Field label="Inbetriebnahme">
          <TextInput type="date" value={form.inbetriebnahme} onChange={(v) => set('inbetriebnahme', v)} />
        </Field>
        <Field label="Status der Betreuung">
          <Select
            value={form.status}
            onChange={(v) => set('status', v as ProjektStatus)}
            options={(Object.keys(PROJEKT_STATUS_LABEL) as ProjektStatus[]).map((k) => ({
              value: k,
              label: PROJEKT_STATUS_LABEL[k],
            }))}
          />
        </Field>
        <Field label="Bemerkung" full>
          <TextArea value={form.bemerkung} onChange={(v) => set('bemerkung', v)} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}
