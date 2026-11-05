/** Mehrzeiliges Eingabefeld, das mit seinem Inhalt wächst – für Leistungstexte und Bemerkungen. */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import './nachweis.css';

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
      className={`textarea ln-textfeld ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}
