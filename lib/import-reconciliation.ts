import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import { ApiError } from "@/lib/api";

export const reconciliationSelect = {
  id: true, orderNumber: true, customerName: true, status: true,
  createdAt: true, updatedAt: true, microsipIncludedAt: true,
  items: { select: { variantId: true, quantity: true, productName: true } },
} as const;
export type ReconciliationOrder = Prisma.OrderGetPayload<{ select: typeof reconciliationSelect }>;
export const liveOrdersWhere = { status: { not: "CANCELED" as const } };

export function snapshotHash(orders: ReconciliationOrder[], lastBatchId: number | null) {
  return createHash("sha256").update(JSON.stringify({ lastBatchId, orders })).digest("hex");
}
export function fileHash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
function secret() {
  if (!process.env.AUTH_SECRET) throw new Error("Falta AUTH_SECRET");
  return process.env.AUTH_SECRET;
}
export function reviewToken(userId: number, file: string, snapshot: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ userId, file, snapshot, expires: now + 30 * 60 * 1000 })).toString("base64url");
  return payload + "." + createHmac("sha256", secret()).update(payload).digest("base64url");
}
export function verifyReview(token: string, userId: number, file: string, snapshot: string, now = Date.now()) {
  const [payload, signature, extra] = token.split(".");
  const fail = () => { throw new ApiError(409, "El archivo o los pedidos cambiaron, o la revisión venció. Vuelve a revisar el Excel antes de importar."); };
  if (!payload || !signature || extra) return fail();
  const expected = Buffer.from(createHmac("sha256", secret()).update(payload).digest("base64url"));
  const received = Buffer.from(signature);
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) return fail();
  let parsed;
  try { parsed = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return fail(); }
  if (parsed.userId !== userId || parsed.file !== file || parsed.snapshot !== snapshot || !Number.isFinite(parsed.expires) || parsed.expires < now) return fail();
}

export function parseIncludedIds(value: FormDataEntryValue | null) {
  try {
    const ids: unknown = JSON.parse(typeof value === "string" ? value : "");
    if (!Array.isArray(ids) || ids.length > 10000 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error();
    return new Set<number>(ids);
  } catch { throw new ApiError(422, "La selección de pedidos no es válida."); }
}
export function exportDate(value: FormDataEntryValue | null, previous: Date | null, now = Date.now()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) throw new ApiError(422, "Indica cuándo se exportó el archivo desde Microsip.");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() > now + 60000) throw new ApiError(422, "La fecha de exportación no es válida o está en el futuro.");
  if (previous && date < previous) throw new ApiError(409, "Este Excel es anterior a la última exportación importada. Genera uno actualizado desde Microsip.");
  return date;
}
export function reservationPlan(orders: ReconciliationOrder[], included: Set<number>, exportedAt: Date) {
  const byId = new Map(orders.map(order => [order.id, order]));
  for (const id of included) {
    const order = byId.get(id);
    if (!order) throw new ApiError(409, "Uno de los pedidos seleccionados ya cambió. Repite la revisión.");
    if (order.createdAt > exportedAt || (!order.microsipIncludedAt && order.updatedAt > exportedAt)) {
      throw new ApiError(409, "El pedido " + order.orderNumber + " cambió después de exportar el Excel. Exporta un archivo actualizado antes de marcarlo como incluido.");
    }
  }
  const pending = new Map<number, number>();
  for (const order of orders) {
    if (order.microsipIncludedAt && !included.has(order.id)) throw new ApiError(409, "El pedido " + order.orderNumber + " ya fue conciliado. El nuevo Excel debe incluirlo.");
    if (included.has(order.id)) continue;
    for (const item of order.items) {
      if (!item.variantId) throw new ApiError(409, "Revisa el pedido " + order.orderNumber + ": tiene un producto eliminado. Confirma su registro en Microsip antes de importar.");
      pending.set(item.variantId, (pending.get(item.variantId) ?? 0) + item.quantity);
    }
  }
  return pending;
}
export function availableFromSnapshot(excelStock: number, pending: number, name: string) {
  if (!Number.isSafeInteger(excelStock) || !Number.isSafeInteger(pending) || excelStock < 0 || pending < 0) {
    throw new ApiError(422, "Existencia inválida para " + name);
  }
  if (excelStock < pending) throw new ApiError(409, "No se importó: " + name + " tiene " + excelStock + " unidades en Excel y " + pending + " apartadas sin conciliar. Revisa los pedidos y genera un Excel actualizado.");
  return excelStock - pending;
}
