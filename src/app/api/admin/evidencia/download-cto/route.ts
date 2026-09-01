import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { join } from "path";
import fs from "fs";
import JSZip from "jszip";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "ADMIN" && role !== "GESTOR" && role !== "AUDITOR") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const ctoId = searchParams.get("ctoId");
    const downloadType = searchParams.get("type"); // "antala" | "otros" | null

    if (!ctoId) {
      return NextResponse.json({ error: "ID de CTO no proporcionado" }, { status: 400 });
    }

    const cto = await prisma.cTO.findUnique({
      where: { id: ctoId },
      include: { images: true }
    });

    if (!cto) {
      return NextResponse.json({ error: "CTO no encontrada" }, { status: 404 });
    }

    if (!cto.images || cto.images.length === 0) {
      return NextResponse.json({ error: "Esta CTO no tiene imágenes asociadas" }, { status: 400 });
    }

    // Filtrado según downloadType si se requiere
    let targetImages = cto.images;
    if (downloadType === "antala") {
      targetImages = cto.images.filter(img => {
        const urlLower = (img.url || "").toLowerCase();
        return urlLower.includes("entorno") ||
               urlLower.includes("abierta") ||
               urlLower.includes("etiquetado") ||
               urlLower.includes("cableado") ||
               urlLower.includes("potencia") ||
               urlLower.includes("coordenadas");
      });
    } else if (downloadType === "otros") {
      targetImages = cto.images.filter(img => {
        const urlLower = (img.url || "").toLowerCase();
        const isAntala = urlLower.includes("entorno") ||
                         urlLower.includes("abierta") ||
                         urlLower.includes("etiquetado") ||
                         urlLower.includes("cableado") ||
                         urlLower.includes("potencia") ||
                         urlLower.includes("coordenadas");
        return !isAntala;
      });
    }

    if (targetImages.length === 0) {
      return NextResponse.json({ 
        error: downloadType === "antala" 
          ? "No se encontraron fotos de la categoría Antala para esta CTO" 
          : downloadType === "otros" 
            ? "No hay fotos adicionales / 'Otras fotos' para esta CTO" 
            : "No hay imágenes disponibles" 
      }, { status: 404 });
    }

    const zip = new JSZip();
    const uploadDir = join(process.cwd(), "public", "uploads");

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
        console.error("Error buscando archivo para zip:", err);
      }
      return null;
    }

    const cleanCto = cto.num.replace(/[^a-zA-Z0-9_-]/g, "_");
    const dateObj = cto.fechaAgregacion || new Date();
    const d = new Date(dateObj);
    const dayStr = String(d.getDate()).padStart(2, "0");
    const monthStr = String(d.getMonth() + 1).padStart(2, "0");
    const yearStr = String(d.getFullYear()).slice(-2);
    const datePattern = `${dayStr}${monthStr}${yearStr}`;

    const categoryCounter: { [key: string]: number } = {};

    for (const image of targetImages) {
      const filename = image.url.split("/").pop();
      if (!filename) continue;

      let filepath = join(uploadDir, filename);
      if (!fs.existsSync(filepath)) {
        const found = findFileRecursive(uploadDir, filename);
        if (found) filepath = found;
      }

      if (fs.existsSync(filepath)) {
        const fileBuffer = fs.readFileSync(filepath);

        const urlLower = filename.toLowerCase();
        let catKey = "foto";
        if (urlLower.includes("entorno")) catKey = "entorno";
        else if (urlLower.includes("abierta")) catKey = "cto_abierta";
        else if (urlLower.includes("cableado")) catKey = "etiquetado_cableado";
        else if (urlLower.includes("etiquetado")) catKey = "etiquetado_cto";
        else if (urlLower.includes("potencia")) catKey = "potencia";
        else if (urlLower.includes("coordenadas")) catKey = "mapa_coordenadas";
        else catKey = "otras";

        categoryCounter[catKey] = (categoryCounter[catKey] || 0) + 1;
        const idx = categoryCounter[catKey];
        const suffix = idx > 1 ? `_${idx}` : "";
        const standardZipFileName = `${catKey}${suffix}_${cleanCto}_${datePattern}.jpg`;

        zip.file(standardZipFileName, fileBuffer);
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    const safeNum = cleanCto;
    const zipPrefix = downloadType === "antala" ? "antala" : downloadType === "otros" ? "otras_fotos" : "evidencias";
    const response = new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=${zipPrefix}_cto_${safeNum}.zip`
      }
    });

    return response;
  } catch (error: any) {
    console.error("Error al descargar carpeta de evidencias de CTO:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
