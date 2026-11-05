/**
 * Sicherung des Bereichs: Bestand als JSON herunterladen und wieder
 * einspielen. Die Sicherung trägt das Kennzeichen des Bereichs; eine Sicherung
 * des Planlaufmanagements wird abgewiesen (sicherungLesen in store/storage.ts).
 */
import { useRef, useState } from 'react';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Callout, Modal } from '../../../shared/ui';
import type { BaubetriebDaten } from '../domain/types';
import { exportiereDaten, sicherungLesen } from '../store/storage';
import { useStore } from '../store/store';

export interface Sicherung {
  datei: string;
  daten: BaubetriebDaten;
}

/** Schaltfläche „Einspielen“ in der Seitenleiste: wählt die Datei und liest sie. */
export function SicherungWaehlen({ onGelesen }: { onGelesen: (s: Sicherung) => void }) {
  const toast = useToast();
  const eingabe = useRef<HTMLInputElement>(null);

  const lesen = async (datei: File) => {
    try {
      onGelesen({ datei: datei.name, daten: sicherungLesen(await datei.text()) });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Die Sicherung konnte nicht gelesen werden.');
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-outline"
        onClick={() => eingabe.current?.click()}
        title="Sicherung (JSON) einspielen – ersetzt den Datenbestand"
      >
        <Icon name="importieren" size={12} /> Einspielen
      </button>
      <input
        ref={eingabe}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const datei = e.target.files?.[0];
          e.target.value = '';
          if (datei) void lesen(datei);
        }}
      />
    </>
  );
}

const anzahl = (n: number, eins: string, mehr: string) => `${n} ${n === 1 ? eins : mehr}`;

/** Rückfrage vor dem Einspielen – „Angemeldet als“ und Farbmodus bleiben erhalten. */
export function SicherungEinspielenDialog({
  sicherung,
  onClose,
  onEingespielt,
}: {
  sicherung: Sicherung;
  onClose: () => void;
  onEingespielt: () => void;
}) {
  const { data, ersetzeDaten } = useStore();
  const toast = useToast();
  const [mitEinstellungen, setMitEinstellungen] = useState(false);
  const { daten } = sicherung;

  const einspielen = () => {
    ersetzeDaten({
      ...daten,
      einstellungen: mitEinstellungen
        ? daten.einstellungen
        : { ...daten.einstellungen, bearbeiter: data.einstellungen.bearbeiter, farbmodus: data.einstellungen.farbmodus },
    });
    toast(
      `Sicherung eingespielt – ${anzahl(daten.projekte.length, 'Projekt', 'Projekte')}, ${anzahl(
        daten.anmeldungen.length,
        'Anmeldung',
        'Anmeldungen',
      )}.`,
    );
    onClose();
    onEingespielt();
  };

  return (
    <Modal
      titel="Sicherung einspielen?"
      sub={sicherung.datei}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={() => exportiereDaten(data)}>
            <Icon name="export" size={14} /> Aktuellen Stand sichern
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" style={{ background: 'var(--red)' }} onClick={einspielen}>
            Einspielen
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <p>
          Die Sicherung enthält {anzahl(daten.projekte.length, 'Projekt', 'Projekte')} und{' '}
          {anzahl(daten.anmeldungen.length, 'Anmeldung', 'Anmeldungen')}.
        </p>
        <Callout ton="warn" icon="!">
          Der gesamte jetzige Bestand der Baubetriebsplanung in diesem Browser wird ersetzt. Das Planlaufmanagement
          bleibt unberührt.
        </Callout>
        <label className="checkbox">
          <input type="checkbox" checked={mitEinstellungen} onChange={(e) => setMitEinstellungen(e.target.checked)} />
          Auch „Angemeldet als“ und Farbmodus aus der Sicherung übernehmen
        </label>
      </div>
    </Modal>
  );
}
