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

// Categorías de fotos guiadas con iconos SVG profesionales
const PHOTO_CATEGORIES = [
  { 
    key: "entorno", 
    title: "Foto entorno", 
    desc: "Vista general del exterior y ubicación", 
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    )
  },
  { 
    key: "cto_abierta", 
    title: "CTO abierta", 
    desc: "Interior de la caja y bandejas de fibra", 
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    )
  },
  { 
    key: "etiquetado_cto", 
    title: "Etiquetado CTO", 
    desc: "Etiqueta identificativa de la CTO", 
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    )
  },
  { 
    key: "etiquetado_cableado", 
    title: "Etiquetado cableado", 
    desc: "Etiquetas de mangueras y cables", 
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v8M18 2v4M6 2v4" />
        <rect x="4" y="10" width="16" height="8" rx="2" />
        <path d="M12 18v4" />
      </svg>
    )
  },
  { 
    key: "potencia", 
    title: "Medición potencia", 
    desc: "Pantalla del medidor óptico / VFL", 
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    )
  },
  { 
    key: "mapa_coordenadas", 
    title: "Imagen coordenadas mapa", 
    desc: "Posición satelital exacta", 
    isMap: true,
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    )
  },
  { 
    key: "otras", 
    title: "Otras imágenes", 
    desc: "Evidencias o detalles adicionales", 
    isOther: true,
    iconSvg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    )
  },
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

  // Cargar configuración de compresión y tema de usuario
  useEffect(() => {
    fetch("/api/upload/config")
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setUploadConfig({
            imageQuality: data.imageQuality || 80,
            imageMaxWidth: data.imageMaxWidth || 1600
          });
        }
      })
      .catch(() => {});

    // Cargar y aplicar tema del usuario
    fetch("/api/users/map-state")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.theme) {
          document.body.classList.forEach(cls => {
            if (cls.startsWith("theme-")) document.body.classList.remove(cls);
          });
          document.body.classList.add(`theme-${data.theme}`);
        }
      })
      .catch(() => {});

    // Añadir clase photo-guide-page para habilitar scroll nativo completo
    document.body.classList.add("photo-guide-page");
    document.documentElement.classList.add("photo-guide-page");

    return () => {
      document.body.classList.remove("photo-guide-page");
      document.documentElement.classList.remove("photo-guide-page");
    };
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

  // Borrar imagen subida
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const handleDeleteImage = async (imageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Deseas eliminar esta foto de forma permanente?")) return;

    setDeletingImageId(imageId);
    try {
      const res = await fetch("/api/uploads/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId })
      });
      if (res.ok) {
        setImages(prev => prev.filter(img => img.id !== imageId));
      } else {
        alert("No se pudo eliminar la imagen.");
      }
    } catch (err) {
      console.error("Error al borrar imagen:", err);
      alert("Error al intentar eliminar la imagen.");
    } finally {
      setDeletingImageId(null);
    }
  };

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
      
      {/* Header Fijo Compacto */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--card-bg)", borderBottom: "1px solid var(--border-color)", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={() => window.close()}
            style={{ background: "var(--bg-color)", border: "1px solid var(--border-color)", color: "var(--text-color)", borderRadius: "6px", width: "30px", height: "30px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.95rem", fontWeight: 800 }}
            title="Volver"
          >
            ✕
          </button>
          <div>
            <h1 style={{ fontSize: "0.92rem", fontWeight: 800, margin: 0, color: "var(--text-color)", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "var(--primary-color)" }}>●</span> CTO {cto?.num || "..."}
            </h1>
            <span style={{ fontSize: "0.68rem", opacity: 0.7 }}>
              Evidencias fotográficas
            </span>
          </div>
        </div>

        {/* Acciones de Descarga y Estado */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {/* Botón Descargar Fotos Antala directas */}
          <button
            type="button"
            onClick={async () => {
              const antalaImgs = images.filter(img => {
                const urlLower = (img.url || "").toLowerCase();
                return urlLower.includes("_entorno") ||
                       urlLower.includes("_cto_abierta") ||
                       urlLower.includes("_abierta") ||
                       urlLower.includes("_etiquetado_cto") ||
                       urlLower.includes("_etiquetado_cableado") ||
                       urlLower.includes("_cableado") ||
                       urlLower.includes("_potencia") ||
                       urlLower.includes("_mapa_coordenadas");
              });

              if (antalaImgs.length === 0) {
                alert("No hay fotos de la categoría Antala para descargar en esta CTO.");
                return;
              }

              for (let i = 0; i < antalaImgs.length; i++) {
                const img = antalaImgs[i];
                try {
                  const response = await fetch(img.url);
                  const blob = await response.blob();
                  const blobUrl = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.style.display = "none";
                  a.href = blobUrl;
                  a.download = img.url.split("/").pop() || `antala_${cto?.num || "cto"}_${i + 1}.jpg`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(blobUrl);
                  document.body.removeChild(a);
                  await new Promise(r => setTimeout(r, 250));
                } catch (e) {
                  console.error("Error descargando foto:", img.url, e);
                }
              }
            }}
            style={{
              background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              padding: "5px 9px",
              fontSize: "0.72rem",
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              boxShadow: "0 1px 4px rgba(139, 92, 246, 0.25)"
            }}
            title="Descarga todas las fotos de Antala directamente a tu dispositivo"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Antala</span>
          </button>

          {/* Botón Descargar Otras Fotos directas */}
          <button
            type="button"
            onClick={async () => {
              const otrasImgs = images.filter(img => {
                const urlLower = (img.url || "").toLowerCase();
                const isAntala = urlLower.includes("_entorno") ||
                                 urlLower.includes("_cto_abierta") ||
                                 urlLower.includes("_abierta") ||
                                 urlLower.includes("_etiquetado_cto") ||
                                 urlLower.includes("_etiquetado_cableado") ||
                                 urlLower.includes("_cableado") ||
                                 urlLower.includes("_potencia") ||
                                 urlLower.includes("_mapa_coordenadas");
                return !isAntala;
              });

              if (otrasImgs.length === 0) {
                alert("No hay fotos en 'Otras imágenes' para descargar en esta CTO.");
                return;
              }

              for (let i = 0; i < otrasImgs.length; i++) {
                const img = otrasImgs[i];
                try {
                  const response = await fetch(img.url);
                  const blob = await response.blob();
                  const blobUrl = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.style.display = "none";
                  a.href = blobUrl;
                  a.download = img.url.split("/").pop() || `otras_${cto?.num || "cto"}_${i + 1}.jpg`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(blobUrl);
                  document.body.removeChild(a);
                  await new Promise(r => setTimeout(r, 250));
                } catch (e) {
                  console.error("Error descargando foto:", img.url, e);
                }
              }
            }}
            style={{
              background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "7px 12px",
              fontSize: "0.78rem",
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 6px rgba(5, 150, 105, 0.3)"
            }}
            title="Descarga todas las fotos de 'Otras imágenes' directamente a tu dispositivo (archivos .jpg sueltos)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span>Descargar Otras fotos</span>
          </button>

          {/* Indicador de subidas en cola */}
          {pendingUploads.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(245, 158, 11, 0.15)", border: "1px solid #f59e0b", padding: "4px 10px", borderRadius: "20px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b" }} />
              <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#f59e0b" }}>
                {pendingUploads.length} en cola
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Contenido Principal */}
      <main style={{ flex: 1, padding: "10px 12px", maxWidth: "800px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "10px" }}>
        
        {/* Banner de Ayuda Compacto */}
        <div style={{ background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: "10px", padding: "8px 12px", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "rgba(59, 130, 246, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#3b82f6", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div style={{ flex: 1, fontSize: "0.74rem", color: "var(--text-color)", opacity: 0.9 }}>
            <strong>Subida fluida:</strong> Captura las fotos necesarias. Se optimizan y suben en segundo plano automáticamente.
          </div>
        </div>

        {/* Cola de Subida Pendiente (si existe) */}
        {pendingUploads.length > 0 && (
          <div style={{ background: "var(--card-bg)", border: "1px dashed #f59e0b", borderRadius: "10px", padding: "8px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "0.76rem", fontWeight: 800, color: "#f59e0b", display: "flex", alignItems: "center", gap: "4px" }}>
                <span>⏳</span> Pendientes ({pendingUploads.length})
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {pendingUploads.map((item) => (
                <div key={item.fileId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-color)", padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--text-color)" }}>{item.fileName}</span>
                    <span style={{ fontSize: "0.64rem", opacity: 0.6 }}>({(item.blob.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button
                      type="button"
                      onClick={() => handleRetryPending(item)}
                      style={{ padding: "2px 6px", fontSize: "0.68rem", background: "var(--primary-color)", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: 700 }}
                    >
                      Subir
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDiscardPending(item.fileId)}
                      style={{ padding: "2px 6px", fontSize: "0.68rem", background: "#ef4444", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: 700 }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bloques de Categorías de Fotos (Más Compactos) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {PHOTO_CATEGORIES.map((cat) => {
            const catImages = getImagesForCategory(cat.key);
            const isUploading = activeUploadingKey === cat.key;
            const hasPhotos = catImages.length > 0;

            return (
              <div 
                key={cat.key}
                style={{ 
                  background: "var(--card-bg)", 
                  border: hasPhotos ? "1.5px solid #10b981" : "1px solid var(--border-color)", 
                  borderRadius: "10px", 
                  padding: "10px 12px",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}
              >
                {/* Cabecera del bloque */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ 
                      width: "30px", 
                      height: "30px", 
                      borderRadius: "8px", 
                      background: hasPhotos ? "rgba(16, 185, 129, 0.12)" : "rgba(255, 121, 0, 0.1)", 
                      color: hasPhotos ? "#10b981" : "var(--primary-color)", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      flexShrink: 0
                    }}>
                      {cat.iconSvg}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <h2 style={{ fontSize: "0.85rem", fontWeight: 800, margin: 0, color: "var(--text-color)" }}>
                          {cat.title}
                        </h2>
                        {hasPhotos ? (
                          <span style={{ fontSize: "0.65rem", fontWeight: 800, padding: "1px 6px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
                            ✓ {catImages.length}
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "1px 6px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.12)", color: "#ef4444" }}>
                            Pendiente
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "0.68rem", opacity: 0.65 }}>{cat.desc}</span>
                    </div>
                  </div>

                  {/* Acciones de Foto por Categoría */}
                  <div style={{ display: "flex", gap: "6px" }}>
                    {cat.isMap ? (
                      <button
                        type="button"
                        onClick={() => setShowMapPinModal(true)}
                        style={{
                          background: "var(--primary-color)",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          fontWeight: 800,
                          fontSize: "0.74rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.12)"
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                          <line x1="8" y1="2" x2="8" y2="18" />
                          <line x1="16" y1="6" x2="16" y2="22" />
                        </svg>
                        <span>Mapa Satélite</span>
                      </button>
                    ) : (
                      <>
                        {/* Botón Cámara Directa */}
                        <label
                          style={{
                            background: "var(--primary-color)",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            padding: "6px 10px",
                            fontWeight: 800,
                            fontSize: "0.74rem",
                            cursor: isUploading ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                            opacity: isUploading ? 0.6 : 1
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                          <span>{isUploading ? "..." : "Cámara"}</span>
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
                            background: "var(--bg-color)",
                            color: "var(--text-color)",
                            border: "1px solid var(--border-color)",
                            borderRadius: "6px",
                            padding: "6px 10px",
                            fontWeight: 800,
                            fontSize: "0.74rem",
                            cursor: isUploading ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            opacity: isUploading ? 0.6 : 1
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          <span>Subir</span>
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

                {/* Lista de Fotos Subidas en esta categoría (con botón de borrar) */}
                {catImages.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: "8px", borderTop: "1px solid var(--border-color)", paddingTop: "8px" }}>
                    {catImages.map((img, idx) => (
                      <div 
                        key={img.id || idx}
                        onClick={() => setViewerImgUrl(img.url)}
                        style={{
                          position: "relative",
                          aspectRatio: "1/1",
                          borderRadius: "6px",
                          overflow: "hidden",
                          border: "1.5px solid var(--border-color)",
                          cursor: "pointer",
                          background: "var(--bg-color)"
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={cat.title}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                        
                        {/* Indicador de número */}
                        <span style={{ position: "absolute", bottom: "2px", left: "3px", fontSize: "0.6rem", background: "rgba(0,0,0,0.65)", color: "white", padding: "1px 3px", borderRadius: "3px", fontWeight: 700 }}>
                          #{idx + 1}
                        </span>

                        {/* Botón Borrar Foto (Papelera) */}
                        {img.id && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteImage(img.id, e)}
                            disabled={deletingImageId === img.id}
                            title="Eliminar esta foto"
                            style={{
                              position: "absolute",
                              top: "2px",
                              right: "2px",
                              background: "rgba(239, 68, 68, 0.88)",
                              border: "none",
                              borderRadius: "4px",
                              width: "22px",
                              height: "22px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              color: "white",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.3)"
                            }}
                          >
                            {deletingImageId === img.id ? (
                              <span style={{ fontSize: "0.6rem" }}>...</span>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            )}
                          </button>
                        )}
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
