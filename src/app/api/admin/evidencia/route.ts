import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (role !== "ADMIN" && role !== "GESTOR") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateFilter = searchParams.get("date"); // Opcional: "DD-MM-YYYY"

    // 1. Obtener todas las carpetas físicas de fechas en /public/uploads
    const baseUploadDir = join(process.cwd(), "public", "uploads");
    const availableDates: { date: string; ctoCount: number; photoCount: number }[] = [];

    if (fs.existsSync(baseUploadDir)) {
      const entries = fs.readdirSync(baseUploadDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.match(/^\d{2}-\d{2}-\d{4}$/)) {
          const datePath = join(baseUploadDir, entry.name);
          const ctoFolders = fs.readdirSync(datePath, { withFileTypes: true }).filter(d => d.isDirectory());
          let photoCount = 0;
          for (const ctoFolder of ctoFolders) {
            const ctoFiles = fs.readdirSync(join(datePath, ctoFolder.name)).filter(f => !f.startsWith("."));
            photoCount += ctoFiles.length;
          }
          availableDates.push({
            date: entry.name,
            ctoCount: ctoFolders.length,
            photoCount
          });
        }
      }
    }

    // Ordenar fechas descendente
    availableDates.sort((a, b) => {
      const [d1, m1, y1] = a.date.split("-").map(Number);
      const [d2, m2, y2] = b.date.split("-").map(Number);
      return new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime();
    });

    // 2. Obtener CTOs con imágenes
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

    return NextResponse.json({
      dates: availableDates,
      ctos: ctosWithImages
    });
  } catch (error: any) {
    console.error("Error al obtener evidencias:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
