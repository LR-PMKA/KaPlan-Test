/**
 * Anlage und Pflege eines Mitarbeiters – im Reiter „Mitarbeiter“ des
 * Controllings (domain/rechte.ts: `mitarbeiterVerwalten`). Das Kürzel ist
 * eindeutig: Daran und am Namen erkennt der Excel-Import die Person
 * („MM: Mustermann, Max“). Bleibt es leer, entsteht es aus dem Namen (bei
 * Bedarf mit angehängter Zahl, etwa „MM2“). Dazu die Rolle Controlling: Die
 * letzte Person mit der Rolle behält sie, Ausgeschiedene erhalten sie nicht.
 */
import { useState } from 'react';
import { useToast } from '../../../shared/toast';
import { Field, Modal, TextInput } from '../../../shared/ui';
import { kuerzelFrei, kuerzelNormal } from '../domain/import';
import { LETZTE_ROLLE, istControlling, letzterController } from '../domain/rechte';
import { kuerzelAus, mitarbeiterName, type ID, type Mitarbeiter } from '../domain/types';
import { useStore } from '../store/store';

/** Meldung, wenn eine ausgeschiedene Person die Rolle erhalten soll. */
const AUSGESCHIEDEN_OHNE_ROLLE = 'Ausgeschiedene Mitarbeiter erhalten die Rolle Controlling nicht.';

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
  const { data, addMitarbeiter, updateMitarbeiter, rolleSetzen } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({
    kuerzel: mitarbeiter?.kuerzel ?? '',
    vorname: mitarbeiter?.vorname ?? '',
    nachname: mitarbeiter?.nachname ?? '',
    aktiv: mitarbeiter?.aktiv ?? true,
    controlling: mitarbeiter?.controlling ?? false,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const vorschlag = kuerzelAus(`${form.vorname} ${form.nachname}`);
  // Die Rolle vergibt nur das Controlling; die letzte Person mit der Rolle behält sie
  const rolleWaehlbar = istControlling(data);
  const letzte = !!mitarbeiter && mitarbeiter.controlling && letzterController(data, mitarbeiter.id);

  const speichern = () => {
    const vorname = form.vorname.trim();
    const nachname = form.nachname.trim();
    if (!nachname) {
      toast('Bitte einen Nachnamen angeben.');
      return;
    }
    const andere = data.mitarbeiter.filter((m) => m.id !== mitarbeiter?.id);
    const eingegeben = form.kuerzel.trim();
    if (eingegeben && andere.some((m) => kuerzelNormal(m.kuerzel) === kuerzelNormal(eingegeben))) {
      toast(`Das Kürzel „${eingegeben}“ ist bereits vergeben.`);
      return;
    }
    if (form.controlling && !form.aktiv && (!mitarbeiter || !mitarbeiter.controlling)) {
      toast(AUSGESCHIEDEN_OHNE_ROLLE);
      return;
    }
    if (letzte && (!form.controlling || !form.aktiv)) {
      toast(LETZTE_ROLLE);
      return;
    }
    const kuerzel = eingegeben || kuerzelFrei(kuerzelAus(`${vorname} ${nachname}`), andere);
    const werte = { kuerzel, vorname, nachname, aktiv: form.aktiv };
    if (mitarbeiter) {
      // Erst die Rolle abgeben, dann die Angaben ändern (etwa ausscheiden), zuletzt die Rolle vergeben.
      // Gibt die angemeldete Person ihre eigene Rolle ab, zuerst die Angaben – danach dürfte sie sie nicht mehr ändern.
      const rolleNeu = rolleWaehlbar && form.controlling !== mitarbeiter.controlling;
      const abgeben = rolleNeu && !form.controlling;
      const selbst = mitarbeiter.id === data.einstellungen.mitarbeiterId;
      const meldung =
        abgeben && selbst
          ? (updateMitarbeiter(mitarbeiter.id, werte) ?? rolleSetzen(mitarbeiter.id, false))
          : ((abgeben ? rolleSetzen(mitarbeiter.id, false) : null) ?? updateMitarbeiter(mitarbeiter.id, werte));
      if (meldung) {
        toast(meldung);
        return;
      }
      // Vergeben darf das Controlling jeder aktiven Person (oben geprüft); die Meldung von rolleSetzen
      // bezöge sich auf den Stand vor dieser Änderung (etwa noch ausgeschieden) und gilt hier nicht.
      if (rolleNeu && form.controlling) rolleSetzen(mitarbeiter.id, true);
      toast('Mitarbeiter gespeichert.');
    } else {
      // Die Rolle gleich mitgeben: Wer anlegen darf, darf sie vergeben (die Person ist aktiv, oben geprüft)
      const id = addMitarbeiter({ ...werte, controlling: rolleWaehlbar && form.controlling });
      if (!id) {
        toast('Mitarbeiter anlegen ist Personen mit der Rolle Controlling vorbehalten.');
        return;
      }
      toast(`„${mitarbeiterName(werte)}“ angelegt${rolleWaehlbar && form.controlling ? ' – mit der Rolle Controlling' : ''}.`);
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
          <TextInput value={form.vorname} onChange={(v) => set('vorname', v)} placeholder="z. B. Max" autoFocus />
        </Field>
        <Field label="Nachname">
          <TextInput value={form.nachname} onChange={(v) => set('nachname', v)} placeholder="z. B. Mustermann" />
        </Field>
        <Field
          label="Kürzel"
          hint="Wie in der Zeiterfassung („MM: Mustermann, Max“) – daran und am Namen erkennt der Excel-Import die Person. Leer = aus dem Namen gebildet."
        >
          <TextInput
            value={form.kuerzel}
            onChange={(v) => set('kuerzel', v)}
            placeholder={vorschlag || 'MM'}
            maxLength={8}
          />
        </Field>
        <Field
          label="Status"
          hint={
            letzte
              ? `${LETZTE_ROLLE} Ausscheiden kann diese Person erst, wenn eine andere die Rolle hat.`
              : 'Ausgeschiedene behalten ihre Leistungen, stehen bei der Anmeldung aber nicht mehr zur Wahl.'
          }
        >
          <label className="checkbox" style={{ paddingTop: 7 }}>
            <input type="checkbox" checked={form.aktiv} disabled={letzte && form.aktiv} onChange={(e) => set('aktiv', e.target.checked)} />
            aktiv
          </label>
        </Field>
        {rolleWaehlbar ? (
          <Field
            label="Rolle"
            hint={
              letzte
                ? LETZTE_ROLLE
                : 'Controlling: Auswertung, Aufschläge, Abschließen, Export und Mitarbeiter verwalten. Ohne Rolle erfasst die Person nur eigene Leistungen.'
            }
          >
            <label className="checkbox" style={{ paddingTop: 7 }}>
              <input
                type="checkbox"
                checked={form.controlling}
                disabled={letzte && form.controlling}
                onChange={(e) => set('controlling', e.target.checked)}
              />
              Controlling
            </label>
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}
