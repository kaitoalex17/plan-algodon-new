"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type CTOImage = {
  id: string;
  url: string;
  ctoId: string;
};

type AuditCTO = {
  id: string;
  num: string;
  numeroNuevo?: string;
  municipio?: string;
  cluster?: string;
  status: "PENDIENTE" | "CORRECTO" | "FALLO";
  subStatus?: { id: string; name: string; color: string } | null;
  assignedTo?: { id: string; name: string; email: string; color: string } | null;
  auditedBy?: { id: string; name: string; email: string; color: string } | null;
  fechaAgregacion?: string;
  images: CTOImage[];
};

export default function PhotoAuditPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [ctos, setCtos] = useState<AuditCTO[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Filtros
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, CORRECTO, FALLO, PENDIENTE
  const [selectedCluster, setSelectedCluster] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [clusters, setClusters] = useState<string[]>([]);

  // Modal de Zoom Avanzado
  const [zoomedImage, setZoomedImage] = useState<{ url: string; ctoNum: string; index: number; total: number; cto: AuditCTO } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Estado de acción en curso por CTO
  const [updatingCtoId, setUpdatingCtoId] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "ADMIN") {
        router.push("/");
      } else {
        loadCtos(1, true);
      }
    } else if (authStatus === "unauthenticated") {
      router.push("/login");
    }
  }, [authStatus, session, router, statusFilter, selectedCluster]);

  const loadCtos = async (targetPage: number, reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: targetPage.toString(),
        limit: "10",
        status: statusFilter,
        cluster: selectedCluster,
        search: searchTerm,
        onlyWithImages: "true"
      });

      const res = await fetch(`/api/admin/photo-audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCtos(prev => reset ? data.ctos : [...prev, ...data.ctos]);
        setHasMore(data.hasMore);
        setTotalCount(data.totalCount);
        setPage(targetPage);
        if (data.clusters) setClusters(data.clusters);
      }
    } catch (err) {
      console.error("Error al cargar fotos de auditoría:", err);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  // Scroll Infinito: Cargar 10 más al llegar al fondo
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loading) return;
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadCtos(page + 1, false);
      }
    }, { threshold: 0.5 });
    if (node) observerRef.current.observe(node);
  }, [loading, hasMore, page]);

  // Manejar cambio de estado (Bien = CORRECTO, Mal = FALLO)
  const handleUpdateStatus = async (ctoId: string, newStatus: "CORRECTO" | "FALLO" | "PENDIENTE") => {
    let reason = "";
    if (newStatus === "FALLO") {
      const input = prompt("Indica el motivo del fallo o incidencia en las fotos (opcional):");
      if (input === null) return; // Cancelado por el usuario
      reason = input;
    }

    setUpdatingCtoId(ctoId);
    try {
      const res = await fetch("/api/admin/photo-audit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ctoId, newStatus, reason })
      });

      if (res.ok) {
        const data = await res.json();
        setCtos(prev => prev.map(c => c.id === ctoId ? { ...c, status: newStatus } : c));
        if (zoomedImage && zoomedImage.cto.id === ctoId) {
          setZoomedImage(prev => prev ? { ...prev, cto: { ...prev.cto, status: newStatus } } : null);
        }
      } else {
        alert("Error al actualizar el estado de la CTO");
      }
    } catch (e: any) {
      alert("Error de conexión: " + e.message);
    } finally {
      setUpdatingCtoId(null);
    }
  };

  // Controles de Zoom
  const openZoom = (url: string, cto: AuditCTO, index: number) => {
    setZoomedImage({
      url,
      ctoNum: cto.num,
      index,
      total: cto.images.length,
      cto
    });
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const closeZoom = () => {
    setZoomedImage(null);
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoomLevel(prev => Math.min(Math.max(prev + zoomDelta, 1), 5));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoomLevel > 1) {
      setPanPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-color, #0f172a)", color: "var(--text-color, #f8fafc)", padding: "16px" }}>
      <div style={{ maxWidth: "1300px", margin: "0 auto" }}>

        {/* Cabecera y Navegación */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <Link href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--primary-color, #FF7900)", fontWeight: 700, fontSize: "0.85rem", marginBottom: "4px" }}>
              ← Volver al Panel Admin
            </Link>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 900, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <span>📸</span> Control y Validación de Imágenes de CTOs
            </h1>
            <p style={{ fontSize: "0.85rem", opacity: 0.75, margin: "2px 0 0 0" }}>
              Revisión visual de evidencias fotográficas en cascada. Marca en un clic si están correctas o con fallo.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, background: "rgba(255, 121, 0, 0.15)", color: "var(--primary-color)", padding: "6px 12px", borderRadius: "8px" }}>
              {totalCount} CTOs con Fotos
            </span>
          </div>
        </div>

        {/* Barra de Filtros */}
        <div style={{ background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color, #334155)", borderRadius: "12px", padding: "12px 16px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          
          {/* Selector de Estado */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <button
              onClick={() => { setStatusFilter("ALL"); setPage(1); }}
              style={{
                padding: "6px 12px", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer",
                background: statusFilter === "ALL" ? "var(--primary-color)" : "var(--bg-color)",
                color: statusFilter === "ALL" ? "white" : "var(--text-color)"
              }}
            >
              Todas
            </button>
            <button
              onClick={() => { setStatusFilter("CORRECTO"); setPage(1); }}
              style={{
                padding: "6px 12px", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer",
                background: statusFilter === "CORRECTO" ? "#10b981" : "var(--bg-color)",
                color: statusFilter === "CORRECTO" ? "white" : "var(--text-color)"
              }}
            >
              ✓ Correctas
            </button>
            <button
              onClick={() => { setStatusFilter("FALLO"); setPage(1); }}
              style={{
                padding: "6px 12px", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer",
                background: statusFilter === "FALLO" ? "#ef4444" : "var(--bg-color)",
                color: statusFilter === "FALLO" ? "white" : "var(--text-color)"
              }}
            >
              ✕ Con Fallo
            </button>
            <button
              onClick={() => { setStatusFilter("PENDIENTE"); setPage(1); }}
              style={{
                padding: "6px 12px", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer",
                background: statusFilter === "PENDIENTE" ? "#f59e0b" : "var(--bg-color)",
                color: statusFilter === "PENDIENTE" ? "white" : "var(--text-color)"
              }}
            >
              ⏳ Pendientes
            </button>
          </div>

          {/* Filtro por Clúster y Búsqueda */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            {clusters.length > 0 && (
              <select
                value={selectedCluster}
                onChange={(e) => { setSelectedCluster(e.target.value); setPage(1); }}
                style={{
                  padding: "6px 10px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-color)",
                  color: "var(--text-color)",
                  fontSize: "0.82rem",
                  fontWeight: 700
                }}
              >
                <option value="">Todos los Clústeres</option>
                {clusters.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}

            <form onSubmit={(e) => { e.preventDefault(); loadCtos(1, true); }} style={{ display: "flex", gap: "6px" }}>
              <input
                type="text"
                placeholder="Buscar CTO..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-color)",
                  color: "var(--text-color)",
                  fontSize: "0.82rem",
                  minWidth: "160px"
                }}
              />
              <button
                type="submit"
                style={{
                  background: "var(--primary-color)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "0.82rem",
                  fontWeight: 800,
                  cursor: "pointer"
                }}
              >
                Buscar
              </button>
            </form>
          </div>

        </div>

        {/* Listado de CTOs en Scroll Infinito */}
        {initialLoading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "#64748b" }}>
            Cargando evidencias de CTOs...
          </div>
        ) : ctos.length === 0 ? (
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "3rem", textAlign: "center", color: "#64748b" }}>
            No se encontraron CTOs con fotos bajo los filtros seleccionados.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {ctos.map((cto, index) => {
              const isLast = index === ctos.length - 1;
              const isUpdating = updatingCtoId === cto.id;

              return (
                <div
                  key={cto.id}
                  ref={isLast ? lastElementRef : null}
                  style={{
                    background: "var(--card-bg, #1e293b)",
                    border: `1.5px solid ${cto.status === "CORRECTO" ? "rgba(16, 185, 129, 0.4)" : cto.status === "FALLO" ? "rgba(239, 68, 68, 0.4)" : "var(--border-color)"}`,
                    borderRadius: "14px",
                    padding: "16px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                    transition: "all 0.2s"
                  }}
                >
                  {/* Fila Superior de la CTO: Datos + Botones de Control Bien / Mal */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
                    
                    {/* Info de la CTO */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "1.2rem", fontWeight: 900, color: "var(--primary-color)" }}>
                        {cto.num}
                      </span>

                      {cto.cluster && (
                        <span style={{ background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", fontSize: "0.75rem", fontWeight: 800, padding: "2px 8px", borderRadius: "6px" }}>
                          📁 {cto.cluster}
                        </span>
                      )}

                      {cto.municipio && (
                        <span style={{ fontSize: "0.78rem", opacity: 0.75 }}>
                          📍 {cto.municipio}
                        </span>
                      )}

                      {cto.assignedTo && (
                        <span style={{ fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: cto.assignedTo.color || "#FF7900" }} />
                          {cto.assignedTo.name}
                        </span>
                      )}

                      {/* Badge de Estado Actual */}
                      <span style={{
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        padding: "3px 8px",
                        borderRadius: "12px",
                        background: cto.status === "CORRECTO" ? "rgba(16, 185, 129, 0.2)" : cto.status === "FALLO" ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.2)",
                        color: cto.status === "CORRECTO" ? "#10b981" : cto.status === "FALLO" ? "#ef4444" : "#f59e0b"
                      }}>
                        {cto.status === "CORRECTO" ? "✓ BIEN (CORRECTO)" : cto.status === "FALLO" ? "✕ CON FALLO" : "⏳ PENDIENTE"}
                      </span>
                    </div>

                    {/* BOTONES DE ACCIÓN RÁPIDA: BIEN / MAL */}
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(cto.id, "CORRECTO")}
                        disabled={isUpdating}
                        style={{
                          background: cto.status === "CORRECTO" ? "#10b981" : "rgba(16, 185, 129, 0.15)",
                          color: cto.status === "CORRECTO" ? "white" : "#10b981",
                          border: "1.5px solid #10b981",
                          borderRadius: "8px",
                          padding: "8px 16px",
                          fontWeight: 800,
                          fontSize: "0.85rem",
                          cursor: isUpdating ? "wait" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          transition: "all 0.15s"
                        }}
                      >
                        <span>✓</span> Marcar Bien
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(cto.id, "FALLO")}
                        disabled={isUpdating}
                        style={{
                          background: cto.status === "FALLO" ? "#ef4444" : "rgba(239, 68, 68, 0.15)",
                          color: cto.status === "FALLO" ? "white" : "#ef4444",
                          border: "1.5px solid #ef4444",
                          borderRadius: "8px",
                          padding: "8px 16px",
                          fontWeight: 800,
                          fontSize: "0.85rem",
                          cursor: isUpdating ? "wait" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          transition: "all 0.15s"
                        }}
                      >
                        <span>✕</span> Marcar Mal
                      </button>

                      <Link
                        href={`/?cto=${encodeURIComponent(cto.num)}`}
                        target="_blank"
                        style={{
                          background: "var(--bg-color)",
                          color: "var(--text-color)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "8px",
                          padding: "8px 12px",
                          fontWeight: 700,
                          fontSize: "0.8rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                      >
                        <span>🗺️</span> Ver Mapa
                      </Link>
                    </div>

                  </div>

                  {/* Carrusel / Malla de Imágenes de la CTO */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                    gap: "10px",
                    background: "rgba(0,0,0,0.1)",
                    padding: "10px",
                    borderRadius: "10px"
                  }}>
                    {cto.images.map((img, idx) => (
                      <div
                        key={img.id}
                        onClick={() => openZoom(img.url, cto, idx)}
                        title="Pincha para hacer zoom y ver en grande"
                        style={{
                          position: "relative",
                          aspectRatio: "1/1",
                          borderRadius: "8px",
                          overflow: "hidden",
                          border: "1.5px solid var(--border-color)",
                          cursor: "zoom-in",
                          background: "#000",
                          transition: "transform 0.15s, box-shadow 0.15s"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "scale(1.03)";
                          e.currentTarget.style.boxShadow = "0 4px 10px rgba(0,0,0,0.3)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "scale(1)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        <img
                          src={img.url}
                          alt={`Evidencia ${idx + 1}`}
                          loading="lazy"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block"
                          }}
                        />
                        <div style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
                          color: "white",
                          fontSize: "0.68rem",
                          fontWeight: 800,
                          padding: "4px 6px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                          <span>Foto {idx + 1}</span>
                          <span>🔍 Zoom</span>
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              );
            })}

            {loading && (
              <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--primary-color)", fontWeight: 800 }}>
                Cargando 10 CTOs más...
              </div>
            )}
          </div>
        )}

      </div>

      {/* MODAL DE ZOOM AVANZADO E INSPECCIÓN DE EVIDENCIA */}
      {zoomedImage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.92)",
            zIndex: 99999,
            display: "flex",
            flexDirection: "column",
            backdropFilter: "blur(6px)"
          }}
        >
          {/* Barra Superior del Zoom */}
          <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.6)", borderBottom: "1px solid rgba(255,255,255,0.1)", zIndex: 10 }}>
            <div>
              <strong style={{ fontSize: "1.1rem", color: "white", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>📸</span> CTO: {zoomedImage.ctoNum} (Foto {zoomedImage.index + 1} de {zoomedImage.total})
              </strong>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                Usa la rueda del ratón para hacer zoom o arrastra para moverte por la imagen
              </span>
            </div>

            {/* Controles del Modal: Zoom + Acciones Bien/Mal + Cerrar */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              
              {/* Botones de Zoom In / Out / Reset */}
              <button
                onClick={() => setZoomLevel(prev => Math.max(prev - 0.5, 1))}
                style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "none", borderRadius: "6px", width: "32px", height: "32px", cursor: "pointer", fontWeight: 900 }}
              >
                -
              </button>
              <span style={{ color: "white", fontSize: "0.85rem", fontWeight: 700, minWidth: "45px", textAlign: "center" }}>
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel(prev => Math.min(prev + 0.5, 5))}
                style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "none", borderRadius: "6px", width: "32px", height: "32px", cursor: "pointer", fontWeight: 900 }}
              >
                +
              </button>
              <button
                onClick={() => { setZoomLevel(1); setPanPosition({ x: 0, y: 0 }); }}
                style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "none", borderRadius: "6px", padding: "4px 8px", fontSize: "0.75rem", cursor: "pointer", fontWeight: 700 }}
              >
                Reset
              </button>

              {/* Botones de Validación Rápida en el Modal */}
              <button
                type="button"
                onClick={() => handleUpdateStatus(zoomedImage.cto.id, "CORRECTO")}
                style={{
                  background: zoomedImage.cto.status === "CORRECTO" ? "#10b981" : "rgba(16, 185, 129, 0.2)",
                  color: "#10b981",
                  border: "1.5px solid #10b981",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  cursor: "pointer"
                }}
              >
                ✓ Marcar Bien
              </button>

              <button
                type="button"
                onClick={() => handleUpdateStatus(zoomedImage.cto.id, "FALLO")}
                style={{
                  background: zoomedImage.cto.status === "FALLO" ? "#ef4444" : "rgba(239, 68, 68, 0.2)",
                  color: "#ef4444",
                  border: "1.5px solid #ef4444",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  cursor: "pointer"
                }}
              >
                ✕ Marcar Mal
              </button>

              <button
                onClick={closeZoom}
                style={{
                  background: "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  padding: "6px 14px",
                  fontSize: "0.9rem",
                  fontWeight: 800,
                  cursor: "pointer",
                  marginLeft: "6px"
                }}
              >
                ✕ Cerrar
              </button>
            </div>
          </div>

          {/* Área de Visualización y Arrastre de la Imagen */}
          <div
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              cursor: zoomLevel > 1 ? (isDragging ? "grabbing" : "grab") : "default",
              position: "relative"
            }}
          >
            <img
              src={zoomedImage.url}
              alt={zoomedImage.ctoNum}
              style={{
                maxWidth: "90%",
                maxHeight: "85vh",
                objectFit: "contain",
                transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoomLevel})`,
                transition: isDragging ? "none" : "transform 0.1s ease-out",
                userSelect: "none"
              }}
              draggable={false}
            />
          </div>
        </div>
      )}

    </div>
  );
}
