import sharp from "sharp";
import path from "path";
import { createWorker } from "tesseract.js";
import { prisma } from "@/lib/prisma";

export interface OcrResult {
  success: boolean;
  power?: string;              // ej: "-18.75" o "-70.00"
  rawNumber?: string;          // ej: "18.75"
  wavelength?: string;         // ej: "1490", "1310", "1550"
  hasWavelengthMismatch?: boolean;
  expectedWavelength?: string;
  isLo?: boolean;
  rawText?: string;
  error?: string;
}

/**
 * Pre-procesa la imagen del medidor de potencia con Sharp para maximizar la lectura de dígitos LCD
 */
async function preprocessForLcd(input: string | Buffer): Promise<Buffer> {
  try {
    return await sharp(input)
      .resize({ width: 1400, withoutEnlargement: true })
      .grayscale()
      .normalize()
      .sharpen()
      .toBuffer();
  } catch (err) {
    // Si falla el pre-procesamiento, devolver el buffer original si es Buffer
    if (Buffer.isBuffer(input)) return input;
    return await sharp(input).toBuffer();
  }
}

/**
 * Analiza el texto extraído para localizar el valor de potencia (dBm) y la longitud de onda (nm)
 */
export function parsePowerMeterText(
  text: string, 
  targetWavelength: string = "1490",
  alertWavelengths: string[] = ["1310", "1550", "850", "0850", "1625"]
): OcrResult {
  const clean = text.replace(/\r\n/g, "\n");
  
  // 1. Detección de "Lo" / "LO" / "L.O." (señal por debajo de escala -> -70.00 dBm)
  const isLo = /\b(l[o0]|l\.o\.)\b/i.test(clean);

  // 2. Detección de Longitud de Onda (nm)
  let detectedWavelength: string | undefined;
  let hasWavelengthMismatch = false;

  // Buscar patrones tipo 1490nm, 1310 nm, o números de 3-4 cifras aislados correspondientes a longitudes de onda típicas
  const wlMatches = clean.match(/\b(1490|1310|1550|850|0850|1625|1650)\s*(?:nm)?\b/i);
  if (wlMatches && wlMatches[1]) {
    const rawWl = wlMatches[1].replace(/^0+/, ""); // Normalizar 0850 a 850
    detectedWavelength = rawWl;
    
    // Si detectó una longitud de onda diferente a la normativa (1490)
    if (rawWl !== targetWavelength && (alertWavelengths.includes(rawWl) || alertWavelengths.includes("0" + rawWl))) {
      hasWavelengthMismatch = true;
    }
  }

  // 3. Detección de Potencia (dBm)
  let detectedPower: string | undefined;
  let detectedRawNumber: string | undefined;

  if (isLo) {
    detectedPower = "-70.00";
    detectedRawNumber = "70.00";
  } else {
    // 1. Buscar con signo negativo o similar explícito: ej. -18.75, ~19.50, _22.15
    const explicitMatches = Array.from(clean.matchAll(/[-~_]\s*([1-7][0-9](?:[.,][0-9]{1,2})?)/g));
    for (const m of explicitMatches) {
      const numVal = parseFloat(m[1].replace(",", "."));
      if (numVal >= 11.0 && numVal <= 70.0) {
        detectedRawNumber = numVal.toFixed(2);
        detectedPower = `-${detectedRawNumber}`;
        break;
      }
    }

    // 2. Si no tiene signo, buscar cualquier número decimal entre 11.00 y 70.00 (en fibra óptica toda medición es negativa)
    if (!detectedPower) {
      const decimalMatches = Array.from(clean.matchAll(/\b([1-7][0-9][.,][0-9]{1,2})\b/g));
      for (const m of decimalMatches) {
        const numVal = parseFloat(m[1].replace(",", "."));
        if (numVal >= 11.0 && numVal <= 70.0) {
          detectedRawNumber = numVal.toFixed(2);
          detectedPower = `-${detectedRawNumber}`;
          break;
        }
      }
    }

    // 3. Fallback: buscar número junto a dBm o dB o aislado en rango 11 a 70
    if (!detectedPower) {
      const dbmMatches = Array.from(clean.matchAll(/([1-7][0-9](?:[.,][0-9]{1,2})?)\s*(?:dBm|dB)?/gi));
      for (const m of dbmMatches) {
        const numVal = parseFloat(m[1].replace(",", "."));
        if (numVal >= 11.0 && numVal <= 70.0) {
          detectedRawNumber = numVal.toFixed(2);
          detectedPower = `-${detectedRawNumber}`;
          break;
        }
      }
    }
  }

  if (!detectedPower && !detectedWavelength) {
    return {
      success: false,
      rawText: clean,
      error: "No se reconocieron valores válidos de dBm ni longitud de onda"
    };
  }

  return {
    success: true,
    power: detectedPower,
    rawNumber: detectedRawNumber,
    wavelength: detectedWavelength,
    hasWavelengthMismatch,
    expectedWavelength: targetWavelength,
    isLo,
    rawText: clean
  };
}

