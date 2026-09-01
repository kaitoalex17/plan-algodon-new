import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        theme: true,
        lastLat: true,
        lastLng: true,
        lastZoom: true,
        zoomThreshold: true,
        markerShape: true,
        markerSize: true,
        showProgramadas: true,
        patternCorrecto: true,
        patternFallo: true,
      }
    });

    return NextResponse.json(user || {});
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any).id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { lat, lng, zoom, zoomThreshold, theme, markerShape, markerSize, showProgramadas, mapLayer, patternCorrecto, patternFallo } = body;
    const userId = (session.user as any).id;

    const updateData: any = {};

    if (lat !== undefined) updateData.lastLat = parseFloat(lat);
    if (lng !== undefined) updateData.lastLng = parseFloat(lng);
    if (zoom !== undefined) updateData.lastZoom = parseInt(zoom);
    if (zoomThreshold !== undefined) updateData.zoomThreshold = parseInt(zoomThreshold);
    if (theme !== undefined) updateData.theme = String(theme);
    if (markerShape !== undefined) updateData.markerShape = String(markerShape);
    if (markerSize !== undefined) updateData.markerSize = parseInt(markerSize);
    if (showProgramadas !== undefined) updateData.showProgramadas = Boolean(showProgramadas);
    if (mapLayer !== undefined) updateData.mapLayer = String(mapLayer);
    if (patternCorrecto !== undefined) updateData.patternCorrecto = String(patternCorrecto);
    if (patternFallo !== undefined) updateData.patternFallo = String(patternFallo);

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No se proporcionaron datos para actualizar" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error guardando ajustes de usuario:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
