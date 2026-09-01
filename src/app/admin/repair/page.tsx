"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface User {
  id: string;
  name: string | null;
  email: string;
  color?: string | null;
}

interface Comment {
  id: string;
  text: string;
  createdAt: string;
  user: {
    name: string | null;
    email: string;
  } | null;
}

interface CTOImage {
  id: string;
  url: string;
  createdAt: string;
}

interface CTO {
  id: string;
  num: string;
  numeroNuevo?: string | null;
  cluster?: string | null;
  municipio?: string | null;
  colocacion?: string | null;
  status: string;
  notas?: string | null;
  updatedAt: string;
  assignedTo?: User | null;
  auditedBy?: User | null;
  images: CTOImage[];
  comments: Comment[];
}

interface TechnicianOption {
  id: string;
  name: string;
  email: string;
  color?: string;
  count: number;
}

export default function AdminRepairPage() {
  const [ctos, setCtos] = useState<CTO[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState("");
  const [selectedTechnician, setSelectedTechnician] = useState("");
  const [selectedCluster, setSelectedCluster] = useState("");

  // Opciones de desplegables y métricas
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [clusters, setClusters] = useState<string[]>([]);
  const [stats, setStats] = useState({
    totalInRepair: 0,
    techniciansWithRepairs: 0,
    clustersWithRepairs: 0
  });

  // Modales de Acción
  const [actionModal, setActionModal] = useState<{
    cto: CTO;
    type: "status" | "reassign";
  } | null>(null);

  const [newStatusSelected, setNewStatusSelected] = useState("CORRECTO");
  const [newTechSelected, setNewTechSelected] = useState("");
  const [actionComment, setActionComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cargar lista de técnicos disponibles para reasignación
  useEffect(() => {
    fetch("/api/users")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setAllUsers(data);
      })
      .catch(err => console.error("Error al cargar usuarios:", err));
  }, []);

  const loadData = useCallback(async (pageToLoad = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(pageToLoad));
      params.set("limit", "25");
      if (search.trim()) params.set("search", search.trim());
      if (selectedTechnician) params.set("technicianId", selectedTechnician);
      if (selectedCluster) params.set("cluster", selectedCluster);

      const res = await fetch(`/api/admin/repair?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCtos(data.ctos || []);
        setTotalCount(data.totalCount || 0);
        setTotalPages(data.totalPages || 1);
        setCurrentPage(data.currentPage || 1);
        if (data.technicians) setTechnicians(data.technicians);
        if (data.clusters) setClusters(data.clusters);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error("Error al cargar CTOs en reparación:", err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedTechnician, selectedCluster]);

  useEffect(() => {
    loadData(1);
  }, [loadData]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData(1);
  };

  const executeAction = async () => {
    if (!actionModal) return;
    setIsSubmitting(true);
    try {
      const payload: any = {
        ctoId: actionModal.cto.id
      };

      if (actionModal.type === "status") {
        payload.newStatus = newStatusSelected;
        payload.commentText = actionComment.trim() || `Estado modificado a ${newStatusSelected}`;
      } else if (actionModal.type === "reassign") {
        payload.assignedToId = newTechSelected || null;
        payload.commentText = actionComment.trim() || "Técnico reasignado";
      }

      const res = await fetch("/api/admin/repair", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setActionModal(null);
        setActionComment("");
        loadData(currentPage);
      } else {
        const err = await res.json();
        alert(err.error || "Error al procesar la acción.");
      }
    } catch (err) {
      console.error("Error al ejecutar acción:", err);
      alert("Error de conexión con el servidor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportToCsv = () => {
    if (ctos.length === 0) return;
    const headers = ["CTO", "Numero_Nuevo", "Cluster", "Municipio", "Tecnico_Asignado", "Fotos", "Ultimo_Motivo", "Fecha_Actualizacion"];
    const rows = ctos.map(c => [
      `"${c.num}"`,
      `"${c.numeroNuevo || ""}"`,
      `"${c.cluster || ""}"`,
      `"${c.municipio || ""}"`,
      `"${c.assignedTo?.name || c.assignedTo?.email || "Sin asignar"}"`,
      c.images.length,
      `"${(c.comments[0]?.text || "").replace(/"/g, '""')}"`,
      `"${new Date(c.updatedAt).toLocaleString()}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ctos_reparacion_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-color, #0f172a)", color: "var(--text-color, #f8fafc)", padding: "20px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        
        {/* Cabecera Principal */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <Link
              href="/admin"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                color: "#8b5cf6",
                fontWeight: 700,
                fontSize: "0.85rem",
                marginBottom: "6px"
              }}
            >
              ← Volver al Panel de Administración
            </Link>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 900, margin: 0 }}>
              Control de CTOs en Estado REPARAR
            </h1>
            <p style={{ fontSize: "0.85rem", opacity: 0.75, margin: "4px 0 0 0" }}>
              Panel de supervisión y seguimiento de cajas enviadas a taller o pendientes de subsanación por técnicos.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={exportToCsv}
              style={{
                background: "var(--card-bg, #1e293b)",
                color: "var(--text-color)",
                border: "1px solid var(--border-color, #334155)",
                borderRadius: "8px",
                padding: "8px 14px",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              Exportar CSV
            </button>
            <Link
              href="/admin/photo-audit?status=REPARAR"
              style={{
                background: "#8b5cf6",
                color: "white",
                borderRadius: "8px",
                padding: "8px 14px",
                fontSize: "0.82rem",
                fontWeight: 800,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                textDecoration: "none"
              }}
            >
              Auditoría Visual de Reparaciones
            </Link>
          </div>
        </div>

        {/* Métricas Principales */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "20px" }}>
          <div style={{ background: "var(--card-bg, #1e293b)", border: "1.5px solid rgba(139, 92, 246, 0.4)", borderRadius: "12px", padding: "16px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "#8b5cf6", letterSpacing: "0.5px" }}>
              Total en Reparación
            </span>
            <div style={{ fontSize: "2rem", fontWeight: 900, marginTop: "4px" }}>
              {stats.totalInRepair}
            </div>
            <span style={{ fontSize: "0.74rem", opacity: 0.7 }}>
              Cajas actualmente en seguimiento
            </span>
          </div>

          <div style={{ background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color, #334155)", borderRadius: "12px", padding: "16px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", opacity: 0.75, letterSpacing: "0.5px" }}>
              Técnicos Afectados
            </span>
            <div style={{ fontSize: "2rem", fontWeight: 900, marginTop: "4px" }}>
              {stats.techniciansWithRepairs}
            </div>
            <span style={{ fontSize: "0.74rem", opacity: 0.7 }}>
              Con incidencias asignadas en su buzón
            </span>
          </div>

          <div style={{ background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color, #334155)", borderRadius: "12px", padding: "16px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", opacity: 0.75, letterSpacing: "0.5px" }}>
              Clústeres Implicados
            </span>
            <div style={{ fontSize: "2rem", fontWeight: 900, marginTop: "4px" }}>
              {stats.clustersWithRepairs}
            </div>
            <span style={{ fontSize: "0.74rem", opacity: 0.7 }}>
              Zonas geográficas de intervención
            </span>
          </div>
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div style={{
          background: "var(--card-bg, #1e293b)",
          border: "1px solid var(--border-color, #334155)",
          borderRadius: "12px",
          padding: "14px 16px",
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px"
        }}>
          <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "8px", flex: 1, minWidth: "260px" }}>
            <input
              type="text"
              placeholder="Buscar por código de CTO, municipio o notas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #334155)",
                background: "var(--bg-color, #0f172a)",
                color: "var(--text-color, #f8fafc)",
                fontSize: "0.85rem"
              }}
            />
            <button
              type="submit"
              style={{
                background: "#8b5cf6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "0.85rem",
                fontWeight: 800,
                cursor: "pointer"
              }}
            >
              Buscar
            </button>
          </form>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {/* Filtro por Técnico */}
            <select
              value={selectedTechnician}
              onChange={(e) => setSelectedTechnician(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #334155)",
                background: "var(--bg-color, #0f172a)",
                color: "var(--text-color, #f8fafc)",
                fontSize: "0.85rem",
                fontWeight: 700
              }}
            >
              <option value="">Todos los Técnicos ({technicians.length})</option>
              {technicians.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.count})
                </option>
              ))}
            </select>

            {/* Filtro por Clúster */}
            <select
              value={selectedCluster}
              onChange={(e) => setSelectedCluster(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #334155)",
                background: "var(--bg-color, #0f172a)",
                color: "var(--text-color, #f8fafc)",
                fontSize: "0.85rem",
                fontWeight: 700
              }}
            >
              <option value="">Todos los Clústeres ({clusters.length})</option>
              {clusters.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabla / Tarjetas de CTOs */}
        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "#94a3b8" }}>
            Cargando cajas en estado REPARAR...
          </div>
        ) : ctos.length === 0 ? (
          <div style={{ background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color, #334155)", borderRadius: "12px", padding: "3rem", textAlign: "center", color: "#94a3b8" }}>
            No hay CTOs en estado REPARAR con los filtros seleccionados.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {ctos.map((cto) => {
              const latestComment = cto.comments[0];

              return (
                <div
                  key={cto.id}
                  style={{
                    background: "var(--card-bg, #1e293b)",
                    border: "1.5px solid rgba(139, 92, 246, 0.4)",
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px"
                  }}
                >
                  {/* Fila Superior: Código, Clúster, Técnico y Estado */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "1.2rem", fontWeight: 900, color: "#8b5cf6" }}>
                        {cto.num}
                      </span>

                      {cto.numeroNuevo && (
                        <span style={{ fontSize: "0.75rem", background: "var(--bg-color)", padding: "2px 8px", borderRadius: "6px", opacity: 0.8 }}>
                          {cto.numeroNuevo}
                        </span>
                      )}

                      {cto.cluster && (
                        <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#3b82f6", background: "rgba(59, 130, 246, 0.15)", padding: "2px 8px", borderRadius: "6px" }}>
                          Clúster: {cto.cluster}
                        </span>
                      )}

                      {cto.municipio && (
                        <span style={{ fontSize: "0.78rem", opacity: 0.75 }}>
                          {cto.municipio}
                        </span>
                      )}

                      <span style={{
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        padding: "3px 10px",
                        borderRadius: "12px",
                        background: "rgba(139, 92, 246, 0.2)",
                        color: "#8b5cf6"
                      }}>
                        REPARAR
                      </span>
                    </div>

                    {/* Técnico Asignado */}
                    <div>
                      {cto.assignedTo ? (
                        <span style={{ fontSize: "0.82rem", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: cto.assignedTo.color || "#8b5cf6" }} />
                          {cto.assignedTo.name || cto.assignedTo.email}
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.8rem", color: "#f59e0b", fontWeight: 700 }}>
                          Sin técnico asignado
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Detalle del Motivo / Incidencia */}
                  <div style={{
                    background: "rgba(139, 92, 246, 0.08)",
                    border: "1px solid rgba(139, 92, 246, 0.25)",
                    borderRadius: "8px",
                    padding: "10px 14px"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#8b5cf6", textTransform: "uppercase" }}>
                        Motivo de Reparación / Último Registro
                      </span>
                      {latestComment && (
                        <span style={{ fontSize: "0.72rem", opacity: 0.6 }}>
                          {new Date(latestComment.createdAt).toLocaleString()} por {latestComment.user?.name || latestComment.user?.email || "Auditor"}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600 }}>
                      {latestComment ? latestComment.text : (cto.notas || "No se ha especificado un motivo por escrito.")}
                    </p>
                  </div>

                  {/* Barra de Acciones Rápidas */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", borderTop: "1px solid var(--border-color, #334155)", paddingTop: "10px" }}>
                    <div style={{ fontSize: "0.78rem", opacity: 0.75 }}>
                      Evidencias fotográficas: <strong>{cto.images.length} fotos</strong>
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {/* Ver en Mapa */}
                      <Link
                        href={`/?cto=${encodeURIComponent(cto.num)}`}
                        target="_blank"
                        style={{
                          background: "var(--bg-color, #0f172a)",
                          color: "var(--text-color, #f8fafc)",
                          border: "1px solid var(--border-color, #334155)",
                          borderRadius: "8px",
                          padding: "6px 12px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          textDecoration: "none"
                        }}
                      >
                        Ver en Mapa
                      </Link>

                      {/* Abrir Guía Fotográfica */}
                      <Link
                        href={`/photo-guide?ctoId=${encodeURIComponent(cto.id)}`}
                        target="_blank"
                        style={{
                          background: "var(--bg-color, #0f172a)",
                          color: "var(--text-color, #f8fafc)",
                          border: "1px solid var(--border-color, #334155)",
                          borderRadius: "8px",
                          padding: "6px 12px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          textDecoration: "none"
                        }}
                      >
                        Guía Fotográfica
                      </Link>

                      {/* Reasignar Técnico */}
                      <button
                        type="button"
                        onClick={() => {
                          setNewTechSelected(cto.assignedTo?.id || "");
                          setActionComment("");
                          setActionModal({ cto, type: "reassign" });
                        }}
                        style={{
                          background: "rgba(59, 130, 246, 0.15)",
                          color: "#3b82f6",
                          border: "1px solid #3b82f6",
                          borderRadius: "8px",
                          padding: "6px 12px",
                          fontSize: "0.78rem",
                          fontWeight: 800,
                          cursor: "pointer"
                        }}
                      >
                        Reasignar Técnico
                      </button>

                      {/* Cambiar Estado / Resolver */}
                      <button
                        type="button"
                        onClick={() => {
                          setNewStatusSelected("CORRECTO");
                          setActionComment("");
                          setActionModal({ cto, type: "status" });
                        }}
                        style={{
                          background: "#8b5cf6",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          padding: "6px 14px",
                          fontSize: "0.78rem",
                          fontWeight: 800,
                          cursor: "pointer"
                        }}
                      >
                        Cambiar Estado / Resolver
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", marginTop: "20px" }}>
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => loadData(currentPage - 1)}
              style={{
                background: "var(--card-bg, #1e293b)",
                color: "var(--text-color)",
                border: "1px solid var(--border-color, #334155)",
                borderRadius: "8px",
                padding: "8px 14px",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                opacity: currentPage <= 1 ? 0.5 : 1
              }}
            >
              Anterior
            </button>
            <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>
              Página {currentPage} de {totalPages} ({totalCount} CTOs)
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => loadData(currentPage + 1)}
              style={{
                background: "var(--card-bg, #1e293b)",
                color: "var(--text-color)",
                border: "1px solid var(--border-color, #334155)",
                borderRadius: "8px",
                padding: "8px 14px",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                opacity: currentPage >= totalPages ? 0.5 : 1
              }}
            >
              Siguiente
            </button>
          </div>
        )}

      </div>

      {/* Modal de Acción (Cambio de Estado o Reasignación) */}
      {actionModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(0,0,0,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: "var(--card-bg, #0f172a)",
            border: "1.5px solid #8b5cf6",
            borderRadius: "14px",
            width: "95%",
            maxWidth: "480px",
            padding: "20px",
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 900 }}>
                {actionModal.type === "status"
                  ? `Cambiar Estado: CTO ${actionModal.cto.num}`
                  : `Reasignar Técnico: CTO ${actionModal.cto.num}`}
              </h3>
              <button
                type="button"
                onClick={() => setActionModal(null)}
                style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "1.2rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {actionModal.type === "status" ? (
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "4px" }}>
                  Nuevo Estado:
                </label>
                <select
                  value={newStatusSelected}
                  onChange={(e) => setNewStatusSelected(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color, #334155)",
                    background: "var(--bg-color, #0f172a)",
                    color: "var(--text-color, #f8fafc)",
                    fontSize: "0.85rem",
                    fontWeight: 700
                  }}
                >
                  <option value="CORRECTO">CORRECTO (Reparación Subsanada y Aprobada)</option>
                  <option value="PENDIENTE">PENDIENTE (Devolver a estado inicial)</option>
                  <option value="FALLO">FALLO (Incidencia no resuelta / no procede)</option>
                  <option value="REPARAR">REPARAR (Mantener en taller)</option>
                </select>
              </div>
            ) : (
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "4px" }}>
                  Asignar a Técnico:
                </label>
                <select
                  value={newTechSelected}
                  onChange={(e) => setNewTechSelected(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color, #334155)",
                    background: "var(--bg-color, #0f172a)",
                    color: "var(--text-color, #f8fafc)",
                    fontSize: "0.85rem",
                    fontWeight: 700
                  }}
                >
                  <option value="">-- Sin Técnico Asignado --</option>
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "4px" }}>
                Nota explicativa (opcional):
              </label>
              <textarea
                rows={2}
                placeholder="Indica las razones del cambio..."
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #334155)",
                  background: "var(--bg-color, #0f172a)",
                  color: "var(--text-color, #f8fafc)",
                  fontSize: "0.82rem",
                  resize: "none"
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setActionModal(null)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  background: "var(--bg-color)",
                  color: "var(--text-color)",
                  border: "1px solid var(--border-color)",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={executeAction}
                style={{
                  padding: "8px 18px",
                  borderRadius: "8px",
                  background: "#8b5cf6",
                  color: "white",
                  border: "none",
                  fontSize: "0.82rem",
                  fontWeight: 800,
                  cursor: isSubmitting ? "wait" : "pointer"
                }}
              >
                {isSubmitting ? "Guardando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
