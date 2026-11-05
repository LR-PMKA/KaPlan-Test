/** Rückweg aus einem Bereich zur Bereichsauswahl. */
import { Icon } from '../shared/icons';
import { zurBereichsauswahl } from './router';

export function BereichWechsel() {
  return (
    <button type="button" className="bereich-wechsel" onClick={zurBereichsauswahl} title="Zur Bereichsauswahl">
      <Icon name="zurueck" size={12} />
      Bereich wechseln
    </button>
  );
}
