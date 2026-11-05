/**
 * Hash-Router des Bereichs – erlaubt Lesezeichen und Vor/Zurück im Browser.
 * Alle Adressen liegen unter dem Bereichspräfix #/leistungsnachweise; die
 * Wahl des Bereichs selbst trifft die Shell.
 */
import { useEffect, useState } from 'react';
import type { ID } from '../domain/types';

/** Seiten im Projekt. */
export type ProjektTab = 'nachweise' | 'leistungen' | 'einstellungen';

/** Seiten des Bereichs. */
export type Route =
  | { view: 'uebersicht' }
  | { view: 'projekte' }
  | { view: 'mitarbeiter' }
  | { view: 'projekt'; projektId: ID; tab: ProjektTab }
  | { view: 'nachweis'; projektId: ID; nachweisId: ID };

/** Seiten im Projekt in der Reihenfolge der Reiter. */
export const TABS: ProjektTab[] = ['nachweise', 'leistungen', 'einstellungen'];

/** Präfix aller Adressen dieses Bereichs. */
export const PREFIX = 'leistungsnachweise';

/** #/leistungsnachweise/projekt/<id>/<tab>, …/projekt/<id>/nachweis/<id>, sonst #/leistungsnachweise/<seite>. */
export function routeToHash(r: Route): string {
  switch (r.view) {
    case 'projekt':
      return `#/${PREFIX}/projekt/${r.projektId}/${r.tab}`;
    case 'nachweis':
      return `#/${PREFIX}/projekt/${r.projektId}/nachweis/${r.nachweisId}`;
    default:
      return `#/${PREFIX}/${r.view}`;
  }
}

/** Liest eine Adresse; unbekannte führen zur Übersicht, ein Projekt ohne gültige Seite zu seinen Nachweisen. */
export function hashToRoute(hash: string): Route {
  const teile = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  // Das Bereichspräfix gehört der Shell und wird hier übersprungen.
  if (teile[0] === PREFIX) teile.shift();
  if (teile[0] === 'projekt' && teile[1]) {
    if (teile[2] === 'nachweis' && teile[3]) {
      return { view: 'nachweis', projektId: teile[1], nachweisId: teile[3] };
    }
    const seite = teile[2] ?? '';
    const tab = (TABS as string[]).includes(seite) ? (seite as ProjektTab) : 'nachweise';
    return { view: 'projekt', projektId: teile[1], tab };
  }
  if (teile[0] === 'projekte') return { view: 'projekte' };
  if (teile[0] === 'mitarbeiter') return { view: 'mitarbeiter' };
  return { view: 'uebersicht' };
}

/** Aktuelle Seite und `navigate` – folgt Vor/Zurück im Browser. */
export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => hashToRoute(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(hashToRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Die Seite wechselt sofort und nicht erst mit dem (verzögerten) hashchange –
  // sonst zeigt etwa das Löschen des geöffneten Nachweises kurz „Nicht gefunden“.
  const navigate = (r: Route) => {
    const hash = routeToHash(r);
    setRoute(r);
    if (window.location.hash !== hash) window.location.hash = hash;
  };

  return [route, navigate];
}
