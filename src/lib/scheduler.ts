import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { robotoBase64 } from "@/assets/fonts/robotoBase64";
import fs from "fs";
import { helveticaAfm } from "@/assets/fonts/helveticaAfm";
import { sendMail, buildMailConfigFromSettings } from "@/lib/mailer";

// Interceptar lecturas de Helvetica.afm para evitar ENOENT en entornos standalone / Docker
if (!(fs as any).__helvetica_patched) {
  (fs as any).__helvetica_patched = true;
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = function (path: any, options?: any) {
    if (typeof path === "string" && path.includes("Helvetica.afm")) {
      return options === "utf8" || (options && options.encoding === "utf8")
        ? helveticaAfm
        : Buffer.from(helveticaAfm, "utf8");
    }
    return (originalReadFileSync as any).apply(fs, arguments as any);
  } as any;

  const originalExistsSync = fs.existsSync;
  fs.existsSync = function (path: any) {
    if (typeof path === "string" && path.includes("Helvetica.afm")) {
      return true;
    }
    return (originalExistsSync as any).apply(fs, arguments as any);
  } as any;
}

// Helper to convert PDF stream to Buffer
function generatePdfBuffer(doc: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: any) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: any) => reject(err));
    doc.end();
  });
}

// Recolectar datos diarios de CTOs auditadas (siempre usa la fecha de hoy en Madrid)
async function getDailySummaryData(prisma: PrismaClient) {
  const todayMadridStr = new Date().toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
  const startOfRange = new Date();
  startOfRange.setDate(startOfRange.getDate() - 2);

  const historyLogs = await prisma.history.findMany({
    where: { timestamp: { gte: startOfRange } },
    include: {
      cto: {
        include: {
          subStatus: true,
          assignedTo: { select: { id: true, name: true, email: true } },
          auditedBy: { select: { id: true, name: true, email: true } }
        }
      },
      user: { select: { id: true, name: true, email: true } }
    },
    orderBy: { timestamp: "desc" }
  });

  // 1. Primer paso: identificar CTO IDs que cambiaron a CORRECTO o FALLO hoy
  const auditedCtoIds = new Set<string>();
  for (const log of historyLogs) {
    const recordMadridStr = log.timestamp.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
    if (recordMadridStr !== todayMadridStr) continue;

    const action = (log.action || "").toLowerCase();
    if (
      action.includes("a correcto") ||
      action.includes("a fallo")
    ) {
      auditedCtoIds.add(log.ctoId);
    }
  }

  // 2. Segundo paso: agrupar por CTO, solo las auditadas hoy
  const auditedTodayMap = new Map<string, any>();

  for (const log of historyLogs) {
    const recordMadridStr = log.timestamp.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
    if (recordMadridStr !== todayMadridStr) continue;
    if (!log.cto) continue;
    if (!auditedCtoIds.has(log.ctoId)) continue;

    if (!auditedTodayMap.has(log.ctoId)) {
      const auditTime = log.timestamp.toLocaleTimeString("es-ES", {
        timeZone: "Europe/Madrid",
        hour: "2-digit",
        minute: "2-digit"
      });

      auditedTodayMap.set(log.ctoId, {
        id: log.cto.id,
        num: log.cto.num,
        numeroNuevo: log.cto.numeroNuevo,
        cluster: log.cto.cluster || "N/A",
        zona: log.cto.zona || "N/A",
        status: log.cto.status,
        subStatusName: log.cto.subStatus?.name || "Sin Subestado",
        subStatusColor: log.cto.subStatus?.color || "#808080",
        lat: log.cto.lat,
        lng: log.cto.lng,
        coordenadas: log.cto.coordenadas,
        auditor: log.cto.auditedBy?.name || log.user?.name || log.user?.email || "Sistema",
        auditTime,
        timestamp: log.timestamp.getTime()
      });
    }
  }

  return {
    date: todayMadridStr,
    dateIso: new Date().toISOString().slice(0, 10),
    ctos: Array.from(auditedTodayMap.values()).sort((a, b) => a.timestamp - b.timestamp)
  };
}

