import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta configurar la variable ${name}`);
  }

  return value;
}

function createPrismaClient() {
  const databaseUrl = requiredEnv("DATABASE_URL");

  const adapter = new PrismaMariaDb(databaseUrl, {
    // Evita conflictos entre utf8mb4_unicode_ci y utf8mb4_bin
    // en búsquedas LIKE, contains, startsWith y endsWith.
    useTextProtocol: true,

    onConnectionError(error) {
      console.error("MariaDB connection error:", error);
    },
  });

  return new PrismaClient({
    adapter,
  });
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;