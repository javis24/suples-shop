import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { lockInventory } from "@/lib/inventory-lock";
import { ApiError } from "@/lib/api";

export async function lockOrder(tx: Prisma.TransactionClient, id: number) {
  // Parameterized query. All order mutations use this same row lock.
  const rows = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM \`Order\` WHERE id = ${id} FOR UPDATE`;
  if (!rows.length) throw new ApiError(404, "Pedido no encontrado");
}

export async function orderTransaction<T>(
  db: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => { await lockInventory(tx); return operation(tx); }, { maxWait: 10000, timeout: 20000 });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
      if (code !== "P2034" || attempt >= 2) throw error;
    }
  }
}
