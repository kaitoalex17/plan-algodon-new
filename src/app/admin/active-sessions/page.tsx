"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  lastLogin: string | null;
  lastLat: number | null;
  lastLng: number | null;
  assignedCount: number;
  auditedCount: number;
  totalActionsCount: number;
  lastAction: {
    action: string;
    timestamp: string;
    location: string | null;
    ctoNum?: string;
    municipio?: string;
    cluster?: string;
  } | null;
  status: "ONLINE" | "ACTIVE" | "INACTIVE";
  mostRecentTime: string | null;
};

export default function ActiveSessionsPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [users, setUsers] = useState<SessionUser[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ONLINE" | "ACTIVE" | "INACTIVE">("ALL");
  const [expellingId, setExpellingId] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "ADMIN") {
        router.push("/");
      } else {
        fetchSessions();
        const interval = setInterval(fetchSessions, 10000); // Refresco cada 10 segundos
        return () => clearInterval(interval);
      }
    } else if (authStatus === "unauthenticated") {
      router.push("/login");
    }
  }, [authStatus, session, router]);

  const fetchSessions = async () => {
    try {
      const res = await fetch("/api/admin/active-sessions");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setOnlineCount(data.onlineCount || 0);
        setActiveCount(data.activeCount || 0);
        setTotalCount(data.totalCount || 0);
      }
    } catch (err) {
      console.error("Error cargando sesiones activas:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleForceLogout = async (user: SessionUser) => {
    if (!confirm(`¿Expulsar inmediatamente la sesión de ${user.name} (${user.email})? Se revocará el acceso en todos sus dispositivos.`)) {
      return;
    }

    setExpellingId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}/force-logout`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(`✓ Sesión revocada para ${user.name}`);
        await fetchSessions();
      } else {
        alert(data.error || "No se pudo cerrar la sesión");
      }
    } catch (e: any) {
      alert("Error al conectar con el servidor: " + e.message);
    } finally {
      setExpellingId(null);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          u.email.toLowerCase().includes(searchTerm.toLowerCase());
    if (filterStatus === "ALL") return matchesSearch;
    return matchesSearch && u.status === filterStatus;
  });

  if (loading || authStatus === "loading") {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg-color)", color: "var(--text-color)" }}>
        <p style={{ fontWeight: 700 }}>Cargando Control de Accesos y Sesiones...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-color, #0f172a)", color: "var(--text-color, #f8fafc)", padding: "20px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        
        {/* Header y Navegación */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <Link href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--primary-color, #FF7900)", fontWeight: 700, fontSize: "0.9rem", marginBottom: "6px" }}>
              ← Volver al Panel Admin
            </Link>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 900, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🔐</span> Gestión de Accesos y Sesiones Activas
            </h1>
            <p style={{ fontSize: "0.85rem", opacity: 0.75, margin: "4px 0 0 0" }}>
              Control de horas de trabajo, último login, estado de conexión en vivo y revocación de sesiones.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Link 
              href="/admin/tech-map"
              className="btn"
              style={{
                background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                color: "white",
                padding: "8px 14px",
                fontSize: "0.85rem",
                fontWeight: 800,
                borderRadius: "8px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)"
              }}
            >
              <span>🗺️</span> Ver Mapa en Vivo de Técnicos
            </Link>
            <button
              onClick={fetchSessions}
              className="btn"
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--border-color)",
                color: "var(--text-color)",
                padding: "8px 12px",
                fontSize: "0.85rem",
                fontWeight: 700,
                borderRadius: "8px",
                cursor: "pointer"
              }}
            >
              🔄 Refrescar
            </button>
          </div>
        </div>

        {/* Tarjetas de Métricas Resumen */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "20px" }}>
          
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "16px", display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem" }}>
              🟢
            </div>
            <div>
              <span style={{ fontSize: "0.78rem", opacity: 0.75, fontWeight: 700, textTransform: "uppercase" }}>En Línea Ahora</span>
              <h3 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 900, color: "#10b981" }}>{onlineCount}</h3>
            </div>
          </div>

          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "16px", display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem" }}>
              ⚡
            </div>
            <div>
              <span style={{ fontSize: "0.78rem", opacity: 0.75, fontWeight: 700, textTransform: "uppercase" }}>Sesiones Hoy</span>
              <h3 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 900, color: "#3b82f6" }}>{activeCount}</h3>
            </div>
          </div>

          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "16px", display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: "rgba(255, 121, 0, 0.15)", color: "var(--primary-color)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem" }}>
              👥
            </div>
            <div>
              <span style={{ fontSize: "0.78rem", opacity: 0.75, fontWeight: 700, textTransform: "uppercase" }}>Usuarios Totales</span>
              <h3 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 900, color: "var(--primary-color)" }}>{totalCount}</h3>
            </div>
          </div>

        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <button
              onClick={() => setFilterStatus("ALL")}
              style={{
                padding: "6px 12px", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer",
                background: filterStatus === "ALL" ? "var(--primary-color)" : "var(--bg-color)",
                color: filterStatus === "ALL" ? "white" : "var(--text-color)"
              }}
            >
              Todos ({users.length})
            </button>
            <button
              onClick={() => setFilterStatus("ONLINE")}
              style={{
                padding: "6px 12px", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer",
                background: filterStatus === "ONLINE" ? "#10b981" : "var(--bg-color)",
                color: filterStatus === "ONLINE" ? "white" : "var(--text-color)"
              }}
            >
              En Línea ({onlineCount})
            </button>
            <button
              onClick={() => setFilterStatus("ACTIVE")}
              style={{
                padding: "6px 12px", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer",
                background: filterStatus === "ACTIVE" ? "#3b82f6" : "var(--bg-color)",
                color: filterStatus === "ACTIVE" ? "white" : "var(--text-color)"
              }}
            >
              Activos Hoy ({activeCount - onlineCount})
            </button>
            <button
              onClick={() => setFilterStatus("INACTIVE")}
              style={{
                padding: "6px 12px", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer",
                background: filterStatus === "INACTIVE" ? "#64748b" : "var(--bg-color)",
                color: filterStatus === "INACTIVE" ? "white" : "var(--text-color)"
              }}
            >
              Inactivos ({totalCount - activeCount})
            </button>
          </div>

          <input
            type="text"
            placeholder="🔍 Buscar por nombre o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-color)",
              color: "var(--text-color)",
              fontSize: "0.85rem",
              minWidth: "240px"
            }}
          />

        </div>

        {/* Listado / Tabla de Sesiones y Accesos */}
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "14px", overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-color)", borderBottom: "1.5px solid var(--border-color)", color: "var(--text-color)" }}>
                  <th style={{ padding: "12px 16px", fontWeight: 800 }}>Técnico / Usuario</th>
                  <th style={{ padding: "12px 16px", fontWeight: 800 }}>Estado Sesión</th>
                  <th style={{ padding: "12px 16px", fontWeight: 800 }}>Último Login</th>
                  <th style={{ padding: "12px 16px", fontWeight: 800 }}>Última Actividad / Registro</th>
                  <th style={{ padding: "12px 16px", fontWeight: 800, textAlign: "center" }}>Asignadas / Auditadas</th>
                  <th style={{ padding: "12px 16px", fontWeight: 800, textAlign: "right" }}>Acción de Seguridad</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "2.5rem", textAlign: "center", color: "#64748b", fontStyle: "italic" }}>
                      No se encontraron usuarios o sesiones con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u, idx) => (
                    <tr 
                      key={u.id}
                      style={{ 
                        borderBottom: "1px solid var(--border-color)",
                        background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.02)",
                        transition: "background 0.15s"
                      }}
                    >
                      {/* Usuario */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: u.color || "var(--primary-color)", border: "2px solid white", boxShadow: "0 0 0 1.5px " + (u.color || "#FF7900"), flexShrink: 0 }} />
                          <div>
                            <strong style={{ display: "block", color: "var(--text-color)", fontSize: "0.92rem" }}>
                              {u.name}
                            </strong>
                            <span style={{ fontSize: "0.76rem", opacity: 0.7 }}>
                              {u.email} · <span style={{ fontWeight: 700, color: u.role === "ADMIN" ? "var(--primary-color)" : "#64748b" }}>{u.role}</span>
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Estado de Sesión */}
                      <td style={{ padding: "12px 16px" }}>
                        {u.status === "ONLINE" && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "4px 10px", borderRadius: "20px", fontWeight: 800, fontSize: "0.78rem" }}>
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", animation: "pulse 1.5s infinite" }} />
                            En Línea
                          </span>
                        )}
                        {u.status === "ACTIVE" && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", padding: "4px 10px", borderRadius: "20px", fontWeight: 800, fontSize: "0.78rem" }}>
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6" }} />
                            Sesión Hoy
                          </span>
                        )}
                        {u.status === "INACTIVE" && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(100, 116, 139, 0.15)", color: "#64748b", padding: "4px 10px", borderRadius: "20px", fontWeight: 700, fontSize: "0.78rem" }}>
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#64748b" }} />
                            Inactivo
                          </span>
                        )}
                      </td>

                      {/* Último Login */}
                      <td style={{ padding: "12px 16px" }}>
                        {u.lastLogin ? (
                          <div>
                            <span style={{ fontWeight: 700, color: "var(--text-color)", display: "block" }}>
                              {new Date(u.lastLogin).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })}
                            </span>
                            <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                              🕒 {new Date(u.lastLogin).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.78rem", color: "#9ca3af", fontStyle: "italic" }}>
                            Nunca conectado
                          </span>
                        )}
                      </td>

                      {/* Última Actividad en Campo */}
                      <td style={{ padding: "12px 16px" }}>
                        {u.lastAction ? (
                          <div>
                            <span style={{ fontWeight: 700, color: "var(--text-color)", display: "block", fontSize: "0.84rem" }}>
                              {u.lastAction.action}
                            </span>
                            <span style={{ fontSize: "0.75rem", opacity: 0.75 }}>
                              {u.lastAction.ctoNum ? `CTO: ${u.lastAction.ctoNum} · ` : ""}
                              {new Date(u.lastAction.timestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.78rem", color: "#9ca3af", fontStyle: "italic" }}>
                            Sin acciones registradas
                          </span>
                        )}
                      </td>

                      {/* Asignadas / Auditadas */}
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <div style={{ display: "inline-flex", gap: "8px", fontSize: "0.82rem", fontWeight: 700 }}>
                          <span style={{ color: "#3b82f6" }} title="CTOs Asignadas">{u.assignedCount} Asig.</span>
                          <span>·</span>
                          <span style={{ color: "#10b981" }} title="CTOs Auditadas">{u.auditedCount} Aud.</span>
                        </div>
                      </td>

                      {/* Botón Expulsar */}
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => handleForceLogout(u)}
                          disabled={expellingId === u.id}
                          title="Cerrar sesión activa de este usuario en todos sus dispositivos"
                          style={{
                            padding: "6px 12px",
                            borderRadius: "8px",
                            background: "rgba(239, 68, 68, 0.1)",
                            color: "#ef4444",
                            border: "1.5px solid #ef4444",
                            fontWeight: 800,
                            fontSize: "0.78rem",
                            cursor: expellingId === u.id ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            transition: "all 0.15s"
                          }}
                        >
                          <span>🚫</span>
                          {expellingId === u.id ? "Expulsando..." : "Cerrar Sesión"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
