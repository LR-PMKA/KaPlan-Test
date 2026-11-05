/** Fachliche Anzeige-Bausteine, die in mehreren Ansichten gebraucht werden. */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { useToast } from '../../../shared/toast';
import { Badge } from '../../../shared/ui';
import { DRUCK_STIL, liveDokument } from '../domain/druck';
import { AMPEL_LABEL, type Ampel } from '../domain/punkte';

const AMPEL_TON: Record<Ampel, '' | 'green' | 'orange' | 'red' | 'blue'> = {
  erledigt: 'green',
  ueberfaellig: 'red',
  faellig: 'orange',
  geplant: 'blue',
  ohneTermin: '',
};

export function AmpelBadge({ ampel }: { ampel: Ampel }) {
  return <Badge ton={AMPEL_TON[ampel]}>{AMPEL_LABEL[ampel]}</Badge>;
}

export function AmpelPunkt({ ampel }: { ampel: Ampel }) {
  // inline-block: In einer Tabellenzelle stünde der Punkt sonst ohne Größe da.
  return <span className={`dot ${AMPEL_TON[ampel]}`} style={{ display: 'inline-block' }} title={AMPEL_LABEL[ampel]} />;
}

/** Mehrzeiliges Feld, das mit seinem Inhalt wächst. */
export function Textfeld({
  value,
  onChange,
  className = '',
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const anpassen = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, []);
  useLayoutEffect(anpassen, [value, anpassen]);
  // Eine andere Fensterbreite ändert den Umbruch und damit die Höhe.
  useEffect(() => {
    window.addEventListener('resize', anpassen);
    return () => window.removeEventListener('resize', anpassen);
  }, [anpassen]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`textarea ps-textfeld ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

/** Blatt der Druckansicht in der Seite. */
export function Blatt({ inhalt }: { inhalt: string }) {
  return (
    <div className="ps-blatt-huelle">
      <style>{DRUCK_STIL}</style>
      <div className="ps-blatt" dangerouslySetInnerHTML={{ __html: inhalt }} />
    </div>
  );
}

/**
 * Das eine Live-Fenster des Bereichs. Das jeweils geöffnete Protokoll schreibt
 * hinein; so bleibt das Fenster auch beim Wechsel in ein Folgeprotokoll
 * verbunden.
 */
const live: { fenster: Window | null; titel: string; inhalt: string } = { fenster: null, titel: '', inhalt: '' };

function liveSchreiben(titel: string, inhalt: string, erzwingen: boolean): void {
  const w = live.fenster;
  if (!w || w.closed) {
    live.fenster = null;
    return;
  }
  try {
    const doc = w.document;
    if (!doc.getElementById('ps-live')) {
      doc.open();
      doc.write(liveDokument(titel));
      doc.close();
      live.inhalt = '';
    }
    doc.title = `Live-Druckansicht – ${titel}`;
    if (erzwingen || inhalt !== live.inhalt || titel !== live.titel) {
      // Bei einem anderen Dokument oben beginnen, sonst die Bildlage halten.
      const anderes = titel !== live.titel;
      const x = anderes ? 0 : w.scrollX;
      const y = anderes ? 0 : w.scrollY;
      doc.getElementById('ps-live')!.innerHTML = `<div class="ps-blatt">${inhalt}</div>`;
      w.scrollTo(x, y);
      live.inhalt = inhalt;
      live.titel = titel;
    }
  } catch {
    // Ein geschlossenes oder anderweitig geöffnetes Fenster darf die Eingabe nicht stören.
    live.fenster = null;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    try {
      if (live.fenster && !live.fenster.closed) live.fenster.document.title = 'Druckansicht – Live-Verbindung beendet';
    } catch {
      /* Fenster nicht mehr erreichbar */
    }
    live.fenster = null;
  });
}

/**
 * Live-Druckansicht in einem eigenen Fenster – etwa auf dem zweiten
 * Bildschirm. Das Fenster folgt jeder Eingabe; die Bildlage bleibt erhalten.
 * Liefert die Funktion zum Öffnen.
 */
export function useLiveDruck(titel: string, inhalt: string): () => void {
  const toast = useToast();

  useEffect(() => liveSchreiben(titel, inhalt, false), [titel, inhalt]);

  return () => {
    let w = live.fenster;
    if (!w || w.closed) {
      try {
        w = window.open('', '_blank', 'popup=yes,width=1000,height=900,resizable=yes,scrollbars=yes');
      } catch {
        w = null;
      }
    }
    if (!w) {
      toast('Das Vorschaufenster wurde blockiert. Bitte Pop-ups für KaPlan zulassen und erneut auf „Live-Druckansicht“ klicken.');
      return;
    }
    live.fenster = w;
    liveSchreiben(titel, inhalt, true);
    w.focus();
  };
}
