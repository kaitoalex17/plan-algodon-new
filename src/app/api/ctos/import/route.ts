import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { decodeHtml } from "@/lib/utils";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { ctos, clearExisting, category } = await req.json();

    if (!ctos || !Array.isArray(ctos)) {
      return NextResponse.json({ error: "Formato de datos inválido" }, { status: 400 });
    }

    const activeCategory = category || "AUDITORIA";

    if (clearExisting) {
      // Eliminar historial, comentarios y fotos asociadas de la categoría específica antes de limpiar
      await prisma.cTO.deleteMany({
        where: { category: activeCategory }
      });
    }

    // Normalizar las claves de todas las filas a minúsculas y sin acentos
    const normalizedCtos = ctos.map((row: any) => {
      const normalized: any = {};
      for (const key of Object.keys(row)) {
        if (row[key] === undefined || row[key] === null) continue;
        const cleanKey = key.trim().toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Ej: 'Colocación' -> 'colocacion', 'Número' -> 'numero'
        normalized[cleanKey] = row[key];
        // Guardar la versión en minúscula sin quitar caracteres especiales (ej: '№')
        normalized[key.trim().toLowerCase()] = row[key];
      }
      return normalized;
    });

    // Recopilar todos los nombres de subestados únicos
    const uniqueSubStatusNames = new Set<string>();
    for (const row of normalizedCtos) {
      const subName = row.estado || row.subestado || row.substatus;
      if (subName !== undefined && subName !== null) {
        const trimmed = String(subName).trim();
        if (trimmed) {
          uniqueSubStatusNames.add(trimmed);
        }
      }
    }

    // Asegurarse de que todos estos subestados existan en la BD
    const subStatusMap = new Map<string, string>(); // nombre -> id
    for (const name of Array.from(uniqueSubStatusNames)) {
      let sub = await prisma.subStatus.findFirst({
        where: {
          name: { equals: name, mode: "insensitive" },
          category: activeCategory
        }
      });
      if (!sub) {
        sub = await prisma.subStatus.create({
          data: {
            name,
            color: "#808080",
            category: activeCategory
          }
        });
      }
      subStatusMap.set(name.toLowerCase(), sub.id);
    }

    const formattedCtos = [];
    for (const row of normalizedCtos) {
      let lat = 0;
      let lng = 0;
      
      const coordStr = row.coordenadas;
      if (coordStr && typeof coordStr === 'string') {
        const parts = coordStr.split(',');
        if (parts.length >= 2) {
          lat = parseFloat(parts[0].trim());
          lng = parseFloat(parts[1].trim());
        }
      } else if (row.latitud && row.longitud) {
        lat = parseFloat(String(row.latitud));
        lng = parseFloat(String(row.longitud));
      } else if (row.lat && row.lng) {
        lat = parseFloat(String(row.lat));
        lng = parseFloat(String(row.lng));
      }

      if (lat === 0 || lng === 0) continue;

      let fecha = new Date();
      const rawFecha = row['fecha de agregacion'] || row['fecha de agreg'] || row['fecha agregacion'] || row['fecha'];
      if (typeof rawFecha === 'number') {
        fecha = new Date(Math.round((rawFecha - 25569) * 86400 * 1000));
      } else if (rawFecha) {
        const parsed = Date.parse(String(rawFecha));
        if (!isNaN(parsed)) {
          fecha = new Date(parsed);
        }
      }

      const subName = row.estado || row.subestado || row.substatus;
      const subStatusId = subName ? (subStatusMap.get(String(subName).trim().toLowerCase()) || null) : null;

      // Intentar mapear estado de CTO
      let ctoStatus = "PENDIENTE";
      const rawStatus = row.estado_cto || row.estadocto || row.status || row.estado_general;
      if (rawStatus) {
        const upper = String(rawStatus).toUpperCase().trim();
        if (upper === "CORRECTO" || upper === "REVISADO") {
          ctoStatus = "CORRECTO";
        } else if (upper === "FALLO" || upper === "FALLÓ") {
          ctoStatus = "FALLO";
        }
      }

      formattedCtos.push({
        num: decodeHtml(String(row.numero || row.codigo || row.cod || row['№'] || row['no'] || Date.now().toString())),
        numeroNuevo: row.numeronuevo ? decodeHtml(String(row.numeronuevo)) : null,
        coordenadas: String(row.coordenadas || `${lat}, ${lng}`),
        lat,
        lng,
        municipio: row.municipio ? decodeHtml(String(row.municipio)) : null,
        colocacion: row.colocacion ? decodeHtml(String(row.colocacion)) : null,
        fechaAgregacion: fecha,
        notas: row.notas ? decodeHtml(String(row.notas)) : null,
        status: ctoStatus,
        category: activeCategory,
        zona: row.zona ? decodeHtml(String(row.zona)) : null,
        cluster: row.cluster ? decodeHtml(String(row.cluster)) : null,
        olt: (row.olt || row.nombre_olt || row['nombre olt']) ? decodeHtml(String(row.olt || row.nombre_olt || row['nombre olt'])).trim() : null,
        subStatusId: subStatusId
      });
    }

    const result = await prisma.cTO.createMany({
      data: formattedCtos,
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error: any) {
    console.error("Error importando CTOs:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
