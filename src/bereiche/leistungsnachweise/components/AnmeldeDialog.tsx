/**
 * Anmeldung im Bereich „Leistungsnachweise“: „Ich bin …“ – Auswahl aus den
 * aktiven Mitarbeitern, oder wer noch nicht in der Liste steht, legt sich
 * selbst an (`selbstAnlegen`). Die angemeldete Person erfasst und importiert
 * nur eigene Leistungen; ihre Rolle entscheidet über das Controlling
 * (domain/rechte.ts). Solange niemand die Rolle Controlling hat, lässt sie
 * sich hier zur Einrichtung übernehmen. Dazu der Farbmodus.
 *
 * Solange die Daten nur im Browser liegen, ist die Anmeldung eine Auswahl
 * ohne Kennwort (`RECHTE_HINWEIS`).
 *
 * `useAnmeldung` öffnet den Dialog von überall im Bereich (App.tsx stellt ihn
 * bereit) – mit einer Fortsetzung, die nach der Anmeldung läuft: „Leistung
 * erfassen“ und „Excel-Import“ führen ohne Anmeldung zuerst hierher und danach
 * weiter (`useMitAnmeldung`).
 */
import { createContext, useContext, useState } from 'react';
import { useToast } from '../../../shared/toast';
import { Callout, Field, Modal, Select, TextInput } from '../../../shared/ui';
import { kuerzelFrei, namePasst } from '../domain/import';
import { RECHTE_HINWEIS, angemeldet, controllingEinrichtbar } from '../domain/rechte';
import { kuerzelAus, mitarbeiterName, type LeistungsnachweisDaten } from '../domain/types';
import { useStore } from '../store/store';
import { mitarbeiterAuswahlText, nachNamen } from './common';

/* ------------------------------------------------------------------ */
/* Öffnen von überall                                                  */
/* ------------------------------------------------------------------ */

/** Optionen beim Öffnen: `rolle` setzt den Haken „Ich übernehme die Rolle Controlling …“ vorab. */
export interface AnmeldungOptionen {
  rolle?: boolean;
}

/** Öffnet den Anmeldedialog; `danach` läuft nach erfolgreicher Anmeldung. */
export type AnmeldungOeffnen = (danach?: () => void, optionen?: AnmeldungOptionen) => void;

const AnmeldungKontext = createContext<AnmeldungOeffnen>(() => {});

/** Stellt das Öffnen des Anmeldedialogs bereit (App.tsx). */
export const AnmeldungBereitstellen = AnmeldungKontext.Provider;

/** Öffnet den Anmeldedialog. */
export function useAnmeldung(): AnmeldungOeffnen {
  return useContext(AnmeldungKontext);
}

/**
 * Führt eine Handlung aus, wenn jemand angemeldet ist – sonst erst die
 * Anmeldung und danach die Handlung (etwa „Leistung erfassen“). Die Handlung
 * darf nach der Anmeldung nur Zustände der Oberfläche setzen (einen Dialog
 * öffnen): Store-Methoden aus der Zeit vor der Anmeldung prüfen die Rechte auf
 * dem alten Stand und ändern nichts. Für sie `useAnmeldung` ohne Fortsetzung.
 */
export function useMitAnmeldung(): (fn: () => void) => void {
  const { data } = useStore();
  const oeffnen = useAnmeldung();
  return (fn) => (angemeldet(data) ? fn() : oeffnen(fn));
}

/**
 * Hinweis oben im Inhalt, solange niemand angemeldet ist – mit Knopf
 * „Anmelden“. Ist die gewählte Person inzwischen ausgeschieden, sagt er das.
 */
