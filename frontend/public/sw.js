// DukaPilot service worker - offline sales support and fresh live navigation.

const CACHE_NAME = "dukapilot-v5-20260806";
const PRECACHE_URLS = ["/manifest.json", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_api/") ||
    url.protocol === "chrome-extension:"
  ) {
    return;
  }

  // Always use the network for HTML so existing users receive the latest app
  // and authentication redirects. The offline page is only a fallback.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  // Build assets are content-hashed, so cache-first is safe for these files.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/static/") ||
    /\.(png|jpg|jpeg|svg|ico|woff2?|ttf|css)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      }))
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const title = payload.title || "DukaPilot";
  const options = {
    body: payload.body || "You have a new shop alert.",
    icon: "/logo/dukapilot-icon-192.png",
    badge: "/logo/dukapilot-icon-48.png",
    tag: payload.tag || "dukapilot-alert",
    data: { href: payload.href || "/notifications" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = new URL(event.notification.data?.href || "/notifications", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => client.url === href);
    if (existing) return existing.focus();
    return clients.openWindow(href);
  }));
});
