/* Aurelia service worker — offline shell + fast repeat visits. API calls are never cached. */
const VERSION = "aurelia-v2";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/devx-logo.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Live data (products, gold rate, auth) always goes to the network.
  if (url.pathname.startsWith("/api/")) return;

  // Page navigations: network first, fall back to the cached app shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put("/index.html", copy)); return res; })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // Built assets, fonts, product images: stale-while-revalidate.
  const cacheable =
    url.origin === self.location.origin ||
    /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) ||
    req.destination === "image";
  if (!cacheable) return;

  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req)
        .then((res) => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
