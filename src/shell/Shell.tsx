/**
 * Hülle der Anwendung: zeigt entweder die Bereichsauswahl oder einen Bereich.
 * Die Bereiche werden erst beim Betreten eingehängt – ihr Datenbestand wird
 * also nicht geladen, solange man sie nicht geöffnet hat.
 */
import { useEffect } from 'react';
import { BereichBaubetrieb } from '../bereiche/baubetrieb';
import { BereichPlanlauf } from '../bereiche/planlauf';
import { BereichProjektsteuerung } from '../bereiche/projektsteuerung';
import { Start } from './Start';
import { useBereich } from './router';

export function Shell() {
  const bereich = useBereich();

  useEffect(() => {
    // Der Farbmodus gehört zu den Einstellungen eines Bereichs. Die
    // Bereichsauswahl selbst zeigt immer die Standardfarben.
    if (!bereich) document.documentElement.dataset.farbmodus = 'standard';
  }, [bereich]);

  if (bereich === 'planlauf') return <BereichPlanlauf />;
  if (bereich === 'baubetrieb') return <BereichBaubetrieb />;
  if (bereich === 'projektsteuerung') return <BereichProjektsteuerung />;
  return <Start />;
}
