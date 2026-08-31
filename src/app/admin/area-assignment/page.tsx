"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// Definición de tipos
type CTO = {
  id: string;
  num: string;
  lat: number;
  lng: number;
  status: string;
  zona?: string | null;
  cluster?: string | null;
  assignedTo?: { id: string; name: string; email: string; color?: string | null } | null;
  subStatus?: { id: string; name: string; color: string } | null;
};

type User = {
  id: string;
  name: string;
  email: string;
  color?: string | null;
};

type SubStatus = {
  id: string;
  name: string;
  color: string;
};

// Algoritmo Ray-casting para determinar si un punto (lat, lng) está dentro de un polígono de puntos
function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false;
  const [x, y] = point; // lat, lng
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Carga dinámica del mapa interactivo
const LassoMapComponent = dynamic(
  () => import("@/components/LassoMap"),
  { 
    ssr: false, 
    loading: () => (
      <div style={{ height: "100%", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <p style={{ fontWeight: 600, color: "#64748b" }}>Cargando Mapa de Selección...</p>
      </div>
    )
  }
);

export default function AreaAssignmentPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [ctos, setCtos] = useState<CTO[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [subStatuses, setSubStatuses] = useState<SubStatus[]>([]);
  const [loading, setLoading] = useState(true);

  // Modo de dibujo y selección
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [selectedCtoIds, setSelectedCtoIds] = useState<string[]>([]);
  const [polygonCoords, setPolygonCoords] = useState<[number, number][]>([]);

  // Filtros rápidos
  const [filterTech, setFilterTech] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Acciones masivas
  const [bulkTechId, setBulkTechId] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkSubStatusId, setBulkSubStatusId] = useState("");
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [resCtos, resUsers, resSub] = await Promise.all([
        fetch("/api/ctos/all"),
        fetch("/api/users"),
        fetch("/api/status")
      ]);

      if (resCtos.ok) setCtos(await resCtos.json());
      if (resUsers.ok) setUsers(await resUsers.json());
      if (resSub.ok) setSubStatuses(await resSub.json());
    } catch (e) {
      console.error("Error cargando datos para reasignación:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Validación de rol ADMIN
  useEffect(() => {
    if (authStatus === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "ADMIN" && role !== "GESTOR") {
        router.push("/");
      } else {
        loadData();
      }
    } else if (authStatus === "unauthenticated") {
      router.push("/login");
    }
  }, [authStatus, session, router, loadData]);

  // Filtrado de CTOs en memoria
  const filteredCtos = ctos.filter(cto => {
    if (filterTech === "unassigned" && cto.assignedTo) return false;
    if (filterTech && filterTech !== "unassigned" && cto.assignedTo?.id !== filterTech) return false;
    if (filterStatus && cto.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const numMatch = cto.num.toLowerCase().includes(q);
      const zonaMatch = cto.zona?.toLowerCase().includes(q) || false;
      const clusterMatch = cto.cluster?.toLowerCase().includes(q) || false;
      if (!numMatch && !zonaMatch && !clusterMatch) return false;
    }
    return true;
  });

  // Cuando el usuario termina de dibujar un lazo en el mapa
  const handlePolygonComplete = useCallback((polygon: [number, number][]) => {
    setPolygonCoords(polygon);
    if (polygon.length < 3) return;

    // Encontrar todas las CTOs contenidas en el lazo dibujado
    const selected = filteredCtos.filter(c => isPointInPolygon([c.lat, c.lng], polygon)).map(c => c.id);
    setSelectedCtoIds(prev => {
      // Combinar selección sin duplicados
      const set = new Set([...prev, ...selected]);
      return Array.from(set);
    });
    setIsDrawingMode(false);
  }, [filteredCtos]);

  // Selección manual individual al hacer clic en un pin
  const handleToggleCtoSelection = (id: string) => {
    setSelectedCtoIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Seleccionar todas las que están visibles
  const handleSelectAllVisible = () => {
    setSelectedCtoIds(filteredCtos.map(c => c.id));
  };

  // Limpiar selección
  const handleClearSelection = () => {
    setSelectedCtoIds([]);
    setPolygonCoords([]);
  };

  // Ejecutar reasignación masiva
  const handleApplyBulk = async () => {
    if (selectedCtoIds.length === 0) {
      alert("Selecciona al menos una CTO dibujando en el mapa o pinchando sobre ellas.");
      return;
    }

    if (!bulkTechId && !bulkStatus && !bulkSubStatusId) {
      alert("Elige al menos un técnico, estado o subestado para aplicar a la selección.");
      return;
    }

    setApplyingBulk(true);
    try {
      const payload: any = { ids: selectedCtoIds };
      if (bulkTechId !== "") {
        payload.assignedToId = bulkTechId === "none" ? null : bulkTechId;
      }
      if (bulkStatus !== "") {
        payload.status = bulkStatus;
      }
      if (bulkSubStatusId !== "") {
        payload.subStatusId = bulkSubStatusId === "none" ? null : bulkSubStatusId;
      }

      const res = await fetch("/api/admin/ctos/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setToastMessage(`¡Éxito! Se actualizaron ${selectedCtoIds.length} CTOs correctamente.`);
        setTimeout(() => setToastMessage(null), 4000);
        setSelectedCtoIds([]);
        setPolygonCoords([]);
        setBulkTechId("");
        setBulkStatus("");
        setBulkSubStatusId("");
        // Recargar datos actualizados
        await loadData();
      } else {
        const err = await res.json();
        alert(`Error al actualizar: ${err.error || "Error desconocido"}`);
      }
    } catch (e: any) {
      alert(`Error en la petición: ${e.message}`);
    } finally {
      setApplyingBulk(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", overflow: "hidden", background: "var(--bg-color)" }}>
      
      {/* Barra Superior / Header */}
      <header style={{ 
        background: "var(--card-bg)", 
        borderBottom: "1px solid var(--border-color)", 
        padding: "10px 16px", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "10px",
        zIndex: 1000
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link 
            href="/admin" 
            className="btn" 
            style={{ padding: "6px 12px", minHeight: "34px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", borderRadius: "8px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Volver a Admin
          </Link>
          <div>
            <h1 style={{ fontSize: "1.1rem", fontWeight: 900, margin: 0, color: "var(--text-color)", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "var(--primary-color)" }}>✦</span>
              Reasignación Masiva por Área (Lazo / Dibujo)
            </h1>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              Dibuja con el ratón o con el dedo para encerrar y reasignar cientos de cajas al instante
            </span>
          </div>
        </div>

        {/* Botones de acción rápida de selección */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={() => setIsDrawingMode(!isDrawingMode)}
            className="btn"
            style={{
              padding: "8px 16px",
              borderRadius: "10px",
              fontWeight: 800,
              fontSize: "0.85rem",
              background: isDrawingMode ? "#ef4444" : "var(--primary-color)",
              color: "white",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: isDrawingMode ? "0 4px 12px rgba(239, 68, 68, 0.4)" : "0 4px 12px rgba(255, 121, 0, 0.35)",
              transition: "all 0.2s"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
            {isDrawingMode ? "Cancelar Dibujo" : "Dibujar Área (Lazo)"}
          </button>

          {selectedCtoIds.length > 0 && (
            <>
              <span style={{ background: "rgba(255,121,0,0.15)", color: "var(--primary-color)", padding: "6px 12px", borderRadius: "8px", fontSize: "0.85rem", fontWeight: 800 }}>
                {selectedCtoIds.length} CTOs seleccionadas
              </span>
              <button
                onClick={handleClearSelection}
                className="btn"
                style={{ padding: "6px 10px", minHeight: "34px", background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", borderRadius: "8px", fontSize: "0.78rem", fontWeight: 700 }}
              >
                Limpiar
              </button>
            </>
          )}

          <button
            onClick={handleSelectAllVisible}
            className="btn"
            style={{ padding: "6px 10px", minHeight: "34px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", borderRadius: "8px", fontSize: "0.78rem", fontWeight: 700 }}
          >
            Seleccionar Visibles ({filteredCtos.length})
          </button>
        </div>
      </header>

      {/* Contenedor Principal: Panel Izquierdo / Inferior de Control + Mapa */}
      <div style={{ flex: 1, display: "flex", position: "relative", overflow: "hidden" }}>
        
        {/* Mapa Interactivo */}
        <div style={{ flex: 1, height: "100%", position: "relative" }}>
          {loading ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p style={{ fontWeight: 700, color: "#64748b" }}>Cargando CTOs...</p>
            </div>
          ) : (
            <LassoMapComponent
              ctos={filteredCtos}
              selectedCtoIds={selectedCtoIds}
              isDrawingMode={isDrawingMode}
              onPolygonComplete={handlePolygonComplete}
              onToggleCto={handleToggleCtoSelection}
              polygonCoords={polygonCoords}
            />
          )}

          {/* Banner Flotante Indicador de Modo Dibujo */}
          {isDrawingMode && (
            <div style={{
              position: "absolute",
              top: "16px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(17, 24, 39, 0.9)",
              color: "white",
              padding: "10px 20px",
              borderRadius: "30px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              zIndex: 2000,
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontWeight: 700,
              fontSize: "0.88rem",
              backdropFilter: "blur(4px)",
              pointerEvents: "none"
            }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e", animation: "pulse 1.5s infinite" }} />
              Mantén pulsado y arrastra con el ratón o el dedo para dibujar el círculo/área
            </div>
          )}

          {/* Toast de Éxito */}
          {toastMessage && (
            <div style={{
              position: "absolute",
              bottom: "24px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "#166534",
              color: "white",
              padding: "12px 24px",
              borderRadius: "12px",
              boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
              zIndex: 3000,
              fontWeight: 800,
              fontSize: "0.9rem",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {toastMessage}
            </div>
          )}
        </div>

        {/* Panel Lateral Flotante de Reasignación Masiva */}
        <aside style={{
          width: "360px",
          maxWidth: "90vw",
          background: "var(--card-bg)",
          borderLeft: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
          padding: "16px",
          gap: "14px",
          overflowY: "auto",
          boxShadow: "-4px 0 16px rgba(0,0,0,0.08)",
          zIndex: 1000
        }}>
          <div>
            <h2 style={{ fontSize: "1rem", fontWeight: 900, margin: "0 0 4px 0", color: "var(--text-color)" }}>
              Filtros del Mapa
            </h2>
            <p style={{ fontSize: "0.75rem", color: "#64748b", margin: 0 }}>
              Filtra los puntos antes o después de dibujar el lazo
            </p>
          </div>

          {/* Filtro por Búsqueda */}
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-color)", display: "block", marginBottom: "4px" }}>
              Buscar Código / Zona / Clúster
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Ej: 331-29 o Zona A..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", fontSize: "0.82rem", background: "var(--bg-color)", color: "var(--text-color)", border: "1.5px solid var(--border-color)", borderRadius: "6px" }}
            />
          </div>

          {/* Filtro por Técnico */}
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-color)", display: "block", marginBottom: "4px" }}>
              Filtrar por Técnico Asignado
            </label>
            <select
              className="input-field"
              value={filterTech}
              onChange={e => setFilterTech(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", fontSize: "0.82rem", background: "var(--bg-color)", color: "var(--text-color)", border: "1.5px solid var(--border-color)", borderRadius: "6px" }}
            >
              <option value="">Todos los técnicos</option>
              <option value="unassigned">-- Sin asignar --</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
          </div>

          {/* Filtro por Estado */}
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-color)", display: "block", marginBottom: "4px" }}>
              Filtrar por Estado
            </label>
            <select
              className="input-field"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", fontSize: "0.82rem", background: "var(--bg-color)", color: "var(--text-color)", border: "1.5px solid var(--border-color)", borderRadius: "6px" }}
            >
              <option value="">Todos los estados</option>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="CORRECTO">CORRECTO</option>
              <option value="FALLO">FALLO</option>
              <option value="REVISADO">REVISADO</option>
            </select>
          </div>

          <hr style={{ border: "none", borderTop: "1px solid var(--border-color)", margin: "4px 0" }} />

          {/* Formulario de Reasignación en Bloque */}
          <div style={{ background: "var(--bg-color)", padding: "14px", borderRadius: "12px", border: "1.5px solid var(--primary-color)", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 900, color: "var(--primary-color)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Reasignar Selección
              </span>
              <span style={{ fontSize: "0.78rem", fontWeight: 800, background: "var(--card-bg)", padding: "2px 8px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                {selectedCtoIds.length} cajas
              </span>
            </div>

            {/* Asignar a Técnico */}
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-color)", display: "block", marginBottom: "4px" }}>
                Nuevo Técnico Asignado:
              </label>
              <select
                className="input-field"
                value={bulkTechId}
                onChange={e => setBulkTechId(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", fontSize: "0.82rem", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)", borderRadius: "6px" }}
              >
                <option value="">-- No cambiar técnico --</option>
                <option value="none">-- Dejar Sin Asignar --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
              </select>
            </div>

            {/* Cambiar Estado */}
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-color)", display: "block", marginBottom: "4px" }}>
                Cambiar Estado:
              </label>
              <select
                className="input-field"
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", fontSize: "0.82rem", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)", borderRadius: "6px" }}
              >
                <option value="">-- No cambiar estado --</option>
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="CORRECTO">CORRECTO</option>
                <option value="FALLO">FALLO</option>
                <option value="REVISADO">REVISADO</option>
              </select>
            </div>

            {/* Cambiar Subestado */}
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-color)", display: "block", marginBottom: "4px" }}>
                Cambiar Subestado:
              </label>
              <select
                className="input-field"
                value={bulkSubStatusId}
                onChange={e => setBulkSubStatusId(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", fontSize: "0.82rem", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)", borderRadius: "6px" }}
              >
                <option value="">-- No cambiar subestado --</option>
                <option value="none">-- Quitar Subestado --</option>
                {subStatuses.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Botón Aplicar */}
            <button
              type="button"
              onClick={handleApplyBulk}
              disabled={applyingBulk || selectedCtoIds.length === 0}
              className="btn btn-primary"
              style={{
                marginTop: "6px",
                padding: "10px",
                fontWeight: 800,
                fontSize: "0.9rem",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                opacity: (applyingBulk || selectedCtoIds.length === 0) ? 0.6 : 1,
                cursor: (applyingBulk || selectedCtoIds.length === 0) ? "not-allowed" : "pointer"
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {applyingBulk ? "Aplicando Cambios..." : `Aplicar a ${selectedCtoIds.length} CTOs`}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
