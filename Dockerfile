FROM node:20-alpine

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Dependencias del sistema para Prisma en Alpine
RUN apk add --no-cache libc6-compat openssl

# Instalar dependencias npm
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copiar el resto del código (incluye prisma/schema.prisma)
COPY . .

# Generar el cliente Prisma ANTES del build de Next.js
# Prisma generate no necesita conectarse a la BD, solo genera código
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# Construir Next.js (ahora sí tiene el cliente Prisma disponible)
RUN npm run build

# Eliminar la URL dummy para que en runtime use la real
ENV DATABASE_URL=""

EXPOSE 3020
ENV PORT=3020
ENV HOSTNAME="0.0.0.0"

# Al arrancar: aplicar esquema a la BD real, ejecutar seed si es necesario, y lanzar la app
CMD npx prisma db push --skip-generate && node prisma/seed.js && npm run start
