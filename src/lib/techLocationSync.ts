/**
 * Helper global para sincronizar la ubicación del técnico/usuario con el backend.
 * Captura las coordenadas GPS reales del navegador y las envía a /api/tech-locations.
 */
export async function sendLiveTechLocation(action?: string): Promise<{ lat: number; lng: number } | null> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return null;
  }

  // Comprobar estado del permiso para no disparar alertas/bloqueos repetitivos en consola
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const permissionStatus = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      if (permissionStatus.state === "denied") {
        return null;
      }
    } catch {
      // Ignorar si el navegador no soporta la consulta de permisos
    }
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          action: action || "Ubicación en vivo",
        };

        try {
          await fetch("/api/tech-locations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(loc),
          });
        } catch (e) {
          // Fallo silencioso en segundo plano
        }

        resolve({ lat: loc.lat, lng: loc.lng });
      },
      (err) => {
        // En caso de que el usuario no tenga GPS activo o deniegue permisos
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 60000,
      }
    );
  });
}
