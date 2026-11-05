/**
 * Kleine Dialoge rund um die Terminfrist: Nachhaken festhalten und den
 * Termin im aktuellen Status von Hand festlegen.
 */
import { useState } from 'react';
import { addDays, formatDate, today } from '../../../shared/dates';
import { useToast } from '../../../shared/toast';
import { Field, Modal, TextArea, TextInput } from '../../../shared/ui';
import { terminfrist } from '../domain/fristen';
import type { Anmeldung } from '../domain/types';
import { anmeldungBezeichnung, statusVon } from '../domain/workflow';
import { useStore } from '../store/store';

/** Hält fest, dass nachgehakt wurde – mit Notiz und optional neuem Termin. */
export function NachhakenDialog({ anmeldung, onClose }: { anmeldung: Anmeldung; onClose: () => void }) {
  const { data, nachgehakt } = useStore();
  const toast = useToast();
  const [datum, setDatum] = useState(today());
  const [notiz, setNotiz] = useState('');
  // Nächster Nachhak-Termin: Abstand des Status, sonst die Vorgabe aus den Einstellungen
  const { status } = statusVon(data.workflows, anmeldung.statusId);
  const abstand = status.frist.typ === 'nachhaken' ? status.frist.tage : data.einstellungen.nachhakTage;
  const [neuerTermin, setNeuerTermin] = useState(addDays(today(), abstand));

  return (
    <Modal
      titel="Nachgehakt"
      sub={anmeldungBezeichnung(anmeldung)}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              nachgehakt(anmeldung.id, datum || today(), notiz, neuerTermin || null);
              toast(neuerTermin ? `Nachhaken festgehalten – nächster Termin ${formatDate(neuerTermin)}.` : 'Nachhaken festgehalten.');
              onClose();
            }}
          >
            Festhalten
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nachgehakt am">
          <TextInput type="date" value={datum} onChange={setDatum} />
        </Field>
        <Field label="Nächster Nachhak-Termin" hint="leer lassen, um die bisherige Frist zu behalten">
          <TextInput type="date" value={neuerTermin} onChange={setNeuerTermin} />
        </Field>
        <Field label="Notiz" full>
          <TextArea value={notiz} onChange={setNotiz} rows={3} placeholder="Wer wurde wie erreicht, was ist zugesagt?" />
        </Field>
      </div>
    </Modal>
  );
}

/** Legt die Terminfrist im aktuellen Status fest oder kehrt zur Berechnung zurück. */
export function TerminDialog({ anmeldung, onClose }: { anmeldung: Anmeldung; onClose: () => void }) {
  const { data, terminSetzen } = useStore();
  const toast = useToast();
  const berechnet = terminfrist({ ...anmeldung, terminManuell: null }, data);
  const [termin, setTermin] = useState(anmeldung.terminManuell ?? berechnet.datum ?? today());

  return (
    <Modal
      titel="Termin festlegen"
      sub="Gilt nur im aktuellen Status – mit dem nächsten Statuswechsel wird wieder berechnet."
      onClose={onClose}
      footer={
        <>
          {anmeldung.terminManuell ? (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                terminSetzen(anmeldung.id, null);
                toast('Terminfrist wird wieder berechnet.');
                onClose();
              }}
            >
              Wieder berechnen
            </button>
          ) : null}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              terminSetzen(anmeldung.id, termin || null);
              toast('Termin festgelegt.');
              onClose();
            }}
          >
            Festlegen
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Termin">
          <TextInput type="date" value={termin} onChange={setTermin} />
        </Field>
        <Field label="Berechnet wäre">
          <span className="small">
            {berechnet.datum ? <b>{formatDate(berechnet.datum)}</b> : 'keine Frist'}
            <div className="tertiary small">{berechnet.erlaeuterung}</div>
          </span>
        </Field>
      </div>
    </Modal>
  );
}
