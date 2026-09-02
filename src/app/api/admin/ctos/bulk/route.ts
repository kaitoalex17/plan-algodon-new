import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH: Actualización masiva de CTOs
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { ids, status, subStatusId, assignedToId } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Lista de IDs inválida" }, { status: 400 });
    }

    const updateData: any = {};
    const historyActions: string[] = [];

    if (status !== undefined) {
      updateData.status = status;
      historyActions.push(`Cambio masivo de estado a ${status}`);
    }

    if (subStatusId !== undefined) {
      updateData.subStatusId = subStatusId;
      if (subStatusId) {
        const sub = await prisma.subStatus.findUnique({ where: { id: subStatusId } });
        historyActions.push(`Cambio masivo de sub-estado a "${sub?.name || 'N/A'}"`);
      } else {
        historyActions.push("Limpieza masiva de sub-estados");
      }
    }

    if (assignedToId !== undefined) {
      updateData.assignedToId = assignedToId;
      if (assignedToId) {
        const u = await prisma.user.findUnique({ where: { id: assignedToId } });
        historyActions.push(`Asignación masiva a técnico: ${u?.name || u?.email || 'N/A'}`);
      } else {
        historyActions.push("Desasignación masiva de técnico");
      }
    }

    // Ejecutar actualización
    const result = await prisma.cTO.updateMany({
      where: { id: { in: ids } },
      data: updateData
    });

    // Registrar cambios en el historial de cada CTO actualizada
    const userId = (session.user as any).id;
    if (historyActions.length > 0) {
      const historyEntries = ids.map(id => ({
        action: historyActions.join(" | "),
        ctoId: id,
        userId: userId
      }));

      await prisma.history.createMany({
        data: historyEntries
      });
    }

    try {
      const { triggerBroadcastUpdate } = await import("@/app/api/realtime/route");
      await triggerBroadcastUpdate();
    } catch (realtimeErr) {
      console.error("Error al emitir sincronización en vivo desde bulk:", realtimeErr);
    }

    return NextResponse.json({ success: true, count: result.count });
  } catch (error: any) {
    console.error("Error en PATCH masivo /api/admin/ctos/bulk:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Eliminación masiva de CTOs
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { ids } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Lista de IDs inválida" }, { status: 400 });
    }

    // Eliminar fotos asociadas, comentarios e historial (se maneja por Cascade en onDelete en la BD)
    const result = await prisma.cTO.deleteMany({
      where: { id: { in: ids } }
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error: any) {
    console.error("Error en DELETE masivo /api/admin/ctos/bulk:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
