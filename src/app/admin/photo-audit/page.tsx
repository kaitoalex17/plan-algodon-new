"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type CTOImage = {
  id: string;
  url: string;
  ctoId: string;
};

type Technician = {
  id: string;
  name: string;
  email: string;
  color: string;
};

type AuditCTO = {
  id: string;
  num: string;
  numeroNuevo?: string;
  municipio?: string;
  cluster?: string;
  status: "PENDIENTE" | "CORRECTO" | "FALLO" | "REPARAR";
  subStatus?: { id: string; name: string; color: string } | null;
  assignedTo?: { id: string; name: string; email: string; color: string } | null;
  auditedBy?: { id: string; name: string; email: string; color: string } | null;
  fechaAgregacion?: string;
  images: CTOImage[];
};

export function getPhotoCategoryInfo(url: string) {
  const lower = (url || "").toLowerCase();
  if (lower.includes("entorno")) {
    return { key: "entorno", name: "Entorno de la Instalación", icon: "🏠", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)" };
  }
  if (lower.includes("cto_abierta") || lower.includes("interior") || lower.includes("abierta")) {
    return { key: "cto_abierta", name: "CTO Abierta (Interior)", icon: "🗄️", color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.15)" };
  }
  if (lower.includes("etiquetado_cto") || lower.includes("etiqueta_cto")) {
    return { key: "etiquetado_cto", name: "Etiquetado CTO", icon: "🏷️", color: "#ec4899", bg: "rgba(236, 72, 153, 0.15)" };
  }
  if (lower.includes("etiquetado_cableado") || lower.includes("cableado") || lower.includes("etiqueta_cable")) {
    return { key: "etiquetado_cableado", name: "Etiquetado Cableado", icon: "⚡", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)" };
  }
  if (lower.includes("potencia") || lower.includes("laser") || lower.includes("dbm")) {
    return { key: "potencia", name: "Comprobación de Potencia", icon: "💡", color: "#10b981", bg: "rgba(16, 185, 129, 0.15)" };
  }
  if (lower.includes("coordenadas") || lower.includes("mapa") || lower.includes("satelite") || lower.includes("satellite")) {
    return { key: "coordenadas", name: "Coordenadas y Mapa", icon: "📍", color: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)" };
  }
  return { key: "otras", name: "Otras Evidencias / Detalle", icon: "📷", color: "#94a3b8", bg: "rgba(148, 163, 184, 0.15)" };
}

