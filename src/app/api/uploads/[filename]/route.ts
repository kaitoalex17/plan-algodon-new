import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import fs, { promises as fsp } from "fs";

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    // Sanitize filename to avoid path traversal
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uploadsDir = join(process.cwd(), "public", "uploads");

    // 1. Intentar directo en raíz de uploads
    let filePath = join(uploadsDir, safeFilename);
    if (!fs.existsSync(filePath)) {
      // 2. Buscar en subcarpetas de fechas y CTOs
      const recursiveFound = findFileRecursive(uploadsDir, safeFilename);
      if (recursiveFound) {
        filePath = recursiveFound;
      } else {
        return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
      }
    }

    const fileBuffer = await fsp.readFile(filePath);

    // Get mime type based on extension
    const ext = safeFilename.split(".").pop()?.toLowerCase();
    let contentType = "image/jpeg";
    if (ext === "png") {
      contentType = "image/png";
    } else if (ext === "gif") {
      contentType = "image/gif";
    } else if (ext === "webp") {
      contentType = "image/webp";
    } else if (ext === "svg") {
      contentType = "image/svg+xml";
    }

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
  }
}

