/**
 * Adressen der Shell. Die erste Wegmarke benennt den Bereich, alles dahinter
 * gehört dem jeweiligen Bereich und wird von dessen eigenem Router gelesen:
 *
 *   #/                        Bereichsauswahl
 *   #/planlauf/…              Planlaufmanagement
 *   #/baubetrieb/…            Baubetriebsplanung
 *   #/projektsteuerung/…      Projektsteuerung
 */
import { useEffect, useState } from 'react';
import { BEREICH_IDS, type BereichId } from './bereiche';

/**
 * Wurzeln der früheren Adressen, die noch ohne Bereich auskamen. Sie werden auf
 * den Planlaufbereich umgelenkt, damit vorhandene Lesezeichen gültig bleiben.
 */
const ALTE_WURZELN = ['dashboard', 'fristen', 'projekte', 'ketten', 'rollen', 'vorlagen', 'projekt'];

const wegmarken = (hash: string): string[] => hash.replace(/^#\/?/, '').split('/').filter(Boolean);

/** Bereich der Adresse; null steht für die Bereichsauswahl. */
export function bereichAusHash(hash: string): BereichId | null {
  const erste = wegmarken(hash)[0] ?? '';
  return (BEREICH_IDS as string[]).includes(erste) ? (erste as BereichId) : null;
}

/** Zieladresse für ein altes Lesezeichen, sonst null. */
export function umgelenkterHash(hash: string): string | null {
  const teile = wegmarken(hash);
  if (teile.length === 0 || !ALTE_WURZELN.includes(teile[0])) return null;
  return `#/planlauf/${teile.join('/')}`;
}

/**
 * Lenkt ein altes Lesezeichen um. Ersetzt den Verlaufseintrag, damit der
 * Zurück-Schalter nicht wieder auf die alte Adresse führt.
 */
export function alteLesezeichenUmlenken(): void {
  const ziel = umgelenkterHash(window.location.hash);
  if (ziel) window.location.replace(ziel);
}

export function zumBereich(id: BereichId): void {
  window.location.hash = `#/${id}`;
}

export function zurBereichsauswahl(): void {
  window.location.hash = '#/';
}

/** Der aktuell gewählte Bereich; null zeigt die Bereichsauswahl. */
export function useBereich(): BereichId | null {
  const [bereich, setBereich] = useState<BereichId | null>(() => bereichAusHash(window.location.hash));

  useEffect(() => {
    const onHash = () => {
      alteLesezeichenUmlenken();
      setBereich(bereichAusHash(window.location.hash));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return bereich;
}
