/**
 * Service Worker von KaPlan.
 *
 * Die Anwendung arbeitet vollständig lokal, daher genügt ein schlanker Cache:
 * - Navigationen: zuerst Netz, bei fehlender Verbindung die zwischengespeicherte Startseite.
 * - Programmdateien (gehashte Dateinamen unter assets/): zuerst Cache.
 * - Logos, Symbole und Manifest: zuerst Netz, damit ausgetauschte Dateien gleichen
 *   Namens sofort erscheinen; offline aus dem Cache.
 */
// Die Fassung hochzählen, sobald sich Symbole oder die Hülle ändern – beim
// Aktivieren werden alle älteren Caches gelöscht.
const CACHE = 'mc-plan-v7';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/favicon-64.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Seitenaufrufe: aktuelle Fassung bevorzugen, offline aus dem Cache liefern
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((antwort) => {
          // Nur eine gültige Startseite ablegen – eine Fehlerseite darf die
          // zwischengespeicherte Fassung für den Offline-Start nicht ersetzen.
          if (antwort.ok && antwort.type === 'basic') {
            const kopie = antwort.clone();
            caches.open(CACHE).then((cache) => cache.put('./index.html', kopie));
          }
          return antwort;
        })
        .catch(() => caches.match('./index.html').then((treffer) => treffer ?? Response.error())),
    );
    return;
  }

  // Programmdateien unter assets/ tragen einen Prüfwert im Namen und ändern
  // sich nie – sie kommen zuerst aus dem Cache.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then((treffer) => {
        if (treffer) return treffer;
        return fetch(request).then((antwort) => {
          ablegen(request, antwort);
          return antwort;
        });
      }),
    );
    return;
  }

  // Übrige Dateien (Logos, Symbole, Manifest) behalten ihren Namen, wenn sie
  // ausgetauscht werden: zuerst aus dem Netz, offline aus dem Cache.
  event.respondWith(
    fetch(request)
      .then((antwort) => {
        ablegen(request, antwort);
        return antwort;
      })
      .catch(() => caches.match(request).then((treffer) => treffer ?? Response.error())),
  );
});

/** Legt eine gültige Antwort im Cache ab. */
function ablegen(request, antwort) {
  if (antwort.ok && antwort.type === 'basic') {
    const kopie = antwort.clone();
    caches.open(CACHE).then((cache) => cache.put(request, kopie));
  }
}
