/**
 * Blatt der Vorschau in der Seite: die Druckfassung (domain/druck.ts) auf
 * weißem Papier in der Breite einer A4-Seite. Auf schmalen Bildschirmen lässt
 * sich das Blatt quer verschieben, statt gestaucht zu werden.
 */
import { DRUCK_STIL } from '../domain/druck';
import '../pages/controlling/controlling.css';

export function Druckblatt({ inhalt }: { inhalt: string }) {
  return (
    <div className="ln-co-blatt-huelle">
      <style>{DRUCK_STIL}</style>
      <div className="ln-co-blatt" dangerouslySetInnerHTML={{ __html: inhalt }} />
    </div>
  );
}