/**
 * Ejecuta análisis visual con Groq Vision (Llama 3.2 Vision)
 */
export async function recognizeWithGroqVision(
  input: string | Buffer,
  config: {
    apiKey: string;
    model?: string;
    prompt?: string;
    targetWavelength?: string;
    alertWavelengths?: string[];
  }
): Promise<OcrResult> {
  const targetWl = config.targetWavelength || "1490";
  const alertWls = config.alertWavelengths || ["1310", "1550", "850", "1625"];

  let jpegBuffer: Buffer;
  try {
    jpegBuffer = await sharp(input)
      .rotate()
      .resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (err) {
    if (Buffer.isBuffer(input)) jpegBuffer = input;
    else jpegBuffer = await sharp(input).toBuffer();
  }

  const base64Image = jpegBuffer.toString("base64");
  const dataUrl = `data:image/jpeg;base64,${base64Image}`;

  const defaultPrompt = `Analiza la pantalla de este medidor de potencia óptica (OPM / Optical Power Meter). Extrae:
1. El valor de potencia en dBm (un número negativo, ej. -18.75 o -70.00 si indica Lo / LO / L.O.). En fibra óptica las potencias siempre son negativas.
2. La longitud de onda en nm (ej. 1490, 1310, 1550, 850, 1625).
Devuelve EXCLUSIVAMENTE un objeto JSON válido con este formato exacto: {"power": "-XX.XX", "wavelength": "XXXX"}`;

  const finalPrompt = (config.prompt && config.prompt.trim()) ? config.prompt.trim() : defaultPrompt;
  let model = config.model || "qwen/qwen3.6-27b";
  if (model.includes("llama-3.2")) {
    model = "qwen/qwen3.6-27b";
  }

  console.log(`[Groq Vision] Procesando imagen con modelo: ${model}...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey.trim()}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: finalPrompt + "\n\nResponde ÚNICAMENTE con el objeto JSON sin explicaciones ni markdown." },
              { type: "image_url", image_url: { url: dataUrl } }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Groq Vision] Error en la respuesta (${response.status}):`, errText);
      return { success: false, error: `Error Groq: ${response.status}` };
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    console.log("[Groq Vision] Respuesta del modelo:", content);

    if (!content) {
      return { success: false, error: "Respuesta vacía de Groq" };
    }

    // 1. Retirar bloques de pensamiento <think>...</think> si el modelo los emitió
    let cleanedText = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    let parsed: any = {};
    try {
      const jsonCandidate = cleanedText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(jsonCandidate);
    } catch (e) {
      // Buscar el último bloque {...} que suele ser el JSON de respuesta
      const matches = cleanedText.match(/\{[\s\S]*?\}/g) || content.match(/\{[\s\S]*?\}/g);
      if (matches && matches.length > 0) {
        for (let i = matches.length - 1; i >= 0; i--) {
          try {
            parsed = JSON.parse(matches[i]);
            if (parsed.power !== undefined || parsed.signal !== undefined || parsed.wavelength !== undefined) {
              break;
            }
          } catch (innerE) {}
        }
      }
    }

    // 2. Fallback de extracción por regex directa si el JSON no se formó pero el modelo lo razonó en el texto
    if (!parsed.power && !parsed.signal) {
      // Buscar patrones como "-18.2 dBm" o "power: -18.2" o "18.2 dBm"
      const powerMatch = (cleanedText || content).match(/(?:power|potencia|signal)?[^\d-]*(-?\d{1,2}[.,]\d{1,2})\s*(?:dBm|dbm)/i) ||
                         (cleanedText || content).match(/(-[1-7]\d[.,]\d{1,2})\s*(?:dBm)?/i);
      if (powerMatch) {
        parsed.power = powerMatch[1];
      } else if (/\b(?:Lo|LO|L\.O\.)\b/i.test(cleanedText || content)) {
        parsed.power = "-70.00";
      }
    }

    if (!parsed.wavelength && !parsed.longitud_onda) {
      const wlMatch = (cleanedText || content).match(/\b(1490|1310|1550|850|1625)\s*(?:nm)?\b/i);
      if (wlMatch) {
        parsed.wavelength = wlMatch[1];
      }
    }

    // 3. Normalizar potencia (dBm) SIEMPRE en formato estricto -XX.XX (con 2 decimales)
    let detectedPower: string | undefined;
    let detectedRawNumber: string | undefined;
    let isLo = false;

    const rawPowerStr = String(parsed.power || parsed.signal || parsed.potencia || "").trim();
    if (/l[o0]|l\.o\./i.test(rawPowerStr)) {
      isLo = true;
      detectedPower = "-70.00";
      detectedRawNumber = "70.00";
    } else {
      const cleanNumStr = rawPowerStr.replace(/[^-0-9.,]/g, "").replace(",", ".");
      const absVal = Math.abs(parseFloat(cleanNumStr));
      if (!isNaN(absVal) && absVal >= 10.0 && absVal <= 80.0) {
        // Formato SIEMPRE con 2 decimales (ej. -18.20 o -17.98)
        detectedRawNumber = absVal.toFixed(2);
        detectedPower = `-${detectedRawNumber}`;
      }
    }

    // 4. Normalizar longitud de onda (nm)
    let detectedWavelength: string | undefined;
    let hasWavelengthMismatch = false;

    const rawWlStr = String(parsed.wavelength || parsed.longitud_onda || parsed.nm || "").trim();
    const wlMatch = rawWlStr.match(/\b(1490|1310|1550|850|0850|1625|1650)\b/);
    if (wlMatch) {
      detectedWavelength = wlMatch[1].replace(/^0+/, "");
      if (detectedWavelength !== targetWl && alertWls.includes(detectedWavelength)) {
        hasWavelengthMismatch = true;
      }
    }

    if (!detectedPower && !detectedWavelength) {
      return {
        success: false,
        rawText: content,
        error: "No se identificaron valores válidos en la respuesta"
      };
    }

    return {
      success: true,
      power: detectedPower,
      rawNumber: detectedRawNumber,
      wavelength: detectedWavelength,
      hasWavelengthMismatch,
      expectedWavelength: targetWl,
      isLo,
      rawText: content
    };
  } catch (groqErr: any) {
    clearTimeout(timeoutId);
    console.warn("[Groq Vision] Fallo no bloqueante al consultar Groq:", groqErr?.message || groqErr);
    return {
      success: false,
      error: groqErr?.message || "Error al procesar Groq Vision"
    };
  }
}

