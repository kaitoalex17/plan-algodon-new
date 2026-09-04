const CACHE_NAME = "algodon-pwa-v3";
const OFFLINE_URLS = [
  "/",
  "/photo-guide",
  "/form-guide",
  "/manifest.json"
];

// Instalar y pre-cachear páginas clave
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS).catch((err) => {
        console.warn("Recurso offline no crítico omitido:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activar y limpiar versiones previas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log("Limpiando caché PWA antigua:", name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptar peticiones para garantizar funcionamiento offline
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo peticiones GET
  if (request.method !== "GET") return;

  // 1. Ignorar llamadas a la API (se gestionan en la app con IndexedDB)
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // 2. Chunks de código JavaScript y estilos CSS de Next.js (_next/static)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone)).catch(() => {});
          }
          return networkResponse;
        }).catch(() => cachedResponse);
      })
    );
    return;
  }

  // 3. Navegación a páginas (HTML como /photo-guide o /)
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            try {
              // Clonar de forma segura antes de devolver la respuesta a la navegación
              const cloneForRequest = networkResponse.clone();
              const cloneForPath = url.search ? cloneForRequest.clone() : null;
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, cloneForRequest).catch(() => {});
                if (cloneForPath) {
                  cache.put(url.pathname, cloneForPath).catch(() => {});
                }
              }).catch(() => {});
            } catch (e) {
              console.warn("Error guardando en caché HTML:", e);
            }
          }
          return networkResponse;
        })
        .catch(async () => {
          // Si no hay red (OFFLINE): Buscar en caché
          const cachedMatch = await caches.match(request);
          if (cachedMatch) return cachedMatch;

          // Buscar la ruta base sin query params (/photo-guide o /form-guide)
          const baseMatch = await caches.match(url.pathname);
          if (baseMatch) return baseMatch;

          if (url.pathname.startsWith("/photo-guide")) {
            const guideMatch = await caches.match("/photo-guide");
            if (guideMatch) return guideMatch;
          }

          if (url.pathname.startsWith("/form-guide")) {
            const formMatch = await caches.match("/form-guide");
            if (formMatch) return formMatch;
          }

          // Fallback a la raíz
          const rootMatch = await caches.match("/");
          return rootMatch || new Response("Modo sin conexión activo", {
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        })
    );
    return;
  }

  // 4. Otros recursos estáticos (imágenes locales, fuentes, iconos)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
