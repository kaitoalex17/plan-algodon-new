import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import JSZip from "jszip";
import { join } from "path";
import { promises as fs } from "fs";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Obtener todas las CTOs que tienen imágenes
    const ctos = await prisma.cTO.findMany({
      where: {
        images: {
          some: {}
        }
      },
      include: {
        images: true
      }
    });

    const zip = new JSZip();

    for (const cto of ctos) {
      // Nombre de la carpeta de la CTO
      const folderName = `CTO_${cto.num}`;
      const ctoFolder = zip.folder(folderName);
      if (!ctoFolder) continue;

      for (let i = 0; i < cto.images.length; i++) {
        const img = cto.images[i];
        
        // Extraer el nombre del archivo desde la URL (ej. /api/uploads/filename.jpg)
        const parts = img.url.split("/");
        const filename = parts[parts.length - 1];
        const filePath = join(process.cwd(), "public", "uploads", filename);

        try {
          const fileBuffer = await fs.readFile(filePath);
          const ext = filename.split(".").pop() || "jpg";
          const zipImageName = `${cto.num}_imagen_${i + 1}.${ext}`;
          ctoFolder.file(zipImageName, fileBuffer);
        } catch (err) {
          console.warn(`No se pudo leer la imagen del disco para exportar: ${filePath}`, err);
        }
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=CTO_imagenes_${Date.now()}.zip`,
      },
    });
  } catch (error: any) {
    console.error("Error al exportar imágenes ZIP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
