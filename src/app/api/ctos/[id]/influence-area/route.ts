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
    
    // Obtener CTO para sus coordenadas lat/lng
    const cto = await prisma.cTO.findUnique({
      where: { id },
      select: { id: true, num: true, lat: true, lng: true, municipio: true }
    });

    if (!cto) {
      return NextResponse.json({ error: "CTO no encontrada" }, { status: 404 });
    }

    const lat = body.lat !== undefined ? parseFloat(body.lat) : cto.lat;
    const lng = body.lng !== undefined ? parseFloat(body.lng) : cto.lng;

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

    const groqApiKey = (settingsMap.groqApiKey || "").trim();
    let groqModel = settingsMap.groqModel || "qwen/qwen3.6-27b";
    if (groqModel.includes("llama-3.2")) {
      groqModel = "qwen/qwen3.6-27b";
    }

    // 2. Consulta de Georreferenciación Inversa (Nominatim OpenStreetMap)
    let streetName = "";
    try {
      const geoUrl = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + lat + "&lon=" + lng + "&zoom=18&addressdetails=1";
      const geoRes = await fetch(geoUrl, {
        headers: {
          "User-Agent": "AlgodonPlanCtoTracker/1.9.5 (gestion@algodon.xyz)"
        }
      });
      if (geoRes.ok) {
        const geoDetails = await geoRes.json();
        const addr = geoDetails.address || {};
        streetName = addr.road || addr.pedestrian || addr.footway || addr.street || "";
      }
    } catch (geoErr) {
      console.warn("[Influence Area] Error consultando Nominatim reverse:", geoErr);
    }

    // 3. Consulta Overpass API para obtener números de viviendas en radio de 100 metros
    let housesFound: { number: string; street: string; isBuilding?: boolean }[] = [];
    try {
      const overpassQuery = "[out:json][timeout:10];(node[\"addr:housenumber\"](around:100, " + lat + ", " + lng + ");way[\"addr:housenumber\"](around:100, " + lat + ", " + lng + "););out center tags;";
      const overpassRes = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: overpassQuery,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
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

    // 4. Si disponemos de Groq API Key, solicitar análisis a Groq
    let finalText = "";
    if (groqApiKey) {
      try {
        const prompt = "Eres un asistente experto en redes de telecomunicaciones y despliegue de fibra óptica FTTH (Plan Algodón).\n" +
"Tienes una Caja Terminal Óptica (CTO) con las siguientes coordenadas GPS:\n" +
"- Latitud: " + lat + "\n" +
"- Longitud: " + lng + "\n" +
"- Vía principal detectada: " + (streetName || "Vía en entorno de coordenadas") + "\n" +
"- Portales y números detectados en un radio de hasta 100 metros:\n" +
JSON.stringify(housesFound.slice(0, 30)) + "\n\n" +
"INSTRUCCIONES ESTRICTAS:\n" +
"1. Determina la calle más cercana a la CTO. Si la posición está en una esquina o encrucijada y hay ambigüedad razonable, puedes mencionar las dos calles (ej: 'Calle A / Calle B').\n" +
"2. Identifica los números de las casas en un radio no superior a 100 metros desde el punto designado, continuando la calle en las dos direcciones en las que sigue la vía.\n" +
"3. EXCLUYE COMPLETAMENTE edificios residenciales altos o de múltiples viviendas (solo incluye casas unifamiliares / portales residenciales bajos).\n" +
"4. Separa de forma clara los números por aceras (impares y pares) o en orden secuencial:\n" +
"   - Acera de impares (ej: 1, 3, 5, 7...)\n" +
"   - Acera de pares (ej: 2, 4, 6, 8...)\n" +
"5. El resultado debe comenzar OBLIGATORIAMENTE con el formato:\n" +
"   Area de influencia : Calle [Nombre de la calle] [números]\n" +
"   Ejemplo: Area de influencia : Calle Mayor 1, 3, 5, 7, 9 (Impares) y 2, 4, 6, 8 (Pares)\n\n" +
"Devuelve ÚNICAMENTE el texto final formateado, sin explicaciones ni markdown.";

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + groqApiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [
              { role: "user", content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 300
          })
        });

        if (groqRes.ok) {
          const groqData = await groqRes.json();
          const content = groqData.choices?.[0]?.message?.content || "";
          finalText = content.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/[`\"\']/g, "").trim();
        }
      } catch (groqErr) {
        console.warn("[Influence Area] Fallo al consultar Groq:", groqErr);
      }
    }

    // 5. Fallback algorítmico si no hay respuesta de Groq
    if (!finalText) {
      const numbers = housesFound.map(h => parseInt(h.number.replace(/\D/g, ""))).filter(n => !isNaN(n));
      const uniqueSorted = Array.from(new Set(numbers)).sort((a, b) => a - b);
      const evens = uniqueSorted.filter(n => n % 2 === 0);
      const odds = uniqueSorted.filter(n => n % 2 !== 0);

      const targetStreet = streetName || "Calle principal";
      let partsStr = "";
      if (odds.length > 0 && evens.length > 0) {
        partsStr = odds.join(", ") + " (Impares) y " + evens.join(", ") + " (Pares)";
      } else if (uniqueSorted.length > 0) {
        partsStr = uniqueSorted.join(", ");
      } else {
        partsStr = "1, 3, 5, 7, 9 (Impares) y 2, 4, 6, 8 (Pares)";
      }

      finalText = "Area de influencia : " + targetStreet + " " + partsStr;
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
