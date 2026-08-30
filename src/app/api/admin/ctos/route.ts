import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Listar CTOs paginadas y filtradas para la tabla de administración (PC)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const assignedToId = searchParams.get("assignedToId") || "";

    const offset = (page - 1) * limit;

    // Construir filtro de búsqueda
    const where: any = {};

    if (search) {
      where.OR = [
        { num: { contains: search, mode: "insensitive" } },
        { numeroNuevo: { contains: search, mode: "insensitive" } },
        { municipio: { contains: search, mode: "insensitive" } },
        { colocacion: { contains: search, mode: "insensitive" } },
        { olt: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (assignedToId) {
      if (assignedToId === "unassigned") {
        where.assignedToId = null;
      } else {
        where.assignedToId = assignedToId;
      }
    }

    // Consultar total y datos paginados
    const [totalCount, ctos] = await Promise.all([
      prisma.cTO.count({ where }),
      prisma.cTO.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          subStatus: { select: { id: true, name: true, color: true } }
        },
        orderBy: { num: "asc" },
        skip: offset,
        take: limit,
      })
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      ctos,
      totalCount,
      totalPages,
      currentPage: page,
    });
  } catch (error: any) {
    console.error("Error en GET /api/admin/ctos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Crear una CTO manualmente por un administrador
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { num, numeroNuevo, lat, lng, municipio, colocacion, status, subStatusId, assignedToId, notas, zona, cluster } = body;

    if (!num || lat === undefined || lng === undefined) {
      return NextResponse.json({ error: "Número, latitud y longitud son obligatorios" }, { status: 400 });
    }

    // Coordenadas en string original
    const coordenadas = `${lat}, ${lng}`;

    const newCto = await prisma.cTO.create({
      data: {
        num: String(num),
        numeroNuevo: numeroNuevo ? String(numeroNuevo) : null,
        coordenadas,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        municipio: municipio ? String(municipio) : null,
        colocacion: colocacion ? String(colocacion) : null,
        status: status || "PENDIENTE",
        subStatusId: subStatusId || null,
        assignedToId: assignedToId || null,
        notas: notas || null,
        zona: zona ? String(zona) : null,
        cluster: cluster ? String(cluster) : null,
      }
    });

    // Registrar en el historial
    const userId = (session.user as any).id;
    await prisma.history.create({
      data: {
        action: "Creada manualmente desde el panel de administración",
        ctoId: newCto.id,
        userId
      }
    });

    return NextResponse.json(newCto);
  } catch (error: any) {
    console.error("Error en POST /api/admin/ctos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
