import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Almacén en memoria para velocidad y tiempo real
const liveTechLocations = new Map<string, {
  userId: string;
  name: string;
  email: string;
  color: string;
  role: string;
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt: number;
  updatedAtIso: string;
  lastAction?: string;
}>();

// Helper para leer ubicaciones persistidas en base de datos PostgreSQL
async function getPersistedDbLocations(): Promise<Record<string, any>> {
  try {
    const settingRecord = await prisma.setting.findUnique({
      where: { key: "tech_locations_db" }
    });
    if (settingRecord?.value) {
      return JSON.parse(settingRecord.value);
    }
  } catch (e) {
    console.error("Error leyendo tech_locations_db de Setting:", e);
  }
  return {};
}

// GET: Devuelve la última ubicación conocida y compartida de todos los técnicos
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // 1. Obtener todas las ubicaciones guardadas en BD (PostgreSQL permanente)
    const dbLocations = await getPersistedDbLocations();

    // 2. Obtener lista de usuarios de la base de datos
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        color: true,
        role: true,
        lastLat: true,
        lastLng: true,
        lastLogin: true,
      },
      orderBy: { name: "asc" }
    });

    const now = Date.now();
    const thirtyMinutesAgo = now - 30 * 60 * 1000;

    // 3. Cruzar datos: memoria -> base de datos Setting -> tabla User
    const result = users
      .filter(u => u.role !== "ADMIN" || liveTechLocations.has(u.id) || dbLocations[u.id])
      .map(u => {
        const live = liveTechLocations.get(u.id);
        const saved = dbLocations[u.id];

        // Determinar coordenadas y fecha más reciente
        let lat = live?.lat ?? saved?.lat ?? u.lastLat ?? null;
        let lng = live?.lng ?? saved?.lng ?? u.lastLng ?? null;
        let accuracy = live?.accuracy ?? saved?.accuracy ?? 20;
        let updatedAt = live?.updatedAt ?? saved?.updatedAt ?? (u.lastLogin ? new Date(u.lastLogin).getTime() : 0);
        let updatedAtIso = live?.updatedAtIso ?? saved?.updatedAtIso ?? (updatedAt ? new Date(updatedAt).toISOString() : null);
        let lastAction = live?.lastAction ?? saved?.lastAction ?? (u.lastLogin ? "Último inicio de sesión" : "Sin registro GPS");
        let isLive = Boolean(updatedAt && (now - updatedAt < 30 * 60 * 1000));
        let hasGps = lat !== null && lng !== null;

        return {
          userId: u.id,
          name: u.name || u.email.split("@")[0],
          email: u.email,
          color: u.color || "#FF7900",
          role: u.role,
          lat: lat !== null ? lat : 36.425,
          lng: lng !== null ? lng : -5.144,
          accuracy,
          updatedAt,
          updatedAtIso,
          lastAction,
          isLive,
          hasGps
        };
      });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: El técnico actualiza su posición GPS en vivo y se guarda en PostgreSQL
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { lat, lng, accuracy, action } = body;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "Coordenadas inválidas" }, { status: 400 });
    }

    const userId = (session.user as any).id;
    const name = session.user.name || session.user.email?.split("@")[0] || "Técnico";
    const email = session.user.email || "";
    const color = (session.user as any).color || "#FF7900";
    const role = (session.user as any).role || "USER";
    const nowMs = Date.now();
    const nowIso = new Date().toISOString();

    const locData = {
      userId,
      name,
      email,
      color,
      role,
      lat,
      lng,
      accuracy: accuracy || 15,
      updatedAt: nowMs,
      updatedAtIso: nowIso,
      lastAction: action || "Ubicación compartida"
    };

    // 1. Guardar en memoria
    liveTechLocations.set(userId, locData);

    // 2. Persistir en el modelo User (lastLat, lastLng)
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastLat: lat,
        lastLng: lng
      }
    }).catch(() => {});

    // 3. Persistir en PostgreSQL (modelo Setting) la fecha/hora exacta y coordenadas
    try {
      const dbLocations = await getPersistedDbLocations();
      dbLocations[userId] = locData;
      await prisma.setting.upsert({
        where: { key: "tech_locations_db" },
        create: {
          key: "tech_locations_db",
          value: JSON.stringify(dbLocations)
        },
        update: {
          value: JSON.stringify(dbLocations)
        }
      });
    } catch (dbErr) {
      console.error("Error persistiendo tech_locations_db en Setting:", dbErr);
    }

    return NextResponse.json({ success: true, location: locData });
  } catch (error: any) {
    console.error("Error guardando ubicación en vivo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
