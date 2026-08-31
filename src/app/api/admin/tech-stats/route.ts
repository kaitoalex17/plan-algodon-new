import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    if (role !== "ADMIN" && role !== "GESTOR") {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    // Obtener parámetros de filtro
    const { searchParams } = new URL(req.url);
    const filterStatus = searchParams.get("status") || "";
    const filterSubStatusId = searchParams.get("subStatusId") || "";
    const filterCategory = searchParams.get("category") || "";

    // Construir filtro de Prisma
    const where: any = {};
    if (filterStatus) where.status = filterStatus;
    if (filterSubStatusId) {
      if (filterSubStatusId === "none") {
        where.subStatusId = null;
      } else {
        where.subStatusId = filterSubStatusId;
      }
    }
    if (filterCategory) where.category = filterCategory;

    // Obtener todos los usuarios técnicos y gestores
    const users = await prisma.user.findMany({
      where: {
        role: { in: ["USER", "AUDITOR", "GESTOR", "ADMIN"] }
      },
      select: {
        id: true,
        name: true,
        email: true,
        color: true,
        role: true
      },
      orderBy: { name: "asc" }
    });

    // Obtener todos los subestados disponibles
    const subStatuses = await prisma.subStatus.findMany({
      orderBy: { name: "asc" }
    });

    // Obtener todas las CTOs agrupadas o con los campos mínimos
    const ctos = await prisma.cTO.findMany({
      where,
      select: {
        id: true,
        status: true,
        subStatusId: true,
        assignedToId: true,
        category: true
      }
    });

    // Calcular estadísticas por cada técnico y para "Sin Asignar"
    const statsByUser: { [key: string]: {
      id: string;
      name: string;
      email: string;
      color: string;
      role: string;
      total: number;
      byStatus: { [status: string]: number };
      bySubStatus: { [subStatusId: string]: number };
    } } = {};

    // Inicializar técnicos
    users.forEach(u => {
      statsByUser[u.id] = {
        id: u.id,
        name: u.name || u.email || "Técnico",
        email: u.email || "",
        color: u.color || "#3b82f6",
        role: u.role,
        total: 0,
        byStatus: { PENDIENTE: 0, CORRECTO: 0, FALLO: 0, REVISADO: 0 },
        bySubStatus: {}
      };
    });

    // Inicializar "Sin Asignar"
    statsByUser["unassigned"] = {
      id: "unassigned",
      name: "Sin Asignar",
      email: "Cajas libres",
      color: "#94a3b8",
      role: "NONE",
      total: 0,
      byStatus: { PENDIENTE: 0, CORRECTO: 0, FALLO: 0, REVISADO: 0 },
      bySubStatus: {}
    };

    let grandTotal = 0;
    const globalStatusCounts: { [key: string]: number } = { PENDIENTE: 0, CORRECTO: 0, FALLO: 0, REVISADO: 0 };

    // Procesar conteos
    ctos.forEach(c => {
      grandTotal++;
      const targetUserId = c.assignedToId && statsByUser[c.assignedToId] ? c.assignedToId : "unassigned";
      
      const userStat = statsByUser[targetUserId];
      userStat.total++;

      if (c.status) {
        userStat.byStatus[c.status] = (userStat.byStatus[c.status] || 0) + 1;
        globalStatusCounts[c.status] = (globalStatusCounts[c.status] || 0) + 1;
      }

      if (c.subStatusId) {
        userStat.bySubStatus[c.subStatusId] = (userStat.bySubStatus[c.subStatusId] || 0) + 1;
      } else {
        userStat.bySubStatus["none"] = (userStat.bySubStatus["none"] || 0) + 1;
      }
    });

    // Convertir a lista y ordenar por total descendente
    const resultList = Object.values(statsByUser).sort((a, b) => {
      if (a.id === "unassigned") return 1;
      if (b.id === "unassigned") return -1;
      return b.total - a.total;
    });

    return NextResponse.json({
      technicians: resultList,
      subStatuses,
      grandTotal,
      globalStatusCounts
    });

  } catch (error: any) {
    console.error("Error en tech-stats API:", error);
    return NextResponse.json({ error: error.message || "Error al calcular estadísticas" }, { status: 500 });
  }
}
