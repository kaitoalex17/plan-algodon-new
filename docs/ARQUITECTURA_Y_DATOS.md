# 🗄️ Arquitectura de Datos y Base de Datos (Prisma ORM)

Plan Algodón utiliza **PostgreSQL** a través de **Prisma ORM** como capa de persistencia para garantizar integridad relacional, velocidad en consultas geográficas y concurrencia multiusuario.

---

## 1. Modelos Principales

### `User` (Usuarios, Técnicos y Auditores)
- Almacena credenciales encriptadas (`bcryptjs`), rol (`ADMIN`, `GESTOR`, `USER`), token de sesión y última conexión.
- **Preferencias de Interfaz**: `theme`, `mapLayer`, `markerShape`, `markerSize`, `zoomThreshold`, `patternCorrecto`, `patternFallo`.
- **Geolocalización**: `lastLat`, `lastLng`, `lastZoom` para recordar la posición del usuario en campo.

### `CTO` (Caja Terminal Óptica)
- **Geolocalización**: `num`, `lat`, `lng`, `coordenadas`, `municipio`, `colocacion`, `zona`, `cluster`.
- **Auditoría**: `status` (`PENDIENTE`, `CORRECTO`, `FALLO`, `REPARAR`, `REVISADO`), `subStatusId`.
- **Datos de Fibra**: `puertosTotal`, `puertosOcupados`, `potenciaDbm`, `cierreSeguridad`, `etiquetadoCorrecto`.
- **Sincronización Cloud**: `driveSyncStatus` (`NONE`, `SYNCED`, `ERROR`), `driveFolderLink`.
- **Relaciones**: Asignada a (`assignedToId`), dada de alta por (`createdById`) y auditada por (`auditedById`).

### `Comment` (Muro de Comunicación)
- Comentarios de campo, órdenes de auditoría y solicitudes de reparación (`[REPARACIÓN SOLICITADA]: ...`).
- Vinculado con `ctoId` y `userId`, con orden cronológico (`createdAt`).

### `Image` (Evidencias Fotográficas)
- Almacena las referencias `url` locales (`/api/uploads/filename.jpg`) de cada fotografía tomada en campo.

### `History` (Trazabilidad y Auditoría)
- Registro inmutable de cada cambio de estado, validación o reasignación de CTO con marca de tiempo (`timestamp`), usuario y acción realizada.

---

## 2. Optimizaciones de Rendimiento Aplicadas

### Eliminación de Consultas Masivas N+1
- Anteriormente, la carga inicial de la página principal consultaba la relación `comments` con una cláusula `WHERE "ctoId" IN (...)` de casi 1.000 IDs de CTO.
- **Optimización**: Se eliminó la inclusión masiva de comentarios en la vista general. Ahora cada CTO carga sus comentarios de forma granular y bajo demanda al abrir la ficha individual (`/api/ctos/[id]`), reduciendo el tiempo de respuesta inicial en más de un 40%.

### Silenciado de Logs Verbosos en Producción
- En `src/lib/prisma.ts` se configuró el logger para mostrar únicamente `['error', 'warn']`, evitando inundar la terminal con cientos de líneas por segundo procedentes del rastreo GPS continuo. Se puede reactivar el modo depuración de consultas con `DEBUG_PRISMA=true`.
