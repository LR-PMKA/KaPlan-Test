/**
 * Verwaltung der Workflows – aufgebaut wie im Planlaufmanagement: Liste der
 * Workflows mit Öffnen, Duplizieren und Löschen, dazu der Editor. Ein Workflow
 * besteht aus Status in einer Reihenfolge; jeder Status hat eine Terminfrist
 * und mögliche Nachfolger. Ein Nachfolger in einem anderen Workflow übernimmt
 * die Anmeldung in die nächste Phase. Neu angelegt wird im ersten Status.
 */
import { Fragment, useState } from 'react';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Badge, Callout, Card, CardHeader, ConfirmDialog, EmptyState, Field, Modal, Select, TextArea, TextInput } from '../../../shared/ui';
import { STATUS_TON } from '../components/common';
import { fristRegelText, rilFristText } from '../domain/fristen';
import {
  ALLE_ARTEN,
  BAUZEITRAUM_LABEL,
  FRIST_TYP_LABEL,
  LOESCHEN,
  PHASE_LABEL,
  RIL_BEZUG_LABEL,
  RIL_BEZUG_PHASE,
  RIL_KUERZEL,
  RIL_LABEL,
  rilFristenNachPhase,
  type Phase,
  STATUS_ART_LABEL,
  ZUSTAENDIGKEIT_LABEL,
  type AnmeldungsArt,
  type BauzeitraumModus,
  type FristRegel,
  type FristTyp,
  type RilBezug,
  type StatusArt,
  type StatusZiel,
  type Workflow,
  type WorkflowStatus,
  type Zustaendigkeit,
} from '../domain/types';
import { anmeldungenJeStatus, belegteEntfallendeStatus, workflowKopie } from '../domain/workflowPflege';
import type { Route } from '../lib/router';
import { newId, useStore } from '../store/store';

