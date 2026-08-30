import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Almacén en memoria de ubicaciones en vivo de técnicos
// userId -> { userId, name, email, color, role, lat, lng, accuracy, updatedAt }
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
}>();

// GET: Devuelve todas las ubicaciones activas en los últimos 30 minutos
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const now = Date.now();
    const thirtyMinutesAgo = now - 30 * 60 * 1000;

    // Limpiar entradas antiguas
    for (const [id, loc] of liveTechLocations.entries()) {
      if (loc.updatedAt < thirtyMinutesAgo) {
        liveTechLocations.delete(id);
      }
    }

    const locationsArray = Array.from(liveTechLocations.values());
    return NextResponse.json(locationsArray);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: El usuario/técnico actualiza su posición GPS en vivo
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { lat, lng, accuracy } = body;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "Coordenadas inválidas" }, { status: 400 });
    }

    const userId = (session.user as any).id;
    const name = session.user.name || session.user.email?.split("@")[0] || "Técnico";
    const email = session.user.email || "";
    const color = (session.user as any).color || "#FF7900";
    const role = (session.user as any).role || "USER";

    const locData = {
      userId,
      name,
      email,
      color,
      role,
      lat,
      lng,
      accuracy,
      updatedAt: Date.now()
    };

    liveTechLocations.set(userId, locData);

    // Opcional: Persistir última ubicación en el modelo User
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastLat: lat,
        lastLng: lng
      }
    }).catch(() => {});

    return NextResponse.json({ success: true, location: locData });
  } catch (error: any) {
    console.error("Error guardando ubicación en vivo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
