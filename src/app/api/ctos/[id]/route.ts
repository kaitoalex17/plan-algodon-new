import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decodeHtml } from "@/lib/utils";

// GET: obtener detalles completos de una CTO (comentarios, imágenes, historial)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const cto = await prisma.cTO.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true, color: true }
        },
        auditedBy: {
          select: { id: true, name: true, email: true, color: true }
        },
        subStatus: true,
        images: true,
        comments: {
          include: {
            user: { select: { name: true, color: true } }
          },
          orderBy: { createdAt: "desc" }
        },
        history: {
          include: {
            user: { select: { name: true } }
          },
          orderBy: { timestamp: "desc" }
        }
      }
    });

    if (!cto) {
      return NextResponse.json({ error: "CTO no encontrada" }, { status: 404 });
    }

    // Decodificar campos de texto para la vista
    if (cto.notas) cto.notas = decodeHtml(cto.notas);
    if (cto.num) cto.num = decodeHtml(cto.num);
    if (cto.numeroNuevo) cto.numeroNuevo = decodeHtml(cto.numeroNuevo);
    if (cto.municipio) cto.municipio = decodeHtml(cto.municipio);
    if (cto.colocacion) cto.colocacion = decodeHtml(cto.colocacion);
    if (cto.comments) {
      cto.comments = cto.comments.map((c: any) => ({
        ...c,
        text: decodeHtml(c.text)
      }));
    }

    // Buscar si existe un registro de auditoría en el historial
    let auditDateTime = null;
    if (cto.history && cto.history.length > 0 && cto.status !== "PENDIENTE") {
      const auditLog = cto.history.find((h: any) => 
        (h.action || "").toLowerCase().includes("a correcto") || 
        (h.action || "").toLowerCase().includes("a fallo") ||
        (h.action || "").toLowerCase().includes("auditoría")
      );
      if (auditLog && auditLog.timestamp) {
        auditDateTime = auditLog.timestamp.toISOString();
      }
    }

    return NextResponse.json({
      ...cto,
      auditDateTime
    });
  } catch (error: any) {
    console.error("Error obteniendo detalles de CTO:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: actualizar estado, sub-estado, notas, asignado y/o añadir comentarios
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { 
      status, subStatusId, assignedToId, auditedById, auditDateTime, notas, commentText,
      num, numeroNuevo, lat, lng, municipio, colocacion,
      puertosTotal, puertosOcupados, potenciaDbm, cierreSeguridad, etiquetadoCorrecto,
      zona, cluster, category,
      hasFormulario, hasDrive, hasAntala, formDataJson
    } = body;
    const userId = (session.user as any).id;

    // Obtener estado anterior para el historial
    const oldCto = await prisma.cTO.findUnique({
      where: { id },
      include: { subStatus: true }
    });

    if (!oldCto) {
      return NextResponse.json({ error: "CTO no encontrada" }, { status: 404 });
    }

    const updateData: any = {};
    const historyActions: string[] = [];

    if (status && status !== oldCto.status) {
      updateData.status = status;
      historyActions.push(`Cambió estado de ${oldCto.status} a ${status}`);
      if (status === "CORRECTO" && !auditedById && !oldCto.auditedById) {
        updateData.auditedById = userId;
      }
    }

    if (auditedById !== undefined && auditedById !== oldCto.auditedById) {
      updateData.auditedById = auditedById || null;
      if (auditedById) {
        const u = await prisma.user.findUnique({ where: { id: auditedById } });
        historyActions.push(`Auditado por: ${u?.name || u?.email || 'N/A'}`);
      } else {
        historyActions.push("Quitó el auditor");
      }
    }

    if (auditDateTime) {
      const customAuditTimestamp = new Date(auditDateTime);
      if (!isNaN(customAuditTimestamp.getTime())) {
        const formattedDate = customAuditTimestamp.toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
        historyActions.push(`Fecha/Hora auditoría modificada a: ${formattedDate}`);

        // Actualizar el timestamp del log de auditoría previo si existe
        const lastAuditLog = await prisma.history.findFirst({
          where: {
            ctoId: id,
            OR: [
              { action: { contains: "a correcto", mode: "insensitive" } },
              { action: { contains: "a fallo", mode: "insensitive" } }
            ]
          },
          orderBy: { timestamp: "desc" }
        });

        if (lastAuditLog) {
          await prisma.history.update({
            where: { id: lastAuditLog.id },
            data: { timestamp: customAuditTimestamp }
          });
        } else {
          // Si no existía un log de auditoría previo, creamos uno específico con ese timestamp
          await prisma.history.create({
            data: {
              action: `Cambió estado de ${oldCto.status} a ${updateData.status || oldCto.status}`,
              ctoId: id,
              userId: auditedById || userId,
              timestamp: customAuditTimestamp
            }
          });
        }
      }
    }

    if (category !== undefined && category !== oldCto.category) {
      updateData.category = category;
      historyActions.push(`Cambió categoría a ${category}`);
    }

    if (hasFormulario !== undefined && hasFormulario !== oldCto.hasFormulario) {
      updateData.hasFormulario = hasFormulario;
      historyActions.push(`Formulario: ${hasFormulario ? 'Sí' : 'No'}`);
    }

    if (hasDrive !== undefined && hasDrive !== oldCto.hasDrive) {
      updateData.hasDrive = hasDrive;
      historyActions.push(`Drive: ${hasDrive ? 'Sí' : 'No'}`);
    }

    if (hasAntala !== undefined && hasAntala !== oldCto.hasAntala) {
      updateData.hasAntala = hasAntala;
      historyActions.push(`Antala: ${hasAntala ? 'Sí' : 'No'}`);
    }

    if (formDataJson !== undefined && formDataJson !== oldCto.formDataJson) {
      updateData.formDataJson = formDataJson;
      historyActions.push("Actualizó el formulario guiado (Ficha)");
    }

    if (subStatusId !== undefined && subStatusId !== oldCto.subStatusId) {
      updateData.subStatusId = subStatusId;
      if (subStatusId) {
        const sub = await prisma.subStatus.findUnique({ where: { id: subStatusId } });
        historyActions.push(`Cambió sub-estado a: "${sub?.name || 'N/A'}"`);
      } else {
        historyActions.push("Quitó el sub-estado");
      }
    }

    if (assignedToId !== undefined) {
      const targetAssigned = assignedToId && String(assignedToId).trim() !== "" ? String(assignedToId).trim() : null;
      if (targetAssigned !== oldCto.assignedToId) {
        updateData.assignedToId = targetAssigned;
        if (targetAssigned) {
          const u = await prisma.user.findUnique({ where: { id: targetAssigned } });
          historyActions.push(`Asignó CTO a: ${u?.name || u?.email || 'N/A'}`);
        } else {
          historyActions.push("Desasignó la CTO (Sin asignar)");
        }
      }
    }

    if (notas !== undefined && decodeHtml(notas) !== oldCto.notas) {
      updateData.notas = decodeHtml(notas);
      historyActions.push("Actualizó las notas generales");
    }

    // Datos específicos de auditoría de fibra
    if (puertosTotal !== undefined && puertosTotal !== oldCto.puertosTotal) {
      updateData.puertosTotal = puertosTotal !== null ? parseInt(puertosTotal) : null;
      historyActions.push(`Puertos totales: ${puertosTotal}`);
    }
    if (puertosOcupados !== undefined && puertosOcupados !== oldCto.puertosOcupados) {
      updateData.puertosOcupados = puertosOcupados !== null ? parseInt(puertosOcupados) : null;
      historyActions.push(`Puertos ocupados: ${puertosOcupados}`);
    }
    if (potenciaDbm !== undefined && potenciaDbm !== oldCto.potenciaDbm) {
      updateData.potenciaDbm = potenciaDbm !== null ? parseFloat(potenciaDbm) : null;
      historyActions.push(`Potencia óptica: ${potenciaDbm} dBm`);
    }
    if (cierreSeguridad !== undefined && cierreSeguridad !== oldCto.cierreSeguridad) {
      updateData.cierreSeguridad = cierreSeguridad;
      historyActions.push(`Cierre de seguridad: ${cierreSeguridad ? 'Correcto' : 'Incorrecto'}`);
    }
    if (etiquetadoCorrecto !== undefined && etiquetadoCorrecto !== oldCto.etiquetadoCorrecto) {
      updateData.etiquetadoCorrecto = etiquetadoCorrecto;
      historyActions.push(`Etiquetado correcto: ${etiquetadoCorrecto ? 'Sí' : 'No'}`);
    }

    // Campos de administrador adicionales
    if (num !== undefined && decodeHtml(String(num)) !== oldCto.num) {
      updateData.num = decodeHtml(String(num));
      historyActions.push(`Modificó el número de CTO a "${updateData.num}"`);
    }
    if (numeroNuevo !== undefined && (numeroNuevo ? decodeHtml(String(numeroNuevo)) : null) !== oldCto.numeroNuevo) {
      updateData.numeroNuevo = numeroNuevo ? decodeHtml(String(numeroNuevo)) : null;
      historyActions.push(`Modificó el número nuevo a "${updateData.numeroNuevo || 'N/A'}"`);
    }
    if (lat !== undefined && lat !== oldCto.lat) {
      updateData.lat = parseFloat(lat);
      historyActions.push(`Modificó latitud a ${lat}`);
    }
    if (lng !== undefined && lng !== oldCto.lng) {
      updateData.lng = parseFloat(lng);
      historyActions.push(`Modificó longitud a ${lng}`);
    }
    if (lat !== undefined || lng !== undefined) {
      updateData.coordenadas = `${updateData.lat ?? oldCto.lat}, ${updateData.lng ?? oldCto.lng}`;
    }
    if (municipio !== undefined && (municipio ? decodeHtml(String(municipio)) : null) !== oldCto.municipio) {
      updateData.municipio = municipio ? decodeHtml(String(municipio)) : null;
      historyActions.push(`Modificó municipio a "${updateData.municipio || 'N/A'}"`);
    }
    if (colocacion !== undefined && (colocacion ? decodeHtml(String(colocacion)) : null) !== oldCto.colocacion) {
      updateData.colocacion = colocacion ? decodeHtml(String(colocacion)) : null;
      historyActions.push(`Modificó colocación a "${updateData.colocacion || 'N/A'}"`);
    }
    if (zona !== undefined && (zona ? decodeHtml(String(zona)) : null) !== oldCto.zona) {
      updateData.zona = zona ? decodeHtml(String(zona)) : null;
      historyActions.push(`Modificó zona a "${updateData.zona || 'N/A'}"`);
    }
    if (cluster !== undefined && (cluster ? decodeHtml(String(cluster)) : null) !== oldCto.cluster) {
      updateData.cluster = cluster ? decodeHtml(String(cluster)) : null;
      historyActions.push(`Modificó cluster a "${updateData.cluster || 'N/A'}"`);
    }

    // Actualizar CTO en la BD con relaciones incluidas
    const updatedCto = await prisma.cTO.update({
      where: { id },
      data: updateData,
      include: {
        assignedTo: { select: { id: true, name: true, email: true, color: true } },
        auditedBy: { select: { id: true, name: true, email: true, color: true } },
        subStatus: true,
        images: true,
        comments: { include: { user: { select: { name: true, color: true } } }, orderBy: { createdAt: "desc" } },
        history: { include: { user: { select: { name: true } } }, orderBy: { timestamp: "desc" } }
      }
    });

    // Guardar comentario si se proporcionó
    if (commentText && commentText.trim() !== "") {
      const decodedComment = decodeHtml(commentText.trim());
      await prisma.comment.create({
        data: {
          text: decodedComment,
          ctoId: id,
          userId: userId
        }
      });
      historyActions.push("Añadió un comentario");
    }

    const location = body.location ? String(body.location).trim() : null;
    const customAction = body.customAction ? String(body.customAction).trim() : null;
    if (customAction) {
      historyActions.unshift(customAction);
    }

    // Registrar cambios en el historial
    if (historyActions.length > 0) {
      await prisma.history.create({
        data: {
          action: historyActions.join(" | "),
          ctoId: id,
          userId: userId,
          location: location
        }
      });
    }

    // Emitir señal de actualización instantánea para todos los técnicos conectados
    try {
      const { triggerBroadcastUpdate } = await import("@/app/api/realtime/route");
      await triggerBroadcastUpdate();
    } catch (e) {
      console.warn("No se pudo emitir broadcast en tiempo real:", e);
    }

    return NextResponse.json(updatedCto);
  } catch (error: any) {
    console.error("Error actualizando CTO:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Eliminar una CTO individual por un administrador
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    await prisma.cTO.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error eliminando CTO:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
