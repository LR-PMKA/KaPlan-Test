/**
 * Anlage und Pflege eines Mitarbeiters – aus der Seite „Mitarbeiter“ und
 * direkt beim Erfassen einer Leistung. Das Kürzel ist eindeutig: Daran erkennt
 * der Excel-Import die Person („LR: Roese, Lukas“). Bleibt es leer, entsteht es
 * aus dem Namen (bei Bedarf mit angehängter Zahl, etwa „LR2“).
 */
import { useState } from 'react';
import { useToast } from '../../../shared/toast';
import { Field, Modal, TextInput } from '../../../shared/ui';
import { kuerzelAus, mitarbeiterName, type ID, type Mitarbeiter } from '../domain/types';
import { useStore } from '../store/store';

const kuerzelSchluessel = (k: string) => k.replace(/\s+/g, '').toUpperCase();

/** Ein aus dem Namen gebildetes Kürzel, das noch frei ist: „LR“, sonst „LR2“, „LR3“ … */
function freiesKuerzel(basis: string, vergeben: Set<string>): string {
  if (!vergeben.has(kuerzelSchluessel(basis))) return basis;
  for (let n = 2; ; n++) {
    const kandidat = `${basis}${n}`;
    if (!vergeben.has(kuerzelSchluessel(kandidat))) return kandidat;
  }
}

export function MitarbeiterDialog({
  mitarbeiter,
  onClose,
  onAngelegt,
}: {
  mitarbeiter?: Mitarbeiter;
  onClose: () => void;
  /** Meldet die Kennung eines neu angelegten Mitarbeiters. */
  onAngelegt?: (id: ID) => void;
}) {
  const { data, addMitarbeiter, updateMitarbeiter } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({
    kuerzel: mitarbeiter?.kuerzel ?? '',
    vorname: mitarbeiter?.vorname ?? '',
    nachname: mitarbeiter?.nachname ?? '',
    aktiv: mitarbeiter?.aktiv ?? true,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const vorschlag = kuerzelAus(`${form.vorname} ${form.nachname}`);

  const speichern = () => {
    const vorname = form.vorname.trim();
    const nachname = form.nachname.trim();
    if (!nachname) {
      toast('Bitte einen Nachnamen angeben.');
      return;
    }
    const vergeben = new Set(
      data.mitarbeiter.filter((m) => m.id !== mitarbeiter?.id).map((m) => kuerzelSchluessel(m.kuerzel)),
    );
    const eingegeben = form.kuerzel.trim();
    if (eingegeben && vergeben.has(kuerzelSchluessel(eingegeben))) {
      toast(`Das Kürzel „${eingegeben}“ ist bereits vergeben.`);
      return;
    }
    const kuerzel = eingegeben || freiesKuerzel(kuerzelAus(`${vorname} ${nachname}`), vergeben);
    const werte = { kuerzel, vorname, nachname, aktiv: form.aktiv };
    if (mitarbeiter) {
      updateMitarbeiter(mitarbeiter.id, werte);
      toast('Mitarbeiter gespeichert.');
    } else {
      const id = addMitarbeiter(werte);
      toast(`„${mitarbeiterName(werte)}“ angelegt.`);
      onAngelegt?.(id);
    }
    onClose();
  };

  return (
    <Modal
      titel={mitarbeiter ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}
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
      <div className="form-grid ln-zweispaltig">
        <Field label="Vorname">
          <TextInput value={form.vorname} onChange={(v) => set('vorname', v)} placeholder="z. B. Lukas" autoFocus />
        </Field>
        <Field label="Nachname">
          <TextInput value={form.nachname} onChange={(v) => set('nachname', v)} placeholder="z. B. Roese" />
        </Field>
        <Field
          label="Kürzel"
          hint="Wie in der Zeiterfassung („LR: Roese, Lukas“) – daran erkennt der Excel-Import die Person. Leer = aus dem Namen gebildet."
        >
          <TextInput
            value={form.kuerzel}
            onChange={(v) => set('kuerzel', v)}
            placeholder={vorschlag || 'LR'}
            maxLength={8}
          />
        </Field>
        <Field
          label="Status"
          hint="Ausgeschiedene behalten ihre Leistungen, stehen beim Erfassen aber nicht mehr zur Wahl."
        >
          <label className="checkbox" style={{ paddingTop: 7 }}>
            <input type="checkbox" checked={form.aktiv} onChange={(e) => set('aktiv', e.target.checked)} />
            aktiv
          </label>
        </Field>
      </div>
    </Modal>
  );
}
