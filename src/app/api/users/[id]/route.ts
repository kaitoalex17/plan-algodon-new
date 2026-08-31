import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// PATCH & PUT: editar usuario
async function handleUpdateUser(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const { name, email, password, role, color } = await req.json();

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (role !== undefined) updateData.role = role;
  if (color !== undefined) updateData.color = color;
  if (password && password.trim() !== "") {
    updateData.password = await bcrypt.hash(password, 10);
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: { id: true, name: true, email: true, role: true, color: true },
  });

  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleUpdateUser(req, context);
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleUpdateUser(req, context);
}

// DELETE: eliminar usuario
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;

  // No permitir eliminar el propio usuario admin
  const currentUserId = (session.user as any).id;
  if (id === currentUserId) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
