import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from "fs";
import sharp from "sharp";
import { google } from "googleapis";
import stream from "stream";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      // return NextResponse.json({ error: "No autorizado" }, { status: 401 });
      // Descomentar en producción
    }

    const data = await req.formData();
    const files = data.getAll("files") as File[];
    const ctoId = data.get("ctoId") as string;

    if (!files || files.length === 0 || !ctoId) {
      return NextResponse.json({ error: "Archivos o CTO ID no proporcionados" }, { status: 400 });
    }

    const cto = await prisma.cTO.findUnique({ where: { id: ctoId } });
    if (!cto) {
      return NextResponse.json({ error: "CTO no encontrado" }, { status: 404 });
    }

    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const dateFolderName = `${day}-${month}-${year}`;
    const safeCtoNum = (cto.num || "CTO").replace(/[^a-zA-Z0-9_-]/g, "_");

    const baseUploadDir = join(process.cwd(), "public", "uploads");
    const ctoUploadDir = join(baseUploadDir, dateFolderName, safeCtoNum);
    if (!fs.existsSync(ctoUploadDir)) {
      fs.mkdirSync(ctoUploadDir, { recursive: true });
    }

    // Obtener parámetros de compresión de la base de datos
    const qualitySetting = await prisma.setting.findUnique({ where: { key: "imageQuality" } });
    const maxWidthSetting = await prisma.setting.findUnique({ where: { key: "imageMaxWidth" } });
    
    const quality = qualitySetting ? parseInt(qualitySetting.value) : 80;
    const maxWidth = maxWidthSetting ? parseInt(maxWidthSetting.value) : 1600;

    // Configuración de Google Drive
    const driveEnabledSetting = await prisma.setting.findUnique({ where: { key: "driveEnabled" } });
    const driveJsonSetting = await prisma.setting.findUnique({ where: { key: "driveServiceAccount" } });
    const driveRootSetting = await prisma.setting.findUnique({ where: { key: "driveRootFolderId" } });

    let drive: any = null;
    let folderId: string | null = null;
    let driveError = false;
    let driveFolderLink: string | null = null;

    if (driveEnabledSetting?.value === "true" && driveJsonSetting?.value) {
      try {
        const credentials = JSON.parse(driveJsonSetting.value);
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive"],
        });
        drive = google.drive({ version: "v3", auth });

        // Search for folder by CTO code
        let searchQ = `name='${cto.num}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        if (driveRootSetting?.value) {
          // It's sometimes safer to just search globally if the folder is deeply nested,
          // 'in parents' only checks the IMMEDIATE parent. We will just use the global search by name since CTO names are unique.
          // searchQ = `${searchQ} and '${driveRootSetting.value}' in parents`;
        }
        
        const res = await drive.files.list({
          q: searchQ,
          fields: "files(id, webViewLink)",
          spaces: "drive",
        });

        if (res.data.files && res.data.files.length > 0) {
          folderId = res.data.files[0].id;
          driveFolderLink = res.data.files[0].webViewLink;
        } else {
          driveError = true;
          console.warn(`[Drive] Carpeta no encontrada para el CTO ${cto.num}`);
        }
      } catch (err) {
        console.error("Error authenticating or searching drive:", err);
        driveError = true;
      }
    }

    const uploadedImages = [];
    let ocrResult = null;

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const ext = file.name.split(".").pop()?.toLowerCase();
      let processedBuffer: any = buffer;
      let finalMimeType = file.type || "application/octet-stream";

      // Comprimir imágenes si son formatos soportados
      if (ext && ["jpg", "jpeg", "png", "webp"].includes(ext)) {
        try {
          let pipeline = sharp(buffer)
            .rotate()
            .resize({
              width: maxWidth,
              height: maxWidth,
              fit: "inside",
              withoutEnlargement: true
            });
          
          if (ext === "png") {
            pipeline = pipeline.png({ quality, compressionLevel: 8 });
            finalMimeType = "image/png";
          } else if (ext === "webp") {
            pipeline = pipeline.webp({ quality });
            finalMimeType = "image/webp";
          } else {
            pipeline = pipeline.jpeg({ quality, progressive: true });
            finalMimeType = "image/jpeg";
          }
          
          processedBuffer = await pipeline.toBuffer();
        } catch (sharpError) {
          console.error("Error al comprimir imagen con sharp:", sharpError);
        }
      }

      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filename = `${uniqueSuffix}-${cleanFileName}`;
      const filepath = join(ctoUploadDir, filename);

      // 1. Guardar localmente en la subcarpeta
      await writeFile(filepath, processedBuffer);

      // 2. Guardar en Google Drive si está habilitado y la carpeta existe
      if (drive && folderId) {
        try {
          const bufferStream = new stream.PassThrough();
          bufferStream.end(processedBuffer);
          
          await drive.files.create({
            requestBody: {
              name: filename,
              parents: [folderId],
            },
            media: {
              mimeType: finalMimeType,
              body: bufferStream,
            },
            fields: "id",
          });
        } catch (err) {
          console.error("Error uploading file to drive:", err);
          driveError = true;
        }
      }

      // 3. Guardar en BD
      const imageUrl = `/api/uploads/${filename}`;
      let imageRecord = null;
      try {
        imageRecord = await prisma.image.create({
          data: {
            url: imageUrl,
            ctoId: ctoId,
          }
        });
      } catch (dbError) {
        console.warn("No se pudo guardar en BD, pero la imagen se subió localmente.", dbError);
      }
      
      uploadedImages.push(imageRecord || { url: imageUrl });

      // 4. Reconocimiento automático OCR si la foto corresponde a Medición de Potencia
      if (cleanFileName.toLowerCase().includes("potencia")) {
        try {
          const existingPotCount = await prisma.image.count({
            where: {
              ctoId,
              url: { contains: "potencia", mode: "insensitive" }
            }
          });
          const divisorIndex = Math.min(6, Math.max(1, existingPotCount));

          const { processPowerMeterUploadOcr } = await import("@/lib/ocrPowerMeter");
          ocrResult = await processPowerMeterUploadOcr({
            filepath,
            buffer: processedBuffer,
            ctoId,
            divisorIndex,
            userId: (session?.user as any)?.id
          });
        } catch (ocrErr) {
          console.warn("Fallo no bloqueante al procesar OCR de potencia:", ocrErr);
        }
      }
    }

    // Actualizar estado del CTO respecto a Drive
    if (driveEnabledSetting?.value === "true") {
      let syncStatus = "NONE";
      if (folderId && !driveError) syncStatus = "SYNCED";
      else if (driveError) syncStatus = "ERROR";
      
      await prisma.cTO.update({
        where: { id: ctoId },
        data: {
          driveSyncStatus: syncStatus,
          ...(driveFolderLink ? { driveFolderLink } : {})
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      images: uploadedImages,
      driveMissingFolder: driveError,
      ocrResult
    });
  } catch (error: any) {
    console.error("Error subiendo imagen:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
