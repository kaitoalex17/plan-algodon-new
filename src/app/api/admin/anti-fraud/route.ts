import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Fórmula de Haversine para calcular distancia en metros entre 2 coordenadas GPS
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// GET: Devuelve registros de auditoría con comparativa de coordenadas
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const limit = parseInt(searchParams.get("limit") || "100");

    const whereClause: any = {
      action: { contains: "Auditada" }
    };
    if (userId) {
      whereClause.userId = userId;
    }

    const historyLogs = await prisma.history.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, name: true, email: true, color: true } },
        cto: { select: { id: true, num: true, numeroNuevo: true, lat: true, lng: true, status: true, municipio: true, cluster: true } }
      },
      orderBy: { timestamp: "desc" },
      take: limit
    });

    const analyzedLogs = historyLogs.map((log) => {
      let techLat: number | null = null;
      let techLng: number | null = null;
      let distanceMeters: number | null = null;
      let isSuspect = false;

      if (log.location && log.location.includes(",")) {
        const parts = log.location.split(",").map(p => parseFloat(p.trim()));
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          techLat = parts[0];
          techLng = parts[1];

          if (log.cto.lat && log.cto.lng) {
            distanceMeters = calculateDistanceMeters(log.cto.lat, log.cto.lng, techLat, techLng);
            // Si la auditoría se hizo a más de 300 metros de la CTO, marcar como sospechoso
            if (distanceMeters > 300) {
              isSuspect = true;
            }
          }
        }
      }

      return {
        id: log.id,
        action: log.action,
        timestamp: log.timestamp,
        techLocation: log.location,
        techLat,
        techLng,
        cto: log.cto,
        user: log.user,
        distanceMeters,
        isSuspect
      };
    });

    return NextResponse.json(analyzedLogs);
  } catch (error: any) {
    console.error("Error en reporte antifraude:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
