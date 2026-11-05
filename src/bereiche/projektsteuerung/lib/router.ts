/**
 * Hash-Router des Bereichs – erlaubt Lesezeichen und Vor/Zurück im Browser.
 * Alle Adressen liegen unter dem Bereichspräfix #/projektsteuerung; die Wahl
 * des Bereichs selbst trifft die Shell.
 */
import { useEffect, useState } from 'react';
import type { ID } from '../domain/types';

/** Seiten im Projekt. */
export type ProjektTab = 'beteiligte' | 'protokolle';

export type Route =
  | { view: 'uebersicht' }
  | { view: 'projekte' }
  | { view: 'funktionen' }
  | { view: 'projekt'; projektId: ID; tab: ProjektTab }
  | { view: 'protokoll'; projektId: ID; protokollId: ID };

export const TABS: ProjektTab[] = ['beteiligte', 'protokolle'];

/** Präfix aller Adressen dieses Bereichs. */
export const PREFIX = 'projektsteuerung';

export function routeToHash(r: Route): string {
  switch (r.view) {
    case 'projekt':
      return `#/${PREFIX}/projekt/${r.projektId}/${r.tab}`;
    case 'protokoll':
      return `#/${PREFIX}/projekt/${r.projektId}/protokoll/${r.protokollId}`;
    default:
      return `#/${PREFIX}/${r.view}`;
  }
}

export function hashToRoute(hash: string): Route {
  const teile = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  // Das Bereichspräfix gehört der Shell und wird hier übersprungen.
  if (teile[0] === PREFIX) teile.shift();
  if (teile[0] === 'projekt' && teile[1]) {
    if (teile[2] === 'protokoll' && teile[3]) {
      return { view: 'protokoll', projektId: teile[1], protokollId: teile[3] };
    }
    // Die frühere Seite „lop“ (Liste offener Punkte) führt zu den Protokollen.
    const seite = teile[2] === 'lop' ? 'protokolle' : (teile[2] ?? '');
    const tab = (TABS as string[]).includes(seite) ? (seite as ProjektTab) : 'beteiligte';
    return { view: 'projekt', projektId: teile[1], tab };
  }
  if (teile[0] === 'projekte') return { view: 'projekte' };
  if (teile[0] === 'funktionen') return { view: 'funktionen' };
  return { view: 'uebersicht' };
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => hashToRoute(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(hashToRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (r: Route) => {
    const hash = routeToHash(r);
    if (window.location.hash === hash) setRoute(r);
    else window.location.hash = hash;
  };

  return [route, navigate];
}
