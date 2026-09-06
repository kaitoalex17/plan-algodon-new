"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import CtoDrawer from "@/components/CtoDrawer";

interface CtoReportItem {
  id: string;
  num: string;
  numeroNuevo?: string;
  status: string;
  subStatusId?: string;
  subStatusName: string;
  subStatusColor: string;
  category?: string;
  zona: string;
  cluster: string;
  municipio?: string;
  auditor: string;
  auditorId?: string;
  assignedTo: string;
  assignedToId?: string;
  hasFormulario?: boolean;
  hasDrive?: boolean;
  hasAntala?: boolean;
  puertosTotal?: number;
  puertosOcupados?: number;
  potenciaDbm?: number | null;
  lat?: number;
  lng?: number;
  coordenadas?: string;
  driveFolderLink?: string;
  auditDate: string;
  auditTime: string;
  auditTimestamp: number;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
  color?: string;
}

interface SubStatusOption {
  id: string;
  name: string;
  color: string;
  category?: string;
}

interface StatsData {
  total: number;
  correctas: number;
  fallos: number;
  revisadas: number;
  pendientes: number;
  conFormulario: number;
  conDrive: number;
}

export default function ReportsGeneratorPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  // Estados de filtros
  const [auditStatus, setAuditStatus] = useState<string>("AUDITED");
  const [auditedById, setAuditedById] = useState<string>("ALL");
  const [assignedToId, setAssignedToId] = useState<string>("ALL");
  const [subStatusId, setSubStatusId] = useState<string>("ALL");
  const [category, setCategory] = useState<string>("ALL");
  const [zona, setZona] = useState<string>("ALL");
  const [cluster, setCluster] = useState<string>("ALL");
  const [municipio, setMunicipio] = useState<string>("ALL");
  const [hasFormulario, setHasFormulario] = useState<string>("ALL");
  const [hasDrive, setHasDrive] = useState<string>("ALL");
  const [hasAntala, setHasAntala] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Paginación
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(50);

  // Datos y metadatos
  const [loading, setLoading] = useState<boolean>(true);
  const [ctos, setCtos] = useState<CtoReportItem[]>([]);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [stats, setStats] = useState<StatsData>({
    total: 0,
    correctas: 0,
    fallos: 0,
    revisadas: 0,
    pendientes: 0,
    conFormulario: 0,
    conDrive: 0
  });

  const [filterOptions, setFilterOptions] = useState<{
    users: UserOption[];
    subStatuses: SubStatusOption[];
    zonas: string[];
    clusters: string[];
    municipios: string[];
  }>({
    users: [],
    subStatuses: [],
    zonas: [],
    clusters: [],
    municipios: []
  });

  // Modal CTO Drawer
  const [selectedCto, setSelectedCto] = useState<any | null>(null);

  // Verificación de acceso
  useEffect(() => {
    if (authStatus === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "ADMIN" && role !== "GESTOR") {
        router.push("/");
      }
    } else if (authStatus === "unauthenticated") {
      router.push("/login");
    }
  }, [authStatus, session, router]);

  // Carga de datos
  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("auditStatus", auditStatus);
      params.set("auditedById", auditedById);
      params.set("assignedToId", assignedToId);
      params.set("subStatusId", subStatusId);
      params.set("category", category);
      params.set("zona", zona);
      params.set("cluster", cluster);
      params.set("municipio", municipio);
      params.set("hasFormulario", hasFormulario);
      params.set("hasDrive", hasDrive);
      params.set("hasAntala", hasAntala);
      if (search.trim()) params.set("search", search.trim());
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("page", page.toString());
      params.set("limit", limit.toString());

      const res = await fetch(`/api/admin/reports?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCtos(data.ctos || []);
        setTotalPages(data.totalPages || 1);
        if (data.stats) setStats(data.stats);
        if (data.filterOptions) setFilterOptions(data.filterOptions);
      } else {
        console.error("Error al cargar datos del informe");
      }
    } catch (err) {
      console.error("Error en la solicitud de informes:", err);
    } finally {
      setLoading(false);
    }
  }, [
    auditStatus,
    auditedById,
    assignedToId,
    subStatusId,
    category,
    zona,
    cluster,
    municipio,
    hasFormulario,
    hasDrive,
    hasAntala,
    search,
    startDate,
    endDate,
    page,
    limit
  ]);

  useEffect(() => {
    if (authStatus === "authenticated") {
      loadReports();
    }
  }, [loadReports, authStatus]);

  // Restablecer paginación al cambiar filtros
  const handleFilterChange = () => {
    setPage(1);
  };

  // Presets de fecha
  const applyDatePreset = (preset: "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "clear") => {
    const today = new Date();
    const todayStr = today.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

    if (preset === "clear") {
      setStartDate("");
      setEndDate("");
    } else if (preset === "today") {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "yesterday") {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = y.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === "last7") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }));
      setEndDate(todayStr);
    } else if (preset === "thisMonth") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDay.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }));
      setEndDate(todayStr);
    } else if (preset === "lastMonth") {
      const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      setStartDate(firstDayLastMonth.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }));
      setEndDate(lastDayLastMonth.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }));
    }
    setPage(1);
  };

  const handleClearAllFilters = () => {
    setAuditStatus("AUDITED");
    setAuditedById("ALL");
    setAssignedToId("ALL");
    setSubStatusId("ALL");
    setCategory("ALL");
    setZona("ALL");
    setCluster("ALL");
    setMunicipio("ALL");
    setHasFormulario("ALL");
    setHasDrive("ALL");
    setHasAntala("ALL");
    setSearch("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const hasActiveFilters =
    auditStatus !== "AUDITED" ||
    auditedById !== "ALL" ||
    assignedToId !== "ALL" ||
    subStatusId !== "ALL" ||
    category !== "ALL" ||
    zona !== "ALL" ||
    cluster !== "ALL" ||
    municipio !== "ALL" ||
    hasFormulario !== "ALL" ||
    hasDrive !== "ALL" ||
    hasAntala !== "ALL" ||
    search.trim() !== "" ||
    startDate !== "" ||
    endDate !== "";

  // Generador de URLs de exportación
  const getExportUrl = (fmt: "xlsx" | "xls" | "pdf") => {
    const params = new URLSearchParams();
    params.set("format", fmt);
    params.set("auditStatus", auditStatus);
    if (auditedById !== "ALL") params.set("auditedById", auditedById);
    if (assignedToId !== "ALL") params.set("assignedToId", assignedToId);
    if (subStatusId !== "ALL") params.set("subStatusId", subStatusId);
    if (category !== "ALL") params.set("category", category);
    if (zona !== "ALL") params.set("zona", zona);
    if (cluster !== "ALL") params.set("cluster", cluster);
    if (municipio !== "ALL") params.set("municipio", municipio);
    if (hasFormulario !== "ALL") params.set("hasFormulario", hasFormulario);
    if (hasDrive !== "ALL") params.set("hasDrive", hasDrive);
    if (hasAntala !== "ALL") params.set("hasAntala", hasAntala);
    if (search.trim()) params.set("search", search.trim());
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return `/api/admin/reports/export?${params.toString()}`;
  };

  // Cálculo de porcentajes para métricas
  const totalFiltradas = stats.total || 0;
  const correctasPct = totalFiltradas > 0 ? Math.round((stats.correctas / totalFiltradas) * 100) : 0;
  const fallosPct = totalFiltradas > 0 ? Math.round((stats.fallos / totalFiltradas) * 100) : 0;
  const conFormularioPct = totalFiltradas > 0 ? Math.round((stats.conFormulario / totalFiltradas) * 100) : 0;
  const conDrivePct = totalFiltradas > 0 ? Math.round((stats.conDrive / totalFiltradas) * 100) : 0;

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1500px", margin: "0 auto", color: "var(--text-color)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      
      {/* CABECERA SUPERIOR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <Link href="/" className="btn" style={{ padding: "6px 12px", fontSize: "0.82rem", background: "var(--border-color)", color: "var(--text-color)" }}>
              ← Mapa Principal
            </Link>
            <Link href="/admin" className="btn" style={{ padding: "6px 12px", fontSize: "0.82rem", background: "var(--border-color)", color: "var(--text-color)" }}>
              Panel Admin
            </Link>
            <Link href="/gestion" className="btn" style={{ padding: "6px 12px", fontSize: "0.82rem", background: "var(--border-color)", color: "var(--text-color)" }}>
              Panel Gestión
            </Link>
          </div>
          <h1 style={{ fontSize: "1.85rem", fontWeight: 900, margin: "4px 0", color: "var(--text-color)", display: "flex", alignItems: "center", gap: "10px" }}>
            <span>📑</span> Generador de Informes de Auditoría
          </h1>
          <p style={{ fontSize: "0.86rem", color: "#64748b", margin: 0 }}>
            Filtra CTOs auditadas o por estado, selecciona auditores, técnicos, subestados y exporta informes completos en PDF y Excel.
          </p>
        </div>

        {/* BOTONES DE EXPORTACIÓN */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {/* Excel Moderno (.xlsx) */}
          <a
            href={getExportUrl("xlsx")}
            download
            className="btn"
            style={{
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "white",
              fontWeight: 800,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "10px",
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
              border: "none",
              textDecoration: "none"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Excel (.xlsx)
          </a>

          {/* Excel Clásico (.xls) */}
          <a
            href={getExportUrl("xls")}
            download
            className="btn"
            style={{
              background: "var(--card-bg)",
              color: "#10b981",
              border: "1.5px solid #10b981",
              fontWeight: 800,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "10px",
              textDecoration: "none"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Excel Clásico (.xls)
          </a>

          {/* PDF */}
          <a
            href={getExportUrl("pdf")}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{
              background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              color: "white",
              fontWeight: 800,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "10px",
              boxShadow: "0 4px 12px rgba(239, 68, 68, 0.3)",
              border: "none",
              textDecoration: "none"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            Informe PDF
          </a>
        </div>
      </div>

      {/* TARJETAS DE MÉTRICAS EJECUTIVAS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "1.5rem" }}>
        {/* Total */}
        <div className="glass-panel" style={{ padding: "1rem", borderRadius: "12px", background: "var(--card-bg)", border: "1px solid var(--border-color)", textAlign: "center" }}>
          <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Total Registros</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text-color)", marginTop: "4px" }}>{totalFiltradas}</div>
        </div>

        {/* Correctas */}
        <div className="glass-panel" style={{ padding: "1rem", borderRadius: "12px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.3)", textAlign: "center" }}>
          <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "#10b981", textTransform: "uppercase" }}>Correctas</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#10b981", marginTop: "4px" }}>
            {stats.correctas} <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>({correctasPct}%)</span>
          </div>
        </div>

        {/* Fallos */}
        <div className="glass-panel" style={{ padding: "1rem", borderRadius: "12px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.3)", textAlign: "center" }}>
          <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "#ef4444", textTransform: "uppercase" }}>Fallos</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#ef4444", marginTop: "4px" }}>
            {stats.fallos} <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>({fallosPct}%)</span>
          </div>
        </div>

        {/* Revisadas */}
        <div className="glass-panel" style={{ padding: "1rem", borderRadius: "12px", background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.3)", textAlign: "center" }}>
          <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "#3b82f6", textTransform: "uppercase" }}>Revisadas</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#3b82f6", marginTop: "4px" }}>{stats.revisadas}</div>
        </div>

        {/* Pendientes */}
        <div className="glass-panel" style={{ padding: "1rem", borderRadius: "12px", background: "var(--card-bg)", border: "1px solid var(--border-color)", textAlign: "center" }}>
          <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>Pendientes</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#94a3b8", marginTop: "4px" }}>{stats.pendientes}</div>
        </div>

        {/* Con Formulario */}
        <div className="glass-panel" style={{ padding: "1rem", borderRadius: "12px", background: "var(--card-bg)", border: "1px solid var(--border-color)", textAlign: "center" }}>
          <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "#f59e0b", textTransform: "uppercase" }}>Con Formulario</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#f59e0b", marginTop: "4px" }}>
            {stats.conFormulario} <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>({conFormularioPct}%)</span>
          </div>
        </div>

        {/* Con Google Drive */}
        <div className="glass-panel" style={{ padding: "1rem", borderRadius: "12px", background: "var(--card-bg)", border: "1px solid var(--border-color)", textAlign: "center" }}>
          <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "#0284c7", textTransform: "uppercase" }}>Con Drive</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#0284c7", marginTop: "4px" }}>
            {stats.conDrive} <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>({conDrivePct}%)</span>
          </div>
        </div>
      </div>

      {/* PANEL DE FILTROS */}
      <div className="glass-panel" style={{ padding: "1.25rem 1.5rem", borderRadius: "14px", background: "var(--card-bg)", border: "1.5px solid var(--border-color)", marginBottom: "1.5rem" }}>
        
        {/* Header de Filtros con presets y botón limpiar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              🔍 Filtros de Búsqueda y Selección
            </span>
            {hasActiveFilters && (
              <span style={{ fontSize: "0.75rem", background: "rgba(249, 115, 22, 0.15)", color: "var(--primary-color)", padding: "2px 8px", borderRadius: "12px", fontWeight: 700 }}>
                Filtros Activos
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b" }}>Fechas:</span>
            <button type="button" onClick={() => applyDatePreset("today")} className="btn" style={{ padding: "3px 8px", fontSize: "0.75rem", background: "var(--bg-color)", border: "1px solid var(--border-color)", fontWeight: 700 }}>Hoy</button>
            <button type="button" onClick={() => applyDatePreset("yesterday")} className="btn" style={{ padding: "3px 8px", fontSize: "0.75rem", background: "var(--bg-color)", border: "1px solid var(--border-color)", fontWeight: 700 }}>Ayer</button>
            <button type="button" onClick={() => applyDatePreset("last7")} className="btn" style={{ padding: "3px 8px", fontSize: "0.75rem", background: "var(--bg-color)", border: "1px solid var(--border-color)", fontWeight: 700 }}>Últimos 7 días</button>
            <button type="button" onClick={() => applyDatePreset("thisMonth")} className="btn" style={{ padding: "3px 8px", fontSize: "0.75rem", background: "var(--bg-color)", border: "1px solid var(--border-color)", fontWeight: 700 }}>Este Mes</button>
            <button type="button" onClick={() => applyDatePreset("lastMonth")} className="btn" style={{ padding: "3px 8px", fontSize: "0.75rem", background: "var(--bg-color)", border: "1px solid var(--border-color)", fontWeight: 700 }}>Mes Anterior</button>
            <button type="button" onClick={() => applyDatePreset("clear")} className="btn" style={{ padding: "3px 8px", fontSize: "0.75rem", background: "var(--bg-color)", border: "1px solid var(--border-color)", fontWeight: 700, color: "#64748b" }}>Histórico Completo</button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                style={{ background: "transparent", border: "none", color: "#ef4444", fontSize: "0.8rem", fontWeight: 800, cursor: "pointer", marginLeft: "10px", display: "flex", alignItems: "center", gap: "4px" }}
              >
                ✕ Limpiar Filtros
              </button>
            )}
          </div>
        </div>

        {/* Cuadrícula de Controles de Filtro */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))", gap: "12px" }}>
          
          {/* 1. Estado de Auditoría */}
          <div>
            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
              Estado de Auditoría
            </label>
            <select
              value={auditStatus}
              onChange={(e) => { setAuditStatus(e.target.value); handleFilterChange(); }}
              className="input-field"
              style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", borderRadius: "8px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", fontWeight: 700 }}
            >
              <option value="AUDITED">✅ Solo Auditadas (Correcto + Fallo)</option>
              <option value="AUDITED_AND_REVISED">🔍 Auditadas y Revisadas</option>
              <option value="CORRECTO">🟢 Solo Correctas</option>
              <option value="FALLO">🔴 Solo Fallos</option>
              <option value="REVISADO">🔵 Solo Revisadas</option>
              <option value="PENDIENTE">⚪ Solo Pendientes</option>
              <option value="ALL">📋 Todas (Sin filtrar estado)</option>
            </select>
          </div>

          {/* 2. Persona que Auditó */}
          <div>
            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
              Auditado por (Auditor)
            </label>
            <select
              value={auditedById}
              onChange={(e) => { setAuditedById(e.target.value); handleFilterChange(); }}
              className="input-field"
              style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", borderRadius: "8px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", fontWeight: 600 }}
            >
              <option value="ALL">Todos los Auditores</option>
              <option value="NONE">Sin Auditor Registrado</option>
              {filterOptions.users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email} ({u.role})
                </option>
              ))}
            </select>
          </div>

          {/* 3. Técnico Asignado */}
          <div>
            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
              Técnico Asignado
            </label>
            <select
              value={assignedToId}
              onChange={(e) => { setAssignedToId(e.target.value); handleFilterChange(); }}
              className="input-field"
              style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", borderRadius: "8px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", fontWeight: 600 }}
            >
              <option value="ALL">Todos los Técnicos</option>
              <option value="NONE">Sin Técnico Asignado</option>
              {filterOptions.users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Subestado */}
          <div>
            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
              Subestado
            </label>
            <select
              value={subStatusId}
              onChange={(e) => { setSubStatusId(e.target.value); handleFilterChange(); }}
              className="input-field"
              style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", borderRadius: "8px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", fontWeight: 600 }}
            >
              <option value="ALL">Todos los Subestados</option>
              <option value="NONE">Sin Subestado</option>
              {filterOptions.subStatuses.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Categoría */}
          <div>
            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
              Categoría
            </label>
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); handleFilterChange(); }}
              className="input-field"
              style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", borderRadius: "8px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", fontWeight: 600 }}
            >
              <option value="ALL">Todas las Categorías</option>
              <option value="AUDITORIA">AUDITORIA</option>
              <option value="PROGRAMADA">PROGRAMADA (Reparos)</option>
            </select>
          </div>

          {/* 6. Fechas: Desde */}
          <div>
            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
              Fecha Desde
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); handleFilterChange(); }}
              className="input-field"
              style={{ width: "100%", padding: "6px 10px", fontSize: "0.85rem", borderRadius: "8px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", fontWeight: 600 }}
            />
          </div>

          {/* 7. Fechas: Hasta */}
          <div>
            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
              Fecha Hasta
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); handleFilterChange(); }}
              className="input-field"
              style={{ width: "100%", padding: "6px 10px", fontSize: "0.85rem", borderRadius: "8px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", fontWeight: 600 }}
            />
          </div>

          {/* 8. Zona */}
          <div>
            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
              Zona
            </label>
            <select
              value={zona}
              onChange={(e) => { setZona(e.target.value); handleFilterChange(); }}
              className="input-field"
              style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", borderRadius: "8px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)" }}
            >
              <option value="ALL">Todas las Zonas</option>
              {filterOptions.zonas.map(z => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </div>

          {/* 9. Cluster */}
          <div>
            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
              Cluster
            </label>
            <select
              value={cluster}
              onChange={(e) => { setCluster(e.target.value); handleFilterChange(); }}
              className="input-field"
              style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", borderRadius: "8px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)" }}
            >
              <option value="ALL">Todos los Clusters</option>
              {filterOptions.clusters.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 10. Municipio */}
          <div>
            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
              Municipio
            </label>
            <select
              value={municipio}
              onChange={(e) => { setMunicipio(e.target.value); handleFilterChange(); }}
              className="input-field"
              style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", borderRadius: "8px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)" }}
            >
              <option value="ALL">Todos los Municipios</option>
              {filterOptions.municipios.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* 11. Formulario Checklist */}
          <div>
            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
              Formulario de Campo
            </label>
            <select
              value={hasFormulario}
              onChange={(e) => { setHasFormulario(e.target.value); handleFilterChange(); }}
              className="input-field"
              style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", borderRadius: "8px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)" }}
            >
              <option value="ALL">Cualquiera</option>
              <option value="true">✓ Con Formulario Relleno</option>
              <option value="false">✗ Sin Formulario</option>
            </select>
          </div>

          {/* 12. Google Drive */}
          <div>
            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
              Carpeta Google Drive
            </label>
            <select
              value={hasDrive}
              onChange={(e) => { setHasDrive(e.target.value); handleFilterChange(); }}
              className="input-field"
              style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", borderRadius: "8px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)" }}
            >
              <option value="ALL">Cualquiera</option>
              <option value="true">✓ Con Carpeta Creada</option>
              <option value="false">✗ Sin Carpeta Drive</option>
            </select>
          </div>

          {/* 13. Antala Checklist */}
          <div>
            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
              Registro Antala
            </label>
            <select
              value={hasAntala}
              onChange={(e) => { setHasAntala(e.target.value); handleFilterChange(); }}
              className="input-field"
              style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", borderRadius: "8px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)" }}
            >
              <option value="ALL">Cualquiera</option>
              <option value="true">✓ Con Registro Antala</option>
              <option value="false">✗ Sin Antala</option>
            </select>
          </div>

          {/* 14. Buscador libre */}
          <div>
            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>
              Buscador por Texto
            </label>
            <input
              type="text"
              placeholder="Nº CTO, nuevo código..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); handleFilterChange(); }}
              className="input-field"
              style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", borderRadius: "8px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)" }}
            />
          </div>

        </div>
      </div>

      {/* TABLA DE RESULTADOS */}
      <div className="glass-panel" style={{ borderRadius: "14px", background: "var(--card-bg)", border: "1.5px solid var(--border-color)", overflow: "hidden", marginBottom: "1.5rem" }}>
        
        {/* Barra superior de la tabla con paginación */}
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-color)" }}>
            Mostrando {ctos.length} CTOs de {totalFiltradas} coincidentes
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem" }}>
              <span>Filas por pág:</span>
              <select
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                style={{ padding: "3px 6px", borderRadius: "6px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", fontSize: "0.82rem" }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="btn"
                style={{ padding: "4px 10px", fontSize: "0.8rem", background: "var(--bg-color)", border: "1px solid var(--border-color)" }}
              >
                ← Anterior
              </button>
              <span style={{ fontSize: "0.82rem", fontWeight: 800 }}>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="btn"
                style={{ padding: "4px 10px", fontSize: "0.8rem", background: "var(--bg-color)", border: "1px solid var(--border-color)" }}
              >
                Siguiente →
              </button>
            </div>
          </div>
        </div>

        {/* Contenido de la Tabla */}
        {loading ? (
          <div style={{ padding: "4rem", textAlign: "center", color: "#64748b", fontWeight: 700 }}>
            ⏳ Consultando y generando informe...
          </div>
        ) : ctos.length === 0 ? (
          <div style={{ padding: "4rem", textAlign: "center", color: "#64748b" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📭</div>
            <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>No se encontraron CTOs con los filtros seleccionados</div>
            <p style={{ fontSize: "0.85rem", marginTop: "4px" }}>Intenta ajustar o limpiar los filtros para ver más resultados.</p>
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="btn btn-primary"
              style={{ marginTop: "1rem", padding: "6px 14px", fontSize: "0.85rem" }}
            >
              Restablecer Filtros
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.84rem" }}>
              <thead>
                <tr style={{ background: "rgba(0, 0, 0, 0.04)", borderBottom: "1.5px solid var(--border-color)", color: "#64748b", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.5px" }}>
                  <th style={{ padding: "10px 14px" }}>Nº CTO</th>
                  <th style={{ padding: "10px 14px" }}>Estado</th>
                  <th style={{ padding: "10px 14px" }}>Subestado</th>
                  <th style={{ padding: "10px 14px" }}>Auditado por</th>
                  <th style={{ padding: "10px 14px" }}>Técnico Asignado</th>
                  <th style={{ padding: "10px 14px" }}>Zona / Cluster</th>
                  <th style={{ padding: "10px 14px" }}>Puertos</th>
                  <th style={{ padding: "10px 14px" }}>Checklist</th>
                  <th style={{ padding: "10px 14px" }}>Fecha Auditoría</th>
                  <th style={{ padding: "10px 14px", textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ctos.map((item) => {
                  let statusBg = "#64748b";
                  let statusColor = "#ffffff";
                  if (item.status === "CORRECTO") {
                    statusBg = "#10b981";
                  } else if (item.status === "FALLO") {
                    statusBg = "#ef4444";
                  } else if (item.status === "REVISADO") {
                    statusBg = "#3b82f6";
                  }

                  return (
                    <tr
                      key={item.id}
                      style={{ borderBottom: "1px solid var(--border-color)", transition: "background 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* Nº CTO */}
                      <td style={{ padding: "10px 14px", fontWeight: 800 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>{item.num}</span>
                          {item.numeroNuevo && (
                            <span style={{ fontSize: "0.72rem", background: "rgba(249, 115, 22, 0.15)", color: "var(--primary-color)", padding: "1px 5px", borderRadius: "4px" }}>
                              {item.numeroNuevo}
                            </span>
                          )}
                        </div>
                        {item.category === "PROGRAMADA" && (
                          <span style={{ fontSize: "0.68rem", color: "#a855f7", fontWeight: 800 }}>REPARO</span>
                        )}
                      </td>

                      {/* Estado */}
                      <td style={{ padding: "10px 14px" }}>
                        <span
                          style={{
                            background: statusBg,
                            color: statusColor,
                            fontSize: "0.72rem",
                            fontWeight: 800,
                            padding: "3px 8px",
                            borderRadius: "12px",
                            display: "inline-block"
                          }}
                        >
                          {item.status}
                        </span>
                      </td>

                      {/* Subestado */}
                      <td style={{ padding: "10px 14px" }}>
                        <span
                          style={{
                            background: `${item.subStatusColor}22`,
                            color: item.subStatusColor,
                            border: `1px solid ${item.subStatusColor}55`,
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: "6px",
                            display: "inline-block"
                          }}
                        >
                          {item.subStatusName}
                        </span>
                      </td>

                      {/* Auditor */}
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 600 }}>{item.auditor}</div>
                      </td>

                      {/* Técnico Asignado */}
                      <td style={{ padding: "10px 14px", color: "#64748b" }}>
                        {item.assignedTo}
                      </td>

                      {/* Zona / Cluster */}
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 600 }}>{item.zona}</div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{item.cluster} {item.municipio ? `• ${item.municipio}` : ""}</div>
                      </td>

                      {/* Puertos */}
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontWeight: 700 }}>
                          {item.puertosOcupados || 0} / {item.puertosTotal || 16}
                        </span>
                      </td>

                      {/* Checklist */}
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <span title={item.hasFormulario ? "Formulario Relleno" : "Sin Formulario"} style={{ fontSize: "0.8rem", opacity: item.hasFormulario ? 1 : 0.2 }}>
                            📝
                          </span>
                          <span title={item.hasDrive ? "Carpeta Drive Sincronizada" : "Sin Drive"} style={{ fontSize: "0.8rem", opacity: item.hasDrive ? 1 : 0.2 }}>
                            ☁️
                          </span>
                          <span title={item.hasAntala ? "Registrado en Antala" : "Sin Antala"} style={{ fontSize: "0.8rem", opacity: item.hasAntala ? 1 : 0.2 }}>
                            📡
                          </span>
                        </div>
                      </td>

                      {/* Fecha de Auditoría */}
                      <td style={{ padding: "10px 14px" }}>
                        <div>{item.auditDate}</div>
                        <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{item.auditTime}</div>
                      </td>

                      {/* Acciones */}
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                          {/* Abrir Ficha */}
                          <button
                            type="button"
                            onClick={() => setSelectedCto(item)}
                            className="btn"
                            style={{ padding: "4px 8px", fontSize: "0.74rem", background: "var(--primary-color)", color: "white", fontWeight: 700 }}
                            title="Abrir ficha detallada de la CTO"
                          >
                            Ver Ficha
                          </button>

                          {/* Ver en Mapa Principal */}
                          <a
                            href={`/?ctoId=${item.id}&zoom=19`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn"
                            style={{ padding: "4px 8px", fontSize: "0.74rem", background: "var(--border-color)", color: "var(--text-color)" }}
                            title="Localizar en el mapa"
                          >
                            🗺️
                          </a>

                          {/* Google Maps si tiene coordenadas */}
                          {item.lat && item.lng && (
                            <a
                              href={`https://maps.google.com/?q=${item.lat},${item.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn"
                              style={{ padding: "4px 8px", fontSize: "0.74rem", background: "var(--border-color)", color: "var(--text-color)" }}
                              title="Abrir en Google Maps"
                            >
                              📍
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DRAWER DETALLADO DE CTO */}
      {selectedCto && (
        <CtoDrawer
          cto={selectedCto}
          onClose={() => setSelectedCto(null)}
          onUpdate={() => {
            loadReports();
          }}
          users={filterOptions.users}
          subStatuses={filterOptions.subStatuses}
        />
      )}

    </div>
  );
}
