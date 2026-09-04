import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from "fs";
import { join } from "path";
import { google } from "googleapis";
import stream from "stream";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      // return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { ctoId } = await req.json();
    if (!ctoId) {
      return NextResponse.json({ error: "ctoId requerido" }, { status: 400 });
    }

    const cto = await prisma.cTO.findUnique({ 
      where: { id: ctoId },
      include: { images: true }
    });

    if (!cto) {
      return NextResponse.json({ error: "CTO no encontrado" }, { status: 404 });
    }

    const driveEnabledSetting = await prisma.setting.findUnique({ where: { key: "driveEnabled" } });
    const driveJsonSetting = await prisma.setting.findUnique({ where: { key: "driveServiceAccount" } });

    if (driveEnabledSetting?.value !== "true" || !driveJsonSetting?.value) {
      return NextResponse.json({ error: "Drive no está configurado o habilitado" }, { status: 400 });
    }

    let drive: any = null;
    let folderId: string | null = null;
    let driveFolderLink: string | null = null;

    try {
      const credentials = JSON.parse(driveJsonSetting.value);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive"],
      });
      drive = google.drive({ version: "v3", auth });

      // Buscar la carpeta
      const searchQ = `name='${cto.num}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const res = await drive.files.list({
        q: searchQ,
        fields: "files(id, webViewLink)",
        spaces: "drive",
      });

      if (!res.data.files || res.data.files.length === 0) {
        return NextResponse.json({ error: "Carpeta no encontrada en Google Drive. Por favor, asegúrate de crear la carpeta con el nombre exacto de la CTO." }, { status: 404 });
      }

      folderId = res.data.files[0].id || null;
      driveFolderLink = res.data.files[0].webViewLink || null;
    } catch (authError: any) {
      console.error("Error al autenticar o buscar en Google Drive:", authError);
      return NextResponse.json({ 
        error: `Error de Google Drive (${authError.code || 'AUTH_ERROR'}): ${authError.message}. Verifica que el JSON de la cuenta de servicio sea válido y que la API de Drive esté activa.` 
      }, { status: 400 });
    }

    // Obtener los nombres de los archivos que ya están en esa carpeta de Drive para no duplicar
    const driveFilesRes = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(name)",
    });
    const existingDriveFiles = new Set(driveFilesRes.data.files?.map((f: any) => f.name) || []);

    let uploadsCount = 0;
    let driveError = false;
    let lastUploadError = "";

    // Subir cada imagen local que falte
    for (const image of cto.images) {
      // url es algo como "/api/uploads/12345-nombre.jpg"
      const filename = image.url.split('/').pop();
      if (!filename) continue;

      if (existingDriveFiles.has(filename)) {
        continue; // Ya está en Drive
      }

      const filepath = join(process.cwd(), "public", "uploads", filename);
      if (!fs.existsSync(filepath)) {
        continue; // El archivo no existe localmente
      }

      try {
        const fileStream = fs.createReadStream(filepath);
        const ext = filename.split(".").pop()?.toLowerCase();
        let mimeType = "application/octet-stream";
        if (ext === "png") mimeType = "image/png";
        else if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
        else if (ext === "webp") mimeType = "image/webp";

        await drive.files.create({
          requestBody: {
            name: filename,
            parents: [folderId!], // TypeScript non-null assertion since folderId is defined
          },
          media: {
            mimeType,
            body: fileStream,
          },
          fields: "id",
        });
        uploadsCount++;
      } catch (err: any) {
        console.error("Error subiendo archivo en reintento:", err);
        driveError = true;
        lastUploadError = err.message || String(err);
      }
    }

    const syncStatus = driveError ? "ERROR" : "SYNCED";
    await prisma.cTO.update({
      where: { id: ctoId },
      data: {
        driveSyncStatus: syncStatus,
        ...(driveFolderLink ? { driveFolderLink } : {})
      }
    });

    if (driveError) {
      return NextResponse.json({ 
        error: `Hubo errores al subir los archivos a Google Drive. Último error: ${lastUploadError}`, 
        status: syncStatus 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, uploaded: uploadsCount, status: syncStatus, driveFolderLink });
  } catch (error: any) {
    console.error("Error en retry-drive:", error);
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
