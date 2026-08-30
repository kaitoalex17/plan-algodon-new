const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Iniciando sembrado de la base de datos (Seeding)...");

  // Verificar si ya existen usuarios
  const userCount = await prisma.user.count();

  // Crear o actualizar usuario administrador por defecto
  console.log("Sincronizando usuario administrador por defecto...");
  const hashedPassword = await bcrypt.hash("AlgodonAdmin2026", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@algodon.xyz" },
    update: {
      password: hashedPassword,
      role: "ADMIN",
    },
    create: {
      name: "Administrador",
      email: "admin@algodon.xyz",
      password: hashedPassword,
      role: "ADMIN",
      color: "#FF7900",
    },
  });

  console.log(`Usuario administrador verificado con éxito: ${admin.email}`);

  // Verificar si existen sub-estados por defecto
  const subStatusCount = await prisma.subStatus.count({ where: { category: "AUDITORIA" } });
  if (subStatusCount === 0) {
    console.log("Creando sub-estados de AUDITORIA por defecto...");
    await prisma.subStatus.createMany({
      data: [
        { name: "Sin acceso a fachada", color: "#6b7280", category: "AUDITORIA" },
        { name: "Caja rota/dañada", color: "#ef4444", category: "AUDITORIA" },
        { name: "Sin señal/potencia", color: "#f59e0b", category: "AUDITORIA" },
        { name: "Falta acometida", color: "#3b82f6", category: "AUDITORIA" },
        { name: "Correcto", color: "#10b981", category: "AUDITORIA" },
      ],
    });
    console.log("Sub-estados de AUDITORIA creados.");
  }

  // Verificar si existen sub-estados de PROGRAMADA
  const subStatusProgCount = await prisma.subStatus.count({ where: { category: "PROGRAMADA" } });
  if (subStatusProgCount === 0) {
    console.log("Creando sub-estados de PROGRAMADA por defecto...");
    await prisma.subStatus.createMany({
      data: [
        { name: "No instalado", color: "#6b7280", category: "PROGRAMADA" },
        { name: "No hay cable", color: "#ef4444", category: "PROGRAMADA" },
        { name: "No hay permiso", color: "#f59e0b", category: "PROGRAMADA" },
        { name: "Instalada \"Sincronizada\"", color: "#06b6d4", category: "PROGRAMADA" },
        { name: "Instalada \"Aceptada\"", color: "#10b981", category: "PROGRAMADA" },
        { name: "Instalada \"Construccion\"", color: "#8b5cf6", category: "PROGRAMADA" },
      ],
    });
    console.log("Sub-estados de PROGRAMADA creados.");
  }
}

main()
  .catch((e) => {
    console.error("Error durante el sembrado de la base de datos:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
