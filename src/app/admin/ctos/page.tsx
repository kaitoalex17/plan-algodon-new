"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type SubStatus = { id: string; name: string; color: string };
type User = { id: string; name: string; email: string };

type CTO = {
  id: string;
  num: string;
  numeroNuevo: string | null;
  municipio: string | null;
  colocacion: string | null;
  lat: number;
  lng: number;
  status: string;
  notas: string | null;
  subStatusId: string | null;
  subStatus: SubStatus | null;
  assignedToId: string | null;
  assignedTo: User | null;
};

export default function AdminCtosPage() {
  // Datos principales
  const [ctos, setCtos] = useState<CTO[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Opciones de desplegables
  const [subStatuses, setSubStatuses] = useState<SubStatus[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Filtros
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAssigned, setFilterAssigned] = useState("");
  const [limit] = useState(50); // 50 por página fijo

  // Selección múltiple
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modales
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCto, setEditingCto] = useState<CTO | null>(null);
  const [saving, setSaving] = useState(false);

  // Formulario manual
  const [formNum, setFormNum] = useState("");
  const [formNumeroNuevo, setFormNumeroNuevo] = useState("");
  const [formLat, setFormLat] = useState("");
  const [formLng, setFormLng] = useState("");
  const [formMunicipio, setFormMunicipio] = useState("");
  const [formColocacion, setFormColocacion] = useState("");
  const [formStatus, setFormStatus] = useState("PENDIENTE");
  const [formSubStatusId, setFormSubStatusId] = useState("");
  const [formAssignedToId, setFormAssignedToId] = useState("");
  const [formNotas, setFormNotas] = useState("");
  const [formZona, setFormZona] = useState("");
  const [formCluster, setFormCluster] = useState("");

  // Acciones masivas
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkSubStatus, setBulkSubStatus] = useState("");
  const [bulkAssign, setBulkAssign] = useState("");
  const [applyingBulk, setApplyingBulk] = useState(false);

  // Cargar datos
  const fetchCtos = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(currentPage),
      limit: String(limit),
      search,
      status: filterStatus,
      assignedToId: filterAssigned,
    });
    
    try {
      const res = await fetch(`/api/admin/ctos?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCtos(data.ctos);
        setTotalCount(data.totalCount);
        setTotalPages(data.totalPages);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentPage, limit, search, filterStatus, filterAssigned]);

  const fetchOptions = useCallback(async () => {
    try {
      const [resSub, resUsers] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/users"),
      ]);
      if (resSub.ok) setSubStatuses(await resSub.json());
      if (resUsers.ok) setUsers(await resUsers.json());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchCtos();
  }, [fetchCtos]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  // Manejar selección
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(ctos.map((c) => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  // Abrir Modal de Creación
  const openCreate = () => {
    setEditingCto(null);
    setFormNum("");
    setFormNumeroNuevo("");
    setFormLat("");
    setFormLng("");
    setFormMunicipio("");
    setFormColocacion("");
    setFormStatus("PENDIENTE");
    setFormSubStatusId("");
    setFormAssignedToId("");
    setFormNotas("");
    setFormZona("");
    setFormCluster("");
    setShowFormModal(true);
  };

  // Abrir Modal de Edición
  const openEdit = (cto: CTO) => {
    setEditingCto(cto);
    setFormNum(cto.num);
    setFormNumeroNuevo(cto.numeroNuevo || "");
    setFormLat(String(cto.lat));
    setFormLng(String(cto.lng));
    setFormMunicipio(cto.municipio || "");
    setFormColocacion(cto.colocacion || "");
    setFormStatus(cto.status);
    setFormSubStatusId(cto.subStatusId || "");
    setFormAssignedToId(cto.assignedToId || "");
    setFormNotas(cto.notas || "");
    setFormZona((cto as any).zona || "");
    setFormCluster((cto as any).cluster || "");
    setShowFormModal(true);
  };

  // Guardar Formulario (Crear/Editar)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNum || !formLat || !formLng) {
      alert("Número, Latitud y Longitud son obligatorios");
      return;
    }
    setSaving(true);

    const payload = {
      num: formNum,
      numeroNuevo: formNumeroNuevo || null,
      lat: parseFloat(formLat),
      lng: parseFloat(formLng),
      municipio: formMunicipio || null,
      colocacion: formColocacion || null,
      status: formStatus,
      subStatusId: formSubStatusId || null,
      assignedToId: formAssignedToId || null,
      notas: formNotas || null,
      zona: formZona || null,
      cluster: formCluster || null,
    };

    const url = editingCto ? `/api/ctos/${editingCto.id}` : "/api/admin/ctos";
    const method = editingCto ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setShowFormModal(false);
      fetchCtos();
    } else {
      const data = await res.json();
      alert(data.error || "Error al guardar la CTO");
    }
    setSaving(false);
  };

  // Borrar CTO individual
  const handleDeleteOne = async (id: string) => {
    if (!confirm("¿Seguro que deseas eliminar esta CTO de forma permanente?")) return;
    const res = await fetch(`/api/ctos/${id}`, { method: "DELETE" });
    if (res.ok) {
      fetchCtos();
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    } else {
      alert("Error al eliminar la CTO");
    }
  };

  // Aplicar Actualización Masiva
  const handleBulkUpdate = async () => {
    if (selectedIds.length === 0) return;
    if (!bulkStatus && !bulkSubStatus && !bulkAssign) {
      alert("Selecciona al menos una acción a aplicar");
      return;
    }

    setApplyingBulk(true);
    const payload: any = { ids: selectedIds };
    
    if (bulkStatus) payload.status = bulkStatus;
    if (bulkSubStatus) payload.subStatusId = bulkSubStatus === "clear" ? null : bulkSubStatus;
    if (bulkAssign) payload.assignedToId = bulkAssign === "clear" ? null : bulkAssign;

    const res = await fetch("/api/admin/ctos/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      alert(`Se actualizaron ${selectedIds.length} CTOs correctamente`);
      setSelectedIds([]);
      setBulkStatus("");
      setBulkSubStatus("");
      setBulkAssign("");
      fetchCtos();
    } else {
      alert("Error al aplicar cambios masivos");
    }
    setApplyingBulk(false);
  };

  // Aplicar Eliminación Masiva
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente las ${selectedIds.length} CTOs seleccionadas? Esto no se puede deshacer.`)) return;

    setApplyingBulk(true);
    const res = await fetch("/api/admin/ctos/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });

    if (res.ok) {
      alert(`Se eliminaron ${selectedIds.length} CTOs correctamente`);
      setSelectedIds([]);
      fetchCtos();
    } else {
      alert("Error al eliminar CTOs");
    }
    setApplyingBulk(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", padding: "1.5rem" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <div>
            <h1 style={{ fontSize: "1.8rem", fontWeight: 700, color: "#111827" }}>Administración de CTOs</h1>
            <p style={{ color: "#6b7280", marginTop: "0.25rem" }}>Gestión integral, alta manual y edición masiva de nodos</p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <Link href="/admin" className="btn" style={{ background: "#e5e7eb", color: "#374151" }}>
              Volver al Admin
            </Link>
            <button onClick={openCreate} className="btn btn-primary">
              + Crear CTO Manual
            </button>
          </div>
        </div>

        {/* Panel de Filtros y Buscador */}
        <div className="glass-panel" style={{ padding: "1.5rem", background: "white", marginBottom: "1.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Buscar</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Número, municipio, colocación..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              style={{ minHeight: "44px", padding: "8px 12px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Estado</label>
            <select 
              className="input-field"
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              style={{ minHeight: "44px", padding: "8px 12px" }}
            >
              <option value="">Todos los estados</option>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="CORRECTO">CORRECTO</option>
              <option value="FALLO">FALLO</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>Asignado a</label>
            <select 
              className="input-field"
              value={filterAssigned}
              onChange={(e) => { setFilterAssigned(e.target.value); setCurrentPage(1); }}
              style={{ minHeight: "44px", padding: "8px 12px" }}
            >
              <option value="">Todos los técnicos</option>
              <option value="unassigned">Sin asignar</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button 
              onClick={() => { setSearch(""); setFilterStatus(""); setFilterAssigned(""); setCurrentPage(1); }}
              className="btn"
              style={{ background: "#cbd5e1", color: "#334155", width: "100%", minHeight: "44px", padding: "8px" }}
            >
              Limpiar Filtros
            </button>
          </div>
        </div>

        {/* Panel de Acciones Masivas (Solo visible si hay seleccionadas) */}
        {selectedIds.length > 0 && (
          <div className="glass-panel" style={{ padding: "1.5rem", background: "#fef3c7", border: "1px solid #fcd34d", marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#92400e", marginBottom: "0.75rem" }}>
              Acciones Masivas ({selectedIds.length} CTOs seleccionadas)
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
              <select 
                className="input-field"
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                style={{ flex: 1, minWidth: "150px", minHeight: "40px", padding: "6px 12px", background: "white" }}
              >
                <option value="">Cambiar Estado...</option>
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="CORRECTO">CORRECTO</option>
                <option value="FALLO">FALLO</option>
              </select>

              <select 
                className="input-field"
                value={bulkSubStatus}
                onChange={(e) => setBulkSubStatus(e.target.value)}
                style={{ flex: 1, minWidth: "150px", minHeight: "40px", padding: "6px 12px", background: "white" }}
              >
                <option value="">Cambiar Subestado...</option>
                <option value="clear">Quitar Subestado</option>
                {subStatuses.map(sub => (
                  <option key={sub.id} value={sub.id}>{sub.name}</option>
                ))}
              </select>

              <select 
                className="input-field"
                value={bulkAssign}
                onChange={(e) => setBulkAssign(e.target.value)}
                style={{ flex: 1, minWidth: "150px", minHeight: "40px", padding: "6px 12px", background: "white" }}
              >
                <option value="">Asignar a Técnico...</option>
                <option value="clear">Quitar Asignación</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
              </select>

              <button 
                onClick={handleBulkUpdate}
                disabled={applyingBulk}
                className="btn btn-primary"
                style={{ minHeight: "40px", padding: "6px 16px", fontSize: "0.9rem" }}
              >
                Aplicar Cambios
              </button>

              <button 
                onClick={handleBulkDelete}
                disabled={applyingBulk}
                className="btn"
                style={{ minHeight: "40px", padding: "6px 16px", fontSize: "0.9rem", background: "#ef4444", color: "white" }}
              >
                Eliminar Seleccionadas
              </button>

              <button 
                onClick={() => setSelectedIds([])}
                style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}
              >
                Deseleccionar
              </button>
            </div>
          </div>
        )}

        {/* Tabla de Datos */}
        {loading ? (
          <div className="glass-panel" style={{ padding: "4rem", textAlign: "center", color: "#6b7280", background: "white" }}>Cargando CTOs...</div>
        ) : (
          <div className="glass-panel" style={{ overflow: "hidden", background: "white" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ padding: "12px 16px", width: "40px", textAlign: "center" }}>
                      <input 
                        type="checkbox" 
                        onChange={handleSelectAll} 
                        checked={ctos.length > 0 && selectedIds.length === ctos.length}
                        style={{ transform: "scale(1.2)", cursor: "pointer" }}
                      />
                    </th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>Número</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>Nº Nuevo</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>Municipio</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>OLT</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>Colocación</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>Coordenadas</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>Estado</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>Subestado</th>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>Asignado</th>
                    <th style={{ padding: "12px 16px", textAlign: "center", fontSize: "0.8rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ctos.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ padding: "3rem", textAlign: "center", color: "#6b7280" }}>
                        No se encontraron CTOs con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    ctos.map((cto, idx) => (
                      <tr key={cto.id} style={{ borderBottom: "1px solid #f3f4f6", background: idx % 2 === 0 ? "white" : "#fafafa" }}>
                        <td style={{ padding: "12px 16px", textAlign: "center" }}>
                          <input 
                            type="checkbox" 
                            checked={selectedIds.includes(cto.id)}
                            onChange={(e) => handleSelectOne(cto.id, e.target.checked)}
                            style={{ transform: "scale(1.2)", cursor: "pointer" }}
                          />
                        </td>
                        <td style={{ padding: "12px 16px", fontWeight: 700 }}>{cto.num}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{cto.numeroNuevo || "-"}</td>
                        <td style={{ padding: "12px 16px", color: "#374151" }}>{cto.municipio || "-"}</td>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--primary-color, #FF7900)" }}>{(cto as any).olt || "-"}</td>
                        <td style={{ padding: "12px 16px", color: "#374151" }}>{cto.colocacion || "-"}</td>
                        <td style={{ padding: "12px 16px", fontSize: "0.85rem", color: "#64748b" }}>{cto.lat.toFixed(6)}, {cto.lng.toFixed(6)}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            padding: "4px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 700,
                            background: cto.status === "CORRECTO" ? "#d1fae5" : cto.status === "FALLO" ? "#fee2e2" : "#f3f4f6",
                            color: cto.status === "CORRECTO" ? "#065f46" : cto.status === "FALLO" ? "#991b1b" : "#374151"
                          }}>
                            {cto.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {cto.subStatus ? (
                            <span style={{
                              padding: "4px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 700,
                              background: cto.subStatus.color + "20", color: cto.subStatus.color, border: `1px solid ${cto.subStatus.color}40`
                            }}>
                              {cto.subStatus.name}
                            </span>
                          ) : (
                            <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Ninguno</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "#475569" }}>
                          {cto.assignedTo ? cto.assignedTo.name || cto.assignedTo.email : <span style={{ color: "#9ca3af", fontStyle: "italic", fontWeight: 400 }}>Sin asignar</span>}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "center" }}>
                          <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                            <button 
                              onClick={() => openEdit(cto)}
                              style={{ padding: "4px 10px", border: "1px solid #cbd5e1", borderRadius: "4px", background: "white", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}
                            >
                              Editar
                            </button>
                            <button 
                              onClick={() => handleDeleteOne(cto.id)}
                              style={{ padding: "4px 10px", border: "1px solid #fecaca", borderRadius: "4px", background: "#fff5f5", color: "#ef4444", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}
                            >
                              Borrar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", borderTop: "1px solid #e5e7eb", background: "#f9fafb" }}>
                <span style={{ fontSize: "0.9rem", color: "#475569" }}>
                  Mostrando <strong>{ctos.length}</strong> de <strong>{totalCount}</strong> CTOs
                </span>
                
                <div style={{ display: "flex", gap: "5px" }}>
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="btn"
                    style={{ minHeight: "36px", padding: "0 12px", background: "white", border: "1px solid #cbd5e1", opacity: currentPage === 1 ? 0.5 : 1 }}
                  >
                    Anterior
                  </button>

                  <span style={{ alignSelf: "center", margin: "0 10px", fontWeight: 600, fontSize: "0.9rem" }}>
                    Página {currentPage} de {totalPages}
                  </span>

                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className="btn"
                    style={{ minHeight: "36px", padding: "0 12px", background: "white", border: "1px solid #cbd5e1", opacity: currentPage === totalPages ? 0.5 : 1 }}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Modal Formulario (Creación / Edición) */}
      {showFormModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div className="glass-panel" style={{ width: "100%", maxWidth: "600px", padding: "2rem", maxHeight: "90vh", overflowY: "auto", background: "white" }}>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "1.5rem" }}>
              {editingCto ? `Editar CTO: ${editingCto.num}` : "Crear Nueva CTO Manual"}
            </h2>

            <form onSubmit={handleFormSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Número CTO (Identificador) *</label>
                <input 
                  type="text" required className="input-field" placeholder="Ej: 1001" 
                  value={formNum} onChange={(e) => setFormNum(e.target.value)}
                  style={{ minHeight: "40px", padding: "8px 12px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Número Nuevo (Opcional)</label>
                <input 
                  type="text" className="input-field" placeholder="Ej: 2001" 
                  value={formNumeroNuevo} onChange={(e) => setFormNumeroNuevo(e.target.value)}
                  style={{ minHeight: "40px", padding: "8px 12px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Municipio</label>
                <input 
                  type="text" className="input-field" placeholder="Ej: Estepona" 
                  value={formMunicipio} onChange={(e) => setFormMunicipio(e.target.value)}
                  style={{ minHeight: "40px", padding: "8px 12px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Latitud (Coordenada Y) *</label>
                <input 
                  type="number" step="any" required className="input-field" placeholder="Ej: 36.42512" 
                  value={formLat} onChange={(e) => setFormLat(e.target.value)}
                  style={{ minHeight: "40px", padding: "8px 12px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Longitud (Coordenada X) *</label>
                <input 
                  type="number" step="any" required className="input-field" placeholder="Ej: -5.14412" 
                  value={formLng} onChange={(e) => setFormLng(e.target.value)}
                  style={{ minHeight: "40px", padding: "8px 12px" }}
                />
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Colocación</label>
                <input 
                  type="text" className="input-field" placeholder="Ej: Fachada, Poste..." 
                  value={formColocacion} onChange={(e) => setFormColocacion(e.target.value)}
                  style={{ minHeight: "40px", padding: "8px 12px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Zona</label>
                <input 
                  type="text" className="input-field" placeholder="Ej: Zona A" 
                  value={formZona} onChange={(e) => setFormZona(e.target.value)}
                  style={{ minHeight: "40px", padding: "8px 12px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Cluster</label>
                <input 
                  type="text" className="input-field" placeholder="Ej: Cluster 12" 
                  value={formCluster} onChange={(e) => setFormCluster(e.target.value)}
                  style={{ minHeight: "40px", padding: "8px 12px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Estado</label>
                <select 
                  className="input-field" value={formStatus} onChange={(e) => setFormStatus(e.target.value)}
                  style={{ minHeight: "40px", padding: "8px 12px" }}
                >
                  <option value="PENDIENTE">PENDIENTE</option>
                  <option value="CORRECTO">CORRECTO</option>
                  <option value="FALLO">FALLO</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Subestado</label>
                <select 
                  className="input-field" value={formSubStatusId} onChange={(e) => setFormSubStatusId(e.target.value)}
                  disabled={formStatus === "PENDIENTE"}
                  style={{ minHeight: "40px", padding: "8px 12px" }}
                >
                  <option value="">Ninguno</option>
                  {subStatuses.map(sub => (
                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Asignar Técnico</label>
                <select 
                  className="input-field" value={formAssignedToId} onChange={(e) => setFormAssignedToId(e.target.value)}
                  style={{ minHeight: "40px", padding: "8px 12px" }}
                >
                  <option value="">Sin asignar</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name || u.email}</option>
                  ))}
                </select>
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600 }}>Notas Generales</label>
                <textarea 
                  className="input-field" value={formNotas} onChange={(e) => setFormNotas(e.target.value)}
                  placeholder="Observaciones de la CTO..." 
                  style={{ minHeight: "60px", padding: "8px 12px", resize: "vertical" }}
                />
              </div>

              <div style={{ gridColumn: "span 2", display: "flex", gap: "10px", marginTop: "1rem" }}>
                <button 
                  type="button" onClick={() => setShowFormModal(false)}
                  className="btn" style={{ flex: 1, background: "#cbd5e1", color: "#334155" }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" disabled={saving}
                  className="btn btn-primary" style={{ flex: 2 }}
                >
                  {saving ? "Guardando..." : "Guardar CTO"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
