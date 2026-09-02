import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    if (role !== "ADMIN" && role !== "GESTOR") {
      return NextResponse.json({ error: "Acceso denegado: solo administradores y gestores" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const cluster = searchParams.get("cluster") || "";
    const technicianId = searchParams.get("technicianId") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "30")));

    const where: any = {
      status: "REPARAR"
    };

    if (search.trim()) {
      where.OR = [
        { num: { contains: search.trim(), mode: "insensitive" } },
        { numeroNuevo: { contains: search.trim(), mode: "insensitive" } },
        { municipio: { contains: search.trim(), mode: "insensitive" } },
        { colocacion: { contains: search.trim(), mode: "insensitive" } },
        { notas: { contains: search.trim(), mode: "insensitive" } }
      ];
    }

    if (cluster) {
      where.cluster = cluster;
    }

    if (technicianId) {
      where.assignedToId = technicianId;
    }

    // Consultas paralelas
    const [totalCount, ctos, allRepairCtos] = await Promise.all([
      prisma.cTO.count({ where }),
      prisma.cTO.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [
          { fechaAgregacion: "desc" },
          { id: "desc" }
        ],
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true, color: true }
          },
          auditedBy: {
            select: { id: true, name: true, email: true, color: true }
          },
          subStatus: {
            select: { id: true, name: true, color: true }
          },
          images: {
            select: { id: true, url: true }
          },
          comments: {
            select: { id: true, text: true, createdAt: true, user: { select: { name: true, email: true } } },
            orderBy: { createdAt: "desc" },
            take: 3
          },
          history: {
            where: {
              OR: [
                { action: { contains: "REPARAR", mode: "insensitive" } },
                { action: { contains: "reparación", mode: "insensitive" } }
              ]
            },
            orderBy: { timestamp: "desc" },
            take: 1,
            select: { id: true, action: true, timestamp: true, user: { select: { name: true, email: true } } }
          }
        }
      }),
      // Para obtener técnicos únicos y clústeres únicos con CTOs en reparación
      prisma.cTO.findMany({
        where: { status: "REPARAR" },
        select: {
          cluster: true,
          assignedToId: true,
          assignedTo: { select: { id: true, name: true, email: true, color: true } }
        }
      })
    ]);

    // Extraer clústeres únicos
    const clusters = Array.from(
      new Set(allRepairCtos.map(c => c.cluster).filter(Boolean) as string[])
    ).sort();

    // Contar por técnico
    const techMap = new Map<string, { id: string; name: string; email: string; color?: string; count: number }>();
    allRepairCtos.forEach(c => {
      if (c.assignedTo) {
        const id = c.assignedTo.id;
        if (!techMap.has(id)) {
          techMap.set(id, {
            id,
            name: c.assignedTo.name || c.assignedTo.email,
            email: c.assignedTo.email,
            color: c.assignedTo.color || undefined,
            count: 0
          });
        }
        techMap.get(id)!.count++;
      }
    });

    const technicians = Array.from(techMap.values()).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      ctos,
      totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
      currentPage: page,
      clusters,
      technicians,
      stats: {
        totalInRepair: allRepairCtos.length,
        techniciansWithRepairs: techMap.size,
        clustersWithRepairs: clusters.length
      }
    });
  } catch (error: any) {
    console.error("Error en GET /api/admin/repair:", error);
    return NextResponse.json({ error: "Error al obtener CTOs en reparación" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    if (role !== "ADMIN" && role !== "GESTOR") {
      return NextResponse.json({ error: "Acceso denegado: solo administradores y gestores" }, { status: 403 });
    }

    const body = await request.json();
    const { ctoId, newStatus, assignedToId, subStatusId, commentText } = body;

    if (!ctoId) {
      return NextResponse.json({ error: "ctoId es obligatorio" }, { status: 400 });
    }

    const existingCto = await prisma.cTO.findUnique({
      where: { id: ctoId },
      include: { assignedTo: true }
    });

    if (!existingCto) {
      return NextResponse.json({ error: "CTO no encontrada" }, { status: 404 });
    }

    const currentUserId = (session.user as any)?.id;
    const adminName = session.user.name || session.user.email || "Administrador";

    const updateData: any = {};

    if (newStatus && ["PENDIENTE", "CORRECTO", "FALLO", "REPARAR", "REVISADO"].includes(newStatus)) {
      updateData.status = newStatus;
    }

    if (assignedToId !== undefined) {
      updateData.assignedToId = assignedToId || null;
    }

    if (subStatusId !== undefined) {
      updateData.subStatusId = subStatusId || null;
    }

    const updatedCto = await prisma.cTO.update({
      where: { id: ctoId },
      data: updateData,
      include: {
        assignedTo: true,
        subStatus: true
      }
    });

    // Guardar comentario si se facilitó
    if (commentText && commentText.trim()) {
      await prisma.comment.create({
        data: {
          ctoId,
          userId: currentUserId,
          text: `[GESTIÓN REPARACIONES - ${adminName}]: ${commentText.trim()}`
        }
      });
    }

    // Registrar en Historial
    let historyAction = `Gestión de Reparación por ${adminName}`;
    if (newStatus && newStatus !== existingCto.status) {
      historyAction = `Estado cambiado de ${existingCto.status} a ${newStatus} por ${adminName}`;
    } else if (assignedToId !== undefined && assignedToId !== existingCto.assignedToId) {
      historyAction = `Técnico reasignado por ${adminName}`;
    }

    await prisma.history.create({
      data: {
        ctoId,
        userId: currentUserId,
        action: historyAction
      }
    });

    try {
      const { triggerBroadcastUpdate } = await import("@/app/api/realtime/route");
      await triggerBroadcastUpdate();
    } catch (realtimeErr) {
      console.error("Error al emitir sincronización en vivo desde repair:", realtimeErr);
    }

    return NextResponse.json({
      success: true,
      cto: updatedCto,
      message: "CTO actualizada con éxito"
    });
  } catch (error: any) {
    console.error("Error en PATCH /api/admin/repair:", error);
    return NextResponse.json({ error: "Error al actualizar la CTO" }, { status: 500 });
  }
}