function buildExcelBuffer(ctos: any[]): Buffer {
  const wb = XLSX.utils.book_new();
  const rows = ctos.map(c => ({
    "Hora": c.auditTime,
    "Técnico Auditor": c.auditor,
    "Número CTO": c.num,
    "Número Nuevo": c.numeroNuevo || "N/A",
    "Zona": c.zona,
    "Cluster": c.cluster,
    "Estado": c.status,
    "Subestado": c.subStatusName,
    "Coordenadas": c.coordenadas
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Auditoría Diaria");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function buildPdfBuffer(ctos: any[], dateStr: string): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ margin: 40 });

  try {
    const fontBuffer = Buffer.from(robotoBase64, "base64");
    doc.registerFont("Roboto", fontBuffer);
    doc.font("Roboto");
  } catch (err) {
    console.error("Error al registrar fuente Roboto en scheduler:", err);
  }

  doc.fillColor("#1e293b").fontSize(20).text("Reporte Diario de Auditoria", { align: "center" });
  doc.fontSize(12).fillColor("#64748b").text(`Plan Algodon - Fecha: ${dateStr}`, { align: "center" });
  doc.moveDown(1.5);

  const total = ctos.length;
  const correctas = ctos.filter(c => c.status === "CORRECTO").length;
  const fallidas = ctos.filter(c => c.status === "FALLO").length;

  doc.fillColor("#0f172a").fontSize(12).text(`Resumen de actividad:`, { underline: true });
  doc.fontSize(10).text(`Total CTOs Auditadas: ${total}`);
  doc.text(`Correctas: ${correctas}`);
  doc.text(`Con Fallos: ${fallidas}`);
  doc.moveDown(2);

  const techGroups: Record<string, any[]> = {};
  for (const cto of ctos) {
    if (!techGroups[cto.auditor]) techGroups[cto.auditor] = [];
    techGroups[cto.auditor].push(cto);
  }

  const rowHeight = 22;

  for (const [techName, techCtos] of Object.entries(techGroups)) {
    if (doc.y > 600) doc.addPage();

    doc.fillColor("#f97316").fontSize(12).text(`Tecnico: ${techName} (${techCtos.length} auditadas)`);
    doc.moveDown(0.5);

    const headerY = doc.y;
    doc.fillColor("#475569").fontSize(9);
    doc.text("Hora", 40, headerY, { width: 50 });
    doc.text("CTO", 90, headerY, { width: 120 });
    doc.text("Zona / Cluster", 220, headerY, { width: 100 });
    doc.text("Estado", 330, headerY, { width: 70 });
    doc.text("Subestado", 410, headerY, { width: 140 });
    doc.y = headerY + 14;
    doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.y += 6;

    for (const cto of techCtos) {
      if (doc.y > 700) {
        doc.addPage();
        const h = doc.y;
        doc.fillColor("#475569").fontSize(9);
        doc.text("Hora", 40, h, { width: 50 });
        doc.text("CTO", 90, h, { width: 120 });
        doc.text("Zona / Cluster", 220, h, { width: 100 });
        doc.text("Estado", 330, h, { width: 70 });
        doc.text("Subestado", 410, h, { width: 140 });
        doc.y = h + 14;
        doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(40, doc.y).lineTo(550, doc.y).stroke();
        doc.y += 6;
      }

      const currentY = doc.y;
      doc.fillColor("#0f172a").fontSize(8.5);
      doc.text(cto.auditTime, 40, currentY, { width: 50 });
      doc.text(cto.num, 90, currentY, { width: 120 });
      doc.text(`${cto.zona} / ${cto.cluster}`, 220, currentY, { width: 100 });
      doc.fillColor(cto.status === "CORRECTO" ? "#166534" : "#991b1b");
      doc.text(cto.status, 330, currentY, { width: 70 });
      doc.fillColor("#475569");
      doc.text(cto.subStatusName, 410, currentY, { width: 140 });
      doc.y = currentY + rowHeight;
    }

    // Mapa OSM por tecnico
    let techMapBuffer: Buffer | null = null;
    try {
      const markers = techCtos
        .filter(c => {
          const lat = parseFloat(String(c.lat).replace(",", "."));
          const lng = parseFloat(String(c.lng).replace(",", "."));
          return !isNaN(lat) && !isNaN(lng);
        })
        .slice(0, 30)
        .map(c => {
          const lat = parseFloat(String(c.lat).replace(",", "."));
          const lng = parseFloat(String(c.lng).replace(",", "."));
          return `${lat},${lng},ol-marker`;
        })
        .join("|");

      if (markers) {
        const staticMapUrl = `https://staticmap.openstreetmap.de/staticmap.php?zoom=13&size=550x300&maptype=mapnik&markers=${markers}`;
        const res = await fetch(staticMapUrl);
        if (res.ok) techMapBuffer = Buffer.from(await res.arrayBuffer());
      }
    } catch (err) {
      console.error(`Error cargando mapa OSM para ${techName}:`, err);
    }

    if (techMapBuffer) {
      if (doc.y > 450) doc.addPage(); else doc.y += 10;
      doc.fillColor("#1e293b").fontSize(10).text(`Ubicacion de CTOs - Tecnico: ${techName}`, { align: "left" });
      doc.moveDown(0.4);
      try {
        doc.image(techMapBuffer, { fit: [480, 240], align: "center" });
        doc.y += 250;
      } catch (err) {
        console.error("Error incrustando mapa:", err);
      }
    }
    doc.y += 20;
  }

  return generatePdfBuffer(doc);
}

// Función principal del planificador
export async function checkAndSendDailyReport(prisma: PrismaClient) {
  try {
    const settings = await prisma.setting.findMany();
    const config: Record<string, string> = {};
    for (const s of settings) config[s.key] = s.value;

    // 1. Validar si está habilitado
    if (config["email_schedule_enabled"] !== "true") {
      console.log("[Scheduler] Envío automático desactivado. Saltando.");
      return;
    }

    // 2. Determinar hora:minuto actual de Madrid en formato YYYY-MM-DD
    const now = new Date();
    const madridDateStr = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });

    const formatterHour = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Madrid",
      hour: "numeric",
      hour12: false
    });
    const formatterMinute = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Madrid",
      minute: "numeric"
    });
    const currentHour = parseInt(formatterHour.format(now));
    const currentMinute = parseInt(formatterMinute.format(now));
    const currentTotalMinutes = currentHour * 60 + currentMinute;

    // 3. Parsear la hora objetivo (soporta "20", "20:00", "19:45", etc.)
    const rawTarget = config["email_schedule_hour"] || "20";
    let targetHour: number;
    let targetMinute: number;

    if (rawTarget.includes(":")) {
      const parts = rawTarget.split(":");
      targetHour = parseInt(parts[0]) || 0;
      targetMinute = parseInt(parts[1]) || 0;
    } else {
      targetHour = parseInt(rawTarget) || 20;
      targetMinute = 0;
    }
    const targetTotalMinutes = targetHour * 60 + targetMinute;

    // 4. Comprobar si corresponde enviar a esta hora
    if (currentTotalMinutes < targetTotalMinutes) {
      console.log(`[Scheduler] Aún no es la hora (actual: ${String(currentHour).padStart(2,"0")}:${String(currentMinute).padStart(2,"0")} Madrid, programado: ${String(targetHour).padStart(2,"0")}:${String(targetMinute).padStart(2,"0")}). Saltando.`);
      return;
    }

    // 5. Comprobar si ya fue enviado hoy
    if (config["email_last_sent_date"] === madridDateStr) {
      console.log(`[Scheduler] Ya se envió hoy (${madridDateStr}). Saltando.`);
      return;
    }

    // Bloqueo inmediato para evitar envíos duplicados
    await prisma.setting.upsert({
      where: { key: "email_last_sent_date" },
      update: { value: madridDateStr },
      create: { key: "email_last_sent_date", value: madridDateStr }
    });

    console.log(`[Scheduler] ¡Hora alcanzada! Iniciando envío de reporte diario automático para ${madridDateStr} (${String(targetHour).padStart(2,"0")}:${String(targetMinute).padStart(2,"0")})...`);

    // 6. Cargar ajustes de envío
    const emailRecipients = (config["email_recipients"] || "").trim();
    if (!emailRecipients) {
      console.warn("[Scheduler] No se han configurado destinatarios de correo.");
      return;
    }

    const mailCfg = buildMailConfigFromSettings(config);
    const emailFooter = config["email_footer"] || "Plan Algodon - Reportes Automatizados";

    // 7. Obtener datos del día
    const data = await getDailySummaryData(prisma);

    // Si no hubo auditorías hoy, registrar y no enviar
    if (data.ctos.length === 0) {
      console.log(`[Scheduler] Sin auditorías hoy (${data.date}). No se enviará el reporte.`);
      return;
    }

    const excelBuffer = buildExcelBuffer(data.ctos);
    const pdfBuffer = await buildPdfBuffer(data.ctos, data.date);

    // Construir enlace con fecha específica para que el reporte interactivo muestre ese día
    const appUrl = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
    const publicToken = config["public_access_token"] || "";
    const dateParam = data.dateIso; // "YYYY-MM-DD"

    let publicLink: string;
    if (publicToken) {
      publicLink = `${appUrl}/public-report?token=${publicToken}&date=${dateParam}`;
    } else {
      publicLink = `${appUrl}/public-report?date=${dateParam}`;
    }

    const formattedDate = data.date.replace(/\//g, "-");
    const correctas = data.ctos.filter(c => c.status === "CORRECTO").length;
    const fallidas  = data.ctos.filter(c => c.status === "FALLO").length;

    await sendMail({
      to: emailRecipients,
      subject: `Resumen Diario de Auditoria - ${data.date} (Plan Algodon)`,
      text: `Reporte del ${data.date}.\nCTOs: ${data.ctos.length} | Correctas: ${correctas} | Fallidas: ${fallidas}\nAcceso: ${publicLink}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px;"><h2 style="color:#f97316;border-bottom:2px solid #f97316;padding-bottom:10px;margin-top:0;">Plan Algodon - Reporte Diario Automatico</h2><p>Reporte de auditoria del dia <strong>${data.date}</strong>.</p><div style="background:#f8fafc;padding:15px;border-radius:6px;margin:20px 0;border-left:4px solid #f97316;"><p style="margin:4px 0;font-weight:bold;">Resumen:</p><p style="margin:4px 0;padding-left:10px;">Total: <strong>${data.ctos.length}</strong></p><p style="margin:4px 0;padding-left:10px;">Correctas: <strong style="color:#166534">${correctas}</strong></p><p style="margin:4px 0;padding-left:10px;">Fallidas: <strong style="color:#991b1b">${fallidas}</strong></p></div><p>Adjuntos: PDF y Excel con el detalle completo.</p><p style="text-align:center;margin:24px 0;"><a href="${publicLink}" style="background:#f97316;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">Ver Reporte Interactivo del ${data.date}</a></p><hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/><div style="font-size:0.8rem;color:#94a3b8;text-align:center;">${emailFooter}</div></div>`,
      attachments: [
        { filename: `resumen_diario_${formattedDate}.xlsx`, content: excelBuffer },
        { filename: `resumen_diario_${formattedDate}.pdf`,  content: pdfBuffer  },
      ],
    }, mailCfg);

    console.log(`[Scheduler] ✅ Reporte diario enviado exitosamente a ${emailRecipients} para ${madridDateStr}.`);
  } catch (error: any) {
    console.error("[Scheduler] ❌ Error in checkAndSendDailyReport:", error);
    // Resetear para permitir reintento
    try {
      await prisma.setting.delete({ where: { key: "email_last_sent_date" } }).catch(() => {});
    } catch (e) {}
  }
}

export function startEmailScheduler(prisma: PrismaClient) {
  const globalObject = global as any;
  if (globalObject.emailSchedulerStarted) return;

  globalObject.emailSchedulerStarted = true;
  console.log("[Scheduler] Planificador de reporte diario iniciado (verificaciones cada 10 minutos)...");

  // Verificar cada 10 minutos
  setInterval(() => {
    checkAndSendDailyReport(prisma);
  }, 10 * 60 * 1000);

  // Ejecución inicial tras 15 segundos
  setTimeout(() => {
    checkAndSendDailyReport(prisma);
  }, 15000);
}
