// Minimal service worker so Chrome offers "Install app".
// It only steps in for opening the page itself: if the network is down, it shows the last copy.
const CACHE = 'deskcal-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return; // calendar data, weather, etc. go straight to the network
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put('./', copy));
      return res;
    }).catch(() => caches.match('./'))
  );
});
