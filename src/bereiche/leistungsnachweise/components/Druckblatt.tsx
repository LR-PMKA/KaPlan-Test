/** Blatt der Druckansicht in der Seite: die Druckfassung (domain/druck.ts) auf weißem Papier. */
import { DRUCK_STIL } from '../domain/druck';
import './nachweis.css';

export function Druckblatt({ inhalt }: { inhalt: string }) {
  return (
    <div className="ln-blatt-huelle">
      <style>{DRUCK_STIL}</style>
      <div className="ln-blatt" dangerouslySetInnerHTML={{ __html: inhalt }} />
    </div>
  );
}
