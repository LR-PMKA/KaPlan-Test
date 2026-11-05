/**
 * Minimaler Hash-Router des Bereichs – erlaubt Lesezeichen und Vor/Zurück im
 * Browser. Alle Adressen liegen unter dem Bereichspräfix #/planlauf; die Wahl
 * des Bereichs selbst trifft die Shell.
 */
import { useEffect, useState } from 'react';
import type { ID } from '../domain/types';

/** Reiter im Projekt; „uebersicht“ ist der Reiter „Planläufe“. */
export type ProjektTab = 'uebersicht' | 'plaene' | 'rollen' | 'ketten' | 'einstellungen';

export type Route =
  | { view: 'dashboard' }
  | { view: 'fristen' }
  | { view: 'projekte' }
  | { view: 'ketten' }
  | { view: 'rollen' }
  | { view: 'vorlagen' }
  | { view: 'terminrechner' }
  | { view: 'projekt'; projectId: ID; tab: ProjektTab }
  | { view: 'planlauf'; projectId: ID; runId: ID };

const TABS: ProjektTab[] = ['uebersicht', 'plaene', 'rollen', 'ketten', 'einstellungen'];

/**
 * Frühere Adressen bleiben gültig: „adressbuch“ führt auf „rollen“, die
 * frühere Seite „pakete“ auf die Planliste, in der die Planpakete jetzt stehen.
 */
const ALTE_TABS: Record<string, ProjektTab> = { adressbuch: 'rollen', pakete: 'plaene' };

/** Präfix aller Adressen dieses Bereichs. */
export const PREFIX = 'planlauf';

export function routeToHash(r: Route): string {
  switch (r.view) {
    case 'projekt':
      return `#/${PREFIX}/projekt/${r.projectId}/${r.tab}`;
    case 'planlauf':
      return `#/${PREFIX}/projekt/${r.projectId}/planlauf/${r.runId}`;
    default:
      return `#/${PREFIX}/${r.view}`;
  }
}

export function hashToRoute(hash: string): Route {
  const teile = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  // Das Bereichspräfix gehört der Shell und wird hier übersprungen.
  if (teile[0] === PREFIX) teile.shift();
  if (teile[0] === 'projekt' && teile[1]) {
    if (teile[2] === 'planlauf' && teile[3]) {
      return { view: 'planlauf', projectId: teile[1], runId: teile[3] };
    }
    // Frühere Adressen mit eigenem Planlauf-Reiter führen auf die Planliste
    const gewaehlt = teile[2] === 'planlaeufe' ? 'plaene' : teile[2];
    const tab = (TABS as string[]).includes(gewaehlt ?? '')
      ? (gewaehlt as ProjektTab)
      : (ALTE_TABS[gewaehlt ?? ''] ?? 'uebersicht');
    return { view: 'projekt', projectId: teile[1], tab };
  }
  if (teile[0] === 'fristen') return { view: 'fristen' };
  if (teile[0] === 'projekte') return { view: 'projekte' };
  if (teile[0] === 'ketten') return { view: 'ketten' };
  if (teile[0] === 'rollen') return { view: 'rollen' };
  if (teile[0] === 'vorlagen') return { view: 'vorlagen' };
  if (teile[0] === 'terminrechner') return { view: 'terminrechner' };
  return { view: 'dashboard' };
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
