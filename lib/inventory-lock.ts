import type { Prisma } from "@/app/generated/prisma/client";

// Acquire before any reads, and before Order locks, in every stock transaction.
// A row lock is released on rollback/commit and works across Vercel instances.
export async function lockInventory(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM \`Setting\` WHERE \`key\` = 'inventory_transaction_lock' FOR UPDATE`;
  if (!rows.length) throw new Error("Falta aplicar la migración de conciliación de inventario");
}
