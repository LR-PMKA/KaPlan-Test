/**
 * Zwischenablage: formatiert (text/html) und zugleich als Klartext kopieren –
 * Outlook und Word übernehmen beim Einfügen die Formatierung, Texteditoren den
 * Klartext. Ohne ClipboardItem (ältere Browser) nur den Klartext.
 */
export async function formatiertKopieren(html: string, text: string): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]);
    return;
  }
  await navigator.clipboard.writeText(text);
}
