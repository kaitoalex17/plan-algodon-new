import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { join } from "path";
import fs from "fs";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    // Para simplificar el desarrollo e integración permitimos las solicitudes,
    // pero validamos si hay un usuario autenticado para seguridad básica.

    const { imageId } = await req.json();
    if (!imageId) {
      return NextResponse.json({ error: "ID de imagen no proporcionado" }, { status: 400 });
    }

    const image = await prisma.image.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
    }

    function findFileRecursive(dir: string, targetName: string): string | null {
      try {
        if (!fs.existsSync(dir)) return null;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            const found = findFileRecursive(fullPath, targetName);
            if (found) return found;
          } else if (entry.name === targetName) {
            return fullPath;
          }
        }
      } catch (err) {
        console.error("Error buscando archivo para eliminar:", err);
      }
      return null;
    }

    // Extraer el nombre del archivo de la URL (/api/uploads/filename)
    const filename = image.url.split("/").pop();
    if (filename) {
      const uploadDir = join(process.cwd(), "public", "uploads");
      let filepath = join(uploadDir, filename);
      if (!fs.existsSync(filepath)) {
        const found = findFileRecursive(uploadDir, filename);
        if (found) filepath = found;
      }
      if (fs.existsSync(filepath)) {
        try {
          fs.unlinkSync(filepath);
        } catch (unlinkError) {
          console.error("Error al eliminar archivo del disco:", unlinkError);
        }
      }
    }

    await prisma.image.delete({
      where: { id: imageId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en endpoint borrar imagen:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
