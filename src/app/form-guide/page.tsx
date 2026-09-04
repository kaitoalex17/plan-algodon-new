"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type Splitter = {
  signal: string;
};

type DamageKey = 
  | "tapa"
  | "rotos"
  | "doblados"
  | "cerrar"
  | "sucia"
  | "enfrentadores"
  | "splitterRoto"
  | "otro";

export default function FormGuidePage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg-color, #090d16)", color: "var(--text-color, white)" }}>
        <p style={{ fontWeight: 700, fontFamily: "system-ui, sans-serif" }}>Cargando Guía de Formulario...</p>
      </div>
    }>
      <FormGuideContent />
    </Suspense>
  );
}

function FormGuideContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctoId = searchParams.get("ctoId");
  const { data: session, status: authStatus } = useSession();

  // Config & Metadata
  const [config, setConfig] = useState<any>(null);
  const [lang, setLang] = useState<"es" | "uk">("es");
  const [ctoNum, setCtoNum] = useState("");

  // Survey navigation state (1 to 6)
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Ubicación
  const [ubicacionOption, setUbicacionOption] = useState("");
  const [ubicacionOtros, setUbicacionOtros] = useState("");
  const [ubicacionPlantaTipo, setUbicacionPlantaTipo] = useState("");
  const [ubicacionPlantaNumero, setUbicacionPlantaNumero] = useState("");
  
  // Step 2: Daños
  const [tieneDanos, setTieneDanos] = useState<boolean | null>(null);
  const [danosChecked, setDanosChecked] = useState<Record<DamageKey, boolean>>({
    tapa: false,
    rotos: false,
    doblados: false,
    cerrar: false,
    sucia: false,
    enfrentadores: false,
    splitterRoto: false,
    otro: false
  });
  const [danosOtroTexto, setDanosOtroTexto] = useState("");

  // Step 3: Llaves
  const [requiereLlaves, setRequiereLlaves] = useState<boolean | null>(null);
  const [llavesNombre, setLlavesNombre] = useState("");
  const [llavesTelefono, setLlavesTelefono] = useState("");
  const [llavesNoDatos, setLlavesNoDatos] = useState(false);

  // Step 4: Splitters (Initial 1 splitter)
  const [splitters, setSplitters] = useState<Splitter[]>([
    { signal: "" }
  ]);

  // Step 5: Antala Sincronismo
  const [requiereAntala, setRequiereAntala] = useState<boolean | null>(null);

  // Step 6: Área de influencia
  const [influenciaPorterillo, setInfluenciaPorterillo] = useState(false);
  const [influenciaCalle, setInfluenciaCalle] = useState(false);
  const [callesList, setCallesList] = useState<string[]>([""]);
  const [influenciaOtros, setInfluenciaOtros] = useState(false);
  const [influenciaOtrosTexto, setInfluenciaOtrosTexto] = useState("");
  // Área de influencia automática con IA
  const [ctoCoords, setCtoCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [influenciaAreaAuto, setInfluenciaAreaAuto] = useState("");
  const [loadingInfluenceArea, setLoadingInfluenceArea] = useState(false);
  const [influenceSuccess, setInfluenceSuccess] = useState(false);

  // Result modal state
  const [generatedComment, setGeneratedComment] = useState("");
  const [commentPart1, setCommentPart1] = useState("");
  const [commentPart2, setCommentPart2] = useState("");
  const [commentPart2Comment, setCommentPart2Comment] = useState("");
  const [commentPart3, setCommentPart3] = useState("");
  const [showResultModal, setShowResultModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasSavedForm, setHasSavedForm] = useState(false);

  // Allow scrolling on mobile by adding body.admin-page on mount, and load page theme
  useEffect(() => {
    // Enable mobile scrolling
    document.body.classList.add("admin-page");
    document.documentElement.classList.add("admin-page");

    // Load active map state theme
    fetch("/api/users/map-state")
      .then(res => res.json())
      .then(data => {
        if (data && data.theme) {
          document.body.classList.forEach(className => {
            if (className.startsWith("theme-")) {
              document.body.classList.remove(className);
            }
          });
          document.body.classList.add(`theme-${data.theme}`);
        }
      })
      .catch(err => console.error("Error loading theme:", err));

    return () => {
      document.body.classList.remove("admin-page");
      document.documentElement.classList.remove("admin-page");
    };
  }, []);

  // Load config & CTO data
  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    
    if (ctoId) {
      fetch("/api/admin/questionnaire-settings")
        .then(res => res.json())
        .then(data => setConfig(data))
        .catch(err => console.error("Error loading config:", err));

      fetch(`/api/ctos/${ctoId}`)
        .then(res => res.json())
        .then(data => {
          setCtoNum(data.num || "");
          setCtoCoords({
            lat: data.lat !== undefined && data.lat !== null ? parseFloat(data.lat) : null,
            lng: data.lng !== undefined && data.lng !== null ? parseFloat(data.lng) : null
          });
          if (data.formDataJson) {
            try {
              const saved = JSON.parse(data.formDataJson);
              setLang(saved.lang || "es");
              
              if (saved.ubicacionOption) {
                setUbicacionOption(saved.ubicacionOption);
                setUbicacionPlantaTipo(saved.ubicacionPlantaTipo || "");
                setUbicacionPlantaNumero(saved.ubicacionPlantaNumero || "");
                setUbicacionOtros(saved.ubicacionOtros || "");
              } else if (saved.ubicacion) {
                setUbicacionOption(saved.ubicacion);
                const matches = config?.ubicacion?.options?.some((o: any) => o.es === saved.ubicacion);
                if (!matches && saved.ubicacion) {
                  setUbicacionOption("Otros");
                  setUbicacionOtros(saved.ubicacion);
                }
              }

              if (saved.danos && saved.danos.length > 0) {
                setTieneDanos(true);
                const updated = { ...danosChecked };
                saved.danosKeys?.forEach((k: DamageKey) => {
                  updated[k] = true;
                });
                setDanosChecked(updated);
                setDanosOtroTexto(saved.danosOtroTexto || "");
              } else if (saved.danos) {
                setTieneDanos(false);
              }

              setRequiereLlaves(saved.requiereLlaves);
              setLlavesNombre(saved.llavesNombre || "");
              setLlavesTelefono(saved.llavesTelefono || "");
              setLlavesNoDatos(saved.llavesNoDatos || false);

              if (saved.splitters && saved.splitters.length > 0 && saved.splitters.some((s: any) => s.signal && s.signal.trim() !== "")) {
                setSplitters(saved.splitters.slice(0, 6).map((s: any) => ({
                  signal: (s.signal || "").replace(/^-+/, "").trim()
                })));
              } else if (saved.ocrSplitters && saved.ocrSplitters.length > 0) {
                setSplitters(saved.ocrSplitters.filter((o: any) => o.divisor <= 6).map((s: any) => ({
                  signal: (s.rawNumber || s.power || "").replace(/^-+/, "").trim()
                })));
              } else if (data.potenciaDbm) {
                const rawP = String(data.potenciaDbm).replace(/^-+/, "").trim();
                if (rawP) setSplitters([{ signal: rawP }]);
              }

              setRequiereAntala(saved.requiereAntala);
              setInfluenciaPorterillo(saved.influenciaPorterillo || false);
              setInfluenciaCalle(saved.influenciaCalle || false);
              if (saved.callesList && saved.callesList.length > 0) {
                setCallesList(saved.callesList);
              } else if (saved.calleNombre) {
                const numStr = saved.calleNumeros && saved.calleNumeros.length > 0 ? ` Nº ${saved.calleNumeros.join(", ")}` : "";
                setCallesList([`${saved.calleTipo || "Calle"} ${saved.calleNombre}${numStr}`]);
              } else {
                setCallesList([""]);
              }
              setInfluenciaOtros(saved.influenciaOtros || false);
              setInfluenciaOtrosTexto(saved.influenciaOtrosTexto || "");
              if (saved.influenciaAreaAuto) {
                setInfluenciaAreaAuto(saved.influenciaAreaAuto);
              }
              setHasSavedForm(true);
            } catch (e) {
              console.error("Error parsing saved data:", e);
            }
          } else if (data.potenciaDbm) {
            const rawP = String(data.potenciaDbm).replace(/^-+/, "").trim();
            if (rawP) setSplitters([{ signal: rawP }]);
          }
        })
        .catch(err => console.error("Error loading CTO:", err));
    }
  }, [ctoId, authStatus, router, config?.ubicacion?.options]);

  if (authStatus === "loading" || !config) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg-color, #090d16)", color: "var(--text-color, white)" }}>
        <p style={{ fontWeight: 700, fontFamily: "system-ui, sans-serif" }}>Cargando Guía de Formulario...</p>
      </div>
    );
  }

  // Splitter handlers
  const addSplitter = () => {
    if (splitters.length >= 6) return;
    setSplitters([...splitters, { signal: "" }]);
  };
  const removeSplitter = (index: number) => {
    if (splitters.length <= 1) return;
    setSplitters(splitters.filter((_, i) => i !== index));
  };
  const updateSplitterSignal = (index: number, val: string) => {
    const updated = [...splitters];
    updated[index].signal = val.replace(/^-+/, "").replace(",", ".");
    setSplitters(updated);
  };

  const formatSplitterSignalOnBlur = (index: number) => {
    const updated = [...splitters];
    const raw = updated[index]?.signal?.trim();
    if (!raw) return;
    
    // Si es un valor especial de texto tipo Lo o LO
    if (raw.toLowerCase() === "lo") {
      updated[index].signal = "LO";
      setSplitters(updated);
      return;
    }

    const num = parseFloat(raw);
    if (!isNaN(num)) {
      updated[index].signal = num.toFixed(2);
      setSplitters(updated);
    }
  };

  // Calles list handlers
  const addCalle = () => setCallesList([...callesList, ""]);
  const removeCalle = (index: number) => {
    if (callesList.length <= 1) return;
    setCallesList(callesList.filter((_, i) => i !== index));
  };
  const updateCalle = (index: number, val: string) => {
    const updated = [...callesList];
    updated[index] = val;
    setCallesList(updated);
  };

  // Consultar área de influencia con IA y georreferenciación
  const handleFetchInfluenceArea = async () => {
    const lat = ctoCoords.lat !== null && !isNaN(Number(ctoCoords.lat)) ? Number(ctoCoords.lat) : null;
    const lng = ctoCoords.lng !== null && !isNaN(Number(ctoCoords.lng)) ? Number(ctoCoords.lng) : null;

    if (!ctoId && (lat === null || lng === null)) {
      alert("No se ha seleccionado una CTO o no dispone de coordenadas GPS válidas.");
      return;
    }

    setLoadingInfluenceArea(true);
    setInfluenceSuccess(false);
    try {
      const endpoint = ctoId ? `/api/ctos/${ctoId}/influence-area` : `/api/ctos/lookup/influence-area`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: lat,
          lng: lng
        })
      });

      const data = await res.json();
      if (res.ok && data.text) {
        setInfluenciaAreaAuto(data.text);
        setInfluenceSuccess(true);
      } else {
        alert(data.error || "No se pudo obtener el área de influencia automáticamente.");
      }
    } catch (err: any) {
      console.error("Error buscando área de influencia:", err);
      alert("Error al conectar con el servidor para buscar el área de influencia.");
    } finally {
      setLoadingInfluenceArea(false);
    }
  };

  // Check if form has modified data
  const isDirty = () => {
    return (
      ubicacionOption !== "" ||
      ubicacionOtros !== "" ||
      tieneDanos !== null ||
      requiereLlaves !== null ||
      splitters.some(s => s.signal !== "") ||
      requiereAntala !== null ||
      influenciaPorterillo ||
      influenciaCalle ||
      influenciaOtros
    );
  };

  const handleClose = () => {
    if (isDirty()) {
      if (!confirm("¿Estás seguro de que deseas salir? Los datos no guardados se perderán.")) {
        return;
      }
    }
    
    // Si estamos dentro de un iframe/modal en la misma aplicación
    if (typeof window !== "undefined" && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "CLOSE_FORM_GUIDE" }, "*");
    } else {
      window.close();
    }
  };

  const generateReportParts = () => {
    const part1Lines: string[] = [];
    const templates = config.templates || {};
    const ubiPrefix = templates.ubicacion_prefix || "Ubicación de la caja CTO";
    const danosPrefix = templates.danos_prefix || "Estado de la CTO";
    const llavesPrefix = templates.llaves_prefix || "Se requieren llaves para acceder a la CTO";
    const llavesPresident = templates.llaves_president || "Presidente/Conserje";
    const llavesPhone = templates.llaves_phone || "Teléfono";
    const llavesNodata = templates.llaves_nodata || "Sin datos de contacto";
    const antalaYes = config.antala?.text_yes || "Se realiza sincronismo/levantamiento en Antala. Se realizan etiquetas de caja, cable y divisor.";
    const antalaFailed = config.antala?.text_failed || "No se ha podido realizar el sincronismo/levantamiento en Antala debido a que:";
    const influenciaTitle = templates.influencia_title || "Área de influencia";

    // 1. Ubicación
    if (ubicacionOption) {
      let finalUbi = ubicacionOption;
      const details: string[] = [];
      if (ubicacionPlantaTipo && ubicacionPlantaTipo !== "Sin especificar") {
        details.push(ubicacionPlantaTipo);
      }
      if (ubicacionPlantaNumero.trim()) {
        details.push(`Planta ${ubicacionPlantaNumero.trim()}`);
      }
      if (ubicacionOption.toLowerCase().includes("otro") && ubicacionOtros.trim()) {
        finalUbi = ubicacionOtros.trim();
      } else if (details.length > 0) {
        finalUbi += ` (${details.join(" - ")})`;
      }
      part1Lines.push(`- ${ubiPrefix}: ${finalUbi}`);
    }

    // 2. Daños
    if (tieneDanos === true) {
      const selectedDanos: string[] = [];
      const keysMap: Record<DamageKey, string> = {
        tapa: "Le falta la tapa",
        rotos: "Tiene cables rotos o daños",
        doblados: "Tiene cables doblados",
        cerrar: "No se puede cerrar",
        sucia: "Está sucia y/o llena de agua",
        enfrentadores: "Le faltan enfrentadores",
        splitterRoto: "Tiene los divisores/splitter rotos",
        otro: "Otro daño"
      };
      (Object.keys(danosChecked) as DamageKey[]).forEach(k => {
        if (danosChecked[k]) {
          if (k === "otro") {
            selectedDanos.push(danosOtroTexto.trim() ? danosOtroTexto.trim() : (lang === "es" ? "Otro daño" : "Інше пошкодження"));
          } else if (keysMap[k]) {
            selectedDanos.push(keysMap[k]);
          }
        }
      });
      if (selectedDanos.length > 0) {
        part1Lines.push(`- ${danosPrefix}: ${selectedDanos.join(", ")}`);
      }
    }

    // 3. Llaves
    if (requiereLlaves === true) {
      const contacts: string[] = [];
      if (llavesNombre.trim()) contacts.push(`${llavesPresident}: ${llavesNombre.trim()}`);
      if (llavesTelefono.trim()) contacts.push(`${llavesPhone}: ${llavesTelefono.trim()}`);
      const contactStr = contacts.length > 0 ? contacts.join(" - ") : llavesNodata;
      part1Lines.push(`- ${llavesPrefix}. ${contactStr}`);
    }

    // 4. Antala
    const threshold = config.threshold || 22.99;
    const noSignalVal = config.noSignalValue || 70.0;
    const antalaErrors: string[] = [];
    splitters.forEach((s, idx) => {
      if (!s.signal) return;
      const clean = s.signal.trim().replace(",", ".");
      const numVal = Math.abs(parseFloat(clean));
      if (!isNaN(numVal)) {
        if (numVal === noSignalVal) {
          antalaErrors.push(`- No hay señal en el divisor ${idx + 1}`);
        } else if (numVal > threshold) {
          antalaErrors.push(`- La señal es elevada en el divisor ${idx + 1}`);
        }
      }
    });
    if (requiereAntala === true) {
      const labelingText = "Se realizan etiquetas de caja, cable y divisor.";
      if (antalaErrors.length > 0) {
        part1Lines.push(`- ${antalaFailed}\n${antalaErrors.map(ae => `  ${ae}`).join("\n")}`);
        part1Lines.push(`- ${labelingText}`);
      } else {
        part1Lines.push(`- ${antalaYes}`);
        if (!antalaYes.includes(labelingText)) {
          part1Lines.push(`- ${labelingText}`);
        }
      }
    }

    // 5. Señales de Splitters
    const formatSignal = (val: string) => {
      const clean = val.trim().replace(/^-+/, "").replace(",", ".");
      if (!clean) return "";
      if (clean.toLowerCase() === "lo") return "-LO";
      const num = parseFloat(clean);
      if (!isNaN(num)) {
        return `-${num.toFixed(2)}`;
      }
      return `-${clean}`;
    };

    const signalNumbers = splitters
      .map(s => formatSignal(s.signal))
      .filter(s => s !== "");
    const part2Text = signalNumbers.join("\n");

    // 6. Área de influencia
    const part3Lines: string[] = [];
    const influenciaParts: string[] = [];
    if (influenciaAreaAuto.trim()) {
      influenciaParts.push(influenciaAreaAuto.trim());
    }
    if (influenciaPorterillo) {
      influenciaParts.push("Se adjunta foto del porterillo automático");
    }
    if (influenciaCalle) {
      callesList.forEach(c => {
        if (c.trim()) {
          influenciaParts.push(`Vía pública: ${c.trim()}`);
        }
      });
    }
    if (influenciaOtros && influenciaOtrosTexto.trim()) {
      influenciaParts.push(`Otros: ${influenciaOtrosTexto.trim()}`);
    }
    if (influenciaParts.length > 0) {
      if (influenciaParts.length === 1 && /^area de influencia\s*:/i.test(influenciaParts[0])) {
        part3Lines.push(influenciaParts[0]);
      } else {
        part3Lines.push(`- ${influenciaTitle}:`);
        influenciaParts.forEach(ip => {
          const cleanIp = ip.replace(/^area de influencia\s*:\s*/i, "");
          part3Lines.push(`  * ${cleanIp}`);
        });
      }
    }

    const signalComments: string[] = [];
    splitters.forEach((s, idx) => {
      if (!s.signal) return;
      const clean = s.signal.trim().replace(",", ".");
      const numVal = Math.abs(parseFloat(clean));
      if (!isNaN(numVal)) {
        if (numVal === noSignalVal) {
          signalComments.push(`No hay señal en el splitter/divisor ${idx + 1}. Necesaria intervención.`);
        } else if (numVal > threshold) {
          signalComments.push(`La señal del divisor ${idx + 1} es elevada, es necesario intervención para mejorarla.`);
        }
      }
    });

    return {
      part1: part1Lines.join("\n"),
      part2: part2Text,
      part2Comment: signalComments.join("\n"),
      part3: part3Lines.join("\n")
    };
  };

  const generateReportText = () => {
    const { part1, part2, part2Comment, part3 } = generateReportParts();
    const parts = [];
    if (part1) parts.push(part1);
    
    let part2Full = part2;
    if (part2Comment) {
      part2Full = `${part2}\n\n${part2Comment}`;
    }
    if (part2Full) parts.push(`\n\n${part2Full}\n\n`);
    
    if (part3) parts.push(part3);
    return parts.join("\n");
  };

  const handleSaveAndShow = async () => {
    const reportText = generateReportText();
    const { part1, part2, part2Comment, part3 } = generateReportParts();
    setGeneratedComment(reportText);
    setCommentPart1(part1);
    setCommentPart2(part2);
    setCommentPart2Comment(part2Comment || "");
    setCommentPart3(part3);
    setShowResultModal(true);
    setSaving(true);

    try {
      const selectedDanosKeys = (Object.keys(danosChecked) as DamageKey[]).filter(k => danosChecked[k]);
      
      let finalUbi = ubicacionOption;
      const details: string[] = [];
      if (ubicacionPlantaTipo && ubicacionPlantaTipo !== "Sin especificar") {
        details.push(ubicacionPlantaTipo);
      }
      if (ubicacionPlantaNumero.trim()) {
        details.push(`Planta ${ubicacionPlantaNumero.trim()}`);
      }
      if (ubicacionOption.toLowerCase().includes("otro") && ubicacionOtros.trim()) {
        finalUbi = ubicacionOtros.trim();
      } else if (details.length > 0) {
        finalUbi += ` (${details.join(" - ")})`;
      }

      const formattedSplitters = splitters.map(s => {
        const clean = s.signal.trim().replace(/^-+/, "").replace(",", ".");
        if (!clean) return { signal: "" };
        if (clean.toLowerCase() === "lo") return { signal: "-LO" };
        const num = parseFloat(clean);
        if (!isNaN(num)) {
          return { signal: `-${num.toFixed(2)}` };
        }
        return { signal: `-${clean}` };
      });

      const payload = {
        lang,
        ubicacion: finalUbi,
        ubicacionOption,
        ubicacionPlantaTipo,
        ubicacionPlantaNumero,
        ubicacionOtros,
        danos: tieneDanos ? selectedDanosKeys.map(k => (k === "otro" && danosOtroTexto.trim()) ? danosOtroTexto.trim() : t.danosOptions[k]) : [],
        danosKeys: selectedDanosKeys,
        danosOtroTexto,
        requiereLlaves,
        llavesNombre,
        llavesTelefono,
        llavesNoDatos,
        splitters: formattedSplitters,
        requiereAntala,
        influenciaPorterillo,
        influenciaCalle,
        callesList: callesList.filter(c => c.trim() !== ""),
        influenciaOtros,
        influenciaOtrosTexto,
        influenciaAreaAuto,
        generatedComment: reportText,
        commentPart1: part1,
        commentPart2: part2,
        commentPart2Comment: part2Comment || "",
        commentPart3: part3
      };

      const res = await fetch(`/api/ctos/${ctoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentText: reportText, 
          formDataJson: JSON.stringify(payload),
          hasFormulario: true
        })
      });

      if (!res.ok) {
        alert("Atención: El comentario se generó pero no se pudo guardar en el servidor. Cópialo manualmente.");
      } else {
        if (typeof window !== "undefined" && window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "FORM_GUIDE_SAVED", ctoId }, "*");
        }
      }
    } catch (err) {
      console.error(err);
      alert("Error al conectar con el servidor. Cópialo manualmente.");
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedComment);
    alert("¡Comentario copiado al portapapeles con éxito!");
  };

  // Translations dictionary
  const t = {
    title: lang === "es" ? "Guía de Formulario de Auditoría" : "Посібник з аудиту форми",
    subtitle: lang === "es" ? `CTO número: ${ctoNum}` : `CTO номер: ${ctoNum}`,
    stepLabel: lang === "es" ? `Paso ${currentStep} de 6` : `Крок ${currentStep} з 6`,
    
    // Q1
    q1Title: lang === "es" ? "1. ¿Dónde se encuentra la CTO?" : "1. Де знаходиться CTO?",
    q1Label: lang === "es" ? "Selecciona la ubicación:" : "Оберіть розташування:",
    q1WriteOther: lang === "es" ? "Especifica la planta o detalles (opcional):" : "Вкажіть поверх або деталі (опціонально):",

    // Q2
    q2Title: lang === "es" ? "2. ¿La CTO tiene daños o suciedad visible?" : "2. Чи має CTO видимі пошкодження або бруд?",
    yes: lang === "es" ? "Sí" : "Так",
    no: lang === "es" ? "No" : "Ні",
    danosLabel: lang === "es" ? "Marca los problemas detectados:" : "Позначте виявлені проблеми:",
    danosOptions: {
      tapa: lang === "es" ? "Le falta la tapa" : "Відсутня кришка",
      rotos: lang === "es" ? "Tiene cables rotos o dañados" : "Має обірвані або пошкоджені кабелі",
      doblados: lang === "es" ? "Tiene cables doblados" : "Має загнуті кабелі",
      cerrar: lang === "es" ? "No se puede cerrar" : "Не закривається",
      sucia: lang === "es" ? "Está sucia y/o llena de agua" : "Брудна та/або заповнена водою",
      enfrentadores: lang === "es" ? "Le faltan enfrentadores" : "Відсутні з'єднувачі/адаптери",
      splitterRoto: lang === "es" ? "Tiene los divisores/splitter rotos" : "Має зламані дільники/спліттери",
      otro: lang === "es" ? "Otro (introducir manualmente)" : "Інше (ввести вручну)"
    },
    danosOtroLabel: lang === "es" ? "Especifica otros daños:" : "Вкажіть інші пошкодження:",

    // Q3
    q3Title: lang === "es" ? "3. ¿Se requieren llaves?" : "3. Чи потрібні ключі?",
    llavesName: lang === "es" ? "Nombre del presidente / conserje (opcional)" : "Ім'я голови / консьєржа (опціонально)",
    llavesPhone: lang === "es" ? "Número de teléfono (opcional)" : "Номер телефону (опціонально)",
    llavesCheckbox: lang === "es" ? "No tengo ningún dato de contacto" : "Немає жодних контактних даних",

    // Q4
    q4Title: lang === "es" ? "4. Indicar señal de Divisores" : "4. Вказати сигнал дільників",
    q4Help: lang === "es" ? "Introduce la potencia sin el signo menos (se añadirá automáticamente). Ej: 22.15" : "Введіть потужність без мінуса (він додасться автоматично). Напр: 22.15",
    splitterNum: lang === "es" ? "Divisor" : "Дільник",
    addSplitterBtn: lang === "es" ? "Agregar divisor" : "Додати дільник",

    // Q5
    q5Title: lang === "es" ? "5. ¿Se requiere Levantamiento en Antala?" : "5. Чи потрібне внесення в Antala?",

    // Q6
    q6Title: lang === "es" ? "6. Área de influencia" : "6. Зона впливу",
    calleTipoLabel: lang === "es" ? "Tipo de vía:" : "Тип вулиці:",
    calleNombreLabel: lang === "es" ? "Nombre de la vía (calle/avenida):" : "Назва вулиці (вулиця/проспект):",
    calleNumerosLabel: lang === "es" ? "Números de portales:" : "Номери будинків:",
    addCalleNumBtn: lang === "es" ? "Agregar número" : "Додати номер",
    influenciaOptions: {
      porterillo: lang === "es" ? "Porterillo automático" : "Домофон",
      calle: lang === "es" ? "Calle / Vía pública" : "Вулиця / Громадське місце",
      otros: lang === "es" ? "Otros (introducir manualmente)" : "Інше (ввести вручную)"
    },
    influenciaOtrosLabel: lang === "es" ? "Detalla otros elementos:" : "Вкажіть інші елементи:",

    // Navigation buttons
    next: lang === "es" ? "Siguiente" : "Далі",
    skip: lang === "es" ? "Saltar" : "Пропустити",
    back: lang === "es" ? "Atrás" : "Назад",
    submitBtn: lang === "es" ? "Guardar y ver comentario" : "Зберегти та переглянути коментар"
  };

  function ubiRequiresInput(val: string) {
    const v = val.toLowerCase();
    return (
      v.includes("indicar") ||
      v.includes("otros") ||
      v.includes("techo falso") ||
      v.includes("registro") ||
      v.includes("pared") ||
      v.includes("стіні") ||
      v.includes("коробці") ||
      v.includes("стелі") ||
      v.includes("інше") ||
      v.includes("вказати")
    );
  }

  const checkHasAntalaErrors = () => {
    const threshold = config?.threshold || 22.99;
    const noSignalVal = config?.noSignalValue || 70.0;
    let hasErrors = false;

    splitters.forEach(s => {
      if (!s.signal) return;
      const clean = s.signal.trim().replace(",", ".");
      const numVal = Math.abs(parseFloat(clean));
      if (!isNaN(numVal)) {
        if (numVal === noSignalVal || numVal > threshold) {
          hasErrors = true;
        }
      }
    });

    return hasErrors;
  };

  // Navigate forward
  const nextStep = () => {
    if (currentStep === 4) {
      // Formatear automáticamente cualquier potencia a dos decimales xx.xx
      const updated = splitters.map(s => {
        const raw = s.signal.trim().replace(/^-+/, "").replace(",", ".");
        if (!raw || raw.toLowerCase() === "lo") return s;
        const num = parseFloat(raw);
        if (!isNaN(num)) {
          return { ...s, signal: num.toFixed(2) };
        }
        return s;
      });
      setSplitters(updated);
    }
    if (currentStep < 6) setCurrentStep(currentStep + 1);
  };

  // Navigate backward
  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  // Skip question
  const skipStep = () => {
    if (currentStep === 1) {
      setUbicacionOption("");
      setUbicacionOtros("");
    } else if (currentStep === 2) {
      setTieneDanos(null);
      setDanosChecked({
        tapa: false, rotos: false, doblados: false, cerrar: false, sucia: false, enfrentadores: false, splitterRoto: false, otro: false
      });
      setDanosOtroTexto("");
    } else if (currentStep === 3) {
      setRequiereLlaves(null);
      setLlavesNombre("");
      setLlavesTelefono("");
      setLlavesNoDatos(false);
    } else if (currentStep === 4) {
      setSplitters([{ signal: "" }]);
    } else if (currentStep === 5) {
      setRequiereAntala(null);
    }

    if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-color, #0f172a)",
      color: "var(--text-color, #f8fafc)",
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      padding: "2.5rem 1rem",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center"
    }}>
      {/* CSS Animaciones y transiciones premium */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-step {
          animation: slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .survey-btn-option {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .survey-btn-option:hover {
          background-color: rgba(255, 255, 255, 0.08) !important;
          border-color: rgba(255, 255, 255, 0.2) !important;
        }
        .survey-input {
          transition: all 0.2s ease-in-out;
        }
        .survey-input:focus {
          border-color: var(--primary-color, #3b82f6) !important;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15) !important;
          outline: none;
        }
      `}} />

      <div style={{ maxWidth: "540px", width: "100%" }}>
        
        {/* Header / Selector de Idioma */}
        <header style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          background: "var(--card-bg, rgba(30, 41, 59, 0.45))",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
          borderRadius: "16px",
          padding: "16px 20px",
          boxShadow: "0 10px 30px -10px rgba(0,0,0,0.3)"
        }}>
          <div>
            <h1 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, letterSpacing: "-0.02em", color: "var(--text-color, #ffffff)" }}>{t.title}</h1>
            <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 500 }}>{t.subtitle}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {hasSavedForm && (
              <button
                type="button"
                onClick={() => {
                  const { part1, part2, part2Comment, part3 } = generateReportParts();
                  const full = generateReportText();
                  setGeneratedComment(full);
                  setCommentPart1(part1);
                  setCommentPart2(part2);
                  setCommentPart2Comment(part2Comment || "");
                  setCommentPart3(part3);
                  setShowResultModal(true);
                }}
                className="btn btn-primary"
                style={{ minHeight: "32px", fontSize: "0.76rem", padding: "4px 10px", borderRadius: "8px", fontWeight: 700, display: "flex", alignItems: "center", gap: "5px" }}
                title="Abrir resumen de copiado"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>{lang === "es" ? "Abrir Resumen" : "Підсумок"}</span>
              </button>
            )}

            <div style={{ display: "flex", gap: "4px", background: "rgba(15, 23, 42, 0.4)", padding: "4px", borderRadius: "10px" }}>
              <button 
                onClick={() => setLang("es")} 
                style={{
                  background: lang === "es" ? "var(--primary-color, #FF7900)" : "transparent",
                  color: "white", border: "none", borderRadius: "7px", padding: "6px 12px", fontWeight: 700, cursor: "pointer", fontSize: "0.75rem",
                  transition: "all 0.2s"
                }}
              >
                ESP
              </button>
              <button 
                onClick={() => setLang("uk")} 
                style={{
                  background: lang === "uk" ? "var(--primary-color, #FF7900)" : "transparent",
                  color: "white", border: "none", borderRadius: "7px", padding: "6px 12px", fontWeight: 700, cursor: "pointer", fontSize: "0.75rem",
                  transition: "all 0.2s"
                }}
              >
                UKR
              </button>
            </div>

            {/* X Close Button */}
            <button 
              onClick={handleClose}
              style={{
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.1))",
                borderRadius: "50%",
                width: "36px",
                height: "36px",
                color: "var(--text-color, #94a3b8)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.85rem",
                fontWeight: 700,
                transition: "all 0.2s"
              }}
            >
              ✕
            </button>
          </div>
        </header>

        {/* Progress Bar */}
        <div style={{ marginBottom: "2rem", padding: "0 4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "#64748b", marginBottom: "8px", fontWeight: 700 }}>
            <span style={{ color: "var(--primary-color, #3b82f6)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t.stepLabel}</span>
            <span>{Math.round((currentStep / 6) * 100)}%</span>
          </div>
          <div style={{ height: "6px", background: "rgba(255,255,255,0.05)", borderRadius: "100px", overflow: "hidden" }}>
            <div style={{ height: "100%", background: "var(--primary-color, #f97316)", width: `${(currentStep / 6) * 100}%`, borderRadius: "100px", transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }} />
          </div>
        </div>

        {/* Steps container */}
        <main style={{ minHeight: "330px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          
          <div className="animate-step" style={{ 
            background: "var(--card-bg, rgba(30, 41, 59, 0.45))", 
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))", 
            borderRadius: "24px", 
            padding: "2rem", 
            boxShadow: "0 20px 40px -15px rgba(0,0,0,0.3)", 
            marginBottom: "1.5rem" 
          }}>
            
            {/* STEP 1: UBICACIÓN */}
            {currentStep === 1 && (
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 6px 0", color: "var(--text-color, #ffffff)", letterSpacing: "-0.02em" }}>{t.q1Title}</h2>
                <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0 0 20px 0" }}>{t.q1Label}</p>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {config.ubicacion?.options?.filter((opt: any) => {
                    const es = opt.es.toLowerCase();
                    return !es.includes("indicar");
                  }).map((opt: any, i: number) => {
                    const normalizedOpt = opt.es === "Interior > en techo falso" ? "Interior - En techo falso" : 
                                          opt.es === "Registro" ? "En Registro" : opt.es;
                    const isSelected = ubicacionOption === normalizedOpt;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setUbicacionOption(normalizedOpt);
                          if (!ubiRequiresInput(normalizedOpt)) {
                            setUbicacionOtros("");
                            setUbicacionPlantaTipo("");
                            setUbicacionPlantaNumero("");
                            setCurrentStep(2);
                          }
                        }}
                        style={{
                          textAlign: "left", padding: "14px 18px", borderRadius: "14px", 
                          border: isSelected ? "2px solid var(--primary-color, #3b82f6)" : "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                          background: isSelected ? "var(--primary-color, #f97316)" : "var(--card-bg, #1e293b)", 
                          color: isSelected ? "#ffffff" : "var(--text-color, #f8fafc)", 
                          cursor: "pointer", fontWeight: 600, fontSize: "0.88rem"
                        }}
                        className={!isSelected ? "survey-btn-option" : ""}
                      >
                        {lang === "es" ? normalizedOpt : opt.uk}
                      </button>
                    );
                  })}
                </div>

                {ubicacionOption && (
                  <div style={{ marginTop: "20px", background: "rgba(15, 23, 42, 0.08)", padding: "16px", borderRadius: "14px", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.06))", animation: "slideIn 0.25s ease-out", display: "flex", flexDirection: "column", gap: "12px" }}>
                    
                    {/* Si selecciona 'Otros', mostrar cuadro de texto libre editable */}
                    {ubicacionOption.toLowerCase().includes("otro") ? (
                      <div>
                        <label style={{ display: "block", fontSize: "0.82rem", color: "#64748b", marginBottom: "8px", fontWeight: 700 }}>
                          {lang === "es" ? "Especifica la ubicación de la CTO (texto libre):" : "Вкажіть розташування CTO (довільний текст):"}
                        </label>
                        <input 
                          type="text"
                          value={ubicacionOtros}
                          onChange={e => setUbicacionOtros(e.target.value)}
                          placeholder={lang === "es" ? "Ej: Fachada, Garaje comunitario, Azotea..." : "Напр: Фасад, Гараж..."}
                          className="survey-input"
                          style={{ width: "100%", padding: "12px 16px", borderRadius: "12px", background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))", color: "var(--text-color, white)", fontSize: "0.9rem" }}
                        />
                      </div>
                    ) : (
                      <>
                        <div>
                          <label style={{ display: "block", fontSize: "0.82rem", color: "#64748b", marginBottom: "8px", fontWeight: 700 }}>
                            {lang === "es" ? "Tipo de instalación en planta (opcional):" : "Тип встановлення на поверсі (опціонально):"}
                          </label>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            {[
                              { es: "de metal, grande", uk: "металевий, великий" },
                              { es: "de madera", uk: "дерев'яний" },
                              { es: "en vertical", uk: "вертикальний" },
                              { es: "Sin especificar", uk: "Без уточнення" }
                            ].map((tOpt, idx) => {
                              const isSubSelected = ubicacionPlantaTipo === tOpt.es;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setUbicacionPlantaTipo(tOpt.es)}
                                  style={{
                                    padding: "10px", borderRadius: "10px", 
                                    border: isSubSelected ? "2px solid var(--primary-color, #3b82f6)" : "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                                    background: isSubSelected ? "var(--primary-color, #f97316)" : "var(--card-bg, #1e293b)",
                                    color: isSubSelected ? "#ffffff" : "var(--text-color, #f8fafc)",
                                    cursor: "pointer", fontSize: "0.8rem", fontWeight: 600
                                  }}
                                >
                                  {lang === "es" ? tOpt.es : tOpt.uk}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "0.82rem", color: "#64748b", marginBottom: "6px", fontWeight: 700 }}>
                            {lang === "es" ? "Indica el número de la planta (opcional):" : "Вкажіть номер поверху (опціонально):"}
                          </label>
                          <input 
                            type="text"
                            value={ubicacionPlantaNumero}
                            onChange={e => setUbicacionPlantaNumero(e.target.value)}
                            placeholder="Ej: 3, Bajo, Atico..."
                            className="survey-input"
                            style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))", color: "var(--text-color, white)", fontSize: "0.88rem" }}
                          />
                        </div>
                      </>
                    )}

                  </div>
                )}
              </div>
            )}

            {/* STEP 2: DAÑOS */}
            {currentStep === 2 && (
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 16px 0", color: "var(--text-color, #ffffff)", letterSpacing: "-0.02em" }}>{t.q2Title}</h2>
                
                <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
                  <button 
                    type="button" 
                    onClick={() => setTieneDanos(true)}
                    style={{
                      flex: 1, padding: "14px", borderRadius: "14px", 
                      border: tieneDanos === true ? "2px solid #ef4444" : "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                      background: tieneDanos === true ? "#ef4444" : "var(--card-bg, #1e293b)", 
                      color: tieneDanos === true ? "#ffffff" : "var(--text-color, #f1f5f9)", 
                      fontWeight: 700, cursor: "pointer", fontSize: "0.9rem"
                    }}
                    className={tieneDanos !== true ? "survey-btn-option" : ""}
                  >
                    {t.yes}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => {
                      setTieneDanos(false);
                      setDanosChecked({
                        tapa: false, rotos: false, doblados: false, cerrar: false, sucia: false, enfrentadores: false, splitterRoto: false, otro: false
                      });
                      setDanosOtroTexto("");
                      setCurrentStep(3);
                    }}
                    style={{
                      flex: 1, padding: "14px", borderRadius: "14px", 
                      border: tieneDanos === false ? "2px solid #10b981" : "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                      background: tieneDanos === false ? "#10b981" : "var(--card-bg, #1e293b)", 
                      color: tieneDanos === false ? "#ffffff" : "var(--text-color, #f1f5f9)", 
                      fontWeight: 700, cursor: "pointer", fontSize: "0.9rem"
                    }}
                    className={tieneDanos !== false ? "survey-btn-option" : ""}
                  >
                    {t.no}
                  </button>
                </div>

                {tieneDanos === true && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "var(--card-bg, #1e293b)", padding: "16px", borderRadius: "14px", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.06))", animation: "slideIn 0.25s ease-out" }}>
                    <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{t.danosLabel}</span>
                    
                    {(Object.keys(danosChecked) as DamageKey[]).map((key) => (
                      <div key={key}>
                        <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", fontSize: "0.88rem", padding: "4px 0" }}>
                          <input 
                            type="checkbox"
                            checked={danosChecked[key]}
                            onChange={e => setDanosChecked({ ...danosChecked, [key]: e.target.checked })}
                            style={{ width: "18px", height: "18px", accentColor: "#ef4444" }}
                          />
                          <span style={{ color: "var(--text-color, #e2e8f0)" }}>{t.danosOptions[key]}</span>
                        </label>
                        {key === "otro" && danosChecked.otro && (
                          <div style={{ marginTop: "6px", marginLeft: "30px" }}>
                            <input
                              type="text"
                              value={danosOtroTexto}
                              onChange={e => setDanosOtroTexto(e.target.value)}
                              placeholder={lang === "es" ? "Especifica el daño..." : "Вкажіть пошкодження..."}
                              className="survey-input"
                              style={{
                                width: "100%",
                                padding: "8px 12px",
                                borderRadius: "8px",
                                background: "var(--bg-color, #0f172a)",
                                border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                                color: "var(--text-color, white)",
                                fontSize: "0.85rem"
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: LLAVES */}
            {currentStep === 3 && (
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 16px 0", color: "var(--text-color, #ffffff)", letterSpacing: "-0.02em" }}>{t.q3Title}</h2>
                
                <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
                  <button 
                    type="button" 
                    onClick={() => setRequiereLlaves(true)}
                    style={{
                      flex: 1, padding: "14px", borderRadius: "14px", 
                      border: requiereLlaves === true ? "2px solid var(--primary-color, #f59e0b)" : "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                      background: requiereLlaves === true ? "var(--primary-color, #f59e0b)" : "var(--card-bg, #1e293b)", 
                      color: requiereLlaves === true ? "#ffffff" : "var(--text-color, #f1f5f9)", 
                      fontWeight: 700, cursor: "pointer", fontSize: "0.9rem"
                    }}
                    className={requiereLlaves !== true ? "survey-btn-option" : ""}
                  >
                    {t.yes}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => { 
                      setRequiereLlaves(false); 
                      setLlavesNombre(""); 
                      setLlavesTelefono(""); 
                      setLlavesNoDatos(false);
                      setCurrentStep(4);
                    }}
                    style={{
                      flex: 1, padding: "14px", borderRadius: "14px", 
                      border: requiereLlaves === false ? "2px solid #10b981" : "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                      background: requiereLlaves === false ? "#10b981" : "var(--card-bg, #1e293b)", 
                      color: requiereLlaves === false ? "#ffffff" : "var(--text-color, #f1f5f9)", 
                      fontWeight: 700, cursor: "pointer", fontSize: "0.9rem"
                    }}
                    className={requiereLlaves !== false ? "survey-btn-option" : ""}
                  >
                    {t.no}
                  </button>
                </div>

                {requiereLlaves === true && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "14px", background: "var(--card-bg, #1e293b)", padding: "18px", borderRadius: "16px", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.06))", animation: "slideIn 0.25s ease-out" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", color: "#64748b", marginBottom: "6px", fontWeight: 600 }}>{t.llavesName}</label>
                      <input 
                        type="text"
                        value={llavesNombre}
                        onChange={e => {
                          setLlavesNombre(e.target.value);
                          if (e.target.value.trim()) setLlavesNoDatos(false);
                        }}
                        placeholder="Ej: Conserje Pedro"
                        disabled={llavesNoDatos}
                        className="survey-input"
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", background: "var(--bg-color, #0f172a)", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))", color: "var(--text-color, white)", fontSize: "0.88rem" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", color: "#64748b", marginBottom: "6px", fontWeight: 600 }}>{t.llavesPhone}</label>
                      <input 
                        type="text"
                        value={llavesTelefono}
                        onChange={e => {
                          setLlavesTelefono(e.target.value);
                          if (e.target.value.trim()) setLlavesNoDatos(false);
                        }}
                        placeholder="Ej: 666777888"
                        disabled={llavesNoDatos}
                        className="survey-input"
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", background: "var(--bg-color, #0f172a)", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))", color: "var(--text-color, white)", fontSize: "0.88rem" }}
                      />
                    </div>

                    <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "0.82rem", color: "#64748b", borderTop: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))", paddingTop: "12px", marginTop: "4px", fontWeight: 600 }}>
                      <input 
                        type="checkbox"
                        checked={llavesNoDatos}
                        onChange={e => {
                          setLlavesNoDatos(e.target.checked);
                          if (e.target.checked) {
                            setLlavesNombre("");
                            setLlavesTelefono("");
                          }
                        }}
                        style={{ width: "16px", height: "16px", accentColor: "#f59e0b" }}
                      />
                      <span>{t.llavesCheckbox}</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: SPLITTERS */}
            {currentStep === 4 && (
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 6px 0", color: "var(--text-color, #ffffff)", letterSpacing: "-0.02em" }}>{t.q4Title}</h2>
                <p style={{ display: "block", fontSize: "0.8rem", color: "#64748b", marginBottom: "20px" }}>{t.q4Help}</p>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
                  {splitters.map((s, idx) => (
                    <div key={idx} style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <span style={{ fontSize: "0.85rem", width: "75px", fontWeight: 700, color: "#94a3b8" }}>{t.splitterNum} {idx + 1}:</span>
                      <div style={{ position: "relative", flex: 1 }}>
                        <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontWeight: 700 }}>-</span>
                        <input 
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*\.?[0-9]*"
                          value={s.signal}
                          onChange={e => updateSplitterSignal(idx, e.target.value)}
                          onBlur={() => formatSplitterSignalOnBlur(idx)}
                          placeholder="22.15"
                          className="survey-input"
                          style={{ width: "100%", padding: "10px 12px 10px 24px", borderRadius: "10px", background: "var(--card-bg, #1e293b)", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))", color: "var(--text-color, white)", fontSize: "0.9rem" }}
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={() => removeSplitter(idx)}
                        disabled={splitters.length <= 1}
                        style={{
                          background: "rgba(239, 68, 68, 0.15)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "10px", width: "38px", height: "38px", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", opacity: splitters.length <= 1 ? 0.3 : 1, transition: "all 0.2s"
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {splitters.length < 6 && (
                  <button 
                    type="button"
                    onClick={addSplitter}
                    style={{
                      width: "100%", padding: "10px", borderRadius: "10px", border: "1px dashed var(--primary-color, rgba(59, 130, 246, 0.4))", background: "none",
                      color: "var(--primary-color, #60a5fa)", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem", transition: "all 0.2s"
                    }}
                  >
                    + {t.addSplitterBtn}
                  </button>
                )}
              </div>
            )}

            {/* STEP 5: ANTALA */}
            {currentStep === 5 && (
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 16px 0", color: "var(--text-color, #ffffff)", letterSpacing: "-0.02em" }}>{t.q5Title}</h2>
                
                <div style={{ display: "flex", gap: "12px" }}>
                  <button 
                    type="button" 
                    onClick={() => {
                      setRequiereAntala(true);
                      setCurrentStep(6);
                    }}
                    style={{
                      flex: 1, padding: "14px", borderRadius: "14px", 
                      border: requiereAntala === true ? "2px solid var(--primary-color, #3b82f6)" : "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                      background: requiereAntala === true ? "var(--primary-color, #3b82f6)" : "var(--card-bg, #1e293b)", 
                      color: requiereAntala === true ? "#ffffff" : "var(--text-color, #f1f5f9)", 
                      fontWeight: 700, cursor: "pointer", fontSize: "0.9rem"
                    }}
                    className={requiereAntala !== true ? "survey-btn-option" : ""}
                  >
                    {t.yes}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => {
                      setRequiereAntala(false);
                      setCurrentStep(6);
                    }}
                    style={{
                      flex: 1, padding: "14px", borderRadius: "14px", 
                      border: requiereAntala === false ? "2px solid #10b981" : "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                      background: requiereAntala === false ? "#10b981" : "var(--card-bg, #1e293b)", 
                      color: requiereAntala === false ? "#ffffff" : "var(--text-color, #f1f5f9)", 
                      fontWeight: 700, cursor: "pointer", fontSize: "0.9rem"
                    }}
                    className={requiereAntala !== false ? "survey-btn-option" : ""}
                  >
                    {t.no}
                  </button>
                </div>
              </div>
            )}
            {currentStep === 6 && (
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 6px 0", color: "var(--text-color, #ffffff)", letterSpacing: "-0.02em" }}>{t.q6Title}</h2>
                <p style={{ fontSize: "0.82rem", color: "#94a3b8", margin: "0 0 16px 0" }}>
                  {lang === "es" ? "Selecciona los elementos o zonas que cubre o afectan a esta CTO:" : "Оберіть елементи або зони, які охоплює ця CTO:"}
                </p>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  
                  {/* Tarjeta: Porterillo */}
                  <div 
                    onClick={() => setInfluenciaPorterillo(!influenciaPorterillo)}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "14px",
                      border: influenciaPorterillo ? "2px solid var(--primary-color, #FF7900)" : "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                      background: influenciaPorterillo ? "rgba(255, 121, 0, 0.08)" : "var(--card-bg, #1e293b)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      transition: "all 0.2s"
                    }}
                  >
                    <input 
                      type="checkbox" 
                      checked={influenciaPorterillo}
                      onChange={e => setInfluenciaPorterillo(e.target.checked)}
                      onClick={e => e.stopPropagation()}
                      style={{ width: "18px", height: "18px", accentColor: "var(--primary-color, #FF7900)", cursor: "pointer" }}
                    />
                    <div style={{ flex: 1 }}>
                      <span style={{ color: "var(--text-color, #e2e8f0)", fontWeight: 700, fontSize: "0.92rem", display: "block" }}>
                        {t.influenciaOptions.porterillo}
                      </span>
                      <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>
                        {lang === "es" ? "Se adjuntará foto del porterillo del acceso" : "Додається фото домофону"}
                      </span>
                    </div>
                  </div>

                  {/* Tarjeta: Calle */}
                  <div 
                    style={{
                      borderRadius: "14px",
                      border: influenciaCalle ? "2px solid var(--primary-color, #FF7900)" : "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                      background: influenciaCalle ? "rgba(255, 121, 0, 0.08)" : "var(--card-bg, #1e293b)",
                      overflow: "hidden",
                      transition: "all 0.2s"
                    }}
                  >
                    <div 
                      onClick={() => setInfluenciaCalle(!influenciaCalle)}
                      style={{
                        padding: "12px 16px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px"
                      }}
                    >
                      <input 
                        type="checkbox" 
                        checked={influenciaCalle}
                        onChange={e => setInfluenciaCalle(e.target.checked)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: "18px", height: "18px", accentColor: "var(--primary-color, #FF7900)", cursor: "pointer" }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{ color: "var(--text-color, #e2e8f0)", fontWeight: 700, fontSize: "0.92rem", display: "block" }}>
                          {t.influenciaOptions.calle}
                        </span>
                        <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>
                          {lang === "es" ? "Vía pública y números de portales asignados" : "Громадська вулиця та номери будинків"}
                        </span>
                      </div>
                    </div>

                    {influenciaCalle && (
                      <div style={{ padding: "0 16px 16px 16px", display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px dashed var(--border-color, rgba(255, 255, 255, 0.08))", paddingTop: "12px" }}>
                        {callesList.map((calle, idx) => (
                          <div key={idx} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <input 
                              type="text" 
                              value={calle}
                              onChange={e => updateCalle(idx, e.target.value)}
                              placeholder={lang === "es" ? "Ej: Calle de Andalucía 14" : "Наприклад: Андалузька вулиця 14"}
                              className="survey-input"
                              style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", background: "var(--bg-color, #0f172a)", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))", color: "var(--text-color, white)", fontSize: "0.85rem" }}
                            />
                            <button 
                              type="button" 
                              onClick={() => removeCalle(idx)}
                              disabled={callesList.length <= 1}
                              style={{ background: "rgba(239, 68, 68, 0.15)", color: "#f87171", border: "none", borderRadius: "8px", width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "0.85rem", opacity: callesList.length <= 1 ? 0.3 : 1 }}
                              title="Quitar calle"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        
                        <button 
                          type="button" 
                          onClick={addCalle}
                          style={{
                            alignSelf: "flex-start", padding: "6px 14px", background: "rgba(255, 121, 0, 0.12)", border: "1px dashed var(--primary-color, rgba(255, 121, 0, 0.5))", color: "var(--primary-color, #FF7900)",
                            borderRadius: "8px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px"
                          }}
                        >
                          <span>+</span> {lang === "es" ? "Añadir otra calle" : "Додати іншу вулицю"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Tarjeta: Otros */}
                  <div 
                    style={{
                      borderRadius: "14px",
                      border: influenciaOtros ? "2px solid var(--primary-color, #FF7900)" : "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                      background: influenciaOtros ? "rgba(255, 121, 0, 0.08)" : "var(--card-bg, #1e293b)",
                      overflow: "hidden",
                      transition: "all 0.2s"
                    }}
                  >
                    <div 
                      onClick={() => setInfluenciaOtros(!influenciaOtros)}
                      style={{
                        padding: "12px 16px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px"
                      }}
                    >
                      <input 
                        type="checkbox" 
                        checked={influenciaOtros}
                        onChange={e => setInfluenciaOtros(e.target.checked)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: "18px", height: "18px", accentColor: "var(--primary-color, #FF7900)", cursor: "pointer" }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{ color: "var(--text-color, #e2e8f0)", fontWeight: 700, fontSize: "0.92rem", display: "block" }}>
                          {t.influenciaOptions.otros}
                        </span>
                        <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>
                          {lang === "es" ? "Cualquier otra observación o detalle adicional" : "Будь-які інші спостереження або деталі"}
                        </span>
                      </div>
                    </div>

                    {influenciaOtros && (
                      <div style={{ padding: "0 16px 16px 16px", borderTop: "1px dashed var(--border-color, rgba(255, 255, 255, 0.08))", paddingTop: "12px" }}>
                        <label style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", marginBottom: "6px", fontWeight: 600 }}>{t.influenciaOtrosLabel}</label>
                        <textarea 
                          value={influenciaOtrosTexto}
                          onChange={e => setInfluenciaOtrosTexto(e.target.value)}
                          placeholder={lang === "es" ? "Especifica otros detalles..." : "Вкажіть інші деталі..."}
                          rows={2}
                          className="survey-input"
                          style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", background: "var(--bg-color, #0f172a)", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))", color: "var(--text-color, white)", resize: "vertical", fontSize: "0.85rem" }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Búsqueda Inteligente de Área de Influencia con IA */}
                  <div 
                    style={{
                      borderRadius: "14px",
                      border: "1.5px solid rgba(56, 189, 248, 0.3)",
                      background: "linear-gradient(145deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.6) 100%)",
                      padding: "16px",
                      marginTop: "6px",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", marginBottom: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--text-color, #f8fafc)" }}>
                          Detección Automática de Área
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <button
                        type="button"
                        onClick={handleFetchInfluenceArea}
                        disabled={loadingInfluenceArea}
                        style={{
                          width: "100%",
                          padding: "10px 16px",
                          borderRadius: "10px",
                          background: loadingInfluenceArea ? "rgba(56, 189, 248, 0.2)" : "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                          color: "#ffffff",
                          border: "none",
                          fontWeight: 700,
                          fontSize: "0.85rem",
                          cursor: loadingInfluenceArea ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          transition: "all 0.2s"
                        }}
                      >
                        {loadingInfluenceArea ? (
                          <>
                            <div style={{
                              width: "16px",
                              height: "16px",
                              border: "2px solid rgba(255,255,255,0.3)",
                              borderTopColor: "#ffffff",
                              borderRadius: "50%",
                              animation: "spin 0.8s linear infinite"
                            }} />
                            <span>Consultando mapa e IA...</span>
                          </>
                        ) : (
                          <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="11" cy="11" r="8" />
                              <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <span>Buscar Área de Influencia</span>
                          </>
                        )}
                      </button>

                      {influenceSuccess && (
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 12px",
                          borderRadius: "8px",
                          background: "rgba(16, 185, 129, 0.15)",
                          border: "1px solid rgba(16, 185, 129, 0.3)",
                          color: "#10b981",
                          fontSize: "0.78rem",
                          fontWeight: 700
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Área de influencia detectada y copiada al cuadro inferior</span>
                        </div>
                      )}

                      {/* Cuadro de texto totalmente editable para el resultado */}
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", color: "#64748b", marginBottom: "4px", fontWeight: 700 }}>
                          Texto de Área de Influencia (Editable):
                        </label>
                        <textarea
                          rows={3}
                          value={influenciaAreaAuto}
                          onChange={e => setInfluenciaAreaAuto(e.target.value)}
                          placeholder="Ej: Area de influencia : Calle Mayor 1, 3, 5 (Impares) y 2, 4, 6 (Pares)"
                          className="survey-input"
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "10px",
                            background: "var(--bg-color, #0f172a)",
                            border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))",
                            color: "var(--text-color, white)",
                            fontSize: "0.85rem",
                            resize: "vertical"
                          }}
                        />
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

          </div>

          {/* Survey Navigation Buttons */}
          <div style={{ display: "flex", gap: "12px", marginTop: "0.5rem" }}>
            
            {/* Botón Atrás */}
            {currentStep > 1 && (
              <button
                type="button"
                onClick={prevStep}
                style={{
                  flex: 1, padding: "12px 18px", borderRadius: "12px", background: "rgba(255, 255, 255, 0.06)", color: "var(--text-color, #e2e8f0)",
                  border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))", fontWeight: 700, cursor: "pointer", fontSize: "0.88rem", transition: "all 0.2s"
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)"}
              >
                {t.back}
              </button>
            )}

            {/* Botón Saltar */}
            <button
              type="button"
              onClick={skipStep}
              style={{
                flex: 1, padding: "12px 18px", borderRadius: "12px", background: "transparent", color: "#64748b",
                border: "1px solid rgba(255,255,255,0.05)", fontWeight: 700, cursor: "pointer", fontSize: "0.88rem", transition: "all 0.2s"
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#94a3b8"}
              onMouseLeave={e => e.currentTarget.style.color = "#64748b"}
            >
              {t.skip}
            </button>

            {/* Botón Siguiente / Enviar */}
            {currentStep < 6 ? (
              <button
                type="button"
                onClick={nextStep}
                className="btn btn-primary"
                style={{ flex: 1.5, justifyContent: "center", fontWeight: 700, fontSize: "0.88rem", minHeight: "44px", borderRadius: "12px" }}
              >
                {t.next}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveAndShow}
                className="btn btn-primary"
                style={{
                  flex: 1.5, justifyContent: "center", fontWeight: 800, fontSize: "0.88rem", minHeight: "44px", borderRadius: "12px",
                  boxShadow: "0 0 20px rgba(255, 121, 0, 0.25)", background: "var(--primary-color, #FF7900)"
                }}
              >
                {t.submitBtn}
              </button>
            )}

          </div>

        </main>
      </div>

      {/* RESULT MODAL (COPY COMMENT) */}
      {showResultModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(5, 8, 16, 0.9)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div className="glass-panel animate-step" style={{ width: "95%", maxWidth: "480px", padding: "2rem", background: "var(--card-bg, rgba(30, 41, 59, 0.5))", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))", borderRadius: "24px", color: "var(--text-color, white)", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", maxHeight: "90vh", overflowY: "auto" }}>
            
            <h3 style={{ margin: "0 0 10px 0", fontSize: "1.25rem", fontWeight: 800, color: "#34d399", letterSpacing: "-0.02em" }}>
              {saving ? "Guardando..." : "¡Cuestionario Guardado!"}
            </h3>
            <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0 0 20px 0", lineHeight: "1.5" }}>
              El cuestionario ha sido registrado en la CTO {ctoNum}.
            </p>

            {/* Código CTO */}
            <div style={{ marginBottom: "1.25rem" }}>
              <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, display: "block", marginBottom: "4px", textTransform: "uppercase" }}>
                Código CTO:
              </span>
              <div 
                style={{
                  width: "100%", padding: "10px 12px", background: "var(--bg-color, #f3f4f6)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "10px",
                  color: "var(--text-color, #111827)", fontFamily: "monospace", fontSize: "0.82rem", boxSizing: "border-box", textAlign: "left",
                  display: "flex", alignItems: "center", minHeight: "38px"
                }}
              >
                {(() => {
                  const parts = ctoNum.split("-");
                  if (parts.length === 3) {
                    return `${parts[0]}-${parts[2]}`;
                  }
                  return ctoNum.replace("-29-", "-");
                })()}
              </div>
              <button
                onClick={() => {
                  const parts = ctoNum.split("-");
                  const formatted = parts.length === 3 ? `${parts[0]}-${parts[2]}` : ctoNum.replace("-29-", "-");
                  navigator.clipboard.writeText(formatted);
                  alert("¡Código CTO copiado!");
                }}
                className="btn btn-primary"
                style={{ width: "100%", marginTop: "6px", minHeight: "32px", fontSize: "0.78rem", fontWeight: 700, borderRadius: "8px", background: "var(--primary-color)" }}
              >
                Copiar Código CTO
              </button>
            </div>

            {/* Bloque 1 */}
            {commentPart1 && (
              <div style={{ marginBottom: "1.25rem" }}>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, display: "block", marginBottom: "4px", textTransform: "uppercase" }}>
                  1. Datos de CTO y Antala:
                </span>
                <div 
                  style={{
                    width: "100%", padding: "10px 12px", background: "var(--bg-color, #f3f4f6)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "10px",
                    color: "var(--text-color, #111827)", fontFamily: "monospace", fontSize: "0.82rem", boxSizing: "border-box", textAlign: "left",
                    whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.4"
                  }}
                >
                  {commentPart1}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(commentPart1);
                    alert("¡Datos y Antala copiados!");
                  }}
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: "6px", minHeight: "32px", fontSize: "0.78rem", fontWeight: 700, borderRadius: "8px", background: "var(--primary-color)" }}
                >
                  Copiar Sección 1
                </button>
              </div>
            )}

            {/* Bloque 2 */}
            {commentPart2 && (
              <div style={{ marginBottom: "1.25rem" }}>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, display: "block", marginBottom: "4px", textTransform: "uppercase" }}>
                  2. Señal:
                </span>
                <div 
                  style={{
                    width: "100%", padding: "10px 12px", background: "var(--bg-color, #f3f4f6)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "10px",
                    color: "var(--text-color, #111827)", fontFamily: "monospace", fontSize: "0.82rem", boxSizing: "border-box", textAlign: "left",
                    whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.4"
                  }}
                >
                  {commentPart2}
                </div>
              </div>
            )}

            {/* Bloque 2 - Comentario de Señal */}
            {commentPart2Comment && (
              <div style={{ marginBottom: "1.25rem" }}>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, display: "block", marginBottom: "4px", textTransform: "uppercase" }}>
                  2. Comentario de Señal:
                </span>
                <div 
                  style={{
                    width: "100%", padding: "10px 12px", background: "var(--bg-color, #f3f4f6)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "10px",
                    color: "var(--text-color, #111827)", fontFamily: "monospace", fontSize: "0.82rem", boxSizing: "border-box", textAlign: "left",
                    whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.4"
                  }}
                >
                  {commentPart2Comment}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(commentPart2Comment);
                    alert("¡Comentario de señal copiado!");
                  }}
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: "6px", minHeight: "32px", fontSize: "0.78rem", fontWeight: 700, borderRadius: "8px", background: "var(--primary-color)" }}
                >
                  Copiar Sección 2
                </button>
              </div>
            )}

            {/* Bloque 3 */}
            {commentPart3 && (
              <div style={{ marginBottom: "1.25rem" }}>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, display: "block", marginBottom: "4px", textTransform: "uppercase" }}>
                  3. Área de influencia:
                </span>
                <div 
                  style={{
                    width: "100%", padding: "10px 12px", background: "var(--bg-color, #f3f4f6)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "10px",
                    color: "var(--text-color, #111827)", fontFamily: "monospace", fontSize: "0.82rem", boxSizing: "border-box", textAlign: "left",
                    whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.4"
                  }}
                >
                  {commentPart3}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(commentPart3);
                    alert("¡Área de influencia copiado!");
                  }}
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: "6px", minHeight: "32px", fontSize: "0.78rem", fontWeight: 700, borderRadius: "8px", background: "var(--primary-color)" }}
                >
                  Copiar Sección 3
                </button>
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", borderTop: "1px solid var(--border-color)", paddingTop: "15px", marginTop: "15px" }}>
              <button
                onClick={() => {
                  setShowResultModal(false);
                  if (typeof window !== "undefined" && window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: "CLOSE_FORM_GUIDE" }, "*");
                  } else {
                    window.close();
                  }
                }}
                className="btn"
                style={{ width: "100%", background: "rgba(255, 255, 255, 0.06)", color: "var(--text-color, white)", border: "1px solid var(--border-color, rgba(255, 255, 255, 0.08))", justifyContent: "center", fontWeight: 700, borderRadius: "12px", minHeight: "38px" }}
              >
                Cerrar Guía
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
