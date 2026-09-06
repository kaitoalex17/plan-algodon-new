"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

export default function GestionDashboard() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [stats, setStats] = useState({
    usersCount: 0,
    ctosCount: 0,
    programadasCount: 0,
    auditoriaCount: 0,
    ctosAuditadas: 0,
    ctosPendientes: 0
  });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (authStatus === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "GESTOR" && role !== "ADMIN") {
        router.push("/");
      } else {
        fetchStats();
      }
    } else if (authStatus === "unauthenticated") {
      router.push("/login");
    }
  }, [authStatus, session, router]);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/admin/summary");
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error("Error cargando estadísticas de gestor:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  if (authStatus === "loading" || loadingStats) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "white" }}>
        <p style={{ fontWeight: 700 }}>Cargando Panel de Gestión...</p>
      </div>
    );
  }

  const user = session?.user as any;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f172a",
      color: "white",
      fontFamily: "system-ui, sans-serif",
      padding: "2rem 1.5rem"
    }}>
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        
        {/* Cabecera / Perfil */}
        <header style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2.5rem",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: "16px",
          padding: "1.25rem 2rem",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: user?.color || "#f97316",
              border: "3px solid #334155",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.2rem",
              fontWeight: 800,
              color: "white"
            }}>
              {user?.name ? user.name.slice(0, 2).toUpperCase() : "G"}
            </div>
            <div>
              <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>
                {user?.name || "Gestor de Auditoría"}
              </h1>
              <span style={{
                fontSize: "0.75rem",
                color: "#10b981",
                background: "rgba(16, 185, 129, 0.15)",
                padding: "2px 8px",
                borderRadius: "10px",
                fontWeight: 700,
                display: "inline-block",
                marginTop: "4px"
              }}>
                💼 ROL: GESTOR
              </span>
            </div>
          </div>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="btn"
            style={{
              background: "rgba(239, 68, 68, 0.15)",
              color: "#ef4444",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              fontWeight: 700,
              padding: "8px 16px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.85rem",
              transition: "background 0.2s"
            }}
          >
            Cerrar Sesión
          </button>
        </header>

        {/* Sección: Resumen de CTOs */}
        <h2 style={{ fontSize: "1rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "1rem", fontWeight: 700 }}>
          📊 Estado del Proyecto (Auditoría)
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1.25rem",
          marginBottom: "2.5rem"
        }}>
          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "16px", padding: "1.5rem", textAlign: "center" }}>
            <h3 style={{ color: "#94a3b8", fontSize: "0.82rem", textTransform: "uppercase", margin: "0 0 0.5rem 0" }}>CTOs Totales</h3>
            <p style={{ fontSize: "2.25rem", fontWeight: 800, color: "#f97316", margin: 0 }}>{stats.ctosCount}</p>
          </div>

          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "16px", padding: "1.5rem", textAlign: "center" }}>
            <h3 style={{ color: "#94a3b8", fontSize: "0.82rem", textTransform: "uppercase", margin: "0 0 0.5rem 0" }}>CTOs Auditadas</h3>
            <p style={{ fontSize: "2.25rem", fontWeight: 800, color: "#10b981", margin: 0 }}>{stats.ctosAuditadas}</p>
            <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Correcto / Fallo</span>
          </div>

          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "16px", padding: "1.5rem", textAlign: "center" }}>
            <h3 style={{ color: "#94a3b8", fontSize: "0.82rem", textTransform: "uppercase", margin: "0 0 0.5rem 0" }}>CTOs Pendientes</h3>
            <p style={{ fontSize: "2.25rem", fontWeight: 800, color: "#3b82f6", margin: 0 }}>{stats.ctosPendientes}</p>
            <span style={{ fontSize: "0.72rem", color: "#64748b" }}>Pendientes de auditar</span>
          </div>

          <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "16px", padding: "1.5rem", textAlign: "center" }}>
            <h3 style={{ color: "#94a3b8", fontSize: "0.82rem", textTransform: "uppercase", margin: "0 0 0.5rem 0" }}>Auditores Activos</h3>
            <p style={{ fontSize: "2.25rem", fontWeight: 800, color: "#8b5cf6", margin: 0 }}>{stats.usersCount}</p>
          </div>
        </div>

        {/* Sección: Herramientas de Gestión */}
        <h2 style={{ fontSize: "1rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "1rem", fontWeight: 700 }}>
          🛠️ Acciones de Gestión Permitidas
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1.5rem"
        }}>
          {/* Card 1: Evidencias */}
          <Link href="/admin/evidencia" style={{ textDecoration: "none" }}>
            <div style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "16px",
              padding: "2rem",
              cursor: "pointer",
              transition: "transform 0.2s, background 0.2s, border-color 0.2s",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.background = "#243249";
              e.currentTarget.style.borderColor = "#f97316";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.background = "#1e293b";
              e.currentTarget.style.borderColor = "#334155";
            }}
            >
              <div style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: "rgba(249, 115, 22, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#f97316"
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <h3 style={{ margin: "0.25rem 0 0 0", fontSize: "1.2rem", fontWeight: 800, color: "white" }}>
                Gestión de Evidencias
              </h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8", lineHeight: "1.4" }}>
                Visualiza, rota, renombra y borra fotos asociadas a cada CTO. Permite descargar cada carpeta completa de CTO en un archivo ZIP.
              </p>
            </div>
          </Link>

          {/* Card 2: Reporte Diario */}
          <Link href="/admin/daily-summary" style={{ textDecoration: "none" }}>
            <div style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "16px",
              padding: "2rem",
              cursor: "pointer",
              transition: "transform 0.2s, background 0.2s, border-color 0.2s",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.background = "#243249";
              e.currentTarget.style.borderColor = "#10b981";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.background = "#1e293b";
              e.currentTarget.style.borderColor = "#334155";
            }}
            >
              <div style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: "rgba(16, 185, 129, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#10b981"
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <h3 style={{ margin: "0.25rem 0 0 0", fontSize: "1.2rem", fontWeight: 800, color: "white" }}>
                Resumen Diario de Auditoría
              </h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8", lineHeight: "1.4" }}>
                Accede a la vista diaria simplificada, consulta qué CTOs fueron auditadas hoy por cada técnico, ve los mapas OpenStreetMap y descarga informes en PDF o Excel.
              </p>
            </div>
          </Link>

          {/* Card 3: Reporte por Período */}
          <Link href="/admin/period-summary" style={{ textDecoration: "none" }}>
            <div style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "16px",
              padding: "2rem",
              cursor: "pointer",
              transition: "transform 0.2s, background 0.2s, border-color 0.2s",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.background = "#243249";
              e.currentTarget.style.borderColor = "#38bdf8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.background = "#1e293b";
              e.currentTarget.style.borderColor = "#334155";
            }}
            >
              <div style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: "rgba(56, 189, 248, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#38bdf8"
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <h3 style={{ margin: "0.25rem 0 0 0", fontSize: "1.2rem", fontWeight: 800, color: "white" }}>
                Informe por Período de Auditoría
              </h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8", lineHeight: "1.4" }}>
                Filtra por rango de fechas (semanal, quincenal, mensual), consulta auditorías históricas y descarga informes consolidados en PDF o Excel con fecha.
              </p>
            </div>
          </Link>

          {/* Card 4: Control de Cierres Cruzados */}
          <Link href="/admin/cross-audits" style={{ textDecoration: "none" }}>
            <div style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "16px",
              padding: "2rem",
              cursor: "pointer",
              transition: "transform 0.2s, background 0.2s, border-color 0.2s",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.background = "#243249";
              e.currentTarget.style.borderColor = "#a855f7";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.background = "#1e293b";
              e.currentTarget.style.borderColor = "#334155";
            }}
            >
              <div style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: "rgba(168, 85, 247, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#a855f7"
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                </svg>
              </div>
              <h3 style={{ margin: "0.25rem 0 0 0", fontSize: "1.2rem", fontWeight: 800, color: "white" }}>
                Control de Cierres Cruzados
              </h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8", lineHeight: "1.4" }}>
                Supervisa al final del día qué CTOs fueron cerradas, reparadas o auditadas por un técnico diferente al que estaban asignadas originalmente.
              </p>
            </div>
          </Link>

          {/* Card 5: Generador de Informes (PDF y Excel) */}
          <Link href="/admin/reports" style={{ textDecoration: "none" }}>
            <div style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "16px",
              padding: "2rem",
              cursor: "pointer",
              transition: "transform 0.2s, background 0.2s, border-color 0.2s",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.background = "#243249";
              e.currentTarget.style.borderColor = "#10b981";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.background = "#1e293b";
              e.currentTarget.style.borderColor = "#334155";
            }}
            >
              <div style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: "rgba(16, 185, 129, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#10b981"
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <h3 style={{ margin: "0.25rem 0 0 0", fontSize: "1.2rem", fontWeight: 800, color: "white" }}>
                Generador de Informes (PDF y Excel)
              </h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8", lineHeight: "1.4" }}>
                Filtra por auditores, técnicos, subestados, fechas y exporta informes avanzados en PDF, Excel moderno (.xlsx) y Excel clásico (.xls).
              </p>
            </div>
          </Link>
        </div>

        {/* Footer */}
        <footer style={{
          textAlign: "center",
          fontSize: "0.75rem",
          color: "#475569",
          marginTop: "4rem",
          borderTop: "1px solid #1e293b",
          paddingTop: "1.5rem"
        }}>
          Plan Algodón v2.0 - Módulo de Gestión de Auditorías
        </footer>

      </div>
    </div>
  );
}
