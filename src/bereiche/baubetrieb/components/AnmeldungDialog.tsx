/**
 * Anlegen und Bearbeiten einer baubetrieblichen Anmeldung. Neu angelegt wird
 * immer im ersten Status eines Workflows; ein Auswahlfeld, nach Phase
 * gegliedert, legt Workflow und Maßnahmenart zugleich fest. Der Status ändert
 * sich danach nur noch über den Workflow.
 */
import { useState } from 'react';
import { formatDate, today } from '../../../shared/dates';
import { useToast } from '../../../shared/toast';
import { Callout, Field, Modal, Select, TextArea, TextInput } from '../../../shared/ui';
import { fahrplanjahrBeginn, fahrplanjahrEnde, fahrplanjahrVon, ganzesFahrplanjahr } from '../domain/fristen';
import {
  ANNEX_VII,
  type Anmeldung,
  type AnmeldungsArt,
  type AnnexVIIGrund,
  type ID,
  type Projekt,
} from '../domain/types';
import { NEUANLAGE_WORKFLOW, istAenderung, startbareWorkflows, statusVon, vorhabenFuehrend } from '../domain/workflow';
import { useStore } from '../store/store';
import { StatusBadge } from './common';

/** Auswahl der Fahrplanjahre rund um das gewünschte Jahr. */
export function fahrplanjahrOptionen(mindestens?: number | null): { value: string; label: string }[] {
  const jetzt = fahrplanjahrVon(today()) ?? new Date().getFullYear();
  const von = Math.min(jetzt - 1, mindestens ?? jetzt);
  const bis = Math.max(jetzt + 8, mindestens ?? jetzt);
  const jahre: { value: string; label: string }[] = [];
  for (let n = von; n <= bis; n++) {
    jahre.push({
      value: String(n),
      label: `${n} (${formatDate(fahrplanjahrBeginn(n))} – ${formatDate(fahrplanjahrEnde(n))})`,
    });
  }
  return jahre;
}

export const ANNEX_OPTIONEN = ANNEX_VII.map((a) => ({
  value: a.id,
  label: a.selten ? `${a.label} (selten)` : a.label,
}));

/** Vorgabe für das Fahrplanjahr: das erste noch laufende betroffene, sonst das aktuelle. */
function vorgabeFahrplanjahr(projekt: Projekt): number | null {
  const jetzt = fahrplanjahrVon(today());
  return projekt.fahrplanjahre.find((n) => !jetzt || n >= jetzt) ?? jetzt;
}

