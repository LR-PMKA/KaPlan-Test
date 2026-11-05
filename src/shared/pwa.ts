/**
 * Registrierung des Service Workers – nur im Produktionsbuild und nur, wenn der
 * Browser ihn unterstützt. Die Anwendung funktioniert auch ohne ihn vollständig,
 * lediglich der Offline-Betrieb entfällt dann.
 */
export function registriereServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    // Relativ zur aktuellen Seite, damit auch Unterverzeichnisse (z.B. GitHub Pages) funktionieren
    const url = new URL('sw.js', document.baseURI);
    void navigator.serviceWorker.register(url, { scope: './' }).catch((fehler) => {
      console.warn('Service Worker konnte nicht registriert werden:', fehler);
    });
  });
}
