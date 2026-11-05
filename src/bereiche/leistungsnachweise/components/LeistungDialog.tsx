/**
 * Eine Leistung erfassen oder bearbeiten – aus dem Reiter „Leistungen“ und aus
 * dem Nachweis heraus. Die Leistung gehört dem Projekt; in welchem
 * Leistungsnachweis sie erscheint, ergibt sich aus ihrem Datum. Liegt das Datum
 * in keinem Nachweis, legt der Store nach der Zeitraumregel des Projekts einen
 * an oder verlängert den offenen – der Dialog sagt das vorher an. Ein
 * abgeschlossener Nachweis ändert sich erst nach „Wieder öffnen“.
 */
import { useRef, useState } from 'react';
import { today } from '../../../shared/dates';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Callout, ConfirmDialog, Field, Modal, Select, TextArea } from '../../../shared/ui';
import { zahlLesen } from '../domain/import';
import { nachweiseErgaenzen, nachweisFuer, type Ergaenzung } from '../domain/nachweis';
import type { ID, ISODate, Leistung, Leistungsnachweis, LeistungsnachweisDaten, Projekt } from '../domain/types';
import { istDatum, langDatum, stundenText, zeitraumText } from '../domain/zeitraum';
import { useStore } from '../store/store';
import { MitarbeiterDialog } from './MitarbeiterDialog';
import { mitarbeiterAuswahlText, nachNamen } from './common';
import './leistungen.css';

/** Auswahlwert, der den Dialog für einen neuen Mitarbeiter öffnet. */
const NEUER_MITARBEITER = '__neu__';

/** Höchstens so viele Stunden an einem Tag. */
const STUNDEN_HOECHSTENS = 24;

/** Kurzname eines Nachweises für Meldungen und Tabellen: die Überschrift, sonst der Zeitraum („Oktober 2026“). */
export function nachweisName(n: Pick<Leistungsnachweis, 'titel' | 'von' | 'bis'>): string {
  return n.titel.trim() || zeitraumText(n.von, n.bis);
}

/** Stunden für das Eingabefeld: „2,5“. */
const stundenEingabe = (stunden: number) => String(stunden).replace('.', ',');

/** Meldung nach dem Speichern – mit dem Nachweis, der dafür angelegt bzw. erweitert wurde. */
function meldung(basis: string, ergaenzung: Ergaenzung, daten: LeistungsnachweisDaten): string {
  const neu = ergaenzung.neu[0];
  if (neu) return `${basis} – Leistungsnachweis „${nachweisName(neu)}“ angelegt.`;
  const erweitert = ergaenzung.erweitert[0];
  const vorher = erweitert ? daten.nachweise.find((n) => n.id === erweitert.id) : undefined;
  if (erweitert && vorher) {
    return `${basis} – Leistungsnachweis „${nachweisName({ ...vorher, von: erweitert.von, bis: erweitert.bis })}“ erweitert.`;
  }
  return `${basis}.`;
}

/** Hinweis, wenn eine Leistung in einem abgeschlossenen Nachweis liegt. */
export function abgeschlossenHinweis(n: Leistungsnachweis): string {
  return `Die Leistung liegt im abgeschlossenen Nachweis „${nachweisName(n)}“ – er ändert sich erst nach „Wieder öffnen“.`;
}

/** Was mit dem Nachweis zum gewählten Datum geschieht – als Hinweis unter dem Datum. */
function datumHinweis(daten: LeistungsnachweisDaten, projekt: Projekt, datum: ISODate, eigenesDatum: boolean): string {
  if (!istDatum(datum)) return 'Tag der Leistung';
  const n = nachweisFuer(daten, projekt.id, datum);
  if (n) {
    if (n.status !== 'abgeschlossen') return `Erscheint im Leistungsnachweis „${nachweisName(n)}“.`;
    // Beim unveränderten Datum sagt es schon der Hinweis über dem Formular
    return eigenesDatum
      ? 'Tag der Leistung'
      : `Liegt im abgeschlossenen Leistungsnachweis „${nachweisName(n)}“ – er ändert sich erst nach „Wieder öffnen“.`;
  }
  if (eigenesDatum) return 'Liegt in keinem Leistungsnachweis.';
  const vorschau = nachweiseErgaenzen(daten, projekt, [datum], new Date().toISOString(), () => 'vorschau');
  if (vorschau.neu[0]) return `Dafür wird der Leistungsnachweis „${nachweisName(vorschau.neu[0])}“ angelegt.`;
  const e = vorschau.erweitert[0];
  const vorher = e ? daten.nachweise.find((x) => x.id === e.id) : undefined;
  if (e && vorher) return `Der Leistungsnachweis „${nachweisName(vorher)}“ wird bis zum ${langDatum(e.bis)} verlängert.`;
  return 'Liegt in keinem Leistungsnachweis.';
}

