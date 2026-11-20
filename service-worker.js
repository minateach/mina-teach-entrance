const CACHE_NAME = "mina-teach-shell-v1";
const SHELL = [
  "/offline.html",
  "/",
  "/manifest.webmanifest",
  "/learning/",
  "/learning/styles.css",
  "/learning/library.css",
  "/learning/dashboard.js",
  "/learning/lesson-view.js",
  "/learning/learning-state.js",
  "/learning/material-reader.js",
  "/learning/offline-store.js",
  "/exams/",
  "/exams/styles.css",
  "/exams/app.js",
  "/exams/bootstrap.js",
  "/assistant/",
  "/assistant/styles.css",
  "/assistant/app.js",
  "/assistant/image-store.js",
  "/image-studio/",
  "/image-studio/styles.css",
  "/image-studio/app.js",
  "/offline-status.js",
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL.map(async path => {
      try { await cache.add(new Request(path, { cache: "reload" })); }
      catch { /* A missing optional shell item must not prevent service-worker installation. */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE_NAME) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/account") || url.pathname.startsWith("/admin")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok && !url.pathname.startsWith("/account")) {
          const cachePath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
          await cache.put(cachePath, response.clone());
        }
        return response;
      } catch {
        return (await cache.match(url.pathname + url.search)) ||
          (await cache.match(url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`)) ||
          (await cache.match("/offline.html")) ||
          new Response("You are offline. Open a page that was saved for offline use.", {
            status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
      }
    })());
    return;
  }

  if (request.destination === "script" || request.destination === "style" ||
      request.destination === "image" || request.destination === "font" ||
      /\.(?:js|css|svg|png|jpe?g|webp|woff2?)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const network = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => null);
      return cached || await network || new Response("", { status: 503 });
    })());
  }
});
