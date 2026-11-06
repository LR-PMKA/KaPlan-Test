/**
 * Hash-Router des Bereichs – erlaubt Lesezeichen und Vor/Zurück im Browser.
 * Alle Adressen liegen unter dem Bereichspräfix #/leistungsnachweise; die
 * Wahl des Bereichs selbst trifft die Shell.
 *
 * Die frühere Seite „Mitarbeiter“ (#/leistungsnachweise/mitarbeiter) ist in
 * das Controlling gewandert; die alte Adresse führt dorthin.
 */
import { useEffect, useState } from 'react';
import type { ID } from '../domain/types';

/** Seiten im Projekt. */
export type ProjektTab = 'nachweise' | 'leistungen' | 'einstellungen';

/** Reiter des Controllings. */
export type ControllingTab = 'auswertung' | 'nachweise' | 'mitarbeiter';

/** Seiten des Bereichs. */
export type Route =
  | { view: 'uebersicht' }
  | { view: 'projekte' }
  | { view: 'projekt'; projektId: ID; tab: ProjektTab }
  | { view: 'nachweis'; projektId: ID; nachweisId: ID }
  | { view: 'controlling'; tab: ControllingTab }
  /** Abrechnung eines Nachweises im Controlling (Aufschläge, Abschluss, Export). */
  | { view: 'abrechnung'; projektId: ID; nachweisId: ID };

/** Seiten im Projekt in der Reihenfolge der Reiter. */
export const TABS: ProjektTab[] = ['nachweise', 'leistungen', 'einstellungen'];

/** Reiter des Controllings in ihrer Reihenfolge. */
export const CONTROLLING_TABS: ControllingTab[] = ['auswertung', 'nachweise', 'mitarbeiter'];

/** Präfix aller Adressen dieses Bereichs. */
export const PREFIX = 'leistungsnachweise';

/**
 * #/leistungsnachweise/projekt/<id>/<tab>, …/projekt/<id>/nachweis/<id>,
 * …/controlling/<tab>, …/controlling/projekt/<id>/nachweis/<id>, sonst
 * #/leistungsnachweise/<seite>.
 */
export function routeToHash(r: Route): string {
  switch (r.view) {
    case 'projekt':
      return `#/${PREFIX}/projekt/${r.projektId}/${r.tab}`;
    case 'nachweis':
      return `#/${PREFIX}/projekt/${r.projektId}/nachweis/${r.nachweisId}`;
    case 'controlling':
      return `#/${PREFIX}/controlling/${r.tab}`;
    case 'abrechnung':
      return `#/${PREFIX}/controlling/projekt/${r.projektId}/nachweis/${r.nachweisId}`;
    default:
      return `#/${PREFIX}/${r.view}`;
  }
}

/**
 * Liest eine Adresse; unbekannte führen zur Übersicht, ein Projekt ohne gültige
 * Seite zu seinen Nachweisen, das Controlling ohne gültigen Reiter zur
 * Auswertung. Die frühere Adresse …/mitarbeiter führt zum Reiter „Mitarbeiter“
 * des Controllings.
 */
export function hashToRoute(hash: string): Route {
  const teile = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  // Das Bereichspräfix gehört der Shell und wird hier übersprungen.
  if (teile[0] === PREFIX) teile.shift();
  if (teile[0] === 'controlling') {
    if (teile[1] === 'projekt' && teile[2] && teile[3] === 'nachweis' && teile[4]) {
      return { view: 'abrechnung', projektId: teile[2], nachweisId: teile[4] };
    }
    const reiter = teile[1] ?? '';
    return { view: 'controlling', tab: (CONTROLLING_TABS as string[]).includes(reiter) ? (reiter as ControllingTab) : 'auswertung' };
  }
  if (teile[0] === 'projekt' && teile[1]) {
    if (teile[2] === 'nachweis' && teile[3]) {
      return { view: 'nachweis', projektId: teile[1], nachweisId: teile[3] };
    }
    const seite = teile[2] ?? '';
    const tab = (TABS as string[]).includes(seite) ? (seite as ProjektTab) : 'nachweise';
    return { view: 'projekt', projektId: teile[1], tab };
  }
  if (teile[0] === 'projekte') return { view: 'projekte' };
  // Frühere Seite „Mitarbeiter“ – jetzt ein Reiter des Controllings
  if (teile[0] === 'mitarbeiter') return { view: 'controlling', tab: 'mitarbeiter' };
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
