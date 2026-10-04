// sw.js — The Snake Room service worker.
//
// Purpose: make the site installable as a real app (Android "Install app" /
// iOS "Add to Home Screen"), which keeps app data in the installed app's own
// storage instead of the browser's clearable site data.
//
// Caching strategy: NETWORK-FIRST for same-origin GET requests, with the
// cache used only as an offline fallback. This means online users always see
// the latest pages, scripts, styles, and photos — the cache never serves
// stale content while a connection is available.

const CACHE_NAME = "snake-room-v1";

self.addEventListener("install", () => {
    // Activate immediately; there is nothing to pre-cache because every
    // request fills the cache opportunistically as the user browses.
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        // Drop caches from older versions of this service worker.
        const names = await caches.keys();

        await Promise.all(
            names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
        );

        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const request = event.request;

    // Only handle plain same-origin GETs (pages, scripts, styles, images).
    // Anything else — Supabase API calls, QR image service, auth — passes
    // straight through to the network untouched.
    if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith((async () => {
        try {
            const response = await fetch(request);

            if (response && response.ok) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, response.clone());
            }

            return response;
        } catch (error) {
            const cached = await caches.match(request);

            if (cached) {
                return cached;
            }

            throw error;
        }
    })());
});