/**
 * Ejecuta OCR sobre una imagen con Tesseract.js localmente y con límite de tiempo (timeout de 8s)
 */
export async function recognizePowerMeter(
  input: string | Buffer,
  options?: { targetWavelength?: string; alertWavelengths?: string[] }
): Promise<OcrResult> {
  const targetWl = options?.targetWavelength || "1490";
  const alertWls = options?.alertWavelengths || ["1310", "1550", "850", "1625"];

  try {
    const preprocessed = await preprocessForLcd(input);

    // Ruta física real al script del worker para evitar errores de empaquetado de Next.js
    const workerScript = path.join(
      process.cwd(),
      "node_modules",
      "tesseract.js",
      "src",
      "worker-script",
      "node",
      "index.js"
    );

    // Ejecutar con timeout de 8 segundos para evitar bloqueos
    const ocrPromise = (async () => {
      const worker = await createWorker("eng", 1, {
        workerPath: workerScript,
        errorHandler: (wErr) => console.error("[OCR Worker Error]:", wErr)
      });
      try {
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789.-+~_dDBmLoLNnWw "
        });
        const ret = await worker.recognize(preprocessed);
        return ret.data.text;
      } finally {
        await worker.terminate();
      }
    })();

    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error("OCR Timeout (8s excedido)")), 8000);
    });

    const extractedText = await Promise.race([ocrPromise, timeoutPromise]);
    console.log("[OCR PowerMeter] Texto crudo extraído de la pantalla:", JSON.stringify(extractedText));
    const result = parsePowerMeterText(extractedText, targetWl, alertWls);
    console.log("[OCR PowerMeter] Resultado del análisis:", result);
    return result;
  } catch (err: any) {
    console.warn("Aviso: Fallo no bloqueante en OCR de medidor:", err?.message || err);
    return {
      success: false,
      error: err?.message || "Error al procesar OCR"
    };
  }
}

/**
 * Función principal llamada tras la subida de una foto de categoría 'potencia'.
 * No bloquea la subida si falla y guarda el comentario y datos en la CTO si detecta valores.
 */
