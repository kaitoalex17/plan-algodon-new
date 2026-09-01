import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from "react-leaflet";
import { useState, useEffect, useRef } from "react";
import L from "leaflet";

// Función para generar iconos SVG personalizados según forma y tamaño
function createCustomIcon(
  shape: string, 
  size: number, 
  borderCol: string, 
  fillCol: string, 
  status?: string, 
  patternCorrecto: string = "diagonal-stripes", 
  patternFallo: string = "cross-pattern"
) {
  const s = size * 2 + 8; // Espacio suficiente para bordes
  const center = s / 2;
  const radius = size;
  
  let svgContent = "";
  
  // Defs block for the stripe patterns
  const defsBlock = `
    <defs>
      <pattern id="diagonal-stripes" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" stroke-width="2.2" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="#10b981" stroke-width="1.0" />
      </pattern>
      <pattern id="horizontal-stripes" width="6" height="6" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="6" y2="0" stroke="#ffffff" stroke-width="2.2" />
        <line x1="0" y1="0" x2="6" y2="0" stroke="#10b981" stroke-width="1.0" />
      </pattern>
      <pattern id="vertical-stripes" width="6" height="6" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" stroke-width="2.2" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="#10b981" stroke-width="1.0" />
      </pattern>
      <pattern id="grid-pattern" width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="none" stroke="#ffffff" stroke-width="2.2" />
        <rect width="6" height="6" fill="none" stroke="#10b981" stroke-width="1.0" />
      </pattern>
    </defs>
  `;
  
  if (shape === "square") {
    svgContent = `<rect x="${center - radius}" y="${center - radius}" width="${radius * 2}" height="${radius * 2}" fill="${fillCol}" stroke="${borderCol}" stroke-width="2" rx="1.5" />`;
  } else if (shape === "triangle") {
    const p1 = `${center},${center - radius}`;
    const p2 = `${center - radius},${center + radius}`;
    const p3 = `${center + radius},${center + radius}`;
    svgContent = `<polygon points="${p1} ${p2} ${p3}" fill="${fillCol}" stroke="${borderCol}" stroke-width="2" stroke-linejoin="round" />`;
  } else if (shape === "diamond") {
    const p1 = `${center},${center - radius}`;
    const p2 = `${center + radius},${center}`;
    const p3 = `${center},${center + radius}`;
    const p4 = `${center - radius},${center}`;
    svgContent = `<polygon points="${p1} ${p2} ${p3} ${p4}" fill="${fillCol}" stroke="${borderCol}" stroke-width="2" stroke-linejoin="round" />`;
  } else if (shape === "star") {
    const points = [
      [center, center - radius],
      [center + radius * 0.24, center - radius * 0.24],
      [center + radius * 0.95, center - radius * 0.31],
      [center + radius * 0.38, center + radius * 0.12],
      [center + radius * 0.59, center + radius * 0.81],
      [center, center + radius * 0.44],
      [center - radius * 0.59, center + radius * 0.81],
      [center - radius * 0.38, center + radius * 0.12],
      [center - radius * 0.95, center - radius * 0.31],
      [center - radius * 0.24, center - radius * 0.24]
    ].map(p => p.join(",")).join(" ");
    svgContent = `<polygon points="${points}" fill="${fillCol}" stroke="${borderCol}" stroke-width="2" stroke-linejoin="round" />`;
  } else {
    // Circle por defecto
    svgContent = `<circle cx="${center}" cy="${center}" r="${radius}" fill="${fillCol}" stroke="${borderCol}" stroke-width="2" />`;
  }

  const isCorrecto = status === "CORRECTO" || status === "REVISADO";
  if (isCorrecto) {
    if (patternCorrecto === "dotted-pattern") {
      const dotRadius = Math.max(0.8, size * 0.15); // Puntos muy pequeños
      const offset = size * 0.45;
      svgContent += `
        <circle cx="${center}" cy="${center}" r="${dotRadius}" fill="${borderCol}" stroke="#ffffff" stroke-width="0.3" />
        <circle cx="${center - offset}" cy="${center - offset}" r="${dotRadius}" fill="${borderCol}" stroke="#ffffff" stroke-width="0.3" />
        <circle cx="${center + offset}" cy="${center - offset}" r="${dotRadius}" fill="${borderCol}" stroke="#ffffff" stroke-width="0.3" />
        <circle cx="${center - offset}" cy="${center + offset}" r="${dotRadius}" fill="${borderCol}" stroke="#ffffff" stroke-width="0.3" />
        <circle cx="${center + offset}" cy="${center + offset}" r="${dotRadius}" fill="${borderCol}" stroke="#ffffff" stroke-width="0.3" />
      `;
    } else {
      let stripeOverlay = "";
      if (shape === "square") {
        stripeOverlay = `<rect x="${center - radius}" y="${center - radius}" width="${radius * 2}" height="${radius * 2}" fill="url(#${patternCorrecto})" stroke="none" rx="1.5" />`;
      } else if (shape === "triangle") {
        const p1 = `${center},${center - radius}`;
        const p2 = `${center - radius},${center + radius}`;
        const p3 = `${center + radius},${center + radius}`;
        stripeOverlay = `<polygon points="${p1} ${p2} ${p3}" fill="url(#${patternCorrecto})" stroke="none" />`;
      } else if (shape === "diamond") {
        const p1 = `${center},${center - radius}`;
        const p2 = `${center + radius},${center}`;
        const p3 = `${center},${center + radius}`;
        const p4 = `${center - radius},${center}`;
        stripeOverlay = `<polygon points="${p1} ${p2} ${p3} ${p4}" fill="url(#${patternCorrecto})" stroke="none" />`;
      } else if (shape === "star") {
        const points = [
          [center, center - radius],
          [center + radius * 0.24, center - radius * 0.24],
          [center + radius * 0.95, center - radius * 0.31],
          [center + radius * 0.38, center + radius * 0.12],
          [center + radius * 0.59, center + radius * 0.81],
          [center, center + radius * 0.44],
          [center - radius * 0.59, center + radius * 0.81],
          [center - radius * 0.38, center + radius * 0.12],
          [center - radius * 0.95, center - radius * 0.31],
          [center - radius * 0.24, center - radius * 0.24]
        ].map(p => p.join(",")).join(" ");
        stripeOverlay = `<polygon points="${points}" fill="url(#${patternCorrecto})" stroke="none" />`;
      } else {
        stripeOverlay = `<circle cx="${center}" cy="${center}" r="${radius}" fill="url(#${patternCorrecto})" stroke="none" />`;
      }
      svgContent += stripeOverlay;
    }
  } else if (status === "FALLO") {
    // Fallo pattern (reborde interior de color blanco y algunas lineas o patron de color rojo indicando fallo)
    let innerWhiteBorder = "";
    if (shape === "square") {
      innerWhiteBorder = `<rect x="${center - radius + 1.5}" y="${center - radius + 1.5}" width="${(radius - 1.5) * 2}" height="${(radius - 1.5) * 2}" fill="none" stroke="#ffffff" stroke-width="1.5" rx="1" />`;
    } else if (shape === "triangle") {
      const p1 = `${center},${center - radius + 2.5}`;
      const p2 = `${center - radius + 2},${center + radius - 1.5}`;
      const p3 = `${center + radius - 2},${center + radius - 1.5}`;
      innerWhiteBorder = `<polygon points="${p1} ${p2} ${p3}" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" />`;
    } else if (shape === "diamond") {
      const p1 = `${center},${center - radius + 2.5}`;
      const p2 = `${center + radius - 2.5},${center}`;
      const p3 = `${center},${center + radius - 2.5}`;
      const p4 = `${center - radius + 2.5},${center}`;
      innerWhiteBorder = `<polygon points="${p1} ${p2} ${p3} ${p4}" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" />`;
    } else {
      innerWhiteBorder = `<circle cx="${center}" cy="${center}" r="${radius - 1.5}" fill="none" stroke="#ffffff" stroke-width="1.5" />`;
    }

    svgContent += innerWhiteBorder;

    if (patternFallo === "cross-pattern") {
      svgContent += `
        <!-- Red cross indicating failure with white outline -->
        <line x1="${center - radius * 0.4}" y1="${center - radius * 0.4}" x2="${center + radius * 0.4}" y2="${center + radius * 0.4}" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
        <line x1="${center + radius * 0.4}" y1="${center - radius * 0.4}" x2="${center - radius * 0.4}" y2="${center + radius * 0.4}" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
        <line x1="${center - radius * 0.4}" y1="${center - radius * 0.4}" x2="${center + radius * 0.4}" y2="${center + radius * 0.4}" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" />
        <line x1="${center + radius * 0.4}" y1="${center - radius * 0.4}" x2="${center - radius * 0.4}" y2="${center + radius * 0.4}" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" />
      `;
    } else if (patternFallo === "slash-pattern") {
      svgContent += `
        <line x1="${center - radius * 0.4}" y1="${center + radius * 0.4}" x2="${center + radius * 0.4}" y2="${center - radius * 0.4}" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" />
        <line x1="${center - radius * 0.4}" y1="${center + radius * 0.4}" x2="${center + radius * 0.4}" y2="${center - radius * 0.4}" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" />
      `;
    } else if (patternFallo === "alert-pattern") {
      svgContent += `
        <line x1="${center}" y1="${center - radius * 0.5}" x2="${center}" y2="${center + radius * 0.1}" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
        <line x1="${center}" y1="${center - radius * 0.5}" x2="${center}" y2="${center + radius * 0.1}" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" />
        <circle cx="${center}" cy="${center + radius * 0.5}" r="1.5" fill="#ffffff" />
        <circle cx="${center}" cy="${center + radius * 0.5}" r="0.8" fill="#ef4444" />
      `;
    } else if (patternFallo === "circle-pattern") {
      svgContent += `
        <circle cx="${center}" cy="${center}" r="${radius * 0.4}" fill="#ffffff" />
        <circle cx="${center}" cy="${center}" r="${radius * 0.25}" fill="#ef4444" />
      `;
    } else if (patternFallo === "minus-pattern") {
      svgContent += `
        <line x1="${center - radius * 0.4}" y1="${center}" x2="${center + radius * 0.4}" y2="${center}" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" />
        <line x1="${center - radius * 0.4}" y1="${center}" x2="${center + radius * 0.4}" y2="${center}" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" />
      `;
    }
  } else if (status === "REPARAR") {
    // Símbolo distintivo para CTOs enviadas a REPARAR (color violeta #8b5cf6)
    let innerBorder = "";
    if (shape === "square") {
      innerBorder = `<rect x="${center - radius + 1.5}" y="${center - radius + 1.5}" width="${(radius - 1.5) * 2}" height="${(radius - 1.5) * 2}" fill="none" stroke="#8b5cf6" stroke-width="1.8" rx="1" />`;
    } else {
      innerBorder = `<circle cx="${center}" cy="${center}" r="${radius - 1.5}" fill="none" stroke="#8b5cf6" stroke-width="1.8" />`;
    }
    svgContent += innerBorder;

    // Núcleo violeta con centro blanco representando acción de taller/reparación
    svgContent += `
      <circle cx="${center}" cy="${center}" r="${radius * 0.42}" fill="#8b5cf6" stroke="#ffffff" stroke-width="0.8" />
      <circle cx="${center}" cy="${center}" r="${radius * 0.18}" fill="#ffffff" />
    `;
  }

  return L.divIcon({
    html: `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${defsBlock}${svgContent}</svg>`,
    className: "custom-map-marker",
    iconSize: [s, s],
    iconAnchor: [center, center],
  });
}

