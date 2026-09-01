"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from "react-leaflet";
import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";

export type TechLocationItem = {
  userId: string;
  name: string;
  email: string;
  color: string;
  role: string;
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt: number;
  updatedAtIso?: string;
  lastAction?: string;
  isLive?: boolean;
  hasGps?: boolean;
};

// Controlador interno de Leaflet para invalidar tamaño y enfocar técnicos
function MapController({
  techs,
  selectedTech
}: {
  techs: TechLocationItem[];
  selectedTech: TechLocationItem | null;
}) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  // Invalidar tamaño inmediatamente y en intervalos para que Leaflet dibuje baldosas sin quedarse gris
  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 600);
    const handleResize = () => map.invalidateSize();
    window.addEventListener("resize", handleResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", handleResize);
    };
  }, [map]);

  // Centrar con animación suave en el técnico seleccionado
  useEffect(() => {
    if (selectedTech && typeof selectedTech.lat === "number" && typeof selectedTech.lng === "number") {
      try {
        map.flyTo([selectedTech.lat, selectedTech.lng], 16, { animate: true, duration: 1.2 });
      } catch (e) {}
    }
  }, [selectedTech, map]);

  // Auto-encuadre inicial de todos los técnicos con posición registrada
  useEffect(() => {
    if (!hasFittedRef.current && techs && techs.length > 0 && !selectedTech) {
      const validPoints = techs
        .filter(t => t.hasGps && typeof t.lat === "number" && typeof t.lng === "number")
        .map(t => [t.lat, t.lng] as [number, number]);

      if (validPoints.length === 1) {
        map.setView(validPoints[0], 15);
        hasFittedRef.current = true;
      } else if (validPoints.length > 1) {
        try {
          map.fitBounds(validPoints, { padding: [50, 50], maxZoom: 15 });
          hasFittedRef.current = true;
        } catch (e) {}
      }
    }
  }, [techs, selectedTech, map]);

  return null;
}

