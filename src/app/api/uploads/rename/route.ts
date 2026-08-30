import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { join } from "path";
import fs from "fs";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    const { imageId, newName } = await req.json();
    if (!imageId || !newName) {
      return NextResponse.json({ error: "ID de imagen o nombre no proporcionado" }, { status: 400 });
    }

    const image = await prisma.image.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
    }

    const oldFilename = image.url.split("/").pop();
    if (!oldFilename) {
      return NextResponse.json({ error: "Nombre de archivo antiguo no válido" }, { status: 400 });
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
        console.error("Error buscando archivo para renombrar:", err);
      }
      return null;
    }

    const uploadDir = join(process.cwd(), "public", "uploads");
    let oldFilepath = join(uploadDir, oldFilename);
    if (!fs.existsSync(oldFilepath)) {
      const found = findFileRecursive(uploadDir, oldFilename);
      if (found) oldFilepath = found;
      else return NextResponse.json({ error: "Archivo original no encontrado" }, { status: 404 });
    }

    const containingDir = join(oldFilepath, "..");
    const ext = oldFilename.split(".").pop();
    const cleanName = newName.replace(/[^a-zA-Z0-9_-]/g, "_");
    // Conservamos el sufijo único original para evitar colisiones
    const parts = oldFilename.split("-");
    const uniqueSuffix = parts[0] + "-" + parts[1]; // timestamp-random
    const newFilename = `${uniqueSuffix}-${cleanName}.${ext}`;
    const newFilepath = join(containingDir, newFilename);

    // Renombrar en disco
    fs.renameSync(oldFilepath, newFilepath);

    // Actualizar en base de datos
    const newUrl = `/api/uploads/${newFilename}`;
    const updatedImage = await prisma.image.update({
      where: { id: imageId },
      data: { url: newUrl },
    });

    return NextResponse.json({ success: true, image: updatedImage });
  } catch (error: any) {
    console.error("Error al renombrar la imagen:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
