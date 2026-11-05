/**
 * Druckausgabe: Erzeugt ein eigenständiges HTML-Dokument und öffnet den
 * Druckdialog des Browsers. Dort lässt sich „Als PDF sichern“ wählen – so
 * entsteht die PDF-Fassung ohne zusätzliche Programmbibliothek. Eigene
 * Stilangaben ergänzen die Grundgestaltung.
 */
export function druckeHtml(titel: string, inhalt: string, zusatzStil = ''): void {
  const rahmen = document.createElement('iframe');
  rahmen.setAttribute('aria-hidden', 'true');
  rahmen.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(rahmen);

  const dokument = rahmen.contentDocument;
  if (!dokument) {
    rahmen.remove();
    return;
  }

  dokument.open();
  dokument.write(`<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${titel}</title>
<style>
  @page { size: A4 landscape; margin: 14mm 12mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
         font-size: 9.5pt; color: #1d1d1f; margin: 0; }
  h1 { font-size: 15pt; margin: 0 0 2mm; }
  h2 { font-size: 11pt; margin: 6mm 0 2mm; page-break-after: avoid; }
  .kopf { border-bottom: 1px solid #c7c7cc; padding-bottom: 3mm; margin-bottom: 5mm; }
  .kopf .meta { color: #6e6e73; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .03em;
       color: #6e6e73; border-bottom: 1px solid #c7c7cc; padding: 1.5mm 2mm; }
  td { padding: 1.5mm 2mm; border-bottom: 1px solid #ebebf0; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ueberfaellig { color: #c9261c; font-weight: 600; }
  .erledigt { color: #248a3d; }
  .grau { color: #6e6e73; }
  .fuss { margin-top: 6mm; color: #8e8e93; font-size: 8pt; }
${zusatzStil}
</style></head><body>${inhalt}</body></html>`);
  dokument.close();

  const drucken = () => {
    rahmen.contentWindow?.focus();
    rahmen.contentWindow?.print();
    // Der Rahmen muss bis zum Ende des Druckdialogs bestehen bleiben.
    setTimeout(() => rahmen.remove(), 60_000);
  };

  if (rahmen.contentWindow?.document.readyState === 'complete') drucken();
  else rahmen.onload = drucken;
}

/** Maskiert Text für die Ausgabe in HTML. */
export function html(wert: string | number | null | undefined): string {
  return String(wert ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
