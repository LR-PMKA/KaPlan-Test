/**
 * Abrechnung eines Leistungsnachweises im Controlling – Platzhalter, bis die
 * Ansicht mit Aufschlägen, Abschluss und Export steht.
 */
import { Callout } from '../../../../shared/ui';
import type { ID } from '../../domain/types';
import type { Route } from '../../lib/router';

export function Abrechnung({ projektId, nachweisId, navigate }: { projektId: ID; nachweisId: ID; navigate: (r: Route) => void }) {
  return (
    <Callout icon="i">
      In Arbeit – die Abrechnung des Leistungsnachweises folgt.{' '}
      <button type="button" className="btn btn-sm btn-outline" onClick={() => navigate({ view: 'nachweis', projektId, nachweisId })}>
        Zum Nachweis
      </button>
    </Callout>
  );
}