export async function processPowerMeterUploadOcr({
  filepath,
  buffer,
  ctoId,
  divisorIndex = 1,
  userId
}: {
  filepath?: string;
  buffer?: Buffer;
  ctoId: string;
  divisorIndex: number;
  userId?: string;
}): Promise<OcrResult | null> {
  try {
    // 1. Obtener ajustes desde la base de datos
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: [
            "ocrEnabled",
            "ocrTargetWavelength",
            "ocrAlertWavelengths",
            "ocrMinPower",
            "ocrMaxPower",
            "groqApiKey",
            "groqModel",
            "groqPrompt"
          ]
        }
      }
    });
    const settingsMap = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    // Si está explícitamente desactivado
    if (settingsMap.ocrEnabled === "false") {
      return null;
    }

    const targetWl = settingsMap.ocrTargetWavelength || "1490";
    const alertWls = (settingsMap.ocrAlertWavelengths || "1310, 1550, 850, 1625")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const inputData = buffer || filepath;
    if (!inputData) return null;

    let result: OcrResult;

    // Si hay API Key de Groq configurada, usar Groq Vision (IA de alta precisión)
    if (settingsMap.groqApiKey && settingsMap.groqApiKey.trim() !== "") {
      result = await recognizeWithGroqVision(inputData, {
        apiKey: settingsMap.groqApiKey,
        model: settingsMap.groqModel,
        prompt: settingsMap.groqPrompt,
        targetWavelength: targetWl,
        alertWavelengths: alertWls
      });
    } else {
      // Fallback a motor local si no se ha ingresado clave de Groq
      result = await recognizePowerMeter(inputData, {
        targetWavelength: targetWl,
        alertWavelengths: alertWls
      });
    }

    if (!result.success || !result.power) {
      return result;
    }

    // 3. Generar comentario automático en la CTO
    const commentText = `Potencia extraída automáticamente de la imagen de potencia para el divisor ${divisorIndex} : ${result.power} dBm`;
    try {
      await prisma.comment.create({
        data: {
          ctoId,
          userId: userId || null,
          text: commentText
        }
      });
    } catch (commentErr) {
      console.error("Error al crear comentario de OCR:", commentErr);
    }

    // 4. Actualizar CTO: datos de splitters en formDataJson y potenciaDbm si es Divisor 1
    try {
      const cto = await prisma.cTO.findUnique({
        where: { id: ctoId },
        select: { formDataJson: true, potenciaDbm: true }
      });

      let formData: any = {};
      if (cto?.formDataJson) {
        try {
          formData = JSON.parse(cto.formDataJson);
        } catch (e) {}
      }

      const safeDivisor = Math.min(6, Math.max(1, divisorIndex));

      // Limitar y limpiar splitters existentes para que nunca superen 6
      if (Array.isArray(formData.ocrSplitters)) {
        formData.ocrSplitters = formData.ocrSplitters.filter((s: any) => s.divisor <= 6);
      } else {
        formData.ocrSplitters = [];
      }

      const existingIdx = formData.ocrSplitters.findIndex((s: any) => s.divisor === safeDivisor);
      const ocrEntry = {
        divisor: safeDivisor,
        power: result.power,
        rawNumber: result.rawNumber,
        wavelength: result.wavelength || null,
        hasWavelengthMismatch: result.hasWavelengthMismatch || false,
        timestamp: Date.now()
      };

      if (existingIdx >= 0) {
        formData.ocrSplitters[existingIdx] = ocrEntry;
      } else {
        formData.ocrSplitters.push(ocrEntry);
      }

      // Pre-rellenar splitters para el formulario (máximo 6)
      if (Array.isArray(formData.splitters)) {
        if (formData.splitters.length > 6) {
          formData.splitters = formData.splitters.slice(0, 6);
        }
      } else {
        formData.splitters = [];
      }

      while (formData.splitters.length < safeDivisor && formData.splitters.length < 6) {
        formData.splitters.push({ signal: "" });
      }

      if (formData.splitters[safeDivisor - 1]) {
        formData.splitters[safeDivisor - 1].signal = result.power;
      }

      // Guardar advertencia de longitud de onda si no coincide con la normativa
      if (result.hasWavelengthMismatch && result.wavelength) {
        formData.ocrWavelengthMismatch = {
          divisor: divisorIndex,
          detected: result.wavelength,
          expected: targetWl,
          timestamp: Date.now()
        };
      }

      const updateData: any = {
        formDataJson: JSON.stringify(formData)
      };

      // Si es el Divisor 1, actualizar también el campo potenciaDbm de la CTO si estaba vacío o sin rellenar
      if (divisorIndex === 1 && (!cto?.potenciaDbm || cto.potenciaDbm.trim() === "")) {
        updateData.potenciaDbm = result.power;
      }

      await prisma.cTO.update({
        where: { id: ctoId },
        data: updateData
      });
    } catch (ctoUpdateErr) {
      console.error("Error al actualizar datos de CTO tras OCR:", ctoUpdateErr);
    }

    return result;
  } catch (err) {
    console.warn("Fallo no bloqueante en processPowerMeterUploadOcr:", err);
    return null;
  }
}
