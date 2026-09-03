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
    const chunk = data.get("chunk") as File;
    const ctoId = data.get("ctoId") as string;
    const fileId = data.get("fileId") as string;
    const fileName = data.get("fileName") as string;
    const chunkIndex = parseInt(data.get("chunkIndex") as string);
    const totalChunks = parseInt(data.get("totalChunks") as string);

    if (!chunk || !ctoId || !fileId || !fileName || isNaN(chunkIndex) || isNaN(totalChunks)) {
      return NextResponse.json({ error: "Parámetros incompletos" }, { status: 400 });
    }

    const cto = await prisma.cTO.findUnique({ where: { id: ctoId } });
    if (!cto) {
      return NextResponse.json({ error: "CTO no encontrado" }, { status: 404 });
    }

    // Directorios
    const uploadDir = join(process.cwd(), "public", "uploads");
    const tempDir = join(uploadDir, "temp-chunks", fileId);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Guardar fragmento
    const chunkPath = join(tempDir, String(chunkIndex));
    const bytes = await chunk.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(chunkPath, buffer);

    // Verificar si todos los fragmentos están subidos
    const chunkBuffers: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const partPath = join(tempDir, String(i));
      if (!fs.existsSync(partPath)) {
        // Aún faltan fragmentos por subir
        return NextResponse.json({ success: true, status: "uploading", chunkIndex });
      }
      chunkBuffers.push(fs.readFileSync(partPath));
    }

    // Si llegamos aquí, todos los fragmentos están disponibles: ensamblar el archivo
    const fileBuffer = Buffer.concat(chunkBuffers);

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

        let searchQ = `name='${cto.num}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
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

    const ext = fileName.split(".").pop()?.toLowerCase();
    let processedBuffer: any = fileBuffer;
    let finalMimeType = "image/jpeg"; // Default a jpeg ya que es el resultado de la compresión en cliente

    if (ext && ["jpg", "jpeg", "png", "webp"].includes(ext)) {
      try {
        let pipeline = sharp(fileBuffer)
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
        console.error("Error al procesar/comprimir imagen ensamblada con sharp:", sharpError);
      }
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

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filename = `${uniqueSuffix}-${cleanFileName}`;
    const filepath = join(ctoUploadDir, filename);

    // 1. Guardar localmente la imagen ensamblada
    await writeFile(filepath, processedBuffer);

    // 2. Guardar en Google Drive si está habilitado
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

    // 3. Registrar en base de datos
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

    // Limpiar carpeta de fragmentos temporales
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanError) {
      console.error("Error al limpiar fragmentos temporales:", cleanError);
    }

    // 4. Reconocimiento automático OCR si la foto corresponde a Medición de Potencia
    let ocrResult = null;
    if (cleanFileName.toLowerCase().includes("potencia")) {
      try {
        // No leer prefijos ni números del archivo para evitar confundir el número de la CTO con el divisor.
        // Se determina el divisor contando cuántas fotos de potencia tiene la CTO (1, 2, 3, 4, 5, 6 máximo).
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
        console.warn("Fallo no bloqueante al procesar OCR de potencia en chunks:", ocrErr);
      }
    }

    return NextResponse.json({
      success: true,
      status: "completed",
      imageUrl,
      image: imageRecord,
      driveMissingFolder: driveError,
      ocrResult
    });
  } catch (error: any) {
    console.error("Error en la subida fragmentada:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
