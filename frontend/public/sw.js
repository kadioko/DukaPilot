// DukaOS Service Worker — offline support
// Strategy: cache-first for static assets, network-first for API calls

const CACHE_NAME = "dukaos-v1";

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/offline.html",
];

// ── Install: pre-cache shell ────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls, Chrome extensions, or non-GET requests
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.protocol === "chrome-extension:"
  ) {
    return;
  }

  // HTML navigation requests: network-first, fall back to offline page
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Cache a fresh copy of visited pages
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/offline.html"))
        )
    );
    return;
  }

  // Static assets (_next/static, images, fonts): cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/static/") ||
    /\.(png|jpg|jpeg|svg|ico|woff2?|ttf|css)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        });
      })
    );
    return;
  }
});
