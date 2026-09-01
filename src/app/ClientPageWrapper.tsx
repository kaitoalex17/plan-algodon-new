"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import MapWrapper from "@/components/MapWrapper";
import CtoDrawer from "@/components/CtoDrawer";
import { signOut, useSession } from "next-auth/react";
import { sendLiveTechLocation } from "@/lib/techLocationSync";

type SubStatus = { id: string; name: string; color: string };
type User = { id: string; name: string; email: string };

type StatDay = {
  date: string;
  total: number;
  technicians: {
    [key: string]: {
      name: string;
      email: string;
      color: string;
      count: number;
    };
  };
};

type TechStat = {
  name: string;
  color: string;
  total: number;
};

export default function ClientPageWrapper({ initialCtos, initialMapState }: { initialCtos: any[]; initialMapState: any }) {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  useEffect(() => {
    try {
      router.prefetch("/photo-guide");
    } catch (e) {}
  }, [router]);

  const [selectedCto, setSelectedCto] = useState<any>(null);
  const [ctos, setCtos] = useState(initialCtos);
  const [activeView, setActiveView] = useState<"map" | "list" | "my-day">("map");
  const [searchQuery, setSearchQuery] = useState("");

  const [myDayCtos, setMyDayCtos] = useState<any[]>([]);
  const [myDayLoading, setMyDayLoading] = useState(false);

  const [filterZona, setFilterZona] = useState("");
  const [filterCluster, setFilterCluster] = useState("");

  const [centerCoords, setCenterCoords] = useState<[number, number] | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPwaInstallable, setIsPwaInstallable] = useState(false);

  // Ajustes de visualización (persisten en la base de datos de usuario)
  const [zoomThreshold, setZoomThreshold] = useState(initialMapState?.zoomThreshold || 12);
  const [theme, setTheme] = useState(initialMapState?.theme || "orange");
  const [markerShape, setMarkerShape] = useState(initialMapState?.markerShape || "circle");
  const [markerSize, setMarkerSize] = useState(initialMapState?.markerSize || 6);
  const [showProgramadas, setShowProgramadas] = useState(initialMapState?.showProgramadas !== undefined ? initialMapState.showProgramadas : true);
  const [patternCorrecto, setPatternCorrecto] = useState(initialMapState?.patternCorrecto || "diagonal-stripes");
  const [patternFallo, setPatternFallo] = useState(initialMapState?.patternFallo || "cross-pattern");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMyProgramadasModal, setShowMyProgramadasModal] = useState(false);
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [showRepairInboxModal, setShowRepairInboxModal] = useState(false);
  const [repairInboxSearch, setRepairInboxSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("AUDITORIA");

  const currentUserId = (session?.user as any)?.id;
  const repairCtos = useMemo(() => {
    if (!currentUserId) return [];
    return ctos.filter((c: any) => c.status === "REPARAR" && c.assignedToId === currentUserId);
  }, [ctos, currentUserId]);

  useEffect(() => {
    // Sincronizar tema con localStorage y clases globales de body y html
    if (theme) {
      try {
        localStorage.setItem("app_theme", theme);
      } catch (e) {}
      document.documentElement.className = document.documentElement.className.replace(/theme-\S+/g, "").trim() + ` theme-${theme}`;
      document.body.className = document.body.className.replace(/theme-\S+/g, "").trim() + ` theme-${theme}`;
    }
  }, [theme]);

  // Sincronización automática de ubicación GPS: al entrar y cada 10 minutos
  useEffect(() => {
    if (session?.user) {
      // 1. Envío inmediato al entrar en la app
      sendLiveTechLocation("Entrada a la app");

      // 2. Intervalo periódico cada 10 minutos (600.000 ms)
      const interval = setInterval(() => {
        sendLiveTechLocation("Intervalo periódico (10 min)");
      }, 10 * 60 * 1000);

      return () => clearInterval(interval);
    }
  }, [session?.user]);

  // Selección automática de CTO si viene especificada en la URL (ej: /?ctoId=... o /?cto=...)
  useEffect(() => {
    if (typeof window !== "undefined" && ctos.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const targetCtoId = params.get("ctoId");
      const targetCtoNum = params.get("cto");
      if (targetCtoId) {
        const found = ctos.find(c => c.id === targetCtoId);
        if (found) setSelectedCto(found);
      } else if (targetCtoNum) {
        const found = ctos.find(c => (c.num || "").toLowerCase() === targetCtoNum.toLowerCase());
        if (found) setSelectedCto(found);
      }
    }
  }, [ctos]);

  const handleThemeChange = async (val: string) => {
    setTheme(val);
    try {
      localStorage.setItem("app_theme", val);
      document.documentElement.className = document.documentElement.className.replace(/theme-\S+/g, "").trim() + ` theme-${val}`;
      document.body.className = document.body.className.replace(/theme-\S+/g, "").trim() + ` theme-${val}`;
      await fetch("/api/users/map-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: val })
      });
    } catch (err) {
      console.error("Error guardando tema en BD:", err);
    }
  };

  const handleMarkerShapeChange = async (val: string) => {
    setMarkerShape(val);
    try {
      await fetch("/api/users/map-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markerShape: val })
      });
    } catch (err) {
      console.error("Error guardando forma de marcador:", err);
    }
  };

  const handleMarkerSizeChange = async (val: number) => {
    setMarkerSize(val);
    try {
      await fetch("/api/users/map-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markerSize: val })
      });
    } catch (err) {
      console.error("Error guardando tamaño de marcador:", err);
    }
  };

  const handlePatternCorrectoChange = async (val: string) => {
    setPatternCorrecto(val);
    try {
      await fetch("/api/users/map-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patternCorrecto: val })
      });
    } catch (err) {
      console.error("Error guardando patrón correcto:", err);
    }
  };

  const handlePatternFalloChange = async (val: string) => {
    setPatternFallo(val);
    try {
      await fetch("/api/users/map-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patternFallo: val })
      });
    } catch (err) {
      console.error("Error guardando patrón fallo:", err);
    }
  };

  const handleShowProgramadasToggle = async (val: boolean) => {
    setShowProgramadas(val);
    try {
      await fetch("/api/users/map-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showProgramadas: val })
      });
    } catch (err) {
      console.error("Error guardando showProgramadas:", err);
    }
  };

  const handleFilterCategoryChange = (val: string) => {
    setFilterCategory(val);
    localStorage.setItem("filter_category", val);
  };

  // Estadísticas
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsData, setStatsData] = useState<{ stats: StatDay[]; totalByTech: TechStat[] }>({ stats: [], totalByTech: [] });

  // Estados de filtros avanzados
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSubStatus, setFilterSubStatus] = useState("");
  const [filterAssigned, setFilterAssigned] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Opciones de filtros dinámicos (cargados de la BD)
  const [subStatuses, setSubStatuses] = useState<SubStatus[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Cargar opciones para los filtros y ajustes guardados
  const fetchFilterOptions = useCallback(async () => {
    try {
      const [resSub, resUsers] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/users"),
      ]);
      if (resSub.ok) setSubStatuses(await resSub.json());
      if (resUsers.ok) setUsers(await resUsers.json());
    } catch (e) {
      console.error("Error al cargar opciones de filtro:", e);
    }
  }, []);

  useEffect(() => {
    fetchFilterOptions();
    
    // Cargar preferencia de Zoom de localStorage como fallback
    const savedThreshold = localStorage.getItem("cto_zoom_threshold");
    if (savedThreshold && !initialMapState?.zoomThreshold) {
      setZoomThreshold(parseInt(savedThreshold));
    }

    // Cargar vista guardada y filtros de localStorage
    const savedView = localStorage.getItem("active_view");
    if (savedView === "map" || savedView === "list" || savedView === "my-day") {
      setActiveView(savedView as "map" | "list" | "my-day");
    }
    const savedStatus = localStorage.getItem("filter_status") || "";
    const savedSubStatus = localStorage.getItem("filter_sub_status") || "";
    const savedAssigned = localStorage.getItem("filter_assigned") || "";
    const savedZona = localStorage.getItem("filter_zona") || "";
    const savedCluster = localStorage.getItem("filter_cluster") || "";
    const savedSearch = localStorage.getItem("search_query") || "";
    const savedCategory = localStorage.getItem("filter_category") || "AUDITORIA";

    setFilterStatus(savedStatus);
    setFilterSubStatus(savedSubStatus);
    setFilterAssigned(savedAssigned);
    setFilterZona(savedZona);
    setFilterCluster(savedCluster);
    setSearchQuery(savedSearch);
    setFilterCategory(savedCategory);

    // Registrar Service Worker para soporte PWA (limpiando versiones previas corruptas)
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then((reg) => {
          reg.update();
          console.log("Service Worker registrado y actualizado:", reg.scope);
        })
        .catch((err) => console.error("Error al registrar Service Worker:", err));
    }
  }, [fetchFilterOptions, initialMapState]);

  // Recarga silenciosa de CTOs para el mapa sin recargar la página
  const reloadCtosSilently = useCallback(async () => {
    try {
      const res = await fetch("/api/ctos/all");
      if (res.ok) {
        const freshCtos = await res.json();
        setCtos(freshCtos);
      }
    } catch (e) {
      console.error("Error al refrescar CTOs silenciosamente:", e);
    }
  }, []);

  // Monitor en tiempo real (Websocket / SSE / Polling ultraligero de señales de sincronización)
  const lastSyncTimestampRef = useRef<number>(Date.now());
  useEffect(() => {
    const checkRealtimeSync = async () => {
      try {
        const res = await fetch("/api/realtime");
        if (res.ok) {
          const data = await res.json();
          if (data.lastUpdate && data.lastUpdate > lastSyncTimestampRef.current) {
            lastSyncTimestampRef.current = data.lastUpdate;
            reloadCtosSilently();
          }
        }
      } catch (e) {
        // Silencioso
      }
    };

    // Polling ultraligero de sincronización en tiempo real (señal de pocos bytes)
    const interval = setInterval(checkRealtimeSync, 2500);
    return () => clearInterval(interval);
  }, [reloadCtosSilently]);

  // Escuchar evento de instalación de la PWA
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsPwaInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsPwaInstallable(false);
      setDeferredPrompt(null);
    }
  };

  // Centrar mapa en CTO buscada tras 2 segundos de inactividad al escribir
  useEffect(() => {
    if (!searchQuery.trim()) return;

    const timer = setTimeout(() => {
      const query = searchQuery.toLowerCase().trim();
      const matched = ctos.find(c => 
        c.num.toLowerCase().includes(query) ||
        (c.numeroNuevo && c.numeroNuevo.toLowerCase().includes(query))
      );

      if (matched) {
        setCenterCoords([matched.lat, matched.lng]);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [searchQuery, ctos]);

  const handleActiveViewChange = (view: "map" | "list" | "my-day") => {
    setActiveView(view);
    localStorage.setItem("active_view", view);
  };

  const handleSearchQueryChange = (val: string) => {
    setSearchQuery(val);
    localStorage.setItem("search_query", val);
  };

  const handleFilterStatusChange = (val: string) => {
    setFilterStatus(val);
    localStorage.setItem("filter_status", val);
  };

  const handleFilterSubStatusChange = (val: string) => {
    setFilterSubStatus(val);
    localStorage.setItem("filter_sub_status", val);
  };

  const handleFilterAssignedChange = (val: string) => {
    setFilterAssigned(val);
    localStorage.setItem("filter_assigned", val);
  };

  const handleToggleMyPendingFilter = () => {
    const currentUserId = (session?.user as any)?.id;
    if (!currentUserId) return;

    const isCurrentlyActive = filterStatus === "PENDIENTE" && filterAssigned === currentUserId;

    if (isCurrentlyActive) {
      setFilterStatus("");
      setFilterAssigned("");
      localStorage.removeItem("filter_status");
      localStorage.removeItem("filter_assigned");
    } else {
      setFilterStatus("PENDIENTE");
      setFilterAssigned(currentUserId);
      localStorage.setItem("filter_status", "PENDIENTE");
      localStorage.setItem("filter_assigned", currentUserId);
    }
  };

  const handleFilterZonaChange = (val: string) => {
    setFilterZona(val);
    setFilterCluster("");
    localStorage.setItem("filter_zona", val);
    localStorage.removeItem("filter_cluster");
  };

  const handleFilterClusterChange = (val: string) => {
    setFilterCluster(val);
    localStorage.setItem("filter_cluster", val);
  };

  const fetchMyDayCtos = useCallback(async () => {
    setMyDayLoading(true);
    try {
      const res = await fetch("/api/my-day");
      if (res.ok) {
        setMyDayCtos(await res.json());
      }
    } catch (e) {
      console.error("Error cargando CTOs de mi día:", e);
    } finally {
      setMyDayLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeView === "my-day") {
      fetchMyDayCtos();
    }
  }, [activeView, fetchMyDayCtos]);

  // Cargar estadísticas
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/stats");
      if (res.ok) {
        setStatsData(await res.json());
      }
    } catch (e) {
      console.error("Error cargando estadísticas:", e);
    } finally {
      setStatsLoading(false);
    }
  };

  const openStats = () => {
    fetchStats();
    setShowStatsModal(true);
  };

  const handleZoomThresholdChange = async (val: number) => {
    setZoomThreshold(val);
    localStorage.setItem("cto_zoom_threshold", String(val));
    try {
      await fetch("/api/users/map-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoomThreshold: val })
      });
    } catch (err) {
      console.error("Error guardando zoomThreshold en BD:", err);
    }
  };

  const uniqueZonas = useMemo(() => {
    const set = new Set<string>();
    ctos.forEach(c => {
      if (c.zona) set.add(c.zona);
    });
    return Array.from(set).sort();
  }, [ctos]);

  const uniqueClusters = useMemo(() => {
    const set = new Set<string>();
    ctos.forEach(c => {
      if (filterZona && c.zona !== filterZona) return;
      if (c.cluster) set.add(c.cluster);
    });
    return Array.from(set).sort();
  }, [ctos, filterZona]);

  // Contar cuántos filtros avanzados están aplicados
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterStatus) count++;
    if (filterSubStatus) count++;
    if (filterAssigned) count++;
    if (filterZona) count++;
    if (filterCluster) count++;
    if (filterCategory !== "AUDITORIA") count++;
    return count;
  }, [filterStatus, filterSubStatus, filterAssigned, filterZona, filterCluster, filterCategory]);

  const isMyPendingFilterActive = useMemo(() => {
    const currentUserId = (session?.user as any)?.id;
    return filterStatus === "PENDIENTE" && filterAssigned === currentUserId && !!currentUserId;
  }, [filterStatus, filterAssigned, session]);

  // Resetear filtros
  const handleClearFilters = () => {
    setFilterStatus("");
    setFilterSubStatus("");
    setFilterAssigned("");
    setFilterZona("");
    setFilterCluster("");
    setSearchQuery("");
    setFilterCategory("AUDITORIA");
    localStorage.removeItem("filter_status");
    localStorage.removeItem("filter_sub_status");
    localStorage.removeItem("filter_assigned");
    localStorage.removeItem("filter_zona");
    localStorage.removeItem("filter_cluster");
    localStorage.removeItem("search_query");
    localStorage.removeItem("filter_category");
  };

  // Filtrar CTOs dinámicamente según búsqueda y filtros avanzados
  const filteredCtos = useMemo(() => {
    let result = ctos;

    // 0. Filtrar por categoría
    if (filterCategory === "AUDITORIA") {
      result = result.filter(c => c.category !== "PROGRAMADA");
    } else if (filterCategory === "PROGRAMADA") {
      result = result.filter(c => c.category === "PROGRAMADA");
    }

    // 1. Buscador de texto
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      result = result.filter(c => 
        c.num.toLowerCase().includes(query) ||
        (c.municipio && c.municipio.toLowerCase().includes(query)) ||
        (c.colocacion && c.colocacion.toLowerCase().includes(query)) ||
        (c.numeroNuevo && c.numeroNuevo.toLowerCase().includes(query)) ||
        (c.zona && c.zona.toLowerCase().includes(query)) ||
        (c.cluster && c.cluster.toLowerCase().includes(query))
      );
    }

    // 2. Filtro de Estado
    if (filterStatus) {
      result = result.filter(c => c.status === filterStatus);
    }

    // 3. Filtro de Subestado
    if (filterSubStatus) {
      if (filterSubStatus === "none") {
        result = result.filter(c => !c.subStatusId);
      } else {
        result = result.filter(c => c.subStatusId === filterSubStatus);
      }
    }

    // 4. Filtro de Asignación
    if (filterAssigned) {
      if (filterAssigned === "unassigned") {
        result = result.filter(c => !c.assignedToId);
      } else {
        result = result.filter(c => c.assignedToId === filterAssigned);
      }
    }

    // 5. Filtro de Zona
    if (filterZona) {
      result = result.filter(c => c.zona === filterZona);
    }

    // 6. Filtro de Cluster
    if (filterCluster) {
      result = result.filter(c => c.cluster === filterCluster);
    }

    return result;
  }, [ctos, searchQuery, filterStatus, filterSubStatus, filterAssigned, filterZona, filterCluster, filterCategory]);

  // Limitar el renderizado en lista para rendimiento móvil óptimo (máx 100 elementos a la vez)
  const visibleListCtos = useMemo(() => {
    return filteredCtos.slice(0, 100);
  }, [filteredCtos]);

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--bg-color)" }}>
      
      {/* Cabecera Principal y Barra de Búsqueda (Fija arriba) */}
      <div style={{ background: "var(--card-bg)", borderBottom: "1px solid var(--border-color)", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", zIndex: 10, padding: "12px 16px" }}>
        
        {/* Fila 1: Logo y Acciones */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <h1 
            onClick={() => setShowImpactModal(true)}
            style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "var(--text-color)", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", userSelect: "none" }}
            title="Ver estadísticas del proyecto"
          >
            <span style={{ color: "var(--primary-color)" }}>●</span> Algodon
          </h1>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            {/* Botón Refrescar (🔄) */}
            <button 
              onClick={() => window.location.reload()} 
              className="btn" 
              title="Actualizar Datos"
              style={{ 
                padding: "6px 8px", background: "var(--bg-color)", color: "var(--text-color)", 
                minHeight: "34px", display: "flex", alignItems: "center", justifyContent: "center", 
                border: "1px solid var(--border-color)", borderRadius: "6px", cursor: "pointer" 
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l.73-.72" />
              </svg>
            </button>

            {/* Botón Mi Perfil (👤 Iconoir Outline) - Toggles assigned pending orders */}
            <button 
              onClick={handleToggleMyPendingFilter} 
              className="btn" 
              title={isMyPendingFilterActive ? "Quitar filtro Mis Pendientes" : "Filtrar Mis Pendientes"}
              style={{ 
                padding: "6px 8px", 
                background: isMyPendingFilterActive ? "var(--primary-color, #FF7900)" : "var(--bg-color)", 
                color: isMyPendingFilterActive ? "#ffffff" : "var(--text-color)", 
                minHeight: "34px", display: "flex", alignItems: "center", justifyContent: "center", 
                border: isMyPendingFilterActive ? "1px solid var(--primary-color, #FF7900)" : "1px solid var(--border-color)", 
                borderRadius: "6px", cursor: "pointer",
                transition: "all 0.2s ease"
              }}
            >
              <svg 
                width="18" 
                height="18" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>

            {/* Botón Buzón de Notificaciones: Solo visible para usuarios que tengan CTOs asignadas para reparar */}
            {repairCtos.length > 0 && (
              <button 
                onClick={() => setShowRepairInboxModal(true)} 
                className="btn" 
                title={`Buzón de Reparaciones e Incidencias (${repairCtos.length} pendientes)`}
                style={{ 
                  position: "relative",
                  padding: "6px 8px", 
                  background: "rgba(139, 92, 246, 0.15)", 
                  color: "#8b5cf6", 
                  minHeight: "34px", display: "flex", alignItems: "center", justifyContent: "center", 
                  border: "1.5px solid #8b5cf6", 
                  borderRadius: "6px", cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
              >
                <svg 
                  width="18" 
                  height="18" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2.3" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  <path d="M8 9h8" />
                  <path d="M8 13h5" />
                </svg>

                <span style={{
                  position: "absolute",
                  top: "-5px",
                  right: "-5px",
                  background: "#8b5cf6",
                  color: "white",
                  borderRadius: "10px",
                  padding: "1px 5px",
                  fontSize: "0.64rem",
                  fontWeight: 900,
                  boxShadow: "0 2px 6px rgba(139, 92, 246, 0.5)",
                  lineHeight: "1.2"
                }}>
                  {repairCtos.length}
                </span>
              </button>
            )}
            {isAdmin && (
              <button 
                onClick={() => window.location.href = "/admin"} 
                className="btn" 
                style={{ padding: "6px 10px", fontSize: "0.78rem", background: "var(--bg-color)", color: "var(--text-color)", minHeight: "34px", fontWeight: 600, border: "1px solid var(--border-color)", borderRadius: "6px" }}
              >
                Admin
              </button>
            )}
            <button 
              onClick={async () => {
                await signOut({ redirect: false });
                document.cookie.split(";").forEach((c) => {
                  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                });
                window.location.href = "/login?loggedOut=true";
              }} 
              className="btn" 
              style={{ padding: "6px 10px", fontSize: "0.78rem", background: "#fee2e2", color: "#dc2626", minHeight: "34px", fontWeight: 600, borderRadius: "6px", cursor: "pointer" }}
            >
              Salir
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-color)", opacity: 0.5, display: "flex", alignItems: "center", pointerEvents: "none" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="6" />
                <line x1="16" y1="16" x2="21" y2="21" />
              </svg>
            </span>
            <input
              type="text"
              className="input-field"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => handleSearchQueryChange(e.target.value)}
              style={{ 
                padding: "8px 36px 8px 32px", 
                fontSize: "0.88rem", 
                minHeight: "38px", 
                background: "var(--card-bg)",
                border: "1.5px solid var(--border-color)",
                color: "var(--text-color)"
              }}
            />
            {searchQuery && (
              <button
                onClick={() => handleSearchQueryChange("")}
                style={{
                  position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", fontSize: "1rem", color: "#94a3b8", cursor: "pointer", padding: "2px"
                }}
              >
                ✕
              </button>
            )}
          </div>
          
          {/* Botón Filtros (🎛️ Iconoir Outline style) */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            title="Filtros avanzados"
            style={{
              padding: "0 8px", fontSize: "0.82rem", fontWeight: 700, borderRadius: "8px", border: "1.5px solid var(--border-color)",
              background: showFilters || activeFiltersCount > 0 ? "var(--primary-color)" : "var(--card-bg)",
              color: showFilters || activeFiltersCount > 0 ? "white" : "var(--text-color)",
              cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", minHeight: "38px",
              transition: "all 0.2s"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            {activeFiltersCount > 0 ? `(${activeFiltersCount})` : ""}
          </button>

          {/* Botón Estadísticas */}
          <button
            onClick={openStats}
            title="Estadísticas de auditoría"
            style={{
              padding: "0 8px", borderRadius: "8px", border: "1.5px solid var(--border-color)",
              background: "var(--card-bg)", color: "var(--text-color)",
              cursor: "pointer", display: "flex", alignItems: "center", minHeight: "38px"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </button>

          {/* Botón Control Diario de Auditorías y Cierres */}
          <button
            onClick={() => {
              if (isAdmin || (session?.user as any)?.role === "GESTOR") {
                window.location.href = "/admin/daily-summary";
              } else {
                openStats();
              }
            }}
            title="Control Diario de Auditorías por Técnico"
            style={{
              padding: "0 8px", borderRadius: "8px", border: "1.5px solid var(--border-color)",
              background: "var(--card-bg)", color: "var(--text-color)",
              cursor: "pointer", display: "flex", alignItems: "center", minHeight: "38px"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>

          {/* Botón Ajustes */}
          <button
            onClick={() => setShowSettingsModal(true)}
            title="Ajustes de mapa y visualización"
            style={{
              padding: "0 8px", borderRadius: "8px", border: "1.5px solid var(--border-color)",
              background: "var(--card-bg)", color: "var(--text-color)",
              cursor: "pointer", display: "flex", alignItems: "center", minHeight: "38px"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        {/* Fila Opcional: Sección desplegable de filtros avanzados */}
        {showFilters && (
          <div style={{
            background: "var(--bg-color)", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-color)", 
            marginBottom: "12px", display: "flex", flexDirection: "column", gap: "8px"
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {/* Selector de Estado */}
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-color)", opacity: 0.8, marginBottom: "3px" }}>Estado</label>
                <select 
                  className="input-field" 
                  value={filterStatus} 
                  onChange={e => handleFilterStatusChange(e.target.value)}
                  style={{ minHeight: "36px", padding: "4px 8px", fontSize: "0.85rem", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)" }}
                >
                  <option value="">Todos</option>
                  <option value="PENDIENTE">PENDIENTE</option>
                  <option value="CORRECTO">CORRECTO</option>
                  <option value="REPARAR">REPARAR</option>
                  <option value="FALLO">FALLO</option>
                </select>
              </div>

              {/* Selector de Subestado */}
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-color)", opacity: 0.8, marginBottom: "3px" }}>Subestado</label>
                <select 
                  className="input-field" 
                  value={filterSubStatus} 
                  onChange={e => handleFilterSubStatusChange(e.target.value)}
                  style={{ minHeight: "36px", padding: "4px 8px", fontSize: "0.85rem", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)" }}
                >
                  <option value="">Todos</option>
                  <option value="none">Sin subestado</option>
                  {subStatuses.map(sub => (
                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                  ))}
                </select>
              </div>

              {/* Selector de Zona */}
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-color)", opacity: 0.8, marginBottom: "3px" }}>Zona</label>
                <select 
                  className="input-field" 
                  value={filterZona} 
                  onChange={e => handleFilterZonaChange(e.target.value)}
                  style={{ minHeight: "36px", padding: "4px 8px", fontSize: "0.85rem", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)" }}
                >
                  <option value="">Todas</option>
                  {uniqueZonas.map(z => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>

              {/* Selector de Cluster */}
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-color)", opacity: 0.8, marginBottom: "3px" }}>Cluster</label>
                <select 
                  className="input-field" 
                  value={filterCluster} 
                  onChange={e => handleFilterClusterChange(e.target.value)}
                  style={{ minHeight: "36px", padding: "4px 8px", fontSize: "0.85rem", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)" }}
                >
                  <option value="">Todos</option>
                  {uniqueClusters.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {/* Selector de Técnico */}
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-color)", opacity: 0.8, marginBottom: "3px" }}>Asignado a</label>
                <select 
                  className="input-field" 
                  value={filterAssigned} 
                  onChange={e => handleFilterAssignedChange(e.target.value)}
                  style={{ minHeight: "36px", padding: "4px 8px", fontSize: "0.85rem", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)" }}
                >
                  <option value="">Todos los técnicos</option>
                  <option value="unassigned">Sin asignar</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name || u.email}</option>
                  ))}
                </select>
              </div>

              {/* Selector de Categoría */}
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-color)", opacity: 0.8, marginBottom: "3px" }}>Categoría</label>
                <select 
                  className="input-field" 
                  value={filterCategory} 
                  onChange={e => handleFilterCategoryChange(e.target.value)}
                  style={{ minHeight: "36px", padding: "4px 8px", fontSize: "0.85rem", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)" }}
                >
                  <option value="AUDITORIA">Auditoría</option>
                  <option value="PROGRAMADA">Reparos</option>
                  <option value="TODOS">Todos</option>
                </select>
              </div>
            </div>

            {/* Limpiar Filtros */}
            {(activeFiltersCount > 0 || searchQuery) && (
              <button 
                onClick={handleClearFilters}
                className="btn"
                style={{ 
                  background: "#fee2e2", color: "#dc2626", minHeight: "32px", fontSize: "0.85rem", 
                  padding: "4px 8px", width: "100%", fontWeight: 700 
                }}
              >
                Limpiar Filtros Aplicados
              </button>
            )}
          </div>
        )}

        {/* Fila 3: Selector de Vista (Mapa vs Lista vs Mi día) - Diseño Premium Táctil */}
        <div style={{ display: "flex", background: "var(--bg-color)", borderRadius: "10px", padding: "4px", gap: "2px" }}>
          <button
            onClick={() => handleActiveViewChange("map")}
            style={{
              flex: 1, padding: "8px 4px", border: "none", borderRadius: "8px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer",
              background: activeView === "map" ? "var(--primary-color)" : "transparent",
              color: activeView === "map" ? "white" : "var(--text-color)",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px"
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l-6-3V3l6 3m0 12l6-3m-6 3V6m6 9l6 3V9l-6-3m0 9V6" />
            </svg>
            Mapa ({filteredCtos.length})
          </button>
          <button
            onClick={() => handleActiveViewChange("list")}
            style={{
              flex: 1, padding: "8px 4px", border: "none", borderRadius: "8px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer",
              background: activeView === "list" ? "var(--primary-color)" : "transparent",
              color: activeView === "list" ? "white" : "var(--text-color)",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px"
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Lista ({filteredCtos.length})
          </button>
          <button
            onClick={() => handleActiveViewChange("my-day")}
            style={{
              flex: 1, padding: "8px 4px", border: "none", borderRadius: "8px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer",
              background: activeView === "my-day" ? "var(--primary-color)" : "transparent",
              color: activeView === "my-day" ? "white" : "var(--text-color)",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px"
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Mi día
          </button>
        </div>

      </div>

      {/* Contenedor de la Vista Activa */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        
        {/* VISTA MAPA */}
        <div style={{ display: activeView === "map" ? "block" : "none", width: "100%", height: "100%" }}>
          <MapWrapper 
            ctos={filteredCtos} // El mapa se filtra en tiempo real
            onCtoClick={(cto: any) => setSelectedCto(cto)} 
            initialMapState={initialMapState}
            zoomThreshold={zoomThreshold}
            users={users}
            markerShape={markerShape}
            markerSize={markerSize}
            patternCorrecto={patternCorrecto}
            patternFallo={patternFallo}
            centerCoords={centerCoords}
          />
        </div>

        {/* VISTA LISTA (Scrollable y optimizada para móvil) */}
        {activeView === "list" && (
          <div style={{ width: "100%", height: "100%", overflowY: "auto", padding: "12px" }}>
            
            {filteredCtos.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
                <p style={{ fontSize: "1.1rem", fontWeight: 600 }}>No se encontraron CTOs</p>
                <p style={{ fontSize: "0.9rem", color: "#94a3b8", marginTop: "4px" }}>Prueba a cambiar el término o filtros de búsqueda</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "600px", margin: "0 auto", paddingBottom: "80px" }}>
                
                {filteredCtos.length > 100 && (
                  <div style={{ background: "#eff6ff", color: "#1e40af", padding: "10px 14px", borderRadius: "8px", fontSize: "0.85rem", border: "1px solid #bfdbfe", fontWeight: 600 }}>
                    Mostrando las primeras 100 de {filteredCtos.length} CTOs. Refina tu búsqueda para encontrar más.
                  </div>
                )}

                 {visibleListCtos.map((cto) => {
                   const statusColor = cto.subStatus?.color || (cto.status === "PENDIENTE" ? "#808080" : cto.status === "CORRECTO" ? "#10b981" : "#ef4444");
                   
                   return (
                     <div 
                        key={cto.id}
                        onClick={() => setSelectedCto(cto)}
                        className="glass-panel hover-card"
                        style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px 16px", background: "var(--card-bg)", border: "1.5px solid var(--border-color)", borderRadius: "12px", cursor: "pointer", transition: "transform 0.15s, border-color 0.15s" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text-color)" }}>{cto.num}</span>
                              {cto.numeroNuevo && (
                                <span style={{ fontSize: "0.75rem", color: "#64748b", background: "var(--bg-color)", padding: "2px 6px", borderRadius: "4px" }}>
                                  {cto.numeroNuevo}
                                </span>
                              )}
                            </div>
                            <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "4px 0 0 0" }}>{cto.municipio || "Sin Municipio"} - {cto.colocacion || "Sin Colocación"}</p>
                            {(cto.zona || cto.cluster) && (
                              <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "2px 0 0 0" }}>
                                {cto.zona && <span>Zona: {cto.zona}</span>} {cto.cluster && <span>• Cluster: {cto.cluster}</span>}
                              </p>
                            )}
                          </div>
                          
                          <span style={{ 
                            padding: "4px 10px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700,
                            background: cto.status === "CORRECTO" || cto.status === "REVISADO" ? "#d1fae5" : cto.status === "REPARAR" ? "#ede9fe" : cto.status === "FALLO" ? "#fee2e2" : "#f3f4f6",
                            color: cto.status === "CORRECTO" || cto.status === "REVISADO" ? "#065f46" : cto.status === "REPARAR" ? "#6d28d9" : cto.status === "FALLO" ? "#991b1b" : "#374151"
                          }}>
                            {cto.status}
                          </span>
                        </div>

                        {/* Tecnico Asignado en la lista */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-color)", paddingTop: "8px", fontSize: "0.8rem" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor }} />
                            <strong style={{ color: "var(--text-color)" }}>{cto.subStatus?.name || "Sin Subestado"}</strong>
                          </span>
                          <span style={{ color: "#64748b" }}>
                            👤 {cto.assignedTo ? (cto.assignedTo.name || cto.assignedTo.email) : "Sin asignar"}
                          </span>
                        </div>
                      </div>
                   );
                 })}
              </div>
            )}
          </div>
        )}

        {/* VISTA MI DÍA */}
        {activeView === "my-day" && (() => {
          const correctCount = myDayCtos.filter(c => c.status === "CORRECTO").length;
          const falloCount = myDayCtos.filter(c => c.status === "FALLO").length;
          const totalCount = myDayCtos.length;

          return (
            <div style={{ width: "100%", height: "100%", overflowY: "auto", padding: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "600px", margin: "0 auto", paddingBottom: "80px" }}>
                <div style={{ background: "var(--card-bg)", padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--border-color)", marginBottom: "4px" }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-color)", margin: 0 }}>Mis auditorías de hoy</h3>
                  <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "2px 0 0 0" }}>
                    Lista de CTOs auditadas o modificadas por tu perfil durante el día de hoy.
                  </p>

                  {/* Contadores */}
                  <div style={{ display: "flex", gap: "10px", marginTop: "12px", borderTop: "1px dashed var(--border-color)", paddingTop: "10px" }}>
                    <div style={{ flex: 1, textAlign: "center", background: "var(--bg-color)", padding: "6px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                      <span style={{ display: "block", fontSize: "0.7rem", color: "#64748b", fontWeight: 600 }}>Total</span>
                      <strong style={{ fontSize: "1.1rem", color: "var(--text-color)" }}>{totalCount}</strong>
                    </div>
                    <div style={{ flex: 1, textAlign: "center", background: "#e8f5e9", padding: "6px", borderRadius: "6px", border: "1px solid #c8e6c9" }}>
                      <span style={{ display: "block", fontSize: "0.7rem", color: "#2e7d32", fontWeight: 600 }}>Correctas</span>
                      <strong style={{ fontSize: "1.1rem", color: "#2e7d32" }}>{correctCount}</strong>
                    </div>
                    <div style={{ flex: 1, textAlign: "center", background: "#ffebee", padding: "6px", borderRadius: "6px", border: "1px solid #ffcdd2" }}>
                      <span style={{ display: "block", fontSize: "0.7rem", color: "#c62828", fontWeight: 600 }}>Fallidas</span>
                      <strong style={{ fontSize: "1.1rem", color: "#c62828" }}>{falloCount}</strong>
                    </div>
                  </div>
                </div>

                {myDayLoading ? (
                  <div style={{ textAlign: "center", padding: "3rem", color: "#64748b", fontSize: "0.9rem" }}>
                    Cargando tus auditorías de hoy...
                  </div>
                ) : myDayCtos.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "3rem", color: "#64748b", background: "var(--card-bg)", border: "1px dashed var(--border-color)", borderRadius: "10px" }}>
                    <p style={{ fontSize: "0.95rem", fontWeight: 600 }}>Aún no has auditado ninguna CTO hoy</p>
                    <p style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "4px" }}>Las CTOs que audites o edites hoy aparecerán aquí en orden cronológico.</p>
                  </div>
                ) : (
                  myDayCtos.map((cto) => {
                    const statusColor = cto.subStatus?.color || (cto.status === "PENDIENTE" ? "#808080" : cto.status === "CORRECTO" ? "#10b981" : "#ef4444");
                    const timeString = new Date(cto.auditTime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

                    return (
                      <div 
                        key={cto.id}
                        onClick={() => setSelectedCto(cto)}
                        className="glass-panel hover-card"
                        style={{ 
                          display: "flex", alignItems: "center", justifyContent: "space-between", 
                          padding: "12px 16px", background: "var(--card-bg)", 
                          border: "1.5px solid var(--border-color)", borderRadius: "10px", 
                          cursor: "pointer", transition: "transform 0.15s, border-color 0.15s"
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-color)" }}>{cto.num}</span>
                            {cto.numeroNuevo && (
                              <span style={{ fontSize: "0.75rem", color: "#64748b", background: "var(--bg-color)", padding: "2px 6px", borderRadius: "4px" }}>
                                {cto.numeroNuevo}
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px", fontSize: "0.8rem", color: "#64748b" }}>
                            {/* Dot del estado */}
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor, display: "inline-block" }} />
                            <span>{cto.subStatus?.name || cto.status}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#64748b", background: "var(--bg-color)", padding: "4px 8px", borderRadius: "6px" }}>
                            🕒 {timeString}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })()}

      </div>

      {/* MODAL DE AJUSTES (Visualización de CTOs y Temas) */}
      {showSettingsModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div className="glass-panel" style={{ width: "95%", maxWidth: "450px", padding: "1.5rem", background: "var(--card-bg)", color: "var(--text-color)", borderColor: "var(--border-color)", maxHeight: "85vh", overflowY: "auto", position: "relative" }}>
            
            {/* Botón de cierre en esquina superior derecha */}
            <button 
              type="button"
              onClick={() => setShowSettingsModal(false)} 
              title="Cerrar"
              style={{ 
                position: "absolute", top: "16px", right: "16px", background: "var(--border-color)", 
                border: "none", borderRadius: "50%", width: "32px", height: "32px", display: "flex", 
                alignItems: "center", justifyContent: "center", fontSize: "1.2rem", fontWeight: 700, 
                color: "var(--text-color)", cursor: "pointer", zIndex: 10 
              }}
            >
              ✕
            </button>

            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "1.25rem", color: "var(--text-color)", display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--primary-color)" }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Mi Perfil y Ajustes
            </h2>
            
            {/* Ficha de Información de Usuario */}
            <div style={{ background: "var(--bg-color)", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-color)", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ background: (session?.user as any)?.color || "var(--primary-color)", color: "white", width: "40px", height: "40px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "1.2rem" }}>
                  {(session?.user?.name || session?.user?.email || "T")?.[0]?.toUpperCase()}
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-color)" }}>
                    {session?.user?.name || "Técnico"}
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-color)", opacity: 0.8 }}>
                    {session?.user?.email || ""}
                  </span>
                  <span style={{ fontSize: "0.75rem", background: "var(--border-color)", color: "var(--text-color)", padding: "2px 6px", borderRadius: "4px", alignSelf: "flex-start", marginTop: "4px", fontWeight: 600 }}>
                    {(session?.user as any)?.role || "USER"}
                  </span>
                </div>
              </div>
            </div>

            {/* Selector de Tema */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem", fontWeight: 600, color: "var(--text-color)" }}>
                Tema de Color de la Página:
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px", marginTop: "8px" }}>
                {[
                  { name: "orange", color: "#FF7900", label: "Naranja" },
                  { name: "blue", color: "#2563eb", label: "Azul" },
                  { name: "green", color: "#10b981", label: "Verde" },
                  { name: "purple", color: "#8b5cf6", label: "Morado" },
                  { name: "dark", color: "#f97316", label: "Oscuro", bg: "#0f172a", border: "#475569" },
                  { name: "indigo", color: "#4f46e5", label: "Indigo" },
                  { name: "rose", color: "#e11d48", label: "Rosa" },
                  { name: "teal", color: "#0d9488", label: "Teal" },
                  { name: "amber", color: "#d97706", label: "Ámbar" },
                  { name: "slate", color: "#475569", label: "Pizarra" }
                ].map((t) => {
                  const isSelected = theme === t.name;
                  return (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => handleThemeChange(t.name)}
                      title={t.label}
                      style={{
                        padding: "6px 2px",
                        borderRadius: "8px",
                        border: isSelected ? "2.5px solid var(--primary-color)" : "1.5px solid var(--border-color)",
                        background: "var(--bg-color)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "4px",
                        boxShadow: isSelected ? "0 0 8px rgba(255,121,0,0.3)" : "none",
                        transition: "all 0.15s"
                      }}
                    >
                      <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: t.color, display: "inline-block", border: "1.5px solid rgba(255,255,255,0.4)", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                      <span style={{ fontSize: "0.62rem", fontWeight: isSelected ? 800 : 700, color: "var(--text-color)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%", textAlign: "center" }}>
                        {t.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selector de Forma de Marcador */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem", fontWeight: 600, color: "var(--text-color)" }}>
                Forma del Marcador en Mapa:
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px" }}>
                {[
                  { value: "circle", label: "Círculo" },
                  { value: "triangle", label: "Triángulo" },
                  { value: "square", label: "Cuadrado" },
                  { value: "diamond", label: "Rombo" },
                  { value: "star", label: "Estrella" }
                ].map((shape) => (
                  <button
                    key={shape.value}
                    type="button"
                    onClick={() => handleMarkerShapeChange(shape.value)}
                    style={{
                      padding: "8px 4px",
                      borderRadius: "6px",
                      border: markerShape === shape.value ? "2.5px solid var(--primary-color)" : "1.5px solid var(--border-color)",
                      background: "var(--card-bg)",
                      color: "var(--text-color)",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: "0.7rem",
                      textAlign: "center"
                    }}
                  >
                    {shape.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Slider de Tamaño de Marcador */}
            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-color)" }}>
                  Tamaño de Marcador:
                </label>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--primary-color)" }}>
                  {markerSize}px
                </span>
              </div>
              <input 
                type="range" 
                min="4" 
                max="12" 
                step="1"
                value={markerSize}
                onChange={(e) => handleMarkerSizeChange(parseInt(e.target.value))}
                style={{ width: "100%", height: "6px", background: "var(--border-color)", borderRadius: "4px", outline: "none", accentColor: "var(--primary-color)" }}
              />
            </div>

            {/* Selector de Zoom */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.9rem", fontWeight: 600, color: "var(--text-color)" }}>
                Límite de Zoom para mostrar CTOs:
              </label>
              <select
                className="input-field"
                value={zoomThreshold}
                onChange={(e) => handleZoomThresholdChange(parseInt(e.target.value))}
                style={{ padding: "8px 12px", minHeight: "44px", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)" }}
              >
                <option value="11">Zoom 11: Mostrar todo de lejos (Lento)</option>
                <option value="12">Zoom 12: Mostrar temprano</option>
                <option value="13">Zoom 13: Normal / Recomendado</option>
                <option value="14">Zoom 14: Mostrar tarde</option>
                <option value="15">Zoom 15: Mostrar solo de cerca (Rápido)</option>
              </select>
            </div>

            {/* Toggle de CTOs de Reparos */}
            <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-color)", padding: "12px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: "10px" }}>
                <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-color)" }}>
                  Mostrar CTOs de Reparos
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-color)", opacity: 0.8, marginTop: "2px" }}>
                  Ver CTOs de reparos y averías en el mapa.
                </span>
              </div>
              <input
                type="checkbox"
                checked={showProgramadas}
                onChange={(e) => handleShowProgramadasToggle(e.target.checked)}
                style={{ width: "20px", height: "20px", cursor: "pointer", accentColor: "var(--primary-color)" }}
              />
            </div>

            {/* Patrón para CORRECTO */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem", fontWeight: 600, color: "var(--text-color)" }}>
                Patrón para CORRECTO / REVISADO:
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px" }}>
                {[
                  { value: "diagonal-stripes", label: "Diagonales" },
                  { value: "horizontal-stripes", label: "Horiz." },
                  { value: "vertical-stripes", label: "Vert." },
                  { value: "grid-pattern", label: "Cuadríc." },
                  { value: "dotted-pattern", label: "5 Puntos" }
                ].map((pat) => (
                  <button
                    key={pat.value}
                    type="button"
                    onClick={() => handlePatternCorrectoChange(pat.value)}
                    style={{
                      padding: "6px 2px",
                      borderRadius: "6px",
                      border: patternCorrecto === pat.value ? "2.5px solid var(--primary-color)" : "1.5px solid var(--border-color)",
                      background: "var(--card-bg)",
                      color: "var(--text-color)",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: "0.65rem",
                      textAlign: "center",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center"
                    }}
                  >
                    {renderCorrectoPatternPreview(pat.value, session?.user?.color || "#FF7900")}
                    <span style={{ fontSize: "0.55rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>
                      {pat.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Patrón para FALLO */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem", fontWeight: 600, color: "var(--text-color)" }}>
                Patrón para FALLO:
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px" }}>
                {[
                  { value: "cross-pattern", label: "Cruz/Aspa" },
                  { value: "slash-pattern", label: "Diagonal" },
                  { value: "alert-pattern", label: "Alerta" },
                  { value: "circle-pattern", label: "Círculo" },
                  { value: "minus-pattern", label: "Horiz." }
                ].map((pat) => (
                  <button
                    key={pat.value}
                    type="button"
                    onClick={() => handlePatternFalloChange(pat.value)}
                    style={{
                      padding: "6px 2px",
                      borderRadius: "6px",
                      border: patternFallo === pat.value ? "2.5px solid var(--primary-color)" : "1.5px solid var(--border-color)",
                      background: "var(--card-bg)",
                      color: "var(--text-color)",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: "0.65rem",
                      textAlign: "center",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center"
                    }}
                  >
                    {renderFalloPatternPreview(pat.value, session?.user?.color || "#FF7900")}
                    <span style={{ fontSize: "0.55rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>
                      {pat.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Menú de Instalación de PWA */}
            <div style={{ marginBottom: "1.5rem", padding: "12px", background: "var(--bg-color)", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
              <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-color)", display: "block" }}>
                Aplicación Móvil (PWA)
              </span>
              <p style={{ fontSize: "0.72rem", color: "var(--text-color)", opacity: 0.8, marginTop: "2.5px", marginBottom: "8px" }}>
                Instala Plan Algodón en la pantalla de tu móvil para usarlo como una app nativa.
              </p>
              {isPwaInstallable ? (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="btn btn-primary"
                  style={{ width: "100%", padding: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontWeight: 700 }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                  Instalar App en este móvil
                </button>
              ) : (
                <div style={{ fontSize: "0.72rem", background: "var(--card-bg)", padding: "8px", borderRadius: "6px", border: "1px dashed var(--border-color)", color: "var(--text-color)", opacity: 0.8 }}>
                  💡 Para iOS (iPhone) o si el botón no aparece: Pulsa el botón <strong>Compartir</strong> en Safari y selecciona <strong>"Añadir a pantalla de inicio"</strong>.
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowMyProgramadasModal(true);
                }}
                className="btn"
                style={{ width: "100%", padding: "0.75rem", background: "var(--primary-color)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontWeight: 700 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Ver mis CTOs de Reparos
              </button>

              <button 
                onClick={() => setShowSettingsModal(false)}
                className="btn"
                style={{ width: "100%", background: "var(--border-color)", color: "var(--text-color)" }}
              >
                Guardar y Cerrar
              </button>
            </div>

            <div style={{ 
              textAlign: "center", 
              fontSize: "0.75rem", 
              fontWeight: 700, 
              color: "var(--text-color)", 
              opacity: 0.6, 
              marginTop: "16px",
              borderTop: "1px solid var(--border-color)",
              paddingTop: "8px"
            }}>
              Plan Algodón - Versión 2.8.0
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ESTADÍSTICAS */}
      {showStatsModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div className="glass-panel" style={{ width: "95%", maxWidth: "550px", padding: "2rem", background: "var(--card-bg)", color: "var(--text-color)", borderColor: "var(--border-color)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text-color)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--primary-color)" }}>
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                Estadísticas de Auditoría
              </h2>
              <button 
                onClick={() => setShowStatsModal(false)}
                style={{ background: "none", border: "none", fontSize: "1.5rem", color: "#94a3b8", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {statsLoading ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-color)", opacity: 0.8 }}>Calculando estadísticas...</div>
            ) : (
              <div>
                {/* 1. Vista de Administrador: Resumen de técnicos */}
                {isAdmin && statsData.totalByTech && statsData.totalByTech.length > 0 && (
                  <div style={{ marginBottom: "1.5rem", padding: "1rem", background: "var(--bg-color)", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-color)", opacity: 0.8, marginBottom: "0.75rem", textTransform: "uppercase" }}>Total por Técnico (Últimos 15 días)</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {statsData.totalByTech.map((tech, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
                            <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: tech.color }} />
                            {tech.name}
                          </span>
                          <strong style={{ background: "var(--border-color)", padding: "2px 8px", borderRadius: "12px" }}>{tech.total} CTOs</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Historial de Auditoría Diario */}
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-color)", opacity: 0.8, marginBottom: "0.75rem", textTransform: "uppercase" }}>
                  {isAdmin ? "Historial Diario del Equipo" : "Mis CTOs Auditadas por Día"}
                </h3>

                {statsData.stats.length === 0 ? (
                  <p style={{ color: "var(--text-color)", opacity: 0.7, fontStyle: "italic", textAlign: "center", padding: "2rem" }}>No se registran auditorías en los últimos 15 días.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {statsData.stats.map((day, idx) => (
                      <div key={idx} style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "12px", background: "var(--bg-color)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "0.95rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px", marginBottom: "6px" }}>
                          <span style={{ color: "var(--text-color)", display: "flex", alignItems: "center", gap: "4px" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--primary-color)" }}>
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            {day.date}
                          </span>
                          <span style={{ color: "var(--primary-color)" }}>{day.total} CTOs</span>
                        </div>

                        {/* Breakdown por técnico si es admin */}
                        {isAdmin ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingLeft: "12px" }}>
                            {Object.values(day.technicians).map((tech: any, i) => (
                              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--text-color)", opacity: 0.8 }}>
                                <span>{tech.name}</span>
                                <strong>{tech.count} auditadas</strong>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: "0.85rem", color: "var(--text-color)", opacity: 0.7, margin: 0, paddingLeft: "12px" }}>
                            Has auditado {day.total} CTOs en esta fecha.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button 
              onClick={() => setShowStatsModal(false)}
              className="btn"
              style={{ width: "100%", background: "var(--border-color)", color: "var(--text-color)", marginTop: "1.5rem" }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE MIS PROGRAMADAS */}
      {showMyProgramadasModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
          zIndex: 2000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem"
        }}>
          <div className="glass-panel" style={{
            width: "95%",
            maxWidth: "450px",
            padding: "1.5rem",
            background: "var(--card-bg)",
            color: "var(--text-color)",
            borderColor: "var(--border-color)",
            maxHeight: "85vh",
            overflowY: "auto",
            position: "relative",
            borderRadius: "16px"
          }}>
            <button 
              type="button"
              onClick={() => setShowMyProgramadasModal(false)} 
              title="Cerrar"
              style={{ 
                position: "absolute", top: "16px", right: "16px", background: "var(--border-color)", 
                border: "none", borderRadius: "50%", width: "32px", height: "32px", display: "flex", 
                alignItems: "center", justifyContent: "center", fontSize: "1.2rem", fontWeight: 700, 
                color: "var(--text-color)", cursor: "pointer", zIndex: 10 
              }}
            >
              ✕
            </button>

            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "1.25rem", color: "var(--text-color)", display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Mis CTOs de Reparos
            </h2>

            {/* Listado */}
            {(() => {
              const currentUserId = (session?.user as any)?.id;
              const myProgramadas = ctos.filter(c => c.assignedToId === currentUserId && c.category === "PROGRAMADA");

              if (myProgramadas.length === 0) {
                return (
                  <p style={{ color: "var(--text-color)", opacity: 0.7, fontStyle: "italic", textAlign: "center", padding: "2rem" }}>
                    No tienes ninguna CTO de reparo asignada.
                  </p>
                );
              }

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "50vh", overflowY: "auto", paddingRight: "4px" }}>
                  {myProgramadas.map((c) => (
                    <div 
                      key={c.id} 
                      onClick={() => {
                        setShowMyProgramadasModal(false);
                        setSelectedCto(c);
                      }}
                      style={{ 
                        border: "1px solid var(--border-color)", 
                        borderRadius: "10px", 
                        padding: "12px", 
                        background: "var(--bg-color)",
                        cursor: "pointer",
                      }}
                      className="hover-card"
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <span style={{ fontWeight: 700, color: "var(--text-color)", fontSize: "0.95rem" }}>
                          CTO {c.num}
                        </span>
                        <span style={{ 
                          fontSize: "0.75rem", 
                          background: c.status === "PENDIENTE" ? "#fef3c7" : c.status === "CORRECTO" ? "#dcfce7" : "#fee2e2", 
                          color: c.status === "PENDIENTE" ? "#d97706" : c.status === "CORRECTO" ? "#166534" : "#991b1b",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: 700
                        }}>
                          {c.status}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", fontSize: "0.8rem", color: "var(--text-color)", opacity: 0.8 }}>
                        {c.zona && <span>Zona: <strong>{c.zona}</strong></span>}
                        {c.cluster && <span>Cluster: <strong>{c.cluster}</strong></span>}
                      </div>
                      {c.subStatus && (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.subStatus.color || "#808080" }} />
                          <span style={{ fontSize: "0.78rem", color: "var(--text-color)", opacity: 0.9 }}>
                            {c.subStatus.name}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            <button 
              onClick={() => setShowMyProgramadasModal(false)}
              className="btn btn-primary"
              style={{ width: "100%", marginTop: "1.5rem" }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE IMPACTO Y ESTADÍSTICAS DEL TÉCNICO (CLICK EN PLAN ALGODÓN) */}
      {showImpactModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          zIndex: 3000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem"
        }}>
          <div className="glass-panel" style={{
            width: "95%",
            maxWidth: "380px",
            background: "var(--card-bg)",
            border: "1px solid var(--border-color)",
            borderRadius: "16px",
            padding: "24px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            color: "var(--text-color)"
          }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1rem", color: "var(--text-color)", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "var(--primary-color)" }}>●</span> Estadísticas del Proyecto
            </h2>

            {/* Progreso General */}
            {(() => {
              const total = ctos.length;
              const audited = ctos.filter(c => c.status === "CORRECTO" || c.status === "FALLO").length;
              const progress = total > 0 ? Math.round((audited / total) * 100) : 0;
              
              const currentUserId = (session?.user as any)?.id;
              const userAudited = ctos.filter(c => (c.status === "CORRECTO" || c.status === "FALLO") && c.auditedById === currentUserId).length;
              const userShareOfAudited = audited > 0 ? Math.round((userAudited / audited) * 100) : 0;
              const userShareOfTotal = total > 0 ? Math.round((userAudited / total) * 100) : 0;

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  
                  {/* Stats Cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div style={{ background: "var(--bg-color)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                      <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Total CTOs</span>
                      <p style={{ fontSize: "1.4rem", fontWeight: 700, margin: "4px 0 0 0" }}>{total}</p>
                    </div>
                    <div style={{ background: "var(--bg-color)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                      <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Auditadas</span>
                      <p style={{ fontSize: "1.4rem", fontWeight: 700, margin: "4px 0 0 0", color: "#10b981" }}>{audited}</p>
                    </div>
                  </div>

                  {/* Barra de Progreso General */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                      <span>Progreso de Auditoría</span>
                      <span style={{ color: "var(--primary-color)" }}>{progress}%</span>
                    </div>
                    <div style={{ width: "100%", height: "12px", background: "var(--border-color)", borderRadius: "6px", overflow: "hidden", position: "relative" }}>
                      <div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg, var(--primary-color), #f97316)", borderRadius: "6px", transition: "width 0.5s ease" }} />
                    </div>
                  </div>

                  {/* Impacto Personal */}
                  <div style={{ borderTop: "1px dashed var(--border-color)", paddingTop: "12px" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-color)", display: "block", marginBottom: "8px" }}>
                      Tu Impacto como Técnico:
                    </span>
                    <p style={{ fontSize: "0.8rem", margin: "4px 0", color: "var(--text-color)", opacity: 0.9 }}>
                      • Has auditado <strong>{userAudited}</strong> CTOs.
                    </p>
                    <p style={{ fontSize: "0.8rem", margin: "4px 0", color: "var(--text-color)", opacity: 0.9 }}>
                      • Representas el <strong>{userShareOfAudited}%</strong> del total auditado.
                    </p>
                    <p style={{ fontSize: "0.8rem", margin: "4px 0", color: "var(--text-color)", opacity: 0.9 }}>
                      • Has cubierto el <strong>{userShareOfTotal}%</strong> de todo el proyecto.
                    </p>
                  </div>

                  {/* Mini-barra de impacto apilada */}
                  {audited > 0 && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>
                        <span>Tu contribución (de las auditadas)</span>
                        <span>{userShareOfAudited}%</span>
                      </div>
                      <div style={{ width: "100%", height: "8px", background: "var(--border-color)", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ width: `${userShareOfAudited}%`, height: "100%", background: "#10b981", borderRadius: "4px" }} />
                      </div>
                    </div>
                  )}

                </div>
              );
            })()}

            <button 
              onClick={() => setShowImpactModal(false)}
              className="btn btn-primary"
              style={{ width: "100%", marginTop: "1.5rem", fontWeight: 700 }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
      
      {/* Modal Buzón de Notificaciones y CTOs a Reparar */}
      {showRepairInboxModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: "12px", backdropFilter: "blur(4px)" }}>
          <div style={{
            background: "var(--card-bg, #0f172a)",
            border: "1.5px solid #8b5cf6",
            borderRadius: "16px",
            width: "95%",
            maxWidth: "600px",
            maxHeight: "85vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            overflow: "hidden"
          }}>
            {/* Cabecera del Buzón */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(139, 92, 246, 0.15)", color: "#8b5cf6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>
                  📬
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--text-color)" }}>
                    Buzón de Reparaciones e Incidencias
                  </h3>
                  <span style={{ fontSize: "0.75rem", opacity: 0.75 }}>
                    {repairCtos.length === 1 ? "1 caja asignada para reparar" : `${repairCtos.length} cajas asignadas para reparar`}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setShowRepairInboxModal(false)}
                style={{ background: "none", border: "none", fontSize: "1.2rem", color: "#94a3b8", cursor: "pointer", padding: "4px" }}
              >
                ✕
              </button>
            </div>

            {/* Buscador interno si hay más de 3 cajas */}
            {repairCtos.length > 3 && (
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-color)", background: "var(--card-bg)" }}>
                <input
                  type="text"
                  placeholder="Buscar en el buzón por número, cluster o zona..."
                  value={repairInboxSearch}
                  onChange={(e) => setRepairInboxSearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-color)",
                    color: "var(--text-color)",
                    fontSize: "0.82rem"
                  }}
                />
              </div>
            )}

            {/* Lista de CTOs a reparar */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {repairCtos.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>🎉</div>
                  <h4 style={{ fontSize: "1rem", fontWeight: 800, margin: "0 0 4px 0", color: "var(--text-color)" }}>¡Buzón Limpio!</h4>
                  <p style={{ fontSize: "0.82rem", opacity: 0.7, margin: 0 }}>
                    No tienes ninguna caja pendiente de reparación en este momento.
                  </p>
                </div>
              ) : (
                (() => {
                  const filteredList = repairInboxSearch.trim()
                    ? repairCtos.filter((c: any) =>
                        c.num.toLowerCase().includes(repairInboxSearch.toLowerCase()) ||
                        (c.cluster && c.cluster.toLowerCase().includes(repairInboxSearch.toLowerCase())) ||
                        (c.zona && c.zona.toLowerCase().includes(repairInboxSearch.toLowerCase())) ||
                        (c.municipio && c.municipio.toLowerCase().includes(repairInboxSearch.toLowerCase()))
                      )
                    : repairCtos;

                  if (filteredList.length === 0) {
                    return (
                      <p style={{ textAlign: "center", fontSize: "0.85rem", opacity: 0.7, padding: "20px" }}>
                        No hay resultados para &quot;{repairInboxSearch}&quot;
                      </p>
                    );
                  }

                  return filteredList.map((c: any) => {
                    // Obtener la última nota o comentario de incidencia
                    const lastComment = c.comments && c.comments.length > 0
                      ? c.comments[c.comments.length - 1].text
                      : c.notas || "Se requiere revisión de evidencias fotográficas o instalación.";

                    return (
                      <div 
                        key={c.id}
                        style={{
                          background: "var(--bg-color)",
                          border: "1.5px solid rgba(139, 92, 246, 0.4)",
                          borderRadius: "12px",
                          padding: "12px",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px"
                        }}
                      >
                        {/* Cabecera de la tarjeta */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "0.95rem", fontWeight: 900, color: "#8b5cf6" }}>
                              CTO {c.num}
                            </span>
                            {c.numeroNuevo && (
                              <span style={{ fontSize: "0.72rem", background: "var(--card-bg)", color: "var(--text-color)", opacity: 0.8, padding: "1px 6px", borderRadius: "4px" }}>
                                {c.numeroNuevo}
                              </span>
                            )}
                            <span style={{ fontSize: "0.68rem", fontWeight: 800, padding: "2px 6px", borderRadius: "8px", background: "rgba(139, 92, 246, 0.2)", color: "#8b5cf6" }}>
                              REPARAR
                            </span>
                          </div>

                          {c.assignedTo && (
                            <span style={{ fontSize: "0.74rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.assignedTo.color || "#FF7900" }} />
                              {c.assignedTo.name}
                            </span>
                          )}
                        </div>

                        {/* Localización y datos */}
                        <div style={{ fontSize: "0.78rem", opacity: 0.75, display: "flex", gap: "10px", flexWrap: "wrap" }}>
                          {c.municipio && <span>📍 {c.municipio}</span>}
                          {c.cluster && <span>📁 {c.cluster}</span>}
                          {c.zona && <span>🏷️ Zona: {c.zona}</span>}
                        </div>

                        {/* Motivo de la Incidencia / Mensaje */}
                        <div style={{
                          background: "rgba(139, 92, 246, 0.08)",
                          borderLeft: "3px solid #8b5cf6",
                          padding: "6px 10px",
                          borderRadius: "4px",
                          fontSize: "0.78rem",
                          color: "var(--text-color)"
                        }}>
                          <strong style={{ color: "#8b5cf6", display: "block", marginBottom: "2px" }}>
                            💬 Motivo de Reparación:
                          </strong>
                          <span>{lastComment}</span>
                        </div>

                        {/* Botones de acción directa */}
                        <div style={{ display: "flex", gap: "8px", marginTop: "2px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setShowRepairInboxModal(false);
                              setSelectedCto(c);
                              setCenterCoords([c.lat, c.lng]);
                            }}
                            style={{
                              flex: 1,
                              minHeight: "34px",
                              background: "var(--primary-color, #FF7900)",
                              color: "white",
                              border: "none",
                              borderRadius: "8px",
                              padding: "6px 12px",
                              fontSize: "0.78rem",
                              fontWeight: 800,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px"
                            }}
                          >
                            <span>🗺️ Ver en Mapa</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setShowRepairInboxModal(false);
                              try {
                                localStorage.setItem(`cto_cache_${c.id}`, JSON.stringify(c));
                              } catch (e) {}
                              router.push(`/photo-guide?ctoId=${c.id}&num=${encodeURIComponent(c.num || "")}`);
                            }}
                            style={{
                              flex: 1,
                              minHeight: "34px",
                              background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                              color: "white",
                              border: "none",
                              borderRadius: "8px",
                              padding: "6px 12px",
                              fontSize: "0.78rem",
                              fontWeight: 800,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px"
                            }}
                          >
                            <span>📸 Guía Fotográfica</span>
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>

            {/* Pie del modal */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-color)", background: "var(--bg-color)", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowRepairInboxModal(false)}
                style={{
                  padding: "8px 18px",
                  borderRadius: "8px",
                  background: "var(--card-bg)",
                  color: "var(--text-color)",
                  border: "1px solid var(--border-color)",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer"
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer inferior para detalles de CTO */}
      <CtoDrawer 
        cto={selectedCto} 
        onClose={() => setSelectedCto(null)} 
        onUpdate={(updatedCto: any) => {
          setCtos(prev => prev.map(c => c.id === updatedCto.id ? { ...c, ...updatedCto } : c));
          setSelectedCto(updatedCto);
        }}
      />

    </div>
  );
}

function renderCorrectoPatternPreview(pattern: string, color: string) {
  const size = 10;
  const center = 14;
  const radius = 10;
  const borderCol = "#10b981";
  const fillCol = color;

  let svgContent = `<circle cx="${center}" cy="${center}" r="${radius}" fill="${fillCol}" stroke="${borderCol}" stroke-width="1.5" />`;

  if (pattern === "diagonal-stripes") {
    svgContent += `<circle cx="${center}" cy="${center}" r="${radius}" fill="url(#preview-diag)" stroke="none" />`;
  } else if (pattern === "horizontal-stripes") {
    svgContent += `<circle cx="${center}" cy="${center}" r="${radius}" fill="url(#preview-horiz)" stroke="none" />`;
  } else if (pattern === "vertical-stripes") {
    svgContent += `<circle cx="${center}" cy="${center}" r="${radius}" fill="url(#preview-vert)" stroke="none" />`;
  } else if (pattern === "grid-pattern") {
    svgContent += `<circle cx="${center}" cy="${center}" r="${radius}" fill="url(#preview-grid)" stroke="none" />`;
  } else if (pattern === "dotted-pattern") {
    const dotRadius = 1.5;
    const offset = 4.5;
    svgContent += `
      <circle cx="${center}" cy="${center}" r="${dotRadius}" fill="${borderCol}" stroke="#ffffff" stroke-width="0.3" />
      <circle cx="${center - offset}" cy="${center - offset}" r="${dotRadius}" fill="${borderCol}" stroke="#ffffff" stroke-width="0.3" />
      <circle cx="${center + offset}" cy="${center - offset}" r="${dotRadius}" fill="${borderCol}" stroke="#ffffff" stroke-width="0.3" />
      <circle cx="${center - offset}" cy="${center + offset}" r="${dotRadius}" fill="${borderCol}" stroke="#ffffff" stroke-width="0.3" />
      <circle cx="${center + offset}" cy="${center + offset}" r="${dotRadius}" fill="${borderCol}" stroke="#ffffff" stroke-width="0.3" />
    `;
  }

  return (
    <svg width="28" height="28" viewBox="0 0 28 28" style={{ display: "block", margin: "0 auto 4px auto" }}>
      <defs>
        <pattern id="preview-diag" width="4" height="4" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="4" stroke="#ffffff" strokeWidth="1.5" />
          <line x1="0" y1="0" x2="0" y2="4" stroke="#10b981" strokeWidth="0.8" />
        </pattern>
        <pattern id="preview-horiz" width="4" height="4" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="4" y2="0" stroke="#ffffff" strokeWidth="1.5" />
          <line x1="0" y1="0" x2="4" y2="0" stroke="#10b981" strokeWidth="0.8" />
        </pattern>
        <pattern id="preview-vert" width="4" height="4" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="4" stroke="#ffffff" strokeWidth="1.5" />
          <line x1="0" y1="0" x2="0" y2="4" stroke="#10b981" strokeWidth="0.8" />
        </pattern>
        <pattern id="preview-grid" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill="none" stroke="#ffffff" strokeWidth="1.5" />
          <rect width="4" height="4" fill="none" stroke="#10b981" strokeWidth="0.8" />
        </pattern>
      </defs>
      <g dangerouslySetInnerHTML={{ __html: svgContent }} />
    </svg>
  );
}

function renderFalloPatternPreview(pattern: string, color: string) {
  const size = 10;
  const center = 14;
  const radius = 10;
  const borderCol = "#ef4444";
  const fillCol = color;

  let svgContent = `<circle cx="${center}" cy="${center}" r="${radius}" fill="${fillCol}" stroke="${borderCol}" stroke-width="1.5" />`;
  svgContent += `<circle cx="${center}" cy="${center}" r="${radius - 1.5}" fill="none" stroke="#ffffff" stroke-width="1.2" />`;

  if (pattern === "cross-pattern") {
    svgContent += `
      <line x1="${center - 4}" y1="${center - 4}" x2="${center + 4}" y2="${center + 4}" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
      <line x1="${center + 4}" y1="${center - 4}" x2="${center - 4}" y2="${center + 4}" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
      <line x1="${center - 4}" y1="${center - 4}" x2="${center + 4}" y2="${center + 4}" stroke="#ef4444" stroke-width="1" stroke-linecap="round" />
      <line x1="${center + 4}" y1="${center - 4}" x2="${center - 4}" y2="${center + 4}" stroke="#ef4444" stroke-width="1" stroke-linecap="round" />
    `;
  } else if (pattern === "slash-pattern") {
    svgContent += `
      <line x1="${center - 4}" y1="${center + 4}" x2="${center + 4}" y2="${center - 4}" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" />
      <line x1="${center - 4}" y1="${center + 4}" x2="${center + 4}" y2="${center - 4}" stroke="#ef4444" stroke-width="1.2" stroke-linecap="round" />
    `;
  } else if (pattern === "alert-pattern") {
    svgContent += `
      <line x1="${center}" y1="${center - 5}" x2="${center}" y2="${center + 1}" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
      <line x1="${center}" y1="${center - 5}" x2="${center}" y2="${center + 1}" stroke="#ef4444" stroke-width="1" stroke-linecap="round" />
      <circle cx="${center}" cy="${center + 4}" r="1.2" fill="#ffffff" />
      <circle cx="${center}" cy="${center + 4}" r="0.6" fill="#ef4444" />
    `;
  } else if (pattern === "circle-pattern") {
    svgContent += `
      <circle cx="${center}" cy="${center}" r="4" fill="#ffffff" />
      <circle cx="${center}" cy="${center}" r="2.5" fill="#ef4444" />
    `;
  } else if (pattern === "minus-pattern") {
    svgContent += `
      <line x1="${center - 4}" y1="${center}" x2="${center + 4}" y2="${center}" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" />
      <line x1="${center - 4}" y1="${center}" x2="${center + 4}" y2="${center}" stroke="#ef4444" stroke-width="1.2" stroke-linecap="round" />
    `;
  }

  return (
    <svg width="28" height="28" viewBox="0 0 28 28" style={{ display: "block", margin: "0 auto 4px auto" }}>
      <g dangerouslySetInnerHTML={{ __html: svgContent }} />
    </svg>
  );
}