export default function TechMapLeaflet({
  techs,
  selectedTech,
  onSelectTech
}: {
  techs: TechLocationItem[];
  selectedTech: TechLocationItem | null;
  onSelectTech: (t: TechLocationItem) => void;
}) {
  // Capa por defecto: Google Maps Calles
  const [tileLayerUrl, setTileLayerUrl] = useState("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}");

  // Coordenadas por defecto (Costa del Sol) o primer técnico con GPS
  const firstWithGps = useMemo(() => {
    return techs.find(t => t.hasGps && typeof t.lat === "number" && typeof t.lng === "number");
  }, [techs]);

  const initialCenter: [number, number] = useMemo(() => {
    return firstWithGps ? [firstWithGps.lat, firstWithGps.lng] : [36.516, -4.885];
  }, [firstWithGps]);

  // Filtrar técnicos con GPS válido
  const validTechs = useMemo(() => {
    return techs.filter(t => t.hasGps && typeof t.lat === "number" && typeof t.lng === "number");
  }, [techs]);

  // Helper para generar icono de técnico con avatar e indicador de estado
  const createTechIcon = (t: TechLocationItem) => {
    const isLive = t.isLive;
    const initial = (t.name || "T").trim().charAt(0).toUpperCase() || "T";
    const color = t.color || "#FF7900";

    const pulseHtml = isLive
      ? `<div style="position:absolute; width:44px; height:44px; border-radius:50%; background:${color}; opacity:0.35; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
      : "";

    return L.divIcon({
      className: "tech-map-pin",
      html: `
        <div style="position:relative; width:44px; height:44px; display:flex; align-items:center; justify-content:center;">
          ${pulseHtml}
          <div style="
            position: relative;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: ${color};
            border: 3px solid white;
            box-shadow: 0 3px 10px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 900;
            font-size: 14px;
            font-family: sans-serif;
            z-index: 2;
          ">
            ${initial}
          </div>
          ${isLive ? `<div style="position:absolute; bottom:2px; right:2px; width:10px; height:10px; border-radius:50%; background:#10b981; border:2px solid white; z-index:3;"></div>` : ""}
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -22]
    });
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: "500px", overflow: "hidden" }}>
      
      {/* Selector flotante de capas de mapa */}
      <div style={{
        position: "absolute",
        top: "12px",
        right: "12px",
        zIndex: 1000,
        background: "rgba(15, 23, 42, 0.88)",
        backdropFilter: "blur(6px)",
        padding: "4px",
        borderRadius: "8px",
        display: "flex",
        gap: "4px",
        border: "1px solid rgba(255,255,255,0.15)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
      }}>
        <button
          type="button"
          onClick={() => setTileLayerUrl("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}")}
          style={{
            background: tileLayerUrl.includes("lyrs=m") ? "var(--primary-color, #FF7900)" : "transparent",
            color: "white",
            border: "none",
            borderRadius: "6px",
            padding: "4px 8px",
            fontSize: "0.72rem",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Google Calles
        </button>
        <button
          type="button"
          onClick={() => setTileLayerUrl("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}")}
          style={{
            background: tileLayerUrl.includes("lyrs=y") ? "var(--primary-color, #FF7900)" : "transparent",
            color: "white",
            border: "none",
            borderRadius: "6px",
            padding: "4px 8px",
            fontSize: "0.72rem",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Satélite Híbrido
        </button>
        <button
          type="button"
          onClick={() => setTileLayerUrl("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}")}
          style={{
            background: tileLayerUrl.includes("arcgisonline.com") ? "var(--primary-color, #FF7900)" : "transparent",
            color: "white",
            border: "none",
            borderRadius: "6px",
            padding: "4px 8px",
            fontSize: "0.72rem",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Modo Oscuro
        </button>
        <button
          type="button"
          onClick={() => setTileLayerUrl("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")}
          style={{
            background: tileLayerUrl.includes("openstreetmap") ? "var(--primary-color, #FF7900)" : "transparent",
            color: "white",
            border: "none",
            borderRadius: "6px",
            padding: "4px 8px",
            fontSize: "0.72rem",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          OpenStreetMap
        </button>
      </div>

      <MapContainer
        center={initialCenter}
        zoom={12}
        style={{ width: "100%", height: "100%", minHeight: "500px" }}
        preferCanvas={true}
        zoomControl={true}
      >
        <TileLayer
          url={tileLayerUrl}
          attribution="&copy; Google Maps / OpenStreetMap"
          maxZoom={20}
        />

        <MapController techs={techs} selectedTech={selectedTech} />

        {/* 1. Círculos de radio de precisión de técnicos en vivo (elementos directos de Leaflet) */}
        {validTechs.filter(t => t.isLive).map(t => (
          <Circle
            key={`circle-${t.userId}`}
            center={[t.lat, t.lng]}
            radius={t.accuracy || 25}
            pathOptions={{
              fillColor: t.color || "#FF7900",
              fillOpacity: 0.15,
              color: t.color || "#FF7900",
              weight: 1.5
            }}
          />
        ))}

        {/* 2. Marcadores interactivos de cada técnico con popup (elementos directos de Leaflet) */}
        {validTechs.map(t => {
          const dateStr = t.updatedAt
            ? new Date(t.updatedAt).toLocaleString("es-ES", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })
            : "No registrada";

          return (
            <Marker
              key={`marker-${t.userId}`}
              position={[t.lat, t.lng]}
              icon={createTechIcon(t)}
              eventHandlers={{
                click: () => onSelectTech(t)
              }}
            >
              <Popup>
                <div style={{ minWidth: "220px", padding: "4px", color: "#1e293b", fontFamily: "sans-serif" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: t.color || "#FF7900" }} />
                    <strong style={{ fontSize: "14px" }}>{t.name}</strong>
                  </div>

                  <p style={{ margin: "2px 0", fontSize: "11px", color: "#64748b" }}>{t.email}</p>

                  <div style={{ margin: "6px 0", padding: "6px 8px", borderRadius: "6px", background: t.isLive ? "rgba(16, 185, 129, 0.1)" : "rgba(100, 116, 139, 0.1)" }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: t.isLive ? "#059669" : "#475569" }}>
                      {t.isLive ? "🟢 EN VIVO (Conectado)" : "⚪ Última ubicación registrada"}
                    </span>
                    <div style={{ fontSize: "11px", marginTop: "2px", color: "#334155" }}>
                      🕒 <strong>{dateStr}</strong>
                    </div>
                    {t.lastAction && (
                      <div style={{ fontSize: "10px", marginTop: "2px", opacity: 0.85, color: "#64748b" }}>
                        📌 {t.lastAction}
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: "11px", background: "#f8fafc", padding: "4px 6px", borderRadius: "4px", border: "1px solid #e2e8f0", marginBottom: "8px" }}>
                    GPS: <code>{t.lat.toFixed(5)}, {t.lng.toFixed(5)}</code>
                  </div>

                  <a
                    href={`https://www.google.com/maps?q=${t.lat},${t.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "block",
                      textAlign: "center",
                      background: "var(--primary-color, #FF7900)",
                      color: "white",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: 800,
                      textDecoration: "none"
                    }}
                  >
                    Abrir en Google Maps ↗
                  </a>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
