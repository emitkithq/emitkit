/*
 * EmitKit dashboard service worker, served at /service-worker.js (scope /).
 *
 * - Takes over immediately (skipWaiting + clients.claim) and deletes every
 *   cache that isn't its own, including the previous app's Workbox caches.
 * - Navigations are network-first; the last good app shell is kept under
 *   "/" and served when the network is unavailable. Auth and RPC requests
 *   (password resets, verification links and OAuth callbacks set cookies and
 *   redirect) are never touched.
 * - Shows push notifications and focuses/opens the app when one is clicked.
 * - When the browser replaces the push subscription, subscribes again and
 *   moves this device's rows to it (best effort: the app does the same when
 *   it next opens, including on browsers that never fire the event).
 */

const SHELL_CACHE = "emitkit-shell-v1";
const SHELL_URL = "/";
const DEFAULT_ICON = "/web-app-manifest-192x192.png";
// White mark on transparent: Android draws notification badges from alpha only.
const BADGE = "/badge-96x96.png";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

const isBypassed = (url) =>
  url.origin !== self.location.origin ||
  url.pathname.startsWith("/api/") ||
  url.pathname === "/rpc" ||
  url.pathname.startsWith("/rpc/");

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (
    request.mode !== "navigate" ||
    request.method !== "GET" ||
    isBypassed(new URL(request.url))
  ) {
    return;
  }
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        const isShell =
          response.status === 200 &&
          !response.redirected &&
          (response.headers.get("content-type") || "").includes("text/html");
        if (isShell) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put(SHELL_URL, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(SHELL_URL, {
          cacheName: SHELL_CACHE,
        });
        if (cached) {
          return cached;
        }
        throw error;
      }
    })()
  );
});

const readPayload = (data) => {
  if (!data) {
    return {};
  }
  try {
    return data.json();
  } catch {
    return { body: data.text() };
  }
};

/* Only URLs make usable notification images (an event icon may be an emoji). */
const imageUrl = (value) =>
  typeof value === "string" &&
  (value.startsWith("/") || value.startsWith("https://"))
    ? value
    : undefined;

self.addEventListener("push", (event) => {
  const payload = readPayload(event.data);
  const title =
    typeof payload.title === "string" && payload.title
      ? payload.title
      : "EmitKit";
  event.waitUntil(
    self.registration.showNotification(title, {
      badge: BADGE,
      body: typeof payload.body === "string" ? payload.body : "",
      data: {
        url: typeof payload.url === "string" && payload.url ? payload.url : "/",
      },
      icon: imageUrl(payload.icon) ?? DEFAULT_ICON,
      tag:
        typeof payload.tag === "string" && payload.tag
          ? payload.tag
          : undefined,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl =
    (event.notification.data && event.notification.data.url) || "/";
  const target = new URL(rawUrl, self.location.origin);
  const url =
    target.origin === self.location.origin
      ? target.href
      : new URL("/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        includeUncontrolled: true,
        type: "window",
      });
      const client = windows.find(
        (candidate) => new URL(candidate.url).origin === self.location.origin
      );
      if (client) {
        await client.focus();
        try {
          await client.navigate(url);
          return;
        } catch {
          // Uncontrolled clients can't be navigated; open a fresh window.
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});

const rpc = async (procedure, input) => {
  const response = await fetch(`/rpc/notifications/${procedure}`, {
    body: JSON.stringify({ json: input }),
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`${procedure}: ${response.status}`);
  }
  const body = await response.json();
  return body.json;
};

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const previous = event.oldSubscription;
      let next = event.newSubscription;
      if (!next) {
        const { publicKey } = await rpc("publicKey", {});
        next = await self.registration.pushManager.subscribe({
          applicationServerKey: publicKey,
          userVisibleOnly: true,
        });
      }
      const { keys } = next.toJSON();
      await rpc("syncDevice", {
        auth: keys.auth,
        endpoint: next.endpoint,
        p256dh: keys.p256dh,
        ...(previous && previous.endpoint !== next.endpoint
          ? { previousEndpoint: previous.endpoint }
          : {}),
      });
    })().catch(() => {
      // Signed out or offline: the app resyncs when it next opens.
    })
  );
});
