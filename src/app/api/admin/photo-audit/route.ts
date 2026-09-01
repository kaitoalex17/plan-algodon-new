import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Listado paginado de CTOs (por defecto cerradas / con imágenes) de 10 en 10
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const statusFilter = searchParams.get("status") || "ALL"; // ALL, CORRECTO, FALLO, PENDIENTE, REPARAR
    const cluster = searchParams.get("cluster") || "";
    const search = searchParams.get("search") || "";
    const technicianId = searchParams.get("technicianId") || "";
    const photosFilter = searchParams.get("photosFilter") || "ALL"; // ALL, WITH_PHOTOS, WITHOUT_PHOTOS
    const onlyWithImages = searchParams.get("onlyWithImages");

    const skip = (page - 1) * limit;

    const conditions: any[] = [];

    // Soporte para filtro de fotos incompletas en cajas cerradas por técnicos
    if (photosFilter === "INCOMPLETE" || statusFilter === "INCOMPLETE") {
      const closedForIncomplete = await prisma.cTO.findMany({
        where: { status: { in: ["CORRECTO", "FALLO"] } },
        select: { id: true, _count: { select: { images: true } } }
      });
      const incompleteIds = closedForIncomplete.filter(c => c._count.images < 6).map(c => c.id);
      conditions.push({ id: { in: incompleteIds } });
    } else if (photosFilter === "WITH_PHOTOS" || onlyWithImages === "true") {
      conditions.push({ images: { some: {} } });
    } else if (photosFilter === "WITHOUT_PHOTOS") {
      conditions.push({ images: { none: {} } });
    }

    if (statusFilter === "PENDIENTE_AUDITORIA") {
      conditions.push({ status: { in: ["CORRECTO", "FALLO", "PENDIENTE"] } });
      conditions.push({
        OR: [
          { auditedById: null },
          { auditedBy: { role: { not: "ADMIN" } } }
        ]
      });
    } else if (statusFilter === "AUDITADO_CORRECTO") {
      conditions.push({ status: "CORRECTO" });
      conditions.push({ auditedBy: { role: "ADMIN" } });
    } else if (statusFilter !== "ALL" && statusFilter !== "INCOMPLETE") {
      conditions.push({ status: statusFilter });
    }

    if (cluster) {
      conditions.push({ cluster });
    }

    if (technicianId) {
      conditions.push({ assignedToId: technicianId });
    }

    if (search) {
      conditions.push({
        OR: [
          { num: { contains: search, mode: "insensitive" } },
          { numeroNuevo: { contains: search, mode: "insensitive" } },
          { municipio: { contains: search, mode: "insensitive" } },
          { cluster: { contains: search, mode: "insensitive" } },
        ]
      });
    }

    const whereClause: any = conditions.length > 0 ? { AND: conditions } : {};

    const [
      totalCount,
      ctos,
      pendingCount,
      repairCount,
      correctCount,
      falloCount,
      withoutPhotosCount,
      totalImagesCount,
      pendingImagesCount,
      reviewedImagesCount,
      closedCtosImagesCount,
      auditedCorrectCount,
      pendingAuditCount
    ] = await Promise.all([
      prisma.cTO.count({ where: whereClause }),
      prisma.cTO.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { fechaAgregacion: "desc" },
        include: {
          images: true,
          subStatus: { select: { id: true, name: true, color: true } },
          assignedTo: { select: { id: true, name: true, email: true, color: true } },
          auditedBy: { select: { id: true, name: true, email: true, role: true, color: true } },
        }
      }),
      prisma.cTO.count({ where: { status: "PENDIENTE" } }),
      prisma.cTO.count({ where: { status: "REPARAR" } }),
      prisma.cTO.count({ where: { status: "CORRECTO" } }),
      prisma.cTO.count({ where: { status: "FALLO" } }),
      prisma.cTO.count({ where: { images: { none: {} } } }),
      prisma.image.count(),
      prisma.image.count({ where: { cto: { OR: [{ auditedById: null }, { auditedBy: { role: { not: "ADMIN" } } }] } } }),
      prisma.image.count({ where: { cto: { auditedBy: { role: "ADMIN" } } } }),
      prisma.cTO.findMany({
        where: { status: { in: ["CORRECTO", "FALLO"] } },
        select: { id: true, _count: { select: { images: true } } }
      }),
      prisma.cTO.count({ where: { status: "CORRECTO", auditedBy: { role: "ADMIN" } } }),
      prisma.cTO.count({ where: { status: { in: ["CORRECTO", "FALLO"] }, OR: [{ auditedById: null }, { auditedBy: { role: { not: "ADMIN" } } }] } })
    ]);

    const incompletePhotosCount = closedCtosImagesCount.filter(c => c._count.images < 6).length;
    const closedByTechCount = closedCtosImagesCount.length;

    // Obtener lista de clústeres disponibles para filtros
    const clustersRaw = await prisma.cTO.findMany({
      where: { cluster: { not: null } },
      select: { cluster: true },
      distinct: ["cluster"]
    });
    const clusters = clustersRaw.map(c => c.cluster).filter(Boolean) as string[];

    // Obtener técnicos disponibles para el selector
    const technicians = await prisma.user.findMany({
      where: { role: { in: ["USER", "AUDITOR", "GESTOR"] } },
      select: { id: true, name: true, email: true, color: true },
      orderBy: { name: "asc" }
    });

    return NextResponse.json({
      ctos,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      hasMore: skip + ctos.length < totalCount,
      clusters,
      technicians,
      stats: {
        pendingCount,
        repairCount,
        correctCount,
        falloCount,
        withoutPhotosCount,
        totalImagesCount,
        pendingImagesCount,
        reviewedImagesCount,
        closedByTechCount,
        auditedCorrectCount,
        pendingAuditCount,
        incompletePhotosCount
      }
    });
  } catch (error: any) {
    console.error("Error en photo-audit GET:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: Cambiar el estado de la CTO desde la auditoría visual de fotos
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { ctoId, newStatus, reason } = await req.json();

    if (!ctoId || !["CORRECTO", "FALLO", "PENDIENTE", "REPARAR"].includes(newStatus)) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const currentUserId = (session.user as any).id;
    const adminName = session.user?.name || "Administrador";

    // Actualizar CTO
    const updatedCto = await prisma.cTO.update({
      where: { id: ctoId },
      data: {
        status: newStatus,
        auditedById: newStatus !== "PENDIENTE" ? currentUserId : undefined
      },
      include: {
        images: true,
        subStatus: { select: { id: true, name: true, color: true } },
        assignedTo: { select: { id: true, name: true, email: true, color: true } },
        auditedBy: { select: { id: true, name: true, email: true, color: true } },
      }
    });

    // Si se manda a REPARAR o a FALLO con motivo, guardar comentario para el buzón de la CTO
    if (reason && (newStatus === "REPARAR" || newStatus === "FALLO")) {
      try {
        await prisma.comment.create({
          data: {
            ctoId,
            userId: currentUserId,
            text: newStatus === "REPARAR"
              ? `[REPARACIÓN SOLICITADA]: ${reason}`
              : `[INCIDENCIA DETECTADA]: ${reason}`
          }
        });
      } catch (comErr) {
        console.error("Error al crear comentario de reparación:", comErr);
      }
    }

    // Registrar en Historial
    const actionText = newStatus === "CORRECTO"
      ? `Evidencias Validadas Bien (CORRECTO) por ${adminName}`
      : newStatus === "REPARAR"
      ? `Evidencias Rechazadas - Enviada a REPARAR por ${adminName}${reason ? `: ${reason}` : ''}`
      : newStatus === "FALLO"
      ? `Evidencias Marcadas con Fallo (FALLO) por ${adminName}${reason ? `: ${reason}` : ''}`
      : `Estado cambiado a PENDIENTE por ${adminName}`;

    await prisma.history.create({
      data: {
        ctoId,
        userId: currentUserId,
        action: actionText
      }
    });

    return NextResponse.json({ success: true, cto: updatedCto });
  } catch (error: any) {
    console.error("Error en photo-audit PATCH:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
