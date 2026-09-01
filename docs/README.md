# 📚 Documentación Oficial - Plan Algodón (Fase 3)

Bienvenido a la documentación oficial y técnica del proyecto **Plan Algodón**. Esta sección recoge la arquitectura, guías de uso funcional, manual de administración y detalles técnicos de las nuevas características de la Tercera Fase.

---

## 📑 Índice de Guías

1. [**Auditoría Fotográfica y Flujo de Reparaciones**](./AUDITORIA_FOTOGRAFICA_Y_REPARACIONES.md)
   - Panel de Auditoría Visual masiva (`/admin/photo-audit`).
   - **Modo Scroll**: Auto-validación de cajas en pantalla al desplazarse.
   - **Modo Táctil (Swipe)**: Validación rápida estilo deslizamiento (derecha = bien, izquierda = enviar a taller/reparación).
   - **Panel de Control de Reparaciones** (`/admin/repair`): Supervisión, filtros por técnico/clúster, reasignación y exportación CSV.
   - **Buzón de Incidencias en Campo**: Notificación y consulta de motivos para técnicos asignados.

2. [**Mapas, Navegación y Botón Casa**](./MAPAS_Y_NAVEGACION.md)
   - **Botón Casa (Home)**: Pulsación mantenida de 5 segundos para memorizar el centro y nivel de zoom, y retorno instantáneo con un solo toque.
   - **Proveedores de Modo Oscuro 100% Libres**: ESRI World Dark Gray Canvas y Modo Oscuro Alto Contraste (sin requerimiento de API Key de Carto).
   - **Optimización iOS / iPhone**: Fijación de vista con `100dvh` y eliminación de rebotes de scroll.
   - **Tracking GPS en tiempo real** y sincronización de técnicos en campo.

3. [**Sistema de Temas y Personalización**](./SISTEMA_DE_TEMAS.md)
   - Cuadrícula responsiva sin desbordamiento para pantallas móviles (`repeat(auto-fill, minmax(68px, 1fr))`).
   - 10 Temas Estándar (Naranja, Azul, Verde, Morado, Indigo, Rosa, Teal, Ámbar, Pizarra, Oscuro).
   - 5 Temas Modo Oscuro Puro (Cyan, Verde Esmeralda, Violeta, Rojo Carmesí, Oro).

4. [**Arquitectura de Datos y Base de Datos (Prisma ORM)**](./ARQUITECTURA_Y_DATOS.md)
   - Esquema de PostgreSQL (`CTO`, `User`, `Image`, `Comment`, `History`, `SubStatus`).
   - Optimizaciones de rendimiento (eliminación de consultas masivas N+1).
   - Silenciado de logs verbosos en entornos de producción.

---

## 🛠️ Stack Tecnológico
- **Frontend / Fullstack**: Next.js 16 (App Router + Turbopack), React 19, TypeScript.
- **Mapas & GIS**: Leaflet 1.9, React Leaflet 5.
- **Base de Datos**: PostgreSQL con Prisma ORM 5.22.
- **Diseño**: CSS Moderno con variables, Glassmorphism, 100% libre de emojis en interfaces críticas (iconografía vectorial SVG).
- **Procesamiento**: Sharp (compresión de imágenes WhatsApp HD), JSZip (exportaciones en lote).
