/** Schlanke Strich-Icons im Stil von SF Symbols (ohne externe Abhängigkeit). */

const paths: Record<string, string> = {
  dashboard: 'M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5',
  projekt: 'M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  plan: 'M7 3h7l5 5v13H7zM14 3v5h5M10 12.5h6M10 16h4',
  paket: 'M12 3 4 7v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10',
  // Planverzeichnis: Liste mit Aufzählungspunkten – klar vom Planblatt unterscheidbar
  verzeichnis: 'M4.5 6.5h.01M9 6.5h10.5M4.5 12h.01M9 12h10.5M4.5 17.5h.01M9 17.5h10.5',
  kette: 'M9.5 14.5a3.5 3.5 0 0 1 0-5l2-2a3.5 3.5 0 1 1 5 5l-1 1M14.5 9.5a3.5 3.5 0 0 1 0 5l-2 2a3.5 3.5 0 1 1-5-5l1-1',
  adressbuch: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM6 7H3.5M6 12H3.5M6 17H3.5M12.5 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9 17c0-2 1.6-3 3.5-3s3.5 1 3.5 3',
  frist: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
  mail: 'M3 6.5h18v11H3zM3 7l9 6 9-6',
  einstellungen:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.4-2-3.4-2.3 1a7.6 7.6 0 0 0-2.6-1.5L14.2 2.5h-4l-.3 2.6a7.6 7.6 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.4a7.6 7.6 0 0 0 0 3l-2 1.4 2 3.4 2.3-1a7.6 7.6 0 0 0 2.6 1.5l.3 2.6h4l.3-2.6a7.6 7.6 0 0 0 2.6-1.5l2.3 1 2-3.4z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5 10 17.5 19 7',
  chevron: 'M9 5l7 7-7 7',
  zurueck: 'M15 19l-7-7 7-7',
  bearbeiten: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z',
  loeschen: 'M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 10.5v6.5M14 10.5v6.5',
  export: 'M12 16V4M8 8l4-4 4 4M4 16v4h16v-4',
  importieren: 'M12 4v12M8 12l4 4 4-4M4 16v4h16v-4',
  glocke: 'M12 3a6 6 0 0 0-6 6c0 5-2 6-2 6h16s-2-1-2-6a6 6 0 0 0-6-6zM10.5 21a1.8 1.8 0 0 0 3 0',
  suche: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20',
  filter: 'M4 5.5h16l-6.5 7.5V19l-3 1.5v-8z',
  kalender: 'M4 6.5h16V20H4zM4 10.5h16M8.5 3.5v4M15.5 3.5v4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c0-3.6 3.3-5.5 7.5-5.5s7.5 1.9 7.5 5.5',
  hoch: 'M12 19V5M6 11l6-6 6 6',
  runter: 'M12 5v14M6 13l6 6 6-6',
  kopieren: 'M9 9h11v11H9zM15 9V4H4v11h5',
  // Klemmbrett mit Textzeilen – Protokolle und Projektsteuerung
  protokoll: 'M9 4.5H6.5v16h11v-16H15M9 3h6v3H9zM9.5 11h5M9.5 14.5h5M9.5 18h3',
  // Workflow-Editor: Rückgängig/Wiederholen, Schrittarten, Start und Ende
  rueckgaengig: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  wiederholen: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  aufgabe: 'M5 5h14v14H5zM8.5 12l2.5 2.5 4.5-5',
  raute: 'M12 3.5 20.5 12 12 20.5 3.5 12z',
  start: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.5l5.5 3.5-5.5 3.5z',
  ziel: 'M5 21V4M5 4.5h11.5l-2.5 4 2.5 4H5',
  schleife: 'M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.5h.01',
};

export type IconName = keyof typeof paths;

/** Symbol als SVG-Text – für Ausgaben außerhalb der Oberfläche, etwa die PDF-Fassung. */
export function iconSvg(name: IconName | string, size = 16, strokeWidth = 1.6): string {
  const d = paths[name] ?? paths.plan;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.6,
}: {
  name: IconName | string;
  size?: number;
  strokeWidth?: number;
}) {
  const d = paths[name] ?? paths.plan;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path d={d} />
    </svg>
  );
}