export function AnmeldungDialog({
  projekt,
  anmeldung,
  onClose,
  onAngelegt,
}: {
  projekt: Projekt;
  anmeldung?: Anmeldung;
  onClose: () => void;
  onAngelegt?: (id: ID) => void;
}) {
  const { data, addAnmeldung, updateAnmeldung } = useStore();
  const toast = useToast();
  const startbar = startbareWorkflows(data.workflows);
  // Neuanlage: vorbelegt ist KKM (unterjährig)
  const startWorkflow = startbar.find((w) => w.id === NEUANLAGE_WORKFLOW) ?? startbar[startbar.length - 1];
  const [form, setForm] = useState({
    workflowId: anmeldung ? statusVon(data.workflows, anmeldung.statusId).workflow.id : (startWorkflow?.id ?? ''),
    statusSeit: anmeldung?.statusSeit ?? today(),
    art: (anmeldung?.art ?? startWorkflow?.arten[0] ?? 'A') as AnmeldungsArt,
    anmeldeId: anmeldung?.anmeldeId ?? '',
    vorhaben: anmeldung?.vorhaben ?? '',
    bbk: anmeldung?.bbk ?? '',
    fahrplanjahr: anmeldung?.fahrplanjahr ?? vorgabeFahrplanjahr(projekt),
    bauVon: anmeldung?.bauVon ?? '',
    bauBis: anmeldung?.bauBis ?? '',
    bfStrecke: anmeldung?.bfStrecke ?? '',
    gewerk: anmeldung?.gewerk ?? '',
    aenderungsNr: anmeldung?.aenderungsNr ?? '',
    annexVII: (anmeldung?.annexVII ?? '') as AnnexVIIGrund | '',
    bemerkung: anmeldung?.bemerkung ?? '',
  });
  const set = <K extends keyof typeof form>(key: K, wert: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: wert }));

  const workflow = data.workflows.find((w) => w.id === form.workflowId);
  const ganzesJahr = workflow ? ganzesFahrplanjahr(workflow) : false;
  // Die bisherige Art bleibt wählbar, auch wenn der Workflow sie nicht mehr führt.
  const arten = [...new Set([...(workflow?.arten ?? []), ...(anmeldung ? [anmeldung.art] : [])])];
  const aenderung = !!anmeldung && istAenderung(data.workflows, anmeldung.statusId);
  // Im SKM führt der Vorhabenname, die Nummer ist die tVE-Nr. Ein vorhandener Vorhabenname
  // (etwa aus dem SKM übernommen) bleibt auch in anderen Phasen sichtbar und änderbar.
  const vorhaben = vorhabenFuehrend(form);
  const vorhabenFeld = vorhaben || !!form.vorhaben.trim();
  // Ältere SKM-Einträge führen den Begriff noch als Nummer
  const alterBegriff = vorhaben && !form.vorhaben.trim() && !!form.anmeldeId.trim();

  /** Phase (Workflow) und Maßnahmenart aus einem Auswahlfeld: Wert „Workflow-ID|Art“. */
  const phaseUndArtWaehlen = (wert: string) => {
    const trenner = wert.lastIndexOf('|');
    const neu = data.workflows.find((w) => w.id === wert.slice(0, trenner));
    if (!neu) return;
    setForm((f) => ({ ...f, workflowId: neu.id, art: wert.slice(trenner + 1) as AnmeldungsArt }));
  };

  const speichern = () => {
    if (!anmeldung && !workflow?.status[0]) {
      toast('Bitte einen Workflow wählen.');
      return;
    }
    if (!ganzesJahr && form.bauVon && form.bauBis && form.bauBis < form.bauVon) {
      toast('Das Ende des Sperrzeitraums liegt vor dem Beginn.');
      return;
    }
    if (ganzesJahr && !form.fahrplanjahr) {
      toast('Bitte das Fahrplanjahr wählen.');
      return;
    }
    const bauzeit = ganzesJahr
      ? { fahrplanjahr: form.fahrplanjahr, bauVon: null, bauBis: null }
      : { fahrplanjahr: null, bauVon: form.bauVon || null, bauBis: form.bauBis || form.bauVon || null };
    const gemeinsam = {
      art: form.art,
      anmeldeId: form.anmeldeId.trim(),
      vorhaben: form.vorhaben.trim(),
      bbk: form.bbk.trim(),
      bfStrecke: form.bfStrecke.trim(),
      gewerk: form.gewerk.trim(),
      bemerkung: form.bemerkung.trim(),
      ...bauzeit,
    };
    if (anmeldung) {
      updateAnmeldung(anmeldung.id, {
        ...gemeinsam,
        ...(aenderung ? { aenderungsNr: form.aenderungsNr.trim(), annexVII: form.annexVII || null } : {}),
      });
      toast('Anmeldung gespeichert.');
      onClose();
      return;
    }
    const start = workflow!.status[0];
    const id = addAnmeldung({
      ...gemeinsam,
      projektId: projekt.id,
      statusId: start.id,
      statusSeit: form.statusSeit || today(),
    });
    toast(`Eintrag in ${workflow!.kurz || workflow!.name} · ${start.name} angelegt.`);
    onClose();
    onAngelegt?.(id);
  };

  return (
    <Modal
      titel={anmeldung ? 'Anmeldung bearbeiten' : 'Neue Anmeldung'}
      sub={projekt.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={speichern}>
            {anmeldung ? 'Speichern' : 'Anlegen'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {anmeldung ? (
          <Field label="Status" full hint="Der Status ändert sich nur über den Workflow – in der Liste oder in der Anmeldung.">
            <span>
              <StatusBadge statusId={anmeldung.statusId} />
            </span>
          </Field>
        ) : (
          <>
            <Field
              label="Phase und Maßnahmenart"
              hint={
                workflow?.status[0]
                  ? `Neu angelegt wird im ersten Status: ${workflow.kurz || workflow.name} · ${workflow.status[0].name}.`
                  : 'Der Workflow hat noch keinen Status.'
              }
            >
              <select
                className="select"
                value={`${form.workflowId}|${form.art}`}
                aria-label="Phase und Maßnahmenart"
                onChange={(e) => phaseUndArtWaehlen(e.target.value)}
              >
                {startbar.map((w) => (
                  <optgroup key={w.id} label={w.name}>
                    {w.arten.map((a) => (
                      <option key={a} value={`${w.id}|${a}`}>
                        {w.kurz || w.name} · {a}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Im ersten Status seit">
              <TextInput type="date" value={form.statusSeit} onChange={(v) => set('statusSeit', v)} />
            </Field>
          </>
        )}

        {anmeldung ? (
          <Field label="Maßnahmenart">
            {arten.length <= 1 ? (
              <TextInput value={arten[0] ?? form.art} onChange={() => undefined} disabled />
            ) : (
              <Select
                value={form.art}
                onChange={(v) => set('art', v as AnmeldungsArt)}
                options={arten.map((a) => ({ value: a, label: a }))}
              />
            )}
          </Field>
        ) : null}

        {vorhabenFeld ? (
          <Field
            label="Vorhabenname"
            full
            hint={vorhaben ? 'Führt im SKM die Liste an; die tVE-Nr steht darunter.' : 'Aus dem SKM übernommen.'}
          >
            <TextInput value={form.vorhaben} onChange={(v) => set('vorhaben', v)} placeholder="Kabeltiefbau Abschnitt Nord" />
          </Field>
        ) : null}

        <Field
          label={vorhaben && !alterBegriff ? 'tVE-Nr' : ganzesJahr ? 'Begriff / tVE-Nr' : 'Anmelde-ID'}
          hint={
            ganzesJahr && !vorhaben
              ? 'Vor dem KM gibt es noch keine Anmeldungen – Sammeleintrag nach Begriffen bzw. tVE-Nr.'
              : undefined
          }
        >
          <TextInput
            value={form.anmeldeId}
            onChange={(v) => set('anmeldeId', v)}
            placeholder={ganzesJahr ? 'tVE 4000-17' : 'noch ohne ID'}
          />
          {alterBegriff ? (
            <span className="hint">
              Steht hier der Vorhabenname?{' '}
              <button
                type="button"
                className="link-btn"
                style={{ fontSize: 'inherit', color: 'var(--accent)' }}
                onClick={() => setForm((f) => ({ ...f, vorhaben: f.anmeldeId.trim(), anmeldeId: '' }))}
              >
                als Vorhabenname übernehmen
              </button>
            </span>
          ) : null}
        </Field>

        {ganzesJahr ? (
          <Field label="Sperrzeitraum" full hint="In diesem Workflow gilt das gesamte Fahrplanjahr.">
            <Select
              value={String(form.fahrplanjahr ?? '')}
              onChange={(v) => set('fahrplanjahr', v ? Number(v) : null)}
              options={fahrplanjahrOptionen(form.fahrplanjahr)}
              placeholder="Fahrplanjahr wählen"
            />
          </Field>
        ) : (
          <>
            <Field label="Sperrzeitraum von" hint="tagesscharf">
              <TextInput type="date" value={form.bauVon} onChange={(v) => set('bauVon', v)} />
            </Field>
            <Field label="Sperrzeitraum bis">
              <TextInput type="date" value={form.bauBis} onChange={(v) => set('bauBis', v)} />
            </Field>
          </>
        )}

        <Field label="Bf/Strecke" hint="in Stichworten">
          <TextInput value={form.bfStrecke} onChange={(v) => set('bfStrecke', v)} placeholder="Strecke 4000, km 92,1–95,4" />
        </Field>
        <Field label="Gewerk/Tätigkeit" hint="in Stichworten">
          <TextInput value={form.gewerk} onChange={(v) => set('gewerk', v)} placeholder="Weichenerneuerung" />
        </Field>
        <Field label="Zuständiger BBK" hint="Name – erscheint in „Zuständig“, wenn die BBK am Zug ist">
          <TextInput value={form.bbk} onChange={(v) => set('bbk', v)} placeholder="Fr. Weber" />
        </Field>

        {aenderung ? (
          <>
            <Field label="ÄAbst-Nr" hint="der aktuell laufenden Änderung">
              <TextInput value={form.aenderungsNr} onChange={(v) => set('aenderungsNr', v)} />
            </Field>
            <Field label="AnnexVII-Kennzeichen">
              <Select
                value={form.annexVII}
                onChange={(v) => set('annexVII', v as AnnexVIIGrund | '')}
                options={ANNEX_OPTIONEN}
                placeholder="– ohne –"
              />
            </Field>
          </>
        ) : null}

        <Field label="Bemerkungen" full>
          <TextArea value={form.bemerkung} onChange={(v) => set('bemerkung', v)} rows={3} />
        </Field>
      </div>
      {!ganzesJahr && !form.bauVon ? (
        <div style={{ marginTop: 12 }}>
          <Callout ton="warn" icon="!">
            Ohne Beginn des Sperrzeitraums lässt sich die Terminfrist nach Richtlinie nicht berechnen.
          </Callout>
        </div>
      ) : null}
    </Modal>
  );
}
