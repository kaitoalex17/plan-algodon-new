"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
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

  const [loading, setLoading] = useState(true);
  const [deletingImages, setDeletingImages] = useState(false);
  const [deletingCtos, setDeletingCtos] = useState(false);
  const [migratingAuditors, setMigratingAuditors] = useState(false);

  useEffect(() => {
    if (authStatus === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "ADMIN") {
        router.push("/");
      } else {
        loadData();
      }
    } else if (authStatus === "unauthenticated") {
      router.push("/login");
    }
  }, [authStatus, session, router]);

  async function loadData() {
    try {
      const resSummary = await fetch("/api/admin/summary");
      if (resSummary.ok) {
        setStats(await resSummary.json());
      }
    } catch (err) {
      console.error("Error cargando panel admin:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteAllImages = async () => {
    if (!confirm("⚠️ ¡PELIGRO! ¿Estás completamente seguro de que deseas eliminar TODAS las evidencias fotográficas? Esta acción no se puede deshacer y borrará todas las fotos físicas del servidor y de la base de datos.")) {
      return;
    }
    const confirmText = prompt("Escribe 'ELIMINAR TODO' para confirmar esta acción:");
    if (confirmText !== "ELIMINAR TODO") {
      alert("Confirmación incorrecta. Acción cancelada.");
      return;
    }

    setDeletingImages(true);
    try {
      const res = await fetch("/api/admin/delete-all-images", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        alert(`Se han eliminado con éxito ${data.count || 0} imágenes de la base de datos y del disco.`);
        loadData();
      } else {
        alert("Error al intentar eliminar las evidencias.");
      }
    } catch (err) {
      console.error(err);
      alert("Error en el servidor.");
    } finally {
      setDeletingImages(false);
    }
  };

  const handleDeleteAllCtos = async () => {
    if (!confirm("⚠️ ¡PELIGRO! ¿Estás completamente seguro de que deseas eliminar TODAS las CTOs? Esta acción no se puede deshacer y borrará todas las CTOs, fotos asociadas, comentarios e historial de la base de datos.")) {
      return;
    }
    const confirmText = prompt("Escribe 'ELIMINAR CTOS' para confirmar esta acción:");
    if (confirmText !== "ELIMINAR CTOS") {
      alert("Confirmación incorrecta. Acción cancelada.");
      return;
    }

    setDeletingCtos(true);
    try {
      const res = await fetch("/api/admin/delete-all-ctos", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        alert(`Se han eliminado con éxito ${data.count || 0} registros de CTOs.`);
        loadData();
      } else {
        alert("Error al intentar eliminar las CTOs.");
      }
    } catch (err) {
      console.error(err);
      alert("Error en el servidor.");
    } finally {
      setDeletingCtos(false);
    }
  };

  const handleMigrateAuditors = async () => {
    if (!confirm("¿Deseas ejecutar la migración única de datos de auditores? Esto copiará el técnico asignado al campo 'Auditado por' para todas las CTOs marcadas como CORRECTO.")) {
      return;
    }
    setMigratingAuditors(true);
    try {
      const res = await fetch("/api/admin/migrate-auditors", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || `Migración completada. Registros afectados: ${data.count}`);
      } else {
        alert("Error al realizar la migración.");
      }
    } catch (err) {
      console.error(err);
      alert("Error en el servidor al realizar la migración.");
    } finally {
      setMigratingAuditors(false);
    }
  };

  if (loading || authStatus === "loading") {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "#6b7280", background: "var(--bg-color)" }}>
        Cargando Panel de Administración...
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', color: 'var(--text-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Panel de Administración</h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "4px 0 0 0" }}>Plan Algodón v2.8 — Control Completo del Servidor</p>
        </div>
        <Link href="/" className="btn btn-primary">Volver al Mapa</Link>
      </div>

      {/* Grid de Estadísticas Rediseñado */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.25rem 1rem', textAlign: 'center', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
          <h3 style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', marginBottom: '0.4rem', fontWeight: 700 }}>Usuarios</h3>
          <p style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-color)', margin: 0 }}>{stats.usersCount}</p>
        </div>
        <div className="glass-panel" style={{ padding: '1.25rem 1rem', textAlign: 'center', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
          <h3 style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', marginBottom: '0.4rem', fontWeight: 700 }}>CTOs Totales</h3>
          <p style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b', margin: 0 }}>{stats.ctosCount}</p>
        </div>
        <div className="glass-panel" style={{ padding: '1.25rem 1rem', textAlign: 'center', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
          <h3 style={{ color: '#10b981', fontSize: '0.78rem', textTransform: 'uppercase', marginBottom: '0.4rem', fontWeight: 700 }}>Auditadas</h3>
          <p style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', margin: 0 }}>{stats.ctosAuditadas}</p>
        </div>
        <div className="glass-panel" style={{ padding: '1.25rem 1rem', textAlign: 'center', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
          <h3 style={{ color: '#3b82f6', fontSize: '0.78rem', textTransform: 'uppercase', marginBottom: '0.4rem', fontWeight: 700 }}>Pendientes</h3>
          <p style={{ fontSize: '1.8rem', fontWeight: 800, color: '#3b82f6', margin: 0 }}>{stats.ctosPendientes}</p>
        </div>
        <div className="glass-panel" style={{ padding: '1.25rem 1rem', textAlign: 'center', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
          <h3 style={{ color: '#8b5cf6', fontSize: '0.78rem', textTransform: 'uppercase', marginBottom: '0.4rem', fontWeight: 700 }}>Reparos</h3>
          <p style={{ fontSize: '1.8rem', fontWeight: 800, color: '#8b5cf6', margin: 0 }}>{stats.programadasCount}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        
        {/* Acciones principales */}
        <div className="glass-panel" style={{ padding: '2rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 800 }}>Acciones de Gestión</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Link href="/admin/import" className="btn btn-primary" style={{ justifyContent: 'center', padding: '0.75rem', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 3v14M8 13l4 4 4-4" />
              </svg>
              Importar CTOs (Excel)
            </Link>
            <Link href="/admin/tech-stats" className="btn" style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: 'white', border: 'none', justifyContent: 'center', padding: '0.85rem', gap: '8px', fontWeight: 800, boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              📊 Recuento y Reparto por Técnico
            </Link>
            <Link href="/admin/area-assignment" className="btn" style={{ background: 'linear-gradient(135deg, #FF7900 0%, #d97706 100%)', color: 'white', border: 'none', justifyContent: 'center', padding: '0.85rem', gap: '8px', fontWeight: 800, boxShadow: '0 4px 12px rgba(255, 121, 0, 0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="M2 2l7.586 7.586" />
                <circle cx="11" cy="11" r="2" />
              </svg>
              Reasignar por Área (Dibujo en Mapa)
            </Link>
            <Link href="/admin/ctos" className="btn" style={{ background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', justifyContent: 'center', padding: '0.75rem', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Gestionar y Editar CTOs (Listado)
            </Link>
            <Link href="/admin/users" className="btn" style={{ background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', justifyContent: 'center', padding: '0.75rem', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Gestionar Usuarios
            </Link>
            <Link href="/admin/status" className="btn" style={{ background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', justifyContent: 'center', padding: '0.75rem', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.35857 19.5 5.5 20 5 21C4.5 22 5.5 22 6.5 21.5C7.5 21 8 21.1414 8.5 21.6414C9.5 22.6414 10.7255 23 12 22Z" />
                <circle cx="7.5" cy="10.5" r="1.5" />
                <circle cx="11.5" cy="7.5" r="1.5" />
                <circle cx="16.5" cy="9.5" r="1.5" />
              </svg>
              Configurar Subestados y Colores
            </Link>
            <Link href="/admin/history" className="btn" style={{ background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', justifyContent: 'center', padding: '0.75rem', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Historial de Cambios / Control
            </Link>
            <Link href="/admin/evidencia" className="btn" style={{ background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', justifyContent: 'center', padding: '0.75rem', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Evidencias Fotográficas (Organizador)
            </Link>
            <Link href="/admin/lottery" className="btn" style={{ background: 'var(--primary-color)', color: 'white', justifyContent: 'center', padding: '0.75rem', gap: '8px', fontWeight: 600 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Sorteo y Reparto de CTOs
            </Link>
            <Link href="/admin/daily-summary" className="btn" style={{ background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', justifyContent: 'center', padding: '0.75rem', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22 6 12 13 2 6" />
              </svg>
              Resumen Diario de Auditoría
            </Link>
            <Link href="/admin/period-summary" className="btn" style={{ background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border-color)', justifyContent: 'center', padding: '0.75rem', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              📅 Informe por Período de Auditoría
            </Link>
            <Link href="/admin/active-sessions" className="btn" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', border: 'none', justifyContent: 'center', padding: '0.85rem', gap: '8px', fontWeight: 800, boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              🔐 Control de Accesos y Sesiones Activas
            </Link>
            <Link href="/admin/tech-map" className="btn" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', color: 'white', border: 'none', justifyContent: 'center', padding: '0.85rem', gap: '8px', fontWeight: 800, boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
              🗺️ Última Ubicación de Técnicos (Mapa en Vivo)
            </Link>
            <Link href="/admin/technicians-sync" className="btn" style={{ background: 'linear-gradient(135deg, #FF7900 0%, #ea580c 100%)', color: 'white', justifyContent: 'center', padding: '0.75rem', gap: '8px', fontWeight: 800, boxShadow: '0 4px 10px rgba(255, 121, 0, 0.3)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              📡 Control de Sincronización y Técnicos
            </Link>
            <Link href="/admin/anti-fraud" className="btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1.5px solid #ef4444', justifyContent: 'center', padding: '0.75rem', gap: '8px', fontWeight: 800 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              🛡️ Control Antifraude (Verificación GPS)
            </Link>
            <Link href="/admin/cross-audits" className="btn" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1.5px solid #3b82f6', justifyContent: 'center', padding: '0.75rem', gap: '8px', fontWeight: 700 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
              Auditoría Cruzada (Técnicos)
            </Link>

            {/* BOTÓN NUEVO DE AJUSTES UNIFICADOS */}
            <Link href="/admin/settings" className="btn" style={{ background: 'rgba(249,115,22,0.1)', color: 'var(--primary-color)', border: '1.5px solid var(--primary-color)', justifyContent: 'center', padding: '0.75rem', gap: '8px', fontWeight: 700 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              ⚙️ Ajustes del Sistema (v2.0)
            </Link>
            
            {/* BOTÓN DE AJUSTES DE GOOGLE DRIVE */}
            <Link href="/admin/drive-settings" className="btn" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1.5px solid #10b981', justifyContent: 'center', padding: '0.75rem', gap: '8px', fontWeight: 700 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              ☁️ Ajustes de Google Drive
            </Link>
          </div>
        </div>

        {/* Acciones de bases de datos */}
        <div className="glass-panel" style={{ padding: '2rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 800 }}>Mantenimiento y Copias</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <a href="/api/admin/export" className="btn" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', justifyContent: 'center', padding: '0.75rem', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Exportar Datos (Excel)
            </a>
            <a href="/api/admin/backup" className="btn" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', justifyContent: 'center', padding: '0.75rem', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Copia de Seguridad Completa (Excel)
            </a>
            <button 
              onClick={handleMigrateAuditors}
              className="btn" 
              disabled={migratingAuditors}
              style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', justifyContent: 'center', padding: '0.75rem', gap: '8px', fontWeight: 600 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M17 11l2 2 4-4" />
              </svg>
              {migratingAuditors ? "Migrando..." : "Migrar Datos (Asignar Auditores)"}
            </button>
            <a href="/api/admin/export-images" download className="btn" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', justifyContent: 'center', padding: '0.75rem', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Descargar Evidencias de Fotos (ZIP)
            </a>
            <button 
              onClick={handleDeleteAllImages}
              className="btn" 
              disabled={deletingImages}
              style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', justifyContent: 'center', padding: '0.75rem', gap: '8px', fontWeight: 700 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
              </svg>
              {deletingImages ? "Borrando..." : "Borrar Todas las Evidencias Fotográficas"}
            </button>
            <button 
              onClick={handleDeleteAllCtos}
              className="btn" 
              disabled={deletingCtos}
              style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', justifyContent: 'center', padding: '0.75rem', gap: '8px', fontWeight: 700 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
              </svg>
              {deletingCtos ? "Borrando CTOs..." : "Borrar Todas las CTOs de la Base de Datos"}
            </button>
          </div>
        </div>

      </div>

      <div style={{ 
        textAlign: "center", 
        fontSize: "0.75rem", 
        fontWeight: 700, 
        color: "var(--text-color)", 
        opacity: 0.6, 
        marginTop: "2rem",
        borderTop: "1px solid var(--border-color)",
        paddingTop: "1rem"
      }}>
        Plan Algodón - Versión 2.8.0
      </div>
    </div>
  );
}
