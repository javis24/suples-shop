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

function databaseUrlWithPoolOptions() {
  const databaseUrl = requiredEnv("DATABASE_URL");

  let url: URL;

  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL no tiene un formato válido");
  }

  if (url.protocol !== "mysql:" && url.protocol !== "mariadb:") {
    throw new Error(
      "DATABASE_URL debe comenzar con mysql:// o mariadb://",
    );
  }

  if (
    !url.hostname ||
    !url.username ||
    !url.pathname.replace(/^\/+/, "")
  ) {
    throw new Error(
      "DATABASE_URL no contiene host, usuario o base de datos",
    );
  }

const production = process.env.NODE_ENV === "production";

url.searchParams.set(
  "connectionLimit",
  production ? "1" : "5",
);
url.searchParams.set("minimumIdle", "1");
url.searchParams.set(
  "idleTimeout",
  production ? "30" : "60",
);
url.searchParams.set("connectTimeout", "10000");
url.searchParams.set("acquireTimeout", "10000");
url.searchParams.set(
  "collation",
  "UTF8MB4_UNICODE_CI",
);

  return url.toString();
}

function createPrismaClient() {
  const adapter = new PrismaMariaDb(
    databaseUrlWithPoolOptions(),
    {
      useTextProtocol: true,
      onConnectionError(error) {
        console.error("MariaDB connection error:", error);
      },
    },
  );

  return new PrismaClient({ adapter });
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;