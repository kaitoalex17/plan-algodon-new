import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const settings = await prisma.setting.findMany();
    const settingsMap = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    // Devolver valores de configuración global y SFTP
    return NextResponse.json({
      imageQuality: settingsMap.imageQuality || "80",
      imageMaxWidth: settingsMap.imageMaxWidth || "1600",
      sftpUser: settingsMap.sftpUser || process.env.SFTP_USER || "sftpuser",
      sftpPassword: settingsMap.sftpPassword || process.env.SFTP_PASSWORD || "sftppassword123",
      sftpPort: settingsMap.sftpPort || process.env.SFTP_PORT || "2222",
      ocrEnabled: settingsMap.ocrEnabled || "true",
      ocrTargetWavelength: settingsMap.ocrTargetWavelength || "1490",
      ocrAlertWavelengths: settingsMap.ocrAlertWavelengths || "1310, 1550, 850, 1625",
      ocrMinPower: settingsMap.ocrMinPower || "-11.00",
      ocrMaxPower: settingsMap.ocrMaxPower || "-70.00",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { 
      imageQuality, imageMaxWidth, sftpUser, sftpPassword, sftpPort,
      ocrEnabled, ocrTargetWavelength, ocrAlertWavelengths, ocrMinPower, ocrMaxPower
    } = body;

    if (imageQuality !== undefined) {
      await prisma.setting.upsert({
        where: { key: "imageQuality" },
        update: { value: String(imageQuality) },
        create: { key: "imageQuality", value: String(imageQuality) }
      });
    }

    if (imageMaxWidth !== undefined) {
      await prisma.setting.upsert({
        where: { key: "imageMaxWidth" },
        update: { value: String(imageMaxWidth) },
        create: { key: "imageMaxWidth", value: String(imageMaxWidth) }
      });
    }

    if (sftpUser !== undefined) {
      await prisma.setting.upsert({
        where: { key: "sftpUser" },
        update: { value: String(sftpUser) },
        create: { key: "sftpUser", value: String(sftpUser) }
      });
    }

    if (sftpPassword !== undefined) {
      await prisma.setting.upsert({
        where: { key: "sftpPassword" },
        update: { value: String(sftpPassword) },
        create: { key: "sftpPassword", value: String(sftpPassword) }
      });
    }

    if (sftpPort !== undefined) {
      await prisma.setting.upsert({
        where: { key: "sftpPort" },
        update: { value: String(sftpPort) },
        create: { key: "sftpPort", value: String(sftpPort) }
      });
    }

    // Configuración OCR de Medición de Potencia
    if (ocrEnabled !== undefined) {
      await prisma.setting.upsert({
        where: { key: "ocrEnabled" },
        update: { value: String(ocrEnabled) },
        create: { key: "ocrEnabled", value: String(ocrEnabled) }
      });
    }

    if (ocrTargetWavelength !== undefined) {
      await prisma.setting.upsert({
        where: { key: "ocrTargetWavelength" },
        update: { value: String(ocrTargetWavelength).trim() },
        create: { key: "ocrTargetWavelength", value: String(ocrTargetWavelength).trim() }
      });
    }

    if (ocrAlertWavelengths !== undefined) {
      await prisma.setting.upsert({
        where: { key: "ocrAlertWavelengths" },
        update: { value: String(ocrAlertWavelengths).trim() },
        create: { key: "ocrAlertWavelengths", value: String(ocrAlertWavelengths).trim() }
      });
    }

    if (ocrMinPower !== undefined) {
      await prisma.setting.upsert({
        where: { key: "ocrMinPower" },
        update: { value: String(ocrMinPower).trim() },
        create: { key: "ocrMinPower", value: String(ocrMinPower).trim() }
      });
    }

    if (ocrMaxPower !== undefined) {
      await prisma.setting.upsert({
        where: { key: "ocrMaxPower" },
        update: { value: String(ocrMaxPower).trim() },
        create: { key: "ocrMaxPower", value: String(ocrMaxPower).trim() }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
