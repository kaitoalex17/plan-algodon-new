import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

// Helper para convertir flujo PDFKit a Buffer
function generatePdfBuffer(doc: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: any) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: any) => reject(err));
    doc.end();
  });
}

// Función común para recolectar datos del día en Madrid
async function getDailySummaryData(dateParam: string | null = null) {
  let targetDateStr = "";
  let dateIso = "";
  let startOfRange = new Date();

  if (dateParam && dateParam !== "null" && dateParam !== "undefined" && dateParam.includes("-")) {
    const [y, m, d] = dateParam.split("-");
    const dObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
    targetDateStr = dObj.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
    dateIso = dateParam;

    startOfRange = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 0, 0, 0);
    startOfRange.setDate(startOfRange.getDate() - 1);
  } else {
    targetDateStr = new Date().toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
    dateIso = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
    startOfRange.setDate(startOfRange.getDate() - 2);
  }

  const endOfRange = new Date(startOfRange);
  endOfRange.setDate(endOfRange.getDate() + 3);

  const historyLogs = await prisma.history.findMany({
    where: {
      timestamp: {
        gte: startOfRange,
        lte: endOfRange
      }
    },
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

  // 1. Identificar CTOs que tuvieron un cambio de estado a CORRECTO o FALLO en la fecha
  const auditedCtoIds = new Set<string>();
  for (const log of historyLogs) {
    const recordMadridStr = log.timestamp.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
    if (recordMadridStr !== targetDateStr) continue;

    const action = (log.action || "").toLowerCase();
    if (
      action.includes("a correcto") ||
      action.includes("a fallo")
    ) {
      auditedCtoIds.add(log.ctoId);
    }
  }

  // 2. Agrupar por CTO solo las que cambiaron de estado
  const auditedTodayMap = new Map<string, any>();

  for (const log of historyLogs) {
    const recordMadridStr = log.timestamp.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
    if (recordMadridStr !== targetDateStr) continue;
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
    date: targetDateStr,
    dateIso,
    ctos: Array.from(auditedTodayMap.values()).sort((a, b) => a.timestamp - b.timestamp)
  };
}

// Función común para construir el buffer del Excel
function buildExcelBuffer(ctos: any[], dateStr: string): Buffer {
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

// Función común para construir el buffer del PDF (PDFKit)
async function buildPdfBuffer(ctos: any[], dateStr: string): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ margin: 40 });
  
  try {
    const fontBuffer = Buffer.from(robotoBase64, "base64");
    doc.registerFont("Roboto", fontBuffer);
    doc.font("Roboto");
  } catch (err) {
    console.error("Error al registrar fuente Roboto:", err);
  }
  
  // Título principal
  doc.fillColor("#1e293b").fontSize(20).text("Reporte Diario de Auditoría", { align: "center" });
  doc.fontSize(12).fillColor("#64748b").text(`Plan Algodón - Fecha: ${dateStr}`, { align: "center" });
  doc.moveDown(1.5);

  // Resumen
  const total = ctos.length;
  const correctas = ctos.filter(c => c.status === "CORRECTO").length;
  const fallidas = ctos.filter(c => c.status === "FALLO").length;

  doc.fillColor("#0f172a").fontSize(12).text(`Resumen de actividad de hoy:`, { underline: true });
  doc.fontSize(10).text(`• Total CTOs Auditadas: ${total}`);
  doc.text(`• Correctas: ${correctas}`);
  doc.text(`• Con Fallos: ${fallidas}`);
  doc.moveDown(2);

  // Agrupar por técnico
  const techGroups: Record<string, any[]> = {};
  for (const cto of ctos) {
    if (!techGroups[cto.auditor]) techGroups[cto.auditor] = [];
    techGroups[cto.auditor].push(cto);
  }

  const rowHeight = 22;

  for (const [techName, techCtos] of Object.entries(techGroups)) {
    // Si queda poco espacio al final de la página, saltar de página antes de pintar el técnico
    if (doc.y > 600) {
      doc.addPage();
    }

    doc.fillColor("#f97316").fontSize(12).text(`Técnico: ${techName} (${techCtos.length} auditadas)`, { underline: false });
    doc.moveDown(0.5);

    // Cabeceras de la tabla
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

    // Filas
    for (const cto of techCtos) {
      // Salto de página automático si se acaba el espacio vertical
      if (doc.y > 700) {
        doc.addPage();
        
        // Repintar cabeceras en la nueva página
        const newPageHeaderY = doc.y;
        doc.fillColor("#475569").fontSize(9);
        doc.text("Hora", 40, newPageHeaderY, { width: 50 });
        doc.text("CTO", 90, newPageHeaderY, { width: 120 });
        doc.text("Zona / Cluster", 220, newPageHeaderY, { width: 100 });
        doc.text("Estado", 330, newPageHeaderY, { width: 70 });
        doc.text("Subestado", 410, newPageHeaderY, { width: 140 });

        doc.y = newPageHeaderY + 14;
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

    // Obtener mapa estático de OpenStreetMap para este técnico
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
        if (res.ok) {
          const ab = await res.arrayBuffer();
          techMapBuffer = Buffer.from(ab);
        }
      }
    } catch (err) {
      console.error(`Error cargando mapa OpenStreetMap para ${techName}:`, err);
    }

    if (techMapBuffer) {
      if (doc.y > 450) {
        doc.addPage();
      } else {
        doc.y += 10;
      }

      doc.fillColor("#1e293b").fontSize(10).text(`Ubicación de CTOs Auditadas - Técnico: ${techName}`, { align: "left" });
      doc.moveDown(0.4);
      try {
        doc.image(techMapBuffer, {
          fit: [480, 240],
          align: "center"
        });
        doc.y += 250;
      } catch (err) {
        console.error("Error incrustando mapa de técnico:", err);
      }
    }
    doc.y += 20; // Margen antes del siguiente técnico
  }

  return generatePdfBuffer(doc);
}

