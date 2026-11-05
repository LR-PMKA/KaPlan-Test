/**
 * Dauerhafte Hinweisleisten über dem Inhalt (eingebunden in App.tsx):
 *  - Ladefehler: der gespeicherte Stand ließ sich nicht lesen. Angezeigt werden
 *    Demodaten, gespeichert wird nichts (store/storage.ts ladeDaten), bis man
 *    ausdrücklich mit Demodaten neu beginnt oder eine Sicherung einspielt.
 *  - Neuere Fassung: die gespeicherten Daten stammen aus einer neueren Fassung;
 *    nur „Seite neu laden“ – alles andere könnte den neueren Stand überschreiben.
 *  - Speicherfehler: der letzte Stand ließ sich nicht speichern (Speicher voll).
 *  - Stammdaten-Kopien: beim Laden als „… (eigene Fassung)“ behaltene, selbst
 *    geänderte Standard-Workflows – einmalig, bis zum Quittieren.
 */
import { useState } from 'react';
import { exportiereDaten, rohdatenHerunterladen } from '../store/storage';
import { useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import { ConfirmDialog } from '../../../shared/ui';
import './abgleich.css';

export function Hinweisleisten() {
  const { data, ladeZustand, speicherZustand, stammdatenKopien, stammdatenHinweisQuittieren, zuruecksetzen } = useStore();
  const toast = useToast();
  const [neuBeginnen, setNeuBeginnen] = useState(false);

  const ladefehler = ladeZustand === 'ladefehler';
  const neuereFassung = ladeZustand === 'neuere_fassung';
  const speicherfehler = ladeZustand === 'ok' && speicherZustand !== 'ok';
  const kopien = stammdatenKopien.length > 0;
  const leisten = ladefehler || neuereFassung || speicherfehler || kopien;
  if (!leisten && !neuBeginnen) return null;

  const gespeichertHerunterladen = () => {
    if (!rohdatenHerunterladen()) toast('Es ist kein gespeicherter Stand vorhanden, der sich herunterladen ließe.');
  };

  return (
    <>
      {leisten ? (
        <div className="ab-leisten">
          {ladefehler ? (
            <div className="ab-leiste fehler" role="alert">
              <span className="ab-leiste-text">
                <strong>Der gespeicherte Stand ließ sich nicht laden.</strong> Angezeigt werden Demodaten. Damit der gespeicherte
                Stand erhalten bleibt, wird nichts gespeichert – bitte herunterladen und aufbewahren.
              </span>
              <span className="ab-leiste-knoepfe">
                <button type="button" className="btn btn-sm btn-outline" onClick={gespeichertHerunterladen}>
                  Gespeicherten Stand herunterladen
                </button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setNeuBeginnen(true)}>
                  Mit Demodaten neu beginnen
                </button>
              </span>
            </div>
          ) : null}
          {neuereFassung ? (
            <div className="ab-leiste warnung" role="alert">
              <span className="ab-leiste-text">
                <strong>Die gespeicherten Daten stammen aus einer neueren Fassung von KaPlan.</strong> Diese Seite zeigt Demodaten
                und speichert nichts, damit der neuere Stand erhalten bleibt. Bitte die Seite neu laden.
              </span>
              <span className="ab-leiste-knoepfe">
                <button type="button" className="btn btn-sm btn-outline" onClick={() => window.location.reload()}>
                  Seite neu laden
                </button>
              </span>
            </div>
          ) : null}
          {speicherfehler ? (
            <div className="ab-leiste fehler" role="alert">
              <span className="ab-leiste-text">
                <strong>Nicht gespeichert – bitte Sicherung herunterladen.</strong>{' '}
                {speicherZustand === 'voll'
                  ? 'Der Speicher des Browsers ist voll'
                  : 'Der Browser lässt das Speichern nicht zu (etwa durch Datenschutzeinstellungen)'}
                ; Änderungen gehen beim Schließen der Seite verloren.
              </span>
              <span className="ab-leiste-knoepfe">
                <button type="button" className="btn btn-sm btn-outline" onClick={() => exportiereDaten(data)}>
                  Sicherung herunterladen
                </button>
              </span>
            </div>
          ) : null}
          {kopien ? (
            <div className="ab-leiste info" role="status">
              <span className="ab-leiste-text">
                <strong>Standard-Workflows aktualisiert.</strong>{' '}
                {stammdatenKopien.length === 1
                  ? 'Ein selbst geänderter Standard-Workflow wurde als Kopie behalten: '
                  : `${stammdatenKopien.length} selbst geänderte Standard-Workflows wurden als Kopie behalten: `}
                {stammdatenKopien.map((name) => `„${name}“`).join(', ')}.
              </span>
              <span className="ab-leiste-knoepfe">
                <button type="button" className="btn btn-sm btn-outline" onClick={stammdatenHinweisQuittieren}>
                  Verstanden
                </button>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      {neuBeginnen ? (
        <ConfirmDialog
          titel="Mit Demodaten neu beginnen?"
          text="Der gespeicherte, nicht lesbare Stand wird durch die Demodaten ersetzt. Wer ihn noch braucht, lädt ihn vorher herunter."
          bestaetigenLabel="Neu beginnen"
          onConfirm={() => {
            zuruecksetzen();
            toast('Mit Demodaten neu begonnen.');
          }}
          onClose={() => setNeuBeginnen(false)}
        />
      ) : null}
    </>
  );
}
