import sharp from "sharp";
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
    // Buscar número con signo negativo: ej. -18.75, - 21.30, -22,15
    const negativeMatches = Array.from(clean.matchAll(/-\s*([1-7][0-9](?:[.,][0-9]{1,2})?)/g));
    for (const m of negativeMatches) {
      const numStr = m[1].replace(",", ".");
      const numVal = parseFloat(numStr);
      // Validar rango solicitado entre 11.00 y 70.00
      if (numVal >= 11.0 && numVal <= 70.0) {
        detectedRawNumber = numVal.toFixed(2);
        detectedPower = `-${detectedRawNumber}`;
        break;
      }
    }

    // Si no encontró con '-', buscar números cerca de 'dBm' o 'dB'
    if (!detectedPower) {
      const dbmMatches = Array.from(clean.matchAll(/([1-7][0-9](?:[.,][0-9]{1,2})?)\s*(?:dBm|dB)/gi));
      for (const m of dbmMatches) {
        const numStr = m[1].replace(",", ".");
        const numVal = parseFloat(numStr);
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

    // Ejecutar con timeout de 8 segundos para evitar bloqueos
    const ocrPromise = (async () => {
      const worker = await createWorker("eng");
      try {
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789.-+dDBmLoLNnWw "
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
    return parsePowerMeterText(extractedText, targetWl, alertWls);
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
    // 1. Obtener ajustes de OCR desde la base de datos
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: ["ocrEnabled", "ocrTargetWavelength", "ocrAlertWavelengths"]
        }
      }
    });
    const settingsMap = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    // Si el OCR está explícitamente desactivado
    if (settingsMap.ocrEnabled === "false") {
      return null;
    }

    const targetWl = settingsMap.ocrTargetWavelength || "1490";
    const alertWls = (settingsMap.ocrAlertWavelengths || "1310, 1550, 850, 1625")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    // 2. Ejecutar OCR
    const input = filepath || buffer;
    if (!input) return null;

    const result = await recognizePowerMeter(input, {
      targetWavelength: targetWl,
      alertWavelengths: alertWls
    });

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

      // Estructura de divisores OCR
      if (!Array.isArray(formData.ocrSplitters)) {
        formData.ocrSplitters = [];
      }

      const existingIdx = formData.ocrSplitters.findIndex((s: any) => s.divisor === divisorIndex);
      const ocrEntry = {
        divisor: divisorIndex,
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

      // Pre-rellenar splitters para el formulario si no existen o están vacíos
      if (!Array.isArray(formData.splitters)) {
        formData.splitters = [];
      }
      while (formData.splitters.length < divisorIndex) {
        formData.splitters.push({ signal: "" });
      }
      // Actualizar el valor del divisor si estaba vacío
      if (!formData.splitters[divisorIndex - 1].signal || formData.splitters[divisorIndex - 1].signal === "") {
        formData.splitters[divisorIndex - 1].signal = result.power;
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
