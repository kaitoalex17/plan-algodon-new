import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!session || (role !== "ADMIN" && role !== "GESTOR")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    // Filtros
    const auditStatus = searchParams.get("auditStatus") || "AUDITED"; // AUDITED, AUDITED_AND_REVISED, ALL, CORRECTO, FALLO, REVISADO, PENDIENTE
    const subStatusId = searchParams.get("subStatusId") || "ALL";
    const auditedById = searchParams.get("auditedById") || "ALL";
    const assignedToId = searchParams.get("assignedToId") || "ALL";
    const startDate = searchParams.get("startDate"); // YYYY-MM-DD
    const endDate = searchParams.get("endDate"); // YYYY-MM-DD
    const zona = searchParams.get("zona") || "ALL";
    const cluster = searchParams.get("cluster") || "ALL";
    const municipio = searchParams.get("municipio") || "ALL";
    const category = searchParams.get("category") || "ALL";
    const hasFormulario = searchParams.get("hasFormulario") || "ALL"; // ALL, true, false
    const hasDrive = searchParams.get("hasDrive") || "ALL";
    const hasAntala = searchParams.get("hasAntala") || "ALL";
    const search = (searchParams.get("search") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(10, parseInt(searchParams.get("limit") || "50")));

    // Construcción del objeto where para Prisma
    const where: any = {};

    // 1. Filtro de Estado de Auditoría
    if (auditStatus === "AUDITED") {
      where.status = { in: ["CORRECTO", "FALLO"] };
    } else if (auditStatus === "AUDITED_AND_REVISED") {
      where.status = { in: ["CORRECTO", "FALLO", "REVISADO"] };
    } else if (auditStatus === "CORRECTO" || auditStatus === "FALLO" || auditStatus === "REVISADO" || auditStatus === "PENDIENTE") {
      where.status = auditStatus;
    }

    // 2. Subestado
    if (subStatusId !== "ALL") {
      if (subStatusId === "NONE") {
        where.subStatusId = null;
      } else {
        where.subStatusId = subStatusId;
      }
    }

    // 3. Auditor
    if (auditedById !== "ALL") {
      if (auditedById === "NONE") {
        where.auditedById = null;
      } else {
        where.auditedById = auditedById;
      }
    }

    // 4. Técnico Asignado
    if (assignedToId !== "ALL") {
      if (assignedToId === "NONE") {
        where.assignedToId = null;
      } else {
        where.assignedToId = assignedToId;
      }
    }

    // 5. Ubicación y Red
    if (zona !== "ALL") where.zona = zona;
    if (cluster !== "ALL") where.cluster = cluster;
    if (municipio !== "ALL") where.municipio = municipio;
    if (category !== "ALL") where.category = category;

    // 6. Checklist
    if (hasFormulario === "true") where.hasFormulario = true;
    else if (hasFormulario === "false") where.hasFormulario = false;

    if (hasDrive === "true") where.hasDrive = true;
    else if (hasDrive === "false") where.hasDrive = false;

    if (hasAntala === "true") where.hasAntala = true;
    else if (hasAntala === "false") where.hasAntala = false;

    // 7. Búsqueda de texto
    if (search) {
      where.OR = [
        { num: { contains: search, mode: "insensitive" } },
        { numeroNuevo: { contains: search, mode: "insensitive" } },
        { notas: { contains: search, mode: "insensitive" } }
      ];
    }

    // 8. Rango de Fechas de Auditoría
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

    // Consultar total antes de paginar para métricas
    const totalCount = await prisma.cTO.count({ where });

    // Consultar CTOs paginadas
    const rawCtos = await prisma.cTO.findMany({
      where,
      include: {
        subStatus: true,
        auditedBy: { select: { id: true, name: true, email: true, color: true } },
        assignedTo: { select: { id: true, name: true, email: true, color: true } },
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
      orderBy: { num: "asc" },
      skip: (page - 1) * limit,
      take: limit
    });

    // Mapear CTOs con formato amigable
    const ctos = rawCtos.map(c => {
      let auditDate = "N/A";
      let auditTime = "N/A";
      let auditTimestamp = 0;

      const latestAuditLog = c.history && c.history[0];
      if (latestAuditLog && latestAuditLog.timestamp) {
        auditTimestamp = latestAuditLog.timestamp.getTime();
        auditDate = latestAuditLog.timestamp.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
        auditTime = latestAuditLog.timestamp.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
      } else if (c.status !== "PENDIENTE" && c.fechaAgregacion) {
        auditTimestamp = c.fechaAgregacion.getTime();
        auditDate = c.fechaAgregacion.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
        auditTime = c.fechaAgregacion.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
      }

      return {
        id: c.id,
        num: c.num,
        numeroNuevo: c.numeroNuevo || "",
        status: c.status,
        subStatusId: c.subStatusId || "",
        subStatusName: c.subStatus?.name || "Sin Subestado",
        subStatusColor: c.subStatus?.color || "#808080",
        category: c.category,
        zona: c.zona || "Sin zona",
        cluster: c.cluster || "Sin cluster",
        municipio: c.municipio || "",
        auditor: c.auditedBy?.name || c.auditedBy?.email || "Sin auditor",
        auditorId: c.auditedById || "",
        assignedTo: c.assignedTo?.name || c.assignedTo?.email || "Sin asignar",
        assignedToId: c.assignedToId || "",
        hasFormulario: c.hasFormulario,
        hasDrive: c.hasDrive,
        hasAntala: c.hasAntala,
        puertosTotal: c.puertosTotal || 16,
        puertosOcupados: c.puertosOcupados || 0,
        potenciaDbm: c.potenciaDbm,
        lat: c.lat,
        lng: c.lng,
        coordenadas: c.coordenadas,
        driveFolderLink: c.driveFolderLink || "",
        auditDate,
        auditTime,
        auditTimestamp
      };
    });

    // Calcular estadísticas sobre el conjunto filtrado
    const [correctCount, falloCount, revisadoCount, pendienteCount, conFormularioCount, conDriveCount] = await Promise.all([
      prisma.cTO.count({ where: { ...where, status: "CORRECTO" } }),
      prisma.cTO.count({ where: { ...where, status: "FALLO" } }),
      prisma.cTO.count({ where: { ...where, status: "REVISADO" } }),
      prisma.cTO.count({ where: { ...where, status: "PENDIENTE" } }),
      prisma.cTO.count({ where: { ...where, hasFormulario: true } }),
      prisma.cTO.count({ where: { ...where, hasDrive: true } })
    ]);

    // Opciones para los desplegables de filtros
    const [users, subStatuses, rawZonas, rawClusters, rawMunicipios] = await Promise.all([
      prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, color: true },
        orderBy: { name: "asc" }
      }),
      prisma.subStatus.findMany({
        orderBy: { name: "asc" }
      }),
      prisma.cTO.findMany({
        where: { zona: { not: null } },
        select: { zona: true },
        distinct: ["zona"],
        orderBy: { zona: "asc" }
      }),
      prisma.cTO.findMany({
        where: { cluster: { not: null } },
        select: { cluster: true },
        distinct: ["cluster"],
        orderBy: { cluster: "asc" }
      }),
      prisma.cTO.findMany({
        where: { municipio: { not: null } },
        select: { municipio: true },
        distinct: ["municipio"],
        orderBy: { municipio: "asc" }
      })
    ]);

    return NextResponse.json({
      ctos,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 1,
      stats: {
        total: totalCount,
        correctas: correctCount,
        fallos: falloCount,
        revisadas: revisadoCount,
        pendientes: pendienteCount,
        conFormulario: conFormularioCount,
        conDrive: conDriveCount
      },
      filterOptions: {
        users,
        subStatuses,
        zonas: rawZonas.map(z => z.zona).filter(Boolean),
        clusters: rawClusters.map(c => c.cluster).filter(Boolean),
        municipios: rawMunicipios.map(m => m.municipio).filter(Boolean)
      }
    });
  } catch (error: any) {
    console.error("Error en GET /api/admin/reports:", error);
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
