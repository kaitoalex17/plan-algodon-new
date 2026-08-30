"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function TechniciansSyncPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [techLocations, setTechLocations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");

  useEffect(() => {
    if (authStatus === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "ADMIN") {
        router.push("/");
      } else {
        loadData();
        const interval = setInterval(loadData, 6000);
        return () => clearInterval(interval);
      }
    } else if (authStatus === "unauthenticated") {
      router.push("/login");
    }
  }, [authStatus, session, router]);

  const loadData = async () => {
    try {
      const [resTechs, resUsers] = await Promise.all([
        fetch("/api/tech-locations"),
        fetch("/api/users")
      ]);

      if (resTechs.ok) setTechLocations(await resTechs.json());
      if (resUsers.ok) setUsers(await resUsers.json());
    } catch (e) {
      console.error("Error al cargar datos de sincronización:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleForceBroadcast = async () => {
    setBroadcasting(true);
    setBroadcastMessage("");
    try {
      const res = await fetch("/api/realtime", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setBroadcastMessage("¡Comando enviado! Todos los dispositivos de técnicos actualizarán su mapa de inmediato.");
        await loadData();
      } else {
        alert("Error al enviar comando: " + (data.error || "Desconocido"));
      }
    } catch (err: any) {
      alert("Error de conexión: " + err.message);
    } finally {
      setBroadcasting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-color, #0f172a)", color: "var(--text-color, #f8fafc)", padding: "20px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        
        {/* Cabecera y Navegación */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <Link href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--primary-color, #FF7900)", fontWeight: 700, fontSize: "0.9rem", marginBottom: "6px" }}>
              ← Volver al Panel Admin
            </Link>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 900, margin: 0 }}>
              📡 Control de Sincronización y Técnicos en Vivo
            </h1>
            <p style={{ fontSize: "0.85rem", opacity: 0.75, margin: "4px 0 0 0" }}>
              Monitorea cuándo fue la última vez que cada técnico refrescó datos y fuerza actualizaciones globales.
            </p>
          </div>

          {/* Botón Maestro de Forzar Sincronización */}
          <button
            type="button"
            onClick={handleForceBroadcast}
            disabled={broadcasting}
            style={{
              background: "linear-gradient(135deg, #FF7900 0%, #ea580c 100%)",
              color: "white",
              border: "none",
              borderRadius: "10px",
              padding: "12px 20px",
              fontSize: "0.95rem",
              fontWeight: 800,
              cursor: broadcasting ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 4px 14px rgba(255, 121, 0, 0.4)",
              opacity: broadcasting ? 0.7 : 1
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>{broadcasting ? "Enviando comando..." : "Forzar Sincronización a Todos"}</span>
          </button>
        </div>

        {broadcastMessage && (
          <div style={{ background: "rgba(16, 185, 129, 0.15)", border: "1.5px solid #10b981", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px", color: "#10b981", fontWeight: 700, fontSize: "0.9rem" }}>
            ✓ {broadcastMessage}
          </div>
        )}

        {/* Resumen de Técnicos Activos */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "24px" }}>
          <div style={{ background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color, #334155)", borderRadius: "12px", padding: "16px" }}>
            <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Técnicos Registrados</span>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "var(--primary-color, #FF7900)" }}>{users.length}</div>
          </div>
          <div style={{ background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color, #334155)", borderRadius: "12px", padding: "16px" }}>
            <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Técnicos con GPS Activo en Línea</span>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#10b981" }}>{techLocations.length}</div>
          </div>
        </div>

        {/* Tabla de Técnicos y Última Sincronización */}
        <div style={{ background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color, #334155)", borderRadius: "14px", overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color, #334155)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0 }}>
              Estado de Dispositivos y Técnicos
            </h2>
            <button onClick={loadData} style={{ background: "var(--bg-color)", border: "1px solid var(--border-color)", color: "var(--text-color)", padding: "6px 12px", borderRadius: "8px", fontSize: "0.8rem", cursor: "pointer", fontWeight: 700 }}>
              🔄 Recargar
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-color, #0f172a)", borderBottom: "1px solid var(--border-color, #334155)", color: "var(--text-color)", opacity: 0.8 }}>
                  <th style={{ padding: "12px 16px" }}>Técnico / Usuario</th>
                  <th style={{ padding: "12px 16px" }}>Rol</th>
                  <th style={{ padding: "12px 16px" }}>Último Acceso / Refresco</th>
                  <th style={{ padding: "12px 16px" }}>Posición GPS en Vivo</th>
                  <th style={{ padding: "12px 16px" }}>Estado de Conexión</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const liveLoc = techLocations.find((t) => t.userId === u.id);
                  const isOnline = !!liveLoc && (Date.now() - liveLoc.updatedAt < 5 * 60 * 1000);
                  const lastSeenDate = u.lastLogin ? new Date(u.lastLogin).toLocaleString() : "Nunca";

                  return (
                    <tr key={u.id} style={{ borderBottom: "1px solid var(--border-color, #334155)" }}>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ width: "14px", height: "14px", borderRadius: "50%", background: u.color || "#FF7900" }} />
                          <div>
                            <div style={{ fontWeight: 800 }}>{u.name || "Sin nombre"}</div>
                            <div style={{ fontSize: "0.75rem", opacity: 0.65 }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 800, padding: "2px 8px", borderRadius: "8px", background: u.role === "ADMIN" ? "rgba(255, 121, 0, 0.15)" : "rgba(100, 116, 139, 0.2)", color: u.role === "ADMIN" ? "#FF7900" : "inherit" }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ fontSize: "0.82rem", opacity: 0.9 }}>{lastSeenDate}</span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        {liveLoc ? (
                          <div style={{ fontSize: "0.8rem", color: "#38bdf8" }}>
                            Lat: {liveLoc.lat.toFixed(5)}, Lng: {liveLoc.lng.toFixed(5)}
                            {liveLoc.accuracy ? <span style={{ opacity: 0.7 }}> (±{Math.round(liveLoc.accuracy)}m)</span> : null}
                          </div>
                        ) : u.lastLat && u.lastLng ? (
                          <div style={{ fontSize: "0.8rem", opacity: 0.6 }}>
                            Lat: {u.lastLat.toFixed(5)}, Lng: {u.lastLng.toFixed(5)} (Guardado)
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.78rem", opacity: 0.5 }}>Sin coordenadas</span>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        {isOnline ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#10b981", fontWeight: 800, fontSize: "0.78rem", background: "rgba(16, 185, 129, 0.15)", padding: "3px 8px", borderRadius: "12px" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
                            En Línea
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.78rem", opacity: 0.5 }}>
                            Inactivo
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