// GET: Descargar directamente el Excel o el PDF
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!session || (role !== "ADMIN" && role !== "GESTOR")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // "excel" o "pdf"
    const dateParam = searchParams.get("date"); // e.g. "2026-06-28"

    const data = await getDailySummaryData(dateParam);

    if (type === "pdf") {
      const buffer = await buildPdfBuffer(data.ctos, data.date);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename=resumen_diario_${data.date.replace(/\//g, "-")}.pdf`
        }
      });
    } else {
      const buffer = buildExcelBuffer(data.ctos, data.date);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename=resumen_diario_${data.date.replace(/\//g, "-")}.xlsx`
        }
      });
    }
  } catch (error: any) {
    console.error("Error exporting daily summary:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Enviar correo manual o de prueba
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let dateParam: string | null = null;
    let isTest = false;
    try {
      const body = await req.json();
      dateParam = body.date ?? null;
      isTest = body.isTest === true;
    } catch (e) {}

    if (!dateParam) {
      const { searchParams } = new URL(req.url);
      dateParam = searchParams.get("date");
      if (searchParams.get("isTest") === "true") isTest = true;
    }

    // Cargar configuracion de la BD
    const settings = await prisma.setting.findMany();
    const config: Record<string, string> = {};
    for (const s of settings) config[s.key] = s.value;

    const mailCfg = buildMailConfigFromSettings(config);
    const emailRecipients = (config["email_recipients"] || "").trim();
    const emailFooter = config["email_footer"] || "Plan Algodon - Reportes Automatizados";

    if (!emailRecipients) {
      return NextResponse.json({
        error: "No se han configurado destinatarios de correo. Ve a Ajustes y anade al menos un destinatario."
      }, { status: 400 });
    }

    // Correo de prueba (sin adjuntos)
    if (isTest) {
      const result = await sendMail({
        to: emailRecipients,
        subject: `Prueba de Conexion (${mailCfg.method.toUpperCase()}) - Plan Algodon`,
        text: `Correo de prueba desde Plan Algodon usando el metodo ${mailCfg.method.toUpperCase()}.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px;"><h2 style="color:#3b82f6;border-bottom:2px solid #3b82f6;padding-bottom:10px;margin-top:0;">Prueba de Conexion OK</h2><p>El metodo <strong>${mailCfg.method.toUpperCase()}</strong> esta funcionando correctamente.</p><p>Si lo recibes, la configuracion es correcta!</p><hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/><div style="font-size:0.8rem;color:#94a3b8;text-align:center;">${emailFooter}</div></div>`,
      }, mailCfg);

      return NextResponse.json({
        success: true,
        message: `Correo de prueba (${mailCfg.method.toUpperCase()}) enviado a: ${emailRecipients}`,
        messageId: result.messageId,
      });
    }

    // Reporte completo con adjuntos
    const data = await getDailySummaryData(dateParam);
    const excelBuffer = buildExcelBuffer(data.ctos, data.date);
    const pdfBuffer   = await buildPdfBuffer(data.ctos, data.date);

    const reqHost  = req.headers.get("host") || "localhost:3000";
    const reqProto = req.headers.get("x-forwarded-proto") || "http";
    const publicToken = config["public_access_token"] || "";
    const dateParamStr = data.dateIso;
    const publicLink = publicToken
      ? `${reqProto}://${reqHost}/public-report?token=${publicToken}&date=${dateParamStr}`
      : `${reqProto}://${reqHost}/public-report?date=${dateParamStr}`;

    const formattedDate = data.date.replace(/\//g, "-");
    const correctas = data.ctos.filter((c: any) => c.status === "CORRECTO").length;
    const fallidas  = data.ctos.filter((c: any) => c.status === "FALLO").length;
    const passLine  = publicToken
      ? `<p style="font-size:0.82rem;color:#64748b;text-align:center;">* Acceso directo sin contrasena</p>`
      : `<p style="font-size:0.82rem;color:#64748b;text-align:center;">* Contrasena: <strong>${config["public_report_password"] || "netdata"}</strong></p>`;

    const result = await sendMail({
      to: emailRecipients,
      subject: `Resumen Diario de Auditoria - ${data.date} (Plan Algodon)`,
      text: `Reporte del ${data.date}.\nCTOs: ${data.ctos.length} | Correctas: ${correctas} | Fallidas: ${fallidas}\nAcceso: ${publicLink}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px;"><h2 style="color:#f97316;border-bottom:2px solid #f97316;padding-bottom:10px;margin-top:0;">Plan Algodon - Reporte Diario</h2><p>Reporte del dia <strong>${data.date}</strong>.</p><div style="background:#f8fafc;padding:15px;border-radius:6px;margin:20px 0;border-left:4px solid #f97316;"><p style="margin:4px 0;font-weight:bold;">Resumen:</p><p style="margin:4px 0;padding-left:10px;">Total: <strong>${data.ctos.length}</strong></p><p style="margin:4px 0;padding-left:10px;">Correctas: <strong style="color:#166534">${correctas}</strong></p><p style="margin:4px 0;padding-left:10px;">Fallidas: <strong style="color:#991b1b">${fallidas}</strong></p></div><p>Se adjuntan informe <strong>PDF</strong> y <strong>Excel</strong>.</p><p style="text-align:center;margin:24px 0;"><a href="${publicLink}" style="background:#f97316;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">Ver Reporte Interactivo</a></p>${passLine}<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/><div style="font-size:0.8rem;color:#94a3b8;text-align:center;">${emailFooter}</div></div>`,
      attachments: [
        { filename: `resumen_diario_${formattedDate}.xlsx`, content: excelBuffer },
        { filename: `resumen_diario_${formattedDate}.pdf`,  content: pdfBuffer  },
      ],
    }, mailCfg);

    console.log("[Email] Reporte enviado. MessageId:", result.messageId, "->", emailRecipients);
    return NextResponse.json({
      success: true,
      message: `Reporte (${mailCfg.method.toUpperCase()}) enviado a: ${emailRecipients}`,
      messageId: result.messageId,
    });

  } catch (error: any) {
    console.error("[Email] Error al enviar:", error);
    return NextResponse.json({
      error: "Error al enviar el correo: " + error.message,
    }, { status: 500 });
  }
}
