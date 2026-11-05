/**
 * Person in der Projektbeteiligtenliste erfassen oder pflegen. Die Funktion
 * wird aus den projektübergreifenden Funktionen gewählt; fehlt sie, lässt sie
 * sich hier gleich anlegen. Auch aus dem Protokoll heraus aufrufbar.
 */
import { useState } from 'react';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { ConfirmDialog, Field, Modal, Select, TextArea, TextInput } from '../../../shared/ui';
import { UEBERGREIFEND, funktionsName, personName, type Beteiligter, type ID } from '../domain/types';
import { useStore } from '../store/store';
import { FunktionDialog } from './FunktionDialog';

/** Auswahlwert, der den Dialog für eine neue Funktion öffnet. */
const NEUE_FUNKTION = '__neu__';

type Werte = Omit<Beteiligter, 'id' | 'projektId'>;

const LEER: Werte = {
  funktionId: null,
  anrede: '',
  vorname: '',
  nachname: '',
  firma: '',
  kuerzel: '',
  email: '',
  telefon: '',
  mobil: '',
  anschrift: '',
  notiz: '',
};

export function BeteiligterDialog({
  projektId,
  beteiligter,
  vorbelegung,
  onClose,
  onGespeichert,
}: {
  projektId: ID;
  beteiligter?: Beteiligter;
  vorbelegung?: Partial<Werte>;
  onClose: () => void;
  /** Meldet die Kennung der gespeicherten Person. */
  onGespeichert?: (id: ID) => void;
}) {
  const { data, addBeteiligter, updateBeteiligter, deleteBeteiligter } = useStore();
  const toast = useToast();
  const [form, setForm] = useState<Werte>(() => {
    if (!beteiligter) return { ...LEER, ...vorbelegung };
    const { id: _id, projektId: _p, ...werte } = beteiligter;
    return werte;
  });
  const [neueFunktion, setNeueFunktion] = useState(false);
  const [loeschen, setLoeschen] = useState(false);

  const set = <K extends keyof Werte>(k: K, v: Werte[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Auswahl nach Gewerk gegliedert: zuerst die übergreifenden Funktionen
  const gruppen = [null, ...data.gewerke]
    .map((gewerk) => ({
      gewerk,
      funktionen: data.funktionen
        .filter((f) => f.gewerk === gewerk)
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    }))
    .filter((g) => g.funktionen.length > 0);
  const gewaehlt = data.funktionen.find((f) => f.id === form.funktionId);
  // Wer diese Funktion im Projekt schon ausfüllt – nur als Hinweis.
  const schonBesetzt = gewaehlt
    ? data.beteiligte.filter((b) => b.projektId === projektId && b.funktionId === gewaehlt.id && b.id !== beteiligter?.id)
    : [];

  const speichern = () => {
    if (!form.funktionId) {
      toast('Bitte eine Funktion wählen.');
      return;
    }
    if (!form.nachname.trim()) {
      toast('Bitte einen Nachnamen angeben.');
      return;
    }
    const werte = { ...form, vorname: form.vorname.trim(), nachname: form.nachname.trim(), kuerzel: form.kuerzel.trim() };
    if (beteiligter) {
      updateBeteiligter(beteiligter.id, werte);
      toast('Person gespeichert.');
      onGespeichert?.(beteiligter.id);
    } else {
      const id = addBeteiligter({ ...werte, projektId });
      toast(`${personName(werte)} in die Projektbeteiligtenliste aufgenommen.`);
      onGespeichert?.(id);
    }
    onClose();
  };

  return (
    <>
      <Modal
        titel={beteiligter ? personName(beteiligter) || 'Person' : 'Person hinzufügen'}
        sub={beteiligter ? 'Angaben in der Projektbeteiligtenliste' : 'Neue Person in der Projektbeteiligtenliste'}
        onClose={onClose}
        footer={
          <>
            {beteiligter ? (
              <button type="button" className="btn btn-danger" onClick={() => setLoeschen(true)}>
                <Icon name="loeschen" size={14} /> Person löschen
              </button>
            ) : null}
            <span className="spacer" />
            <button type="button" className="btn" onClick={onClose}>
              Abbrechen
            </button>
            <button type="button" className="btn btn-primary" onClick={speichern}>
              Speichern
            </button>
          </>
        }
      >
        <div className="form-grid">
          <Field
            label="Funktion"
            full
            hint={
              schonBesetzt.length
                ? `In diesem Projekt bereits geführt von ${schonBesetzt.map(personName).join(', ')}.`
                : 'Aus den projektübergreifenden Funktionen – oder eine neue anlegen.'
            }
          >
            <select
              className="select"
              value={form.funktionId ?? ''}
              onChange={(e) =>
                e.target.value === NEUE_FUNKTION ? setNeueFunktion(true) : set('funktionId', e.target.value || null)
              }
            >
              <option value="">– Funktion wählen –</option>
              {gruppen.map((g) => (
                <optgroup key={g.gewerk ?? ''} label={g.gewerk ?? UEBERGREIFEND}>
                  {g.funktionen.map((f) => (
                    <option key={f.id} value={f.id}>
                      {funktionsName(f)}
                      {f.kuerzel ? ` (${f.kuerzel})` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value={NEUE_FUNKTION}>+ Neue Funktion anlegen …</option>
            </select>
          </Field>
          <Field label="Anrede">
            <Select
              value={form.anrede}
              onChange={(v) => set('anrede', v)}
              options={[
                { value: '', label: 'ohne Anrede' },
                { value: 'Frau', label: 'Frau' },
                { value: 'Herr', label: 'Herr' },
              ]}
            />
          </Field>
          <Field label="Vorname">
            <TextInput value={form.vorname} onChange={(v) => set('vorname', v)} />
          </Field>
          <Field label="Nachname">
            <TextInput value={form.nachname} onChange={(v) => set('nachname', v)} />
          </Field>
          <Field label="Firma / Büro">
            <TextInput value={form.firma} onChange={(v) => set('firma', v)} placeholder="z. B. DB InfraGO AG" />
          </Field>
          <Field label="Kürzel" hint={`Für Protokolle; leer = ${gewaehlt?.kuerzel || 'Kürzel der Funktion'}`}>
            <TextInput value={form.kuerzel} onChange={(v) => set('kuerzel', v)} />
          </Field>
          <Field label="E-Mail">
            <TextInput value={form.email} onChange={(v) => set('email', v)} type="email" />
          </Field>
          <Field label="Telefon">
            <TextInput value={form.telefon} onChange={(v) => set('telefon', v)} />
          </Field>
          <Field label="Mobil">
            <TextInput value={form.mobil} onChange={(v) => set('mobil', v)} />
          </Field>
          <Field label="Anschrift" full hint="Straße, PLZ und Ort">
            <TextArea value={form.anschrift} onChange={(v) => set('anschrift', v)} rows={2} />
          </Field>
          <Field label="Notiz" full>
            <TextArea value={form.notiz} onChange={(v) => set('notiz', v)} rows={2} />
          </Field>
        </div>
      </Modal>

      {neueFunktion ? (
        <FunktionDialog onClose={() => setNeueFunktion(false)} onAngelegt={(id) => set('funktionId', id)} />
      ) : null}

      {loeschen && beteiligter ? (
        <ConfirmDialog
          titel="Person löschen?"
          text={`${personName(beteiligter)} wird aus der Projektbeteiligtenliste entfernt. In bestehenden Protokollen bleiben Name und Angaben als Text stehen.`}
          onConfirm={() => {
            deleteBeteiligter(beteiligter.id);
            toast('Person gelöscht.');
            onClose();
          }}
          onClose={() => setLoeschen(false)}
        />
      ) : null}
    </>
  );
}
