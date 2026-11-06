/**
 * Sicherung des Bereichs: Bestand als JSON herunterladen und wieder
 * einspielen. Die Sicherung trägt das Kennzeichen des Bereichs; Sicherungen
 * der anderen Bereiche werden abgewiesen (sicherungLesen in store/storage.ts).
 *
 * Nach einem Ladefehler oder bei einem Stand aus einer neueren Fassung zeigt
 * der Bereich nur Demodaten (`ladeZustand`): Dann sichert „Sicherung“ den
 * gespeicherten Stand unverändert, und über einen Stand aus einer neueren
 * Fassung lässt sich nichts einspielen.
 */
import { useRef, useState } from 'react';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Callout, Modal } from '../../../shared/ui';
import type { LeistungsnachweisDaten } from '../domain/types';
import { exportiereDaten, rohdatenHerunterladen, sicherungLesen } from '../store/storage';
import { useStore } from '../store/store';
import { anzahl } from './common';

export interface Sicherung {
  datei: string;
  daten: LeistungsnachweisDaten;
}

/**
 * Schaltfläche „Sicherung“ in der Seitenleiste. Zeigt der Bereich wegen eines
 * Lade- oder Fassungsfehlers Demodaten, wird der gespeicherte Stand
 * unverändert heruntergeladen.
 */
export function SicherungKnopf() {
  const { data, ladeZustand } = useStore();
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn btn-sm btn-outline"
      onClick={() => {
        if (ladeZustand === 'ok') exportiereDaten(data);
        else if (!rohdatenHerunterladen()) toast('Es ist kein gespeicherter Stand vorhanden, der sich herunterladen ließe.');
      }}
      title={
        ladeZustand === 'ok'
          ? 'Gesamten Datenbestand der Leistungsnachweise als JSON sichern'
          : 'Gespeicherten Stand unverändert herunterladen'
      }
    >
      <Icon name="export" size={12} /> Sicherung
    </button>
  );
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

/** Umfang einer Sicherung in Worten. */
function umfangVon(daten: LeistungsnachweisDaten): string {
  return `${anzahl(daten.projekte.length, 'Projekt', 'Projekte')}, ${anzahl(
    daten.mitarbeiter.length,
    'Mitarbeiter',
    'Mitarbeiter',
  )}, ${anzahl(daten.leistungen.length, 'Leistung', 'Leistungen')}, ${anzahl(
    daten.nachweise.length,
    'Leistungsnachweis',
    'Leistungsnachweise',
  )}`;
}

/** Rückfrage vor dem Einspielen – „Angemeldet als“, „Ich erfasse als“ und Farbmodus bleiben erhalten. */
export function SicherungEinspielenDialog({
  sicherung,
  onClose,
  onEingespielt,
}: {
  sicherung: Sicherung;
  onClose: () => void;
  onEingespielt: () => void;
}) {
  const { data, ladeZustand, ersetzeDaten } = useStore();
  const toast = useToast();
  const [mitEinstellungen, setMitEinstellungen] = useState(false);
  const { daten } = sicherung;
  const umfang = umfangVon(daten);
  // Ein gespeicherter Stand aus einer neueren Fassung darf nicht überschrieben werden
  const neuereFassung = ladeZustand === 'neuere_fassung';

  const einspielen = () => {
    if (neuereFassung) return;
    // Die Anmeldung bleibt nur, wenn die angemeldete Person auch in der Sicherung vorkommt
    const eigene = data.einstellungen;
    const einstellungen = mitEinstellungen
      ? daten.einstellungen
      : {
          ...eigene,
          mitarbeiterId: daten.mitarbeiter.some((m) => m.id === eigene.mitarbeiterId) ? eigene.mitarbeiterId : null,
        };
    ersetzeDaten({ ...daten, einstellungen });
    toast(`Sicherung eingespielt – ${umfang}.`);
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
          {ladeZustand === 'ok' ? (
            <button type="button" className="btn btn-outline" onClick={() => exportiereDaten(data)}>
              <Icon name="export" size={14} /> Aktuellen Stand sichern
            </button>
          ) : null}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ background: 'var(--red)' }}
            disabled={neuereFassung}
            onClick={einspielen}
          >
            Einspielen
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <p>Die Sicherung enthält {umfang}.</p>
        {neuereFassung ? (
          <Callout ton="error" icon="!">
            Gespeichert ist ein Stand aus einer neueren Fassung von KaPlan. Damit er nicht überschrieben wird, lässt sich
            hier nichts einspielen – bitte zuerst die Seite neu laden.
          </Callout>
        ) : ladeZustand === 'ladefehler' ? (
          <Callout ton="error" icon="!">
            Der gespeicherte Stand ließ sich nicht laden. Das Einspielen überschreibt ihn – wer ihn noch braucht, lädt ihn
            vorher über den Hinweis oben herunter.
          </Callout>
        ) : (
          <Callout ton="warn" icon="!">
            Der gesamte jetzige Bestand der Leistungsnachweise in diesem Browser wird ersetzt. Die anderen Bereiche bleiben
            unberührt.
          </Callout>
        )}
        <label className="checkbox">
          <input type="checkbox" checked={mitEinstellungen} onChange={(e) => setMitEinstellungen(e.target.checked)} />
          Auch die Anmeldung („Angemeldet als“) und den Farbmodus aus der Sicherung übernehmen
        </label>
      </div>
    </Modal>
  );
}
