"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { TechLocationItem } from "@/components/TechMapLeaflet";

// Cargar el mapa de Leaflet sin SSR para evitar problemas de renderizado
const TechMapLeaflet = dynamic(() => import("@/components/TechMapLeaflet"), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, height: "100%", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--card-bg, #1e293b)", gap: "10px" }}>
      <div style={{ fontSize: "2rem" }}>🗺️</div>
      <p style={{ color: "#94a3b8", fontWeight: 700, fontSize: "0.95rem" }}>Cargando mapa de técnicos en vivo...</p>
    </div>
  )
});

export default function TechMapPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [techs, setTechs] = useState<TechLocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTech, setSelectedTech] = useState<TechLocationItem | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  useEffect(() => {
    if (authStatus === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "ADMIN") {
        router.push("/");
      } else {
        loadData();
        const interval = setInterval(loadData, 10000); // Refresco cada 10s
        return () => clearInterval(interval);
      }
    } else if (authStatus === "unauthenticated") {
      router.push("/login");
    }
  }, [authStatus, session, router]);

  const loadData = async () => {
    try {
      const res = await fetch("/api/tech-locations");
      if (res.ok) {
        const data = await res.json();
        setTechs(data);
        setLastRefreshed(new Date());
      }
    } catch (e) {
      console.error("Error al cargar ubicaciones de técnicos:", e);
    } finally {
      setLoading(false);
    }
  };

  const centerOnTech = (t: TechLocationItem) => {
    setSelectedTech(t);
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
      <div style={{ display: "flex", flex: 1, position: "relative", height: "calc(100vh - 75px)", overflow: "hidden" }}>
        
        {/* Mapa Leaflet Seguro */}
        <div style={{ flex: 1, height: "100%", position: "relative" }}>
          <TechMapLeaflet
            techs={techs}
            selectedTech={selectedTech}
            onSelectTech={centerOnTech}
          />
        </div>

        {/* Panel Lateral de Técnicos */}
        <div style={{
          width: "350px",
          background: "var(--card-bg, #1e293b)",
          borderLeft: "1px solid var(--border-color, #334155)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          zIndex: 2,
          boxShadow: "-4px 0 16px rgba(0,0,0,0.15)"
        }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-color)" }}>
            <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800 }}>Técnicos Registrados ({techs.length})</h3>
            <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Haz clic para enfocar la posición en el mapa</span>
          </div>

          <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {techs.map(t => {
              const isSelected = selectedTech?.userId === t.userId;
              const dateStr = t.updatedAt
                ? new Date(t.updatedAt).toLocaleString("es-ES", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit"
                  })
                : "Sin registro";

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
                    width: "38px",
                    height: "38px",
                    borderRadius: "50%",
                    background: t.color || "#FF7900",
                    border: "2.5px solid white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontWeight: 900,
                    fontSize: "0.9rem",
                    flexShrink: 0,
                    boxShadow: "0 2px 6px rgba(0,0,0,0.25)"
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
                        padding: "2px 7px",
                        borderRadius: "10px",
                        fontWeight: 800,
                        background: t.isLive ? "rgba(16, 185, 129, 0.2)" : "rgba(100, 116, 139, 0.2)",
                        color: t.isLive ? "#10b981" : "#94a3b8"
                      }}>
                        {t.isLive ? "EN VIVO" : "OFFLINE"}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.72rem", opacity: 0.75, marginTop: "2px" }}>
                      {t.hasGps ? `GPS: ${t.lat.toFixed(4)}, ${t.lng.toFixed(4)}` : "Sin coordenadas fijadas"}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "3px" }}>
                      <span style={{ fontSize: "0.7rem", opacity: 0.8, color: "var(--primary-color)", fontWeight: 700 }}>
                        🕒 {dateStr}
                      </span>
                      {t.lastAction && (
                        <span style={{ fontSize: "0.65rem", opacity: 0.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "120px" }} title={t.lastAction}>
                          📌 {t.lastAction}
                        </span>
                      )}
                    </div>
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