export function AnmeldeHinweis({ daten }: { daten: LeistungsnachweisDaten }) {
  const oeffnen = useAnmeldung();
  if (angemeldet(daten)) return null;
  const bisher = daten.einstellungen.mitarbeiterId
    ? daten.mitarbeiter.find((m) => m.id === daten.einstellungen.mitarbeiterId)
    : undefined;
  return (
    <div className="ln-anmeldehinweis">
      <Callout icon="i">
        <div className="row-between wrap">
          <span>
            {bisher
              ? `${mitarbeiterName(bisher) || bisher.kuerzel} ist als ausgeschieden markiert – bitte melden Sie sich neu an, um Leistungen zu erfassen und zu importieren.`
              : 'Bitte melden Sie sich an, um eigene Leistungen zu erfassen und zu importieren und am gemeinsamen Leistungsnachweis mitzuschreiben.'}
          </span>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => oeffnen()}>
            Anmelden
          </button>
        </div>
      </Callout>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

/** Auswahlwert „Ich bin noch nicht in der Liste“. */
const NEU = '__neu__';

/** Wörtlich nach SPEC: Haken zur Einrichtung der Rolle. */
const ROLLE_EINRICHTEN = 'Ich übernehme die Rolle Controlling (Einrichtung – niemand hat sie bisher)';

export function AnmeldeDialog({
  onClose,
  onAngemeldet,
  rolleVorgabe = false,
}: {
  onClose: () => void;
  /** Läuft nach erfolgreicher Anmeldung (nicht beim Abmelden). */
  onAngemeldet?: () => void;
  /** Haken „Rolle Controlling übernehmen“ vorab gesetzt (Knopf „Rolle Controlling übernehmen“). */
  rolleVorgabe?: boolean;
}) {
  const { data, anmelden, selbstAnlegen, setEinstellungen } = useStore();
  const toast = useToast();
  const ich = angemeldet(data);
  const einrichtbar = controllingEinrichtbar(data);
  const aktive = data.mitarbeiter.filter((m) => m.aktiv).sort(nachNamen);

  const [wahl, setWahl] = useState<string>(() => ich?.id ?? (aktive.length === 0 ? NEU : ''));
  const [neu, setNeu] = useState({ vorname: '', nachname: '', kuerzel: '' });
  const [rolle, setRolle] = useState(rolleVorgabe);
  const [kontrast, setKontrast] = useState(data.einstellungen.farbmodus === 'kontrast');

  const setFeld = <K extends keyof typeof neu>(k: K, v: string) => setNeu((f) => ({ ...f, [k]: v }));

  // Vorschau für „Ich bin noch nicht in der Liste“: Kürzel und eine schon vorhandene Person gleichen Namens
  const vorname = neu.vorname.trim();
  const nachname = neu.nachname.trim();
  const kuerzelWunsch = neu.kuerzel.trim() || kuerzelAus(`${vorname} ${nachname}`);
  const kuerzel = kuerzelWunsch ? kuerzelFrei(kuerzelWunsch, data.mitarbeiter) : '';
  const gleicherName = nachname ? aktive.find((m) => namePasst({ vorname, nachname }, m)) : undefined;

  const farbmodusUebernehmen = () => {
    const farbmodus = kontrast ? 'kontrast' : 'standard';
    if (farbmodus !== data.einstellungen.farbmodus) setEinstellungen({ farbmodus });
  };

  const fertig = (name: string, mitRolle: boolean) => {
    farbmodusUebernehmen();
    toast(`Angemeldet als ${name}${mitRolle ? ' – mit der Rolle Controlling' : ''}.`);
    onClose();
    onAngemeldet?.();
  };

  const anmeldenKlick = () => {
    const mitRolle = einrichtbar && rolle;
    if (wahl === NEU) {
      if (!nachname) {
        toast('Bitte einen Nachnamen angeben.');
        return;
      }
      const id = selbstAnlegen({ vorname, nachname, kuerzel: neu.kuerzel, controlling: mitRolle });
      if (!id) {
        toast('Bitte einen Nachnamen angeben.');
        return;
      }
      fertig(mitarbeiterName({ vorname, nachname }), mitRolle);
      return;
    }
    const m = aktive.find((x) => x.id === wahl);
    if (!m) {
      toast('Bitte auswählen, wer angemeldet wird.');
      return;
    }
    if (ich?.id === m.id && !mitRolle) {
      // Nur der Farbmodus kann sich geändert haben
      farbmodusUebernehmen();
      onClose();
      onAngemeldet?.();
      return;
    }
    anmelden(m.id, mitRolle ? { controlling: true } : undefined);
    fertig(mitarbeiterName(m) || m.kuerzel, mitRolle && !m.controlling);
  };

  const abmelden = () => {
    anmelden(null);
    farbmodusUebernehmen();
    toast('Abgemeldet.');
    onClose();
  };

  const optionen = [
    ...aktive.map((m) => ({ value: m.id, label: `${mitarbeiterAuswahlText(m)}${m.controlling ? ' · Controlling' : ''}` })),
    { value: NEU, label: 'Ich bin noch nicht in der Liste' },
  ];

  return (
    <Modal
      titel={ich ? 'Angemeldet als' : 'Anmelden'}
      sub={
        ich
          ? `${mitarbeiterName(ich) || ich.kuerzel}${ich.controlling ? ' · Rolle Controlling' : ''}`
          : 'Erfasst und importiert werden nur eigene Leistungen.'
      }
      onClose={onClose}
      footer={
        <>
          {ich ? (
            <button type="button" className="btn btn-outline" onClick={abmelden}>
              Abmelden
            </button>
          ) : null}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={anmeldenKlick}>
            {ich && wahl === ich.id ? 'Übernehmen' : 'Anmelden'}
          </button>
        </>
      }
    >
      <div className="stack ln-anmeldung-dialog">
        <div className="form-grid">
          <Field
            label="Ich bin …"
            full
            hint={
              wahl === NEU
                ? 'Legen Sie sich mit Vor- und Nachnamen an – so erscheinen Sie im Leistungsnachweis.'
                : 'Unter diesem Namen erscheinen Ihre Leistungen im Leistungsnachweis.'
            }
          >
            <Select
              value={wahl}
              onChange={setWahl}
              options={optionen}
              placeholder={aktive.length > 0 ? '– bitte wählen –' : undefined}
            />
          </Field>
        </div>

        {wahl === NEU ? (
          <div className="form-grid ln-zweispaltig">
            <Field label="Vorname">
              <TextInput value={neu.vorname} onChange={(v) => setFeld('vorname', v)} placeholder="Max" autoFocus />
            </Field>
            <Field label="Nachname">
              <TextInput value={neu.nachname} onChange={(v) => setFeld('nachname', v)} placeholder="Mustermann" />
            </Field>
            <Field
              label="Kürzel"
              hint={
                kuerzelWunsch && kuerzel !== kuerzelWunsch
                  ? `„${kuerzelWunsch}“ ist bereits vergeben – angelegt wird „${kuerzel}“.`
                  : 'So steht die Person im Export der Zeiterfassung, etwa „MM: Mustermann, Max“. Leer = aus dem Namen.'
              }
            >
              <TextInput
                value={neu.kuerzel}
                onChange={(v) => setFeld('kuerzel', v)}
                placeholder={kuerzelAus(`${vorname} ${nachname}`) || 'MM'}
                maxLength={6}
              />
            </Field>
            {gleicherName ? (
              <div className="field full">
                <Callout ton="warn" icon="!">
                  „{mitarbeiterName(gleicherName)}“ ({gleicherName.kuerzel}) steht bereits in der Liste – dann bitte oben
                  unter „Ich bin …“ auswählen statt neu anlegen.
                </Callout>
              </div>
            ) : null}
          </div>
        ) : null}

        {einrichtbar ? (
          <div className="ln-anmeldung-rolle">
            <label className="checkbox">
              <input type="checkbox" checked={rolle} onChange={(e) => setRolle(e.target.checked)} />
              {ROLLE_EINRICHTEN}
            </label>
            <span className="hint">
              Das Controlling sieht die Stunden aller Mitarbeiter, schließt Leistungsnachweise ab, schlägt Stunden auf und
              exportiert. Weitere Personen erhalten die Rolle danach im Controlling unter „Mitarbeiter“.
            </span>
          </div>
        ) : null}

        <div className="form-grid">
          <Field
            label="Darstellung"
            full
            hint="Farben für eine Rot-Grün-Sehschwäche: Blaugrün, Bernstein und Magenta statt Grün, Orange und Rot – zusätzlich mit stärkeren Kontrasten."
          >
            <label className="checkbox">
              <input type="checkbox" checked={kontrast} onChange={(e) => setKontrast(e.target.checked)} />
              Farbmodus für Rot-Grün-Sehschwäche (hoher Kontrast)
            </label>
          </Field>
        </div>

        <p className="small tertiary ln-anmeldung-hinweis">{RECHTE_HINWEIS}</p>
      </div>
    </Modal>
  );
}
