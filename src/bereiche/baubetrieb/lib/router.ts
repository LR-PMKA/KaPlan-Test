/**
 * Eigener Hash-Router des Bereichs. Die Wahl des Bereichs trifft die Shell
 * (#/baubetrieb), alles dahinter gehört diesem Router:
 *
 *   #/baubetrieb                                  Übersicht
 *   #/baubetrieb/termine                          Termine & Nachhaken
 *   #/baubetrieb/projekte                         Projekte
 *   #/baubetrieb/projekt/<id>                     Projekt mit seinen Anmeldungen
 *   #/baubetrieb/projekt/<id>/anmeldung/<id>      Anmeldung mit Statusverlauf
 *   #/baubetrieb/workflows                        Workflows (früher #/baubetrieb/workflow)
 *   #/baubetrieb/einstellungen                    Richtlinienfristen und Einstellungen
 *
 * Unbekannte Adressen führen auf die Übersicht.
 */
import { useEffect, useState } from 'react';
import type { ID } from '../domain/types';

/** Präfix aller Adressen dieses Bereichs. */
export const PREFIX = 'baubetrieb';

export type Route =
  | { view: 'uebersicht' }
  | { view: 'termine' }
  | { view: 'projekte' }
  | { view: 'workflows' }
  | { view: 'einstellungen' }
  | { view: 'projekt'; projektId: ID }
  | { view: 'anmeldung'; projektId: ID; anmeldungId: ID };

export function routeToHash(route: Route): string {
  switch (route.view) {
    case 'uebersicht':
      return `#/${PREFIX}`;
    case 'projekt':
      return `#/${PREFIX}/projekt/${route.projektId}`;
    case 'anmeldung':
      return `#/${PREFIX}/projekt/${route.projektId}/anmeldung/${route.anmeldungId}`;
    default:
      return `#/${PREFIX}/${route.view}`;
  }
}

export function hashToRoute(hash: string): Route {
  const teile = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  // Das Bereichspräfix gehört der Shell und wird hier übersprungen.
  if (teile[0] === PREFIX) teile.shift();
  if (teile[0] === 'projekt' && teile[1]) {
    if (teile[2] === 'anmeldung' && teile[3]) {
      return { view: 'anmeldung', projektId: teile[1], anmeldungId: teile[3] };
    }
    return { view: 'projekt', projektId: teile[1] };
  }
  if (teile[0] === 'termine') return { view: 'termine' };
  if (teile[0] === 'projekte') return { view: 'projekte' };
  // Die frühere Adresse „workflow“ führt auf dieselbe Seite.
  if (teile[0] === 'workflows' || teile[0] === 'workflow') return { view: 'workflows' };
  if (teile[0] === 'einstellungen') return { view: 'einstellungen' };
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
