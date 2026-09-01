"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";

const DraggableSatelliteMap = dynamic(
  () => import("@/components/DraggableSatelliteMap"),
  { 
    ssr: false,
    loading: () => (
      <div style={{ height: "100%", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#020617", color: "#94a3b8", fontSize: "0.85rem", fontWeight: 700 }}>
        Cargando Mapa Satélite...
      </div>
    )
  }
);

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

  // Estados de conexión y sincronización offline
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [isSyncingQueue, setIsSyncingQueue] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  // Modal para mapa interactivo de satélite y coordenadas
  const [showMapPinModal, setShowMapPinModal] = useState(false);
  const [pinCoords, setPinCoords] = useState<{ lat: number; lng: number }>({ lat: 36.425, lng: -5.144 });
  const [mapZoom, setMapZoom] = useState(18);
  const [generatingMapImage, setGeneratingMapImage] = useState(false);

  // Visor Lightbox para fotos
  const [viewerImgUrl, setViewerImgUrl] = useState<string | null>(null);

  const [currentTheme, setCurrentTheme] = useState<string>("orange");

  // Escuchadores para reconexión y sincronización automática
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncMessage("🟢 Conexión restablecida. Sincronizando fotos pendientes...");
      autoSyncPendingQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncMessage(null);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Si ya estamos online al montar y hay pendientes, sincronizar tras breve pausa
    if (typeof navigator !== "undefined" && navigator.onLine) {
      setTimeout(() => {
        autoSyncPendingQueue();
      }, 1200);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [ctoId]);

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

    // Cargar y aplicar tema inmediatamente desde localStorage y luego de la API
    try {
      const savedTheme = localStorage.getItem("app_theme");
      if (savedTheme) {
        setCurrentTheme(savedTheme);
        document.documentElement.className = document.documentElement.className.replace(/theme-\S+/g, "").trim() + ` theme-${savedTheme}`;
        document.body.className = document.body.className.replace(/theme-\S+/g, "").trim() + ` theme-${savedTheme}`;
      }
    } catch (e) {}

    fetch("/api/users/map-state")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.theme) {
          setCurrentTheme(data.theme);
          try {
            localStorage.setItem("app_theme", data.theme);
          } catch (e) {}
          document.documentElement.className = document.documentElement.className.replace(/theme-\S+/g, "").trim() + ` theme-${data.theme}`;
          document.body.className = document.body.className.replace(/theme-\S+/g, "").trim() + ` theme-${data.theme}`;
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

    // 1. Cargar desde caché local de inmediato (funciona 100% offline)
    try {
      const cached = localStorage.getItem(`cto_cache_${ctoId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setCto(parsed);
        setImages(parsed.images || []);
        if (parsed.lat && parsed.lng) {
          setPinCoords({ lat: parsed.lat, lng: parsed.lng });
        }
      }
    } catch (e) {}

    // 2. Refrescar desde servidor si hay conexión
    try {
      const res = await fetch(`/api/ctos/${ctoId}`);
      if (res.ok) {
        const data = await res.json();
        setCto(data);
        setImages(data.images || []);
        if (data.lat && data.lng) {
          setPinCoords({ lat: data.lat, lng: data.lng });
        }
        try {
          localStorage.setItem(`cto_cache_${ctoId}`, JSON.stringify(data));
        } catch (e) {}
      }
    } catch (e) {
      console.warn("Sin conexión con el servidor. Modo offline activo para CTO:", ctoId);
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

  // Garantizar que cto nunca sea null si se abrió con ctoId y num en URL
  useEffect(() => {
    if (!cto && ctoId) {
      const numFromUrl = searchParams.get("num") || "CTO";
      setCto({
        id: ctoId,
        num: numFromUrl,
        images: []
      } as any);
    }
  }, [cto, ctoId, searchParams]);

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

  // Subida en fragmentos con cola persistente y tolerancia offline
  const processUploadQueue = async (fileId: string, fileName: string, blob: Blob, categoryKey: string): Promise<boolean> => {
    // Si sabemos que estamos offline, guardar en la cola y terminar silenciosamente
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await savePendingUpload({
        fileId,
        ctoId: ctoId!,
        fileName,
        blob,
        status: "offline_queued",
        timestamp: Date.now(),
        category: categoryKey
      });
      await loadPending();
      return false;
    }

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
          xhr.timeout = 15000;
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Server error: ${xhr.status}`));
          };
          xhr.ontimeout = () => reject(new Error("Timeout de conexión"));
          xhr.onerror = () => reject(new Error("Error de red"));
          xhr.send(formData);
        });
      }
      success = true;
    } catch (err) {
      console.warn("Subida diferida/offline guardada para", fileName, err);
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
      return false;
    }

    if (success) {
      try {
        await deletePendingUpload(fileId);
        await loadPending();
        await loadCtoData();
      } catch (e) {}
      return true;
    }
    return false;
  };

  // Función de sincronización automática de todas las fotos pendientes
  const autoSyncPendingQueue = async () => {
    if (isSyncingRef.current || !ctoId) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    isSyncingRef.current = true;
    setIsSyncingQueue(true);

    try {
      const queue = await getPendingUploadsForCto(ctoId);
      if (queue.length === 0) {
        setIsSyncingQueue(false);
        isSyncingRef.current = false;
        return;
      }

      setSyncMessage(`Sincronizando ${queue.length} fotos con el servidor...`);

      for (let i = 0; i < queue.length; i++) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setSyncMessage("Pausa por falta de cobertura. Se reanudará al volver la señal.");
          break;
        }

        const item = queue[i];
        setSyncMessage(`Subiendo foto ${i + 1} de ${queue.length}: ${item.category || "evidencia"}...`);
        const ok = await processUploadQueue(item.fileId, item.fileName, item.blob, item.category || "otras");
        if (!ok) {
          break;
        }
      }

      const remaining = await getPendingUploadsForCto(ctoId);
      if (remaining.length === 0) {
        setSyncMessage("✅ ¡Todas las fotos se han sincronizado con éxito!");
        setTimeout(() => setSyncMessage(null), 4000);
      } else {
        setSyncMessage(`Quedan ${remaining.length} fotos pendientes de sincronizar`);
      }
    } catch (e) {
      console.error("Error en sincronización automática:", e);
    } finally {
      isSyncingRef.current = false;
      setIsSyncingQueue(false);
      await loadPending();
      await loadCtoData();
    }
  };

  // Helper para generar el nombre de archivo con el patrón: tipodefoto[_indice]_[cto]_[DDMMYY].jpg
  const getFormattedPhotoName = (categoryKey: string) => {
    const now = new Date();
    const dayStr = String(now.getDate()).padStart(2, "0");
    const monthStr = String(now.getMonth() + 1).padStart(2, "0");
    const yearStr = String(now.getFullYear()).slice(-2);
    const datePattern = `${dayStr}${monthStr}${yearStr}`;

    const rawCtoNum = cto?.num || searchParams.get("num") || "CTO";
    const cleanCtoNum = rawCtoNum.replace(/[^a-zA-Z0-9_-]/g, "_");

    // Conteo considerando fotos ya en el servidor + fotos tomadas offline en este dispositivo
    const existingServerCount = getImagesForCategory(categoryKey).length;
    const existingPendingCount = pendingUploads.filter(p => p.category === categoryKey).length;
    const existingCount = existingServerCount + existingPendingCount;

    const suffixIndex = existingCount > 0 ? `_${existingCount + 1}` : "";
    return `${categoryKey}${suffixIndex}_${cleanCtoNum}_${datePattern}.jpg`;
  };

  // Subida de imagen para una categoría específica (con soporte offline total)
  const handleCategoryUpload = async (categoryKey: string, file: File) => {
    if (!cto && !ctoId) return;
    setActiveUploadingKey(categoryKey);

    const formattedName = getFormattedPhotoName(categoryKey);
    const fileId = `guide-${categoryKey}-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    try {
      const quality = (uploadConfig.imageQuality || 80) / 100;
      const compressed = await compressImageClient(file, uploadConfig.imageMaxWidth || 1600, quality);

      // Guardar de inmediato en IndexedDB para asegurar persistencia offline
      await savePendingUpload({
        fileId,
        ctoId: ctoId!,
        fileName: formattedName,
        blob: compressed,
        status: (typeof navigator !== "undefined" && !navigator.onLine) ? "offline_queued" : "uploading",
        timestamp: Date.now(),
        category: categoryKey
      });
      await loadPending();

      // Si no hay conexión a internet, no intentar red y continuar con la app activa
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setActiveUploadingKey(null);
        return;
      }

      // Procesar subida
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
    if (confirm("¿Descartar esta foto guardada localmente?")) {
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

      // Fondo base
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Calcular tiles satélite de Google Maps (Mercator Projection)
      const latRad = (pinCoords.lat * Math.PI) / 180;
      const n = Math.pow(2, mapZoom);
      const centerTileX = ((pinCoords.lng + 180) / 360) * n;
      const centerTileY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

      const intCenterX = Math.floor(centerTileX);
      const intCenterY = Math.floor(centerTileY);
      const offsetX = (centerTileX - intCenterX) * 256;
      const offsetY = (centerTileY - intCenterY) * 256;

      const canvasCenterX = canvas.width / 2;
      const canvasCenterY = canvas.height / 2;

      // Cargar matriz de 5x5 tiles satélite híbridos en paralelo
      const tilePromises: Promise<void>[] = [];
      const tileSize = 256;

      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          const tileX = intCenterX + dx;
          const tileY = intCenterY + dy;
          const posX = canvasCenterX + (dx * tileSize) - offsetX;
          const posY = canvasCenterY + (dy * tileSize) - offsetY;

          const p = new Promise<void>((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = `https://mt1.google.com/vt/lyrs=y&x=${tileX}&y=${tileY}&z=${mapZoom}`;
            img.onload = () => {
              try {
                ctx.drawImage(img, posX, posY, tileSize, tileSize);
              } catch (e) {}
              resolve();
            };
            img.onerror = () => resolve();
          });
          tilePromises.push(p);
        }
      }

      await Promise.all(tilePromises);

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
        const fileName = getFormattedPhotoName("mapa_coordenadas");
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

  // Filtrar imágenes por cada categoría de forma robusta
  const getImagesForCategory = (catKey: string) => {
    return images.filter(img => {
      const urlLower = (img.url || "").toLowerCase();
      if (catKey === "entorno") {
        return urlLower.includes("entorno");
      }
      if (catKey === "cto_abierta") {
        return urlLower.includes("cto_abierta") || urlLower.includes("abierta");
      }
      if (catKey === "etiquetado_cto") {
        return urlLower.includes("etiquetado_cto") || (urlLower.includes("etiquetado") && !urlLower.includes("cableado"));
      }
      if (catKey === "etiquetado_cableado") {
        return urlLower.includes("etiquetado_cableado") || urlLower.includes("cableado");
      }
      if (catKey === "potencia") {
        return urlLower.includes("potencia");
      }
      if (catKey === "mapa_coordenadas") {
        return urlLower.includes("mapa_coordenadas") || urlLower.includes("coordenadas");
      }
      if (catKey === "otras") {
        const isAntala = urlLower.includes("entorno") ||
                         urlLower.includes("abierta") ||
                         urlLower.includes("etiquetado") ||
                         urlLower.includes("cableado") ||
                         urlLower.includes("potencia") ||
                         urlLower.includes("coordenadas");
        return !isAntala;
      }
      return false;
    });
  };

  return (
    <div className={`theme-${currentTheme}`} style={{ minHeight: "100vh", background: "var(--bg-color)", color: "var(--text-color)", display: "flex", flexDirection: "column" }}>
      
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
                return urlLower.includes("entorno") ||
                       urlLower.includes("abierta") ||
                       urlLower.includes("etiquetado") ||
                       urlLower.includes("cableado") ||
                       urlLower.includes("potencia") ||
                       urlLower.includes("coordenadas");
              });

              if (antalaImgs.length === 0) {
                alert("No hay fotos de la categoría Antala para descargar en esta CTO.");
                return;
              }

              // Calcular fecha en formato DDMMYY
              const now = new Date();
              const dayStr = String(now.getDate()).padStart(2, "0");
              const monthStr = String(now.getMonth() + 1).padStart(2, "0");
              const yearStr = String(now.getFullYear()).slice(-2);
              const datePattern = `${dayStr}${monthStr}${yearStr}`;
              const cleanCto = (cto?.num || "CTO").replace(/[^a-zA-Z0-9_-]/g, "_");

              const categoryCounter: { [key: string]: number } = {};

              for (let i = 0; i < antalaImgs.length; i++) {
                const img = antalaImgs[i];
                const urlLower = (img.url || "").toLowerCase();
                
                let catKey = "antala";
                if (urlLower.includes("entorno")) catKey = "entorno";
                else if (urlLower.includes("abierta")) catKey = "cto_abierta";
                else if (urlLower.includes("cableado")) catKey = "etiquetado_cableado";
                else if (urlLower.includes("etiquetado")) catKey = "etiquetado_cto";
                else if (urlLower.includes("potencia")) catKey = "potencia";
                else if (urlLower.includes("coordenadas")) catKey = "mapa_coordenadas";

                categoryCounter[catKey] = (categoryCounter[catKey] || 0) + 1;
                const idx = categoryCounter[catKey];
                const suffix = idx > 1 ? `_${idx}` : "";
                const downloadName = `${catKey}${suffix}_${cleanCto}_${datePattern}.jpg`;

                try {
                  const response = await fetch(img.url);
                  const blob = await response.blob();
                  const blobUrl = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.style.display = "none";
                  a.href = blobUrl;
                  a.download = downloadName;
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
                const isAntala = urlLower.includes("entorno") ||
                                 urlLower.includes("abierta") ||
                                 urlLower.includes("etiquetado") ||
                                 urlLower.includes("cableado") ||
                                 urlLower.includes("potencia") ||
                                 urlLower.includes("coordenadas");
                return !isAntala;
              });

              if (otrasImgs.length === 0) {
                alert("No hay fotos en 'Otras imágenes' para descargar en esta CTO.");
                return;
              }

              const now = new Date();
              const dayStr = String(now.getDate()).padStart(2, "0");
              const monthStr = String(now.getMonth() + 1).padStart(2, "0");
              const yearStr = String(now.getFullYear()).slice(-2);
              const datePattern = `${dayStr}${monthStr}${yearStr}`;
              const cleanCto = (cto?.num || "CTO").replace(/[^a-zA-Z0-9_-]/g, "_");

              for (let i = 0; i < otrasImgs.length; i++) {
                const img = otrasImgs[i];
                const suffix = i > 0 ? `_${i + 1}` : "";
                const downloadName = `otras${suffix}_${cleanCto}_${datePattern}.jpg`;

                try {
                  const response = await fetch(img.url);
                  const blob = await response.blob();
                  const blobUrl = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.style.display = "none";
                  a.href = blobUrl;
                  a.download = downloadName;
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

          {/* Indicador de estado de conexión y subidas en cola */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {!isOnline && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", padding: "4px 10px", borderRadius: "20px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444" }} />
                <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#ef4444" }}>
                  📡 Sin conexión
                </span>
              </div>
            )}

            {pendingUploads.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(245, 158, 11, 0.15)", border: "1px solid #f59e0b", padding: "4px 10px", borderRadius: "20px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b" }} />
                <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#f59e0b" }}>
                  {pendingUploads.length} en cola local
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main style={{ flex: 1, padding: "10px 12px", maxWidth: "800px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "10px" }}>
        
        {/* Banner de Modo Sin Conexión (Offline) */}
        {!isOnline && (
          <div style={{
            background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            color: "#ffffff",
            padding: "10px 14px",
            borderRadius: "10px",
            boxShadow: "0 2px 8px rgba(245, 158, 11, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.4rem" }}>📡</span>
              <div>
                <strong style={{ fontSize: "0.86rem", display: "block" }}>MODO SIN CONEXIÓN ACTIVO</strong>
                <span style={{ fontSize: "0.75rem", opacity: 0.95 }}>
                  Puedes tomar todas las fotos que necesites. Se guardan seguras en tu móvil y se subirán solas al recuperar internet.
                </span>
              </div>
            </div>
            {pendingUploads.length > 0 && (
              <span style={{ background: "rgba(0,0,0,0.25)", padding: "4px 8px", borderRadius: "8px", fontSize: "0.75rem", fontWeight: 800, whiteSpace: "nowrap" }}>
                {pendingUploads.length} fotos guardadas
              </span>
            )}
          </div>
        )}

        {/* Banner de Progreso de Sincronización o Éxito */}
        {syncMessage && (
          <div style={{
            background: syncMessage.includes("✅") ? "#10b981" : "#0284c7",
            color: "white",
            padding: "9px 14px",
            borderRadius: "10px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            fontSize: "0.82rem",
            fontWeight: 800
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>{isSyncingQueue ? "🔄" : "✨"}</span>
              <span>{syncMessage}</span>
            </div>
            {isSyncingQueue && (
              <span style={{ fontSize: "0.72rem", opacity: 0.9, fontWeight: 600 }}>
                En segundo plano...
              </span>
            )}
          </div>
        )}

        {/* Botón manual para subir fotos pendientes si hay internet */}
        {isOnline && pendingUploads.length > 0 && !isSyncingQueue && (
          <div style={{
            background: "var(--card-bg)",
            border: "1.5px solid var(--primary-color)",
            padding: "8px 14px",
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.1rem" }}>⏳</span>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-color)" }}>
                Hay {pendingUploads.length} foto(s) guardadas en tu dispositivo listas para sincronizar
              </span>
            </div>
            <button
              type="button"
              onClick={autoSyncPendingQueue}
              style={{
                background: "var(--primary-color)",
                color: "white",
                border: "none",
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "0.78rem",
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <span>⚡ Sincronizar ahora</span>
            </button>
          </div>
        )}

        {/* Bloques de Categorías de Fotos */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {PHOTO_CATEGORIES.map((cat) => {
            const catImages = getImagesForCategory(cat.key);
            const catPending = pendingUploads.filter((p) => p.category === cat.key);
            const isUploading = activeUploadingKey === cat.key;
            const hasPhotos = catImages.length > 0 || catPending.length > 0;
            const totalCount = catImages.length + catPending.length;

            return (
              <div 
                key={cat.key}
                style={{ 
                  background: "var(--card-bg)", 
                  border: hasPhotos ? (catPending.length > 0 && catImages.length === 0 ? "1.5px dashed #f59e0b" : "1.5px solid #10b981") : "1px solid var(--border-color)", 
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
                      background: hasPhotos ? (catPending.length > 0 && catImages.length === 0 ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.12)") : "rgba(255, 121, 0, 0.1)", 
                      color: hasPhotos ? (catPending.length > 0 && catImages.length === 0 ? "#f59e0b" : "#10b981") : "var(--primary-color)", 
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
                          <span style={{
                            fontSize: "0.65rem",
                            fontWeight: 800,
                            padding: "1px 6px",
                            borderRadius: "8px",
                            background: catPending.length > 0 ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.15)",
                            color: catPending.length > 0 ? "#b45309" : "#10b981"
                          }}>
                            ✓ {totalCount} {catPending.length > 0 ? `(${catPending.length} offline)` : ""}
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
                      <>
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

                        {/* Permitir también subir imagen manualmente para coordenadas */}
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
                          title="Subir captura o foto de coordenadas manualmente"
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
                      </>
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

                {/* Lista de Fotos Subidas en esta categoría (Confirmadas + Offline) */}
                {(catImages.length > 0 || catPending.length > 0) && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: "8px", borderTop: "1px solid var(--border-color)", paddingTop: "8px" }}>
                    
                    {/* 1. Fotos ya confirmadas en el servidor */}
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
                        title="Foto confirmada en el servidor"
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

                    {/* 2. Fotos pendientes en el dispositivo (Offline) */}
                    {catPending.map((item, pIdx) => {
                      const localBlobUrl = URL.createObjectURL(item.blob);
                      return (
                        <div
                          key={item.fileId}
                          onClick={() => setViewerImgUrl(localBlobUrl)}
                          style={{
                            position: "relative",
                            aspectRatio: "1/1",
                            borderRadius: "6px",
                            overflow: "hidden",
                            border: "2px dashed #f59e0b",
                            cursor: "pointer",
                            background: "rgba(245, 158, 11, 0.08)"
                          }}
                          title="Foto guardada localmente en tu dispositivo (se subirá en cuanto vuelva internet)"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={localBlobUrl}
                            alt={item.fileName}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />

                          {/* Badge de Offline */}
                          <span style={{
                            position: "absolute",
                            bottom: "2px",
                            left: "2px",
                            fontSize: "0.58rem",
                            background: "#f59e0b",
                            color: "#1e293b",
                            padding: "1px 4px",
                            borderRadius: "3px",
                            fontWeight: 800
                          }}>
                            ⏳ Offline #{catImages.length + pIdx + 1}
                          </span>

                          {/* Botón Descartar foto offline */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDiscardPending(item.fileId);
                            }}
                            title="Descartar esta foto local"
                            style={{
                              position: "absolute",
                              top: "2px",
                              right: "2px",
                              background: "rgba(239, 68, 68, 0.9)",
                              border: "none",
                              borderRadius: "4px",
                              width: "20px",
                              height: "20px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              color: "white"
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}

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

            {/* Contenedor del Mapa Satelital Interactivo con Chincheta Arrastrable */}
            <div style={{ position: "relative", width: "100%", height: "360px", background: "#020617", overflow: "hidden" }}>
              <DraggableSatelliteMap
                lat={pinCoords.lat}
                lng={pinCoords.lng}
                zoom={mapZoom}
                onPositionChange={(newPos) => setPinCoords(newPos)}
                onZoomChange={(newZoom) => setMapZoom(newZoom)}
              />

              {/* Indicador de ayuda */}
              <div style={{
                position: "absolute",
                bottom: "12px",
                left: "12px",
                background: "rgba(15, 23, 42, 0.88)",
                color: "white",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "0.74rem",
                fontWeight: 700,
                border: "1px solid #334155",
                zIndex: 1000,
                pointerEvents: "none",
                backdropFilter: "blur(4px)"
              }}>
                👆 Arrastra la chincheta o toca en el mapa para marcar el punto exacto
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
