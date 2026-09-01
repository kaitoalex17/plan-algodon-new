import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        color: true,
        lastLogin: true,
        lastLat: true,
        lastLng: true,
        _count: {
          select: {
            assignedCTOs: true,
            auditedCTOs: true,
            history: true,
          }
        },
        history: {
          take: 1,
          orderBy: { timestamp: "desc" },
          select: {
            action: true,
            timestamp: true,
            location: true,
            cto: {
              select: {
                num: true,
                municipio: true,
                cluster: true,
              }
            }
          }
        }
      },
      orderBy: { name: "asc" }
    });

    const now = Date.now();
    const fifteenMinutesAgo = now - 15 * 60 * 1000;
    const twelveHoursAgo = now - 12 * 60 * 60 * 1000;

    const enrichedUsers = users.map(user => {
      const lastHistory = user.history && user.history.length > 0 ? user.history[0] : null;
      const lastLoginTime = user.lastLogin ? new Date(user.lastLogin).getTime() : 0;
      const lastActivityTime = lastHistory ? new Date(lastHistory.timestamp).getTime() : 0;
      const mostRecentActionTime = Math.max(lastLoginTime, lastActivityTime);

      const isOnlineRecent = mostRecentActionTime > fifteenMinutesAgo;
      const isActiveToday = mostRecentActionTime > twelveHoursAgo;

      return {
        id: user.id,
        name: user.name || user.email.split("@")[0],
        email: user.email,
        role: user.role,
        color: user.color,
        lastLogin: user.lastLogin,
        lastLat: user.lastLat,
        lastLng: user.lastLng,
        assignedCount: user._count.assignedCTOs,
        auditedCount: user._count.auditedCTOs,
        totalActionsCount: user._count.history,
        lastAction: lastHistory ? {
          action: lastHistory.action,
          timestamp: lastHistory.timestamp,
          location: lastHistory.location,
          ctoNum: lastHistory.cto?.num,
          municipio: lastHistory.cto?.municipio,
          cluster: lastHistory.cto?.cluster,
        } : null,
        status: isOnlineRecent ? "ONLINE" : isActiveToday ? "ACTIVE" : "INACTIVE",
        mostRecentTime: mostRecentActionTime > 0 ? new Date(mostRecentActionTime) : null
      };
    });

    // Ordenar: primero los ONLINE, luego ACTIVE, luego INACTIVE por fecha más reciente
    enrichedUsers.sort((a, b) => {
      const order = { ONLINE: 0, ACTIVE: 1, INACTIVE: 2 };
      if (order[a.status as "ONLINE" | "ACTIVE" | "INACTIVE"] !== order[b.status as "ONLINE" | "ACTIVE" | "INACTIVE"]) {
        return order[a.status as "ONLINE" | "ACTIVE" | "INACTIVE"] - order[b.status as "ONLINE" | "ACTIVE" | "INACTIVE"];
      }
      const timeA = a.mostRecentTime ? new Date(a.mostRecentTime).getTime() : 0;
      const timeB = b.mostRecentTime ? new Date(b.mostRecentTime).getTime() : 0;
      return timeB - timeA;
    });

    return NextResponse.json({
      users: enrichedUsers,
      totalCount: enrichedUsers.length,
      onlineCount: enrichedUsers.filter(u => u.status === "ONLINE").length,
      activeCount: enrichedUsers.filter(u => u.status === "ACTIVE" || u.status === "ONLINE").length,
    });
  } catch (error: any) {
    console.error("Error al obtener sesiones activas:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
