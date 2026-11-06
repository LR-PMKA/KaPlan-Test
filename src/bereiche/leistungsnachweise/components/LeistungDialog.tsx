/**
 * Eine eigene Leistung erfassen oder bearbeiten – aus dem Reiter „Leistungen“
 * und aus dem Nachweis heraus. Erfasst wird immer für die angemeldete Person
 * (der Store setzt sie); Leistungen anderer lassen sich nicht ändern, auch
 * nicht im Controlling – der Dialog zeigt sie dann nur an.
 *
 * Die Leistung gehört dem Projekt; in welchem Leistungsnachweis sie erscheint,
 * ergibt sich aus ihrem Datum. Liegt das Datum in keinem Nachweis, legt der
 * Store nach der Zeitraumregel des Projekts einen an oder verlängert den
 * offenen – der Dialog sagt das vorher an. Ein abgeschlossener Nachweis ändert
 * sich erst nach „Wieder öffnen“ im Controlling. Hat das Projekt genau einen
 * Abschnitt, ist er vorausgewählt.
 */
import { useRef, useState } from 'react';
import { today } from '../../../shared/dates';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Callout, ConfirmDialog, Field, Modal, Select, TextArea } from '../../../shared/ui';
import { zahlLesen } from '../domain/import';
import { mitAbschnittsspalten, nachweiseErgaenzen, nachweisFuer, type Ergaenzung } from '../domain/nachweis';
import { NICHT_ANGEMELDET, angemeldet, darfLeistungAendern } from '../domain/rechte';
import { mitarbeiterName, type ID, type ISODate, type Leistung, type Leistungsnachweis, type LeistungsnachweisDaten, type Projekt } from '../domain/types';
import { istDatum, langDatum, stundenText, zeitraumText } from '../domain/zeitraum';
import { useStore } from '../store/store';
import { useAnmeldung } from './AnmeldeDialog';
import './leistungen.css';

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
  return `Die Leistung liegt im abgeschlossenen Nachweis „${nachweisName(n)}“ – er ändert sich erst nach „Wieder öffnen“ im Controlling.`;
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
      : `Liegt im abgeschlossenen Leistungsnachweis „${nachweisName(n)}“ – er ändert sich erst nach „Wieder öffnen“ im Controlling.`;
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
  const anmeldung = useAnmeldung();
  const stundenFeld = useRef<HTMLInputElement>(null);
  const projekt = data.projekte.find((p) => p.id === projektId);
  const abschnitte = projekt?.abschnitte ?? [];

  const [form, setForm] = useState(() => ({
    datum: leistung?.datum ?? (vorgabeDatum && istDatum(vorgabeDatum) ? vorgabeDatum : today()),
    stunden: leistung ? stundenEingabe(leistung.stunden) : '',
    // Bei genau einem Abschnitt ist er für neue Leistungen vorausgewählt
    abschnittId:
      leistung?.abschnittId && abschnitte.some((a) => a.id === leistung.abschnittId)
        ? leistung.abschnittId
        : !leistung && abschnitte.length === 1
          ? abschnitte[0].id
          : '',
    text: leistung?.text ?? '',
  }));
  const [loeschen, setLoeschen] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (!projekt) return null;

  const ich = angemeldet(data);
  // Eine fremde Leistung zeigt der Dialog nur an – ändern kann sie nur die Person selbst
  const nurLesen = !!leistung && !darfLeistungAendern(data, leistung);
  const person = leistung ? data.mitarbeiter.find((m) => m.id === leistung.mitarbeiterId) : ich;
  const personName = person ? mitarbeiterName(person) || person.kuerzel : leistung ? 'unbekannten Mitarbeiter' : '';
  const bisherNachweis = leistung ? nachweisFuer(data, projekt.id, leistung.datum) : undefined;
  const spalten = mitAbschnittsspalten(abschnitte);

  const speichern = (weitere: boolean) => {
    if (nurLesen) return;
    if (!ich) {
      toast(NICHT_ANGEMELDET);
      return;
    }
    const datum = form.datum;
    if (!istDatum(datum)) {
      toast('Bitte ein Datum angeben.');
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
    const werte = { datum, stunden, abschnittId, text };

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
      if (!addLeistung({ ...werte, projektId: projekt.id, projektelement: '' })) {
        toast(NICHT_ANGEMELDET);
        return;
      }
      toast(meldung('Leistung erfasst', ergaenzung, data));
    }
    if (geschlossen) toast(abgeschlossenHinweis(geschlossen));

    if (weitere) {
      // Datum und Abschnitt bleiben für die nächste Leistung stehen
      setForm((f) => ({ ...f, stunden: '', text: '' }));
      stundenFeld.current?.focus();
    } else {
      onClose();
    }
  };

  const projektText = [projekt.nummer, projekt.name].filter(Boolean).join(' ');

  return (
    <>
      <Modal
        titel={nurLesen ? 'Leistung' : leistung ? 'Leistung bearbeiten' : 'Leistung erfassen'}
        sub={personName ? `für ${personName} · ${projektText}` : projektText}
        onClose={onClose}
        footer={
          nurLesen ? (
            <button type="button" className="btn" onClick={onClose}>
              Schließen
            </button>
          ) : (
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
                  disabled={!ich}
                  title="Speichern und gleich die nächste Leistung erfassen – Datum und Abschnitt bleiben"
                >
                  Speichern und weitere
                </button>
              ) : null}
              <button type="button" className="btn btn-primary" onClick={() => speichern(false)} disabled={!ich}>
                Speichern
              </button>
            </>
          )
        }
      >
        <div className="ln-le-dialog">
          {nurLesen ? (
            <Callout icon="i">
              Leistung von {personName} – nur zu lesen. Ändern und löschen kann sie nur {personName} selbst.
            </Callout>
          ) : null}
          {!ich && !nurLesen ? (
            <Callout ton="warn" icon="!">
              <div className="row-between wrap">
                <span>Erfasst wird für die angemeldete Person – bitte zuerst anmelden.</span>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    onClose();
                    anmeldung();
                  }}
                >
                  Anmelden
                </button>
              </div>
            </Callout>
          ) : null}
          {bisherNachweis?.status === 'abgeschlossen' && !nurLesen ? (
            <Callout ton="warn" icon="!">
              Diese Leistung liegt im abgeschlossenen Leistungsnachweis „{nachweisName(bisherNachweis)}“. Änderungen
              erscheinen dort erst nach „Wieder öffnen“ im Controlling.
            </Callout>
          ) : null}
          {leistung?.quelle === 'import' ? (
            <Callout icon="i">
              Aus dem Excel-Import{leistung.projektelement ? ` (Projektelement „${leistung.projektelement}“)` : ''}.
              {nurLesen ? '' : ' Ein erneuter Import mit „Frühere Importe ersetzen“ stellt den Stand der Datei wieder her.'}
            </Callout>
          ) : null}
          <fieldset className="ln-fieldset" disabled={nurLesen}>
            <div className="form-grid ln-zweispaltig">
              <Field
                label="Datum"
                hint={nurLesen ? undefined : datumHinweis(data, projekt, form.datum, !!leistung && leistung.datum === form.datum)}
              >
                <input
                  className="input"
                  type="date"
                  value={form.datum}
                  onChange={(e) => set('datum', e.target.value)}
                  autoFocus={!leistung && !vorgabeDatum}
                />
              </Field>
              <Field label="Stunden" hint={nurLesen ? undefined : 'Mit Komma oder Punkt, etwa 2,5 – höchstens 24.'}>
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
                <Field
                  label="Abschnitt"
                  hint={
                    spalten
                      ? 'Spalte im Nachweis unter „Aufwand (Std)“.'
                      : 'Das Projekt hat einen Abschnitt – der Nachweis zeigt eine Spalte „Stunden“.'
                  }
                >
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
                hint={nurLesen ? undefined : 'Mehrere Tätigkeiten mit Komma trennen – der Nachweis fasst gleiche Teile einer Zeile zusammen.'}
              >
                <TextArea
                  value={form.text}
                  onChange={(v) => set('text', v)}
                  rows={3}
                  placeholder="z. B. Abstimmung PL, Fortschreibung Terminplan"
                />
              </Field>
            </div>
          </fieldset>
        </div>
      </Modal>

      {loeschen && leistung && !nurLesen ? (
        <ConfirmDialog
          titel="Leistung löschen?"
          text={`Die Leistung vom ${langDatum(leistung.datum)} mit ${stundenText(leistung.stunden)} Std. wird gelöscht.${
            bisherNachweis?.status === 'abgeschlossen'
              ? ` Der abgeschlossene Nachweis „${nachweisName(bisherNachweis)}“ ändert sich erst nach „Wieder öffnen“ im Controlling.`
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
