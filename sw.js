/* MEDORA service worker: offline support + installable app */
const CACHE_NAME = "medora-cache-v1";   // bump the number (v2, v3...) whenever you publish new content
const APP_ROOT = new URL("./", self.location.href).pathname;   // works from any folder, e.g. /Medora/

const APP_FILES = [
  APP_ROOT,
  APP_ROOT + "index.html",
  APP_ROOT + "manifest.json",
  APP_ROOT + "icon.svg",
  APP_ROOT + "icon-192.png",
  APP_ROOT + "icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // add files one by one so a single missing file cannot break the install
      .then((cache) => Promise.all(APP_FILES.map((f) => cache.add(f).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("medora-cache-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Pages: try the network first so new chapters show up, fall back to the cached copy offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.pathname.startsWith(APP_ROOT)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((hit) => hit || caches.match(APP_ROOT + "index.html") || caches.match(APP_ROOT))
        )
    );
    return;
  }

  // Everything else: cache first
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        if (response.ok && url.pathname.startsWith(APP_ROOT)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }

        return response;
      }).catch(() => {
        return new Response("You are offline and this resource is not cached.", {
          status: 503,
          statusText: "Offline"
        });
      });
    })
  );
});