export function LeistungDialog({
  projektId,
  leistung,
  vorgabeDatum,
  onClose,
}: {
  projektId: ID;
  /** Ohne Leistung wird eine neue erfasst. */
  leistung?: Leistung;
  /** Datum einer neuen Leistung; ohne Angabe heute. */
  vorgabeDatum?: ISODate;
  onClose: () => void;
}) {
  const { data, addLeistung, updateLeistung, deleteLeistung } = useStore();
  const toast = useToast();
  const stundenFeld = useRef<HTMLInputElement>(null);
  const projekt = data.projekte.find((p) => p.id === projektId);
  const abschnitte = projekt?.abschnitte ?? [];

  const [form, setForm] = useState(() => {
    const ich = data.einstellungen.mitarbeiterId;
    const vorgabe = ich && data.mitarbeiter.some((m) => m.id === ich && m.aktiv) ? ich : '';
    return {
      datum: leistung?.datum ?? (vorgabeDatum && istDatum(vorgabeDatum) ? vorgabeDatum : today()),
      mitarbeiterId: leistung?.mitarbeiterId ?? vorgabe,
      stunden: leistung ? stundenEingabe(leistung.stunden) : '',
      abschnittId: leistung?.abschnittId && abschnitte.some((a) => a.id === leistung.abschnittId) ? leistung.abschnittId : '',
      text: leistung?.text ?? '',
    };
  });
  const [neuerMitarbeiter, setNeuerMitarbeiter] = useState(false);
  const [loeschen, setLoeschen] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (!projekt) return null;

  // Zur Wahl stehen die aktiven Mitarbeiter – und die bisherige Person, auch wenn sie ausgeschieden ist
  const wahl = data.mitarbeiter
    .filter((m) => m.aktiv || m.id === leistung?.mitarbeiterId)
    .sort(nachNamen);
  const unbekannt = !!form.mitarbeiterId && !data.mitarbeiter.some((m) => m.id === form.mitarbeiterId);
  const bisherNachweis = leistung ? nachweisFuer(data, projekt.id, leistung.datum) : undefined;

  const speichern = (weitere: boolean) => {
    const datum = form.datum;
    if (!istDatum(datum)) {
      toast('Bitte ein Datum angeben.');
      return;
    }
    if (!form.mitarbeiterId || form.mitarbeiterId === NEUER_MITARBEITER) {
      toast('Bitte einen Mitarbeiter wählen.');
      return;
    }
    const stunden = zahlLesen(form.stunden);
    if (stunden === null || !(stunden > 0) || stunden > STUNDEN_HOECHSTENS) {
      toast('Bitte die Stunden angeben (mehr als 0, höchstens 24).');
      return;
    }
    // Zeilenumbrüche im Text bleiben – nur Leerraum am Anfang und Ende fällt weg
    const text = form.text.trim();
    if (!text) {
      toast('Bitte einen Leistungstext angeben.');
      return;
    }
    const abschnittId = abschnitte.some((a) => a.id === form.abschnittId) ? form.abschnittId : null;
    const werte = { datum, mitarbeiterId: form.mitarbeiterId, stunden, abschnittId, text };

    // Was der Store für das Datum an Nachweisen ergänzt – vorab auf dem angezeigten Stand gerechnet
    const datumNeu = !leistung || leistung.datum !== datum;
    const ergaenzung: Ergaenzung = datumNeu
      ? nachweiseErgaenzen(data, projekt, [datum], new Date().toISOString(), () => 'vorschau')
      : { neu: [], erweitert: [] };
    const geschlossen = [nachweisFuer(data, projekt.id, datum), leistung ? nachweisFuer(data, projekt.id, leistung.datum) : undefined].find(
      (n) => n?.status === 'abgeschlossen',
    );

    if (leistung) {
      updateLeistung(leistung.id, werte);
      toast(meldung('Leistung gespeichert', ergaenzung, data));
    } else {
      addLeistung({ ...werte, projektId: projekt.id, projektelement: '' });
      toast(meldung('Leistung erfasst', ergaenzung, data));
    }
    if (geschlossen) toast(abgeschlossenHinweis(geschlossen));

    if (weitere) {
      // Datum, Person und Abschnitt bleiben für die nächste Leistung stehen
      setForm((f) => ({ ...f, stunden: '', text: '' }));
      stundenFeld.current?.focus();
    } else {
      onClose();
    }
  };

  const mitarbeiterOptionen = [
    ...(unbekannt ? [{ value: form.mitarbeiterId, label: '? (unbekannter Mitarbeiter)' }] : []),
    ...wahl.map((m) => ({ value: m.id, label: mitarbeiterAuswahlText(m) })),
  ];

  return (
    <>
      <Modal
        titel={leistung ? 'Leistung bearbeiten' : 'Leistung erfassen'}
        sub={[projekt.nummer, projekt.name].filter(Boolean).join(' ')}
        onClose={onClose}
        footer={
          <>
            {leistung ? (
              <button type="button" className="btn btn-danger" onClick={() => setLoeschen(true)}>
                <Icon name="loeschen" size={14} /> Löschen
              </button>
            ) : null}
            <span className="spacer" />
            <button type="button" className="btn" onClick={onClose}>
              Abbrechen
            </button>
            {!leistung ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => speichern(true)}
                title="Speichern und gleich die nächste Leistung erfassen – Datum und Mitarbeiter bleiben"
              >
                Speichern und weitere
              </button>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={() => speichern(false)}>
              Speichern
            </button>
          </>
        }
      >
        <div className="ln-le-dialog">
          {bisherNachweis?.status === 'abgeschlossen' ? (
            <Callout ton="warn" icon="!">
              Diese Leistung liegt im abgeschlossenen Leistungsnachweis „{nachweisName(bisherNachweis)}“. Änderungen
              erscheinen dort erst nach „Wieder öffnen“.
            </Callout>
          ) : null}
          {leistung?.quelle === 'import' ? (
            <Callout icon="i">
              Aus dem Excel-Import{leistung.projektelement ? ` (Projektelement „${leistung.projektelement}“)` : ''}. Ein
              erneuter Import mit „Frühere Importe ersetzen“ stellt den Stand der Datei wieder her.
            </Callout>
          ) : null}
          <div className="form-grid ln-zweispaltig">
            <Field label="Datum" hint={datumHinweis(data, projekt, form.datum, !!leistung && leistung.datum === form.datum)}>
              <input
                className="input"
                type="date"
                value={form.datum}
                onChange={(e) => set('datum', e.target.value)}
                autoFocus={!leistung && !vorgabeDatum}
              />
            </Field>
            <Field
              label="Mitarbeiter"
              hint={
                data.einstellungen.mitarbeiterId
                  ? undefined
                  : 'Unter „Angemeldet als“ lässt sich festlegen, als wer Sie erfassen – dann steht die Person hier vorab.'
              }
            >
              <select
                className="select"
                value={form.mitarbeiterId}
                onChange={(e) => (e.target.value === NEUER_MITARBEITER ? setNeuerMitarbeiter(true) : set('mitarbeiterId', e.target.value))}
              >
                <option value="">– Mitarbeiter wählen –</option>
                {mitarbeiterOptionen.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
                <option value={NEUER_MITARBEITER}>+ Neuer Mitarbeiter …</option>
              </select>
            </Field>
            <Field label="Stunden" hint="Mit Komma oder Punkt, etwa 2,5 – höchstens 24.">
              <input
                ref={stundenFeld}
                className="input"
                value={form.stunden}
                onChange={(e) => set('stunden', e.target.value)}
                inputMode="decimal"
                placeholder="z. B. 2,5"
                autoFocus={!leistung && !!vorgabeDatum}
              />
            </Field>
            {abschnitte.length > 0 ? (
              <Field label="Abschnitt" hint="Spalte im Nachweis unter „Aufwand (Std)“.">
                <Select
                  value={form.abschnittId}
                  onChange={(v) => set('abschnittId', v)}
                  options={[
                    { value: '', label: 'ohne Abschnitt' },
                    ...abschnitte.map((a) => ({ value: a.id, label: a.name ? `${a.kurz} – ${a.name}` : a.kurz })),
                  ]}
                />
              </Field>
            ) : null}
            <Field
              label="Leistungstext"
              full
              hint="Mehrere Tätigkeiten mit Komma trennen – der Nachweis fasst gleiche Teile einer Zeile zusammen."
            >
              <TextArea
                value={form.text}
                onChange={(v) => set('text', v)}
                rows={3}
                placeholder="z. B. Abstimmung PL, Fortschreibung Terminplan"
              />
            </Field>
          </div>
        </div>
      </Modal>

      {neuerMitarbeiter ? (
        <MitarbeiterDialog onClose={() => setNeuerMitarbeiter(false)} onAngelegt={(id) => set('mitarbeiterId', id)} />
      ) : null}

      {loeschen && leistung ? (
        <ConfirmDialog
          titel="Leistung löschen?"
          text={`Die Leistung vom ${langDatum(leistung.datum)} mit ${stundenText(leistung.stunden)} Std. wird gelöscht.${
            bisherNachweis?.status === 'abgeschlossen'
              ? ` Der abgeschlossene Nachweis „${nachweisName(bisherNachweis)}“ ändert sich erst nach „Wieder öffnen“.`
              : ''
          }`}
          onConfirm={() => {
            deleteLeistung(leistung.id);
            toast('Leistung gelöscht.');
            onClose();
          }}
          onClose={() => setLoeschen(false)}
        />
      ) : null}
    </>
  );
}
