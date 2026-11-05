/** Kleiner Dialog zum Anlegen eines weiteren Gewerks. */
import { useState } from 'react';
import { useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import { Field, Modal, TextInput } from '../../../shared/ui';

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
    if (data.gewerke.some((g) => g.toLowerCase() === wert.toLowerCase())) {
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
          <TextInput value={name} onChange={setName} placeholder="z.B. BÜ" onKeyDown={(e) => e.key === 'Enter' && speichern()} />
        </Field>
      </div>
      <p className="small tertiary" style={{ marginTop: 10 }}>
        Vorhanden: {data.gewerke.join(' · ')}
      </p>
    </Modal>
  );
}

/**
 * Löschen eines Gewerks. Der Dialog nennt vorab, was damit entfällt: die
 * Funktionen dieses Gewerks – in den Stammdaten wie in den Projekten – und
 * deren Besetzung. Pläne behalten ihre Angabe, verlieren aber den Bezug.
 */
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

  const gleich = (g: string | null) => (g ?? '').trim().toLowerCase() === gewerk.trim().toLowerCase();
  const standard = data.standardRollen.filter((r) => gleich(r.gewerk));
  const projektRollen = data.roles.filter((r) => gleich(r.gewerk));
  const rollenIds = new Set(projektRollen.map((r) => r.id));
  const besetzungen = data.contacts.filter((c) => c.zuordnungen.some((z) => rollenIds.has(z.roleId))).length;
  const plaene = data.documents.filter((d) => gleich(d.gewerk)).length;
  const projekte = new Set(projektRollen.map((r) => r.projectId)).size;

  const folgen = [
    standard.length > 0 ? `${standard.length} projektübergreifende Funktion(en)` : null,
    projektRollen.length > 0 ? `${projektRollen.length} Projektfunktion(en) in ${projekte} Projekt(en)` : null,
    besetzungen > 0 ? `${besetzungen} Besetzung(en)` : null,
  ].filter(Boolean) as string[];

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
            className="btn btn-danger"
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
      <p className="small">
        {folgen.length > 0
          ? `Damit entfallen ${folgen.join(', ')}.`
          : 'Dem Gewerk ist keine Funktion zugeordnet – es wird nur aus der Auswahl entfernt.'}
      </p>
      {plaene > 0 ? (
        <p className="small tertiary" style={{ marginTop: 10 }}>
          {plaene} Plan/Pläne führen „{gewerk}“ weiterhin als Angabe. Sie bleiben erhalten, finden danach aber
          keine Verantwortlichen dieses Gewerks mehr.
        </p>
      ) : null}
    </Modal>
  );
}
