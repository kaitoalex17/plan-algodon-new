"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { sendLiveTechLocation } from "@/lib/techLocationSync";

type SubStatus = { id: string; name: string; color: string };
type User = { id: string; name: string; email: string; color: string };

type CtoDrawerProps = {
  cto: any;
  onClose: () => void;
  onUpdate: (updatedCto: any) => void;
};

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

const savePendingUpload = async (record: { fileId: string; ctoId: string; fileName: string; blob: Blob; status: string; timestamp: number }) => {
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

export default function CtoDrawer({ cto, onClose, onUpdate }: CtoDrawerProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const isGestor = (session?.user as any)?.role === "GESTOR";
  const canEditAudit = isAdmin || isGestor;

  const [details, setDetails] = useState<any>(null);
  const [pendingUploads, setPendingUploads] = useState<any[]>([]);
  const [uploadConfig, setUploadConfig] = useState({ imageQuality: 80, imageMaxWidth: 1600 });
  const [subStatuses, setSubStatuses] = useState<SubStatus[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  
  // Form fields
  const [status, setStatus] = useState("PENDIENTE");
  const [subStatusId, setSubStatusId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [auditedById, setAuditedById] = useState("");
  const [auditDateTime, setAuditDateTime] = useState("");
  const [notas, setNotas] = useState("");
  const [commentText, setCommentText] = useState("");
  
  // Nuevos campos de auditoría de fibra
  const [puertosTotal, setPuertosTotal] = useState<number | string>(8);
  const [puertosOcupados, setPuertosOcupados] = useState<number | string>(0);
  const [potenciaDbm, setPotenciaDbm] = useState<number | string>("");
  // Estado para gestión dinámica de divisores (rellenados por OCR o manual)
  const [drawerSplitters, setDrawerSplitters] = useState<{ signal: string; isOcr?: boolean; ocrWl?: string }[]>([
    { signal: "" }
  ]);
  const [cierreSeguridad, setCierreSeguridad] = useState(true);
  const [etiquetadoCorrecto, setEtiquetadoCorrecto] = useState(true);
  const [zona, setZona] = useState("");
  const [cluster, setCluster] = useState("");

  const handleAddDrawerSplitter = () => {
    setDrawerSplitters(prev => {
      if (prev.length >= 6) return prev;
      return [...prev, { signal: "", isOcr: false }];
    });
  };

  const handleRemoveDrawerSplitter = (index: number) => {
    if (drawerSplitters.length <= 1) return;
    setDrawerSplitters(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateDrawerSplitter = (index: number, val: string) => {
    const cleanVal = val.replace(/^-+/, "").replace(",", ".");
    setDrawerSplitters(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], signal: cleanVal };
      return copy;
    });
  };
  
  const [loading, setLoading] = useState(false);
  const [copiedCtoNum, setCopiedCtoNum] = useState(false);

  const handleCopyCtoNum = () => {
    if (cto?.num && navigator.clipboard) {
      navigator.clipboard.writeText(cto.num);
      setCopiedCtoNum(true);
      setTimeout(() => setCopiedCtoNum(false), 2000);
    }
  };
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // States for checklist, programada and checklist modal
  const [hasFormulario, setHasFormulario] = useState(false);
  const [hasDrive, setHasDrive] = useState(false);
  const [hasAntala, setHasAntala] = useState(false);
  const [isProgramada, setIsProgramada] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [checkFormulario, setCheckFormulario] = useState(false);
  const [checkDrive, setCheckDrive] = useState(false);
  const [checkAntala, setCheckAntala] = useState(false);
  const [confirmConformidadAnomalia, setConfirmConformidadAnomalia] = useState(false);

  // States for toggles, progress and gallery
  const [showFiberDetails, setShowFiberDetails] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showFormGuideModal, setShowFormGuideModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; loaded: number; total: number } | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [activeImgIndex, setActiveImgIndex] = useState<number | null>(null);
  const [markingReparo, setMarkingReparo] = useState(false);

  // Fetch complete details of this specific CTO (Declarado tempranamente para evitar TDZ en SSR)
  const fetchCtoDetails = useCallback(async () => {
    if (!cto?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ctos/${cto.id}`);
      if (res.ok) {
        const data = await res.json();
        setDetails(data);
        setStatus(data.status || "PENDIENTE");
        setSubStatusId(data.subStatusId || "");
        setAssignedToId(data.assignedToId || "");
        setNotas(data.notas || "");
        setZona(data.zona || "");
        setCluster(data.cluster || "");
        
        setAuditedById(data.auditedById || "");

        // Extraer fecha y hora de auditoría solo si está auditada
        let initialAuditDateTime = "";
        if (data.auditDateTime) {
          const dt = new Date(data.auditDateTime);
          if (!isNaN(dt.getTime())) {
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, "0");
            const d = String(dt.getDate()).padStart(2, "0");
            const hh = String(dt.getHours()).padStart(2, "0");
            const mm = String(dt.getMinutes()).padStart(2, "0");
            initialAuditDateTime = `${y}-${m}-${d}T${hh}:${mm}`;
          }
        }
        setAuditDateTime(initialAuditDateTime);

        // Cargar nuevos campos de fibra
        setPuertosTotal(data.puertosTotal !== null ? data.puertosTotal : 8);
        setPuertosOcupados(data.puertosOcupados !== null ? data.puertosOcupados : 0);
        setPotenciaDbm(data.potenciaDbm !== null ? data.potenciaDbm : "");

        // Cargar divisores desde formDataJson o potenciaDbm
        let loadedSplitters: { signal: string; isOcr?: boolean; ocrWl?: string }[] = [];
        if (data.formDataJson) {
          try {
            const parsedForm = JSON.parse(data.formDataJson);
            if (Array.isArray(parsedForm.splitters) && parsedForm.splitters.length > 0 && parsedForm.splitters.some((s: any) => s.signal)) {
              loadedSplitters = parsedForm.splitters.map((s: any, idx: number) => {
                const ocrMatch = parsedForm.ocrSplitters?.find((o: any) => o.divisor === idx + 1);
                const rawSignal = (s.signal || "").replace(/^-+/, "").trim();
                return {
                  signal: rawSignal,
                  isOcr: Boolean(ocrMatch),
                  ocrWl: ocrMatch?.wavelength
                };
              });
            } else if (Array.isArray(parsedForm.ocrSplitters) && parsedForm.ocrSplitters.length > 0) {
              loadedSplitters = parsedForm.ocrSplitters.map((o: any) => ({
                signal: (o.rawNumber || o.power || "").replace(/^-+/, "").trim(),
                isOcr: true,
                ocrWl: o.wavelength
              }));
            }
          } catch (e) {}
        }

        if (loadedSplitters.length === 0) {
          const rawPot = String(data.potenciaDbm || "").replace(/^-+/, "").trim();
          loadedSplitters = [{ signal: rawPot, isOcr: false }];
        }

        const potenciaImgsCount = Math.min(6, (data.images || []).filter((i: any) => 
          (i.url || "").toLowerCase().includes("potencia")
        ).length);
        while (loadedSplitters.length < Math.max(1, potenciaImgsCount) && loadedSplitters.length < 6) {
          loadedSplitters.push({ signal: "", isOcr: false });
        }

        // Limitar SIEMPRE a máximo 6 divisores
        if (loadedSplitters.length > 6) {
          loadedSplitters = loadedSplitters.slice(0, 6);
        }

        setDrawerSplitters(loadedSplitters);

        setCierreSeguridad(data.cierreSeguridad !== null ? data.cierreSeguridad : true);
        setEtiquetadoCorrecto(data.etiquetadoCorrecto !== null ? data.etiquetadoCorrecto : true);
        setHasFormulario(data.hasFormulario || false);
        setHasDrive(data.hasDrive || false);
        setHasAntala(data.hasAntala || false);
        setIsProgramada(data.category === "PROGRAMADA");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [cto?.id]);

  // Estados para el Modal de Puertos (Botón Triángulo)
  const [showPortsModal, setShowPortsModal] = useState(false);
  const [portsCapacity, setPortsCapacity] = useState<number>(8);
  interface PortItem {
    id: number;
    status: "LIBRE" | "OCUPADO" | "OTRO" | "CTR";
    customNumber: string;
  }
  const [portsList, setPortsList] = useState<PortItem[]>([]);
  const [showVisualPortsViewer, setShowVisualPortsViewer] = useState(false);
  const [fillRangeInput, setFillRangeInput] = useState<string>("");

  // Sincronizar estado de los puertos al abrir cualquiera de los dos modales (siempre por defecto 8)
  const syncPortsData = useCallback(() => {
    let savedCap = 8;
    let savedPorts: PortItem[] | null = null;
    if (details?.formDataJson) {
      try {
        const parsed = JSON.parse(details.formDataJson);
        if (parsed?.fiberPorts && Array.isArray(parsed.fiberPorts)) {
          savedPorts = parsed.fiberPorts;
          if (parsed.puertosTotal) savedCap = parsed.puertosTotal;
        }
      } catch (e) {}
    } else if (details?.puertosTotal) {
      savedCap = details.puertosTotal;
    }
    const validCapacities = [8, 16, 24, 32, 40, 48];
    const initialCap = validCapacities.includes(savedCap) ? savedCap : 8;
    setPortsCapacity(initialCap);

    const occCount = (details?.puertosOcupados !== null && details?.puertosOcupados !== undefined) ? parseInt(String(details.puertosOcupados)) : 0;
    const list: PortItem[] = [];
    for (let i = 1; i <= initialCap; i++) {
      if (savedPorts && savedPorts[i - 1]) {
        list.push({
          id: i,
          status: savedPorts[i - 1].status || "LIBRE",
          customNumber: savedPorts[i - 1].customNumber || ""
        });
      } else if (i <= occCount) {
        list.push({ id: i, status: "OCUPADO", customNumber: "" });
      } else {
        list.push({ id: i, status: "LIBRE", customNumber: "" });
      }
    }
    setPortsList(list);
  }, [details?.formDataJson, details?.puertosTotal, details?.puertosOcupados]);

  useEffect(() => {
    if (showPortsModal || showVisualPortsViewer) {
      syncPortsData();
    }
  }, [showPortsModal, showVisualPortsViewer, syncPortsData]);

  // Listener para cerrar o recargar modal in-app de Guía de Formulario
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;
      if (event.data.type === "CLOSE_FORM_GUIDE") {
        setShowFormGuideModal(false);
      } else if (event.data.type === "FORM_GUIDE_SAVED") {
        setShowFormGuideModal(false);
        fetchCtoDetails();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [fetchCtoDetails]);

  // Detección centralizada de anomalías de potencia y longitud de onda / frecuencia
  const powerAuditAlerts = useMemo(() => {
    const imgs = details?.images || [];
    const hasPotImg = imgs.some((i: any) => (i.url || "").toLowerCase().includes("potencia"));
    
    // Si NO se detecta ni se agregan fotos de potencia, NO sale nada
    if (!hasPotImg) {
      return {
        hasWlMismatch: false,
        hasPowerOutOfRange: false,
        hasAnyAnomaly: false,
        wlDetails: null,
        outOfRangePowerValues: [] as string[]
      };
    }

    let ocrWlMismatch: any = null;
    let ocrSplittersList: any[] = [];
    if (details?.formDataJson) {
      try {
        const parsed = JSON.parse(details.formDataJson);
        if (parsed.ocrWavelengthMismatch) {
          ocrWlMismatch = parsed.ocrWavelengthMismatch;
        }
        if (Array.isArray(parsed.ocrSplitters)) {
          ocrSplittersList = parsed.ocrSplitters;
        }
      } catch (e) {}
    }

    // Comprobar si alguno de los splitters tiene longitud de onda distinta a 1490
    if (!ocrWlMismatch) {
      const splitterWithDiffWl = drawerSplitters.find(s => s.ocrWl && s.ocrWl !== "1490");
      if (splitterWithDiffWl) {
        ocrWlMismatch = {
          detected: splitterWithDiffWl.ocrWl,
          expected: "1490"
        };
      } else {
        const ocrDiff = ocrSplittersList.find((o: any) => o.wavelength && o.wavelength !== "1490");
        if (ocrDiff) {
          ocrWlMismatch = {
            detected: ocrDiff.wavelength,
            expected: "1490"
          };
        }
      }
    }

    const hasWlMismatch = Boolean(ocrWlMismatch);

    // Comprobar si la señal es -70 / Lo / LO o superior a -22.99 dBm (ej: -23.00, -24.17, -25.00)
    const outOfRangePowerValues: string[] = [];
    const checkSignalVal = (raw: string | number | undefined | null) => {
      if (raw === undefined || raw === null) return;
      const str = String(raw).trim();
      if (!str) return;
      if (/^(lo|l\.o\.)$/i.test(str)) {
        outOfRangePowerValues.push("Lo");
        return;
      }
      const cleanNum = str.replace(/[^-0-9.,]/g, "").replace(",", ".");
      const num = parseFloat(cleanNum);
      if (!isNaN(num)) {
        // En magnitud de atenuación: -70.00 o si es peor que -22.99 (es decir <= -23.00, o abs(num) > 22.99)
        const absVal = Math.abs(num);
        if (absVal >= 70 || absVal > 22.99) {
          outOfRangePowerValues.push(`-${absVal.toFixed(2)} dBm`);
        }
      }
    };

    drawerSplitters.forEach(s => checkSignalVal(s.signal));
    if (potenciaDbm !== "") checkSignalVal(potenciaDbm);
    ocrSplittersList.forEach((o: any) => checkSignalVal(o.power || o.rawNumber));

    const hasPowerOutOfRange = outOfRangePowerValues.length > 0;
    const hasAnyAnomaly = hasWlMismatch || hasPowerOutOfRange;

    return {
      hasWlMismatch,
      hasPowerOutOfRange,
      hasAnyAnomaly,
      wlDetails: ocrWlMismatch,
      outOfRangePowerValues: Array.from(new Set(outOfRangePowerValues))
    };
  }, [details?.images, details?.formDataJson, drawerSplitters, potenciaDbm]);

  const handlePortsCapacityChange = (newCap: number) => {
    setPortsCapacity(newCap);
    setPortsList(prev => {
      const list: PortItem[] = [];
      for (let i = 1; i <= newCap; i++) {
        if (prev[i - 1]) {
          list.push({
            id: i,
            status: prev[i - 1].status || "LIBRE",
            customNumber: prev[i - 1].customNumber || ""
          });
        } else {
          list.push({ id: i, status: "LIBRE", customNumber: "" });
        }
      }
      return list;
    });
  };

  const handlePortStatusChange = (index: number, newStatus: "LIBRE" | "OCUPADO" | "OTRO" | "CTR") => {
    setPortsList(prev => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        status: newStatus,
        customNumber: newStatus === "OTRO" ? copy[index].customNumber : ""
      };
      return copy;
    });
  };

  const handlePortNumberChange = (index: number, val: string) => {
    const numericVal = val.replace(/\D/g, "");
    setPortsList(prev => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        status: "OTRO",
        customNumber: numericVal
      };
      return copy;
    });
  };

  const handleFillAllLibre = () => {
    setPortsList(prev => prev.map(p => ({ ...p, status: "LIBRE", customNumber: "" })));
  };

  const handleFillAllOcupados = () => {
    setPortsList(prev => prev.map(p => ({ ...p, status: "OCUPADO", customNumber: "" })));
  };

  const handleFillRange = (numOccupied: number) => {
    if (isNaN(numOccupied) || numOccupied < 0) return;
    const capped = Math.min(numOccupied, portsCapacity);
    setPortsList(prev => {
      const copy: PortItem[] = [];
      for (let i = 1; i <= portsCapacity; i++) {
        if (i <= capped) {
          copy.push({ id: i, status: "OCUPADO", customNumber: "" });
        } else {
          copy.push({ id: i, status: "LIBRE", customNumber: "" });
        }
      }
      return copy;
    });
  };

  const handleSavePortsModal = async () => {
    // 1. Construir lista completa y garantizada para TODOS los puertos (1 hasta portsCapacity)
    const fullList: PortItem[] = [];
    for (let i = 1; i <= portsCapacity; i++) {
      const existing = portsList.find(p => p.id === i) || portsList[i - 1];
      if (existing) {
        fullList.push({
          id: i,
          status: existing.status || "LIBRE",
          customNumber: existing.status === "OTRO" ? (existing.customNumber || "") : ""
        });
      } else {
        fullList.push({ id: i, status: "LIBRE", customNumber: "" });
      }
    }

    const occupiedCount = fullList.filter(p => p.status === "OCUPADO" || p.status === "CTR" || (p.status === "OTRO" && p.customNumber.trim() !== "")).length;
    setPuertosTotal(portsCapacity);
    setPuertosOcupados(occupiedCount);
    setPortsList(fullList);

    // Preparar formDataJson para guardar la configuración de puertos
    let currentFormData: any = {};
    if (details?.formDataJson) {
      try { currentFormData = JSON.parse(details.formDataJson); } catch (e) {}
    }
    currentFormData.fiberPorts = fullList;
    currentFormData.puertosTotal = portsCapacity;
    currentFormData.puertosOcupados = occupiedCount;
    const newFormDataJson = JSON.stringify(currentFormData);

    // Generar comentario estructurado exacto de TODOS los puertos (del 1 al portsCapacity) sin omitir ninguno
    const commentLines: string[] = [];
    for (let i = 1; i <= portsCapacity; i++) {
      const p = fullList[i - 1];
      if (p.status === "OCUPADO") {
        commentLines.push(`Puerto ${i}: OCUPADO/NO LOCALIZADO`);
      } else if (p.status === "CTR") {
        commentLines.push(`Puerto ${i}: CTR`);
      } else if (p.status === "OTRO") {
        const num = p.customNumber && p.customNumber.trim() ? p.customNumber.trim() : "SIN NÚMERO";
        commentLines.push(`Puerto ${i}: ${num}`);
      } else {
        commentLines.push(`Puerto ${i}: LIBRE`);
      }
    }
    const portsComment = commentLines.join("\n");

    try {
      await fetch(`/api/ctos/${cto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puertosTotal: portsCapacity,
          puertosOcupados: occupiedCount,
          formDataJson: newFormDataJson,
          commentText: portsComment
        })
      });
      fetchCtoDetails();
    } catch (e) {
      console.error("Error guardando puertos:", e);
    }

    setShowPortsModal(false);
    setShowVisualPortsViewer(true);
  };

  // Función de captura rápida y silenciosa de GPS (con fallback inmediato para no ralentizar)
  const getQuickGpsLocation = async (): Promise<string | null> => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) return null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 4000,
          maximumAge: 60000
        });
      });
      return `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
    } catch (e) {
      return null;
    }
  };

  const handleMarcarReparo = async () => {
    if (!cto?.id) return;
    const techName = session?.user?.name || session?.user?.email || "Técnico";
    
    if (!confirm(`¿Confirmas que deseas marcar esta CTO (${cto.num}) como REPARADA por ${techName}?`)) {
      return;
    }

    setMarkingReparo(true);

    // Obtener geolocalización rápida en segundo plano
    const gpsLocation = await getQuickGpsLocation();

    try {
      const currentUserId = (session?.user as any)?.id;
      const nowIso = new Date().toISOString();
      const commentMsg = `Esta CTO fue reparada por ${techName}.`;
      const customActionText = `Reparada por ${techName} (Marc. Reparo CTO)`;

      const res = await fetch(`/api/ctos/${cto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CORRECTO",
          assignedToId: null, // Pasa a Sin Asignar
          auditedById: currentUserId || null, // Auditado por quien presiona
          auditDateTime: nowIso,
          commentText: commentMsg,
          location: gpsLocation,
          customAction: customActionText
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setStatus("CORRECTO");
        setAssignedToId("");
        if (currentUserId) setAuditedById(currentUserId);
        setAuditDateTime(nowIso);
        setDetails(updated);
        
        const fullUpdatedCto = {
          ...cto,
          status: "CORRECTO",
          assignedToId: null,
          assignedTo: null,
          auditedById: currentUserId || null,
          auditedBy: session?.user ? { id: currentUserId, name: techName } : null
        };
        onUpdate(fullUpdatedCto);
        fetchCtoDetails();
        sendLiveTechLocation(`Reparación CTO ${cto.num}`);
        alert(`✅ ¡CTO ${cto.num} marcada como REPARADA con éxito!\n\n• Estado: CORRECTO\n• Reparado por: ${techName}\n• Asignación: Sin asignar`);
      } else {
        const errData = await res.json();
        alert(`Error al marcar como reparada: ${errData.error || "Error del servidor"}`);
      }
    } catch (err: any) {
      console.error("Error en handleMarcarReparo:", err);
      alert(`Error de conexión: ${err.message}`);
    } finally {
      setMarkingReparo(false);
    }
  };

  // Identificar el primer auditor histórico y el último registro de reparación
  const originalAuditLog = useMemo(() => {
    if (!details?.history || details.history.length === 0) return null;
    const auditLogs = [...details.history].filter((h: any) => 
      (h.action || "").toLowerCase().includes("a correcto") || 
      (h.action || "").toLowerCase().includes("a fallo") ||
      (h.action || "").toLowerCase().includes("auditoría") ||
      (h.action || "").toLowerCase().includes("auditado por")
    );
    if (auditLogs.length === 0) return null;
    return auditLogs[auditLogs.length - 1]; // El más antiguo
  }, [details?.history]);

  const lastRepairLog = useMemo(() => {
    if (!details?.history || details.history.length === 0) return null;
    return details.history.find((h: any) => 
      (h.action || "").toLowerCase().includes("reparad") || 
      (h.action || "").toLowerCase().includes("reparo")
    );
  }, [details?.history]);

  const [cacheKey, setCacheKey] = useState(Date.now());
  const [zoomScale, setZoomScale] = useState(1);
  const [showFormSheetModal, setShowFormSheetModal] = useState(false);
  const [showSummaryCopyModal, setShowSummaryCopyModal] = useState(false);
  const [deletingForm, setDeletingForm] = useState(false);
  const [showDriveTooltip, setShowDriveTooltip] = useState(false);
  const [retryingDrive, setRetryingDrive] = useState(false);

  const handleDeleteForm = async () => {
    if (!confirm("¿Estás seguro de que deseas eliminar permanentemente el cuestionario de esta CTO? Esto también borrará los datos del formulario guardados.")) return;
    setDeletingForm(true);
    try {
      const res = await fetch(`/api/ctos/${cto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formDataJson: null,
          hasFormulario: false
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setDetails(updated);
        setHasFormulario(false);
        onUpdate(updated);
        alert("Cuestionario eliminado correctamente.");
        setShowFormSheetModal(false);
      } else {
        alert("Error al eliminar el cuestionario.");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión con el servidor.");
    } finally {
      setDeletingForm(false);
    }
  };

  const [fetchingFormSheet, setFetchingFormSheet] = useState(false);

  const handleOpenFormSheet = async () => {
    if (!cto?.id) return;
    setFetchingFormSheet(true);
    try {
      const res = await fetch(`/api/ctos/${cto.id}`);
      if (res.ok) {
        const data = await res.json();
        setDetails(data);
        setHasFormulario(data.hasFormulario);
      }
    } catch (err) {
      console.error("Error al refrescar ficha formulario:", err);
    } finally {
      setFetchingFormSheet(false);
      setShowFormSheetModal(true);
    }
  };



  // Fetch dropdown options (substatuses and users)
  const fetchOptions = useCallback(async () => {
    try {
      const [resSub, resUsers] = await Promise.all([
        fetch("/api/status"),
        canEditAudit ? fetch("/api/users") : Promise.resolve(null),
      ]);
      
      if (resSub.ok) setSubStatuses(await resSub.json());
      if (resUsers?.ok) setUsers(await resUsers.json());
    } catch (e) {
      console.error(e);
    }
  }, [canEditAudit]);

  const loadPendingUploads = useCallback(async () => {
    if (!cto?.id) return;
    try {
      const pending = await getPendingUploadsForCto(cto.id);
      setPendingUploads(pending);
    } catch (err) {
      console.error("Error cargando pendientes locales:", err);
    }
  }, [cto?.id]);

  const fetchUploadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/upload/config");
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setUploadConfig({
            imageQuality: data.imageQuality,
            imageMaxWidth: data.imageMaxWidth
          });
        }
      }
    } catch (e) {
      console.error("Error fetching upload config:", e);
    }
  }, []);

  useEffect(() => {
    fetchUploadConfig();
  }, [fetchUploadConfig]);

  const compressImageClientSide = (file: File, maxWidth: number, quality: number): Promise<Blob> => {
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
            reject(new Error("No se pudo obtener el contexto del Canvas"));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error("Error al convertir Canvas a Blob"));
              }
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

  const uploadInChunks = async (fileId: string, fileName: string, blob: Blob) => {
    const CHUNK_SIZE = 100 * 1024; // 100 KB
    const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);
    
    setUploading(true);
    setUploadProgress({ percent: 0, loaded: 0, total: blob.size });

    let success = false;
    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, blob.size);
        const chunkBlob = blob.slice(start, end);

        const formData = new FormData();
        formData.append("chunk", chunkBlob);
        formData.append("ctoId", cto.id);
        formData.append("fileId", fileId);
        formData.append("fileName", fileName);
        formData.append("chunkIndex", String(chunkIndex));
        formData.append("totalChunks", String(totalChunks));

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/upload/chunk");

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const currentChunkLoaded = event.loaded;
              const overallLoaded = start + currentChunkLoaded;
              const percent = Math.min(99, Math.round((overallLoaded / blob.size) * 100));
              setUploadProgress({ percent, loaded: overallLoaded, total: blob.size });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Server error: ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error("Error de red"));
          xhr.send(formData);
        });
      }

      setUploadProgress({ percent: 100, loaded: blob.size, total: blob.size });
      success = true;
    } catch (error) {
      console.error("Fallo al subir fragmentos para", fileId, error);
      await savePendingUpload({
        fileId,
        ctoId: cto.id,
        fileName,
        blob,
        status: "failed",
        timestamp: Date.now()
      });
      await loadPendingUploads();
      alert("La subida falló debido a problemas de conexión. La imagen se ha guardado localmente en tu dispositivo. Podrás reintentar la subida en la sección de evidencias.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }

    if (success) {
      try {
        await deletePendingUpload(fileId);
        await loadPendingUploads();
        fetchCtoDetails();
        alert("Imagen capturada y subida correctamente.");
      } catch (err) {
        console.error("Error al limpiar IndexedDB:", err);
      }
    }
  };

  const handleCameraUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const fileId = `camera-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const fileName = file.name || `foto_camara_${Date.now()}.jpg`;

    setUploading(true);
    setUploadProgress({ percent: 0, loaded: 0, total: file.size });

    try {
      const canvasQuality = uploadConfig.imageQuality / 100; 
      const compressedBlob = await compressImageClientSide(file, uploadConfig.imageMaxWidth, canvasQuality);

      await savePendingUpload({
        fileId,
        ctoId: cto.id,
        fileName,
        blob: compressedBlob,
        status: "pending",
        timestamp: Date.now()
      });

      await loadPendingUploads();
      await uploadInChunks(fileId, fileName, compressedBlob);
    } catch (err: any) {
      console.error("Error en captura/subida de cámara:", err);
      alert(`Error al procesar la imagen de la cámara: ${err.message || String(err)}`);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleRetryUpload = async (pendingItem: any) => {
    await uploadInChunks(pendingItem.fileId, pendingItem.fileName, pendingItem.blob);
  };

  const handleDiscardPending = async (fileId: string) => {
    if (confirm("¿Estás seguro de que deseas descartar esta foto pendiente de subida?")) {
      await deletePendingUpload(fileId);
      await loadPendingUploads();
    }
  };

  // Reintento automático de fotos pendientes al recuperar conexión a internet
  useEffect(() => {
    const handleOnline = async () => {
      if (pendingUploads && pendingUploads.length > 0) {
        for (const item of pendingUploads) {
          try {
            await uploadInChunks(item.fileId, item.fileName, item.blob);
          } catch (e) {}
        }
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [pendingUploads]);

  useEffect(() => {
    try {
      router.prefetch("/photo-guide");
    } catch (e) {}
  }, [router]);

  useEffect(() => {
    if (cto) {
      fetchCtoDetails();
      fetchOptions();
      loadPendingUploads();
      setShowFiberDetails(false); // Reset on cto change
      setShowGallery(false);
      setActiveImgIndex(null);
    } else {
      setDetails(null);
    }
  }, [cto, fetchCtoDetails, fetchOptions, loadPendingUploads]);

  if (!cto) return null;

  const saveCto = async (targetStatus: string, targetAssignedToId: string | null, extraData: any = {}) => {
    setSaving(true);
    try {
      // Captura silenciosa y rápida de GPS en segundo plano
      const autoGps = extraData.location !== undefined ? extraData.location : (await getQuickGpsLocation());

      // Formatear divisores y sincronizar con formDataJson y potenciaDbm (máximo 6)
      const formattedSplitters = drawerSplitters.slice(0, 6).map(s => {
        const clean = s.signal.trim().replace(/^-+/, "");
        return { signal: clean ? `-${clean}` : "" };
      });
      const firstValidSignal = formattedSplitters.find(s => s.signal !== "")?.signal;
      const primaryPotencia = firstValidSignal
        ? parseFloat(firstValidSignal)
        : (potenciaDbm !== "" ? parseFloat(String(potenciaDbm)) : null);

      let mergedFormDataJson = extraData.formDataJson !== undefined ? extraData.formDataJson : details?.formDataJson;
      try {
        const prevForm = mergedFormDataJson ? JSON.parse(mergedFormDataJson) : {};
        prevForm.splitters = formattedSplitters.length > 0 ? formattedSplitters : [{ signal: "" }];
        mergedFormDataJson = JSON.stringify(prevForm);
      } catch (e) {}

      const res = await fetch(`/api/ctos/${cto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: targetStatus,
          subStatusId: subStatusId || null,
          assignedToId: targetAssignedToId || null,
          auditedById: canEditAudit ? (auditedById || null) : undefined,
          auditDateTime: canEditAudit && auditDateTime ? auditDateTime : undefined,
          notas,
          commentText,
          location: autoGps,
          puertosTotal: puertosTotal !== "" ? parseInt(String(puertosTotal)) : null,
          puertosOcupados: puertosOcupados !== "" ? parseInt(String(puertosOcupados)) : null,
          potenciaDbm: primaryPotencia,
          formDataJson: mergedFormDataJson,
          cierreSeguridad: true,
          etiquetadoCorrecto: true,
          zona: zona || null,
          cluster: cluster || null,
          category: isProgramada ? "PROGRAMADA" : "AUDITORIA",
          hasFormulario,
          hasDrive,
          hasAntala,
          ...extraData
        }),
      });

      if (res.ok) {
        setCommentText(""); // Reset comment field
        const updated = await res.json();
        
        // Buscamos si hay substatus asociado en la lista local para enviarle el objeto completo al mapa
        const sub = subStatuses.find(s => s.id === subStatusId);
        const assigned = users.find(u => u.id === targetAssignedToId);
        
        const fullUpdatedCto = {
          ...cto,
          status: targetStatus,
          subStatusId: subStatusId || null,
          subStatus: sub || null,
          assignedToId: targetAssignedToId || null,
          assignedTo: assigned || null,
          notas,
          puertosTotal: puertosTotal !== "" ? parseInt(String(puertosTotal)) : null,
          puertosOcupados: puertosOcupados !== "" ? parseInt(String(puertosOcupados)) : null,
          potenciaDbm: potenciaDbm !== "" ? parseFloat(String(potenciaDbm)) : null,
          cierreSeguridad: true,
          etiquetadoCorrecto: true,
          zona: zona || null,
          cluster: cluster || null,
          category: isProgramada ? "PROGRAMADA" : "AUDITORIA",
          hasFormulario: extraData.hasFormulario !== undefined ? extraData.hasFormulario : hasFormulario,
          hasDrive: extraData.hasDrive !== undefined ? extraData.hasDrive : hasDrive,
          hasAntala: extraData.hasAntala !== undefined ? extraData.hasAntala : hasAntala,
        };

        onUpdate(fullUpdatedCto);
        fetchCtoDetails(); // Refrescar detalles de comentarios/historial
        
        // Enviar ubicación en vivo del técnico de inmediato al guardar o modificar una caja
        sendLiveTechLocation(`Guardado CTO ${cto.num}`);

        alert("CTO guardada correctamente");
      } else {
        alert("Error al guardar los cambios");
      }
    } catch (err) {
      console.error(err);
      alert("Error en el servidor");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "CORRECTO" && powerAuditAlerts.hasAnyAnomaly) {
      const msgs = [];
      if (powerAuditAlerts.hasWlMismatch) {
        msgs.push(`- Longitud de onda distinta a normativa (${powerAuditAlerts.wlDetails?.detected} nm vs ${powerAuditAlerts.wlDetails?.expected || "1490"} nm)`);
      }
      if (powerAuditAlerts.hasPowerOutOfRange) {
        msgs.push(`- Señal anómala fuera de rango / Lo (${powerAuditAlerts.outOfRangePowerValues.join(", ")})`);
      }
      const confirmProceed = confirm(
        `⚠️ ADVERTENCIA DE AUDITORÍA:\n\nSe han detectado las siguientes alertas en la medición de potencia:\n${msgs.join("\n")}\n\nRecuerda haber ajustado el subestado si corresponde.\n\n¿Confirmas que deseas guardar como CORRECTO?`
      );
      if (!confirmProceed) return;
    }
    await saveCto(status, assignedToId);
  };

  const handleCerrarYGuardar = () => {
    setCheckFormulario(hasFormulario);
    setCheckDrive(hasDrive);
    setCheckAntala(hasAntala);
    setConfirmConformidadAnomalia(false);
    setShowChecklistModal(true);
  };

  const handleConfirmChecklist = async () => {
    // Si hay anomalía en fotos de potencia, es obligatorio el checkbox de conformidad
    if (powerAuditAlerts.hasAnyAnomaly && !confirmConformidadAnomalia) {
      alert("⚠️ Debes marcar la casilla de confirmación y conformidad con la medición de potencia/frecuencia para poder cerrar como CORRECTO.");
      return;
    }

    const currentUserId = (session?.user as any)?.id;
    const auditorName = session?.user?.name || session?.user?.email || "Auditor";
    const activeSubStatus = subStatuses.find(s => s.id === subStatusId);
    const isEnConstruccion = activeSubStatus?.name?.trim().toUpperCase() === "EN CONSTRUCCIÓN" || activeSubStatus?.name?.trim().toUpperCase() === "EN CONSTRUCCION";

    // Validar fotos mínimas
    const imgs = details?.images || [];
    const hasEntorno = imgs.some((i: any) => (i.url || "").toLowerCase().includes("entorno"));
    const hasAbierta = imgs.some((i: any) => (i.url || "").toLowerCase().includes("abierta"));
    const hasEtqCto = imgs.some((i: any) => {
      const u = (i.url || "").toLowerCase();
      return u.includes("etiquetado_cto") || (u.includes("etiquetado") && !u.includes("cableado"));
    });
    const hasEtqCab = imgs.some((i: any) => (i.url || "").toLowerCase().includes("cableado"));
    const hasPot = imgs.some((i: any) => (i.url || "").toLowerCase().includes("potencia"));
    
    const missingPhotos: string[] = [];
    if (!hasEntorno) missingPhotos.push("Foto entorno");
    if (!hasAbierta) missingPhotos.push("CTO abierta");
    if (!hasEtqCto) missingPhotos.push("Etiquetado CTO");
    if (!hasEtqCab) missingPhotos.push("Etiquetado cableado");
    if (!hasPot) missingPhotos.push("Medición potencia");

    let auditLogAction = `Auditada y cerrada como CORRECTO por ${auditorName}`;
    if (missingPhotos.length > 0) {
      auditLogAction = `⚠️ Auditada con FOTOS FALTANTES (${missingPhotos.join(", ")}) por ${auditorName}`;
    }
    if (powerAuditAlerts.hasWlMismatch) {
      auditLogAction += ` [Frecuencia ${powerAuditAlerts.wlDetails?.detected}nm confirmada]`;
    }
    if (powerAuditAlerts.hasPowerOutOfRange) {
      auditLogAction += ` [Potencia anómala ${powerAuditAlerts.outOfRangePowerValues.join(", ")} confirmada]`;
    }

    const gpsLocation = await getQuickGpsLocation();

    const updatePayload: any = {
      status: "CORRECTO",
      assignedToId: currentUserId || assignedToId || null,
      auditedById: currentUserId || null,
      hasFormulario: checkFormulario,
      hasDrive: true, // Se marca como procesada la carpeta independiente
      hasAntala: isEnConstruccion ? checkAntala : false,
      location: gpsLocation,
      customAction: auditLogAction
    };

    setHasFormulario(checkFormulario);
    setHasDrive(true);
    setHasAntala(isEnConstruccion ? checkAntala : false);
    setStatus("CORRECTO");
    if (currentUserId) {
      setAssignedToId(currentUserId);
    }

    setShowChecklistModal(false);
    await saveCto("CORRECTO", currentUserId || assignedToId, updatePayload);
  };

  const handleRetryDrive = async () => {
    if (!cto || !cto.id) return;
    setRetryingDrive(true);
    try {
      const res = await fetch("/api/upload/retry-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ctoId: cto.id })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Sincronización completada. Se subieron ${data.uploaded} fotos a Drive.`);
        fetchCtoDetails();
      } else {
        alert(data.error || "Error al sincronizar con Drive");
      }
    } catch (e) {
      console.error(e);
      alert("Error en la conexión al intentar sincronizar.");
    } finally {
      setRetryingDrive(false);
      setShowDriveTooltip(false);
    }
  };

  // Upload pictures sequentially (file by file) with overall progress tracking
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    
    // Calcular tamaño total
    let totalSize = 0;
    for (let i = 0; i < files.length; i++) {
      totalSize += files[i].size;
    }

    setUploadProgress({ percent: 0, loaded: 0, total: totalSize });

    let loadedSoFar = 0;
    let failedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("files", file); // El backend espera "files" (Multipart Form File)
      formData.append("ctoId", cto.id);

      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/upload");

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const currentLoaded = event.loaded;
              const overallLoaded = loadedSoFar + currentLoaded;
              const percent = Math.min(99, Math.round((overallLoaded / totalSize) * 100));
              setUploadProgress({ percent, loaded: overallLoaded, total: totalSize });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              loadedSoFar += file.size;
              // Al terminar este archivo actualizamos al total subido real hasta el momento
              setUploadProgress({
                percent: Math.round((loadedSoFar / totalSize) * 100),
                loaded: loadedSoFar,
                total: totalSize
              });
              resolve();
            } else {
              reject(new Error("Error en servidor"));
            }
          };

          xhr.onerror = () => reject(new Error("Error de red"));
          xhr.send(formData);
        });
      } catch (err) {
        console.error("Fallo al subir archivo:", file.name, err);
        failedCount++;
        loadedSoFar += file.size;
      }
    }

    setUploading(false);
    setUploadProgress(null);

    if (failedCount > 0) {
      alert(`Subida completada: ${files.length - failedCount} archivos subidos con éxito, ${failedCount} fallidos.`);
    } else {
      alert(`Se han subido las ${files.length} imágenes correctamente (archivo por archivo).`);
    }
    fetchCtoDetails();
  };

  const handleRotateImage = async (imageId: string, direction: "left" | "right") => {
    try {
      const res = await fetch("/api/uploads/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId, direction })
      });
      if (res.ok) {
        setCacheKey(Date.now());
        fetchCtoDetails();
      } else {
        alert("Error al rotar la imagen");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta imagen de forma permanente?")) return;
    try {
      const res = await fetch("/api/uploads/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId })
      });
      if (res.ok) {
        alert("Imagen eliminada correctamente");
        if (activeImgIndex !== null) {
          const remaining = (details?.images || []).filter((i: any) => i.id !== imageId);
          if (remaining.length === 0) {
            setActiveImgIndex(null);
          } else {
            setActiveImgIndex(Math.max(0, activeImgIndex - 1));
          }
        }
        fetchCtoDetails();
      } else {
        alert("Error al eliminar la imagen");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleShareWhatsApp = () => {
    if (typeof window === "undefined") return;
    const shareUrl = `${window.location.origin}/?ctoId=${cto.id}`;
    const muni = cto.municipio ? ` (${cto.municipio})` : "";
    const text = `📍 *CTO ${cto.num}*${muni}\n📌 Estado: ${status}\n🔗 *Abrir en Plan Algodón:* ${shareUrl}`;
    
    // Copiar enlace al portapapeles
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).catch(() => {});
    }

    // Abrir WhatsApp con el mensaje preformateado
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, "_blank");
  };

  const openGoogleMaps = () => {
    window.open(`https://maps.google.com/?q=${cto.lat},${cto.lng}`, "_blank");
  };

  const openCtoTracker = () => {
    window.open(`https://cto-tracker.olin.es/cto/${cto.num}`, "_blank");
  };

  // Filter substatuses matching current CTO's category
  const filteredSubStatuses = subStatuses.filter(
    sub => (sub as any).category === cto.category
  );

  const displayStatus = status === "REVISADO" ? "REVISADO" : status;

  return (
    <>
      <div 
        style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", zIndex: 999 }} 
        onClick={onClose}
      />
      <div className="cto-drawer open">
        <div className="drawer-handle" />
        
        {/* Botón de cierre en esquina superior derecha */}
        <button 
          type="button"
          onClick={onClose} 
          title="Cerrar"
          style={{ 
            position: "absolute", top: "16px", right: "20px", background: "var(--border-color)", 
            border: "none", borderRadius: "50%", width: "32px", height: "32px", display: "flex", 
            alignItems: "center", justifyContent: "center", fontSize: "1.2rem", fontWeight: 700, 
            color: "var(--text-color)", cursor: "pointer", zIndex: 10 
          }}
        >
          ✕
        </button>
        
        {/* Header Rediseñado */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: "10px" }}>
          
          {/* Lado Izquierdo: Nombre de la CTO en grande + Botón Copiar + Técnico */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <h2 style={{ fontSize: "1.65rem", fontWeight: 900, color: "var(--text-color)", margin: 0, letterSpacing: "-0.5px", lineHeight: "1.1" }}>
                {cto.num}
              </h2>
              
              {/* Botón Pequeño para Copiar Nombre de la CTO */}
              <button
                type="button"
                onClick={handleCopyCtoNum}
                title={copiedCtoNum ? "¡Copiado!" : "Copiar código de CTO"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  background: copiedCtoNum ? "#10b981" : "var(--bg-color)",
                  color: copiedCtoNum ? "white" : "var(--text-color)",
                  border: "1px solid var(--border-color)",
                  cursor: "pointer",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  transition: "all 0.15s ease"
                }}
              >
                {copiedCtoNum ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "2px" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, opacity: 0.85, color: "var(--text-color)" }}>
                👤 {assignedToId ? (users.find(u => u.id === assignedToId)?.name || details?.assignedTo?.name || cto.assignedTo?.name || "Asignada") : "Sin asignar"}
              </span>
              <span style={{ fontSize: "0.72rem", background: "var(--border-color)", color: "var(--text-color)", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>
                {isProgramada ? "PROGRAMADA" : "AUDITORIA"}
              </span>
              {cto.numeroNuevo && <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>Nº Nuevo: {cto.numeroNuevo}</span>}
            </div>
          </div>
          
          {/* Lado derecho de cabecera: Subestado (con color) + Estado + Botón Compartir */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginRight: "38px" }}>
            
            {/* Badge de Subestado si existe */}
            {(() => {
              const currentSub = subStatuses.find(s => s.id === subStatusId) || cto.subStatus || details?.subStatus;
              if (!currentSub) return null;
              const subColor = currentSub.color || "var(--primary-color)";
              return (
                <span
                  style={{
                    padding: "5px 10px",
                    borderRadius: "16px",
                    fontSize: "0.74rem",
                    fontWeight: 800,
                    background: `${subColor}1A`,
                    color: subColor,
                    border: `1.5px solid ${subColor}`,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    whiteSpace: "nowrap"
                  }}
                >
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: subColor }} />
                  {currentSub.name}
                </span>
              );
            })()}

            {/* Badge de Estado General */}
            <span style={{ 
              padding: "5px 12px", 
              borderRadius: "16px", 
              fontSize: "0.78rem", 
              fontWeight: 800,
              background: displayStatus === "CORRECTO" || displayStatus === "REVISADO" ? "#d1fae5" : displayStatus === "REPARAR" ? "#ede9fe" : displayStatus === "FALLO" ? "#fee2e2" : "#fef3c7",
              color: displayStatus === "CORRECTO" || displayStatus === "REVISADO" ? "#065f46" : displayStatus === "REPARAR" ? "#6d28d9" : displayStatus === "FALLO" ? "#991b1b" : "#92400e",
              border: displayStatus === "CORRECTO" || displayStatus === "REVISADO" ? "1px solid #10b981" : displayStatus === "REPARAR" ? "1px solid #8b5cf6" : displayStatus === "FALLO" ? "1px solid #ef4444" : "1px solid #f59e0b",
              whiteSpace: "nowrap"
            }}>
              {displayStatus}
            </span>

            {/* Botón Compartir al lado */}
            <button
              type="button"
              onClick={handleShareWhatsApp}
              title="Compartir CTO / Copiar Enlace Directo"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                padding: "5px 11px",
                minHeight: "32px",
                borderRadius: "16px",
                background: "var(--card-bg)",
                color: "var(--primary-color)",
                border: "1.5px solid var(--primary-color)",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: "0.76rem",
                boxShadow: "0 2px 6px rgba(255, 121, 0, 0.12)",
                transition: "all 0.2s ease",
                whiteSpace: "nowrap"
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span>Compartir</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>Cargando información...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            
            <div style={{ padding: "1rem", background: "var(--bg-color)", borderRadius: "10px", border: "1px solid var(--border-color)", color: "var(--text-color)" }}>
              <p style={{ margin: "4px 0", fontSize: "0.9rem" }}><strong>Municipio:</strong> {cto.municipio || "N/A"}</p>
              <p style={{ margin: "4px 0", fontSize: "0.9rem" }}><strong>Colocación:</strong> {cto.colocacion || "N/A"}</p>
              <p style={{ margin: "4px 0", fontSize: "0.9rem" }}><strong>Zona:</strong> {cto.zona || "N/A"}</p>
              <p style={{ margin: "4px 0", fontSize: "0.9rem" }}><strong>Cluster:</strong> {cto.cluster || "N/A"}</p>
              {cto.olt && (
                <p style={{ margin: "4px 0", fontSize: "0.9rem" }}><strong>OLT:</strong> <span style={{ color: "var(--primary-color)", fontWeight: 700 }}>{cto.olt}</span></p>
              )}
              <p style={{ margin: "4px 0", fontSize: "0.9rem" }}><strong>Coordenadas:</strong> {cto.lat.toFixed(6)}, {cto.lng.toFixed(6)}</p>

              {/* Información de Primer Auditor y Reparador */}
              {(originalAuditLog || lastRepairLog) && (
                <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px dashed var(--border-color)", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {originalAuditLog && (
                    <div style={{ fontSize: "0.82rem", color: "var(--text-color)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>🔍 <strong>Primer auditor:</strong> {originalAuditLog.user?.name || "Técnico"}</span>
                      <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>({new Date(originalAuditLog.timestamp).toLocaleDateString("es-ES")})</span>
                    </div>
                  )}
                  {lastRepairLog && (
                    <div style={{ fontSize: "0.82rem", color: "#16a34a", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>🛠️ <strong>Reparado por:</strong> {lastRepairLog.user?.name || "Técnico"}</span>
                      <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>({new Date(lastRepairLog.timestamp).toLocaleDateString("es-ES")})</span>
                      {canEditAudit && lastRepairLog.location && (
                        <a 
                          href={`https://maps.google.com/?q=${lastRepairLog.location}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ fontSize: "0.75rem", color: "#2563eb", textDecoration: "underline" }}
                        >
                          📍 GPS
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              <div style={{ display: "flex", gap: "8px", marginTop: "0.75rem" }}>
                <button onClick={openGoogleMaps} className="btn btn-primary" style={{ flex: 1, minHeight: "34px", fontSize: "0.8rem", padding: "4px 8px" }}>
                  Google Maps
                </button>
                <button onClick={openCtoTracker} className="btn" style={{ flex: 1, minHeight: "34px", background: "#1e293b", color: "white", fontSize: "0.8rem", padding: "4px 8px" }}>
                  CTO Tracker
                </button>
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "0.5rem" }}>
                <button 
                  type="button"
                  onClick={() => setShowFormGuideModal(true)}
                  className="btn" 
                  style={{ flex: 1, minHeight: "34px", background: "#8b5cf6", color: "white", fontSize: "0.8rem", padding: "4px 8px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <span>Guía formulario</span>
                </button>
                <button 
                  type="button"
                  onClick={handleOpenFormSheet}
                  disabled={fetchingFormSheet}
                  className="btn" 
                  style={{ flex: 1, minHeight: "34px", background: "#a855f7", color: "white", fontSize: "0.8rem", padding: "4px 8px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", opacity: fetchingFormSheet ? 0.7 : 1 }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  <span>{fetchingFormSheet ? "..." : "Ficha"}</span>
                </button>
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "0.5rem" }}>
                <button 
                  type="button"
                  onClick={() => {
                    if (cto.urlFicha) {
                      window.open(cto.urlFicha, "_blank");
                    } else {
                      alert("Esta CTO no tiene enlazada ninguna ficha de UserSide.");
                    }
                  }}
                  className="btn" 
                  style={{ 
                    flex: 1, 
                    minHeight: "34px", 
                    background: cto.urlFicha ? "#22c55e" : "#94a3b8", 
                    color: "white", 
                    fontSize: "0.8rem", 
                    padding: "4px 8px", 
                    fontWeight: 700, 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    gap: "4px",
                    cursor: cto.urlFicha ? "pointer" : "not-allowed",
                    opacity: cto.urlFicha ? 1 : 0.6
                  }}
                >
                  UserSide
                </button>
                <button 
                  type="button"
                  onClick={() => window.open("https://teras.antalanae.com/cto", "_blank")}
                  className="btn" 
                  style={{ flex: 1, minHeight: "34px", background: "#3b82f6", color: "white", fontSize: "0.8rem", padding: "4px 8px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}
                >
                  Antala
                </button>
              </div>
            </div>

            {/* Formulario de Auditoría */}
            <form onSubmit={handleSave} style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--text-color)" }}>Auditar CTO</h3>
                <div style={{ display: "flex", gap: "8px" }}>
                  {/* Icono Triángulo: Configuración interactiva de Puertos de Fibra */}
                  <button
                    type="button"
                    onClick={() => setShowPortsModal(true)}
                    title="Configurar Puertos de Fibra (Libres / Ocupados)"
                    style={{
                      background: (puertosOcupados && parseInt(String(puertosOcupados)) > 0) ? "rgba(239, 68, 68, 0.15)" : "var(--border-color)",
                      color: (puertosOcupados && parseInt(String(puertosOcupados)) > 0) ? "#ef4444" : "var(--text-color)",
                      border: (puertosOcupados && parseInt(String(puertosOcupados)) > 0) ? "1.5px solid #ef4444" : "none",
                      borderRadius: "8px",
                      width: "38px",
                      height: "38px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 19.5h20L12 2z" />
                      <path d="M2 19.5h20" />
                      <path d="M15.5 8.5L22 19.5" />
                      <path d="M8.5 8.5L2 19.5" />
                    </svg>
                  </button>

                  {/* Icono Panel Visual de Puertos */}
                  <button
                    type="button"
                    onClick={() => setShowVisualPortsViewer(true)}
                    title="Ver Panel Visual de Puertos (CTO Virtual)"
                    style={{
                      background: "rgba(59, 130, 246, 0.15)",
                      color: "#3b82f6",
                      border: "1.5px solid #3b82f6",
                      borderRadius: "8px",
                      width: "38px",
                      height: "38px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                      <circle cx="7" cy="10" r="1.5" fill="#10b981" />
                      <circle cx="12" cy="10" r="1.5" fill="#ef4444" />
                      <circle cx="17" cy="10" r="1.5" fill="#f59e0b" />
                    </svg>
                  </button>

                  {/* Botón Info (i de Iconoir) */}
                  <button
                    type="button"
                    onClick={() => setShowFiberDetails(!showFiberDetails)}
                    title="Ver detalles de fibra"
                    style={{
                      background: showFiberDetails ? "var(--primary-color)" : "var(--border-color)",
                      color: showFiberDetails ? "white" : "var(--text-color)",
                      border: "none",
                      borderRadius: "8px",
                      width: "38px",
                      height: "38px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </button>
                  
                  {/* Botón Comentarios (Burbuja de diálogo de Iconoir) */}
                  <button
                    type="button"
                    onClick={() => setShowCommentsModal(true)}
                    title="Seguimiento de Comentarios e Historial"
                    style={{
                      background: "var(--border-color)",
                      color: "var(--text-color)",
                      border: "none",
                      borderRadius: "8px",
                      width: "38px",
                      height: "38px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "1rem" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-color)" }}>Estado General</label>
                  <select 
                    className="input-field" 
                    value={status} 
                    onChange={e => {
                      setStatus(e.target.value);
                      if (e.target.value === "PENDIENTE") setSubStatusId("");
                    }}
                    style={{ padding: "8px 12px", minHeight: "44px", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)" }}
                  >
                    {isProgramada ? (
                      <>
                        <option value="PENDIENTE">PENDIENTE</option>
                        <option value="REVISADO">REVISADO</option>
                        <option value="REPARAR">REPARAR</option>
                        <option value="FALLO">FALLO</option>
                      </>
                    ) : (
                      <>
                        <option value="PENDIENTE">PENDIENTE</option>
                        <option value="CORRECTO">CORRECTO</option>
                        <option value="REPARAR">REPARAR</option>
                        <option value="FALLO">FALLO</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-color)" }}>Subestado</label>
                  <select 
                    className="input-field" 
                    value={subStatusId} 
                    onChange={e => setSubStatusId(e.target.value)}
                    disabled={status === "PENDIENTE"}
                    style={{ padding: "8px 12px", minHeight: "44px", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)" }}
                  >
                    <option value="">Ninguno</option>
                    {filteredSubStatuses.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Banner de aviso de Subestado por Potencia Anómala o Frecuencia Diferente */}
              {powerAuditAlerts.hasPowerOutOfRange && (
                <div style={{
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1.5px solid #ef4444",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px"
                }}>
                  <span style={{ fontSize: "1.3rem", lineHeight: 1 }}>⚠️</span>
                  <div style={{ fontSize: "0.82rem", color: "#f87171", lineHeight: 1.4 }}>
                    <strong style={{ color: "#ef4444", display: "block", marginBottom: "2px" }}>
                      ¡Atención! Señal anómala detectada ({powerAuditAlerts.outOfRangePowerValues.join(", ")}):
                    </strong>
                    Recuerda cambiar el <strong>subestado</strong> de la CTO para reflejar la avería o causa de baja señal antes de continuar.
                  </div>
                </div>
              )}

              {powerAuditAlerts.hasWlMismatch && !powerAuditAlerts.hasPowerOutOfRange && (
                <div style={{
                  background: "rgba(245, 158, 11, 0.12)",
                  border: "1.5px solid #f59e0b",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px"
                }}>
                  <span style={{ fontSize: "1.3rem", lineHeight: 1 }}>⚠️</span>
                  <div style={{ fontSize: "0.82rem", color: "#fbbf24", lineHeight: 1.4 }}>
                    <strong style={{ color: "#f59e0b", display: "block", marginBottom: "2px" }}>
                      Frecuencia distinta detectada ({powerAuditAlerts.wlDetails?.detected} nm en vez de {powerAuditAlerts.wlDetails?.expected || "1490"} nm):
                    </strong>
                    Recuerda verificar si corresponde cambiar el subestado de la CTO.
                  </div>
                </div>
              )}

              {/* Nuevos Datos de Fibra (Bajo botón i) */}
              {showFiberDetails && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "1rem", background: "var(--bg-color)", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                  {/* Divisores y Señal de Potencia (OCR / Entrada sin signo menos) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--card-bg)", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-color)", display: "flex", alignItems: "center", gap: "6px" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                        Señal de Divisores (dBm)
                      </label>
                      {drawerSplitters.length < 6 && (
                        <button
                          type="button"
                          onClick={handleAddDrawerSplitter}
                          style={{ background: "transparent", border: "1px solid var(--primary-color)", color: "var(--primary-color)", borderRadius: "6px", padding: "2px 8px", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                        >
                          + Agregar divisor
                        </button>
                      )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {drawerSplitters.map((s, sIdx) => (
                        <div key={sIdx} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "0.8rem", minWidth: "68px", fontWeight: 700, color: "#94a3b8" }}>
                            Divisor {sIdx + 1}:
                          </span>
                          <div style={{ position: "relative", flex: 1 }}>
                            <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontWeight: 700, fontSize: "0.9rem" }}>-</span>
                            <input 
                              type="text" 
                              inputMode="decimal"
                              className="input-field" 
                              value={s.signal} 
                              onChange={e => handleUpdateDrawerSplitter(sIdx, e.target.value)}
                              placeholder="19.50"
                              style={{ padding: "6px 10px 6px 22px", minHeight: "36px", fontSize: "0.85rem", background: "var(--bg-color)", color: "var(--text-color)", border: "1.5px solid var(--border-color)", width: "100%" }}
                            />
                          </div>
                          {s.isOcr && (
                            <span style={{ fontSize: "0.68rem", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "3px 6px", borderRadius: "4px", fontWeight: 700 }}>
                              OCR
                            </span>
                          )}
                          {drawerSplitters.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveDrawerSplitter(sIdx)}
                              style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}
                              title="Eliminar divisor"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-color)" }}>Zona</label>
                      <input 
                        type="text" 
                        className="input-field" 
                        value={zona} 
                        onChange={e => setZona(e.target.value)}
                        placeholder="Ej: Zona A"
                        style={{ padding: "6px 10px", minHeight: "38px", fontSize: "0.85rem", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-color)" }}>Cluster</label>
                      <input 
                        type="text" 
                        className="input-field" 
                        value={cluster} 
                        onChange={e => setCluster(e.target.value)}
                        placeholder="Ej: Cluster 1"
                        style={{ padding: "6px 10px", minHeight: "38px", fontSize: "0.85rem", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)" }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {canEditAudit && (
                <div style={{ marginBottom: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-color)" }}>Asignar Técnico</label>
                    <select 
                      className="input-field" 
                      value={assignedToId} 
                      onChange={e => setAssignedToId(e.target.value)}
                      style={{ padding: "8px 12px", minHeight: "44px", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)", width: "100%" }}
                    >
                      <option value="">Sin asignar</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name || u.email}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-color)" }}>Auditado Por</label>
                    <select 
                      className="input-field" 
                      value={auditedById} 
                      onChange={e => setAuditedById(e.target.value)}
                      style={{ padding: "8px 12px", minHeight: "44px", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)", width: "100%" }}
                    >
                      <option value="">Sin auditor</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name || u.email}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {canEditAudit && (
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-color)" }}>Fecha y Hora de Auditoría</label>
                  <input 
                    type="datetime-local" 
                    className="input-field"
                    value={auditDateTime}
                    onChange={e => setAuditDateTime(e.target.value)}
                    style={{ padding: "8px 12px", minHeight: "44px", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)", width: "100%" }}
                  />
                </div>
              )}

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-color)" }}>Notas Generales (Persistente)</label>
                <textarea 
                  className="input-field" 
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="Notas internas sobre esta CTO..." 
                  style={{ minHeight: "60px", padding: "8px 12px", resize: "vertical", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)" }}
                />
              </div>

              {/* Botón de Guía Fotográfica ubicado justo antes de Evidencias Fotográficas */}
              <div style={{ marginBottom: "1rem" }}>
                <button 
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.setItem(`cto_cache_${cto.id}`, JSON.stringify(cto));
                    } catch (e) {}
                    // Navegación SPA interna: Si está sin cobertura, carga al instante desde memoria sin peticiones de red
                    router.push(`/photo-guide?ctoId=${cto.id}&num=${encodeURIComponent(cto.num || "")}`);
                  }}
                  className="btn" 
                  style={{ 
                    width: "100%", 
                    minHeight: "38px", 
                    background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)", 
                    color: "white", 
                    fontSize: "0.85rem", 
                    padding: "8px 14px", 
                    fontWeight: 800, 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    gap: "8px", 
                    borderRadius: "8px",
                    boxShadow: "0 2px 6px rgba(2,132,199,0.25)",
                    border: "none",
                    cursor: "pointer"
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span>Guía Fotográfica de Instalación</span>
                </button>
              </div>

              {/* Subida de Fotos */}
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-color)" }}>Evidencias Fotográficas</label>
                <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "8px", marginBottom: "8px" }}>
                  {details?.images && details.images.length > 0 ? (
                    details.images.map((img: any, idx: number) => (
                      <div 
                        key={img.id} 
                        onClick={() => {
                          setZoomScale(1);
                          setShowGallery(true);
                          setActiveImgIndex(idx);
                        }} 
                        style={{ flexShrink: 0, position: "relative", cursor: "pointer" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={`${img.url}?t=${cacheKey}`} 
                          alt="Evidencia" 
                          style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--border-color)" }} 
                        />
                      </div>
                    ))
                  ) : (
                    <p style={{ color: "var(--text-color)", opacity: 0.7, fontSize: "0.85rem", fontStyle: "italic", margin: "10px 0" }}>No hay fotos registradas</p>
                  )}
                </div>

                {pendingUploads.length > 0 && (
                  <div style={{ marginBottom: "12px", border: "1px dashed #f59e0b", borderRadius: "8px", padding: "8px", background: "rgba(245, 158, 11, 0.05)" }}>
                    <p style={{ margin: "0 0 6px 0", fontSize: "0.78rem", fontWeight: 700, color: "#d97706", display: "flex", alignItems: "center", gap: "4px" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      Fotos pendientes de subir ({pendingUploads.length})
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {pendingUploads.map((item) => {
                        const previewUrl = URL.createObjectURL(item.blob);
                        return (
                          <div key={item.fileId} style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--card-bg)", padding: "4px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={previewUrl} alt="Preview" style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px" }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-color)" }}>
                                {item.fileName}
                              </p>
                              <span style={{ fontSize: "0.65rem", color: item.status === "failed" ? "#ef4444" : "#6b7280" }}>
                                {item.status === "failed" ? "Fallo de conexión" : "Esperando subida..."}
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button
                                type="button"
                                onClick={() => handleRetryUpload(item)}
                                className="btn"
                                disabled={uploading}
                                style={{
                                  padding: "3px 8px", fontSize: "0.7rem", minHeight: "24px",
                                  background: "var(--primary-color)", color: "#fff", border: "none"
                                }}
                              >
                                Reintentar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDiscardPending(item.fileId)}
                                className="btn"
                                disabled={uploading}
                                style={{
                                  padding: "3px 8px", fontSize: "0.7rem", minHeight: "24px",
                                  background: "#ef4444", color: "#fff", border: "none"
                                }}
                              >
                                Descartar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {/* Botón 1: Cámara con icono y texto claro "Cámara" */}
                  <label 
                    className="btn" 
                    style={{ 
                      flex: "1 1 110px", 
                      minHeight: "42px", 
                      padding: "6px 12px",
                      background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)", 
                      color: "white", 
                      border: "none", 
                      cursor: "pointer", 
                      display: "inline-flex", 
                      justifyContent: "center", 
                      alignItems: "center",
                      gap: "6px",
                      borderRadius: "8px",
                      fontWeight: 800,
                      fontSize: "0.85rem",
                      boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)"
                    }}
                    title="Tomar Foto directamente con la Cámara"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span>{uploading ? "Subiendo..." : "Cámara"}</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment" 
                      disabled={uploading}
                      style={{ display: "none" }} 
                      onChange={handleCameraUpload} 
                    />
                  </label>

                  {/* Botón 2: Subir Fotos */}
                  <label 
                    className="btn" 
                    style={{ 
                      flex: "1.3 1 130px", 
                      background: "var(--bg-color)", 
                      color: "var(--text-color)", 
                      border: "1.5px solid var(--border-color)", 
                      cursor: "pointer", 
                      display: "inline-flex", 
                      minHeight: "42px", 
                      padding: "6px 12px", 
                      fontSize: "0.85rem", 
                      fontWeight: 700,
                      justifyContent: "center", 
                      alignItems: "center",
                      borderRadius: "8px",
                      gap: "6px"
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>{uploading ? "Subiendo..." : "Subir Fotos"}</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple 
                      disabled={uploading}
                      style={{ display: "none" }} 
                      onChange={handleImageUpload} 
                    />
                  </label>

                  {/* Botón 3: Galería */}
                  <button
                    type="button"
                    onClick={() => setShowGallery(true)}
                    className="btn"
                    style={{
                      flex: "1 1 100px", 
                      background: "var(--border-color)", 
                      color: "var(--text-color)",
                      border: "none", 
                      borderRadius: "8px", 
                      minHeight: "42px", 
                      padding: "6px 12px",
                      fontSize: "0.85rem", 
                      fontWeight: 700,
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      gap: "6px", 
                      cursor: "pointer"
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                    <span>Galería ({details?.images?.length || 0})</span>
                  </button>
                </div>
              </div>

              {/* Escribir Comentario rápido */}
              <div style={{ borderTop: "1px dashed var(--border-color)", paddingTop: "1rem", marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-color)" }}>Añadir Comentario rápido al Historial</label>
                <textarea 
                  className="input-field" 
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Escribe comentarios de la visita..." 
                  style={{ minHeight: "50px", padding: "8px 12px", resize: "vertical", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)" }}
                />
              </div>

              {/* Checkbox Reparos (Comentado temporalmente) */}
              {/* <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <input 
                  type="checkbox" 
                  id="isProgramadaCheckbox"
                  checked={isProgramada} 
                  onChange={e => setIsProgramada(e.target.checked)} 
                  style={{ width: "18px", height: "18px", accentColor: "var(--primary-color)", cursor: "pointer" }}
                />
                <label htmlFor="isProgramadaCheckbox" style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-color)", cursor: "pointer" }}>
                  Reparos (Trabajo de reparación / avería)
                </label>
              </div> */}

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button type="button" onClick={onClose} className="btn" style={{ flex: 1, background: "var(--border-color)", color: "var(--text-color)" }}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                      {saving ? "Guardando..." : "Guardar Cambios"}
                    </span>
                  </button>
                </div>
                <button 
                  type="button" 
                  onClick={handleCerrarYGuardar} 
                  className="btn" 
                  disabled={saving}
                  style={{ 
                    width: "100%", 
                    background: "#10b981", 
                    color: "white", 
                    fontWeight: 700, 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    gap: "6px",
                    minHeight: "44px"
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  {saving ? "Guardando..." : "Cerrar y Guardar (Marcar Correcto)"}
                </button>

                {/* Botón Marc. Reparo CTO debajo de Cerrar y Guardar (Comentado temporalmente) */}
                {/* <button 
                  type="button"
                  onClick={handleMarcarReparo}
                  disabled={markingReparo}
                  className="btn" 
                  style={{ 
                    width: "100%", 
                    minHeight: "42px", 
                    marginTop: "8px",
                    background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", 
                    color: "white", 
                    fontSize: "0.88rem", 
                    padding: "8px 12px", 
                    fontWeight: 800, 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    gap: "8px",
                    borderRadius: "8px",
                    boxShadow: "0 2px 6px rgba(217, 119, 6, 0.25)",
                    opacity: markingReparo ? 0.7 : 1,
                    cursor: markingReparo ? "wait" : "pointer"
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                  {markingReparo ? "Registrando Reparación..." : "Marc. Reparo CTO"}
                </button> */}
              </div>

              {/* COMENTARIO RÁPIDO Y MURO AL FINAL */}
              <div style={{ borderTop: "1px dashed var(--border-color)", paddingTop: "1rem", marginTop: "1.5rem" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-color)" }}>
                  Añadir Comentario rápido al Historial:
                </label>
                <textarea 
                  className="input-field" 
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Escribe comentarios de la visita..." 
                  style={{ minHeight: "50px", padding: "8px 12px", resize: "vertical", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)" }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!commentText.trim()) return;
                      setSaving(true);
                      try {
                        const res = await fetch(`/api/ctos/${cto.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ commentText }),
                        });
                        if (res.ok) {
                          setCommentText("");
                          fetchCtoDetails();
                        } else {
                          alert("Error al guardar el comentario");
                        }
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="btn btn-primary"
                    style={{ minHeight: "32px", padding: "4px 12px", fontSize: "0.8rem", width: "auto" }}
                    disabled={saving || !commentText.trim()}
                  >
                    {saving ? "Guardando..." : "Comentar"}
                  </button>
                </div>
              </div>

              {/* Muro de Comentarios integrado */}
              <div style={{ background: "var(--card-bg)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", marginTop: "1rem" }}>
                <h3 style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "8px", color: "var(--text-color)" }}>
                  Muro de Comentarios ({details?.comments?.length || 0})
                </h3>
                {details?.comments && details.comments.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "200px", overflowY: "auto", paddingRight: "4px" }}>
                    {details.comments.map((comm: any) => (
                      <div key={comm.id} style={{ background: "var(--bg-color)", padding: "8px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-color)", opacity: 0.7, marginBottom: "4px" }}>
                          <strong style={{ color: comm.user?.color || "inherit" }}>{comm.user?.name || "Técnico"}</strong>
                          <span>{new Date(comm.createdAt).toLocaleString()}</span>
                        </div>
                        <p style={{ fontSize: "0.8rem", margin: 0, color: "var(--text-color)", whiteSpace: "pre-wrap" }}>{comm.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--text-color)", opacity: 0.7, fontSize: "0.8rem", fontStyle: "italic", margin: 0 }}>
                    No hay comentarios registrados
                  </p>
                )}
              </div>

              {/* Historial de Cambios integrado */}
              <div style={{ background: "var(--card-bg)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", marginTop: "1rem", marginBottom: "1.5rem" }}>
                <h3 style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "8px", color: "var(--text-color)" }}>
                  Historial de Cambios ({details?.history?.length || 0})
                </h3>
                {details?.history && details.history.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "150px", overflowY: "auto", paddingRight: "4px" }}>
                    {details.history.map((hist: any) => (
                      <div key={hist.id} style={{ fontSize: "0.75rem", color: "var(--text-color)", opacity: 0.8, display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border-color)", paddingBottom: "4px" }}>
                        <span><strong>{hist.user?.name || "Sistema"}:</strong> {hist.action}</span>
                        <span style={{ fontSize: "0.7rem", flexShrink: 0, marginLeft: "10px" }}>
                          {new Date(hist.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--text-color)", opacity: 0.7, fontSize: "0.8rem", fontStyle: "italic", margin: 0 }}>
                    No hay historial registrado
                  </p>
                )}
              </div>
            </form>

          </div>
        )}
      </div>

      {/* MODAL DE COMENTARIOS A PANTALLA COMPLETA */}
      {showCommentsModal && (
        <div style={{ position: "fixed", inset: 0, background: "var(--bg-color)", zIndex: 3000, display: "flex", flexDirection: "column", padding: "16px", overflow: "hidden" }}>
          
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--text-color)", display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--primary-color)" }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Comentarios e Historial - CTO {cto.num}
            </h2>
            <button
              type="button"
              onClick={() => setShowCommentsModal(false)}
              className="btn"
              style={{
                minHeight: "36px", padding: "6px 12px", background: "var(--border-color)", color: "var(--text-color)",
                borderRadius: "8px", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center"
              }}
            >
              ✕ Cerrar
            </button>
          </div>

          <div className="scrollable-content" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto", paddingBottom: "24px" }}>
            {/* Sección Escribir nuevo comentario */}
            <div style={{ background: "var(--card-bg)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem", fontWeight: 600, color: "var(--text-color)" }}>
                Añadir nuevo comentario:
              </label>
              <textarea
                className="input-field"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Escribe comentarios sobre esta visita o estado de la CTO..."
                style={{ minHeight: "100px", padding: "12px", resize: "vertical", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)", marginBottom: "10px" }}
              />
              <button
                type="button"
                onClick={async () => {
                  if (!commentText.trim()) return;
                  setSaving(true);
                  try {
                    const res = await fetch(`/api/ctos/${cto.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ commentText }),
                    });
                    if (res.ok) {
                      setCommentText("");
                      fetchCtoDetails();
                    } else {
                      alert("Error al guardar el comentario");
                    }
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setSaving(false);
                  }
                }}
                className="btn btn-primary"
                style={{ width: "100%", minHeight: "44px" }}
                disabled={saving || !commentText.trim()}
              >
                {saving ? "Guardando..." : "Enviar Comentario"}
              </button>
            </div>

            {/* Muro de Comentarios */}
            <div style={{ background: "var(--card-bg)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "12px", color: "var(--text-color)" }}>
                Muro de Comentarios ({details?.comments?.length || 0})
              </h3>
              {details?.comments && details.comments.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {details.comments.map((comm: any) => (
                    <div key={comm.id} style={{ background: "var(--bg-color)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-color)", opacity: 0.7, marginBottom: "6px" }}>
                        <strong style={{ color: comm.user?.color || "inherit" }}>{comm.user?.name || "Técnico"}</strong>
                        <span>{new Date(comm.createdAt).toLocaleString()}</span>
                      </div>
                      <p style={{ fontSize: "0.88rem", margin: 0, color: "var(--text-color)", whiteSpace: "pre-wrap" }}>{comm.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--text-color)", opacity: 0.7, fontSize: "0.85rem", fontStyle: "italic", margin: 0 }}>
                  No hay comentarios registrados
                </p>
              )}
            </div>

            {/* Historial de Cambios */}
            <div style={{ background: "var(--card-bg)", padding: "16px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "12px", color: "var(--text-color)" }}>
                Historial de Cambios ({details?.history?.length || 0})
              </h3>
              {details?.history && details.history.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {details.history.map((hist: any) => (
                    <div key={hist.id} style={{ fontSize: "0.8rem", color: "var(--text-color)", opacity: 0.8, display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border-color)", paddingBottom: "6px" }}>
                      <span>
                        <strong>{hist.user?.name || "Sistema"}:</strong> {hist.action}
                        {canEditAudit && hist.location && (
                          <a 
                            href={`https://maps.google.com/?q=${hist.location}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ marginLeft: "6px", fontSize: "0.72rem", color: "#2563eb", textDecoration: "underline" }}
                          >
                            📍 GPS ({hist.location})
                          </a>
                        )}
                      </span>
                      <span style={{ fontSize: "0.75rem", flexShrink: 0, marginLeft: "10px" }}>
                        {new Date(hist.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--text-color)", opacity: 0.7, fontSize: "0.85rem", fontStyle: "italic", margin: 0 }}>
                  No hay historial registrado
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {/* POPUP DE PROGRESO DE SUBIDA */}
      {uploadProgress !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div className="glass-panel" style={{ width: "90%", maxWidth: "320px", padding: "1.5rem", background: "var(--card-bg)", textAlign: "center" }}>
            <h4 style={{ margin: "0 0 10px 0", color: "var(--text-color)" }}>Subiendo Evidencias...</h4>
            <div style={{ background: "var(--border-color)", height: "8px", borderRadius: "4px", width: "100%", overflow: "hidden", marginBottom: "8px" }}>
              <div style={{ background: "var(--primary-color)", height: "100%", width: `${uploadProgress.percent}%`, transition: "width 0.1s" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-color)" }}>{uploadProgress.percent}%</span>
              <span style={{ fontSize: "0.72rem", color: "var(--text-color)", opacity: 0.8 }}>
                {(uploadProgress.loaded / (1024 * 1024)).toFixed(2)} MB de {(uploadProgress.total / (1024 * 1024)).toFixed(2)} MB
              </span>
              <span style={{ fontSize: "0.68rem", color: "var(--text-color)", opacity: 0.6 }}>
                Faltan: {Math.max(0, (uploadProgress.total - uploadProgress.loaded) / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE LA GALERÍA COMPLETA */}
      {showGallery && (
        <div style={{ position: "fixed", inset: 0, background: "var(--bg-color)", zIndex: 2999, display: "flex", flexDirection: "column", padding: "16px", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px", marginBottom: "16px" }}>
            {/* Fila superior: Título y Cerrar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <h2 style={{ fontSize: "0.85rem", fontWeight: 700, margin: 0, color: "var(--text-color)", display: "flex", alignItems: "center", gap: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--primary-color)", flexShrink: 0 }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", fontSize: "0.85rem" }}>
                  CTO {cto.num}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setShowGallery(false)}
                className="btn"
                style={{
                  minHeight: "30px", padding: "4px 10px", background: "var(--border-color)", color: "var(--text-color)",
                  borderRadius: "6px", cursor: "pointer", fontWeight: 700, fontSize: "0.8rem", border: "none", flexShrink: 0
                }}
              >
                ✕ Cerrar
              </button>
            </div>
            
            {/* Fila inferior: Botones de Descarga */}
            {details?.images && details.images.length > 0 && (
              <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                <button
                  type="button"
                  onClick={() => {
                    window.open(`/api/admin/evidencia/download-cto?ctoId=${cto.id}`, "_blank");
                  }}
                  className="btn btn-primary"
                  style={{
                    flex: 1, minHeight: "32px", padding: "4px 8px", background: "var(--primary-color, #FF7900)", color: "white",
                    borderRadius: "6px", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", fontSize: "0.75rem", border: "none"
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Descargar todo (.zip)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    for (const img of details.images) {
                      try {
                        const res = await fetch(img.url);
                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        const filename = img.url.split("/").pop() || "evidencia.jpg";
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(url);
                        await new Promise(resolve => setTimeout(resolve, 150));
                      } catch (err) {
                        console.error("Error al descargar individual:", err);
                      }
                    }
                  }}
                  className="btn"
                  style={{
                    flex: 1, minHeight: "32px", padding: "4px 8px", background: "#0ea5e9", color: "white",
                    borderRadius: "6px", cursor: "pointer", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", fontSize: "0.75rem", border: "none"
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Descargar sueltas
                </button>
              </div>
            )}
          </div>

          {/* Grid de imágenes */}
          <div className="scrollable-content" style={{ flex: 1, overflowY: "auto" }}>
            {details?.images && details.images.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "10px", paddingBottom: "20px" }}>
                {details.images.map((img: any, idx: number) => (
                  <div
                    key={img.id}
                    onClick={() => {
                      setZoomScale(1);
                      setActiveImgIndex(idx);
                    }}
                    style={{ position: "relative", cursor: "pointer", borderRadius: "8px", overflow: "hidden", border: "1.5px solid var(--border-color)", aspectRatio: "1/1" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${img.url}?t=${cacheKey}`}
                      alt={`Evidencia ${idx}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-color)", opacity: 0.7 }}>
                <p style={{ fontStyle: "italic" }}>No hay fotos registradas para esta CTO.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VISOR LIGHTBOX DE IMAGEN A PANTALLA COMPLETA (MEJORADO EN ALTA DEFINICIÓN) */}
      {activeImgIndex !== null && details?.images && details.images[activeImgIndex] && (
        <div 
          style={{ 
            position: "fixed", 
            inset: 0, 
            background: "rgba(0,0,0,0.96)", 
            zIndex: 5000, 
            display: "flex", 
            flexDirection: "column", 
            overflow: "hidden",
            backdropFilter: "blur(8px)",
            userSelect: "none"
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", color: "white", zIndex: 10, background: "rgba(0,0,0,0.5)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 800, background: "rgba(255,255,255,0.15)", padding: "3px 10px", borderRadius: "20px" }}>
                {activeImgIndex + 1} / {details.images.length}
              </span>
              <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>
                {details.images[activeImgIndex].url.split("/").pop() || "Evidencia"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setZoomScale(1);
                setActiveImgIndex(null);
              }}
              style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", borderRadius: "50%", width: "38px", height: "38px", cursor: "pointer", fontSize: "1.2rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ✕
            </button>
          </div>

          {/* Central Image Viewer with Navigation */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", padding: "0 8px", overflow: "hidden" }}>
            {/* Arrow Left */}
            <button
              type="button"
              onClick={() => {
                setZoomScale(1);
                setActiveImgIndex(prev => (prev !== null && prev > 0 ? prev - 1 : (details.images.length - 1)));
              }}
              style={{ background: "rgba(15, 23, 42, 0.75)", border: "1px solid rgba(255,255,255,0.2)", color: "white", width: "46px", height: "46px", borderRadius: "50%", cursor: "pointer", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}
              title="Foto anterior"
            >
              ◀
            </button>

            {/* Image Container with Smooth Zoom & Double Tap */}
            <div 
              onDoubleClick={() => setZoomScale(prev => (prev === 1 ? 2.5 : 1))}
              style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", height: "100%", width: "100%", position: "relative", overflow: "auto", cursor: zoomScale > 1 ? "grab" : "zoom-in" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${details.images[activeImgIndex].url}?t=${cacheKey}`}
                alt="Visor de alta resolución"
                style={{ 
                  maxHeight: "82vh", 
                  maxWidth: "92vw", 
                  objectFit: "contain", 
                  borderRadius: "10px", 
                  transition: "transform 0.25s cubic-bezier(0.2, 0, 0.2, 1)",
                  transform: `scale(${zoomScale})`,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
                }}
              />
            </div>

            {/* Arrow Right */}
            <button
              type="button"
              onClick={() => {
                setZoomScale(1);
                setActiveImgIndex(prev => (prev !== null && prev < details.images.length - 1 ? prev + 1 : 0));
              }}
              style={{ background: "rgba(15, 23, 42, 0.75)", border: "1px solid rgba(255,255,255,0.2)", color: "white", width: "46px", height: "46px", borderRadius: "50%", cursor: "pointer", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}
              title="Foto siguiente"
            >
              ▶
            </button>
          </div>

          {/* Action Footer (Rotate, Delete, Download) */}
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

            {/* Rotar Izquierda */}
            <button
              type="button"
              onClick={() => handleRotateImage(details.images[activeImgIndex].id, "left")}
              title="Girar a la izquierda"
              style={{ background: "none", border: "none", color: "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 15a3.99 3.99 0 0 0-4-4H4M4 11l3-3M4 11l3 3" />
                <path d="M12 2a10 10 0 0 1 10 10c0 2.21-.9 4.21-2.34 5.66" />
              </svg>
              <span style={{ fontSize: "0.75rem" }}>Girar Izq</span>
            </button>

            {/* Rotar Derecha */}
            <button
              type="button"
              onClick={() => handleRotateImage(details.images[activeImgIndex].id, "right")}
              title="Girar a la derecha"
              style={{ background: "none", border: "none", color: "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 15a3.99 3.99 0 0 1 4-4h6M20 11l-3-3M20 11l-3 3" />
                <path d="M12 2a10 10 0 0 0-10 10c0 2.21.9 4.21 2.34 5.66" />
              </svg>
              <span style={{ fontSize: "0.75rem" }}>Girar Der</span>
            </button>

            {/* Descargar */}
            <a
              href={details.images[activeImgIndex].url}
              download={`CTO_${cto.num}_imagen_${activeImgIndex + 1}.jpg`}
              title="Descargar imagen"
              style={{ textDecoration: "none", color: "white", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 21h12M12 3v14M12 17l-5-5M12 17l5-5" />
              </svg>
              <span style={{ fontSize: "0.75rem" }}>Descargar</span>
            </a>

            {/* Borrar */}
            <button
              type="button"
              onClick={() => handleDeleteImage(details.images[activeImgIndex].id)}
              title="Eliminar imagen"
              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              <span style={{ fontSize: "0.75rem" }}>Eliminar</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE AUDITORÍA Y CONFIRMACIÓN DE CARPETA (CERRAR Y GUARDAR) */}
      {showChecklistModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.7)",
          backdropFilter: "blur(5px)",
          zIndex: 4000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px"
        }}>
          <div className="glass-panel" style={{
            width: "100%",
            maxWidth: "440px",
            background: "var(--card-bg, #0f172a)",
            border: "1.5px solid var(--border-color, #334155)",
            borderRadius: "18px",
            padding: "22px",
            boxShadow: "0 15px 35px rgba(0,0,0,0.4)",
            color: "var(--text-color, #f8fafc)"
          }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-color, white)" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Cierre y Auditoría — CTO {cto.num}
            </h2>
            <p style={{ fontSize: "0.8rem", color: "#94a3b8", marginBottom: "1.2rem" }}>
              Verifica los requisitos mínimos para certificar esta CTO como <strong>CORRECTO</strong>:
            </p>

            {/* Checklist de requisitos */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "1.2rem" }}>
              
              {/* Opción 1: Crear Carpeta Independiente (siempre marcada y bloqueada si cumple) */}
              <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.1)", border: "1.5px solid #10b981", cursor: "default" }}>
                <input 
                  type="checkbox" 
                  checked={true}
                  readOnly
                  disabled
                  style={{ width: "18px", height: "18px", accentColor: "#10b981", cursor: "default" }}
                />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "0.86rem", fontWeight: 800, color: "#10b981" }}>📁 Crear carpeta independiente</span>
                  <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Se organizará en /public/uploads/DD-MM-AAAA/{cto.num}</span>
                </div>
              </label>

              {/* Opción 2: Formulario Completo */}
              <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", background: "var(--bg-color)", border: "1px solid var(--border-color)", cursor: "pointer" }}>
                <input 
                  type="checkbox" 
                  checked={checkFormulario} 
                  onChange={e => setCheckFormulario(e.target.checked)} 
                  style={{ width: "18px", height: "18px", accentColor: "#10b981", cursor: "pointer" }}
                />
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-color)" }}>📋 Formulario completo / Guía realizada</span>
              </label>

              {/* Verificación de Fotos Mínimas */}
              {(() => {
                const imgs = details?.images || [];
                const hasEntorno = imgs.some((i: any) => (i.url || "").toLowerCase().includes("entorno"));
                const hasAbierta = imgs.some((i: any) => (i.url || "").toLowerCase().includes("abierta"));
                const hasEtqCto = imgs.some((i: any) => {
                  const u = (i.url || "").toLowerCase();
                  return u.includes("etiquetado_cto") || (u.includes("etiquetado") && !u.includes("cableado"));
                });
                const hasEtqCab = imgs.some((i: any) => (i.url || "").toLowerCase().includes("cableado"));
                const hasPot = imgs.some((i: any) => (i.url || "").toLowerCase().includes("potencia"));
                const missingList = [];
                if (!hasEntorno) missingList.push("Foto entorno");
                if (!hasAbierta) missingList.push("CTO abierta");
                if (!hasEtqCto) missingList.push("Etiquetado CTO");
                if (!hasEtqCab) missingList.push("Etiquetado cableado");
                if (!hasPot) missingList.push("Medición potencia");

                const allPhotosPresent = missingList.length === 0;

                return (
                  <div style={{ background: allPhotosPresent ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)", border: `1.5px solid ${allPhotosPresent ? "#10b981" : "#ef4444"}`, borderRadius: "10px", padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 800, color: allPhotosPresent ? "#10b981" : "#ef4444" }}>
                        {allPhotosPresent ? "✓ Fotos mínimas requeridas completadas" : "⚠️ Faltan fotos mínimas requeridas:"}
                      </span>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94a3b8" }}>{5 - missingList.length} / 5</span>
                    </div>
                    {!allPhotosPresent && (
                      <div style={{ marginTop: "6px" }}>
                        <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "0.75rem", color: "#f87171", fontWeight: 600 }}>
                          {missingList.map((m, i) => <li key={i}>{m}</li>)}
                        </ul>
                        <p style={{ margin: "6px 0 0 0", fontSize: "0.72rem", color: "#fca5a5", fontStyle: "italic" }}>
                          ℹ️ Si cierras la auditoría sin estas fotos, quedará registrado en el historial de la CTO con tu usuario, hora y geolocalización.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {(subStatuses.find(s => s.id === subStatusId)?.name?.trim().toUpperCase() === "EN CONSTRUCCIÓN" || 
                subStatuses.find(s => s.id === subStatusId)?.name?.trim().toUpperCase() === "EN CONSTRUCCION") && (
                <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", background: "rgba(245, 158, 11, 0.1)", border: "1.5px solid #f59e0b", cursor: "pointer" }}>
                  <input 
                    type="checkbox" 
                    checked={checkAntala} 
                    onChange={e => setCheckAntala(e.target.checked)} 
                    style={{ width: "18px", height: "18px", accentColor: "#f59e0b", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#d97706" }}>3. Registro en Antala</span>
                </label>
              )}

              {/* AVISO Y BLOQUEO DE CONFORMIDAD POR ANOMALÍA DE FRECUENCIA O POTENCIA */}
              {powerAuditAlerts.hasAnyAnomaly && (
                <div style={{
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "2px solid #ef4444",
                  borderRadius: "12px",
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "1.2rem" }}>⚠️</span>
                    <span style={{ fontSize: "0.86rem", fontWeight: 800, color: "#ef4444" }}>
                      Advertencia de Potencia / Frecuencia Detectada
                    </span>
                  </div>

                  {powerAuditAlerts.hasWlMismatch && (
                    <div style={{ fontSize: "0.78rem", color: "#fca5a5" }}>
                      • <strong>Longitud de onda en otra frecuencia:</strong> {powerAuditAlerts.wlDetails?.detected} nm (Normativa esperada: {powerAuditAlerts.wlDetails?.expected || "1490"} nm).
                    </div>
                  )}

                  {powerAuditAlerts.hasPowerOutOfRange && (
                    <div style={{ fontSize: "0.78rem", color: "#fca5a5" }}>
                      • <strong>Potencia anómala o fuera de rango:</strong> {powerAuditAlerts.outOfRangePowerValues.join(", ")} (Superior a -22.99 dBm o sin señal / Lo).
                      <span style={{ display: "block", color: "#f87171", marginTop: "2px", fontWeight: 700 }}>
                        Recuerda cambiar el subestado de la CTO si no lo has hecho aún.
                      </span>
                    </div>
                  )}

                  <label style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    marginTop: "6px",
                    paddingTop: "8px",
                    borderTop: "1px dashed rgba(239, 68, 68, 0.3)",
                    cursor: "pointer"
                  }}>
                    <input
                      type="checkbox"
                      checked={confirmConformidadAnomalia}
                      onChange={e => setConfirmConformidadAnomalia(e.target.checked)}
                      style={{ width: "18px", height: "18px", minWidth: "18px", marginTop: "2px", accentColor: "#ef4444", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-color)" }}>
                      He revisado la medición (frecuencia / nivel de potencia) y <strong>estoy de acuerdo</strong> en marcar esta CTO como CORRECTO.
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Botones de acción */}
            <div style={{ display: "flex", gap: "10px" }}>
              <button 
                type="button" 
                onClick={() => setShowChecklistModal(false)} 
                className="btn" 
                style={{ flex: 1, background: "var(--border-color)", color: "var(--text-color)", fontWeight: 700 }}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={handleConfirmChecklist} 
                disabled={powerAuditAlerts.hasAnyAnomaly && !confirmConformidadAnomalia}
                className="btn" 
                style={{ 
                  flex: 1.6, 
                  background: (powerAuditAlerts.hasAnyAnomaly && !confirmConformidadAnomalia)
                    ? "#64748b"
                    : "linear-gradient(135deg, #10b981 0%, #059669 100%)", 
                  color: "white", 
                  fontWeight: 800,
                  fontSize: "0.88rem",
                  boxShadow: (powerAuditAlerts.hasAnyAnomaly && !confirmConformidadAnomalia)
                    ? "none"
                    : "0 4px 12px rgba(16, 185, 129, 0.3)",
                  cursor: (powerAuditAlerts.hasAnyAnomaly && !confirmConformidadAnomalia) ? "not-allowed" : "pointer",
                  opacity: (powerAuditAlerts.hasAnyAnomaly && !confirmConformidadAnomalia) ? 0.7 : 1
                }}
              >
                Confirmar y Auditar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL DE FICHA FORMULARIO */}
      {showFormSheetModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 3500, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div className="glass-panel" style={{ width: "95%", maxWidth: "550px", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "16px", overflow: "hidden", color: "var(--text-color)" }}>
            
            {/* Header */}
            <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>📋 Ficha Formulario: CTO {cto.num}</h3>
              <button 
                type="button" 
                onClick={() => setShowFormSheetModal(false)} 
                style={{ background: "none", border: "none", color: "var(--text-color)", fontSize: "1.2rem", cursor: "pointer", fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: "1.5rem", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {(() => {
                if (!details?.formDataJson) {
                  return (
                    <div style={{ textAlign: "center", padding: "2rem 1rem", color: "#64748b" }}>
                      <p style={{ fontSize: "1.5rem", margin: "0 0 10px 0" }}>⚠️</p>
                      <p style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>No hay ninguna ficha de formulario guardada para esta CTO.</p>
                      <p style={{ fontSize: "0.8rem", margin: "6px 0 0 0" }}>Haz clic en <strong>"Guía formulario"</strong> para rellenar el cuestionario.</p>
                    </div>
                  );
                }

                try {
                  const data = JSON.parse(details.formDataJson);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.88rem" }}>
                      
                      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--border-color)", paddingBottom: "6px" }}>
                        <span style={{ fontWeight: 700, color: "#64748b" }}>Idioma de llenado:</span>
                        <span style={{ fontWeight: 700, color: "var(--primary-color)" }}>{data.lang === "uk" ? "Ucraniano (Українська)" : "Español"}</span>
                      </div>

                      {/* 1. Ubicación */}
                      <div>
                        <strong style={{ display: "block", color: "var(--primary-color)", marginBottom: "4px" }}>📍 Ubicación de la CTO:</strong>
                        <p style={{ margin: 0, paddingLeft: "10px", borderLeft: "2px solid var(--border-color)" }}>{data.ubicacion || "No especificado"}</p>
                      </div>

                      {/* 2. Daños */}
                      <div>
                        <strong style={{ display: "block", color: "var(--primary-color)", marginBottom: "4px" }}>🛠️ Daños y Suciedades:</strong>
                        {data.danos && data.danos.length > 0 ? (
                          <ul style={{ margin: 0, paddingLeft: "20px" }}>
                            {data.danos.map((d: string, i: number) => <li key={i}>{d}</li>)}
                          </ul>
                        ) : (
                          <p style={{ margin: 0, paddingLeft: "10px", borderLeft: "2px solid var(--border-color)", fontStyle: "italic", color: "#64748b" }}>Sin daños visibles</p>
                        )}
                      </div>

                      {/* 3. Llaves */}
                      <div>
                        <strong style={{ display: "block", color: "var(--primary-color)", marginBottom: "4px" }}>🔑 Requerimiento de Llaves:</strong>
                        <p style={{ margin: 0, paddingLeft: "10px", borderLeft: "2px solid var(--border-color)" }}>
                          {data.requiereLlaves ? (
                            <span>Sí ({data.datosLlaves || "Sin datos de contacto"})</span>
                          ) : (
                            <span>No se requieren llaves</span>
                          )}
                        </p>
                      </div>

                      {/* 4. Splitters */}
                      <div>
                        <strong style={{ display: "block", color: "var(--primary-color)", marginBottom: "4px" }}>📡 Señal de Divisores (Splitters):</strong>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "8px", marginTop: "4px" }}>
                          {data.splitters && data.splitters.map((s: any, i: number) => (
                            <div key={i} style={{ background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "6px 10px" }}>
                              <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", fontWeight: 700 }}>Divisor {i + 1}</span>
                              <span style={{ fontSize: "1rem", fontWeight: 800, color: Math.abs(parseFloat(s.signal)) === 70 ? "#ef4444" : Math.abs(parseFloat(s.signal)) > 22.99 ? "#f59e0b" : "#10b981" }}>
                                {s.signal} dBm
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 5. Antala */}
                      <div>
                        <strong style={{ display: "block", color: "var(--primary-color)", marginBottom: "4px" }}>🤖 Sincronismo en Antala:</strong>
                        <p style={{ margin: 0, paddingLeft: "10px", borderLeft: "2px solid var(--border-color)" }}>
                          {data.requiereAntala ? "Sí requerido" : "No requerido"}
                        </p>
                      </div>

                      {/* 6. Influencia */}
                      <div>
                        <strong style={{ display: "block", color: "var(--primary-color)", marginBottom: "4px" }}>🏘️ Área de Influencia:</strong>
                        <ul style={{ margin: 0, paddingLeft: "20px" }}>
                          {data.influenciaPorterillo && <li>Porterillo automático</li>}
                          {data.influenciaCalle && <li>Vía pública (Números: {data.calleNumeros?.join(", ") || "Ninguno"})</li>}
                          {data.influenciaOtros && <li>Otros: {data.influenciaOtrosTexto}</li>}
                        </ul>
                      </div>

                      {/* Comentario generado */}
                      <div style={{ marginTop: "10px", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "10px 12px" }}>
                        <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, display: "block", marginBottom: "4px" }}>📝 COMENTARIO GENERADO (ESPAÑOL):</span>
                        <p style={{ margin: 0, fontFamily: "monospace", fontSize: "0.8rem", whiteSpace: "pre-wrap", color: "var(--text-color)" }}>{data.generatedComment}</p>
                      </div>

                    </div>
                  );
                } catch (e) {
                  return <p style={{ color: "#ef4444" }}>Error al analizar los datos del formulario.</p>;
                }
              })()}
            </div>

            {/* Footer de Ficha Formulario */}
            <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid var(--border-color)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {details?.formDataJson && (
                <>
                  <button 
                    type="button" 
                    onClick={() => setShowSummaryCopyModal(true)} 
                    className="btn btn-primary" 
                    style={{ flex: "1 1 140px", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>Abrir Resumen</span>
                  </button>

                  <button 
                    type="button" 
                    onClick={() => {
                      setShowFormSheetModal(false);
                      setShowFormGuideModal(true);
                    }} 
                    className="btn" 
                    style={{ flex: "1 1 120px", background: "#8b5cf6", color: "white", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    <span>Modificar</span>
                  </button>

                  <button 
                    type="button" 
                    onClick={handleDeleteForm} 
                    disabled={deletingForm}
                    className="btn" 
                    style={{ background: "#ef4444", color: "white", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem", padding: "0 12px" }}
                    title="Eliminar formulario permanentemente"
                  >
                    {deletingForm ? "..." : "Borrar"}
                  </button>
                </>
              )}
              <button 
                type="button" 
                onClick={() => setShowFormSheetModal(false)} 
                className="btn" 
                style={{ flex: "1 1 80px", background: "var(--border-color)", color: "var(--text-color)", justifyContent: "center", fontWeight: 600, fontSize: "0.85rem" }}
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL DE RESUMEN DE COPIADO (IDÉNTICO AL FINAL DE GUÍA DE FORMULARIO) */}
      {showSummaryCopyModal && details?.formDataJson && (() => {
        let data: any = {};
        try {
          data = JSON.parse(details.formDataJson);
        } catch (e) {
          data = {};
        }

        const formattedCtoCode = (() => {
          const parts = (cto?.num || "").split("-");
          if (parts.length === 3) {
            return `${parts[0]}-${parts[2]}`;
          }
          return (cto?.num || "").replace("-29-", "-");
        })();

        const part1Text = data.commentPart1 || (data.generatedComment ? data.generatedComment.split("\n\n")[0] : "");
        const part2Text = data.commentPart2 || "";
        const part2CommentText = data.commentPart2Comment || "";
        const part3Text = data.commentPart3 || "";

        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(5, 8, 16, 0.85)", zIndex: 6000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.2rem", backdropFilter: "blur(8px)" }}>
            <div className="glass-panel" style={{ width: "95%", maxWidth: "500px", padding: "1.5rem 1.8rem", background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))", borderRadius: "20px", color: "var(--text-color, white)", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6)", maxHeight: "90vh", overflowY: "auto" }}>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "var(--primary-color)", display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Resumen de Formulario — CTO {cto.num}
                  </h3>
                  <span style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "2px", display: "block" }}>
                    Copia individualmente las secciones con un solo clic
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSummaryCopyModal(false)}
                  style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "var(--text-color)", borderRadius: "50%", width: "30px", height: "30px", cursor: "pointer", fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  ✕
                </button>
              </div>

              {/* Código CTO */}
              <div style={{ marginBottom: "1rem" }}>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, display: "block", marginBottom: "4px", textTransform: "uppercase" }}>
                  Código CTO:
                </span>
                <div 
                  style={{
                    width: "100%", padding: "8px 12px", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "8px",
                    color: "var(--text-color)", fontFamily: "monospace", fontSize: "0.85rem", boxSizing: "border-box", textAlign: "left",
                    display: "flex", alignItems: "center", minHeight: "36px"
                  }}
                >
                  {formattedCtoCode}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(formattedCtoCode);
                    alert("Código CTO copiado.");
                  }}
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: "6px", minHeight: "32px", fontSize: "0.78rem", fontWeight: 700, borderRadius: "8px" }}
                >
                  Copiar Código CTO
                </button>
              </div>

              {/* Bloque 1 */}
              {part1Text && (
                <div style={{ marginBottom: "1rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, display: "block", marginBottom: "4px", textTransform: "uppercase" }}>
                    1. Datos de CTO y Antala:
                  </span>
                  <div 
                    style={{
                      width: "100%", padding: "8px 12px", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "8px",
                      color: "var(--text-color)", fontFamily: "monospace", fontSize: "0.82rem", boxSizing: "border-box", textAlign: "left",
                      whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.4"
                    }}
                  >
                    {part1Text}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(part1Text);
                      alert("Datos y Antala copiados.");
                    }}
                    className="btn btn-primary"
                    style={{ width: "100%", marginTop: "6px", minHeight: "32px", fontSize: "0.78rem", fontWeight: 700, borderRadius: "8px" }}
                  >
                    Copiar Sección 1
                  </button>
                </div>
              )}

              {/* Bloque 2 - Señal */}
              {part2Text && (
                <div style={{ marginBottom: "1rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, display: "block", marginBottom: "4px", textTransform: "uppercase" }}>
                    2. Señal:
                  </span>
                  <div 
                    style={{
                      width: "100%", padding: "8px 12px", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "8px",
                      color: "var(--text-color)", fontFamily: "monospace", fontSize: "0.82rem", boxSizing: "border-box", textAlign: "left",
                      whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.4"
                    }}
                  >
                    {part2Text}
                  </div>
                </div>
              )}

              {/* Bloque 2 - Comentario de Señal */}
              {part2CommentText && (
                <div style={{ marginBottom: "1rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, display: "block", marginBottom: "4px", textTransform: "uppercase" }}>
                    2. Comentario de Señal:
                  </span>
                  <div 
                    style={{
                      width: "100%", padding: "8px 12px", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "8px",
                      color: "var(--text-color)", fontFamily: "monospace", fontSize: "0.82rem", boxSizing: "border-box", textAlign: "left",
                      whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.4"
                    }}
                  >
                    {part2CommentText}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(part2CommentText);
                      alert("Comentario de señal copiado.");
                    }}
                    className="btn btn-primary"
                    style={{ width: "100%", marginTop: "6px", minHeight: "32px", fontSize: "0.78rem", fontWeight: 700, borderRadius: "8px" }}
                  >
                    Copiar Sección 2
                  </button>
                </div>
              )}

              {/* Bloque 3 - Área de Influencia */}
              {part3Text && (
                <div style={{ marginBottom: "1rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, display: "block", marginBottom: "4px", textTransform: "uppercase" }}>
                    3. Área de Influencia:
                  </span>
                  <div 
                    style={{
                      width: "100%", padding: "8px 12px", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "8px",
                      color: "var(--text-color)", fontFamily: "monospace", fontSize: "0.82rem", boxSizing: "border-box", textAlign: "left",
                      whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.4"
                    }}
                  >
                    {part3Text}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(part3Text);
                      alert("Área de influencia copiada.");
                    }}
                    className="btn btn-primary"
                    style={{ width: "100%", marginTop: "6px", minHeight: "32px", fontSize: "0.78rem", fontWeight: 700, borderRadius: "8px" }}
                  >
                    Copiar Sección 3
                  </button>
                </div>
              )}

              {/* Botón Cerrar */}
              <div style={{ marginTop: "1.5rem" }}>
                <button
                  type="button"
                  onClick={() => setShowSummaryCopyModal(false)}
                  className="btn"
                  style={{ width: "100%", minHeight: "38px", background: "var(--border-color)", color: "var(--text-color)", fontWeight: 700, justifyContent: "center" }}
                >
                  Cerrar
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* MODAL IN-APP: GUÍA DE FORMULARIO EMBEBIDA (SIN NUEVA PESTAÑA) */}
      {showFormGuideModal && (
        <div 
          style={{ 
            position: "fixed", 
            inset: 0, 
            background: "rgba(3, 7, 18, 0.88)", 
            zIndex: 6500, 
            display: "flex", 
            flexDirection: "column",
            alignItems: "center", 
            justifyContent: "center", 
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)"
          }}
        >
          {/* Header Barra Superior */}
          <div 
            style={{ 
              width: "100%", 
              maxWidth: "680px", 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center", 
              padding: "10px 16px",
              background: "transparent"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#8b5cf6" }} />
              <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#f8fafc" }}>
                Guía de Formulario — CTO {cto?.num || ""}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowFormGuideModal(false);
                fetchCtoDetails();
              }}
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#ffffff",
                borderRadius: "8px",
                padding: "4px 12px",
                cursor: "pointer",
                fontSize: "0.82rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <span>✕</span> Cerrar
            </button>
          </div>

          {/* Contenedor Iframe fluido */}
          <div 
            style={{ 
              width: "100%", 
              maxWidth: "680px", 
              flex: 1, 
              maxHeight: "calc(100vh - 65px)",
              background: "var(--bg-color, #0f172a)", 
              borderRadius: "16px", 
              border: "1px solid var(--border-color, rgba(255, 255, 255, 0.12))",
              overflow: "hidden",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
              marginBottom: "12px"
            }}
          >
            <iframe
              src={`/form-guide?ctoId=${cto.id}&embedded=true`}
              style={{
                width: "100%",
                height: "100%",
                border: "none"
              }}
              title={`Guía de Formulario CTO ${cto.num}`}
            />
          </div>
        </div>
      )}

      {/* MODAL 1: GESTIÓN Y EDICIÓN DE PUERTOS DE FIBRA (BOTÓN TRIÁNGULO) */}
      {showPortsModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px", backdropFilter: "blur(4px)" }}>
          <div className="glass-panel" style={{ width: "95%", maxWidth: "720px", maxHeight: "92vh", background: "var(--card-bg)", color: "var(--text-color)", border: "1.5px solid var(--border-color)", borderRadius: "16px", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 15px 35px rgba(0,0,0,0.4)" }}>
            
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-color)" }}>
              <div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: "10px", color: "var(--text-color)" }}>
                  <span style={{ display: "inline-flex", padding: "6px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 19.5h20L12 2z" />
                      <path d="M2 19.5h20" />
                    </svg>
                  </span>
                  Asignación de Puertos — CTO {cto.num}
                </h2>
                <span style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "2px", display: "block" }}>
                  Configura el estado individual de cada puerto óptico
                </span>
              </div>
              <button 
                type="button" 
                onClick={() => setShowPortsModal(false)}
                style={{ background: "var(--border-color)", border: "none", borderRadius: "50%", width: "32px", height: "32px", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-color)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: "18px 20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
              
              {/* 1. Selector de Cantidad de Puertos (Predeterminado 8) */}
              <div style={{ background: "var(--bg-color)", padding: "14px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-color)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                    Cantidad Total de Puertos:
                  </label>
                  <span style={{ fontSize: "0.75rem", color: "var(--primary-color)", fontWeight: 700, background: "rgba(255,121,0,0.1)", padding: "2px 8px", borderRadius: "12px" }}>
                    Capacidad seleccionada: {portsCapacity} Puertos
                  </span>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[8, 16, 24, 32, 40, 48].map(cap => {
                    const isSel = portsCapacity === cap;
                    return (
                      <button
                        key={cap}
                        type="button"
                        onClick={() => handlePortsCapacityChange(cap)}
                        style={{
                          flex: "1 1 55px",
                          minHeight: "38px",
                          padding: "6px 12px",
                          borderRadius: "10px",
                          fontWeight: 800,
                          fontSize: "0.9rem",
                          cursor: "pointer",
                          border: isSel ? "2px solid var(--primary-color)" : "1.5px solid var(--border-color)",
                          background: isSel ? "var(--primary-color)" : "var(--card-bg)",
                          color: isSel ? "white" : "var(--text-color)",
                          boxShadow: isSel ? "0 4px 10px rgba(255,121,0,0.3)" : "none",
                          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
                        }}
                      >
                        {cap} P
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Resumen y Contadores de Estado */}
              {(() => {
                const occCount = portsList.filter(p => p.status === "OCUPADO" || (p.status === "OTRO" && p.customNumber.trim() !== "")).length;
                const libCount = portsCapacity - occCount;
                const pct = Math.round((occCount / portsCapacity) * 100) || 0;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <div style={{ flex: 1, padding: "10px", textAlign: "center", background: "var(--bg-color)", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                        <span style={{ fontSize: "0.72rem", color: "#64748b", display: "block", fontWeight: 700 }}>TOTAL</span>
                        <strong style={{ fontSize: "1.25rem", color: "var(--text-color)" }}>{portsCapacity}</strong>
                      </div>
                      <div style={{ flex: 1, padding: "10px", textAlign: "center", background: "#dcfce7", borderRadius: "10px", border: "1.5px solid #86efac", boxShadow: "0 2px 6px rgba(22,163,74,0.15)" }}>
                        <span style={{ fontSize: "0.72rem", color: "#166534", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", fontWeight: 700 }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#16a34a" }} />
                          LIBRES
                        </span>
                        <strong style={{ fontSize: "1.25rem", color: "#166534" }}>{libCount}</strong>
                      </div>
                      <div style={{ flex: 1, padding: "10px", textAlign: "center", background: "#fee2e2", borderRadius: "10px", border: "1.5px solid #fca5a5", boxShadow: "0 2px 6px rgba(220,38,38,0.15)" }}>
                        <span style={{ fontSize: "0.72rem", color: "#991b1b", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", fontWeight: 700 }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#dc2626" }} />
                          OCUPADOS
                        </span>
                        <strong style={{ fontSize: "1.25rem", color: "#991b1b" }}>{occCount}</strong>
                      </div>
                    </div>
                    {/* Barra de Ocupación */}
                    <div style={{ width: "100%", height: "8px", background: "#dcfce7", borderRadius: "4px", overflow: "hidden", border: "1px solid #bbf7d0" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #f59e0b, #ef4444)", transition: "width 0.3s ease" }} />
                    </div>
                  </div>
                );
              })()}

              {/* 3. Acciones de Relleno Rápido (Caja de Herramientas Superior) */}
              <div style={{ background: "var(--bg-color)", padding: "14px 16px", borderRadius: "14px", border: "1.5px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-color)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#f59e0b" }}>
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    Relleno Rápido de Puertos ({portsCapacity} P):
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>
                    Aplica estados a múltiples puertos con 1 clic
                  </span>
                </div>

                {/* Botones de Relleno Global */}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleFillAllLibre}
                    style={{
                      flex: "1 1 180px",
                      minHeight: "40px",
                      padding: "8px 14px",
                      background: "#dcfce7",
                      color: "#166534",
                      border: "1.5px solid #86efac",
                      borderRadius: "10px",
                      fontWeight: 800,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      boxShadow: "0 2px 6px rgba(22,163,74,0.12)",
                      transition: "all 0.15s"
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Marcar TODOS como LIBRE (1 al {portsCapacity})
                  </button>

                  <button
                    type="button"
                    onClick={handleFillAllOcupados}
                    style={{
                      flex: "1 1 180px",
                      minHeight: "40px",
                      padding: "8px 14px",
                      background: "#fee2e2",
                      color: "#991b1b",
                      border: "1.5px solid #fca5a5",
                      borderRadius: "10px",
                      fontWeight: 800,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      boxShadow: "0 2px 6px rgba(220,38,38,0.12)",
                      transition: "all 0.15s"
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Marcar TODOS como OCUPADOS (1 al {portsCapacity})
                  </button>
                </div>
              </div>

              {/* 4. Grid de Asignación Puerto a Puerto */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-color)" }}>
                    Asignación Individual (Puertos 1 al {portsCapacity}):
                  </label>
                  <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                    {portsList.length} de {portsCapacity} puertos configurados
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))", gap: "10px" }}>
                  {portsList.map((port, idx) => {
                    const isLibre = port.status === "LIBRE";
                    const isOcupado = port.status === "OCUPADO";
                    const isOtro = port.status === "OTRO";
                    const isCtr = port.status === "CTR";

                    return (
                      <div 
                        key={port.id} 
                        style={{ 
                          background: isOcupado ? "#fff1f2" : isOtro ? "#fefce8" : isCtr ? "#f0f9ff" : "#f0fdf4", 
                          padding: "10px 12px", 
                          borderRadius: "12px", 
                          border: isOcupado ? "2px solid #ef4444" : isOtro ? "2px solid #eab308" : isCtr ? "2px solid #0284c7" : isLibre ? "2px solid #22c55e" : "1.5px solid var(--border-color)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
                          transition: "all 0.15s"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 900, fontSize: "0.92rem", color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: isOcupado ? "#ef4444" : isOtro ? "#eab308" : isCtr ? "#0284c7" : "#22c55e", boxShadow: `0 0 6px ${isOcupado ? "#ef4444" : isOtro ? "#eab308" : isCtr ? "#0284c7" : "#22c55e"}` }} />
                            Puerto {port.id}
                          </span>
                          <span style={{ 
                            fontSize: "0.7rem", 
                            fontWeight: 800, 
                            padding: "2px 8px", 
                            borderRadius: "12px",
                            background: isOcupado ? "#fee2e2" : isOtro ? "#fef9c3" : isCtr ? "#e0f2fe" : "#dcfce7",
                            color: isOcupado ? "#991b1b" : isOtro ? "#854d0e" : isCtr ? "#0369a1" : "#166534",
                            border: `1px solid ${isOcupado ? "#fca5a5" : isOtro ? "#fef08a" : isCtr ? "#bae6fd" : "#bbf7d0"}`
                          }}>
                            {isOcupado ? "OCUPADO" : isCtr ? "CTR" : isOtro ? (port.customNumber ? `#${port.customNumber}` : "OTRO #") : "LIBRE"}
                          </span>
                        </div>

                        {/* Botones de Estado */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                          {/* Botón LIBRE */}
                          <button
                            type="button"
                            onClick={() => handlePortStatusChange(idx, "LIBRE")}
                            style={{
                              padding: "6px 2px",
                              fontSize: "0.75rem",
                              fontWeight: 800,
                              borderRadius: "8px",
                              cursor: "pointer",
                              border: isLibre ? "2px solid #16a34a" : "1px solid #bbf7d0",
                              background: isLibre ? "#22c55e" : "#dcfce7",
                              color: isLibre ? "white" : "#166534",
                              boxShadow: isLibre ? "0 2px 6px rgba(34,197,94,0.3)" : "none",
                              transition: "all 0.15s"
                            }}
                          >
                            Libre
                          </button>

                          {/* Botón OCUPADO */}
                          <button
                            type="button"
                            onClick={() => handlePortStatusChange(idx, "OCUPADO")}
                            style={{
                              padding: "6px 2px",
                              fontSize: "0.75rem",
                              fontWeight: 800,
                              borderRadius: "8px",
                              cursor: "pointer",
                              border: isOcupado ? "2px solid #dc2626" : "1px solid #fecaca",
                              background: isOcupado ? "#ef4444" : "#fee2e2",
                              color: isOcupado ? "white" : "#991b1b",
                              boxShadow: isOcupado ? "0 2px 6px rgba(239,68,68,0.3)" : "none",
                              transition: "all 0.15s"
                            }}
                          >
                            Ocupado
                          </button>

                          {/* Botón OTRO */}
                          <button
                            type="button"
                            onClick={() => handlePortStatusChange(idx, "OTRO")}
                            style={{
                              padding: "6px 2px",
                              fontSize: "0.75rem",
                              fontWeight: 800,
                              borderRadius: "8px",
                              cursor: "pointer",
                              border: isOtro ? "2px solid #ca8a04" : "1px solid #fef08a",
                              background: isOtro ? "#eab308" : "#fef9c3",
                              color: isOtro ? "white" : "#854d0e",
                              boxShadow: isOtro ? "0 2px 6px rgba(234,179,8,0.3)" : "none",
                              transition: "all 0.15s"
                            }}
                          >
                            Otro #
                          </button>

                          {/* Botón CTR */}
                          <button
                            type="button"
                            onClick={() => handlePortStatusChange(idx, "CTR")}
                            style={{
                              padding: "6px 2px",
                              fontSize: "0.75rem",
                              fontWeight: 800,
                              borderRadius: "8px",
                              cursor: "pointer",
                              border: isCtr ? "2px solid #0284c7" : "1px solid #bae6fd",
                              background: isCtr ? "#0284c7" : "#e0f2fe",
                              color: isCtr ? "white" : "#0369a1",
                              boxShadow: isCtr ? "0 2px 6px rgba(2,132,199,0.3)" : "none",
                              transition: "all 0.15s"
                            }}
                          >
                            CTR
                          </button>
                        </div>

                        {/* Input numérico si está en modo OTRO */}
                        {isOtro && (
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="Número de circuito/abonado..."
                            value={port.customNumber}
                            onChange={(e) => handlePortNumberChange(idx, e.target.value)}
                            style={{
                              width: "100%",
                              padding: "6px 10px",
                              fontSize: "0.85rem",
                              borderRadius: "6px",
                              border: "2px solid #eab308",
                              background: "white",
                              color: "#1e293b",
                              fontWeight: 700,
                              fontFamily: "monospace"
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border-color)", background: "var(--bg-color)", display: "flex", gap: "12px" }}>
              <button
                type="button"
                onClick={() => setShowPortsModal(false)}
                className="btn"
                style={{ flex: 1, background: "var(--border-color)", color: "var(--text-color)", fontWeight: 700 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePortsModal}
                className="btn btn-primary"
                style={{ flex: 2, fontWeight: 800, fontSize: "0.92rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Guardar y Ver Panel ({portsList.filter(p => p.status === "OCUPADO" || (p.status === "OTRO" && p.customNumber.trim() !== "")).length} de {portsCapacity} Ocupados)
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL 2: VENTANA VISUAL DE PUERTOS DE LA CTO (PANEL SIMULADO DE CONECTORES ÓPTICOS) */}
      {showVisualPortsViewer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px", backdropFilter: "blur(6px)" }}>
          <div className="glass-panel" style={{ width: "95%", maxWidth: "780px", maxHeight: "92vh", background: "#0f172a", color: "#f8fafc", border: "2px solid #334155", borderRadius: "18px", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)" }}>
            
            {/* Header del Panel Visual */}
            <div style={{ padding: "16px 22px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1e293b" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "linear-gradient(135deg, #FF7900 0%, #ea580c 100%)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(255,121,0,0.4)" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <div>
                  <h2 style={{ fontSize: "1.25rem", fontWeight: 900, margin: 0, color: "white", letterSpacing: "0.3px" }}>
                    Panel Visual de Fibra — CTO {cto.num}
                  </h2>
                  <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>
                    Esquema óptico de distribución ({portsCapacity} Puertos SC/APC)
                  </span>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowVisualPortsViewer(false)}
                style={{ background: "#334155", border: "none", borderRadius: "50%", width: "34px", height: "34px", fontSize: "1.2rem", fontWeight: 700, color: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                ✕
              </button>
            </div>

            {/* Chasis / Cuadro del Panel de Fibra */}
            <div style={{ padding: "20px 22px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "18px" }}>
              
              {/* Dashboard Superior de Resumen */}
              {(() => {
                const occCount = portsList.filter(p => p.status === "OCUPADO" || (p.status === "OTRO" && p.customNumber.trim() !== "")).length;
                const libCount = portsCapacity - occCount;
                const pct = Math.round((occCount / portsCapacity) * 100) || 0;

                return (
                  <div style={{ background: "#1e293b", padding: "14px 18px", borderRadius: "14px", border: "1px solid #334155", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 10px #22c55e" }} />
                          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#86efac" }}>{libCount} LIBRES</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 10px #ef4444" }} />
                          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fca5a5" }}>{occCount} OCUPADOS</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 600 }}>Ocupación:</span>
                        <strong style={{ fontSize: "1.1rem", color: pct > 80 ? "#f87171" : pct > 50 ? "#facc15" : "#4ade80" }}>{pct}%</strong>
                      </div>
                    </div>

                    <div style={{ width: "100%", height: "10px", background: "#0f172a", borderRadius: "5px", overflow: "hidden", border: "1px solid #334155" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #22c55e 0%, #f59e0b 50%, #ef4444 100%)", borderRadius: "5px", transition: "width 0.4s ease" }} />
                    </div>
                  </div>
                );
              })()}

              {/* Panel Físico Visual de Conectores */}
              <div style={{ background: "#020617", padding: "20px", borderRadius: "16px", border: "2px solid #1e293b", boxShadow: "inset 0 4px 15px rgba(0,0,0,0.8)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", borderBottom: "1px dashed #334155", paddingBottom: "8px" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: "#64748b" }}>
                    CHASIS ADAPTADORES SC/APC (CTO-{cto.num})
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#38bdf8", fontWeight: 700 }}>
                    Capacidad: {portsCapacity} Puertos
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${portsCapacity > 24 ? "70px" : "85px"}, 1fr))`, gap: "12px" }}>
                  {portsList.map((port) => {
                    const isLibre = port.status === "LIBRE";
                    const isOcupado = port.status === "OCUPADO";
                    const isOtro = port.status === "OTRO";
                    const isCtr = port.status === "CTR";

                    const mainColor = isOcupado ? "#ef4444" : isOtro ? "#eab308" : isCtr ? "#0284c7" : "#22c55e";
                    const bgGlow = isOcupado ? "rgba(239, 68, 68, 0.15)" : isOtro ? "rgba(234, 179, 8, 0.15)" : isCtr ? "rgba(2, 132, 199, 0.15)" : "rgba(34, 197, 94, 0.15)";
                    const borderCol = isOcupado ? "#ef4444" : isOtro ? "#eab308" : isCtr ? "#0284c7" : "#22c55e";

                    return (
                      <div 
                        key={port.id}
                        style={{
                          background: bgGlow,
                          border: `2px solid ${borderCol}`,
                          borderRadius: "12px",
                          padding: "10px 6px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "6px",
                          boxShadow: `0 4px 12px ${bgGlow}`,
                          position: "relative",
                          transition: "all 0.2s"
                        }}
                      >
                        {/* Etiqueta Puerto */}
                        <span style={{ fontSize: "0.72rem", fontWeight: 900, color: "#94a3b8", letterSpacing: "0.5px" }}>
                          P-{port.id.toString().padStart(2, '0')}
                        </span>

                        {/* Gráfico de Conector Óptico SC/APC */}
                        <div 
                          style={{ 
                            width: "36px", 
                            height: "36px", 
                            borderRadius: "8px", 
                            background: mainColor, 
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "center",
                            boxShadow: `0 0 14px ${mainColor}`,
                            border: "2px solid rgba(255,255,255,0.4)",
                            position: "relative"
                          }}
                        >
                          {/* Agujero central del conector de fibra con virola */}
                          <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#020617", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "white", boxShadow: "0 0 4px white" }} />
                          </div>
                        </div>

                        {/* Estado / Número de Abonado */}
                        <span 
                          style={{ 
                            fontSize: "0.68rem", 
                            fontWeight: 800, 
                            color: mainColor,
                            textAlign: "center",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "100%",
                            padding: "1px 4px"
                          }}
                          title={isOtro && port.customNumber ? `Circuito: ${port.customNumber}` : isCtr ? "Control / CTR" : isOcupado ? "Ocupado / No Localizado" : "Libre"}
                        >
                          {isOcupado ? "OCUPADO" : isCtr ? "CTR" : isOtro ? (port.customNumber ? `#${port.customNumber}` : "OTRO") : "LIBRE"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Footer del Panel Visual */}
            <div style={{ padding: "14px 22px", borderTop: "1px solid #1e293b", background: "#1e293b", display: "flex", gap: "12px" }}>
              <button
                type="button"
                onClick={() => {
                  setShowVisualPortsViewer(false);
                  setShowPortsModal(true);
                }}
                className="btn"
                style={{ flex: 1, background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", color: "white", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
              >
                ✏️ Modificar Puertos
              </button>
              <button
                type="button"
                onClick={() => setShowVisualPortsViewer(false)}
                className="btn"
                style={{ flex: 1, background: "#334155", color: "#f8fafc", fontWeight: 700 }}
              >
                Cerrar Panel
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
