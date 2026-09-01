"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type TechLocation = {
  userId: string;
  name: string;
  email: string;
  color: string;
  role: string;
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt: number;
  lastAction?: string;
};

export default function TechMapPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [techs, setTechs] = useState<TechLocation[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTech, setSelectedTech] = useState<TechLocation | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const mapRef = useRef<any>(null);
  const markersRef = useRef<{ [key: string]: any }>({});
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authStatus === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "ADMIN") {
        router.push("/");
      } else {
        loadData();
        const interval = setInterval(loadData, 10000); // 10 segundos
        return () => clearInterval(interval);
      }
    } else if (authStatus === "unauthenticated") {
      router.push("/login");
    }
  }, [authStatus, session, router]);

  const loadData = async () => {
    try {
      const [resLocs, resUsers] = await Promise.all([
        fetch("/api/tech-locations"),
        fetch("/api/users")
      ]);

      let locList: TechLocation[] = [];
      let userList: any[] = [];

      if (resLocs.ok) locList = await resLocs.json();
      if (resUsers.ok) userList = await resUsers.json();

      // Combinar los datos de usuarios con coordenadas fijas si no tienen posición viva
      const combinedTechs: TechLocation[] = userList
        .filter(u => u.role !== "ADMIN" || locList.some(l => l.userId === u.id))
        .map(u => {
          const live = locList.find(l => l.userId === u.id);
          if (live) return live;
          return {
            userId: u.id,
            name: u.name || u.email.split("@")[0],
            email: u.email,
            color: u.color || "#FF7900",
            role: u.role,
            lat: u.lastLat || 28.1248, // Coordenadas canarias / por defecto
            lng: u.lastLng || -15.4300,
            updatedAt: u.lastLogin ? new Date(u.lastLogin).getTime() : 0,
            hasLive: false,
          } as any;
        });

      setTechs(combinedTechs);
      setUsers(userList);
      setLastRefreshed(new Date());
    } catch (e) {
      console.error("Error al cargar ubicaciones de técnicos:", e);
    } finally {
      setLoading(false);
    }
  };

  // Inicializar Leaflet dinámicamente en el cliente
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let mapInstance: any;

    const initMap = async () => {
      const L = (await import("leaflet")).default;
      require("leaflet/dist/leaflet.css");

      if (mapRef.current) return;

      mapInstance = L.map(mapContainerRef.current, {
        center: [28.1248, -15.4300],
        zoom: 11,
        zoomControl: true
      });

      // Capa de mapa clara / Google Hybrid o CartoDB Positron
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap contributors, CartoDB",
        maxZoom: 19
      }).addTo(mapInstance);

      mapRef.current = mapInstance;
    };

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Actualizar marcadores en el mapa cuando cambien los datos de técnicos
  useEffect(() => {
    if (!mapRef.current || techs.length === 0) return;

    const renderMarkers = async () => {
      const L = (await import("leaflet")).default;

      // Limpiar marcadores antiguos
      Object.values(markersRef.current).forEach((m: any) => m.remove());
      markersRef.current = {};

      const bounds: [number, number][] = [];

      techs.forEach(t => {
        if (!t.lat || !t.lng) return;

        const isLive = t.updatedAt && (Date.now() - t.updatedAt < 30 * 60 * 1000);
        const minutesAgo = t.updatedAt ? Math.round((Date.now() - t.updatedAt) / 60000) : 999;
        
        // Icono personalizado con color del técnico y pulso si está activo
        const customIcon = L.divIcon({
          className: "custom-tech-marker",
          html: `
            <div style="
              position: relative;
              width: 38px;
              height: 38px;
              border-radius: 50%;
              background: ${t.color || "#FF7900"};
              border: 3px solid white;
              box-shadow: 0 4px 10px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: 800;
              font-size: 14px;
            ">
              ${t.name.charAt(0).toUpperCase()}
              ${isLive ? `<div style="
                position: absolute;
                top: -4px;
                right: -4px;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #10b981;
                border: 2px solid white;
              "></div>` : ''}
            </div>
          `,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
          popupAnchor: [0, -20]
        });

        const marker = L.marker([t.lat, t.lng], { icon: customIcon }).addTo(mapRef.current);
        
        marker.bindPopup(`
          <div style="font-family: system-ui; min-width: 180px; padding: 4px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span style="width: 12px; height: 12px; border-radius: 50%; background: ${t.color};"></span>
              <strong style="font-size: 14px;">${t.name}</strong>
            </div>
            <p style="margin: 2px 0; font-size: 12px; color: #64748b;">${t.email}</p>
            <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: 700; color: ${isLive ? '#10b981' : '#64748b'};">
              ${isLive ? `🟢 En Vivo (hace ${minutesAgo} min)` : `⚪ Última posición registrada`}
            </p>
            <div style="margin-top: 6px; font-size: 11px; opacity: 0.8;">
              Lat: ${t.lat.toFixed(5)}<br/>Lng: ${t.lng.toFixed(5)}
            </div>
          </div>
        `);

        marker.on("click", () => setSelectedTech(t));
        markersRef.current[t.userId] = marker;
        bounds.push([t.lat, t.lng]);
      });

      if (bounds.length > 0 && !selectedTech) {
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    };

    renderMarkers();
  }, [techs]);

  const centerOnTech = (t: TechLocation) => {
    setSelectedTech(t);
    if (mapRef.current && t.lat && t.lng) {
      mapRef.current.setView([t.lat, t.lng], 16, { animate: true });
      const m = markersRef.current[t.userId];
      if (m) m.openPopup();
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-color, #0f172a)", color: "var(--text-color, #f8fafc)", display: "flex", flexDirection: "column" }}>
      
      {/* Barra Superior */}
      <div style={{ padding: "12px 20px", background: "var(--card-bg, #1e293b)", borderBottom: "1px solid var(--border-color, #334155)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", zIndex: 10 }}>
        <div>
          <Link href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--primary-color, #FF7900)", fontWeight: 700, fontSize: "0.85rem", marginBottom: "2px" }}>
            ← Volver al Panel Admin
          </Link>
          <h1 style={{ fontSize: "1.35rem", fontWeight: 900, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🗺️</span> Última Ubicación de los Técnicos (Control de Campo)
          </h1>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ fontSize: "0.78rem", opacity: 0.75 }}>
            Último refresco: {lastRefreshed.toLocaleTimeString("es-ES")}
          </span>
          <Link 
            href="/admin/active-sessions"
            className="btn"
            style={{
              background: "rgba(255, 121, 0, 0.15)",
              color: "var(--primary-color)",
              border: "1.5px solid var(--primary-color)",
              padding: "6px 12px",
              fontSize: "0.82rem",
              fontWeight: 800,
              borderRadius: "8px",
            }}
          >
            🔐 Control de Sesiones
          </Link>
          <button
            onClick={loadData}
            style={{
              background: "var(--primary-color, #FF7900)",
              color: "white",
              border: "none",
              padding: "6px 14px",
              fontSize: "0.82rem",
              fontWeight: 800,
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* Contenido Principal: Mapa + Barra lateral */}
      <div style={{ display: "flex", flex: 1, position: "relative", height: "calc(100vh - 75px)" }}>
        
        {/* Mapa Leaflet */}
        <div ref={mapContainerRef} style={{ flex: 1, height: "100%", width: "100%", zIndex: 1 }} />

        {/* Panel Lateral de Técnicos */}
        <div style={{
          width: "340px",
          background: "var(--card-bg, #1e293b)",
          borderLeft: "1px solid var(--border-color, #334155)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          zIndex: 2,
          boxShadow: "-4px 0 16px rgba(0,0,0,0.15)"
        }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-color)" }}>
            <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800 }}>Técnicos Monitoreados ({techs.length})</h3>
            <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Haz clic para enfocar la posición en el mapa</span>
          </div>

          <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {techs.map(t => {
              const isLive = t.updatedAt && (Date.now() - t.updatedAt < 30 * 60 * 1000);
              const isSelected = selectedTech?.userId === t.userId;

              return (
                <div
                  key={t.userId}
                  onClick={() => centerOnTech(t)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "10px",
                    background: isSelected ? "rgba(255, 121, 0, 0.15)" : "rgba(255,255,255,0.03)",
                    border: isSelected ? "1.5px solid var(--primary-color)" : "1px solid var(--border-color, #334155)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    transition: "all 0.15s"
                  }}
                >
                  <div style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: t.color || "#FF7900",
                    border: "2px solid white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontWeight: 800,
                    fontSize: "0.85rem",
                    flexShrink: 0
                  }}>
                    {t.name.charAt(0).toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "0.88rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.name}
                      </strong>
                      <span style={{
                        fontSize: "0.68rem",
                        padding: "2px 6px",
                        borderRadius: "10px",
                        fontWeight: 800,
                        background: isLive ? "rgba(16, 185, 129, 0.2)" : "rgba(100, 116, 139, 0.2)",
                        color: isLive ? "#10b981" : "#94a3b8"
                      }}>
                        {isLive ? "EN VIVO" : "OFFLINE"}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.72rem", opacity: 0.75, marginTop: "2px" }}>
                      {t.lat ? `GPS: ${t.lat.toFixed(4)}, ${t.lng.toFixed(4)}` : "Sin coordenadas registradas"}
                    </div>

                    {t.updatedAt > 0 && (
                      <div style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: "2px" }}>
                        🕒 {new Date(t.updatedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
