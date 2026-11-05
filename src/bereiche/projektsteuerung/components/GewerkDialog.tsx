/**
 * Gewerke der Funktionen anlegen und löschen – wie im Planlaufmanagement.
 * Ein Gewerk lässt sich nur löschen, solange keine seiner Funktionen
 * Projektbeteiligten zugeordnet ist; seine Funktionen entfallen mit ihm.
 */
import { useState } from 'react';
import { useToast } from '../../../shared/toast';
import { Field, Modal, TextInput } from '../../../shared/ui';
import { UEBERGREIFEND, funktionsName } from '../domain/types';
import { useStore } from '../store/store';

export function GewerkDialog({ onClose, onAngelegt }: { onClose: () => void; onAngelegt?: (name: string) => void }) {
  const { data, addGewerk } = useStore();
  const toast = useToast();
  const [name, setName] = useState('');

  const speichern = () => {
    const wert = name.trim();
    if (!wert) {
      toast('Bitte eine Bezeichnung angeben.');
      return;
    }
    if (wert.toLowerCase() === UEBERGREIFEND.toLowerCase() || data.gewerke.some((g) => g.toLowerCase() === wert.toLowerCase())) {
      toast(`„${wert}“ ist bereits angelegt.`);
      return;
    }
    addGewerk(wert);
    toast(`Gewerk „${wert}“ angelegt.`);
    onAngelegt?.(wert);
    onClose();
  };

  return (
    <Modal
      titel="Neues Gewerk"
      sub="Gilt projektübergreifend und steht überall zur Auswahl"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={speichern}>
            Anlegen
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Bezeichnung" full hint="Kurzform wie KIB, LST oder OLA">
          <TextInput
            value={name}
            onChange={setName}
            placeholder="z. B. Oberbau"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && speichern()}
          />
        </Field>
      </div>
      {data.gewerke.length > 0 ? (
        <p className="small tertiary" style={{ marginTop: 10 }}>
          Vorhanden: {data.gewerke.join(' · ')}
        </p>
      ) : null}
    </Modal>
  );
}

/** Rückfrage vor dem Löschen eines Gewerks – nennt die Funktionen, die mit ihm entfallen. */
export function GewerkLoeschenDialog({
  gewerk,
  onClose,
  onGeloescht,
}: {
  gewerk: string;
  onClose: () => void;
  onGeloescht?: () => void;
}) {
  const { data, deleteGewerk } = useStore();
  const toast = useToast();
  const funktionen = data.funktionen.filter((f) => (f.gewerk ?? '').toLowerCase() === gewerk.toLowerCase());

  return (
    <Modal
      titel={`Gewerk „${gewerk}“ löschen?`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ background: 'var(--red)' }}
            onClick={() => {
              deleteGewerk(gewerk);
              toast(`Gewerk „${gewerk}“ gelöscht.`);
              onGeloescht?.();
              onClose();
            }}
          >
            Löschen
          </button>
        </>
      }
    >
      <p className="muted">
        {funktionen.length > 0
          ? `Mit dem Gewerk entfallen ${funktionen.length === 1 ? 'die Funktion' : 'die Funktionen'} ${funktionen
              .map((f) => `„${funktionsName(f)}“`)
              .join(', ')}.`
          : 'Dem Gewerk ist keine Funktion zugeordnet – es wird nur aus der Auswahl entfernt.'}
      </p>
    </Modal>
  );
}
