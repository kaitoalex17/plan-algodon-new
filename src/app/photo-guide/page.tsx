"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

// IndexedDB Helper para cola de subidas offline
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("IndexedDB is only available in the browser"));
      return;
    }
    const request = indexedDB.open("AlgodonOfflineDB", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("pending_uploads")) {
        db.createObjectStore("pending_uploads", { keyPath: "fileId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const savePendingUpload = async (record: { fileId: string; ctoId: string; fileName: string; blob: Blob; status: string; timestamp: number; category?: string }) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("pending_uploads", "readwrite");
    const store = transaction.objectStore("pending_uploads");
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const deletePendingUpload = async (fileId: string) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("pending_uploads", "readwrite");
    const store = transaction.objectStore("pending_uploads");
    const request = store.delete(fileId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getPendingUploadsForCto = async (ctoId: string): Promise<any[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("pending_uploads", "readonly");
    const store = transaction.objectStore("pending_uploads");
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result || [];
      const filtered = all.filter((item: any) => item.ctoId === ctoId);
      resolve(filtered);
    };
    request.onerror = () => reject(request.error);
  });
};

// Categorías de fotos guiadas
const PHOTO_CATEGORIES = [
  { key: "entorno", title: "Foto entorno", desc: "Vista general del exterior y ubicación", icon: "🏠" },
  { key: "cto_abierta", title: "CTO abierta", desc: "Interior de la caja y bandejas de fibra", icon: "📦" },
  { key: "etiquetado_cto", title: "Etiquetado CTO", desc: "Etiqueta identificativa de la CTO", icon: "🏷️" },
  { key: "etiquetado_cableado", title: "Etiquetado cableado", desc: "Etiquetas de mangueras y cables", icon: "🔌" },
  { key: "potencia", title: "Medición potencia", desc: "Pantalla del medidor óptico / VFL", icon: "⚡" },
  { key: "mapa_coordenadas", title: "Imagen coordenadas mapa", desc: "Posición satelital exacta", icon: "🗺️", isMap: true },
  { key: "otras", title: "Otras imágenes", desc: "Evidencias o detalles adicionales", icon: "📷", isOther: true },
];

export default function PhotoGuidePage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg-color, #090d16)", color: "var(--text-color, white)" }}>
        <p style={{ fontWeight: 700, fontFamily: "system-ui, sans-serif" }}>Cargando Guía Fotográfica...</p>
      </div>
    }>
      <PhotoGuideContent />
    </Suspense>
  );
}

function PhotoGuideContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctoId = searchParams.get("ctoId");
  const { data: session, status: authStatus } = useSession();

  const [cto, setCto] = useState<any>(null);
  const [images, setImages] = useState<any[]>([]);
  const [pendingUploads, setPendingUploads] = useState<any[]>([]);
  const [uploadConfig, setUploadConfig] = useState({ imageQuality: 80, imageMaxWidth: 1600 });
  const [activeUploadingKey, setActiveUploadingKey] = useState<string | null>(null);

  // Modal para mapa interactivo de satélite y coordenadas
  const [showMapPinModal, setShowMapPinModal] = useState(false);
  const [pinCoords, setPinCoords] = useState<{ lat: number; lng: number }>({ lat: 36.425, lng: -5.144 });
  const [mapZoom, setMapZoom] = useState(18);
  const [generatingMapImage, setGeneratingMapImage] = useState(false);

  // Visor Lightbox para fotos
  const [viewerImgUrl, setViewerImgUrl] = useState<string | null>(null);

  // Cargar configuración de compresión
  useEffect(() => {
    fetch("/api/upload/config")
      .then(res => res.json())
      .then(data => {
        if (data) {
          setUploadConfig({
            imageQuality: data.imageQuality || 80,
            imageMaxWidth: data.imageMaxWidth || 1600
          });
        }
      })
      .catch(() => {});
  }, []);

  const loadCtoData = useCallback(async () => {
    if (!ctoId) return;
    try {
      const res = await fetch(`/api/ctos/${ctoId}`);
      if (res.ok) {
        const data = await res.json();
        setCto(data);
        setImages(data.images || []);
        if (data.lat && data.lng) {
          setPinCoords({ lat: data.lat, lng: data.lng });
        }
      }
    } catch (e) {
      console.error("Error al cargar CTO:", e);
    }
  }, [ctoId]);

  const loadPending = useCallback(async () => {
    if (!ctoId) return;
    try {
      const p = await getPendingUploadsForCto(ctoId);
      setPendingUploads(p);
    } catch (e) {
      console.error(e);
    }
  }, [ctoId]);

  useEffect(() => {
    if (ctoId) {
      loadCtoData();
      loadPending();
    }
  }, [ctoId, loadCtoData, loadPending]);

  // Compresión en cliente respetando resolución configurada
  const compressImageClient = (file: File | Blob, maxWidth: number, quality: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxWidth) {
              width = Math.round((width * maxWidth) / height);
              height = maxWidth;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas context error"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error("Error generando blob"));
            },
            "image/jpeg",
            quality
          );
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Subida en fragmentos con cola persistente
  const processUploadQueue = async (fileId: string, fileName: string, blob: Blob, categoryKey: string) => {
    const CHUNK_SIZE = 100 * 1024; // 100 KB
    const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);

    let success = false;
    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, blob.size);
        const chunkBlob = blob.slice(start, end);

        const formData = new FormData();
        formData.append("chunk", chunkBlob);
        formData.append("ctoId", ctoId!);
        formData.append("fileId", fileId);
        formData.append("fileName", fileName);
        formData.append("chunkIndex", String(chunkIndex));
        formData.append("totalChunks", String(totalChunks));

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/upload/chunk");
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Server error: ${xhr.status}`));
          };
          xhr.onerror = () => reject(new Error("Error de red"));
          xhr.send(formData);
        });
      }
      success = true;
    } catch (err) {
      console.warn("Subida diferida/offline para", fileName, err);
      await savePendingUpload({
        fileId,
        ctoId: ctoId!,
        fileName,
        blob,
        status: "pending",
        timestamp: Date.now(),
        category: categoryKey
      });
      await loadPending();
    }

    if (success) {
      try {
        await deletePendingUpload(fileId);
        await loadPending();
        await loadCtoData();
      } catch (e) {}
    }
  };

  // Subida de imagen para una categoría específica
  const handleCategoryUpload = async (categoryKey: string, file: File) => {
    if (!cto) return;
    setActiveUploadingKey(categoryKey);

    const safeNum = (cto.num || "CTO").replace(/[^a-zA-Z0-9_-]/g, "_");
    const uniqueSuffix = `${Date.now()}`;
    const formattedName = `${safeNum}_${categoryKey}_${uniqueSuffix}.jpg`;
    const fileId = `guide-${categoryKey}-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    try {
      const quality = (uploadConfig.imageQuality || 80) / 100;
      const compressed = await compressImageClient(file, uploadConfig.imageMaxWidth || 1600, quality);

      // Guardar de inmediato en IndexedDB para asegurar persistencia
      await savePendingUpload({
        fileId,
        ctoId: cto.id,
        fileName: formattedName,
        blob: compressed,
        status: "uploading",
        timestamp: Date.now(),
        category: categoryKey
      });
      await loadPending();

      // Procesar subida silenciosa
      await processUploadQueue(fileId, formattedName, compressed, categoryKey);
    } catch (err) {
      console.error("Error al procesar subida:", err);
    } finally {
      setActiveUploadingKey(null);
    }
  };

  // Reintentar subida pendiente
  const handleRetryPending = async (item: any) => {
    setActiveUploadingKey(item.category || "item");
    await processUploadQueue(item.fileId, item.fileName, item.blob, item.category || "otras");
    setActiveUploadingKey(null);
  };

  const handleDiscardPending = async (fileId: string) => {
    if (confirm("¿Descartar esta imagen en cola?")) {
      await deletePendingUpload(fileId);
      await loadPending();
    }
  };

  // Generar y capturar mapa satelital con pin de coordenadas
  const handleCaptureMapCoordinates = async () => {
    if (!cto) return;
    setGeneratingMapImage(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 900;
      const ctx = canvas.getContext("2d");

      if (!ctx) throw new Error("No se pudo crear el contexto de dibujo.");

      // Fondo oscuro
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Intentar cargar la imagen satelital base
      await new Promise<void>((resolve) => {
        const bgImg = new Image();
        bgImg.crossOrigin = "anonymous";
        bgImg.src = `https://maps.googleapis.com/maps/api/staticmap?center=${pinCoords.lat},${pinCoords.lng}&zoom=${mapZoom}&size=600x450&scale=2&maptype=hybrid`;
        
        bgImg.onload = () => {
          ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
          resolve();
        };
        bgImg.onerror = () => {
          // Fallback satélite con cuadrícula
          ctx.fillStyle = "#1e293b";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          ctx.strokeStyle = "#334155";
          ctx.lineWidth = 1;
          for (let x = 0; x < canvas.width; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }
          for (let y = 0; y < canvas.height; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
          }
          resolve();
        };
      });

      // Dibujar Chincheta / Pin estilo Google Maps
      const pinX = canvas.width / 2;
      const pinY = canvas.height / 2;

      // Sombra del Pin
      ctx.beginPath();
      ctx.ellipse(pinX, pinY + 8, 14, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fill();

      // Pin Rojo
      ctx.beginPath();
      ctx.arc(pinX, pinY - 32, 20, Math.PI * 0.8, Math.PI * 2.2, false);
      ctx.lineTo(pinX, pinY);
      ctx.closePath();
      ctx.fillStyle = "#ea4335"; // Google Red
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      // Punto blanco interior del pin
      ctx.beginPath();
      ctx.arc(pinX, pinY - 32, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Marco superior con datos
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(20, 20, canvas.width - 40, 90);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, canvas.width - 40, 90);

      // Texto de CTO y coordenadas
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 26px system-ui, sans-serif";
      ctx.fillText(`CTO: ${cto.num || "N/A"} — COORDENADAS GPS`, 40, 56);

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 22px monospace";
      ctx.fillText(`Lat: ${pinCoords.lat.toFixed(6)} | Lng: ${pinCoords.lng.toFixed(6)} | Zoom: ${mapZoom}x`, 40, 90);

      // Pie con fecha y hora
      const nowStr = new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(20, canvas.height - 60, canvas.width - 40, 40);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "16px system-ui, sans-serif";
      ctx.fillText(`Captura satelital generada el: ${nowStr} (Algodón Fase 3)`, 40, canvas.height - 34);

      // Convertir a blob y subir
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const safeNum = (cto.num || "CTO").replace(/[^a-zA-Z0-9_-]/g, "_");
        const fileName = `${safeNum}_mapa_coordenadas_${Date.now()}.jpg`;
        const fileId = `guide-mapa_coordenadas-${Date.now()}`;

        await savePendingUpload({
          fileId,
          ctoId: cto.id,
          fileName,
          blob,
          status: "uploading",
          timestamp: Date.now(),
          category: "mapa_coordenadas"
        });
        await loadPending();

        setShowMapPinModal(false);
        await processUploadQueue(fileId, fileName, blob, "mapa_coordenadas");
      }, "image/jpeg", 0.9);

    } catch (err) {
      console.error("Error al capturar mapa de coordenadas:", err);
      alert("No se pudo generar la imagen del mapa. Inténtalo de nuevo.");
    } finally {
      setGeneratingMapImage(false);
    }
  };

  // Filtrar imágenes por cada categoría
  const getImagesForCategory = (catKey: string) => {
    return images.filter(img => {
      const urlLower = (img.url || "").toLowerCase();
      if (catKey === "entorno") return urlLower.includes("_entorno");
      if (catKey === "cto_abierta") return urlLower.includes("_cto_abierta") || urlLower.includes("_abierta");
      if (catKey === "etiquetado_cto") return urlLower.includes("_etiquetado_cto");
      if (catKey === "etiquetado_cableado") return urlLower.includes("_etiquetado_cableado") || urlLower.includes("_cableado");
      if (catKey === "potencia") return urlLower.includes("_potencia");
      if (catKey === "mapa_coordenadas") return urlLower.includes("_mapa_coordenadas");
      if (catKey === "otras") {
        return !urlLower.includes("_entorno") &&
               !urlLower.includes("_cto_abierta") &&
               !urlLower.includes("_abierta") &&
               !urlLower.includes("_etiquetado_cto") &&
               !urlLower.includes("_etiquetado_cableado") &&
               !urlLower.includes("_cableado") &&
               !urlLower.includes("_potencia") &&
               !urlLower.includes("_mapa_coordenadas");
      }
      return false;
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-color, #090d16)", color: "var(--text-color, #f8fafc)", display: "flex", flexDirection: "column" }}>
      
      {/* Header Fijo */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--card-bg, #0f172a)", borderBottom: "1px solid var(--border-color, #334155)", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            onClick={() => window.close()}
            style={{ background: "var(--border-color, #334155)", border: "none", color: "white", borderRadius: "8px", width: "36px", height: "36px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", fontWeight: 800 }}
            title="Volver"
          >
            ✕
          </button>
          <div>
            <h1 style={{ fontSize: "1.1rem", fontWeight: 900, margin: 0, color: "var(--text-color, white)", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>📸</span> Guía Fotográfica — CTO {cto?.num || "..."}
            </h1>
            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
              Captura continua de evidencias con cola automática
            </span>
          </div>
        </div>

        {/* Indicador de subidas en cola */}
        {pendingUploads.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(245, 158, 11, 0.15)", border: "1px solid #f59e0b", padding: "4px 10px", borderRadius: "20px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b" }} />
            <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#f59e0b" }}>
              {pendingUploads.length} en cola
            </span>
          </div>
        )}
      </header>

      {/* Contenido Principal */}
      <main style={{ flex: 1, padding: "16px", maxWidth: "900px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>
        
        {/* Banner de Ayuda */}
        <div style={{ background: "rgba(59, 130, 246, 0.1)", border: "1.5px solid #3b82f6", borderRadius: "12px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "1.6rem" }}>⚡</span>
          <div style={{ flex: 1, fontSize: "0.82rem", color: "#bfdbfe" }}>
            <strong>Subida rápida y fluida:</strong> Toma tantas fotos como necesites de cada apartado. Las fotos se optimizan y suben automáticamente en segundo plano sin interrumpirte.
          </div>
        </div>

        {/* Cola de Subida Pendiente (si existe) */}
        {pendingUploads.length > 0 && (
          <div style={{ background: "var(--card-bg, #0f172a)", border: "1px dashed #f59e0b", borderRadius: "12px", padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#f59e0b", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>⏳</span> Fotos pendientes de sincronizar ({pendingUploads.length})
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {pendingUploads.map((item) => (
                <div key={item.fileId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-color, #020617)", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--border-color, #334155)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#e2e8f0" }}>{item.fileName}</span>
                    <span style={{ fontSize: "0.68rem", color: "#94a3b8" }}>({(item.blob.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => handleRetryPending(item)}
                      style={{ padding: "3px 8px", fontSize: "0.72rem", background: "var(--primary-color, #FF7900)", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 700 }}
                    >
                      Subir
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDiscardPending(item.fileId)}
                      style={{ padding: "3px 8px", fontSize: "0.72rem", background: "#ef4444", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 700 }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bloques de Categorías de Fotos */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {PHOTO_CATEGORIES.map((cat) => {
            const catImages = getImagesForCategory(cat.key);
            const isUploading = activeUploadingKey === cat.key;
            const hasPhotos = catImages.length > 0;

            return (
              <div 
                key={cat.key}
                style={{ 
                  background: "var(--card-bg, #0f172a)", 
                  border: hasPhotos ? "1.5px solid #10b981" : "1.5px solid var(--border-color, #334155)", 
                  borderRadius: "14px", 
                  padding: "16px",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px"
                }}
              >
                {/* Cabecera del bloque */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "1.4rem" }}>{cat.icon}</span>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <h2 style={{ fontSize: "0.95rem", fontWeight: 800, margin: 0, color: "var(--text-color, white)" }}>
                          {cat.title}
                        </h2>
                        {hasPhotos ? (
                          <span style={{ fontSize: "0.7rem", fontWeight: 800, padding: "2px 6px", borderRadius: "10px", background: "#dcfce7", color: "#166534" }}>
                            ✓ {catImages.length} foto(s)
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "2px 6px", borderRadius: "10px", background: "rgba(239, 68, 68, 0.15)", color: "#ef4444" }}>
                            Pendiente
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{cat.desc}</span>
                    </div>
                  </div>

                  {/* Acciones de Foto por Categoría */}
                  <div style={{ display: "flex", gap: "8px" }}>
                    {cat.isMap ? (
                      <button
                        type="button"
                        onClick={() => setShowMapPinModal(true)}
                        style={{
                          background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          padding: "8px 14px",
                          fontWeight: 800,
                          fontSize: "0.82rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)"
                        }}
                      >
                        <span>🗺️</span> Ajustar Coordenadas y Capturar
                      </button>
                    ) : (
                      <>
                        {/* Botón Cámara Directa */}
                        <label
                          style={{
                            background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                            color: "white",
                            border: "none",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            fontWeight: 800,
                            fontSize: "0.82rem",
                            cursor: isUploading ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)",
                            opacity: isUploading ? 0.6 : 1
                          }}
                        >
                          <span>📷</span> {isUploading ? "Cargando..." : "Cámara"}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            disabled={isUploading}
                            style={{ display: "none" }}
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                handleCategoryUpload(cat.key, e.target.files[0]);
                                e.target.value = "";
                              }
                            }}
                          />
                        </label>

                        {/* Botón Galería / Archivo */}
                        <label
                          style={{
                            background: "var(--border-color, #334155)",
                            color: "white",
                            border: "none",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            fontWeight: 800,
                            fontSize: "0.82rem",
                            cursor: isUploading ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            opacity: isUploading ? 0.6 : 1
                          }}
                        >
                          <span>📁</span> Subir
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={isUploading}
                            style={{ display: "none" }}
                            onChange={(e) => {
                              if (e.target.files) {
                                for (let i = 0; i < e.target.files.length; i++) {
                                  handleCategoryUpload(cat.key, e.target.files[i]);
                                }
                                e.target.value = "";
                              }
                            }}
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>

                {/* Lista de Fotos Subidas en esta categoría */}
                {catImages.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: "10px", borderTop: "1px solid var(--border-color, #1e293b)", paddingTop: "10px" }}>
                    {catImages.map((img, idx) => (
                      <div 
                        key={img.id || idx}
                        onClick={() => setViewerImgUrl(img.url)}
                        style={{
                          position: "relative",
                          aspectRatio: "1/1",
                          borderRadius: "8px",
                          overflow: "hidden",
                          border: "1.5px solid var(--border-color, #334155)",
                          cursor: "pointer",
                          background: "#020617"
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={cat.title}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                        <span style={{ position: "absolute", bottom: "2px", right: "4px", fontSize: "0.65rem", background: "rgba(0,0,0,0.6)", color: "white", padding: "1px 4px", borderRadius: "4px" }}>
                          #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </main>

      {/* MODAL DE MAPA SATELITAL CON PIN DE COORDENADAS AJUSTABLE */}
      {showMapPinModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: "12px", backdropFilter: "blur(6px)" }}>
          <div style={{ width: "95%", maxWidth: "680px", background: "var(--card-bg, #0f172a)", border: "2px solid var(--border-color, #334155)", borderRadius: "16px", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.6)" }}>
            
            {/* Header Modal */}
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-color, #334155)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#020617" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.2rem" }}>📍</span>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0, color: "white" }}>
                  Ajustar Posición en Mapa Satélite
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMapPinModal(false)}
                style={{ background: "var(--border-color, #334155)", border: "none", color: "white", borderRadius: "50%", width: "30px", height: "30px", fontSize: "1rem", cursor: "pointer", fontWeight: 800 }}
              >
                ✕
              </button>
            </div>

            {/* Contenedor del Mapa / Visor Satélite Interactivo */}
            <div style={{ position: "relative", width: "100%", height: "340px", background: "#020617", overflow: "hidden" }}>
              {/* Vista Satélite de Google Maps Iframe */}
              <iframe
                title="Google Satellite Pin"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                src={`https://maps.google.com/maps?q=${pinCoords.lat},${pinCoords.lng}&z=${mapZoom}&t=k&output=embed`}
              />

              {/* Controles de Zoom */}
              <div style={{ position: "absolute", bottom: "16px", right: "16px", display: "flex", flexDirection: "column", gap: "6px", zIndex: 10 }}>
                <button
                  type="button"
                  onClick={() => setMapZoom(prev => Math.min(prev + 1, 20))}
                  style={{ width: "36px", height: "36px", background: "rgba(15, 23, 42, 0.9)", color: "white", border: "1px solid #334155", borderRadius: "8px", fontWeight: 900, cursor: "pointer", fontSize: "1.1rem" }}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setMapZoom(prev => Math.max(prev - 1, 14))}
                  style={{ width: "36px", height: "36px", background: "rgba(15, 23, 42, 0.9)", color: "white", border: "1px solid #334155", borderRadius: "8px", fontWeight: 900, cursor: "pointer", fontSize: "1.1rem" }}
                >
                  -
                </button>
              </div>

              {/* Botón GPS actual del dispositivo */}
              <button
                type="button"
                onClick={() => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setPinCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                      },
                      (err) => alert("No se pudo obtener la posición GPS actual.")
                    );
                  }
                }}
                style={{ position: "absolute", top: "16px", right: "16px", background: "rgba(15, 23, 42, 0.9)", color: "#38bdf8", border: "1.5px solid #38bdf8", borderRadius: "8px", padding: "6px 12px", fontSize: "0.78rem", fontWeight: 800, cursor: "pointer", zIndex: 10, display: "flex", alignItems: "center", gap: "6px" }}
              >
                <span>📡</span> Usar mi GPS
              </button>
            </div>

            {/* Ajuste manual de coordenadas */}
            <div style={{ padding: "14px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", background: "var(--card-bg, #0f172a)" }}>
              <div>
                <label style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 700, display: "block", marginBottom: "4px" }}>Latitud</label>
                <input
                  type="number"
                  step="any"
                  value={pinCoords.lat}
                  onChange={(e) => setPinCoords({ ...pinCoords, lat: parseFloat(e.target.value) || pinCoords.lat })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", background: "var(--bg-color, #020617)", border: "1px solid var(--border-color, #334155)", color: "white", fontSize: "0.85rem", fontWeight: 700 }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 700, display: "block", marginBottom: "4px" }}>Longitud</label>
                <input
                  type="number"
                  step="any"
                  value={pinCoords.lng}
                  onChange={(e) => setPinCoords({ ...pinCoords, lng: parseFloat(e.target.value) || pinCoords.lng })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", background: "var(--bg-color, #020617)", border: "1px solid var(--border-color, #334155)", color: "white", fontSize: "0.85rem", fontWeight: 700 }}
                />
              </div>
            </div>

            {/* Footer Modal */}
            <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border-color, #334155)", display: "flex", gap: "10px", background: "#020617" }}>
              <button
                type="button"
                onClick={() => setShowMapPinModal(false)}
                style={{ flex: 1, padding: "10px", background: "var(--border-color, #334155)", color: "white", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCaptureMapCoordinates}
                disabled={generatingMapImage}
                style={{ flex: 2, padding: "10px", background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", color: "white", border: "none", borderRadius: "8px", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                <span>💾</span> {generatingMapImage ? "Generando imagen..." : "Generar y Guardar Imagen"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* VISOR LIGHTBOX INDIVIDUAL */}
      {viewerImgUrl && (
        <div 
          onClick={() => setViewerImgUrl(null)}
          style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(0,0,0,0.95)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
        >
          <button
            type="button"
            onClick={() => setViewerImgUrl(null)}
            style={{ position: "absolute", top: "20px", right: "20px", background: "rgba(255,255,255,0.2)", border: "none", color: "white", borderRadius: "50%", width: "40px", height: "40px", fontSize: "1.3rem", fontWeight: 800, cursor: "pointer" }}
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewerImgUrl}
            alt="Detalle"
            style={{ maxWidth: "100%", maxHeight: "90vh", objectFit: "contain", borderRadius: "10px" }}
          />
        </div>
      )}

    </div>
  );
}
