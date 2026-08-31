self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // No interceptar peticiones de autenticación ni llamadas de API
  if (url.pathname.startsWith("/api/auth/")) {
    return;
  }

  // Pass-through con captura de errores de red
  e.respondWith(
    fetch(e.request).catch((err) => {
      return new Response("", { status: 408, statusText: "Request Timeout / Network Error" });
    })
  );
});
