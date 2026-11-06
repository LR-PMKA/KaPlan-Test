/**
 * Controlling – nur für Personen mit der Rolle Controlling (domain/rechte.ts):
 * Reiter „Auswertung“ (Stunden je Mitarbeiter, Monat und Projekt; Excel),
 * „Leistungsnachweise“ (alle Nachweise aller Projekte, Klick öffnet die
 * Abrechnung mit Aufschlägen, Abschluss und Export) und „Mitarbeiter“
 * (Verwaltung samt Rolle Controlling). Die Auswahl der Filter bleibt erhalten,
 * solange die Seite offen ist.
 */
import { useStore } from '../../store/store';
import { CONTROLLING_TABS, type ControllingTab, type Route } from '../../lib/router';
import { istControlling } from '../../domain/rechte';
import { AuswertungAnsicht } from './Auswertung';
import { KeinZugriff } from './hilfen';
import { Mitarbeiter } from './Mitarbeiter';
import { NachweisListe } from './NachweisListe';
import './controlling.css';

/** Beschriftung und Tooltip der Reiter. */
const REITER: Record<ControllingTab, { label: string; titel: string }> = {
  auswertung: { label: 'Auswertung', titel: 'Stunden je Mitarbeiter, Monat und Projekt – mit Excel' },
  nachweise: { label: 'Leistungsnachweise', titel: 'Alle Leistungsnachweise – Aufschläge, Abschluss und Export' },
  mitarbeiter: { label: 'Mitarbeiter', titel: 'Mitarbeiter verwalten und die Rolle Controlling vergeben' },
};

export function Controlling({ tab, navigate }: { tab: ControllingTab; navigate: (r: Route) => void }) {
  const { data } = useStore();
  if (!istControlling(data)) return <KeinZugriff navigate={navigate} />;

  return (
    <div className="stack">
      <div className="tabs" role="tablist" aria-label="Controlling">
        {CONTROLLING_TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === tab}
            className={t === tab ? 'active' : ''}
            title={REITER[t].titel}
            onClick={() => navigate({ view: 'controlling', tab: t })}
          >
            {REITER[t].label}
          </button>
        ))}
      </div>

      {tab === 'auswertung' ? <AuswertungAnsicht navigate={navigate} /> : null}
      {tab === 'nachweise' ? <NachweisListe navigate={navigate} /> : null}
      {tab === 'mitarbeiter' ? <Mitarbeiter /> : null}
    </div>
  );
}