// Componente para manejar eventos del mapa, guardar estado de vista en BD y geolocalización
function MapStateAndTracking({ 
  initialMapState, 
  isTracking, 
  onLocationUpdate,
  userLocation
}: { 
  initialMapState: any, 
  isTracking: boolean, 
  onLocationUpdate: (loc: any) => void,
  userLocation: any
}) {
  const map = useMap();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const firstLocationRef = useRef<boolean>(true);

  // Cargar posición inicial guardada (Prioridad: localStorage inmediato -> initialMapState de la BD)
  useEffect(() => {
    try {
      const localLat = localStorage.getItem("saved_map_lat");
      const localLng = localStorage.getItem("saved_map_lng");
      const localZoom = localStorage.getItem("saved_map_zoom");

      if (localLat && localLng && localZoom) {
        map.setView([parseFloat(localLat), parseFloat(localLng)], parseInt(localZoom));
        return;
      }
    } catch (e) {}

    if (initialMapState?.lat && initialMapState?.lng && initialMapState?.zoom) {
      map.setView([initialMapState.lat, initialMapState.lng], initialMapState.zoom);
    }
  }, [map, initialMapState]);

  // Guardar la vista (lat, lng, zoom) de forma instantánea en localStorage y con Debounce en la BD
  const saveMapView = () => {
    const center = map.getCenter();
    const zoom = map.getZoom();

    // Guardado instantáneo en localStorage (para que no se pierda aunque cierres la pestaña de inmediato)
    try {
      localStorage.setItem("saved_map_lat", center.lat.toString());
      localStorage.setItem("saved_map_lng", center.lng.toString());
      localStorage.setItem("saved_map_zoom", zoom.toString());
    } catch (e) {}

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch("/api/users/map-state", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: center.lat, lng: center.lng, zoom })
        });
      } catch (err) {
        console.error("Error guardando estado del mapa en BD:", err);
      }
    }, 1000);
  };

  useMapEvents({
    moveend: saveMapView,
    zoomend: saveMapView,
  });

  // Manejar Geolocalización (GPS Continuo)
  useEffect(() => {
    if (!isTracking) {
      map.stopLocate();
      onLocationUpdate(null);
      firstLocationRef.current = true;
      return;
    }

    map.locate({ watch: true, enableHighAccuracy: true });

    const onLocationFound = (e: any) => {
      onLocationUpdate({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        accuracy: e.accuracy
      });

      if (firstLocationRef.current) {
        map.flyTo(e.latlng, 17);
        firstLocationRef.current = false;
      }
    };

    const onLocationError = (e: any) => {
      console.warn("Error de GPS:", e.message);
    };

    map.on("locationfound", onLocationFound);
    map.on("locationerror", onLocationError);

    return () => {
      map.off("locationfound", onLocationFound);
      map.off("locationerror", onLocationError);
      map.stopLocate();
    };
  }, [map, isTracking, onLocationUpdate]);

  return null;
}

