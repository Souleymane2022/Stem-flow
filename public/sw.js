/*
 * Service worker de STEM Flow.
 *
 * Il rend l'application installable et utilisable quand le réseau flanche.
 * Trois règles, et une abstention :
 *
 *   - les pages passent par le réseau d'abord, le cache ne servant que de
 *     filet : une page mise en cache masquerait une session expirée ou un
 *     contenu retiré ;
 *   - les fichiers construits (empreinte dans le nom, donc immuables) sont
 *     servis depuis le cache ;
 *   - les images distantes — vignettes YouTube, avatars — sont gardées un
 *     temps, elles reviennent d'un écran à l'autre.
 *
 * L'abstention : rien de ce qui va vers Supabase n'est intercepté. Une réponse
 * d'API servie depuis un cache afficherait des données périmées, et une écriture
 * rejouée hors ligne ferait pire que mieux.
 */
const VERSION = "v1";
const SHELL = `stemflow-shell-${VERSION}`;
const ASSETS = `stemflow-assets-${VERSION}`;
const IMAGES = `stemflow-images-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, ASSETS, IMAGES]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

function isBuildAsset(url) {
  return url.origin === self.location.origin && /\/(assets|_build)\//.test(url.pathname);
}

function isRemoteImage(url) {
  // Les vignettes du fil, seules images distantes qui reviennent d'un écran à
  // l'autre. Le reste ne gagnerait rien à être gardé.
  return /(^|\.)ytimg\.com$/.test(url.hostname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Tout ce qui touche à la base ou à l'authentification passe sans détour.
  if (url.hostname.endsWith("supabase.co")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match(OFFLINE_URL)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (isBuildAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })(),
    );
    return;
  }

  if (isRemoteImage(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(IMAGES);
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return hit ?? Response.error();
        }
      })(),
    );
  }
});

/* ------------------------------------------------------------ notifications */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "STEM Flow";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Regroupe les rappels d'une même nature : dix notifications empilées
      // font fermer l'application, pas l'ouvrir.
      tag: payload.tag || "stemflow",
      renotify: Boolean(payload.tag),
      data: { url: payload.url || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/notifications";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Réutilise l'onglet déjà ouvert plutôt que d'en empiler un autre.
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
