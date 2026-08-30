import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Variable global en memoria para timestamp de última actualización del mapa
let globalLastMapUpdate = Date.now();

// GET: Consulta el timestamp actual de la última actualización del mapa
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Opcional: obtener timestamp guardado en la BD o memoria
    const setting = await prisma.setting.findUnique({
      where: { key: "lastMapBroadcastTimestamp" }
    });

    const dbTimestamp = setting ? parseInt(setting.value) : globalLastMapUpdate;
    const finalTimestamp = Math.max(globalLastMapUpdate, dbTimestamp);

    return NextResponse.json({
      lastUpdate: finalTimestamp,
      serverTime: Date.now()
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: El Administrador emite una señal para forzar la actualización del mapa a todos los usuarios conectados
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado. Solo administradores pueden emitir sincronizaciones globales." }, { status: 401 });
    }

    const newTimestamp = Date.now();
    globalLastMapUpdate = newTimestamp;

    // Guardar en la base de datos para persistencia entre múltiples instancias/workers
    await prisma.setting.upsert({
      where: { key: "lastMapBroadcastTimestamp" },
      update: { value: String(newTimestamp) },
      create: { key: "lastMapBroadcastTimestamp", value: String(newTimestamp) }
    });

    return NextResponse.json({
      success: true,
      message: "Señal de actualización global emitida a todos los técnicos y usuarios.",
      timestamp: newTimestamp
    });
  } catch (error: any) {
    console.error("Error emitiendo broadcast de mapa:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
