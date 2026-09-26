/* eslint-disable no-undef */
/**
 * Service worker de Web Push (incremento v2, RF-37).
 *
 * Recibe las notificaciones que difunde el worker (`WebPushService.broadcastNotification`) y las
 * muestra. No guarda ni envía nada: el push es best-effort y no contiene datos personales.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Hotel Marina del Sol";
  const options = {
    body: payload.body || "",
    data: { url: payload.url || "/mis-noches/mis-reventas" },
    tag: "hotel-resale",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.openWindow(url));
});
