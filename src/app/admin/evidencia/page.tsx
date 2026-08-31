"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type ImageRecord = { id: string; url: string };
type CtoWithImages = {
  id: string;
  num: string;
  zona: string | null;
  cluster: string | null;
  municipio: string | null;
  colocacion: string | null;
  images: ImageRecord[];
  assignedTo?: { name: string; color: string } | null;
  auditedBy?: { name: string; color: string } | null;
};
type DateGroup = {
  date: string;
  ctoCount: number;
  photoCount: number;
};
type ClusterGroup = {
  name: string;
  zona: string;
  ctoCount: number;
  photoCount: number;
  ctos: { id: string; num: string; photoCount: number }[];
};

export default function AdminEvidenciaPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  
  const [ctos, setCtos] = useState<CtoWithImages[]>([]);
  const [dates, setDates] = useState<DateGroup[]>([]);
  const [clusters, setClusters] = useState<ClusterGroup[]>([]);
  const [activeTab, setActiveTab] = useState<"clusters" | "dias" | "ctos">("clusters");
  const [selectedZona, setSelectedZona] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [selectedCtoId, setSelectedCtoId] = useState<string | null>(null);
  const [searchCto, setSearchCto] = useState("");
  
  // Lightbox
  const [activeImgIndex, setActiveImgIndex] = useState<number | null>(null);
  const [cacheKey, setCacheKey] = useState(Date.now());
  const [zoomScale, setZoomScale] = useState(1);

  const fetchEvidencias = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/evidencia");
      if (res.ok) {
        const data = await res.json();
        setCtos(data.ctos || []);
        setDates(data.dates || []);
        setClusters(data.clusters || []);
      } else {
        alert("Error al cargar las evidencias fotográficas");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === "authenticated") {
      const role = (session?.user as any)?.role;
      if (role !== "ADMIN" && role !== "GESTOR") {
        router.push("/");
      } else {
        fetchEvidencias();
      }
    } else if (authStatus === "unauthenticated") {
      router.push("/login");
    }
  }, [authStatus, session, router]);

  if (loading || authStatus === "loading") {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg-color)", color: "var(--text-color)" }}>
        <p style={{ fontWeight: 700 }}>Cargando explorador de evidencias...</p>
      </div>
    );
  }

  const filteredCtos = ctos.filter(c => {
    const matchesSearch = c.num.toLowerCase().includes(searchCto.toLowerCase()) || 
                          (c.municipio && c.municipio.toLowerCase().includes(searchCto.toLowerCase()));
    return matchesSearch;
  });

  const selectedCto = ctos.find(c => c.id === selectedCtoId);

  const handleRotate = async (imageId: string, direction: "left" | "right") => {
    try {
      const res = await fetch("/api/uploads/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId, direction })
      });
      if (res.ok) {
        setCacheKey(Date.now());
        fetchEvidencias();
      } else {
        alert("Error al rotar la imagen");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (imageId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta imagen permanentemente?")) return;
    try {
      const res = await fetch("/api/uploads/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId })
      });
      if (res.ok) {
        alert("Imagen eliminada");
        // Cerrar lightbox si está activo
        if (activeImgIndex !== null) {
          const ctoImages = selectedCto?.images || [];
          const remaining = ctoImages.filter(i => i.id !== imageId);
          if (remaining.length === 0) {
            setActiveImgIndex(null);
          } else {
            setActiveImgIndex(Math.max(0, activeImgIndex - 1));
          }
        }
        fetchEvidencias();
      } else {
        alert("Error al eliminar la imagen");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRename = async (imageId: string, currentUrl: string) => {
    const currentName = currentUrl.split("-").pop()?.split(".")[0] || "imagen";
    const newName = prompt("Introduce el nuevo nombre para la imagen (sin espacios ni caracteres especiales):", currentName);
    if (!newName || newName.trim() === "" || newName === currentName) return;

    try {
      const res = await fetch("/api/uploads/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId, newName: newName.trim() })
      });
      if (res.ok) {
        alert("Imagen renombrada");
        fetchEvidencias();
      } else {
        const errData = await res.json();
        alert(`Error al renombrar: ${errData.error || "Servidor falló"}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-color)", color: "var(--text-color)", display: "flex", flexDirection: "column" }}>
      
      {/* Header Fijo */}
      <header style={{ 
        position: "sticky", top: 0, zIndex: 10, background: "var(--card-bg)", 
        borderBottom: "1px solid var(--border-color)", padding: "12px 24px", 
        display: "flex", justifyContent: "space-between", alignItems: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button 
            onClick={() => router.push("/admin")} 
            className="btn" 
            style={{ 
              background: "var(--bg-color)", border: "1px solid var(--border-color)", 
              color: "var(--text-color)", borderRadius: "8px", padding: "6px 12px", 
              fontWeight: 700, cursor: "pointer" 
            }}
          >
            ← Volver al Panel
          </button>
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0, color: "var(--text-color)" }}>
              📸 Gestor de Evidencias V2 (Por Días y CTOs)
            </h1>
            <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.7 }}>
              Descarga organizada de fotos diarias en ZIP y visor interactivo de evidencias
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={fetchEvidencias}
            className="btn"
            style={{ padding: "8px 14px", background: "var(--bg-color)", color: "var(--text-color)", border: "1px solid var(--border-color)", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}
          >
            🔄 Actualizar
          </button>
        </div>
      </header>

      {/* Contenido Principal */}
      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px", maxWidth: "1400px", margin: "0 auto", width: "100%" }}>
        
        {/* Selector de Navegación: Por Clusters vs Por Días vs Todas las CTOs */}
        <div style={{ display: "flex", gap: "8px", background: "var(--card-bg)", padding: "6px", borderRadius: "12px", border: "1px solid var(--border-color)", flexWrap: "wrap" }}>
          <button
            onClick={() => { setActiveTab("clusters"); setSelectedCtoId(null); }}
            style={{
              flex: 1, minWidth: "160px", padding: "10px 16px", borderRadius: "8px", border: "none",
              fontWeight: 800, fontSize: "0.9rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              background: activeTab === "clusters" ? "var(--primary-color)" : "transparent",
              color: activeTab === "clusters" ? "white" : "var(--text-color)",
              transition: "all 0.2s"
            }}
          >
            <span>📁</span> Por Clusters ({clusters.length})
          </button>

          <button
            onClick={() => { setActiveTab("dias"); setSelectedCtoId(null); }}
            style={{
              flex: 1, minWidth: "160px", padding: "10px 16px", borderRadius: "8px", border: "none",
              fontWeight: 800, fontSize: "0.9rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              background: activeTab === "dias" ? "var(--primary-color)" : "transparent",
              color: activeTab === "dias" ? "white" : "var(--text-color)",
              transition: "all 0.2s"
            }}
          >
            <span>📅</span> Por Días ({dates.length})
          </button>

          <button
            onClick={() => { setActiveTab("ctos"); setSelectedCtoId(null); }}
            style={{
              flex: 1, minWidth: "160px", padding: "10px 16px", borderRadius: "8px", border: "none",
              fontWeight: 800, fontSize: "0.9rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              background: activeTab === "ctos" ? "var(--primary-color)" : "transparent",
              color: activeTab === "ctos" ? "white" : "var(--text-color)",
              transition: "all 0.2s"
            }}
          >
            <span>🔍</span> Explorador de CTOs ({filteredCtos.length})
          </button>
        </div>

        {/* VISTA 1: ORGANIZACIÓN POR CLUSTERS (CLUSTER A, B, D... / CTOs / NOMBRE_CTO) */}
        {activeTab === "clusters" && !selectedCtoId && (
          <div className="glass-panel" style={{ padding: "20px", background: "var(--card-bg)", border: "1.5px solid var(--border-color)", borderRadius: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: "8px", color: "var(--text-color)" }}>
                  <span>📂</span> Evidencias por Clusters (Estructura: Cluster → CTOs → Fotos)
                </h2>
                <span style={{ fontSize: "0.8rem", opacity: 0.75 }}>
                  Descarga carpetas de clúster completas organizadas internamente con la subcarpeta <strong>CTOs/[nombre_de_cto]</strong>
                </span>
              </div>

              {/* Botón Descargar Todo */}
              <button
                onClick={() => {
                  window.location.href = `/api/admin/evidencia/download-cluster?cluster=all`;
                }}
                className="btn"
                style={{
                  background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontWeight: 800,
                  fontSize: "0.84rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)"
                }}
                title="Descarga todas las evidencias del proyecto organizadas por Clusters y CTOs"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Descargar Todos los Clusters (ZIP)
              </button>
            </div>

            {clusters.length === 0 ? (
              <div style={{ padding: "2rem", background: "var(--bg-color)", borderRadius: "10px", textAlign: "center", opacity: 0.8 }}>
                ℹ️ No hay clústers con evidencias fotográficas registradas actualmente.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "14px" }}>
                {clusters.map((cl) => (
                  <div
                    key={cl.name}
                    style={{
                      background: "var(--bg-color)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "12px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "12px",
                      transition: "transform 0.15s ease",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                        <strong style={{ fontSize: "1.05rem", color: "var(--text-color)", display: "flex", alignItems: "center", gap: "6px" }}>
                          📁 {cl.name}
                        </strong>
                        {cl.zona && (
                          <span style={{ fontSize: "0.72rem", background: "rgba(255, 121, 0, 0.15)", color: "var(--primary-color)", padding: "2px 8px", borderRadius: "6px", fontWeight: 800 }}>
                            Zona {cl.zona}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: "0.82rem", opacity: 0.8 }}>
                        {cl.ctoCount} CTOs · {cl.photoCount} fotografías
                      </p>
                      <span style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: "4px", display: "block" }}>
                        Ruta: <code>{cl.name}/CTOs/[nombre_cto]/</code>
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => {
                          window.location.href = `/api/admin/evidencia/download-cluster?cluster=${encodeURIComponent(cl.name)}`;
                        }}
                        className="btn"
                        style={{
                          flex: 1,
                          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          padding: "8px 12px",
                          fontWeight: 800,
                          fontSize: "0.82rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          boxShadow: "0 2px 6px rgba(16, 185, 129, 0.25)"
                        }}
                        title={`Descargar archivo ZIP del clúster ${cl.name}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Descargar ZIP
                      </button>

                      <button
                        onClick={() => {
                          setSearchCto(cl.name);
                          setActiveTab("ctos");
                        }}
                        className="btn"
                        style={{
                          background: "var(--card-bg)",
                          color: "var(--text-color)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "8px",
                          padding: "8px 10px",
                          fontWeight: 700,
                          fontSize: "0.8rem",
                          cursor: "pointer"
                        }}
                        title="Ver CTOs de este clúster"
                      >
                        Ver CTOs
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VISTA 2: DESCARGA DIRECTA POR DÍAS (ZIPS COMPLETOS) */}
        {activeTab === "dias" && !selectedCtoId && (
          <div className="glass-panel" style={{ padding: "18px 22px", background: "var(--card-bg)", border: "1.5px solid var(--border-color)", borderRadius: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: "8px", color: "var(--text-color)" }}>
                  <span>📦</span> Descarga de Evidencias por Días (ZIP Completo)
                </h2>
                <span style={{ fontSize: "0.8rem", opacity: 0.75 }}>
                  Descarga en un solo archivo comprimido todas las fotos tomadas en un día específico organizadas por carpetas de CTOs
                </span>
              </div>
            </div>

            {dates.length === 0 ? (
              <div style={{ padding: "16px", background: "var(--bg-color)", borderRadius: "10px", textAlign: "center", fontSize: "0.88rem", opacity: 0.8 }}>
                ℹ️ Aún no hay carpetas de fechas registradas con el formato diario estándar.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px" }}>
                {dates.map((d) => (
                  <div 
                    key={d.date}
                    style={{
                      background: "var(--bg-color)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "10px",
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "10px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <strong style={{ fontSize: "1rem", color: "var(--text-color)", display: "block" }}>
                          📅 {d.date}
                        </strong>
                        <span style={{ fontSize: "0.78rem", opacity: 0.75 }}>
                          {d.ctoCount} CTOs · {d.photoCount} fotos
                        </span>
                      </div>
                      <span style={{ fontSize: "0.7rem", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "2px 8px", borderRadius: "8px", fontWeight: 800 }}>
                        Listo
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        window.location.href = `/api/admin/evidencia/download-day?date=${d.date}`;
                      }}
                      className="btn"
                      style={{
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        fontWeight: 800,
                        fontSize: "0.82rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        boxShadow: "0 2px 6px rgba(16, 185, 129, 0.3)"
                      }}
                      title={`Descargar todas las fotos del día ${d.date} en un único archivo ZIP`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Descargar Día en ZIP
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SECCIÓN 2: EXPLORADOR POR CTOs INDIVIDUALES */}
        {!selectedCtoId ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, textTransform: "uppercase", color: "var(--text-color)" }}>
                📁 Carpetas por CTO ({filteredCtos.length})
              </h2>

              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar CTO o Municipio..."
                  value={searchCto}
                  onChange={(e) => setSearchCto(e.target.value)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--card-bg)",
                    color: "var(--text-color)",
                    fontSize: "0.88rem",
                    minWidth: "240px"
                  }}
                />
              </div>
            </div>

            {filteredCtos.length === 0 ? (
              <div className="glass-panel" style={{ padding: "3rem", textAlign: "center", background: "var(--card-bg)", borderColor: "var(--border-color)", borderRadius: "12px" }}>
                <p style={{ fontStyle: "italic", margin: 0 }}>No hay evidencias fotográficas que coincidan con la búsqueda.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
                {filteredCtos.map((ctoItem) => (
                  <div
                    key={ctoItem.id}
                    onClick={() => setSelectedCtoId(ctoItem.id)}
                    className="glass-panel"
                    style={{ 
                      padding: "16px", cursor: "pointer", background: "var(--card-bg)", 
                      borderColor: "var(--border-color)", display: "flex", flexDirection: "column", 
                      alignItems: "center", justifyContent: "center", gap: "8px", textAlign: "center",
                      borderRadius: "12px",
                      transition: "transform 0.15s, box-shadow 0.15s"
                    }}
                  >
                    {/* Icono de Carpeta */}
                    <div style={{ color: "var(--primary-color)" }}>
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div>
                      <strong style={{ display: "block", fontSize: "0.95rem" }}>CTO {ctoItem.num}</strong>
                      <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                        {ctoItem.municipio || "Sin municipio"}
                      </span>
                    </div>
                    <span style={{ fontSize: "0.75rem", background: "var(--bg-color)", padding: "2px 8px", borderRadius: "10px", fontWeight: 700 }}>
                      {ctoItem.images.length} {ctoItem.images.length === 1 ? "foto" : "fotos"}
                    </span>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/api/admin/evidencia/download-cto?ctoId=${ctoItem.id}`;
                      }}
                      className="btn"
                      style={{
                        marginTop: "4px",
                        minHeight: "30px",
                        fontSize: "0.72rem",
                        padding: "4px 10px",
                        background: "var(--primary-color)",
                        color: "white",
                        borderRadius: "6px",
                        fontWeight: 800,
                        gap: "4px",
                        display: "flex",
                        alignItems: "center",
                        border: "none",
                        cursor: "pointer"
                      }}
                      title="Descargar todas las fotos de esta CTO en un archivo ZIP"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Descargar CTO
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          // VISTA 2: Fotos dentro de la CTO seleccionada
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  onClick={() => setSelectedCtoId(null)}
                  style={{ background: "none", border: "none", color: "var(--primary-color)", cursor: "pointer", fontWeight: 700, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  Carpetas
                </button>
                <span style={{ opacity: 0.5 }}>/</span>
                <h2 style={{ fontSize: "1rem", fontWeight: 800, margin: 0 }}>CTO {selectedCto?.num}</h2>
              </div>
              <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                {selectedCto?.municipio} • {selectedCto?.colocacion}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" }}>
              {selectedCto?.images.map((img, idx) => {
                const displayFilename = img.url.split("-").pop() || "imagen.jpg";
                return (
                  <div key={img.id} className="glass-panel" style={{ background: "var(--card-bg)", borderColor: "var(--border-color)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    
                    {/* Imagen */}
                    <div 
                      onClick={() => {
                        setZoomScale(1);
                        setActiveImgIndex(idx);
                      }}
                      style={{ aspectRatio: "4/3", cursor: "pointer", position: "relative", background: "black", overflow: "hidden" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={`${img.url}?t=${cacheKey}`} 
                        alt={displayFilename}
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    </div>

                    {/* Metadata y Nombre de archivo */}
                    <div style={{ padding: "10px", borderBottom: "1px solid var(--border-color)" }}>
                      <span 
                        title={displayFilename}
                        style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {displayFilename}
                      </span>
                    </div>

                    {/* Acciones */}
                    <div style={{ padding: "8px", display: "flex", justifyContent: "space-between", gap: "4px", background: "var(--bg-color)" }}>
                      {/* Renombrar */}
                      <button
                        type="button"
                        onClick={() => handleRename(img.id, img.url)}
                        title="Renombrar archivo"
                        className="btn"
                        style={{ flex: 1, minHeight: "34px", padding: "4px", background: "var(--card-bg)", color: "var(--text-color)", border: "1px solid var(--border-color)", borderRadius: "6px", cursor: "pointer" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>

                      {/* Rotar Izquierda */}
                      <button
                        type="button"
                        onClick={() => handleRotate(img.id, "left")}
                        title="Rotar a la izquierda"
                        className="btn"
                        style={{ flex: 1, minHeight: "34px", padding: "4px", background: "var(--card-bg)", color: "var(--text-color)", border: "1px solid var(--border-color)", borderRadius: "6px", cursor: "pointer" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 15a3.99 3.99 0 0 0-4-4H4M4 11l3-3M4 11l3 3" />
                          <path d="M12 2a10 10 0 0 1 10 10c0 2.21-.9 4.21-2.34 5.66" />
                        </svg>
                      </button>

                      {/* Rotar Derecha */}
                      <button
                        type="button"
                        onClick={() => handleRotate(img.id, "right")}
                        title="Rotar a la derecha"
                        className="btn"
                        style={{ flex: 1, minHeight: "34px", padding: "4px", background: "var(--card-bg)", color: "var(--text-color)", border: "1px solid var(--border-color)", borderRadius: "6px", cursor: "pointer" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10 15a3.99 3.99 0 0 1 4-4h6M20 11l-3-3M20 11l-3 3" />
                          <path d="M12 2a10 10 0 0 0-10 10c0 2.21.9 4.21 2.34 5.66" />
                        </svg>
                      </button>

                      {/* Descargar */}
                      <a
                        href={img.url}
                        download={displayFilename}
                        title="Descargar archivo"
                        className="btn"
                        style={{ flex: 1, minHeight: "34px", padding: "4px", background: "var(--card-bg)", color: "var(--text-color)", border: "1px solid var(--border-color)", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 21h12M12 3v14M12 17l-5-5M12 17l5-5" />
                        </svg>
                      </a>

                      {/* Eliminar */}
                      <button
                        type="button"
                        onClick={() => handleDelete(img.id)}
                        title="Eliminar archivo"
                        className="btn"
                        style={{ flex: 1, minHeight: "34px", padding: "4px", background: "#fee2e2", color: "#ef4444", border: "1px solid #fca5a5", borderRadius: "6px", cursor: "pointer" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* VISOR LIGHTBOX PARA EL ADMINISTRADOR */}
      {activeImgIndex !== null && selectedCto?.images && selectedCto.images[activeImgIndex] && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 5000, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", color: "white", zIndex: 10 }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              Foto {activeImgIndex + 1} de {selectedCto.images.length} (CTO {selectedCto.num})
            </span>
            <button
              type="button"
              onClick={() => setActiveImgIndex(null)}
              style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", borderRadius: "50%", width: "36px", height: "36px", cursor: "pointer", fontSize: "1.2rem", fontWeight: 700 }}
            >
              ✕
            </button>
          </div>

          {/* Central Image Viewer */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", padding: "0 10px" }}>
            <button
              type="button"
              onClick={() => {
                setZoomScale(1);
                setActiveImgIndex(prev => (prev !== null && prev > 0 ? prev - 1 : (selectedCto.images.length - 1)));
              }}
              style={{ background: "rgba(0,0,0,0.5)", border: "none", color: "white", width: "44px", height: "44px", borderRadius: "50%", cursor: "pointer", zIndex: 10 }}
            >
              ◀
            </button>

            <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", height: "100%", width: "100%", overflow: "hidden", position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${selectedCto.images[activeImgIndex].url}?t=${cacheKey}`}
                alt="Visor Admin"
                style={{ 
                  maxHeight: "80vh", 
                  maxWidth: "100%", 
                  objectFit: "contain", 
                  borderRadius: "8px", 
                  transition: "transform 0.2s",
                  transform: `scale(${zoomScale})`
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setZoomScale(1);
                setActiveImgIndex(prev => (prev !== null && prev < selectedCto.images.length - 1 ? prev + 1 : 0));
              }}
              style={{ background: "rgba(0,0,0,0.5)", border: "none", color: "white", width: "44px", height: "44px", borderRadius: "50%", cursor: "pointer", zIndex: 10 }}
            >
              ▶
            </button>
          </div>

          {/* Acciones en el visor */}
          <div style={{ display: "flex", justifyContent: "center", gap: "24px", padding: "24px 16px", background: "rgba(0,0,0,0.8)", borderTop: "1px solid rgba(255,255,255,0.1)", flexWrap: "wrap" }}>
            {/* Zoom Out */}
            <button
              type="button"
              onClick={() => setZoomScale(prev => Math.max(prev - 0.5, 1))}
              title="Alejar Zoom"
              style={{ background: "none", border: "none", color: "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
              <span style={{ fontSize: "0.75rem" }}>Zoom -</span>
            </button>

            {/* Reset Zoom */}
            <button
              type="button"
              onClick={() => setZoomScale(1)}
              title="Restablecer Zoom"
              style={{ background: "none", border: "none", color: "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
              <span style={{ fontSize: "0.75rem" }}>Ajustar</span>
            </button>

            {/* Zoom In */}
            <button
              type="button"
              onClick={() => setZoomScale(prev => Math.min(prev + 0.5, 4))}
              title="Acercar Zoom"
              style={{ background: "none", border: "none", color: "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
              <span style={{ fontSize: "0.75rem" }}>Zoom +</span>
            </button>

            <span style={{ width: "1px", background: "rgba(255,255,255,0.2)", margin: "0 10px" }} />

            <button
              type="button"
              onClick={() => handleRotate(selectedCto.images[activeImgIndex].id, "left")}
              style={{ background: "none", border: "none", color: "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 15a3.99 3.99 0 0 0-4-4H4M4 11l3-3M4 11l3 3" />
                <path d="M12 2a10 10 0 0 1 10 10c0 2.21-.9 4.21-2.34 5.66" />
              </svg>
              <span style={{ fontSize: "0.75rem" }}>Girar Izq</span>
            </button>

            <button
              type="button"
              onClick={() => handleRotate(selectedCto.images[activeImgIndex].id, "right")}
              style={{ background: "none", border: "none", color: "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 15a3.99 3.99 0 0 1 4-4h6M20 11l-3-3M20 11l-3 3" />
                <path d="M12 2a10 10 0 0 0-10 10c0 2.21.9 4.21 2.34 5.66" />
              </svg>
              <span style={{ fontSize: "0.75rem" }}>Girar Der</span>
            </button>

            <a
              href={selectedCto.images[activeImgIndex].url}
              download={selectedCto.images[activeImgIndex].url.split("-").pop() || "imagen.jpg"}
              style={{ textDecoration: "none", color: "white", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 21h12M12 3v14M12 17l-5-5M12 17l5-5" />
              </svg>
              <span style={{ fontSize: "0.75rem" }}>Descargar</span>
            </a>

            <button
              type="button"
              onClick={() => handleDelete(selectedCto.images[activeImgIndex].id)}
              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span style={{ fontSize: "0.75rem" }}>Eliminar</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
