"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface TechnicianStat {
  id: string;
  name: string;
  email: string;
  color: string;
  role: string;
  total: number;
  byStatus: { [status: string]: number };
  bySubStatus: { [subStatusId: string]: number };
}

interface SubStatus {
  id: string;
  name: string;
  color: string;
}

export default function TechStatsPage() {
  const [technicians, setTechnicians] = useState<TechnicianStat[]>([]);
  const [subStatuses, setSubStatuses] = useState<SubStatus[]>([]);
  const [grandTotal, setGrandTotal] = useState<number>(0);
  const [globalStatusCounts, setGlobalStatusCounts] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Filtros
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterSubStatusId, setFilterSubStatusId] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append("status", filterStatus);
      if (filterSubStatusId) params.append("subStatusId", filterSubStatusId);
      if (filterCategory) params.append("category", filterCategory);

      const res = await fetch(`/api/admin/tech-stats?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTechnicians(data.technicians || []);
        setSubStatuses(data.subStatuses || []);
        setGrandTotal(data.grandTotal || 0);
        setGlobalStatusCounts(data.globalStatusCounts || {});
      }
    } catch (e) {
      console.error("Error al cargar estadísticas:", e);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSubStatusId, filterCategory]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Técnicos activos con al menos 1 caja asignada (o mostrar todos si se desactiva)
  const activeTechs = technicians.filter(t => t.id !== "unassigned");
  const unassignedStat = technicians.find(t => t.id === "unassigned");

  // Promedio por técnico asignado
  const assignedTotal = activeTechs.reduce((acc, t) => acc + t.total, 0);
  const averagePerTech = activeTechs.length > 0 ? (assignedTotal / activeTechs.length).toFixed(1) : "0";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-color)", color: "var(--text-color)", display: "flex", flexDirection: "column" }}>
      
      {/* Header Compacto para Móvil */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "var(--card-bg)",
        borderBottom: "1px solid var(--border-color)",
        padding: "10px 14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Link
            href="/admin"
            className="btn"
            style={{
              padding: "6px 10px",
              minHeight: "32px",
              background: "var(--bg-color)",
              color: "var(--text-color)",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              fontSize: "0.8rem",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Admin
          </Link>
          <div>
            <h1 style={{ fontSize: "0.95rem", fontWeight: 900, margin: 0, color: "var(--text-color)", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "var(--primary-color)" }}>📊</span>
              Reparto & Estadísticas
            </h1>
            <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
              Recuento por técnico y estados
            </span>
          </div>
        </div>

        <button
          onClick={loadStats}
          className="btn"
          title="Refrescar"
          style={{ padding: "6px 10px", minHeight: "32px", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "var(--text-color)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "0.75rem", fontWeight: 700 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          {loading ? "..." : "Actualizar"}
        </button>
      </header>

      {/* Contenido Principal */}
      <main style={{ padding: "12px", maxWidth: "680px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
        
        {/* Barra de Filtros Rápidos */}
        <div style={{ background: "var(--card-bg)", padding: "10px 12px", borderRadius: "12px", border: "1px solid var(--border-color)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          
          {/* Filtro Estado */}
          <div>
            <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "3px" }}>
              Estado:
            </label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", fontSize: "0.78rem", fontWeight: 700, background: "var(--bg-color)", color: "var(--text-color)", border: "1.5px solid var(--border-color)", borderRadius: "6px" }}
            >
              <option value="">Todos los Estados</option>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="CORRECTO">CORRECTO</option>
              <option value="FALLO">FALLO</option>
              <option value="REVISADO">REVISADO</option>
            </select>
          </div>

          {/* Filtro Subestado */}
          <div>
            <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "#64748b", display: "block", marginBottom: "3px" }}>
              Subestado:
            </label>
            <select
              value={filterSubStatusId}
              onChange={e => setFilterSubStatusId(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", fontSize: "0.78rem", fontWeight: 700, background: "var(--bg-color)", color: "var(--text-color)", border: "1.5px solid var(--border-color)", borderRadius: "6px" }}
            >
              <option value="">Todos los Subestados</option>
              <option value="none">-- Sin Subestado --</option>
              {subStatuses.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Filtro Categoría */}
          <div style={{ gridColumn: "span 2" }}>
            <div style={{ display: "flex", gap: "6px" }}>
              {[
                { label: "Todas", val: "" },
                { label: "Auditoría", val: "AUDITORIA" },
                { label: "Programadas", val: "PROGRAMADA" }
              ].map(c => (
                <button
                  key={c.val}
                  type="button"
                  onClick={() => setFilterCategory(c.val)}
                  style={{
                    flex: 1,
                    padding: "5px 4px",
                    borderRadius: "6px",
                    border: filterCategory === c.val ? "2px solid var(--primary-color)" : "1px solid var(--border-color)",
                    background: filterCategory === c.val ? "rgba(255,121,0,0.12)" : "var(--bg-color)",
                    color: filterCategory === c.val ? "var(--primary-color)" : "var(--text-color)",
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    cursor: "pointer"
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Resumen Global Métricas */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
          <div style={{ background: "var(--card-bg)", padding: "8px 10px", borderRadius: "10px", border: "1px solid var(--border-color)", textAlign: "center" }}>
            <span style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 700, display: "block" }}>Total CTOs</span>
            <span style={{ fontSize: "1.2rem", fontWeight: 900, color: "var(--primary-color)" }}>{grandTotal}</span>
          </div>
          <div style={{ background: "var(--card-bg)", padding: "8px 10px", borderRadius: "10px", border: "1px solid var(--border-color)", textAlign: "center" }}>
            <span style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 700, display: "block" }}>Media / Técnico</span>
            <span style={{ fontSize: "1.2rem", fontWeight: 900, color: "#0284c7" }}>{averagePerTech}</span>
          </div>
          <div style={{ background: "var(--card-bg)", padding: "8px 10px", borderRadius: "10px", border: "1px solid var(--border-color)", textAlign: "center" }}>
            <span style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 700, display: "block" }}>Sin Asignar</span>
            <span style={{ fontSize: "1.2rem", fontWeight: 900, color: "#e11d48" }}>{unassignedStat?.total || 0}</span>
          </div>
        </div>

        {/* Listado de Técnicos con Recuento por Estados */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "2px" }}>
          {technicians.map((t) => {
            const isUnassigned = t.id === "unassigned";
            const percent = grandTotal > 0 ? ((t.total / grandTotal) * 100).toFixed(0) : "0";

            return (
              <div
                key={t.id}
                style={{
                  background: "var(--card-bg)",
                  border: isUnassigned ? "1.5px dashed #f43f5e" : "1px solid var(--border-color)",
                  borderRadius: "12px",
                  padding: "10px 12px",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}
              >
                {/* Cabecera del Técnico */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      background: t.color,
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      fontSize: "0.78rem",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
                    }}>
                      {isUnassigned ? "?" : (t.name?.[0]?.toUpperCase() || "T")}
                    </div>
                    <div>
                      <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--text-color)", display: "block", lineHeight: "1.1" }}>
                        {t.name}
                      </span>
                      <span style={{ fontSize: "0.68rem", color: "#64748b" }}>
                        {isUnassigned ? "Cajas sin técnico" : t.email}
                      </span>
                    </div>
                  </div>

                  {/* Total Cajas Asignadas */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px", justifyContent: "flex-end" }}>
                      <span style={{ fontSize: "1.15rem", fontWeight: 900, color: isUnassigned ? "#f43f5e" : "var(--primary-color)" }}>
                        {t.total}
                      </span>
                      <span style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 700 }}>cajas</span>
                    </div>
                    <span style={{ fontSize: "0.65rem", fontWeight: 800, padding: "1px 5px", borderRadius: "6px", background: "var(--bg-color)", color: "#64748b", border: "1px solid var(--border-color)" }}>
                      {percent}% del total
                    </span>
                  </div>
                </div>

                {/* Barra de Distribución Visual por Estados */}
                {t.total > 0 && (
                  <div style={{ width: "100%", height: "7px", background: "var(--bg-color)", borderRadius: "10px", overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${(t.byStatus.PENDIENTE / t.total) * 100}%`, background: "#f59e0b" }} title={`Pendiente: ${t.byStatus.PENDIENTE}`} />
                    <div style={{ width: `${(t.byStatus.CORRECTO / t.total) * 100}%`, background: "#10b981" }} title={`Correcto: ${t.byStatus.CORRECTO}`} />
                    <div style={{ width: `${(t.byStatus.FALLO / t.total) * 100}%`, background: "#ef4444" }} title={`Fallo: ${t.byStatus.FALLO}`} />
                    <div style={{ width: `${(t.byStatus.REVISADO / t.total) * 100}%`, background: "#8b5cf6" }} title={`Revisado: ${t.byStatus.REVISADO}`} />
                  </div>
                )}

                {/* Desglose Chips de Estado */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
                  <div style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)", borderRadius: "6px", padding: "4px", textAlign: "center" }}>
                    <span style={{ fontSize: "0.62rem", color: "#d97706", fontWeight: 700, display: "block" }}>Pend.</span>
                    <span style={{ fontSize: "0.82rem", fontWeight: 900, color: "#d97706" }}>{t.byStatus.PENDIENTE || 0}</span>
                  </div>
                  <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "6px", padding: "4px", textAlign: "center" }}>
                    <span style={{ fontSize: "0.62rem", color: "#059669", fontWeight: 700, display: "block" }}>Corr.</span>
                    <span style={{ fontSize: "0.82rem", fontWeight: 900, color: "#059669" }}>{t.byStatus.CORRECTO || 0}</span>
                  </div>
                  <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: "6px", padding: "4px", textAlign: "center" }}>
                    <span style={{ fontSize: "0.62rem", color: "#dc2626", fontWeight: 700, display: "block" }}>Fallo</span>
                    <span style={{ fontSize: "0.82rem", fontWeight: 900, color: "#dc2626" }}>{t.byStatus.FALLO || 0}</span>
                  </div>
                  <div style={{ background: "rgba(139, 92, 246, 0.08)", border: "1px solid rgba(139, 92, 246, 0.25)", borderRadius: "6px", padding: "4px", textAlign: "center" }}>
                    <span style={{ fontSize: "0.62rem", color: "#7c3aed", fontWeight: 700, display: "block" }}>Revis.</span>
                    <span style={{ fontSize: "0.82rem", fontWeight: 900, color: "#7c3aed" }}>{t.byStatus.REVISADO || 0}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </main>
    </div>
  );
}
