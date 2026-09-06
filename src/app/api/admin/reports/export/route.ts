import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import fs from "fs";
import { helveticaAfm } from "@/assets/fonts/helveticaAfm";

// Interceptar lecturas de Helvetica.afm para evitar ENOENT en entornos standalone / Docker
if (!(fs as any).__helvetica_patched) {
  (fs as any).__helvetica_patched = true;
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = function (this: any, path: any, options?: any) {
    if (typeof path === "string" && path.includes("Helvetica.afm")) {
      return options === "utf8" || (options && options.encoding === "utf8")
        ? helveticaAfm
        : Buffer.from(helveticaAfm, "utf8");
    }
    return (originalReadFileSync as any).apply(fs, arguments);
  } as any;

  const originalExistsSync = fs.existsSync;
  fs.existsSync = function (this: any, path: any) {
    if (typeof path === "string" && path.includes("Helvetica.afm")) {
      return true;
    }
    return (originalExistsSync as any).apply(fs, arguments);
  } as any;
}

function generatePdfBuffer(doc: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: any) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: any) => reject(err));
    doc.end();
  });
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!session || (role !== "ADMIN" && role !== "GESTOR")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    // Formato de exportación
    const format = (searchParams.get("format") || "xlsx").toLowerCase();

    // Filtros
    const auditStatus = searchParams.get("auditStatus") || "AUDITED";
    const subStatusId = searchParams.get("subStatusId") || "ALL";
    const auditedById = searchParams.get("auditedById") || "ALL";
    const assignedToId = searchParams.get("assignedToId") || "ALL";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const zona = searchParams.get("zona") || "ALL";
    const cluster = searchParams.get("cluster") || "ALL";
    const municipio = searchParams.get("municipio") || "ALL";
    const category = searchParams.get("category") || "ALL";
    const hasFormulario = searchParams.get("hasFormulario") || "ALL";
    const hasDrive = searchParams.get("hasDrive") || "ALL";
    const hasAntala = searchParams.get("hasAntala") || "ALL";
    const search = (searchParams.get("search") || "").trim();

    // Construcción del objeto where
    const where: any = {};

    if (auditStatus === "AUDITED") {
      where.status = { in: ["CORRECTO", "FALLO"] };
    } else if (auditStatus === "AUDITED_AND_REVISED") {
      where.status = { in: ["CORRECTO", "FALLO", "REVISADO"] };
    } else if (auditStatus === "CORRECTO" || auditStatus === "FALLO" || auditStatus === "REVISADO" || auditStatus === "PENDIENTE") {
      where.status = auditStatus;
    }

    if (subStatusId !== "ALL") {
      if (subStatusId === "NONE") where.subStatusId = null;
      else where.subStatusId = subStatusId;
    }

    if (auditedById !== "ALL") {
      if (auditedById === "NONE") where.auditedById = null;
      else where.auditedById = auditedById;
    }

    if (assignedToId !== "ALL") {
      if (assignedToId === "NONE") where.assignedToId = null;
      else where.assignedToId = assignedToId;
    }

    if (zona !== "ALL") where.zona = zona;
    if (cluster !== "ALL") where.cluster = cluster;
    if (municipio !== "ALL") where.municipio = municipio;
    if (category !== "ALL") where.category = category;

    if (hasFormulario === "true") where.hasFormulario = true;
    else if (hasFormulario === "false") where.hasFormulario = false;

    if (hasDrive === "true") where.hasDrive = true;
    else if (hasDrive === "false") where.hasDrive = false;

    if (hasAntala === "true") where.hasAntala = true;
    else if (hasAntala === "false") where.hasAntala = false;

    if (search) {
      where.OR = [
        { num: { contains: search, mode: "insensitive" } },
        { numeroNuevo: { contains: search, mode: "insensitive" } },
        { notas: { contains: search, mode: "insensitive" } }
      ];
    }

    if (startDate || endDate) {
      const historyWhere: any = {};
      const dateFilter: any = {};

      if (startDate && startDate.includes("-")) {
        const [sy, sm, sd] = startDate.split("-").map(Number);
        dateFilter.gte = new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0));
      }
      if (endDate && endDate.includes("-")) {
        const [ey, em, ed] = endDate.split("-").map(Number);
        dateFilter.lte = new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59, 999));
      }

      historyWhere.timestamp = dateFilter;
      historyWhere.OR = [
        { action: { contains: "a correcto", mode: "insensitive" } },
        { action: { contains: "a fallo", mode: "insensitive" } },
        { action: { contains: "auditor", mode: "insensitive" } }
      ];

      const logs = await prisma.history.findMany({
        where: historyWhere,
        select: { ctoId: true },
        distinct: ["ctoId"]
      });

      const matchedCtoIds = logs.map(l => l.ctoId);
      where.id = { in: matchedCtoIds };
    }

    // Consultar todos los registros coincidentes para el archivo
    const rawCtos = await prisma.cTO.findMany({
      where,
      include: {
        subStatus: true,
        auditedBy: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        history: {
          where: {
            OR: [
              { action: { contains: "a correcto", mode: "insensitive" } },
              { action: { contains: "a fallo", mode: "insensitive" } },
              { action: { contains: "auditor", mode: "insensitive" } }
            ]
          },
          orderBy: { timestamp: "desc" },
          take: 1
        }
      },
      orderBy: { num: "asc" }
    });

    const ctos = rawCtos.map(c => {
      let auditDate = "N/A";
      let auditTime = "N/A";

      const latestAuditLog = c.history && c.history[0];
      if (latestAuditLog && latestAuditLog.timestamp) {
        auditDate = latestAuditLog.timestamp.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
        auditTime = latestAuditLog.timestamp.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
      } else if (c.status !== "PENDIENTE" && c.fechaAgregacion) {
        auditDate = c.fechaAgregacion.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
        auditTime = c.fechaAgregacion.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
      }

      const occ = c.puertosOcupados || 0;
      const tot = c.puertosTotal || 16;
      const pctOcupacion = Math.round((occ / tot) * 100) + "%";

      return {
        id: c.id,
        num: c.num,
        numeroNuevo: c.numeroNuevo || "N/A",
        status: c.status,
        subStatusName: c.subStatus?.name || "Sin Subestado",
        category: c.category,
        zona: c.zona || "N/A",
        cluster: c.cluster || "N/A",
        municipio: c.municipio || "N/A",
        auditor: c.auditedBy?.name || c.auditedBy?.email || "Sin auditor",
        assignedTo: c.assignedTo?.name || c.assignedTo?.email || "Sin asignar",
        hasFormulario: c.hasFormulario ? "SÍ" : "NO",
        hasDrive: c.hasDrive ? "SÍ" : "NO",
        hasAntala: c.hasAntala ? "SÍ" : "NO",
        puertosOcupados: occ,
        puertosTotal: tot,
        pctOcupacion,
        potenciaDbm: c.potenciaDbm !== null && c.potenciaDbm !== undefined ? `${c.potenciaDbm} dBm` : "N/A",
        coordenadas: c.coordenadas || (c.lat && c.lng ? `${c.lat}, ${c.lng}` : "N/A"),
        mapsUrl: c.lat && c.lng ? `https://www.google.com/maps?q=${c.lat},${c.lng}` : "",
        driveFolderLink: c.driveFolderLink || "",
        auditDate,
        auditTime
      };
    });

    const nowMadridStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
    const nowTimeStr = new Date().toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });

    // ==========================================
    // EXPORTACIÓN A EXCEL (.xlsx o .xls)
    // ==========================================
    if (format === "xlsx" || format === "excel" || format === "xls") {
      const wb = XLSX.utils.book_new();

      // Hoja 1: Listado completo de CTOs
      const dataRows = ctos.map(c => ({
        "Nº CTO": c.num,
        "Nº Nuevo": c.numeroNuevo,
        "Estado": c.status,
        "Subestado": c.subStatusName,
        "Fecha Auditoría": c.auditDate,
        "Hora": c.auditTime,
        "Auditor": c.auditor,
        "Técnico Asignado": c.assignedTo,
        "Categoría": c.category,
        "Zona": c.zona,
        "Cluster": c.cluster,
        "Municipio": c.municipio,
        "Puertos Ocupados": c.puertosOcupados,
        "Puertos Totales": c.puertosTotal,
        "% Ocupación": c.pctOcupacion,
        "Potencia": c.potenciaDbm,
        "Formulario": c.hasFormulario,
        "Google Drive": c.hasDrive,
        "Antala": c.hasAntala,
        "Coordenadas": c.coordenadas,
        "Enlace Google Maps": c.mapsUrl,
        "Enlace Carpeta Drive": c.driveFolderLink
      }));

      const ws1 = XLSX.utils.json_to_sheet(dataRows);
      // Auto-ancho de columnas
      ws1["!cols"] = [
        { wch: 14 }, // Nº CTO
        { wch: 14 }, // Nº Nuevo
        { wch: 12 }, // Estado
        { wch: 18 }, // Subestado
        { wch: 15 }, // Fecha
        { wch: 8 },  // Hora
        { wch: 22 }, // Auditor
        { wch: 22 }, // Técnico
        { wch: 14 }, // Categoría
        { wch: 16 }, // Zona
        { wch: 16 }, // Cluster
        { wch: 16 }, // Municipio
        { wch: 16 }, // P. Ocupados
        { wch: 16 }, // P. Totales
        { wch: 12 }, // % Ocupación
        { wch: 14 }, // Potencia
        { wch: 12 }, // Formulario
        { wch: 12 }, // Drive
        { wch: 10 }, // Antala
        { wch: 22 }, // Coordenadas
        { wch: 35 }, // Maps
        { wch: 35 }  // Drive
      ];
      XLSX.utils.book_append_sheet(wb, ws1, "CTOs Auditadas");

      // Hoja 2: Resumen y Métricas
      const totalCtos = ctos.length;
      const correctas = ctos.filter(c => c.status === "CORRECTO").length;
      const fallos = ctos.filter(c => c.status === "FALLO").length;
      const revisadas = ctos.filter(c => c.status === "REVISADO").length;
      const pendientes = ctos.filter(c => c.status === "PENDIENTE").length;
      const conFormulario = ctos.filter(c => c.hasFormulario === "SÍ").length;
      const conDrive = ctos.filter(c => c.hasDrive === "SÍ").length;

      const summaryRows = [
        { "Métrica": "Fecha de Generación", "Valor": `${nowMadridStr} ${nowTimeStr}` },
        { "Métrica": "Total CTOs en Informe", "Valor": totalCtos },
        { "Métrica": "CTOs Correctas", "Valor": `${correctas} (${totalCtos > 0 ? Math.round((correctas / totalCtos) * 100) : 0}%)` },
        { "Métrica": "CTOs con Fallo", "Valor": `${fallos} (${totalCtos > 0 ? Math.round((fallos / totalCtos) * 100) : 0}%)` },
        { "Métrica": "CTOs Revisadas", "Valor": revisadas },
        { "Métrica": "CTOs Pendientes", "Valor": pendientes },
        { "Métrica": "Con Formulario Completado", "Valor": `${conFormulario} (${totalCtos > 0 ? Math.round((conFormulario / totalCtos) * 100) : 0}%)` },
        { "Métrica": "Con Carpeta Drive", "Valor": `${conDrive} (${totalCtos > 0 ? Math.round((conDrive / totalCtos) * 100) : 0}%)` }
      ];

      const ws2 = XLSX.utils.json_to_sheet(summaryRows);
      ws2["!cols"] = [{ wch: 30 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Resumen Global");

      const bookType = format === "xls" ? "biff8" : "xlsx";
      const buffer = XLSX.write(wb, { type: "buffer", bookType }) as Buffer;

      const filename = `informe_auditoria_${nowMadridStr}.${format === "xls" ? "xls" : "xlsx"}`;
      const contentType = format === "xls" 
        ? "application/vnd.ms-excel" 
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`
        }
      });
    }

    // ==========================================
    // EXPORTACIÓN A PDF (Landscape A4 Profesional)
    // ==========================================
    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({
      layout: "landscape",
      size: "A4",
      margin: 30,
      bufferPages: true
    });

    doc.font("Helvetica");

    // Encabezado Principal
    doc.fillColor("#0f172a").fontSize(18).text("Plan Algodón — Informe de Auditoría de CTOs", { align: "left" });
    doc.fontSize(9).fillColor("#64748b").text(`Fecha de emisión: ${nowMadridStr} a las ${nowTimeStr} | Generado por: ${(session?.user as any)?.name || session?.user?.email || "Administrador"}`, { align: "left" });
    doc.moveDown(0.8);

    // Resumen de Filtros Aplicados
    const activeFiltersList: string[] = [];
    if (auditStatus !== "ALL") activeFiltersList.push(`Estado: ${auditStatus}`);
    if (subStatusId !== "ALL") activeFiltersList.push("Subestado específico");
    if (auditedById !== "ALL") activeFiltersList.push(auditedById === "NONE" ? "Sin auditor" : "Auditor específico");
    if (assignedToId !== "ALL") activeFiltersList.push(assignedToId === "NONE" ? "Sin asignar" : "Técnico específico");
    if (startDate || endDate) activeFiltersList.push(`Fechas: ${startDate || "Inicio"} al ${endDate || "Hoy"}`);
    if (zona !== "ALL") activeFiltersList.push(`Zona: ${zona}`);
    if (cluster !== "ALL") activeFiltersList.push(`Cluster: ${cluster}`);
    if (hasFormulario !== "ALL") activeFiltersList.push(`Formulario: ${hasFormulario === "true" ? "Sí" : "No"}`);
    if (hasDrive !== "ALL") activeFiltersList.push(`Drive: ${hasDrive === "true" ? "Sí" : "No"}`);
    if (search) activeFiltersList.push(`Búsqueda: "${search}"`);

    const filtersSummaryText = activeFiltersList.length > 0 ? activeFiltersList.join(" • ") : "Todos los registros (sin restricciones)";

    const headerBoxY = doc.y;
    doc.rect(30, headerBoxY, 782, 36).fillAndStroke("#f8fafc", "#e2e8f0");
    doc.fillColor("#475569").fontSize(8.5).text(`Filtros aplicados: ${filtersSummaryText}`, 38, headerBoxY + 7, { width: 766 });
    
    // Tarjetas de Métricas Resumen
    const totalCtos = ctos.length;
    const correctas = ctos.filter(c => c.status === "CORRECTO").length;
    const fallos = ctos.filter(c => c.status === "FALLO").length;
    const revisadas = ctos.filter(c => c.status === "REVISADO").length;
    const pendientes = ctos.filter(c => c.status === "PENDIENTE").length;
    const conForm = ctos.filter(c => c.hasFormulario === "SÍ").length;

    doc.fillColor("#0f172a").fontSize(8.5).text(
      `Total CTOs: ${totalCtos}   |   Correctas: ${correctas} (${totalCtos > 0 ? Math.round((correctas / totalCtos) * 100) : 0}%)   |   Fallos: ${fallos}   |   Revisadas: ${revisadas}   |   Pendientes: ${pendientes}   |   Con Formulario: ${conForm}`,
      38, headerBoxY + 22, { width: 766 }
    );

    doc.y = headerBoxY + 44;

    // Configuración de la Tabla
    const colX = {
      fecha: 30,
      cto: 105,
      estado: 195,
      subestado: 265,
      auditor: 375,
      tecnico: 485,
      zonaCluster: 595,
      puertos: 700,
      chk: 755
    };

    const drawTableHeader = (y: number) => {
      doc.rect(30, y, 782, 18).fill("#0f172a");
      doc.fillColor("#ffffff").fontSize(8);
      doc.text("Fecha/Hora", colX.fecha + 4, y + 5, { width: 68 });
      doc.text("Nº CTO", colX.cto, y + 5, { width: 85 });
      doc.text("Estado", colX.estado, y + 5, { width: 65 });
      doc.text("Subestado", colX.subestado, y + 5, { width: 105 });
      doc.text("Auditor", colX.auditor, y + 5, { width: 105 });
      doc.text("Técnico Asignado", colX.tecnico, y + 5, { width: 105 });
      doc.text("Zona / Cluster", colX.zonaCluster, y + 5, { width: 100 });
      doc.text("Puertos", colX.puertos, y + 5, { width: 50 });
      doc.text("Check", colX.chk, y + 5, { width: 50 });
    };

    drawTableHeader(doc.y);
    doc.y += 20;

    const rowHeight = 17;

    ctos.forEach((cto, index) => {
      // Salto de página si excede el límite
      if (doc.y > 540) {
        doc.addPage();
        drawTableHeader(doc.y);
        doc.y += 20;
      }

      const currentY = doc.y;

      // Color alternado de fila
      if (index % 2 === 1) {
        doc.rect(30, currentY - 1, 782, rowHeight).fill("#f8fafc");
      }

      // Fecha y hora
      doc.fillColor("#64748b").fontSize(7.5);
      doc.text(`${cto.auditDate} ${cto.auditTime}`, colX.fecha + 4, currentY + 3, { width: 68 });

      // Código CTO
      doc.fillColor("#0f172a").fontSize(8);
      doc.text(cto.num, colX.cto, currentY + 3, { width: 85 });

      // Estado con color
      const isCorrecto = cto.status === "CORRECTO";
      const isFallo = cto.status === "FALLO";
      const isRevisado = cto.status === "REVISADO";
      const statusColor = isCorrecto ? "#15803d" : isFallo ? "#b91c1c" : isRevisado ? "#0369a1" : "#64748b";
      
      doc.fillColor(statusColor).fontSize(7.5);
      doc.text(cto.status, colX.estado, currentY + 3, { width: 65 });

      // Subestado
      doc.fillColor("#475569").fontSize(7.5);
      doc.text(cto.subStatusName, colX.subestado, currentY + 3, { width: 105, height: 12, ellipsis: true });

      // Auditor
      doc.fillColor("#1e293b").fontSize(7.5);
      doc.text(cto.auditor, colX.auditor, currentY + 3, { width: 105, height: 12, ellipsis: true });

      // Técnico Asignado
      doc.fillColor("#475569").fontSize(7.5);
      doc.text(cto.assignedTo, colX.tecnico, currentY + 3, { width: 105, height: 12, ellipsis: true });

      // Zona / Cluster
      doc.fillColor("#64748b").fontSize(7.5);
      doc.text(`${cto.zona} / ${cto.cluster}`, colX.zonaCluster, currentY + 3, { width: 100, height: 12, ellipsis: true });

      // Puertos (Ocupados/Total)
      doc.fillColor("#0f172a").fontSize(7.5);
      doc.text(`${cto.puertosOcupados}/${cto.puertosTotal}`, colX.puertos, currentY + 3, { width: 50 });

      // Checklist (F=Formulario, D=Drive, A=Antala)
      const chkText = `${cto.hasFormulario === "SÍ" ? "F✓" : "F-"} ${cto.hasDrive === "SÍ" ? "D✓" : "D-"} ${cto.hasAntala === "SÍ" ? "A✓" : "A-"}`;
      doc.fillColor("#475569").fontSize(7);
      doc.text(chkText, colX.chk, currentY + 3, { width: 50 });

      doc.y = currentY + rowHeight;
    });

    // Paginación y pie de página en todas las páginas
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor("#94a3b8").fontSize(7.5);
      doc.text(
        `Plan Algodón — Documento Oficial de Auditoría | Página ${i + 1} de ${range.count}`,
        30,
        565,
        { align: "center", width: 782 }
      );
    }

    const pdfBuffer = await generatePdfBuffer(doc);
    const pdfFilename = `informe_auditoria_${nowMadridStr}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdfFilename}"`
      }
    });

  } catch (error: any) {
    console.error("Error en GET /api/admin/reports/export:", error);
    return NextResponse.json({ error: error.message || "Error exportando informe" }, { status: 500 });
  }
}
