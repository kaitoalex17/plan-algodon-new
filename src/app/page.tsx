import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ClientPageWrapper from "./ClientPageWrapper";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  if ((session.user as any).role === "GESTOR") {
    redirect("/gestion");
  }

  const userId = (session.user as any).id;

  let ctos = [];
  let userMapState = { lat: 36.425, lng: -5.144, zoom: 14 }; // Default Estepona/Marbella area

  try {
    // Obtener CTOs
    ctos = await prisma.cTO.findMany({
      include: {
        assignedTo: true,
        subStatus: true,
        comments: {
          orderBy: { createdAt: "desc" },
          take: 2
        }
      }
    });

    // Obtener última vista del mapa guardada para el usuario
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        lastLat: true, 
        lastLng: true, 
        lastZoom: true, 
        zoomThreshold: true, 
        theme: true,
        markerShape: true,
        markerSize: true,
        showProgramadas: true,
        mapLayer: true,
        patternCorrecto: true,
        patternFallo: true
      }
    });

    if (user) {
      userMapState = {
        lat: user.lastLat !== null ? user.lastLat : 36.425,
        lng: user.lastLng !== null ? user.lastLng : -5.144,
        zoom: user.lastZoom !== null ? user.lastZoom : 14,
        zoomThreshold: user.zoomThreshold || 13,
        theme: user.theme || "orange",
        markerShape: user.markerShape || "circle",
        markerSize: user.markerSize || 6,
        showProgramadas: user.showProgramadas,
        mapLayer: user.mapLayer || "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
        patternCorrecto: user.patternCorrecto || "diagonal-stripes",
        patternFallo: user.patternFallo || "cross-pattern"
      } as any;
    }
  } catch (e) {
    console.error("Error connecting to DB", e);
    // Mock data temporal si la BD falla
    ctos = [
      { id: '1', num: '1001', lat: 36.425, lng: -5.144, status: 'PENDIENTE', municipio: 'Estepona' },
      { id: '2', num: '1002', lat: 36.428, lng: -5.140, status: 'CORRECTO', municipio: 'Estepona' }
    ];
  }

  return (
    <main style={{ position: "fixed", inset: 0, width: "100%", height: "100%", height: "100dvh", overflow: "hidden", touchAction: "manipulation" }}>
      <ClientPageWrapper initialCtos={ctos} initialMapState={userMapState} />
    </main>
  );
}
