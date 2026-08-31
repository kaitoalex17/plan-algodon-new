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
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    // Validar acceso: o bien sesión con rol ADMIN/GESTOR/AUDITOR, o token público de acceso
    let isAuthorized = false;
    if (session) {
      const role = (session.user as any)?.role;
      if (role === "ADMIN" || role === "GESTOR" || role === "AUDITOR") {
        isAuthorized = true;
      }
    }

    if (!isAuthorized && token) {
      const setting = await prisma.setting.findUnique({
        where: { key: "publicAccessToken" }
      });
      if (setting && setting.value === token) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const dateStr = searchParams.get("date"); // Formato "DD-MM-YYYY" o "YYYY-MM-DD"
    if (!dateStr) {
      return NextResponse.json({ error: "Parámetro 'date' es requerido (ej: DD-MM-YYYY)" }, { status: 400 });
    }

    const baseUploadDir = join(process.cwd(), "public", "uploads");

    // Normalizar formato de fecha para la carpeta en disco (DD-MM-YYYY)
    let folderDate = dateStr;
    if (dateStr.includes("-") && dateStr.split("-")[0].length === 4) {
      // Viene como YYYY-MM-DD -> Convertir a DD-MM-YYYY
      const parts = dateStr.split("-");
      folderDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    const dateFolderDir = join(baseUploadDir, folderDate);

    const zip = new JSZip();
    let fileCount = 0;

    // 1. Si existe la carpeta directa del día en public/uploads/DD-MM-YYYY/
    if (fs.existsSync(dateFolderDir)) {
      const ctoFolders = fs.readdirSync(dateFolderDir, { withFileTypes: true });
      for (const ctoDir of ctoFolders) {
        if (ctoDir.isDirectory()) {
          const ctoPath = join(dateFolderDir, ctoDir.name);
          const files = fs.readdirSync(ctoPath);
          for (const file of files) {
            const filePath = join(ctoPath, file);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              const fileData = fs.readFileSync(filePath);
              // Añadir al ZIP en la ruta: CTO_NUM/nombre_archivo.jpg
              zip.folder(ctoDir.name)?.file(file, fileData);
              fileCount++;
            }
          }
        }
      }
    }

    // 2. Si no se encontraron archivos por carpeta física, buscar en la BD por fechas de agregación o historial
    if (fileCount === 0) {
      const dateParts = folderDate.split("-");
      if (dateParts.length === 3) {
        const parsedDay = parseInt(dateParts[0]);
        const parsedMonth = parseInt(dateParts[1]) - 1;
        const parsedYear = parseInt(dateParts[2]);

        const startOfDay = new Date(parsedYear, parsedMonth, parsedDay, 0, 0, 0);
        const endOfDay = new Date(parsedYear, parsedMonth, parsedDay, 23, 59, 59, 999);

        // Buscar CTOs auditadas o creadas en este día
        const ctos = await prisma.cTO.findMany({
          where: {
            OR: [
              {
                history: {
                  some: {
                    timestamp: { gte: startOfDay, lte: endOfDay }
                  }
                }
              },
              {
                fechaAgregacion: { gte: startOfDay, lte: endOfDay }
              }
            ]
          },
          include: { images: true }
        });

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
          } catch (err) {}
          return null;
        }

        for (const cto of ctos) {
          if (!cto.images || cto.images.length === 0) continue;
          const safeCtoNum = (cto.num || "CTO").replace(/[^a-zA-Z0-9_-]/g, "_");
          for (const img of cto.images) {
            const filename = img.url.split("/").pop();
            if (!filename) continue;
            let filepath = join(baseUploadDir, filename);
            if (!fs.existsSync(filepath)) {
              const found = findFileRecursive(baseUploadDir, filename);
              if (found) filepath = found;
            }
            if (fs.existsSync(filepath)) {
              const fileData = fs.readFileSync(filepath);
              zip.folder(safeCtoNum)?.file(filename, fileData);
              fileCount++;
            }
          }
        }
      }
    }

    if (fileCount === 0) {
      return NextResponse.json({ 
        error: `No se encontraron evidencias fotográficas para el día ${folderDate}.` 
      }, { status: 404 });
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const zipName = `Evidencias_${folderDate}_(${fileCount}_fotos).zip`;

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
        "Content-Length": zipBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("Error al generar ZIP diario de evidencias:", error);
    return NextResponse.json({ error: error.message || "Error al generar ZIP" }, { status: 500 });
  }
}