function CtoMarkers({ 
  ctos, 
  onCtoClick, 
  zoomThreshold,
  markerShape,
  markerSize,
  patternCorrecto,
  patternFallo
}: { 
  ctos: any[], 
  onCtoClick: (cto: any) => void, 
  zoomThreshold: number,
  markerShape: string,
  markerSize: number,
  patternCorrecto?: string,
  patternFallo?: string
}) {
  const map = useMap();
  const [bounds, setBounds] = useState<any>(null);
  const [zoom, setZoom] = useState<number>(map.getZoom());
  
  useEffect(() => {
    setBounds(map.getBounds());
  }, [map]);

  useMapEvents({
    moveend: () => setBounds(map.getBounds()),
    zoomend: () => setZoom(map.getZoom())
  });
  
  if (zoom < zoomThreshold) {
    return (
      <div style={{ position: "absolute", top: "70px", left: "50%", transform: "translateX(-50%)", zIndex: 1000, background: "rgba(255,255,255,0.95)", padding: "8px 20px", borderRadius: "20px", fontSize: "14px", fontWeight: 600, boxShadow: "0 2px 10px rgba(0,0,0,0.1)", border: "1px solid #FF790040", color: "#111827" }}>
        Acércate para ver las CTOs (Zoom {zoom} / {zoomThreshold})
      </div>
    );
  }

  const visibleCtos = ctos.filter(cto => {
    if (!bounds) return true; 
    return bounds.contains([cto.lat, cto.lng]);
  });

  return (
    <>
      {visibleCtos.map(cto => {
        // Asignar color de borde basado en subestado o estado (incluyendo soporte para REVISADO en verde y REPARAR en violeta)
        const borderColor = cto.subStatus?.color || (
          cto.status === "PENDIENTE" ? "#808080" : 
          (cto.status === "CORRECTO" || cto.status === "REVISADO") ? "#10b981" : 
          cto.status === "REPARAR" ? "#8b5cf6" :
          "#ef4444"
        );
        const fillColor = cto.assignedTo?.color || "#ffffff";
        const status = cto.status;

        return (
          <Marker 
            key={cto.id}
            position={[cto.lat, cto.lng]}
            icon={createCustomIcon(markerShape, markerSize, borderColor, fillColor, status, patternCorrecto, patternFallo)}
            eventHandlers={{
              click: () => onCtoClick(cto)
            }}
          />
        );
      })}
    </>
  );
}

