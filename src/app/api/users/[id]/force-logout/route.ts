import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST: Forzar cierre de sesión de un usuario específico invalidando sus tokens activos
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, tokenVersion: true }
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Incrementar tokenVersion para invalidar inmediatamente cualquier JWT activo del usuario
    const updated = await prisma.user.update({
      where: { id },
      data: {
        tokenVersion: {
          increment: 1
        }
      },
      select: { id: true, name: true, email: true, tokenVersion: true }
    });

    return NextResponse.json({
      success: true,
      message: `Sesión cerrada forzosamente para ${updated.name || updated.email}`,
      user: updated
    });
  } catch (error: any) {
    console.error("Error al forzar logout de usuario:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
