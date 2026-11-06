/**
 * Kleine Bausteine des Controllings: Stunden mit Vorzeichen, Lesen einer
 * Zahleneingabe („1,5“, „-0,5“), das Eingabefeld für Aufschläge und
 * abgerechnete Stunden, das beim Verlassen bzw. mit Enter speichert, und der
 * Hinweis „Kein Zugriff“ für Aufrufe ohne die Rolle Controlling.
 */
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../../../shared/toast';
import { Callout } from '../../../../shared/ui';
import { useAnmeldung } from '../../components/AnmeldeDialog';
import { AUFSCHLAG_KEINE_ZAHL } from '../../domain/nachweis';
import { KEIN_ZUGRIFF, angemeldet, controllingEinrichtbar } from '../../domain/rechte';
import { runden, stundenText } from '../../domain/zeitraum';
import type { Route } from '../../lib/router';
import { useStore } from '../../store/store';
import './controlling.css';

/** Aufschlag mit Vorzeichen: „+1,50“, „-0,50“; 0 als „–“. */
export function aufschlagText(stunden: number): string {
  if (!stunden) return '–';
  return `${stunden > 0 ? '+' : ''}${stundenText(stunden)}`;
}

/** Aufschlag im Eingabefeld: „+1,50“, „-0,50“; 0 bleibt leer. */
export function aufschlagFeld(stunden: number): string {
  return stunden ? `${stunden > 0 ? '+' : ''}${stundenText(stunden)}` : '';
}

/**
 * Liest eine Stundenangabe: Komma oder Punkt, Vorzeichen erlaubt, „Std.“ bzw.
 * „h“ am Ende darf stehen. Leer → null; keine Zahl → undefined.
 */
export function zahlLesen(text: string): number | null | undefined {
  const t = text
    .replace(/\s+/g, '')
    .replace(/[−–]/g, '-')
    .replace(/(std\.?|h)$/i, '');
  if (!t) return null;
  if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return undefined;
  const wert = Number(t.replace(',', '.'));
  return Number.isFinite(wert) ? wert : undefined;
}

/**
 * Eingabefeld für Stunden, das beim Verlassen oder mit Enter speichert
 * (Escape verwirft). `onSetzen` erhält die Zahl (null = leer) und liefert die
 * Meldung des Stores oder null; eine Meldung erscheint am Feld und als
 * Hinweis, die Eingabe bleibt zum Verbessern stehen.
 */
export function StundenFeld({
  wert,
  anzeige,
  onSetzen,
  label,
  platzhalter,
  klasse = '',
}: {
  wert: number;
  /** Text des Felds zum Wert. */
  anzeige: (stunden: number) => string;
  onSetzen: (stunden: number | null) => string | null;
  /** Beschriftung für Bildschirmleser, etwa „Aufschlag KW 44“. */
  label: string;
  platzhalter?: string;
  klasse?: string;
}) {
  const toast = useToast();
  const [text, setText] = useState(() => anzeige(wert));
  const [fehler, setFehler] = useState<string | null>(null);
  const fokus = useRef(false);

  // Ändert sich der Wert von außen (Speichern, Zurücksetzen), folgt das Feld – nicht während der Eingabe
  useEffect(() => {
    if (fokus.current) return;
    setText(anzeige(wert));
    setFehler(null);
    // Nur am Wert: `anzeige` ist je Feld fest, und eine Meldung soll bis zur nächsten Eingabe stehen bleiben
  }, [wert]);

  const uebernehmen = () => {
    const zahl = zahlLesen(text);
    // Unverändert (auch „1,5“ statt „+1,50“, etwa nach Enter und Verlassen): nur die Schreibweise angleichen
    if (text.trim() === anzeige(wert).trim() || (typeof zahl === 'number' && runden(zahl) === runden(wert))) {
      setText(anzeige(wert));
      setFehler(null);
      return;
    }
    const meldung = zahl === undefined ? AUFSCHLAG_KEINE_ZAHL : onSetzen(zahl);
    setFehler(meldung);
    if (meldung) toast(meldung);
  };

  return (
    <span className={`ln-co-feld ${klasse}`}>
      <input
        className={`input ln-co-zahl ${fehler ? 'ln-co-fehlerhaft' : ''}`}
        inputMode="decimal"
        value={text}
        placeholder={platzhalter}
        aria-label={label}
        aria-invalid={fehler ? true : undefined}
        title={fehler ?? undefined}
        onFocus={() => {
          fokus.current = true;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          fokus.current = false;
          uebernehmen();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            uebernehmen();
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            setText(anzeige(wert));
            setFehler(null);
          }
        }}
      />
      {fehler ? (
        <span className="ln-co-fehler" role="alert">
          {fehler}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Controlling-Ansicht ohne die Rolle Controlling: Hinweis „Kein Zugriff“.
 * Solange niemand die Rolle hat (Einrichtung), lässt sie sich hier übernehmen –
 * ohne Anmeldung über den Anmeldedialog mit vorab gesetztem Haken.
 */
export function KeinZugriff({ navigate }: { navigate: (r: Route) => void }) {
  const { data, rolleSetzen } = useStore();
  const toast = useToast();
  const ich = angemeldet(data);
  const einrichtbar = controllingEinrichtbar(data);
  const oeffnen = useAnmeldung();

  const uebernehmen = () => {
    if (!ich) {
      oeffnen(undefined, { rolle: true });
      return;
    }
    const meldung = rolleSetzen(ich.id, true);
    toast(meldung ?? 'Sie haben jetzt die Rolle Controlling.');
  };

  return (
    <Callout ton="warn" icon="!">
      <div className="stack" style={{ gap: 8 }}>
        <strong>{KEIN_ZUGRIFF}</strong>
        {einrichtbar ? (
          <span className="small">
            Bisher hat niemand die Rolle Controlling. Zur Einrichtung kann sie die erste Person selbst übernehmen; weitere
            Personen erhalten sie danach im Controlling unter „Mitarbeiter“.
          </span>
        ) : (
          <span className="small">Die Rolle vergibt eine Person, die sie bereits hat – im Controlling unter „Mitarbeiter“.</span>
        )}
        <div className="row wrap" style={{ gap: 6 }}>
          {einrichtbar ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={uebernehmen}>
              Rolle Controlling übernehmen
            </button>
          ) : null}
          <button type="button" className="btn btn-sm btn-outline" onClick={() => navigate({ view: 'uebersicht' })}>
            Zur Übersicht
          </button>
        </div>
      </div>
    </Callout>
  );
}

/** Gespeicherte Auswahl der Ansichten (Filter), solange die Seite offen ist – auch über Seitenwechsel. */
export function useAuswahl<T>(speicher: { wert: T }): [T, (neu: T) => void] {
  const [wert, setWert] = useState<T>(speicher.wert);
  return [
    wert,
    (neu: T) => {
      speicher.wert = neu;
      setWert(neu);
    },
  ];
}
