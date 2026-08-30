import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET: listar todos los usuarios (accesible por cualquier usuario autenticado para asignación/filtros)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
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
      _count: { select: { assignedCTOs: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}

// POST: crear nuevo usuario
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { name, email, password, role, color } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email y contraseña son obligatorios" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name: name || "",
      email,
      password: hashedPassword,
      role: role || "USER",
      color: color || "#3b82f6",
    },
  });

  return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role, color: user.color });
}
