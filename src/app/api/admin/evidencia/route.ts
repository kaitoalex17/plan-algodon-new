import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { join } from "path";
import fs from "fs";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "ADMIN" && role !== "GESTOR") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // 1. Obtener todas las CTOs que tienen imágenes
    const ctosWithImages = await prisma.cTO.findMany({
      where: {
        images: {
          some: {}
        }
      },
      include: {
        images: {
          orderBy: { id: "asc" }
        },
        assignedTo: {
          select: { name: true, color: true }
        },
        auditedBy: {
          select: { name: true, color: true }
        }
      },
      orderBy: { num: "asc" }
    });

    // 2. Agrupar por Días basados en fechaAgregacion o imágenes en disco
    const dateMap: { [dateStr: string]: { ctoIds: Set<string>; photoCount: number } } = {};

    // Comprobar carpetas físicas en /public/uploads
    const baseUploadDir = join(process.cwd(), "public", "uploads");
    if (fs.existsSync(baseUploadDir)) {
      const entries = fs.readdirSync(baseUploadDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.match(/^\d{2}-\d{2}-\d{4}$/)) {
          const datePath = join(baseUploadDir, entry.name);
          const ctoFolders = fs.readdirSync(datePath, { withFileTypes: true }).filter(d => d.isDirectory());
          let pCount = 0;
          const cSet = new Set<string>();
          for (const ctoFolder of ctoFolders) {
            cSet.add(ctoFolder.name);
            const ctoFiles = fs.readdirSync(join(datePath, ctoFolder.name)).filter(f => !f.startsWith("."));
            pCount += ctoFiles.length;
          }
          if (pCount > 0) {
            dateMap[entry.name] = { ctoIds: cSet, photoCount: pCount };
          }
        }
      }
    }

    // Complementar con fechas de agregación de la base de datos
    ctosWithImages.forEach(c => {
      const dateObj = c.fechaAgregacion || (c.images[0] ? new Date() : null);
      if (dateObj) {
        const d = new Date(dateObj);
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        const dateStr = `${day}-${month}-${year}`;

        if (!dateMap[dateStr]) {
          dateMap[dateStr] = { ctoIds: new Set(), photoCount: 0 };
        }
        dateMap[dateStr].ctoIds.add(c.id);
        dateMap[dateStr].photoCount += c.images.length;
      }
    });

    const availableDates = Object.entries(dateMap).map(([date, data]) => ({
      date,
      ctoCount: data.ctoIds.size,
      photoCount: data.photoCount
    }));

    availableDates.sort((a, b) => {
      const [d1, m1, y1] = a.date.split("-").map(Number);
      const [d2, m2, y2] = b.date.split("-").map(Number);
      return new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime();
    });

    // 3. Agrupar por Clusters (y por Zona si existe: CLUSTER A, CLUSTER B, etc.)
    const clusterMap: { [clusterName: string]: {
      name: string;
      zona: string;
      ctoCount: number;
      photoCount: number;
      ctos: { id: string; num: string; photoCount: number }[];
    } } = {};

    ctosWithImages.forEach(c => {
      const clusterName = c.cluster || "SIN_CLUSTER";
      const zona = c.zona || "";

      if (!clusterMap[clusterName]) {
        clusterMap[clusterName] = {
          name: clusterName,
          zona: zona,
          ctoCount: 0,
          photoCount: 0,
          ctos: []
        };
      }

      clusterMap[clusterName].ctoCount += 1;
      clusterMap[clusterName].photoCount += c.images.length;
      clusterMap[clusterName].ctos.push({
        id: c.id,
        num: c.num,
        photoCount: c.images.length
      });
    });

    const availableClusters = Object.values(clusterMap).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      dates: availableDates,
      clusters: availableClusters,
      ctos: ctosWithImages
    });
  } catch (error: any) {
    console.error("Error al obtener evidencias:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
