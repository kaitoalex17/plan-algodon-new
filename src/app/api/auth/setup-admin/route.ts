import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET /api/auth/setup-admin - Garantiza que admin@algodon.xyz existe con la clave AlgodonAdmin2026
export async function GET(req: NextRequest) {
  try {
    const passwordToSet = "AlgodonAdmin2026";
    const hashedPassword = await bcrypt.hash(passwordToSet, 10);

    const user = await prisma.user.upsert({
      where: { email: "admin@algodon.xyz" },
      update: {
        password: hashedPassword,
        role: "ADMIN",
        tokenVersion: 1
      },
      create: {
        name: "Administrador",
        email: "admin@algodon.xyz",
        password: hashedPassword,
        role: "ADMIN",
        color: "#FF7900",
        tokenVersion: 1
      }
    });

    const totalUsers = await prisma.user.count();

    return NextResponse.json({
      success: true,
      message: "Usuario administrador configurado y listo para iniciar sesión.",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      credentials: {
        email: "admin@algodon.xyz",
        password: "AlgodonAdmin2026"
      },
      totalUsersInDb: totalUsers
    });
  } catch (error: any) {
    console.error("Error en setup-admin:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