export function Workflows({ navigate }: { navigate: (r: Route) => void }) {
  const { data, saveWorkflow, deleteWorkflow } = useStore();
  const toast = useToast();
  const [editor, setEditor] = useState<{ workflow?: Workflow } | null>(null);
  const [loeschen, setLoeschen] = useState<Workflow | null>(null);
  const zahl = anmeldungenJeStatus(data);
  const anmeldungenIn = (w: Workflow) => w.status.reduce((summe, s) => summe + (zahl.get(s.id) ?? 0), 0);

  const duplizieren = (w: Workflow) => {
    saveWorkflow(workflowKopie(w, () => newId('st'), newId('wf')));
    toast('Workflow dupliziert – jetzt individuell anpassbar.');
  };

  return (
    <div className="stack">
      <div className="row-between wrap">
        <p className="muted small" style={{ maxWidth: 680 }}>
          Je Phase ein Workflow. Eine Anmeldung durchläuft die Status ihres Workflows; ein Nachfolger in einem anderen
          Workflow übernimmt sie in die nächste Phase. Neu angelegt wird immer im ersten Status. Änderungen wirken
          sofort auf alle Anmeldungen.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setEditor({})}>
          <Icon name="plus" size={14} /> Neuer Workflow
        </button>
      </div>

      <Card>
        <CardHeader titel="Weg einer Anmeldung" sub="Die Workflows in ihrer Reihenfolge" />
        <div className="card-pad">
          <div className="chain">
            {data.workflows.map((w, i) => (
              <Fragment key={w.id}>
                {i > 0 ? <div className="chain-arrow">›</div> : null}
                <div className="chain-node" style={{ maxWidth: 220 }}>
                  <div className="cn-name">{w.name}</div>
                  <div className="cn-meta">{w.beschreibung || BAUZEITRAUM_LABEL[w.bauzeitraum]}</div>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader titel="Workflows" sub="Mitgelieferte Standard-Workflows und eigene" />
        {data.workflows.length === 0 ? (
          <EmptyState icon="kette" titel="Kein Workflow" text="Legen Sie einen Workflow an." />
        ) : (
          data.workflows.map((w) => {
            const anzahl = anmeldungenIn(w);
            return (
              <div className="list-row" key={w.id}>
                <span className="tertiary" style={{ display: 'flex' }}>
                  <Icon name="kette" size={17} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <strong>{w.name}</strong>
                    {w.herkunft === 'standard' ? <Badge>Standard</Badge> : <Badge ton="blue">Eigener Workflow</Badge>}
                  </div>
                  <div className="small tertiary">
                    {w.status.length} Status · {BAUZEITRAUM_LABEL[w.bauzeitraum]} · Maßnahmenarten: {w.arten.join(', ')} ·{' '}
                    {anzahl} {anzahl === 1 ? 'Anmeldung' : 'Anmeldungen'}
                  </div>
                  <div className="small muted">
                    {w.status.map((s, i) => (
                      <Fragment key={s.id}>
                        {i > 0 ? ' › ' : ''}
                        {s.name}
                        {zahl.get(s.id) ? ` (${zahl.get(s.id)})` : ''}
                      </Fragment>
                    ))}
                  </div>
                </div>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditor({ workflow: w })}>
                  Öffnen
                </button>
                <button type="button" className="btn btn-sm" onClick={() => duplizieren(w)}>
                  <Icon name="kopieren" size={13} /> Duplizieren
                </button>
                {w.herkunft === 'manuell' ? (
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => setLoeschen(w)}
                    disabled={anzahl > 0}
                    title={anzahl > 0 ? 'In diesem Workflow stehen noch Anmeldungen.' : 'Workflow löschen'}
                    aria-label="Löschen"
                  >
                    <Icon name="loeschen" size={15} />
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </Card>

      <Card>
        <CardHeader
          titel="Fristen laut Richtlinie"
          sub="Grundlage der Terminfristen „Frist laut Richtlinie“, gegliedert nach Phase: Ril_KM nimmt die N-2- oder die N-1-Frist, Ril_KKM die Frist der Maßnahmenart"
          actions={
            <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate({ view: 'einstellungen' })}>
              Anpassen
            </button>
          }
        />
        {rilFristenNachPhase().map(({ phase, schluessel }) => (
          <Fragment key={phase}>
            <div className="list-row small" style={{ background: 'var(--fill-gruppe)', paddingTop: 6, paddingBottom: 6 }}>
              <strong>{PHASE_LABEL[phase]}</strong>
            </div>
            {schluessel.map((s) => {
              const frist = data.einstellungen.rilFristen[s];
              return (
                <div key={s} className="list-row">
                  <div style={{ flex: 1, minWidth: 0 }} title={RIL_LABEL[s]}>
                    <strong>{RIL_KUERZEL[s]}</strong>
                  </div>
                  <span className="small">{rilFristText(frist)}</span>
                  {frist.platzhalter ? <Badge ton="orange">Platzhalter</Badge> : <Badge ton="green">geprüft</Badge>}
                </div>
              );
            })}
          </Fragment>
        ))}
      </Card>

      {editor ? <WorkflowEditor workflow={editor.workflow} onClose={() => setEditor(null)} /> : null}
      {loeschen ? (
        <ConfirmDialog
          titel="Workflow löschen?"
          text={`„${loeschen.name}“ wird gelöscht. Nachfolger anderer Workflows, die in ihn führen, entfallen.`}
          onConfirm={() => {
            deleteWorkflow(loeschen.id);
            toast('Workflow gelöscht.');
          }}
          onClose={() => setLoeschen(null)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

function neuerStatus(): WorkflowStatus {
  return {
    id: newId('st'),
    name: '',
    art: 'entwurf',
    zustaendig: null,
    frist: { typ: 'keine' },
    nachhaken: false,
    bemerkung: '',
    nachfolger: [],
  };
}

function WorkflowEditor({ workflow, onClose }: { workflow?: Workflow; onClose: () => void }) {
  const { data, saveWorkflow } = useStore();
  const toast = useToast();
  const [name, setName] = useState(workflow?.name ?? '');
  const [kurz, setKurz] = useState(workflow?.kurz ?? '');
  const [beschreibung, setBeschreibung] = useState(workflow?.beschreibung ?? '');
  const [bauzeitraum, setBauzeitraum] = useState<BauzeitraumModus>(workflow?.bauzeitraum ?? 'tagesscharf');
  const [arten, setArten] = useState<AnmeldungsArt[]>(workflow?.arten ?? [...ALLE_ARTEN]);
  const [status, setStatus] = useState<WorkflowStatus[]>(
    workflow?.status.map((s) => ({ ...s, frist: { ...s.frist }, nachfolger: [...s.nachfolger] })) ?? [neuerStatus()],
  );

  // Anmeldungen in diesem Workflow: Ihr Sperrzeitraum ist im bisherigen Modus erfasst.
  const zahl = anmeldungenJeStatus(data);
  const imWorkflow = workflow ? workflow.status.reduce((summe, s) => summe + (zahl.get(s.id) ?? 0), 0) : 0;

  const artUmschalten = (art: AnmeldungsArt, an: boolean) =>
    setArten((alt) => ALLE_ARTEN.filter((a) => (a === art ? an : alt.includes(a))));

  const speichern = () => {
    if (!name.trim()) {
      toast('Bitte einen Namen angeben.');
      return;
    }
    if (status.length === 0) {
      toast('Bitte mindestens einen Status anlegen.');
      return;
    }
    if (status.some((s) => !s.name.trim())) {
      toast('Bitte jeden Status benennen.');
      return;
    }
    if (arten.length === 0) {
      toast('Bitte mindestens eine Maßnahmenart wählen.');
      return;
    }
    if (workflow && imWorkflow > 0 && bauzeitraum !== workflow.bauzeitraum) {
      toast('Der Sperrzeitraum lässt sich nicht umstellen, solange Anmeldungen in diesem Workflow stehen.');
      return;
    }
    const id = workflow?.id ?? newId('wf');
    const belegt = belegteEntfallendeStatus(data, id, status.map((s) => s.id));
    if (belegt.length > 0) {
      toast(`„${belegt[0].status.name}“ kann nicht entfallen – darin stehen noch Anmeldungen.`);
      return;
    }
    saveWorkflow({
      id,
      name: name.trim(),
      kurz: kurz.trim(),
      beschreibung: beschreibung.trim(),
      herkunft: workflow?.herkunft ?? 'manuell',
      bauzeitraum,
      arten,
      status: status.map((s) => ({ ...s, name: s.name.trim(), bemerkung: s.bemerkung.trim() })),
    });
    toast(workflow ? 'Workflow gespeichert.' : 'Workflow angelegt.');
    onClose();
  };

  return (
    <Modal
      titel={workflow ? 'Workflow bearbeiten' : 'Neuer Workflow'}
      sub={`${status.length} Status`}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={speichern}>
            Speichern
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        {workflow?.herkunft === 'standard' ? (
          <Callout icon="i">
            Dies ist ein mitgelieferter Standard-Workflow. Änderungen wirken sofort auf alle Anmeldungen in diesem
            Workflow – für Abweichungen besser duplizieren.
          </Callout>
        ) : null}

        <div className="form-grid">
          <Field label="Name">
            <TextInput value={name} onChange={setName} placeholder="z. B. KKM (unterjährig)" />
          </Field>
          <Field label="Kurzbezeichnung" hint="für Listen und Kennzeichen, z. B. „MKM“">
            <TextInput value={kurz} onChange={setKurz} placeholder="z. B. KKM" />
          </Field>
          <Field label="Beschreibung" full>
            <TextArea value={beschreibung} onChange={setBeschreibung} rows={2} />
          </Field>
          <Field
            label="Sperrzeitraum"
            hint={
              imWorkflow > 0
                ? 'Fest, solange Anmeldungen in diesem Workflow stehen – ihr Sperrzeitraum ist so erfasst.'
                : 'Ganzes Fahrplanjahr: statt Anmelde-ID Begriff bzw. tVE-Nr'
            }
          >
            <select
              className="select"
              value={bauzeitraum}
              disabled={imWorkflow > 0}
              aria-label="Sperrzeitraum"
              onChange={(e) => setBauzeitraum(e.target.value as BauzeitraumModus)}
            >
              {(Object.keys(BAUZEITRAUM_LABEL) as BauzeitraumModus[]).map((k) => (
                <option key={k} value={k}>
                  {BAUZEITRAUM_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Maßnahmenarten" hint="die erste gewählte ist die Vorgabe">
            <div className="row wrap" style={{ gap: '4px 12px' }}>
              {ALLE_ARTEN.map((a) => (
                <label key={a} className="checkbox">
                  <input type="checkbox" checked={arten.includes(a)} onChange={(e) => artUmschalten(a, e.target.checked)} />
                  {a}
                </label>
              ))}
            </div>
          </Field>
        </div>

        <StatusListe workflowId={workflow?.id ?? null} status={status} setStatus={setStatus} />
      </div>
    </Modal>
  );
}

/** Bearbeitbare Liste der Status eines Workflows. */
function StatusListe({
  workflowId,
  status,
  setStatus,
}: {
  workflowId: string | null;
  status: WorkflowStatus[];
  setStatus: (s: WorkflowStatus[]) => void;
}) {
  const { data } = useStore();
  const zahl = anmeldungenJeStatus(data);
  const andere = data.workflows.filter((w) => w.id !== workflowId);

  const setzen = (id: string, patch: Partial<WorkflowStatus>) =>
    setStatus(status.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const verschieben = (idx: number, richtung: -1 | 1) => {
    const ziel = idx + richtung;
    if (ziel < 0 || ziel >= status.length) return;
    const neu = [...status];
    [neu[idx], neu[ziel]] = [neu[ziel], neu[idx]];
    setStatus(neu);
  };

  /** Entfernt einen Status samt aller Verweise innerhalb dieses Workflows. */
  const entfernen = (id: string) =>
    setStatus(status.filter((s) => s.id !== id).map((s) => ({ ...s, nachfolger: s.nachfolger.filter((z) => z !== id) })));

  /** Beschriftung eines Nachfolgers: Nummer im Workflow, Übernahme oder Löschen. */
  const zielText = (ziel: StatusZiel): string | null => {
    if (ziel === LOESCHEN) return 'Eintrag löschen';
    const eigen = status.findIndex((s) => s.id === ziel);
    if (eigen >= 0) return `${eigen + 1}. ${status[eigen].name || 'ohne Namen'}`;
    for (const w of andere) {
      const fremd = w.status.find((s) => s.id === ziel);
      if (fremd) return `→ ${w.kurz || w.name}: ${fremd.name} (Übernahme)`;
    }
    return null;
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="small muted">
        Status in ihrer Reihenfolge – der erste ist der Startstatus. Zur Wahl stehen beim Statuswechsel nur die
        Nachfolger; ohne Nachfolger endet der Workflow im Status.
      </div>
      {status.map((s, i) => {
        const belegt = zahl.get(s.id) ?? 0;
        return (
          <div className="card" key={s.id}>
            <div className="card-pad" style={{ padding: '12px 14px' }}>
              <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <span className="step-num" style={{ marginTop: 6 }}>
                  {i + 1}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
                    {i === 0 ? <Badge ton="blue">Startstatus</Badge> : null}
                    <Badge ton={STATUS_TON[s.art]}>{STATUS_ART_LABEL[s.art]}</Badge>
                    {belegt > 0 ? (
                      <span className="small tertiary">
                        {belegt} {belegt === 1 ? 'Anmeldung' : 'Anmeldungen'} in diesem Status
                      </span>
                    ) : null}
                  </div>
                  <div className="form-grid" style={{ gap: 10 }}>
                    <Field label="Bezeichnung">
                      <TextInput value={s.name} onChange={(v) => setzen(s.id, { name: v })} placeholder="z. B. Angemeldet" />
                    </Field>
                    <Field
                      label="Art"
                      hint={
                        s.art === 'aenderung'
                          ? 'In diesem Status sind ÄAbst-Nr und AnnexVII aktiv.'
                          : s.art === 'leiche'
                            ? 'Rot gekennzeichnet; deckt keinen Anmeldebedarf ab. Gelöscht wird mit dem Nachfolger „Eintrag löschen“.'
                            : undefined
                      }
                    >
                      <Select
                        value={s.art}
                        onChange={(v) => setzen(s.id, { art: v as StatusArt })}
                        options={(Object.keys(STATUS_ART_LABEL) as StatusArt[]).map((k) => ({
                          value: k,
                          label: STATUS_ART_LABEL[k],
                        }))}
                      />
                    </Field>
                    <Field label="Zuständig" hint="Die Liste nennt dazu den Namen aus Anmeldung bzw. Projekt.">
                      <Select
                        value={s.zustaendig ?? ''}
                        onChange={(v) => setzen(s.id, { zustaendig: (v || null) as Zustaendigkeit | null })}
                        options={[
                          { value: '', label: '– niemand –' },
                          ...(Object.keys(ZUSTAENDIGKEIT_LABEL) as Zustaendigkeit[]).map((k) => ({
                            value: k,
                            label: ZUSTAENDIGKEIT_LABEL[k],
                          })),
                        ]}
                      />
                    </Field>
                    <FristFeld frist={s.frist} onChange={(frist) => setzen(s.id, { frist })} />
                    <Field label="Nachhaken">
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={s.nachhaken}
                          onChange={(e) => setzen(s.id, { nachhaken: e.target.checked })}
                        />
                        Termin dient zum Nachhaken
                      </label>
                    </Field>
                    <Field label="Bemerkung">
                      <TextInput value={s.bemerkung} onChange={(v) => setzen(s.id, { bemerkung: v })} />
                    </Field>

                    <Field label="Nachfolger" full>
                      <div className="stack" style={{ gap: 6 }}>
                        <div className="row wrap" style={{ gap: 6 }}>
                          {s.nachfolger.length === 0 ? <span className="small tertiary">keine – Workflow endet hier</span> : null}
                          {s.nachfolger.map((z) => {
                            const text = zielText(z);
                            if (text === null) return null;
                            return (
                              <span key={z} className="badge">
                                {text}
                                <button
                                  type="button"
                                  className="chip-weg"
                                  aria-label="Nachfolger entfernen"
                                  onClick={() => setzen(s.id, { nachfolger: s.nachfolger.filter((x) => x !== z) })}
                                >
                                  ✕
                                </button>
                              </span>
                            );
                          })}
                        </div>
                        <select
                          className="select"
                          value=""
                          aria-label="Nachfolger hinzufügen"
                          onChange={(e) => {
                            if (e.target.value) setzen(s.id, { nachfolger: [...s.nachfolger, e.target.value] });
                          }}
                        >
                          <option value="">Nachfolger hinzufügen …</option>
                          <optgroup label="Dieser Workflow">
                            {status
                              .map((ziel, nummer) => ({ ziel, nummer }))
                              .filter(({ ziel }) => !s.nachfolger.includes(ziel.id))
                              .map(({ ziel, nummer }) => (
                                <option key={ziel.id} value={ziel.id}>
                                  {nummer + 1}. {ziel.name || 'ohne Namen'}
                                  {ziel.id === s.id ? ' (erneut)' : ''}
                                </option>
                              ))}
                          </optgroup>
                          {andere.map((w) => (
                            <optgroup key={w.id} label={`Übernahme in ${w.name}`}>
                              {w.status
                                .filter((ziel) => !s.nachfolger.includes(ziel.id))
                                .map((ziel) => (
                                  <option key={ziel.id} value={ziel.id}>
                                    {w.kurz || w.name}: {ziel.name}
                                  </option>
                                ))}
                            </optgroup>
                          ))}
                          {!s.nachfolger.includes(LOESCHEN) ? (
                            <option value={LOESCHEN}>Eintrag löschen (endgültig)</option>
                          ) : null}
                        </select>
                      </div>
                    </Field>
                  </div>
                </div>

                <div className="row" style={{ gap: 2 }}>
                  <button type="button" className="btn-icon" onClick={() => verschieben(i, -1)} disabled={i === 0} aria-label="Nach oben">
                    <Icon name="hoch" size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => verschieben(i, 1)}
                    disabled={i === status.length - 1}
                    aria-label="Nach unten"
                  >
                    <Icon name="runter" size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => entfernen(s.id)}
                    disabled={belegt > 0}
                    title={belegt > 0 ? 'In diesem Status stehen noch Anmeldungen.' : 'Status entfernen'}
                    aria-label="Status entfernen"
                  >
                    <Icon name="loeschen" size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="row">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setStatus([...status, neuerStatus()])}>
          <Icon name="plus" size={13} /> Status
        </button>
      </div>
    </div>
  );
}

/**
 * Zahlenfeld, das während der Eingabe auch leer oder außerhalb des Bereichs
 * stehen darf – übernommen werden nur gültige Werte, beim Verlassen zeigt es
 * wieder den übernommenen Wert. So lassen sich Werte ohne Markieren ersetzen.
 */
function ZiffernFeld({
  wert,
  onChange,
  min,
  max,
  label,
  breite = 64,
}: {
  wert: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  label: string;
  breite?: number;
}) {
  const [text, setText] = useState(String(wert));
  const [vorher, setVorher] = useState(wert);
  // Ändert sich der Wert von außen, folgt das Feld
  if (wert !== vorher) {
    setVorher(wert);
    setText(String(wert));
  }
  return (
    <input
      className="input"
      style={{ width: breite }}
      inputMode="numeric"
      aria-label={label}
      value={text}
      onChange={(e) => {
        const roh = e.target.value.replace(/\D/g, '');
        setText(roh);
        const n = Number(roh);
        if (roh !== '' && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => setText(String(wert))}
    />
  );
}

/** Terminfrist eines Status: Art der Frist und ihre Angaben. */
function FristFeld({ frist, onChange }: { frist: FristRegel; onChange: (f: FristRegel) => void }) {
  const { data } = useStore();
  const typWechseln = (typ: FristTyp) => {
    if (typ === frist.typ) return;
    if (typ === 'ril') onChange({ typ: 'ril', bezug: 'X', versatzTage: 0 });
    else if (typ === 'stichtag') onChange({ typ: 'stichtag', tag: 1, monat: 8 });
    else if (typ === 'nachhaken') onChange({ typ: 'nachhaken', tage: data.einstellungen.nachhakTage });
    else onChange({ typ: 'keine' });
  };

  return (
    <Field label="Terminfrist" full hint={frist.typ === 'keine' ? undefined : `Kurzform: ${fristRegelText(frist)}`}>
      <div className="row wrap" style={{ gap: 6 }}>
        <select
          className="select"
          style={{ flex: '1 1 220px' }}
          value={frist.typ}
          aria-label="Art der Terminfrist"
          onChange={(e) => typWechseln(e.target.value as FristTyp)}
        >
          {(Object.keys(FRIST_TYP_LABEL) as FristTyp[]).map((k) => (
            <option key={k} value={k}>
              {FRIST_TYP_LABEL[k]}
            </option>
          ))}
        </select>
        {frist.typ === 'ril' ? (
          <>
            <select
              className="select"
              style={{ flex: '1 1 240px' }}
              value={frist.bezug}
              aria-label="Frist laut Richtlinie"
              onChange={(e) => onChange({ ...frist, bezug: e.target.value as RilBezug })}
            >
              {(Object.keys(PHASE_LABEL) as Phase[]).map((phase) => (
                <optgroup key={phase} label={PHASE_LABEL[phase]}>
                  {(Object.keys(RIL_BEZUG_LABEL) as RilBezug[])
                    .filter((k) => RIL_BEZUG_PHASE[k] === phase)
                    .map((k) => (
                      <option key={k} value={k}>
                        {RIL_BEZUG_LABEL[k]}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <span className="small muted">abzüglich</span>
            <ZiffernFeld
              label="Tage vor der Frist"
              wert={Math.abs(frist.versatzTage)}
              min={0}
              max={365}
              onChange={(n) => onChange({ ...frist, versatzTage: -n })}
            />
            <span className="small muted">Tage</span>
          </>
        ) : null}
        {frist.typ === 'stichtag' ? (
          <>
            <span className="small muted">nächster</span>
            <ZiffernFeld label="Tag" wert={frist.tag} min={1} max={31} breite={56} onChange={(n) => onChange({ ...frist, tag: n })} />
            <span className="tertiary">.</span>
            <ZiffernFeld
              label="Monat"
              wert={frist.monat}
              min={1}
              max={12}
              breite={56}
              onChange={(n) => onChange({ ...frist, monat: n })}
            />
            <span className="small muted">. ab dem Statuswechsel</span>
          </>
        ) : null}
        {frist.typ === 'nachhaken' ? (
          <>
            <ZiffernFeld
              label="Tage nach dem Statuswechsel"
              wert={frist.tage}
              min={0}
              max={365}
              onChange={(n) => onChange({ ...frist, tage: n })}
            />
            <span className="small muted">Tage nach dem Statuswechsel</span>
          </>
        ) : null}
      </div>
    </Field>
  );
}
