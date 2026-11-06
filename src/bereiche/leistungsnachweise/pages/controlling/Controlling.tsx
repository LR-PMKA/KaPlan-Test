/**
 * Controlling – Platzhalter, bis die Seite mit den Reitern „Auswertung“,
 * „Leistungsnachweise“ und „Mitarbeiter“ steht (Rechte: domain/rechte.ts).
 */
import { Callout } from '../../../../shared/ui';
import type { ControllingTab, Route } from '../../lib/router';

export function Controlling({ tab, navigate }: { tab: ControllingTab; navigate: (r: Route) => void }) {
  return (
    <Callout icon="i">
      In Arbeit – der Reiter „{tab}“ des Controllings folgt.{' '}
      <button type="button" className="btn btn-sm btn-outline" onClick={() => navigate({ view: 'uebersicht' })}>
        Zur Übersicht
      </button>
    </Callout>
  );
}
