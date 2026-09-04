import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { join } from "path";
import fs from "fs";
import JSZip from "jszip";

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
    console.error("Error buscando archivo recursivamente:", err);
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "ADMIN" && role !== "GESTOR" && role !== "AUDITOR") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clusterParam = searchParams.get("cluster"); // ej: "BNH_A001" o "all"
    const zonaParam = searchParams.get("zona"); // ej: "CLUSTER A" o "A"

    const where: any = {
      images: {
        some: {}
      }
    };

    if (clusterParam && clusterParam !== "all") {
      where.cluster = clusterParam;
    }
    if (zonaParam && zonaParam !== "all") {
      where.zona = zonaParam;
    }

    const ctos = await prisma.cTO.findMany({
      where,
      include: {
        images: {
          orderBy: { id: "asc" }
        }
      },
      orderBy: [
        { cluster: "asc" },
        { num: "asc" }
      ]
    });

    if (ctos.length === 0) {
      return NextResponse.json({ error: "No se encontraron evidencias para el clúster seleccionado" }, { status: 404 });
    }

    const zip = new JSZip();
    const uploadsDir = join(process.cwd(), "public", "uploads");
    let totalPhotosAdded = 0;

    for (const cto of ctos) {
      const clusterFolder = cto.cluster || "SIN_CLUSTER";
      const safeCtoNum = (cto.num || "CTO").replace(/[^a-zA-Z0-9_-]/g, "_");
      
      // Estructura requerida por el usuario:
      // CLUSTER_NOMBRE / CTOs / NOMBRE_DE_LA_CTO / tipodefoto[_indice]_[cto]_[dia].jpg
      const targetZipPath = `${clusterFolder}/CTOs/${safeCtoNum}`;
      const folderRef = zip.folder(targetZipPath);
      if (!folderRef) continue;

      const dateObj = cto.fechaAgregacion || new Date();
      const d = new Date(dateObj);
      const dayStr = String(d.getDate()).padStart(2, "0");
      const monthStr = String(d.getMonth() + 1).padStart(2, "0");
      const yearStr = String(d.getFullYear()).slice(-2);
      const datePattern = `${dayStr}${monthStr}${yearStr}`;

      const categoryCounter: { [key: string]: number } = {};

      for (let i = 0; i < cto.images.length; i++) {
        const img = cto.images[i];
        const rawFilename = img.url.split("/").pop() || `foto_${i + 1}.jpg`;
        const safeFilename = rawFilename.replace(/[^a-zA-Z0-9.-]/g, "_");

        let filePath = join(uploadsDir, safeFilename);
        if (!fs.existsSync(filePath)) {
          const recursive = findFileRecursive(uploadsDir, safeFilename);
          if (recursive) filePath = recursive;
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const fileData = fs.readFileSync(filePath);

          const urlLower = rawFilename.toLowerCase();
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
          const standardName = `${catKey}${suffix}_${safeCtoNum}_${datePattern}.jpg`;

          folderRef.file(standardName, fileData);
          totalPhotosAdded++;
        }
      }
    }

    if (totalPhotosAdded === 0) {
      return NextResponse.json({ error: "No se encontraron archivos de fotos en el servidor para este clúster" }, { status: 404 });
    }

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    const filename = clusterParam && clusterParam !== "all" 
      ? `Evidencias_${clusterParam}_CTOs.zip`
      : `Evidencias_Clusters_CTOs_${Date.now()}.zip`;

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });

  } catch (error: any) {
    console.error("Error al exportar evidencias por cluster:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
