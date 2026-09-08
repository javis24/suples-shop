import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const production = process.env.NODE_ENV === "production";

  const connectionLimit = production ? 1 : 5;

  const adapter = new PrismaMariaDb({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "suples_shop",
    connectionLimit,
    minimumIdle: 0,
    idleTimeout: production ? 5 : 60,
    connectTimeout: 10_000,
    acquireTimeout: 30_000,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();


globalForPrisma.prisma = prisma;
