import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    
    // Obtener coordenadas lat/lng desde el body o desde la base de datos
    let lat: number | null = body.lat !== undefined && body.lat !== null ? parseFloat(body.lat) : null;
    let lng: number | null = body.lng !== undefined && body.lng !== null ? parseFloat(body.lng) : null;

    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
      const cto = await prisma.cTO.findUnique({
        where: { id },
        select: { id: true, num: true, lat: true, lng: true, municipio: true }
      });

      if (cto && cto.lat !== null && cto.lng !== null) {
        lat = cto.lat;
        lng = cto.lng;
      }
    }

    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ 
        error: "Esta CTO no tiene coordenadas GPS válidas (Latitud / Longitud). Asigna sus coordenadas antes de buscar el área de influencia." 
      }, { status: 400 });
    }

    // 1. Obtener la configuración de Groq
    const settings = await prisma.setting.findMany({
      where: {
        key: { in: ["groqApiKey", "groqModel"] }
      }
    });
    const settingsMap = settings.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    // Respaldo de API key garantizado para la auditoría
    const groqApiKey = (
      settingsMap.groqApiKey || 
      process.env.GROQ_API_KEY || 
      process.env.GROQ_KEY || 
      ""
    ).trim();

    // Modelo rápido y conciso sin bloqueos de pensamiento
    const groqModel = "groq/compound-mini";

    // Auto-persistir la API key en configuración si no existía en BD
    if (!settingsMap.groqApiKey && groqApiKey) {
      prisma.setting.upsert({
        where: { key: "groqApiKey" },
        update: { value: groqApiKey },
        create: { key: "groqApiKey", value: groqApiKey }
      }).catch(err => console.warn("[Influence Area] No se pudo guardar groqApiKey en settings:", err));
    }

    // 2. Consulta de Georreferenciación Inversa (Nominatim OpenStreetMap)
    let streetName = "";
    try {
      const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const geoRes = await fetch(geoUrl, {
        headers: {
          "User-Agent": "AlgodonPlanCtoTracker/1.9.5 (gestion@algodon.xyz)"
        },
        signal: AbortSignal.timeout(6000)
      });
      if (geoRes.ok) {
        const geoDetails = await geoRes.json();
        const addr = geoDetails.address || {};
        streetName = addr.road || addr.pedestrian || addr.footway || addr.street || addr.neighbourhood || "";
      }
    } catch (geoErr) {
      console.warn("[Influence Area] Error consultando Nominatim reverse:", geoErr);
    }

    // 3. Consulta Overpass API para obtener números de viviendas en radio de 100 metros
    let housesFound: { number: string; street: string; isBuilding?: boolean }[] = [];
    try {
      const overpassQuery = `[out:json][timeout:10];(node["addr:housenumber"](around:100, ${lat}, ${lng});way["addr:housenumber"](around:100, ${lat}, ${lng}););out center tags;`;
      const overpassRes = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: overpassQuery,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(7000)
      });
      if (overpassRes.ok) {
        const overpassData = await overpassRes.json();
        const elements = overpassData.elements || [];
        for (const el of elements) {
          const tags = el.tags || {};
          const hNum = tags["addr:housenumber"];
          const hStreet = tags["addr:street"] || streetName;
          const buildingType = tags["building"] || "";
          const isHighBuilding = ["apartments", "dormitory", "hotel", "office"].includes(buildingType.toLowerCase());

          if (hNum && !isHighBuilding) {
            housesFound.push({
              number: String(hNum).trim(),
              street: hStreet,
              isBuilding: isHighBuilding
            });
          }
        }
      }
    } catch (overErr) {
      console.warn("[Influence Area] Error consultando Overpass API:", overErr);
    }

    if (!streetName && housesFound.length > 0) {
      streetName = housesFound[0].street;
    }

    // 4. Inferencia con IA (Groq)
    let finalText = "";
    if (groqApiKey) {
      try {
        const prompt = `Eres un asistente experto en redes de telecomunicaciones y despliegue de fibra óptica FTTH (Plan Algodón).
Tienes una Caja Terminal Óptica (CTO) con las siguientes coordenadas GPS:
- Latitud: ${lat}
- Longitud: ${lng}
- Vía principal detectada: ${streetName || "Vía en entorno de coordenadas"}
- Portales y números detectados en un radio de hasta 100 metros:
${JSON.stringify(housesFound.slice(0, 30))}

INSTRUCCIONES ESTRICTAS:
1. Determina la calle más cercana a la CTO. Si la posición está en una esquina o encrucijada y hay ambigüedad razonable, puedes mencionar las dos calles (ej: 'Calle A / Calle B').
2. Identifica los números de las casas en un radio de 100 metros desde el punto designado, continuando la calle en las dos direcciones de la vía.
   - Si se detectaron números en la lista, organízalos por acera y completa el tramo contiguo si hay huecos.
   - Si la lista de números detectados está vacía o es reducida, genera un tramo residencial coherente de números impares y pares para cubrir el radio de 100 metros (por ejemplo: del 1 al 19 en impares y del 2 al 20 en pares).
3. EXCLUYE COMPLETAMENTE edificios residenciales altos o de múltiples viviendas (solo incluye casas unifamiliares / portales residenciales bajos).
4. Separa de forma clara los números por aceras (impares y pares):
   - Acera de impares (ej: 1, 3, 5, 7, 9...)
   - Acera de pares (ej: 2, 4, 6, 8, 10...)
5. El resultado debe comenzar OBLIGATORIAMENTE con el formato:
   Area de influencia : Calle [Nombre de la calle o calles] [números impares] (Impares) y [números pares] (Pares)
   Ejemplo: Area de influencia : Calle Mayor 1, 3, 5, 7, 9 (Impares) y 2, 4, 6, 8 (Pares)

Devuelve ÚNICAMENTE el texto final en una sola línea, sin markdown, sin explicaciones ni etiquetas.`;

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + groqApiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [
              { 
                role: "system", 
                content: "Genera únicamente la línea de texto que comience por 'Area de influencia :' sin añadir comentarios, explicaciones, ni etiquetas <think>." 
              },
              { role: "user", content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 300
          }),
          signal: AbortSignal.timeout(10000)
        });

        if (groqRes.ok) {
          const groqData = await groqRes.json();
          const content = groqData.choices?.[0]?.message?.content || "";
          
          let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/[`\"\']/g, "").trim();
          if (cleaned.includes("<think>")) {
            cleaned = cleaned.replace(/<think>[\s\S]*/gi, "").trim();
          }

          const matchArea = cleaned.match(/Area de influencia\s*:\s*[^\n\r]+/i);
          if (matchArea) {
            cleaned = matchArea[0].trim();
          }

          // Validar que no contenga placeholders de ejemplo sin rellenar y que contenga dígitos
          if (
            cleaned && 
            !cleaned.includes("[Nombre") && 
            !cleaned.includes("[Street") && 
            !cleaned.includes("[números") &&
            /\d+/.test(cleaned)
          ) {
            if (!cleaned.toLowerCase().startsWith("area de influencia :")) {
              cleaned = "Area de influencia : " + cleaned.replace(/^area de influencia\s*:\s*/i, "");
            }
            finalText = cleaned;
          }
        }
      } catch (groqErr) {
        console.warn("[Influence Area] Fallo al consultar Groq:", groqErr);
      }
    }

    // 5. Fallback algorítmico determinista si no hubo respuesta válida de Groq
    if (!finalText) {
      const numbers = housesFound.map(h => parseInt(h.number.replace(/\D/g, ""))).filter(n => !isNaN(n));
      const uniqueSorted = Array.from(new Set(numbers)).sort((a, b) => a - b);
      const evens = uniqueSorted.filter(n => n % 2 === 0);
      const odds = uniqueSorted.filter(n => n % 2 !== 0);

      const targetStreet = streetName 
        ? (/^(calle|avenida|avda|plaza|paseo|c\/|camino|carretera)/i.test(streetName) ? streetName : `Calle ${streetName}`)
        : "Calle Principal";

      let partsStr = "";
      if (odds.length === 0 && evens.length === 0) {
        partsStr = "1, 3, 5, 7, 9, 11, 13, 15, 17, 19 (Impares) y 2, 4, 6, 8, 10, 12, 14, 16, 18, 20 (Pares)";
      } else if (odds.length > 0 && evens.length > 0) {
        partsStr = odds.join(", ") + " (Impares) y " + evens.join(", ") + " (Pares)";
      } else if (odds.length > 0) {
        partsStr = odds.join(", ") + " (Impares)";
      } else {
        partsStr = evens.join(", ") + " (Pares)";
      }

      finalText = `Area de influencia : ${targetStreet} ${partsStr}`;
    }

    return NextResponse.json({
      success: true,
      text: finalText,
      street: streetName,
      coordinates: { lat, lng },
      housesCount: housesFound.length
    });

  } catch (error: any) {
    console.error("[Influence Area] Error:", error);
    return NextResponse.json({ error: error.message || "Error al calcular el área de influencia" }, { status: 500 });
  }
}
