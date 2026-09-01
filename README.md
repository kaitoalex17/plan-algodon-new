# ● Plan Algodón

**Plan Algodón** es una aplicación web progresiva de alto rendimiento diseñada para técnicos de telecomunicaciones y administradores, orientada a la auditoría, control y seguimiento geolocalizado de CTOs (Cajas de Terminales Ópticos) en campo. 

La plataforma está diseñada bajo un enfoque **Mobile-First** con interfaces de alto contraste para visibilidad en exteriores y bloqueo de zoom/desplazamientos para emular el comportamiento de una aplicación móvil nativa.

---

## 🌟 Características Principales

### 🏠 Navegación y Botón Casa
- **Botón Casa (Home View):** Permite memorizar la vista y nivel de zoom manteniendo presionado 5 segundos (con animación de carga y vibración) y regresar a ella con un solo toque.
- **Inmovilización Móvil (iOS Safari):** Estructura fija en `100dvh` con eliminación de rebote de scroll para experiencia idéntica a una app nativa.

### 🗺️ Visualización de Campo Avanzada
- **Mapas Multicapa:** Capas de Google Maps (Normal, Satélite e Híbrido), OpenStreetMap y **Modo Oscuro sin API Key** (ESRI World Dark Gray Canvas y Alto Contraste).
- **Nivel de Zoom Extremo:** Soporte para acercar el mapa hasta el nivel `21` para ubicar CTOs a nivel de tejado con máxima precisión.
- **Marcadores Dinámicos:** Los técnicos pueden cambiar la forma de sus marcadores (Círculo, Triángulo, Cuadrado, Rombo, Estrella) y ajustar su tamaño (de 4px a 12px) en tiempo real según sus preferencias de visibilidad.

### 👤 Perfil y Sistema de 15 Temas Visuales
- **15 Temas de Color:** Incluye 10 temas estándar y 5 temas de **Modo Oscuro Puro** (Cyan, Verde, Violeta, Rojo, Oro) organizados en cuadrícula responsiva anti-desbordamiento.
- **Persistencia de Preferencias:** Cada ajuste de visualización, tema y nivel de zoom mínimo se asocia y guarda en la base de datos para cada técnico.

### 📸 Auditoría Visual y Flujo de Reparaciones (Fase 3)
- **Panel de Auditoría Fotográfica (`/admin/photo-audit`):** Validación masiva con **Modo Scroll** (aprobación al desplazarse) y **Modo Táctil** (interfaz gestual estilo deslizamiento).
- **Estado REPARAR y Control de Taller (`/admin/repair`):** Supervisión de incidencias enviadas a reparación, filtros por técnico/clúster y exportación CSV.
- **Buzón Personal de Reparaciones:** Notificaciones prioritarias con los motivos escritos por los auditores para cada técnico en campo.

---

## 📖 Documentación Detallada (Directorio `docs/`)

Para consultar la documentación técnica completa del proyecto, accede a los siguientes documentos:
- [📚 Índice General de Documentación](./docs/README.md)
- [📸 Auditoría Fotográfica y Reparaciones](./docs/AUDITORIA_FOTOGRAFICA_Y_REPARACIONES.md)
- [🗺️ Mapas, Navegación y Botón Casa](./docs/MAPAS_Y_NAVEGACION.md)
- [🎨 Sistema de 15 Temas y Diseño Responsivo](./docs/SISTEMA_DE_TEMAS.md)
- [🗄️ Arquitectura de Datos y Base de Datos (Prisma ORM)](./docs/ARQUITECTURA_Y_DATOS.md)

---

## 🛠️ Tecnologías y Dependencias

El proyecto está construido sobre un stack moderno y eficiente:

### Core & Framework
- **React 19.2.4**
- **Next.js 16.2.7 (App Router & Turbopack)**
- **TypeScript**

### Base de Datos & ORM
- **Prisma ORM 5.22.0**
- **PostgreSQL** (gestionado en producción)

### Mapas & GIS
- **Leaflet 1.9.4** & **React Leaflet 5.0.0**

### Procesamiento de Archivos y Utilidades
- **sharp 0.35.1:** Para la redimensión y compresión ultra-rápida de imágenes en servidor.
- **jszip 3.10.1:** Para empaquetar de forma asíncrona las fotos en archivos ZIP estructurados.
- **xlsx 0.18.5:** Para el análisis y procesamiento de archivos Excel importados.
- **next-auth 4.24.14:** Para la gestión de sesiones de usuario y seguridad de rutas basada en roles (`ADMIN` / `USER`).
- **bcryptjs 3.0.3:** Para la encriptación segura de contraseñas.
- **Iconoir Icons:** Iconografía outline minimalista y de alto contraste.

---

## 🚀 Instalación y Despliegue

### Requisitos Previos
- Node.js v18 o superior.
- Una base de datos PostgreSQL activa.

### Desarrollo Local

1. Instalar las dependencias del proyecto:
   ```bash
   npm install
   ```

2. Configurar el archivo de entorno `.env` en la raíz con la conexión de base de datos:
   ```env
   DATABASE_URL="postgresql://usuario:contraseña@localhost:5432/algodon"
   NEXTAUTH_SECRET="tu-secreto-super-seguro"
   NEXTAUTH_URL="http://localhost:3000"
   ```

3. Aplicar las migraciones de base de datos y realizar el sembrado:
   ```bash
   npx prisma db push
   npx prisma db seed
   ```

4. Iniciar el servidor de desarrollo:
   ```bash
   npm run dev
   ```

### Despliegue en Producción (Portainer / Docker)
Este proyecto incluye soporte para despliegue automatizado mediante contenedores Docker. En tu panel de **Portainer**:
1. Conecta el stack a tu repositorio de GitHub.
2. Ejecuta **"Pull and redeploy"** para descargar la última versión y reconstruir la imagen de producción.
3. Las variables globales de compresión y las rutas de streaming de imágenes `/api/uploads/[filename]` se configurarán automáticamente.

---

## 🏆 Créditos y Agradecimientos

Este proyecto ha sido desarrollado e iterado en colaboración con **Antigravity**, un asistente de inteligencia artificial para desarrollo de software diseñado por el equipo de **Advanced Agentic Coding en Google DeepMind**. 

Se han aplicado directrices avanzadas de diseño de interfaces web, optimizaciones de rendimiento en renderizado de mapas móviles, compresión eficiente de archivos en NodeJS y descodificación segura de estructuras de datos.

---

## 📄 Licencia

Este proyecto está distribuido bajo la **Licencia MIT**. Puedes ver más detalles en el archivo [LICENSE](file:///c:/app/algodon-new/LICENSE) adjunto en este repositorio.

Para ver el desglose completo de las licencias de dependencias de terceros (como Leaflet, React, Sharp y avisos legales sobre el uso de teselas de Google Maps), consulta el archivo [THIRD_PARTY_LICENSES.md](file:///c:/app/algodon-new/THIRD_PARTY_LICENSES.md).
