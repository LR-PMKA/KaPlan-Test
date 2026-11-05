/**
 * Anlage und Pflege einer projektübergreifenden Funktion – aus der Seite
 * „Funktionen“ und direkt beim Hinzufügen einer Person zur
 * Projektbeteiligtenliste. Jede Funktion gehört zu einem Gewerk oder gilt
 * übergreifend.
 */
import { useState } from 'react';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Field, Modal, Select, TextArea, TextInput } from '../../../shared/ui';
import { UEBERGREIFEND, funktionsName, kuerzelAus, type Funktion, type ID } from '../domain/types';
import { useStore } from '../store/store';
import { GewerkDialog } from './GewerkDialog';

const FARBEN = ['#24456e', '#5856d6', '#ff9500', '#34c759', '#ff3b30', '#af52de', '#00a0a0', '#c77700'];

export function FunktionDialog({
  funktion,
  vorschlag = '',
  vorauswahl = null,
  onClose,
  onAngelegt,
}: {
  funktion?: Funktion;
  /** Vorbelegte Bezeichnung einer neuen Funktion. */
  vorschlag?: string;
  /** Gewerk einer neuen Funktion; null = übergreifend. */
  vorauswahl?: string | null;
  onClose: () => void;
  /** Meldet die Kennung einer neu angelegten Funktion. */
  onAngelegt?: (id: ID) => void;
}) {
  const { data, addFunktion, updateFunktion } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({
    name: funktion?.name ?? vorschlag,
    kuerzel: funktion?.kuerzel ?? '',
    farbe: funktion?.farbe ?? FARBEN[data.funktionen.length % FARBEN.length],
    beschreibung: funktion?.beschreibung ?? '',
    gewerk: funktion ? funktion.gewerk : vorauswahl,
  });
  const [neuesGewerk, setNeuesGewerk] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const speichern = () => {
    const name = form.name.trim();
    if (!name) {
      toast('Bitte eine Bezeichnung angeben.');
      return;
    }
    const doppelt = data.funktionen.find(
      (f) =>
        f.id !== funktion?.id &&
        f.name.toLowerCase() === name.toLowerCase() &&
        (f.gewerk ?? '').toLowerCase() === (form.gewerk ?? '').toLowerCase(),
    );
    if (doppelt) {
      toast(`Die Funktion „${funktionsName(doppelt)}“ gibt es bereits.`);
      return;
    }
    const werte = { ...form, name, kuerzel: form.kuerzel.trim() || kuerzelAus(name) };
    if (funktion) {
      updateFunktion(funktion.id, werte);
      toast('Funktion gespeichert.');
    } else {
      const id = addFunktion(werte);
      toast(`Funktion „${funktionsName(werte)}“ angelegt.`);
      onAngelegt?.(id);
    }
    onClose();
  };

  return (
    <>
      <Modal
        titel={funktion ? 'Funktion bearbeiten' : 'Neue Funktion'}
        sub="Gilt projektübergreifend"
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
        <div className="form-grid">
          <Field label="Bezeichnung" full>
            <TextInput value={form.name} onChange={(v) => set('name', v)} placeholder="z. B. Bauüberwachung" autoFocus />
          </Field>
          <Field
            label="Gewerk"
            full
            hint="Übergreifend bedeutet: ohne Gewerkbezug. Sonst gehört die Funktion genau zu diesem Gewerk – „Fachplanung“ in LST ist eine andere Funktion als in OLA."
          >
            <div className="row" style={{ gap: 8 }}>
              <Select
                value={form.gewerk ?? UEBERGREIFEND}
                onChange={(v) => set('gewerk', v === UEBERGREIFEND ? null : v)}
                options={[UEBERGREIFEND, ...data.gewerke].map((g) => ({ value: g, label: g }))}
              />
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setNeuesGewerk(true)}>
                <Icon name="plus" size={13} /> Gewerk
              </button>
            </div>
          </Field>
          <Field label="Kürzel" hint="leer = aus der Bezeichnung gebildet">
            <TextInput value={form.kuerzel} onChange={(v) => set('kuerzel', v)} />
          </Field>
          <Field label="Farbe">
            <input
              type="color"
              value={form.farbe}
              onChange={(e) => set('farbe', e.target.value)}
              style={{ width: 52, height: 32, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
            />
          </Field>
          <Field label="Beschreibung" full>
            <TextArea value={form.beschreibung} onChange={(v) => set('beschreibung', v)} rows={2} />
          </Field>
        </div>
      </Modal>

      {neuesGewerk ? (
        <GewerkDialog onClose={() => setNeuesGewerk(false)} onAngelegt={(g) => set('gewerk', g)} />
      ) : null}
    </>
  );
}