// Leyenda del Mapa (Colores de estados y técnicos)
function MapLegend({ users, showLegend, setShowLegend }: { users: any[], showLegend: boolean, setShowLegend: (v: boolean) => void }) {
  return (
    <div style={{ position: "absolute", bottom: "16px", left: "16px", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      {/* Botón Info Circle */}
      <button 
        onClick={() => setShowLegend(!showLegend)}
        title="Leyenda de colores"
        style={{
          width: "40px", height: "40px", borderRadius: "50%", background: "white",
          border: "1.5px solid #cbd5e1", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          color: "#475569", transition: "transform 0.15s"
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>

      {showLegend && (
        <div style={{
          position: "absolute", bottom: "48px", left: "0",
          background: "white", padding: "12px", borderRadius: "10px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)", border: "1px solid #e2e8f0",
          width: "220px", display: "flex", flexDirection: "column", gap: "10px", zIndex: 1001
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1e293b" }}>Leyenda de Colores</span>
            <button 
              onClick={() => setShowLegend(false)}
              style={{ background: "none", border: "none", fontSize: "0.9rem", color: "#94a3b8", cursor: "pointer" }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid #f1f5f9", paddingTop: "8px" }}>
            {/* Estados */}
            <div>
              <h4 style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "4px" }}>Borde (Estado)</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "0.8rem", color: "#334155" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid #808080", background: "white" }} />
                  <span>Pendiente</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid #10b981", background: "white" }} />
                  <span>Correcto / Revisado</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid #8b5cf6", background: "white" }} />
                  <span>A Reparar</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid #ef4444", background: "white" }} />
                  <span>Fallo</span>
                </div>
              </div>
            </div>

            {/* Técnicos */}
            <div>
              <h4 style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "4px" }}>Relleno (Asignación)</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "0.8rem", maxHeight: "100px", overflowY: "auto", color: "#334155" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "12px", height: "12px", borderRadius: "50%", border: "1px solid #cbd5e1", background: "#ffffff" }} />
                  <span>Sin asignar</span>
                </div>
                {users.map((u, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "50%", border: "1px solid #cbd5e1", background: u.color }} />
                    <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "150px" }}>{u.name || u.email}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeMapView({ centerCoords }: { centerCoords: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (centerCoords) {
      map.flyTo(centerCoords, 18);
    }
  }, [centerCoords, map]);
  return null;
}

export default function Map({ 
  ctos, 
  onCtoClick,
  initialMapState,
  zoomThreshold = 12,
  users = [],
  markerShape = "circle",
  markerSize = 6,
  patternCorrecto = "diagonal-stripes",
  patternFallo = "cross-pattern",
  centerCoords = null
}: { 
  ctos: any[], 
  onCtoClick: (cto: any) => void,
  initialMapState?: any,
  zoomThreshold?: number,
  users?: any[],
  markerShape?: string,
  markerSize?: number,
  patternCorrecto?: string,
  patternFallo?: string,
  centerCoords?: [number, number] | null
}) {
  const [tileUrl, setTileUrl] = useState("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}");
  const [showMapTypes, setShowMapTypes] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  // Cargar capa guardada
  useEffect(() => {
    const saved = localStorage.getItem("map_layer");
    if (saved) {
      setTileUrl(saved);
    } else if (initialMapState?.mapLayer) {
      setTileUrl(initialMapState.mapLayer);
    }
  }, [initialMapState]);
  
  // Estados de Geolocalización y Técnicos en Vivo
  const [isTracking, setIsTracking] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number, accuracy: number } | null>(null);
  const [liveTechs, setLiveTechs] = useState<any[]>([]);

  const mapRef = useRef<any>(null);

  // Solicitar ubicación al entrar a la app y guardarla
  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
          setUserLocation(loc);
          // Compartir ubicación al servidor para que otros técnicos lo vean
          fetch("/api/tech-locations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy })
          }).catch(() => {});
        },
        (err) => {
          console.log("Permiso de GPS:", err.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  // Polling de técnicos en vivo cada 8 segundos
  useEffect(() => {
    const fetchTechLocations = async () => {
      try {
        const res = await fetch("/api/tech-locations");
        if (res.ok) {
          const data = await res.json();
          setLiveTechs(data);
        }
      } catch (e) {}
    };

    fetchTechLocations();
    const interval = setInterval(fetchTechLocations, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleCenterOnUser = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.flyTo([userLocation.lat, userLocation.lng], 17);
    }
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", touchAction: "none" }}>
      <MapContainer 
        center={[initialMapState?.lat || 36.425, initialMapState?.lng || -5.144]} 
        zoom={initialMapState?.zoom || 14} 
        className="map-container" 
        zoomControl={false}
        maxZoom={21}
        ref={mapRef}
      >
        <TileLayer url={tileUrl} maxZoom={21} maxNativeZoom={21} />
        
        {/* Marcador de mi posición GPS */}
        {userLocation && (
          <>
            <Circle 
              center={[userLocation.lat, userLocation.lng]} 
              radius={userLocation.accuracy || 20} 
              pathOptions={{ fillColor: "#3b82f6", fillOpacity: 0.15, color: "#3b82f6", weight: 1 }} 
            />
            <Marker 
              position={[userLocation.lat, userLocation.lng]} 
              icon={L.divIcon({
                html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
                  <div style="background:#0284c7;color:white;font-size:10px;font-weight:800;padding:2px 6px;border-radius:10px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);margin-bottom:2px;border:1px solid white;">Tú</div>
                  <svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#0284c7" stroke="white" stroke-width="3" /><circle cx="12" cy="12" r="12" fill="#0284c7" fill-opacity="0.2" /></svg>
                </div>`,
                className: "user-location-marker",
                iconSize: [60, 40],
                iconAnchor: [30, 28]
              })}
            />
          </>
        )}

        {/* Pines de otros técnicos en vivo en el mapa (solo activos en los últimos 30 min) */}
        {liveTechs.filter((tech) => typeof tech.lat === "number" && typeof tech.lng === "number").map((tech) => (
          <Marker
            key={tech.userId}
            position={[tech.lat, tech.lng]}
            icon={L.divIcon({
              html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
                <div style="background:${tech.color || '#FF7900'};color:white;font-size:10px;font-weight:800;padding:2px 6px;border-radius:10px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);margin-bottom:2px;border:1px solid white;">${tech.name || 'Técnico'}</div>
                <div style="width:16px;height:16px;border-radius:50%;background:${tech.color || '#FF7900'};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>
              </div>`,
              className: "tech-live-marker",
              iconSize: [80, 40],
              iconAnchor: [40, 26]
            })}
          />
        ))}

        {/* Marcadores de CTOs */}
        <CtoMarkers 
          ctos={ctos} 
          onCtoClick={onCtoClick} 
          zoomThreshold={zoomThreshold} 
          markerShape={markerShape}
          markerSize={markerSize}
          patternCorrecto={patternCorrecto}
          patternFallo={patternFallo}
        />

        {/* Lógica de estado y rastreador en el mapa */}
        <MapStateAndTracking 
          initialMapState={initialMapState} 
          isTracking={isTracking} 
          onLocationUpdate={(loc) => {
            setUserLocation(loc);
            if (loc) {
              fetch("/api/tech-locations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy })
              }).catch(() => {});
            }
          }} 
          userLocation={userLocation}
        />

        {/* Leyenda del mapa */}
        <MapLegend users={users} showLegend={showLegend} setShowLegend={setShowLegend} />
        
        {/* Cambiar vista del mapa al buscar */}
        <ChangeMapView centerCoords={centerCoords} />
      </MapContainer>

      {/* Controles del Mapa Agrupados a la Izquierda en Pila Vertical */}
      <div style={{ position: "absolute", top: "16px", left: "16px", zIndex: 1000, display: "flex", flexDirection: "column", gap: "10px" }}>
        
        {/* Botón Geolocalización Directa / Ubicarme (📍) */}
        <button 
          onClick={() => {
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
                  setUserLocation(loc);
                  // Enviar ubicación en vivo al servidor para sincronizar pin
                  fetch("/api/tech-locations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy })
                  }).catch(() => {});

                  if (mapRef.current) {
                    mapRef.current.flyTo([loc.lat, loc.lng], 18, { animate: true, duration: 1.5 });
                  }
                },
                (err) => alert("No se pudo obtener la posición GPS. Asegúrate de dar permisos de ubicación.")
              );
            } else {
              alert("Tu navegador no soporta geolocalización.");
            }
          }}
          title="Geolocalizarme ahora en el mapa"
          style={{
            width: "44px", height: "44px", borderRadius: "50%", background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
            border: "1.5px solid #38bdf8", boxShadow: "0 4px 12px rgba(2,132,199,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            color: "white", transition: "all 0.2s"
          }}
        >
          {/* Icono Pin GPS */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </button>

        {/* Botón GPS Tracking Continuo (🛰️) */}
        <button 
          onClick={() => setIsTracking(!isTracking)}
          title={isTracking ? "Desactivar GPS continuo" : "Activar GPS continuo"}
          style={{
            width: "44px", height: "44px", borderRadius: "50%", background: isTracking ? "var(--primary-color)" : "white",
            border: "1.5px solid #cbd5e1", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            color: isTracking ? "white" : "#475569", transition: "all 0.2s", position: "relative"
          }}
        >
          {/* Icono Location Arrow */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 22l10-6 10 6L12 2z" />
          </svg>
          {isTracking && (
            <span style={{
              position: "absolute", top: "2px", right: "2px", width: "10px", height: "10px", 
              borderRadius: "50%", background: "#10b981", border: "2px solid white",
              animation: "pulse 1.5s infinite"
            }} />
          )}
        </button>

        {/* Botón Centrar en mi Posición (🎯) */}
        {isTracking && userLocation && (
          <button 
            onClick={handleCenterOnUser}
            title="Centrar en mi ubicación"
            style={{
              width: "44px", height: "44px", borderRadius: "50%", background: "white",
              border: "1.5px solid #cbd5e1", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              color: "#475569"
            }}
          >
            {/* Icono Crosshair */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
            </svg>
          </button>
        )}

        {/* Selector de Tipo de Mapa Popover a la Derecha (🗺️) */}
        <div style={{ position: "relative" }}>
          <button 
            onClick={() => setShowMapTypes(!showMapTypes)}
            style={{
              width: "44px", height: "44px", borderRadius: "50%", background: "white",
              border: "1.5px solid #cbd5e1", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              color: "#475569"
            }}
            title="Cambiar capa de mapa"
          >
            {/* Icono Layers */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </button>

          {showMapTypes && (
            <div style={{
              position: "absolute", left: "52px", top: "0", background: "white",
              border: "1.5px solid #cbd5e1", borderRadius: "12px", padding: "8px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", gap: "6px",
              minWidth: "160px", zIndex: 1001
            }}>
              {[
                { value: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", label: "🌙 Modo Oscuro (Carto)" },
                { value: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", label: "Google Normal" },
                { value: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", label: "Google Satélite" },
                { value: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", label: "Google Híbrido" },
                { value: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", label: "OpenStreetMap" }
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setTileUrl(opt.value);
                    setShowMapTypes(false);
                    localStorage.setItem("map_layer", opt.value);
                    fetch("/api/users/map-state", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ mapLayer: opt.value })
                    }).catch(err => console.error("Error al guardar capa de mapa:", err));
                  }}
                  style={{
                    background: tileUrl === opt.value ? "var(--primary-color)" : "transparent",
                    color: tileUrl === opt.value ? "white" : "#111827",
                    border: "none", borderRadius: "6px", padding: "8px 12px", textAlign: "left",
                    fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", transition: "all 0.15s"
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
