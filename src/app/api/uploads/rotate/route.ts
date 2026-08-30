import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { join } from "path";
import fs from "fs";
import sharp from "sharp";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    const { imageId, direction } = await req.json();
    if (!imageId || !direction) {
      return NextResponse.json({ error: "Parámetros insuficientes" }, { status: 400 });
    }

    const image = await prisma.image.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
    }

    const filename = image.url.split("/").pop();
    if (!filename) {
      return NextResponse.json({ error: "Nombre de archivo no válido" }, { status: 400 });
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
        console.error("Error buscando archivo para rotar:", err);
      }
      return null;
    }

    const uploadDir = join(process.cwd(), "public", "uploads");
    let filepath = join(uploadDir, filename);
    if (!fs.existsSync(filepath)) {
      const found = findFileRecursive(uploadDir, filename);
      if (found) filepath = found;
      else return NextResponse.json({ error: "Archivo físico no encontrado" }, { status: 404 });
    }

    // Rotar imagen
    const angle = direction === "left" || direction === -90 ? 270 : 90;
    
    const imageBuffer = fs.readFileSync(filepath);
    const rotatedBuffer = await sharp(imageBuffer)
      .rotate(angle)
      .toBuffer();

    fs.writeFileSync(filepath, rotatedBuffer);

    // Retornar éxito con una marca de tiempo para forzar la actualización de caché en la interfaz
    return NextResponse.json({ success: true, timestamp: Date.now() });
  } catch (error: any) {
    console.error("Error al rotar la imagen:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
