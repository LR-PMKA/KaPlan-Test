import { useState } from 'react';

/**
 * Bildmarken der Anwendung.
 *
 * Die Logos von KaPlan liegen als PNG unter `public/logos/` (je Bereich eines,
 * dazu das Logo der Startseite und das Symbol `Logo.png`). Die Wortmarke
 * Mailänder Consult stammt aus der Originaldatei `public/mailaender-consult.svg`
 * und wird nur über die Höhe skaliert.
 */

/** Hausfarbe nach dem Logo Mailänder Consult. */
export const MARKE_BLAU = '#24456e';

/** Logos von KaPlan unter `public/logos/`. */
export type KaPlanLogo = 'Startseite' | 'Planlaufmanagement' | 'Baubetriebsplanung' | 'Projektsteuerung';

const KAPLAN_TEXT: Record<KaPlanLogo, string> = {
  Startseite: 'KaPlan',
  Planlaufmanagement: 'KaPlan – Planlaufmanagement',
  Baubetriebsplanung: 'KaPlan – Baubetriebsplanung',
  Projektsteuerung: 'KaPlan – Projektsteuerung',
};

/**
 * Logo von KaPlan: auf dem Startbildschirm ohne Zusatz, in den Bereichen mit
 * dem Namen des Bereichs. Skaliert wird über die Breite oder die Höhe, das
 * Seitenverhältnis bleibt unverändert.
 */
export function KaPlanLogo({
  variante,
  width,
  height,
}: {
  variante: KaPlanLogo;
  width?: number | string;
  height?: number;
}) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}logos/Logo_${variante}.png`}
      alt={KAPLAN_TEXT[variante]}
      style={{ display: 'block', width: width ?? 'auto', height: height ?? 'auto', maxWidth: '100%' }}
    />
  );
}

/** Dateiname der Originalmarke unter `public/`. */
export const MAILAENDER_DATEI = 'mailaender-consult.svg';

/**
 * Wortmarke Mailänder Consult für die Kopfzeile.
 *
 * Verwendet wird die Originaldatei `public/mailaender-consult.svg`; sie wird
 * ausschließlich über die Höhe skaliert, das Seitenverhältnis bleibt damit
 * unverändert. Fehlt die Datei, erscheint ersatzweise eine schlichte
 * Nachzeichnung, damit die Kopfzeile nicht leer bleibt.
 */
export function MailaenderLogo({ height = 34 }: { height?: number }) {
  const [original, setOriginal] = useState(true);

  if (original) {
    return (
      <img
        src={`${import.meta.env.BASE_URL}${MAILAENDER_DATEI}`}
        alt="Mailänder Consult"
        style={{ height, width: 'auto', display: 'block' }}
        onError={() => setOriginal(false)}
      />
    );
  }

  return (
    <svg
      width={(height * 1000) / 248}
      height={height}
      viewBox="0 0 1000 248"
      fill="none"
      role="img"
      aria-label="Mailänder Consult"
      style={{ display: 'block', flex: 'none' }}
    >
      <g
        fill={MARKE_BLAU}
        fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
        fontWeight="700"
        fontSize="104"
        letterSpacing="-2"
      >
        <text x="0" y="92">
          Mailänder
        </text>
        <text x="695" y="226" textAnchor="end">
          Consult
        </text>
      </g>
      <g stroke={MARKE_BLAU} strokeWidth="26" fill="none">
        <path d="M748 13v222h108V128z" />
        <path d="M987 13v222H879V128z" />
      </g>
    </svg>
  );
}
