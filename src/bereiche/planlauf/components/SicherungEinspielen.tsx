/**
 * Einspielen einer Sicherung – das Gegenstück zur Schaltfläche „Sicherung“.
 *
 * Die gewählte JSON-Datei wird gelesen und wie beim Laden auf die aktuelle
 * Fassung gehoben (sicherungLesen in store/storage.ts). Danach wählt man:
 * „Alles ersetzen“ ersetzt den gesamten Bestand in diesem Browser („Angemeldet
 * als“ bleibt erhalten, sofern nicht ausdrücklich der Name aus der Sicherung
 * gewählt wird); „Abgleichen und auswählen“ zeigt die Unterschiede und
 * übernimmt nur das Gewählte (components/Abgleich.tsx).
 */
import { useRef, useState } from 'react';
import { STANDARD_BEARBEITER, type AppData, type ISODate } from '../domain/types';
import { exportiereDaten, sicherungLesen } from '../store/storage';
import { useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import { Callout, Modal } from '../../../shared/ui';
import { Icon } from '../../../shared/icons';
import { toISO } from '../../../shared/dates';
import { AbgleichDialog } from './Abgleich';

/** Gelesene Sicherung samt Dateiname und Stand (Änderungsdatum der Datei). */
export interface Sicherung {
  datei: string;
  daten: AppData;
  stand: ISODate | null;
}

/**
 * Schaltfläche „Einspielen“ in der Seitenleiste: wählt die Datei und liest sie.
 * Die Rückfrage steht außerhalb der Seitenleiste (SicherungEinspielenDialog),
 * weil deren Hintergrundfilter fest positionierte Dialoge sonst einschließt.
 */
export function SicherungWaehlen({ onGelesen }: { onGelesen: (sicherung: Sicherung) => void }) {
  const toast = useToast();
  const eingabe = useRef<HTMLInputElement>(null);

  const lesen = async (datei: File) => {
    try {
      onGelesen({
        datei: datei.name,
        daten: sicherungLesen(await datei.text()),
        stand: datei.lastModified ? toISO(new Date(datei.lastModified)) : null,
      });
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
        title="Sicherung (JSON) einspielen – ganz ersetzen oder abgleichen"
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
          // Dieselbe Datei soll sich erneut wählen lassen
          e.target.value = '';
          if (datei) void lesen(datei);
        }}
      />
    </>
  );
}

/**
 * Nach dem Lesen: nennt den Inhalt der Sicherung und bietet „Alles ersetzen“
 * (mit Rückfrage und dem Angebot, vorher zu sichern) oder „Abgleichen und
 * auswählen“ an.
 */
export function SicherungEinspielenDialog({
  sicherung,
  onClose,
  onEingespielt,
}: {
  sicherung: Sicherung;
  onClose: () => void;
  onEingespielt: () => void;
}) {
  const { data, ersetzeDaten, ladeZustand } = useStore();
  const toast = useToast();
  // Ohne eingerichteten Namen liegt es nahe, den aus der Sicherung zu nehmen
  const [nameUebernehmen, setNameUebernehmen] = useState(data.bearbeiter.name === STANDARD_BEARBEITER);
  const [abgleichen, setAbgleichen] = useState(false);

  const anzahl = (n: number, eins: string, mehr: string) => `${n} ${n === 1 ? eins : mehr}`;
  const fremderName = sicherung.daten.bearbeiter.name !== data.bearbeiter.name;
  // Ein gespeicherter Stand aus einer neueren Fassung darf nicht überschrieben werden;
  // nach einem Ladefehler gibt es keinen Bestand, mit dem sich abgleichen ließe.
  const neuereFassung = ladeZustand === 'neuere_fassung';
  const ohneBestand = ladeZustand !== 'ok';

  const einspielen = () => {
    const { daten } = sicherung;
    // „Angemeldet als“ samt Farbmodus kommt nur auf ausdrücklichen Wunsch aus der Sicherung
    ersetzeDaten(fremderName && nameUebernehmen ? daten : { ...daten, bearbeiter: data.bearbeiter });
    toast(
      `Sicherung eingespielt – ${anzahl(daten.projects.length, 'Projekt', 'Projekte')}, ${anzahl(
        daten.runs.length,
        'Planlauf',
        'Planläufe',
      )}.`,
    );
    onClose();
    onEingespielt();
  };

  if (abgleichen) return <AbgleichDialog sicherung={sicherung} onClose={onClose} />;

  return (
    <Modal
      titel="Sicherung einspielen"
      sub={sicherung.datei}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => exportiereDaten(data)}
            title="Den jetzigen Bestand vorher als JSON sichern"
          >
            <Icon name="export" size={14} /> Aktuellen Stand sichern
          </button>
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
            Alles ersetzen
          </button>
          <button type="button" className="btn btn-primary" disabled={ohneBestand} onClick={() => setAbgleichen(true)}>
            Abgleichen und auswählen …
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <p>
          Die Sicherung enthält {anzahl(sicherung.daten.projects.length, 'Projekt', 'Projekte')},{' '}
          {anzahl(
            sicherung.daten.documents.filter((d) => d.kind !== 'paket').length,
            'Plan bzw. Planverzeichnis',
            'Pläne und Planverzeichnisse',
          )}{' '}
          und {anzahl(sicherung.daten.runs.length, 'Planlauf', 'Planläufe')}.
        </p>
        <div className="ab-wahl-liste">
          <div className="ab-wahl-option">
            <strong>Abgleichen und auswählen</strong>
            Zeigt, was in der Sicherung neu, geändert oder im Bestand gelöscht ist, und übernimmt nur das Gewählte. Alles
            andere im Bestand bleibt erhalten.
          </div>
          <div className="ab-wahl-option">
            <strong>Alles ersetzen</strong>
            Der gesamte jetzige Bestand in diesem Browser wird durch die Sicherung ersetzt.
          </div>
        </div>
        {neuereFassung ? (
          <Callout ton="error" icon="!">
            Gespeichert ist ein Stand aus einer neueren Fassung von KaPlan. Damit er nicht überschrieben wird, lässt sich
            hier nichts einspielen – bitte zuerst die Seite neu laden.
          </Callout>
        ) : ladeZustand === 'ladefehler' ? (
          <Callout ton="error" icon="!">
            Der gespeicherte Stand ließ sich nicht laden; abgleichen ist deshalb nicht möglich. „Alles ersetzen“
            überschreibt ihn – wer ihn noch braucht, lädt ihn vorher über die Hinweisleiste herunter.
          </Callout>
        ) : (
          <Callout ton="warn" icon="!">
            „Alles ersetzen“ lässt sich nicht rückgängig machen – wer den jetzigen Bestand noch braucht, sichert ihn vorher.
          </Callout>
        )}
        {fremderName ? (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={nameUebernehmen}
              onChange={(e) => setNameUebernehmen(e.target.checked)}
            />
            Beim Ersetzen „Angemeldet als“ aus der Sicherung übernehmen ({sicherung.daten.bearbeiter.name}) – sonst bleibt es bei{' '}
            {data.bearbeiter.name}
          </label>
        ) : null}
      </div>
    </Modal>
  );
}