export default function PhotoAuditPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [ctos, setCtos] = useState<AuditCTO[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Filtros de Estado y Servidor
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, CORRECTO, FALLO, PENDIENTE, REPARAR
  const [photosFilter, setPhotosFilter] = useState("ALL"); // ALL (incluso sin fotos), WITH_PHOTOS, WITHOUT_PHOTOS
  const [selectedCluster, setSelectedCluster] = useState("");
  const [selectedTechnician, setSelectedTechnician] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [clusters, setClusters] = useState<string[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [stats, setStats] = useState({
    pendingCount: 0,
    repairCount: 0,
    correctCount: 0,
    falloCount: 0,
    withoutPhotosCount: 0
  });

  // Filtro por Categoría de Foto (Ver solo potencia, solo entorno, etc.)
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [hideWithoutCategory, setHideWithoutCategory] = useState(false);

  // Auto-auditoría por scroll (Al scrollear las que quedan arriba se validan automáticamente)
  const [autoAuditOnScroll, setAutoAuditOnScroll] = useState(true);
  const [autoAuditedCount, setAutoAuditedCount] = useState(0);
  const processedCtoIds = useRef<Set<string>>(new Set());
  const autoAuditObserver = useRef<IntersectionObserver | null>(null);

  // Aprobación individual de fotos en memoria
  const [approvedImages, setApprovedImages] = useState<Record<string, boolean>>({});

  // Modal de Rechazo / Mandar a Reparar con Motivo Rápido
  const [rejectModal, setRejectModal] = useState<{
    ctoId: string;
    imageId: string;
    categoryName: string;
    ctoNum: string;
  } | null>(null);
  const [rejectCustomReason, setRejectCustomReason] = useState("");

  // Modal de Zoom Avanzado
  const [zoomedImage, setZoomedImage] = useState<{ url: string; ctoNum: string; index: number; total: number; cto: AuditCTO } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Estado de acción en curso por CTO
  const [updatingCtoId, setUpdatingCtoId] = useState<string | null>(null);

  // Inicializar IntersectionObserver para la auto-auditoría al dejar cajas arriba
  useEffect(() => {
    if (typeof window === "undefined") return;

    autoAuditObserver.current = new IntersectionObserver((entries) => {
      if (!autoAuditOnScroll) return;

      entries.forEach(entry => {
        // La tarjeta ha salido completamente por la parte superior de la pantalla
        if (!entry.isIntersecting && entry.boundingClientRect.bottom < 0) {
          const ctoId = entry.target.getAttribute("data-cto-id");
          const ctoStatus = entry.target.getAttribute("data-cto-status");
          const imagesCount = parseInt(entry.target.getAttribute("data-cto-images") || "0");

          // Solo auto-aprobar cajas en PENDIENTE que tengan al menos 1 foto y no se hayan procesado ya
          if (ctoId && ctoStatus === "PENDIENTE" && imagesCount > 0 && !processedCtoIds.current.has(ctoId)) {
            processedCtoIds.current.add(ctoId);

            // Actualización optimista en interfaz
            setCtos(prev => prev.map(c => c.id === ctoId ? { ...c, status: "CORRECTO" as const } : c));
            setAutoAuditedCount(prev => prev + 1);

            // Enviar aprobación al backend
            fetch("/api/admin/photo-audit", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ctoId,
                newStatus: "CORRECTO",
                reason: "Auto-validada por scroll de auditoría rápida"
              })
            }).catch(e => console.error("Error en auto-auditoría por scroll:", e));
          }
        }
      });
    }, {
      threshold: 0
    });

    return () => {
      if (autoAuditObserver.current) autoAuditObserver.current.disconnect();
    };
  }, [autoAuditOnScroll]);

  const registerAutoAuditNode = useCallback((node: HTMLDivElement | null) => {
    if (node && autoAuditObserver.current) {
      autoAuditObserver.current.observe(node);
    }
  }, []);

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
  }, [authStatus, session, router, statusFilter, photosFilter, selectedCluster, selectedTechnician]);

  const loadCtos = async (targetPage: number, reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: targetPage.toString(),
        limit: "10",
        status: statusFilter,
        cluster: selectedCluster,
        technicianId: selectedTechnician,
        search: searchTerm,
        photosFilter: photosFilter
      });

      const res = await fetch(`/api/admin/photo-audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCtos(prev => reset ? data.ctos : [...prev, ...data.ctos]);
        setHasMore(data.hasMore);
        setTotalCount(data.totalCount);
        setPage(targetPage);
        if (data.clusters) setClusters(data.clusters);
        if (data.technicians) setTechnicians(data.technicians);
        if (data.stats) setStats(data.stats);
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

  // Manejar cambio de estado (Bien = CORRECTO, Mal = FALLO, Reparar = REPARAR)
  const handleUpdateStatus = async (
    ctoId: string,
    newStatus: "CORRECTO" | "FALLO" | "PENDIENTE" | "REPARAR",
    customReason?: string
  ) => {
    let reason = customReason || "";
    if (!customReason) {
      if (newStatus === "REPARAR") {
        const input = prompt("Indica qué debe reparar el técnico en esta CTO (se guardará en su buzón):");
        if (input === null) return;
        reason = input;
      } else if (newStatus === "FALLO") {
        const input = prompt("Indica el motivo del fallo en las fotos:");
        if (input === null) return;
        reason = input;
      }
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
        // Actualizar contadores locales
        setStats(prev => ({
          ...prev,
          pendingCount: Math.max(0, newStatus !== "PENDIENTE" ? prev.pendingCount - 1 : prev.pendingCount),
          repairCount: newStatus === "REPARAR" ? prev.repairCount + 1 : prev.repairCount,
          correctCount: newStatus === "CORRECTO" ? prev.correctCount + 1 : prev.correctCount,
          falloCount: newStatus === "FALLO" ? prev.falloCount + 1 : prev.falloCount
        }));
      } else {
        alert("Error al actualizar el estado de la CTO");
      }
    } catch (e: any) {
      alert("Error de conexión: " + e.message);
    } finally {
      setUpdatingCtoId(null);
    }
  };

  const toggleApproveImage = (imageId: string) => {
    setApprovedImages(prev => ({
      ...prev,
      [imageId]: !prev[imageId]
    }));
  };

  const openRejectModal = (cto: AuditCTO, imageId: string, categoryName: string) => {
    setRejectModal({
      ctoId: cto.id,
      imageId,
      categoryName,
      ctoNum: cto.num
    });
    setRejectCustomReason("");
  };

  const submitRejectWithReason = async (reasonText: string) => {
    if (!rejectModal) return;
    const finalReason = `[Foto ${rejectModal.categoryName}]: ${reasonText}`;
    await handleUpdateStatus(rejectModal.ctoId, "REPARAR", finalReason);
    setRejectModal(null);
    setRejectCustomReason("");
    if (isTactileMode) {
      setTactileIndex(prev => prev + 1);
      setActivePhotoIndex(0);
    }
  };

  // ==========================================
  // LÓGICA DE MODO TÁCTIL (TIPO TINDER)
  // ==========================================
  const [isTactileMode, setIsTactileMode] = useState(false);
  const [tactileIndex, setTactileIndex] = useState(0);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [swipeOffset, setSwipeOffset] = useState({ x: 0, y: 0 });
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeStart, setSwipeStart] = useState({ x: 0, y: 0 });
  const [swipeAnim, setSwipeAnim] = useState<"right" | "left" | null>(null);
  const [tactileHistory, setTactileHistory] = useState<Array<{ ctoId: string; prevStatus: string }>>([]);

  // CTOs disponibles para modo táctil
  const tactileCtos = useMemo(() => {
    return ctos.filter(cto => {
      if (selectedCategory !== "ALL" && hideWithoutCategory) {
        const hasPhoto = cto.images.some(img => getPhotoCategoryInfo(img.url).key === selectedCategory);
        if (!hasPhoto) return false;
      }
      return true;
    });
  }, [ctos, selectedCategory, hideWithoutCategory]);

  const currentTactileCto = tactileCtos[tactileIndex];

  // Fotos de la CTO activa en modo táctil
  const currentTactilePhotos = useMemo(() => {
    if (!currentTactileCto) return [];
    if (selectedCategory === "ALL") return currentTactileCto.images;
    const filtered = currentTactileCto.images.filter(img => getPhotoCategoryInfo(img.url).key === selectedCategory);
    return filtered.length > 0 ? filtered : currentTactileCto.images;
  }, [currentTactileCto, selectedCategory]);

  // Handlers para aprobar (derecha) o mandar a reparar (izquierda)
  const handleTactileApprove = useCallback((cto: AuditCTO) => {
    setSwipeAnim("right");
    setTactileHistory(prev => [...prev, { ctoId: cto.id, prevStatus: cto.status }]);

    // Actualización optimista
    setCtos(prev => prev.map(c => c.id === cto.id ? { ...c, status: "CORRECTO" as const } : c));
    handleUpdateStatus(cto.id, "CORRECTO", "Validada en Modo Táctil (Derecha - Bien)");

    setTimeout(() => {
      setTactileIndex(prev => prev + 1);
      setActivePhotoIndex(0);
      setSwipeAnim(null);
      setSwipeOffset({ x: 0, y: 0 });
    }, 220);
  }, [handleUpdateStatus]);

  const handleTactileReject = useCallback((cto: AuditCTO, reason?: string) => {
    setSwipeAnim("left");
    setTactileHistory(prev => [...prev, { ctoId: cto.id, prevStatus: cto.status }]);

    // Actualización optimista
    setCtos(prev => prev.map(c => c.id === cto.id ? { ...c, status: "REPARAR" as const } : c));
    handleUpdateStatus(cto.id, "REPARAR", reason || "Rechazada en Modo Táctil (Izquierda - Mandar a Reparar)");

    setTimeout(() => {
      setTactileIndex(prev => prev + 1);
      setActivePhotoIndex(0);
      setSwipeAnim(null);
      setSwipeOffset({ x: 0, y: 0 });
    }, 220);
  }, [handleUpdateStatus]);

  const handleTactileUndo = useCallback(() => {
    if (tactileIndex <= 0 || tactileHistory.length === 0) return;
    const lastItem = tactileHistory[tactileHistory.length - 1];
    setTactileHistory(prev => prev.slice(0, -1));
    setCtos(prev => prev.map(c => c.id === lastItem.ctoId ? { ...c, status: lastItem.prevStatus as any } : c));
    handleUpdateStatus(lastItem.ctoId, lastItem.prevStatus as any, "Deshecho en Modo Táctil");
    setTactileIndex(prev => Math.max(0, prev - 1));
    setActivePhotoIndex(0);
  }, [tactileIndex, tactileHistory, handleUpdateStatus]);

  // Atajos de Teclado para Modo Táctil (Flecha Derecha: Bien, Flecha Izquierda: Mal, Flechas Arriba/Abajo: Fotos, Esc: Salir)
  useEffect(() => {
    if (!isTactileMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const activeCto = tactileCtos[tactileIndex];

      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (activeCto) handleTactileApprove(activeCto);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (activeCto) handleTactileReject(activeCto);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActivePhotoIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (activeCto && activeCto.images) {
          setActivePhotoIndex(prev => Math.min(activeCto.images.length - 1, prev + 1));
        }
      } else if (e.key === "Escape") {
        setIsTactileMode(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTactileMode, tactileIndex, tactileCtos, handleTactileApprove, handleTactileReject]);

  // Cargar más CTOs automáticamente cuando se aproxime al final del lote en modo táctil
  useEffect(() => {
    if (isTactileMode && hasMore && !loading && tactileIndex >= tactileCtos.length - 3) {
      loadCtos(page + 1, false);
    }
  }, [isTactileMode, tactileIndex, tactileCtos.length, hasMore, loading, page]);

  // Drag global con mouse para experiencia fluida
  useEffect(() => {
    if (!isSwiping) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      setSwipeOffset({
        x: e.clientX - swipeStart.x,
        y: e.clientY - swipeStart.y
      });
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      setIsSwiping(false);
      const diffX = e.clientX - swipeStart.x;
      const activeCto = tactileCtos[tactileIndex];
      if (activeCto) {
        if (diffX > 90) {
          handleTactileApprove(activeCto);
          return;
        } else if (diffX < -90) {
          handleTactileReject(activeCto);
          return;
        }
      }
      setSwipeOffset({ x: 0, y: 0 });
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [isSwiping, swipeStart, tactileCtos, tactileIndex, handleTactileApprove, handleTactileReject]);

  const handleCardTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsSwiping(true);
    setSwipeStart({ x: touch.clientX, y: touch.clientY });
    setSwipeOffset({ x: 0, y: 0 });
  };

  const handleCardTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const touch = e.touches[0];
    setSwipeOffset({
      x: touch.clientX - swipeStart.x,
      y: touch.clientY - swipeStart.y
    });
  };

  const handleCardTouchEnd = () => {
    if (!isSwiping) return;
    setIsSwiping(false);
    const diffX = swipeOffset.x;
    const activeCto = tactileCtos[tactileIndex];
    if (activeCto) {
      if (diffX > 90) {
        handleTactileApprove(activeCto);
        return;
      } else if (diffX < -90) {
        handleTactileReject(activeCto);
        return;
      }
    }
    setSwipeOffset({ x: 0, y: 0 });
  };

  const handleCardMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsSwiping(true);
    setSwipeStart({ x: e.clientX, y: e.clientY });
    setSwipeOffset({ x: 0, y: 0 });
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
      <div style={{ maxWidth: "860px", margin: "0 auto" }}>

        {/* Cabecera y Navegación */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <Link href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--primary-color, #FF7900)", fontWeight: 700, fontSize: "0.85rem", marginBottom: "4px" }}>
              ← Volver al Panel Admin
            </Link>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 900, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <span>📸</span> Auditoría Visual de Fotos de CTOs
            </h1>
            <p style={{ fontSize: "0.85rem", opacity: 0.75, margin: "2px 0 0 0" }}>
              Feed de fotos clasificadas. Aprueba con 👍 o rechaza con 👎 para enviar la caja directamente al buzón del técnico.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Botón Switch Auto-Auditoría al Scroll */}
            <button
              type="button"
              onClick={() => setAutoAuditOnScroll(!autoAuditOnScroll)}
              style={{
                background: autoAuditOnScroll ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.05)",
                color: autoAuditOnScroll ? "#10b981" : "#94a3b8",
                border: autoAuditOnScroll ? "1.5px solid #10b981" : "1px solid var(--border-color)",
                borderRadius: "8px",
                padding: "6px 12px",
                fontSize: "0.8rem",
                fontWeight: 800,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.2s"
              }}
              title="Al hacer scroll hacia abajo, las cajas que quedan arriba se validan como correctas automáticamente"
            >
              <span>⚡</span>
              <span>Auto-auditar al scroll: {autoAuditOnScroll ? "ACTIVADO" : "DESACTIVADO"}</span>
            </button>

            {/* Botón Activar Modo Táctil (Tinder-style) */}
            <button
              type="button"
              onClick={() => {
                setIsTactileMode(true);
                setTactileIndex(0);
                setActivePhotoIndex(0);
              }}
              style={{
                background: "linear-gradient(135deg, #FF7900 0%, #ec4899 100%)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: "0.8rem",
                fontWeight: 900,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 10px rgba(255, 121, 0, 0.35)",
                transition: "all 0.2s"
              }}
              title="Abrir Modo Táctil: desliza a la derecha para Bien y a la izquierda para Mal"
            >
              <span>📱</span>
              <span>Modo Táctil</span>
            </button>

            <span style={{ fontSize: "0.85rem", fontWeight: 700, background: "rgba(255, 121, 0, 0.15)", color: "var(--primary-color)", padding: "6px 12px", borderRadius: "8px" }}>
              {totalCount} CTOs
            </span>
          </div>
        </div>

        {/* Banner de Cajas Pendientes por Auditar Fotos */}
        <div style={{
          background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(139, 92, 246, 0.12) 100%)",
          border: "1.5px solid rgba(245, 158, 11, 0.35)",
          borderRadius: "14px",
          padding: "14px 18px",
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "1.8rem" }}>⏳</span>
            <div>
              <h3 style={{ margin: "0 0 2px 0", fontSize: "1rem", fontWeight: 800, color: "var(--text-color)" }}>
                {stats.pendingCount === 1 ? "Queda 1 caja con fotos pendientes de auditar" : `Quedan ${stats.pendingCount} cajas con fotos pendientes de auditar`}
              </h3>
              <p style={{ margin: 0, fontSize: "0.78rem", opacity: 0.75 }}>
                {stats.repairCount} en taller a reparar • {stats.correctCount} aprobadas • {stats.falloCount} con fallo • {stats.withoutPhotosCount || 0} sin fotos
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {statusFilter !== "PENDIENTE" && stats.pendingCount > 0 && (
              <button
                type="button"
                onClick={() => { setStatusFilter("PENDIENTE"); setPage(1); }}
                style={{
                  background: "#f59e0b",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  padding: "6px 14px",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <span>⏳</span> Auditar Pendientes ({stats.pendingCount})
              </button>
            )}
            {stats.repairCount > 0 && statusFilter !== "REPARAR" && (
              <button
                type="button"
                onClick={() => { setStatusFilter("REPARAR"); setPage(1); }}
                style={{
                  background: "#8b5cf6",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  padding: "6px 14px",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                Ver A Reparar ({stats.repairCount})
              </button>
            )}
            {stats.withoutPhotosCount > 0 && photosFilter !== "WITHOUT_PHOTOS" && (
              <button
                type="button"
                onClick={() => { setPhotosFilter("WITHOUT_PHOTOS"); setPage(1); }}
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "#ef4444",
                  border: "1px solid #ef4444",
                  borderRadius: "8px",
                  padding: "6px 14px",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                ⚠️ Ver Sin Fotos ({stats.withoutPhotosCount})
              </button>
            )}
          </div>
        </div>

        {/* Barra de Filtros Completa */}
        <div style={{ background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color, #334155)", borderRadius: "12px", padding: "14px 16px", marginBottom: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          
          {/* Fila 1: Filtro de Estado General y Presencia de Fotos */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
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
                onClick={() => { setStatusFilter("PENDIENTE"); setPage(1); }}
                style={{
                  padding: "6px 12px", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer",
                  background: statusFilter === "PENDIENTE" ? "#f59e0b" : "var(--bg-color)",
                  color: statusFilter === "PENDIENTE" ? "white" : "var(--text-color)"
                }}
              >
                ⏳ Pendientes ({stats.pendingCount})
              </button>
              <button
                onClick={() => { setStatusFilter("REPARAR"); setPage(1); }}
                style={{
                  padding: "6px 12px", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer",
                  background: statusFilter === "REPARAR" ? "#8b5cf6" : "var(--bg-color)",
                  color: statusFilter === "REPARAR" ? "white" : "var(--text-color)"
                }}
              >
                A Reparar ({stats.repairCount})
              </button>
              <button
                onClick={() => { setStatusFilter("CORRECTO"); setPage(1); }}
                style={{
                  padding: "6px 12px", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer",
                  background: statusFilter === "CORRECTO" ? "#10b981" : "var(--bg-color)",
                  color: statusFilter === "CORRECTO" ? "white" : "var(--text-color)"
                }}
              >
                ✓ Correctas ({stats.correctCount})
              </button>
              <button
                onClick={() => { setStatusFilter("FALLO"); setPage(1); }}
                style={{
                  padding: "6px 12px", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer",
                  background: statusFilter === "FALLO" ? "#ef4444" : "var(--bg-color)",
                  color: statusFilter === "FALLO" ? "white" : "var(--text-color)"
                }}
              >
                ✕ Fallo ({stats.falloCount})
              </button>
            </div>

            {/* Filtro de Presencia de Fotos (Todas, Con fotos, Sin fotos) */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center", background: "var(--bg-color)", padding: "3px 6px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              <span style={{ fontSize: "0.72rem", fontWeight: 800, opacity: 0.7, marginRight: "2px" }}>Fotos:</span>
              <button
                type="button"
                onClick={() => { setPhotosFilter("ALL"); setPage(1); }}
                style={{
                  padding: "4px 8px", borderRadius: "6px", border: "none", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
                  background: photosFilter === "ALL" ? "var(--primary-color)" : "transparent",
                  color: photosFilter === "ALL" ? "white" : "var(--text-color)"
                }}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => { setPhotosFilter("WITH_PHOTOS"); setPage(1); }}
                style={{
                  padding: "4px 8px", borderRadius: "6px", border: "none", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
                  background: photosFilter === "WITH_PHOTOS" ? "#10b981" : "transparent",
                  color: photosFilter === "WITH_PHOTOS" ? "white" : "var(--text-color)"
                }}
              >
                Con fotos
              </button>
              <button
                type="button"
                onClick={() => { setPhotosFilter("WITHOUT_PHOTOS"); setPage(1); }}
                style={{
                  padding: "4px 8px", borderRadius: "6px", border: "none", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
                  background: photosFilter === "WITHOUT_PHOTOS" ? "#ef4444" : "transparent",
                  color: photosFilter === "WITHOUT_PHOTOS" ? "white" : "var(--text-color)"
                }}
              >
                Sin fotos ({stats.withoutPhotosCount || 0})
              </button>
            </div>
          </div>

          {/* Fila 2: Organizador por Categoría de Foto (Ver solo potencia, solo entorno, etc.) */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "10px" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--primary-color)", display: "flex", alignItems: "center", gap: "4px" }}>
              <span>🔍</span> Ver solo categoría:
            </span>

            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", flex: 1 }}>
              {[
                { key: "ALL", label: "Todas las Categorías", icon: "🖼️" },
                { key: "potencia", label: "Solo Potencia", icon: "💡" },
                { key: "entorno", label: "Solo Entorno", icon: "🏠" },
                { key: "cto_abierta", label: "Solo CTO Abierta", icon: "🗄️" },
                { key: "etiquetado_cto", label: "Solo Etiquetado CTO", icon: "🏷️" },
                { key: "etiquetado_cableado", label: "Solo Cable", icon: "⚡" },
                { key: "coordenadas", label: "Solo Coordenadas", icon: "📍" },
                { key: "otras", label: "Solo Otras", icon: "📷" },
              ].map(cat => {
                const isActive = selectedCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSelectedCategory(cat.key)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: isActive ? "1px solid var(--primary-color)" : "1px solid rgba(255,255,255,0.1)",
                      background: isActive ? "rgba(255, 121, 0, 0.2)" : "var(--bg-color)",
                      color: isActive ? "var(--primary-color)" : "var(--text-color)",
                      fontSize: "0.76rem",
                      fontWeight: 800,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      transition: "all 0.15s"
                    }}
                  >
                    <span>{cat.icon}</span> {cat.label}
                  </button>
                );
              })}
            </div>

            {selectedCategory !== "ALL" && (
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.76rem", cursor: "pointer", opacity: 0.85 }}>
                <input
                  type="checkbox"
                  checked={hideWithoutCategory}
                  onChange={(e) => setHideWithoutCategory(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                Ocultar cajas sin esta foto
              </label>
            )}
          </div>

          {/* Fila 3: Filtro por Técnico, Clúster y Buscador */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "10px" }}>
            
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              {/* Selector de Técnico */}
              {technicians.length > 0 && (
                <select
                  value={selectedTechnician}
                  onChange={(e) => { setSelectedTechnician(e.target.value); setPage(1); }}
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
                  <option value="">👥 Todos los Técnicos</option>
                  {technicians.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name || t.email}
                    </option>
                  ))}
                </select>
              )}

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
            </div>

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
                  minWidth: "140px"
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
            No se encontraron CTOs bajo los filtros seleccionados.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {ctos.map((cto, index) => {
              const isLast = index === ctos.length - 1;
              const isUpdating = updatingCtoId === cto.id;

              // Filtrar fotos según categoría seleccionada
              const visibleImages = selectedCategory === "ALL"
                ? cto.images
                : cto.images.filter(img => getPhotoCategoryInfo(img.url).key === selectedCategory);

              // Ocultar si el usuario marcó la opción de ocultar cajas sin esta foto
              if (hideWithoutCategory && selectedCategory !== "ALL" && visibleImages.length === 0) {
                return null;
              }

              return (
                <div
                  key={cto.id}
                  ref={(el) => {
                    if (isLast) lastElementRef(el);
                    registerAutoAuditNode(el);
                  }}
                  data-cto-id={cto.id}
                  data-cto-status={cto.status}
                  data-cto-images={cto.images.length}
                  style={{
                    background: "var(--card-bg, #1e293b)",
                    border: `1.5px solid ${
                      cto.status === "CORRECTO"
                        ? "rgba(16, 185, 129, 0.4)"
                        : cto.status === "REPARAR"
                        ? "rgba(139, 92, 246, 0.5)"
                        : cto.status === "FALLO"
                        ? "rgba(239, 68, 68, 0.4)"
                        : "var(--border-color)"
                    }`,
                    borderRadius: "14px",
                    padding: "16px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                    transition: "all 0.2s"
                  }}
                >
                  {/* Fila Superior de la CTO: Datos + Botones de Control */}
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

                      {/* Conteo de fotos */}
                      <span style={{ fontSize: "0.74rem", opacity: 0.7 }}>
                        {cto.images.length === 0 ? "⚠️ Sin fotos" : `${cto.images.length} fotos`}
                      </span>

                      {/* Badge de Estado Actual */}
                      <span style={{
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        padding: "3px 10px",
                        borderRadius: "12px",
                        background: cto.status === "CORRECTO"
                          ? "rgba(16, 185, 129, 0.2)"
                          : cto.status === "REPARAR"
                          ? "rgba(139, 92, 246, 0.2)"
                          : cto.status === "FALLO"
                          ? "rgba(239, 68, 68, 0.2)"
                          : "rgba(245, 158, 11, 0.2)",
                        color: cto.status === "CORRECTO"
                          ? "#10b981"
                          : cto.status === "REPARAR"
                          ? "#8b5cf6"
                          : cto.status === "FALLO"
                          ? "#ef4444"
                          : "#f59e0b"
                      }}>
                        {cto.status === "CORRECTO"
                          ? "✓ BIEN (CORRECTO)"
                          : cto.status === "REPARAR"
                          ? "A REPARAR"
                          : cto.status === "FALLO"
                          ? "✕ CON FALLO"
                          : "⏳ PENDIENTE"}
                      </span>
                    </div>

                    {/* BOTONES DE ACCIÓN RÁPIDA A NIVEL DE CTO */}
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(cto.id, "CORRECTO")}
                        disabled={isUpdating}
                        style={{
                          background: cto.status === "CORRECTO" ? "#10b981" : "rgba(16, 185, 129, 0.15)",
                          color: cto.status === "CORRECTO" ? "white" : "#10b981",
                          border: "1.5px solid #10b981",
                          borderRadius: "8px",
                          padding: "6px 14px",
                          fontWeight: 800,
                          fontSize: "0.82rem",
                          cursor: isUpdating ? "wait" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          transition: "all 0.15s"
                        }}
                      >
                        <span>✓</span> Marcar Bien
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(cto.id, "REPARAR")}
                        disabled={isUpdating}
                        style={{
                          background: cto.status === "REPARAR" ? "#8b5cf6" : "rgba(139, 92, 246, 0.15)",
                          color: cto.status === "REPARAR" ? "white" : "#8b5cf6",
                          border: "1.5px solid #8b5cf6",
                          borderRadius: "8px",
                          padding: "6px 14px",
                          fontWeight: 800,
                          fontSize: "0.82rem",
                          cursor: isUpdating ? "wait" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          transition: "all 0.15s"
                        }}
                      >
                        Mandar a Reparar
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
                          padding: "6px 14px",
                          fontWeight: 800,
                          fontSize: "0.82rem",
                          cursor: isUpdating ? "wait" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          transition: "all 0.15s"
                        }}
                      >
                        <span>✕</span> Con Fallo
                      </button>

                      <Link
                        href={`/?cto=${encodeURIComponent(cto.num)}`}
                        target="_blank"
                        style={{
                          background: "var(--bg-color)",
                          color: "var(--text-color)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "8px",
                          padding: "6px 10px",
                          fontWeight: 700,
                          fontSize: "0.78rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                      >
                        <span>🗺️</span> Ver Mapa
                      </Link>
                    </div>

                  </div>

                  {/* CASO 1: CTO SIN FOTOS SUBIDAS TODAVÍA */}
                  {cto.images.length === 0 ? (
                    <div style={{
                      padding: "16px 18px",
                      background: "rgba(245, 158, 11, 0.08)",
                      border: "1.5px dashed rgba(245, 158, 11, 0.4)",
                      borderRadius: "12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "12px"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "1.8rem" }}>⚠️</span>
                        <div>
                          <strong style={{ fontSize: "0.92rem", color: "#f59e0b", display: "block" }}>
                            CTO sin evidencias fotográficas registradas
                          </strong>
                          <span style={{ fontSize: "0.78rem", opacity: 0.75 }}>
                            Esta caja no cuenta con fotos subidas por el técnico.
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <Link
                          href={`/photo-guide?ctoId=${encodeURIComponent(cto.id)}`}
                          target="_blank"
                          style={{
                            background: "#f59e0b",
                            color: "white",
                            borderRadius: "8px",
                            padding: "6px 14px",
                            fontSize: "0.8rem",
                            fontWeight: 800,
                            textDecoration: "none"
                          }}
                        >
                          Abrir Guía Fotográfica
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(cto.id, "REPARAR", "Falta tomar evidencias fotográficas")}
                          style={{
                            background: "rgba(139, 92, 246, 0.2)",
                            color: "#8b5cf6",
                            border: "1px solid #8b5cf6",
                            borderRadius: "8px",
                            padding: "6px 14px",
                            fontSize: "0.8rem",
                            fontWeight: 800,
                            cursor: "pointer"
                          }}
                        >
                          Mandar a Reparar
                        </button>
                      </div>
                    </div>
                  ) : visibleImages.length === 0 ? (
                    /* CASO 2: TIENE FOTOS PERO NO DE LA CATEGORÍA FILTRADA */
                    <div style={{
                      padding: "12px 16px",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "10px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "8px"
                    }}>
                      <span style={{ fontSize: "0.82rem", opacity: 0.8 }}>
                        ℹ️ Esta CTO no tiene fotos de la categoría seleccionada (cuenta con {cto.images.length} fotos en otras categorías).
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedCategory("ALL")}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--primary-color)",
                          fontSize: "0.8rem",
                          fontWeight: 800,
                          cursor: "pointer",
                          textDecoration: "underline"
                        }}
                      >
                        Ver todas sus fotos
                      </button>
                    </div>
                  ) : (
                    /* CASO 3: FEED DE FOTOS GRANDES */
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "4px" }}>
                      {visibleImages.map((img, idx) => {
                        const cat = getPhotoCategoryInfo(img.url);
                        const isApproved = !!approvedImages[img.id];

                        return (
                          <div
                            key={img.id}
                            style={{
                              background: "#050811",
                              borderRadius: "12px",
                              overflow: "hidden",
                              border: isApproved
                                ? "2px solid #10b981"
                                : "1px solid rgba(255,255,255,0.08)",
                              boxShadow: isApproved
                                ? "0 4px 18px rgba(16,185,129,0.25)"
                                : "0 4px 14px rgba(0,0,0,0.25)",
                              transition: "all 0.2s ease"
                            }}
                          >
                            {/* Cabecera de la Foto: Identificación de Categoría Real y Botones de Pulgar */}
                            <div style={{
                              padding: "10px 14px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              background: "rgba(255,255,255,0.03)",
                              borderBottom: "1px solid rgba(255,255,255,0.06)",
                              flexWrap: "wrap",
                              gap: "8px"
                            }}>
                              {/* Categoría Detectada */}
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{
                                  fontSize: "0.82rem",
                                  fontWeight: 800,
                                  padding: "4px 10px",
                                  borderRadius: "6px",
                                  background: cat.bg,
                                  color: cat.color,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px"
                                }}>
                                  <span>{cat.icon}</span> {cat.name}
                                </span>
                                <span style={{ fontSize: "0.74rem", opacity: 0.6 }}>
                                  Foto {idx + 1} de {visibleImages.length}
                                </span>
                              </div>

                              {/* Acciones de Voto por Foto: Pulgar Arriba / Pulgar Abajo / Lupa */}
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <button
                                  type="button"
                                  onClick={() => toggleApproveImage(img.id)}
                                  title="Aprobar esta evidencia"
                                  style={{
                                    background: isApproved ? "#10b981" : "rgba(16, 185, 129, 0.15)",
                                    color: isApproved ? "white" : "#10b981",
                                    border: "1.5px solid #10b981",
                                    borderRadius: "8px",
                                    padding: "5px 11px",
                                    fontSize: "0.8rem",
                                    fontWeight: 800,
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    transition: "all 0.15s"
                                  }}
                                >
                                  <span>👍</span> {isApproved ? "✓ Aprobada" : "Aprobar"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openRejectModal(cto, img.id, cat.name)}
                                  title="Rechazar esta foto y enviar a reparar al buzón"
                                  style={{
                                    background: "rgba(239, 68, 68, 0.15)",
                                    color: "#ef4444",
                                    border: "1.5px solid #ef4444",
                                    borderRadius: "8px",
                                    padding: "5px 11px",
                                    fontSize: "0.8rem",
                                    fontWeight: 800,
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    transition: "all 0.15s"
                                  }}
                                >
                                  <span>👎</span> Rechazar
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openZoom(img.url, cto, idx)}
                                  style={{
                                    background: "rgba(255,255,255,0.1)",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "8px",
                                    padding: "5px 10px",
                                    fontSize: "0.78rem",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px"
                                  }}
                                >
                                  <span>🔍</span> Lupa
                                </button>
                              </div>
                            </div>

                            {/* Imagen Grande en Alta Definición */}
                            <div
                              onClick={() => openZoom(img.url, cto, idx)}
                              title="Haz clic para inspeccionar con lupa y zoom"
                              style={{
                                position: "relative",
                                width: "100%",
                                maxHeight: "560px",
                                minHeight: "260px",
                                background: "#000",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "zoom-in",
                                overflow: "hidden"
                              }}
                            >
                              <img
                                src={img.url}
                                alt={`${cat.name} ${cto.num}`}
                                loading="lazy"
                                style={{
                                  width: "100%",
                                  maxHeight: "560px",
                                  objectFit: "contain",
                                  display: "block"
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                    {/* Barra Inferior de Acciones Rápidas de la CTO (Tipo Post) */}
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 14px",
                      background: "rgba(255,255,255,0.02)",
                      borderRadius: "10px",
                      border: "1px solid rgba(255,255,255,0.05)",
                      marginTop: "4px",
                      flexWrap: "wrap",
                      gap: "10px"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "0.84rem", opacity: 0.8, fontWeight: 600 }}>
                          Resolución de CTO {cto.num}:
                        </span>
                        <span style={{
                          fontSize: "0.76rem",
                          fontWeight: 800,
                          padding: "3px 10px",
                          borderRadius: "20px",
                          background: cto.status === "CORRECTO"
                            ? "rgba(16, 185, 129, 0.2)"
                            : cto.status === "REPARAR"
                            ? "rgba(139, 92, 246, 0.2)"
                            : cto.status === "FALLO"
                            ? "rgba(239, 68, 68, 0.2)"
                            : "rgba(245, 158, 11, 0.2)",
                          color: cto.status === "CORRECTO"
                            ? "#10b981"
                            : cto.status === "REPARAR"
                            ? "#8b5cf6"
                            : cto.status === "FALLO"
                            ? "#ef4444"
                            : "#f59e0b"
                        }}>
                          {cto.status === "CORRECTO"
                            ? "✓ CORRECTO"
                            : cto.status === "REPARAR"
                            ? "EN REPARACIÓN"
                            : cto.status === "FALLO"
                            ? "✕ CON FALLO"
                            : "⏳ PENDIENTE"}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
                            fontSize: "0.82rem",
                            cursor: isUpdating ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            boxShadow: cto.status === "CORRECTO" ? "0 2px 8px rgba(16,185,129,0.3)" : "none"
                          }}
                        >
                          <span>👍</span> Fotos Correctas (Bien)
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(cto.id, "REPARAR")}
                          disabled={isUpdating}
                          style={{
                            background: cto.status === "REPARAR" ? "#8b5cf6" : "rgba(139, 92, 246, 0.15)",
                            color: cto.status === "REPARAR" ? "white" : "#8b5cf6",
                            border: "1.5px solid #8b5cf6",
                            borderRadius: "8px",
                            padding: "8px 16px",
                            fontWeight: 800,
                            fontSize: "0.82rem",
                            cursor: isUpdating ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            boxShadow: cto.status === "REPARAR" ? "0 2px 8px rgba(139,92,246,0.3)" : "none"
                          }}
                        >
                          Mandar a Reparar
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
                            fontSize: "0.82rem",
                            cursor: isUpdating ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            boxShadow: cto.status === "FALLO" ? "0 2px 8px rgba(239,68,68,0.3)" : "none"
                          }}
                        >
                          <span>⚠️</span> Marcar Incidencia (Fallo)
                        </button>
                      </div>
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

      {/* MODAL RÁPIDO DE RECHAZO (PULGAR ABAJO): SELECCIÓN DE MOTIVO PARA ENVIAR A REPARAR */}
      {rejectModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", backdropFilter: "blur(4px)" }}>
          <div style={{
            background: "var(--card-bg, #0f172a)",
            border: "1.5px solid #8b5cf6",
            borderRadius: "16px",
            width: "95%",
            maxWidth: "520px",
            padding: "20px",
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 900, color: "var(--text-color)" }}>
                  👎 Rechazar Foto: {rejectModal.categoryName}
                </h3>
                <span style={{ fontSize: "0.8rem", color: "#8b5cf6", fontWeight: 700 }}>
                  CTO {rejectModal.ctoNum} • Pasará a estado REPARAR
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRejectModal(null)}
                style={{ background: "none", border: "none", fontSize: "1.2rem", color: "#94a3b8", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: "0.82rem", opacity: 0.8, margin: 0 }}>
              Elige el motivo de la incidencia en esta imagen. Se guardará en el buzón del técnico para que acuda a subsanarlo:
            </p>

            {/* Opciones Rápidas de un Clic */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {[
                "🏷️ Etiqueta ilegible o ausente",
                "📷 Foto borrosa o desenfocada",
                "⚡ Cableado desordenado o suelto",
                "💡 Potencia fuera de rango o apagada",
                "🗄️ CTO interior sucia o mal peinada",
                "📍 Coordenadas o entorno no coinciden"
              ].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => submitRejectWithReason(opt)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "8px",
                    background: "rgba(139, 92, 246, 0.1)",
                    border: "1px solid rgba(139, 92, 246, 0.3)",
                    color: "var(--text-color)",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s"
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "rgba(139, 92, 246, 0.25)")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "rgba(139, 92, 246, 0.1)")}
                >
                  {opt}
                </button>
              ))}
            </div>

            {/* Campo para motivo personalizado */}
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: "4px", opacity: 0.8 }}>
                O escribe otro motivo específico:
              </label>
              <textarea
                rows={2}
                placeholder="Ej: Falta poner el tapón de goma inferior..."
                value={rejectCustomReason}
                onChange={(e) => setRejectCustomReason(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-color)",
                  color: "var(--text-color)",
                  fontSize: "0.82rem",
                  resize: "none"
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setRejectModal(null)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  background: "var(--bg-color)",
                  color: "var(--text-color)",
                  border: "1px solid var(--border-color)",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer"
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={!rejectCustomReason.trim()}
                onClick={() => submitRejectWithReason(rejectCustomReason.trim())}
                style={{
                  padding: "8px 18px",
                  borderRadius: "8px",
                  background: rejectCustomReason.trim() ? "#8b5cf6" : "rgba(139, 92, 246, 0.3)",
                  color: "white",
                  border: "none",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  cursor: rejectCustomReason.trim() ? "pointer" : "not-allowed"
                }}
              >
                Enviar al Buzón
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ZOOM AVANZADO E INSPECCIÓN DE EVIDENCIA */}
      {zoomedImage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.94)",
            zIndex: 99999,
            display: "flex",
            flexDirection: "column",
            backdropFilter: "blur(6px)"
          }}
        >
          {/* Barra Superior del Zoom */}
          <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.6)", borderBottom: "1px solid rgba(255,255,255,0.1)", zIndex: 10, flexWrap: "wrap", gap: "10px" }}>
            <div>
              <strong style={{ fontSize: "1.1rem", color: "white", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>📸</span> CTO: {zoomedImage.ctoNum} • {getPhotoCategoryInfo(zoomedImage.url).name}
              </strong>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                Foto {zoomedImage.index + 1} de {zoomedImage.total} • Usa la rueda del ratón para hacer zoom o arrastra para moverte
              </span>
            </div>

            {/* Controles del Modal: Zoom + Acciones Bien/Mal/Reparar + Cerrar */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              
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
                onClick={() => handleUpdateStatus(zoomedImage.cto.id, "REPARAR")}
                style={{
                  background: zoomedImage.cto.status === "REPARAR" ? "#8b5cf6" : "rgba(139, 92, 246, 0.2)",
                  color: "#8b5cf6",
                  border: "1.5px solid #8b5cf6",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontWeight: 800,
                  fontSize: "0.82rem",
                  cursor: "pointer"
                }}
              >
                A Reparar
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
                ✕ Con Fallo
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

      {/* Indicador Flotante de Auto-Auditoría al Scrollear */}
      {autoAuditOnScroll && (
        <div style={{
          position: "fixed",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9000,
          background: "rgba(15, 23, 42, 0.95)",
          border: "1.5px solid #10b981",
          borderRadius: "30px",
          padding: "8px 18px",
          color: "#f8fafc",
          fontSize: "0.82rem",
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          gap: "10px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
          backdropFilter: "blur(8px)"
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#10b981" }}>
            <span>⚡</span> Auto-auditoría activa
          </span>
          <span style={{
            background: "rgba(16, 185, 129, 0.2)",
            color: "#10b981",
            padding: "2px 10px",
            borderRadius: "12px",
            fontSize: "0.76rem"
          }}>
            {autoAuditedCount} validadas al dejarlas arriba
          </span>
          <button
            type="button"
            onClick={() => setAutoAuditOnScroll(false)}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "0.75rem",
              textDecoration: "underline",
              padding: 0
            }}
          >
            Pausar
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* VISTA A PANTALLA COMPLETA: MODO TÁCTIL (TINDER-STYLE)     */}
      {/* ========================================================= */}
      {isTactileMode && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 99990,
          background: "#080c14",
          color: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          userSelect: "none",
          overflow: "hidden"
        }}>
          {/* Barra Superior del Modo Táctil */}
          <div style={{
            padding: "12px 16px",
            background: "rgba(15, 23, 42, 0.95)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
            backdropFilter: "blur(10px)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setIsTactileMode(false)}
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "#f8fafc",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <span>✕</span> Salir del Modo Táctil
              </button>

              <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--primary-color)" }}>
                📱 Modo Táctil
              </span>
            </div>

            {/* Progreso del Lote */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, opacity: 0.8 }}>
                {tactileIndex < tactileCtos.length
                  ? `Caja ${tactileIndex + 1} de ${tactileCtos.length}`
                  : `Completado (${tactileCtos.length} revisadas)`}
              </span>
              <div style={{
                width: "90px",
                height: "6px",
                background: "rgba(255, 255, 255, 0.1)",
                borderRadius: "4px",
                overflow: "hidden"
              }}>
                <div style={{
                  height: "100%",
                  width: `${tactileCtos.length > 0 ? Math.min(100, ((tactileIndex) / tactileCtos.length) * 100) : 0}%`,
                  background: "linear-gradient(90deg, #FF7900, #10b981)",
                  transition: "width 0.2s"
                }} />
              </div>
            </div>

            {/* Filtro rápido de categoría dentro de Modo Táctil */}
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
              {[
                { key: "ALL", label: "Todas", icon: "🖼️" },
                { key: "potencia", label: "Potencia", icon: "💡" },
                { key: "entorno", label: "Entorno", icon: "🏠" },
                { key: "cto_abierta", label: "Abierta", icon: "🗄️" },
                { key: "etiquetado_cto", label: "Etiqueta", icon: "🏷️" },
              ].map(cat => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.key);
                    setActivePhotoIndex(0);
                  }}
                  style={{
                    background: selectedCategory === cat.key ? "var(--primary-color)" : "rgba(255, 255, 255, 0.05)",
                    color: selectedCategory === cat.key ? "white" : "rgba(255, 255, 255, 0.7)",
                    border: "none",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  <span>{cat.icon}</span> {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Área Central: Tarjeta Deslizable */}
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            position: "relative",
            overflow: "hidden"
          }}>
            {tactileIndex >= tactileCtos.length ? (
              /* PANTALLA DE FINALIZACIÓN DEL LOTE */
              <div style={{
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "20px",
                padding: "36px 28px",
                textAlign: "center",
                maxWidth: "420px",
                boxShadow: "0 10px 40px rgba(0,0,0,0.5)"
              }}>
                <span style={{ fontSize: "3rem", display: "block", marginBottom: "12px" }}>🎉</span>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 900, margin: "0 0 8px 0" }}>
                  ¡Lote Revisado con Éxito!
                </h2>
                <p style={{ fontSize: "0.85rem", opacity: 0.75, margin: "0 0 20px 0" }}>
                  Has revisado todas las cajas cargadas en esta sesión de Modo Táctil.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => loadCtos(page + 1, false)}
                      style={{
                        background: "var(--primary-color)",
                        color: "white",
                        border: "none",
                        borderRadius: "10px",
                        padding: "12px",
                        fontSize: "0.9rem",
                        fontWeight: 800,
                        cursor: "pointer"
                      }}
                    >
                      Cargar Siguiente Página de CTOs
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsTactileMode(false)}
                    style={{
                      background: "rgba(255, 255, 255, 0.1)",
                      color: "white",
                      border: "none",
                      borderRadius: "10px",
                      padding: "12px",
                      fontSize: "0.9rem",
                      fontWeight: 800,
                      cursor: "pointer"
                    }}
                  >
                    Volver al Feed Normal
                  </button>
                </div>
              </div>
            ) : currentTactileCto ? (
              /* TARJETA TIPO TINDER DESLIZABLE */
              <div
                onMouseDown={handleCardMouseDown}
                onTouchStart={handleCardTouchStart}
                onTouchMove={handleCardTouchMove}
                onTouchEnd={handleCardTouchEnd}
                style={{
                  width: "100%",
                  maxWidth: "480px",
                  height: "100%",
                  maxHeight: "620px",
                  background: "#0f172a",
                  borderRadius: "20px",
                  border: "1.5px solid rgba(255, 255, 255, 0.1)",
                  boxShadow: "0 14px 40px rgba(0, 0, 0, 0.7)",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  cursor: isSwiping ? "grabbing" : "grab",
                  transform: swipeAnim === "right"
                    ? "translateX(140%) rotate(25deg)"
                    : swipeAnim === "left"
                    ? "translateX(-140%) rotate(-25deg)"
                    : `translate(${swipeOffset.x}px, ${swipeOffset.y * 0.15}px) rotate(${swipeOffset.x * 0.08}deg)`,
                  transition: isSwiping ? "none" : "transform 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                  overflow: "hidden"
                }}
              >
                {/* SELLO / WATERMARK: BIEN (DERECHA) */}
                <div style={{
                  position: "absolute",
                  top: "24px",
                  left: "24px",
                  zIndex: 40,
                  border: "4px solid #10b981",
                  color: "#10b981",
                  background: "rgba(16, 185, 129, 0.25)",
                  borderRadius: "12px",
                  padding: "6px 18px",
                  fontWeight: 900,
                  fontSize: "1.8rem",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  transform: "rotate(-18deg)",
                  opacity: swipeAnim === "right" ? 1 : Math.min(1, Math.max(0, swipeOffset.x / 80)),
                  pointerEvents: "none",
                  boxShadow: "0 4px 20px rgba(16, 185, 129, 0.4)",
                  transition: isSwiping ? "none" : "opacity 0.15s"
                }}>
                  ✓ BIEN
                </div>

                {/* SELLO / WATERMARK: REPARAR (IZQUIERDA) */}
                <div style={{
                  position: "absolute",
                  top: "24px",
                  right: "24px",
                  zIndex: 40,
                  border: "4px solid #ef4444",
                  color: "#ef4444",
                  background: "rgba(239, 68, 68, 0.25)",
                  borderRadius: "12px",
                  padding: "6px 18px",
                  fontWeight: 900,
                  fontSize: "1.8rem",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  transform: "rotate(18deg)",
                  opacity: swipeAnim === "left" ? 1 : Math.min(1, Math.max(0, -swipeOffset.x / 80)),
                  pointerEvents: "none",
                  boxShadow: "0 4px 20px rgba(239, 68, 68, 0.4)",
                  transition: isSwiping ? "none" : "opacity 0.15s"
                }}>
                  ✕ REPARAR
                </div>

                {/* HISTORIAS / INDICADORES DE FOTOS SUPERIORES (Estilo Instagram/Tinder) */}
                {currentTactilePhotos.length > 1 && (
                  <div style={{
                    display: "flex",
                    gap: "4px",
                    position: "absolute",
                    top: "10px",
                    left: "12px",
                    right: "12px",
                    zIndex: 30
                  }}>
                    {currentTactilePhotos.map((_, i) => (
                      <div
                        key={i}
                        onClick={(e) => { e.stopPropagation(); setActivePhotoIndex(i); }}
                        style={{
                          flex: 1,
                          height: "4px",
                          borderRadius: "2px",
                          background: i === activePhotoIndex ? "var(--primary-color)" : "rgba(255, 255, 255, 0.35)",
                          cursor: "pointer",
                          transition: "background 0.2s"
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* IMAGEN PRINCIPAL / VISOR */}
                <div style={{
                  flex: 1,
                  position: "relative",
                  background: "#000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden"
                }}>
                  {currentTactilePhotos.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "20px" }}>
                      <span style={{ fontSize: "3.5rem", display: "block", marginBottom: "10px" }}>⚠️</span>
                      <strong style={{ fontSize: "1rem", color: "#f59e0b", display: "block" }}>
                        Sin evidencias fotográficas
                      </strong>
                      <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                        Esta caja no tiene fotografías cargadas
                      </span>
                    </div>
                  ) : (
                    <>
                      <img
                        src={currentTactilePhotos[activePhotoIndex]?.url}
                        alt={`Foto ${currentTactileCto.num}`}
                        draggable={false}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          display: "block",
                          pointerEvents: "none"
                        }}
                      />

                      {/* Pill con Categoría Detectada */}
                      {currentTactilePhotos[activePhotoIndex] && (() => {
                        const cat = getPhotoCategoryInfo(currentTactilePhotos[activePhotoIndex].url);
                        return (
                          <div style={{
                            position: "absolute",
                            bottom: "12px",
                            left: "14px",
                            zIndex: 25,
                            background: "rgba(0, 0, 0, 0.75)",
                            border: `1px solid ${cat.color}`,
                            backdropFilter: "blur(6px)",
                            borderRadius: "8px",
                            padding: "4px 10px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "0.76rem",
                            fontWeight: 800,
                            color: cat.color
                          }}>
                            <span>{cat.icon}</span> {cat.name}
                            <span style={{ opacity: 0.6, fontSize: "0.7rem" }}>
                              ({activePhotoIndex + 1}/{currentTactilePhotos.length})
                            </span>
                          </div>
                        );
                      })()}

                      {/* Botón Lupa en esquina superior derecha de la foto */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (currentTactilePhotos[activePhotoIndex]) {
                            openZoom(currentTactilePhotos[activePhotoIndex].url, currentTactileCto, activePhotoIndex);
                          }
                        }}
                        style={{
                          position: "absolute",
                          top: "22px",
                          right: "12px",
                          zIndex: 25,
                          background: "rgba(0,0,0,0.6)",
                          border: "1px solid rgba(255,255,255,0.2)",
                          color: "white",
                          borderRadius: "8px",
                          padding: "5px 10px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: "pointer"
                        }}
                      >
                        🔍 Zoom
                      </button>

                      {/* Zonas de toque para foto anterior / siguiente */}
                      {currentTactilePhotos.length > 1 && (
                        <>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePhotoIndex(p => Math.max(0, p - 1));
                            }}
                            title="Foto anterior"
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "35%",
                              height: "100%",
                              zIndex: 20,
                              cursor: "pointer"
                            }}
                          />
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setActivePhotoIndex(p => Math.min(currentTactilePhotos.length - 1, p + 1));
                            }}
                            title="Siguiente foto"
                            style={{
                              position: "absolute",
                              top: 0,
                              right: 0,
                              width: "35%",
                              height: "100%",
                              zIndex: 20,
                              cursor: "pointer"
                            }}
                          />
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* INFO INFERIOR DE LA CTO */}
                <div style={{
                  padding: "14px 18px",
                  background: "rgba(15, 23, 42, 0.98)",
                  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px"
                }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                      <span style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--primary-color)" }}>
                        {currentTactileCto.num}
                      </span>
                      {currentTactileCto.cluster && (
                        <span style={{ background: "rgba(59, 130, 246, 0.2)", color: "#3b82f6", fontSize: "0.74rem", fontWeight: 800, padding: "2px 8px", borderRadius: "6px" }}>
                          📁 {currentTactileCto.cluster}
                        </span>
                      )}
                      {currentTactileCto.municipio && (
                        <span style={{ fontSize: "0.76rem", opacity: 0.75 }}>
                          📍 {currentTactileCto.municipio}
                        </span>
                      )}
                    </div>
                    {currentTactileCto.assignedTo && (
                      <span style={{ fontSize: "0.76rem", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: currentTactileCto.assignedTo.color || "#FF7900" }} />
                        {currentTactileCto.assignedTo.name}
                      </span>
                    )}
                  </div>

                  <span style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    padding: "3px 10px",
                    borderRadius: "12px",
                    background: currentTactileCto.status === "CORRECTO"
                      ? "rgba(16, 185, 129, 0.2)"
                      : currentTactileCto.status === "REPARAR"
                      ? "rgba(139, 92, 246, 0.2)"
                      : currentTactileCto.status === "FALLO"
                      ? "rgba(239, 68, 68, 0.2)"
                      : "rgba(245, 158, 11, 0.2)",
                    color: currentTactileCto.status === "CORRECTO"
                      ? "#10b981"
                      : currentTactileCto.status === "REPARAR"
                      ? "#8b5cf6"
                      : currentTactileCto.status === "FALLO"
                      ? "#ef4444"
                      : "#f59e0b"
                  }}>
                    {currentTactileCto.status === "CORRECTO"
                      ? "✓ CORRECTO"
                      : currentTactileCto.status === "REPARAR"
                      ? "A REPARAR"
                      : currentTactileCto.status === "FALLO"
                      ? "✕ FALLO"
                      : "⏳ PENDIENTE"}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {/* BOTONES DE ACCIÓN TÁCTIL ESTILO TINDER */}
          {tactileIndex < tactileCtos.length && currentTactileCto && (
            <div style={{
              padding: "16px 20px 24px",
              background: "rgba(15, 23, 42, 0.95)",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "18px",
              backdropFilter: "blur(8px)"
            }}>
              {/* Botón Deshacer */}
              <button
                type="button"
                onClick={handleTactileUndo}
                disabled={tactileIndex === 0}
                style={{
                  width: "46px",
                  height: "46px",
                  borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: tactileIndex > 0 ? "#f59e0b" : "rgba(255, 255, 255, 0.25)",
                  fontSize: "1.2rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: tactileIndex > 0 ? "pointer" : "not-allowed",
                  transition: "all 0.15s"
                }}
                title="Deshacer última caja (volver atrás)"
              >
                ↩️
              </button>

              {/* BOTÓN IZQUIERDA: MAL (MANDAR A REPARAR) */}
              <button
                type="button"
                onClick={() => handleTactileReject(currentTactileCto)}
                style={{
                  width: "68px",
                  height: "68px",
                  borderRadius: "50%",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "2.5px solid #ef4444",
                  color: "#ef4444",
                  fontSize: "1.8rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: "0 4px 20px rgba(239, 68, 68, 0.35)",
                  transition: "transform 0.15s, background 0.15s"
                }}
                title="Deslizar Izquierda: MAL (Mandar a Reparar)"
              >
                ✕
              </button>

              {/* Botón Motivo Detallado */}
              <button
                type="button"
                onClick={() => {
                  const currentPhoto = currentTactilePhotos[activePhotoIndex];
                  const catName = currentPhoto ? getPhotoCategoryInfo(currentPhoto.url).name : "General";
                  openRejectModal(currentTactileCto, currentPhoto?.id || "", catName);
                }}
                style={{
                  width: "50px",
                  height: "50px",
                  borderRadius: "50%",
                  background: "rgba(139, 92, 246, 0.15)",
                  border: "1.5px solid #8b5cf6",
                  color: "#8b5cf6",
                  fontSize: "1.2rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: "0 2px 10px rgba(139, 92, 246, 0.25)",
                  transition: "all 0.15s"
                }}
                title="Rechazar escribiendo un motivo específico para el técnico"
              >
                💬
              </button>

              {/* BOTÓN DERECHA: BIEN (APROBAR / CORRECTO) */}
              <button
                type="button"
                onClick={() => handleTactileApprove(currentTactileCto)}
                style={{
                  width: "68px",
                  height: "68px",
                  borderRadius: "50%",
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "2.5px solid #10b981",
                  color: "#10b981",
                  fontSize: "1.8rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: "0 4px 20px rgba(16, 185, 129, 0.35)",
                  transition: "transform 0.15s, background 0.15s"
                }}
                title="Deslizar Derecha: BIEN (Marcar Correcto)"
              >
                ✓
              </button>
            </div>
          )}

          {/* Ayuda de Atajos en Pie */}
          <div style={{
            padding: "4px 16px 8px",
            background: "rgba(15, 23, 42, 0.95)",
            textAlign: "center",
            fontSize: "0.72rem",
            opacity: 0.6
          }}>
            Teclado: <strong>← Izquierda: Mal</strong> • <strong>→ Derecha: Bien</strong> • <strong>↑↓: Cambiar Foto</strong> • <strong>Esc: Salir</strong>
          </div>
        </div>
      )}

    </div>
  );
}
