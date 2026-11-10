import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { checkoutHash, type CheckoutInput, normalizePhone, validPhone } from "@/lib/checkout-policy";
import { buildOrderWhatsApp } from "@/lib/order-whatsapp";
import { orderTransaction } from "@/lib/order-transaction";

type StoreConfig = { businessPhone: string };
const includeItems = { items: true } as const;

function checkReplay<T extends { checkoutHash: string | null }>(order: T, hash: string): T {
  if (order.checkoutHash !== hash) {
    throw new ApiError(409, "La solicitud anterior tiene otros datos. Recupera ese pedido antes de preparar otro.");
  }
  return order;
}

export async function createCheckoutOrder(db: PrismaClient, data: CheckoutInput, config: StoreConfig) {
  const hash = checkoutHash(data);
  const existing = await db.order.findUnique({ where: { checkoutKey: data.checkoutKey }, include: includeItems });
  if (existing) return checkReplay(existing, hash);
  if (!validPhone(config.businessPhone)) {
    throw new ApiError(503, "Los pedidos por WhatsApp no están disponibles por el momento. Intenta más tarde.");
  }
  try {
    return await orderTransaction(db, async tx => {
      const variants = await tx.productVariant.findMany({
        where: { id: { in: data.items.map(item => item.variantId) }, active: true },
        include: { product: true },
      });
      const byId = new Map(variants.map(variant => [variant.id, variant]));
      const lines = data.items.map(item => {
        const variant = byId.get(item.variantId);
        if (!variant || variant.product.status !== "ACTIVE") {
          throw new ApiError(409, "Uno de los productos ya no está disponible. Revisa tu carrito.");
        }
        if (variant.stock < item.quantity) {
          throw new ApiError(409, "Existencia insuficiente para " + variant.product.name);
        }
        const cents = Math.round(Number(variant.price) * 100);
        return {
          variantId: variant.id,
          sku: variant.sku,
          productName: variant.product.name,
          variantName: [variant.presentation, variant.flavor].filter(Boolean).join(" · ") || null,
          quantity: item.quantity,
          unitPrice: cents / 100,
          lineTotal: cents * item.quantity / 100,
        };
      });
      const subtotalCents = lines.reduce((sum, line) => sum + Math.round(line.lineTotal * 100), 0);
      if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 999999999999) {
        throw new ApiError(422, "El importe del pedido supera el límite permitido.");
      }
      const subtotal = subtotalCents / 100;
      // Create the unique key inside the transaction, before any stock change.
      const order = await tx.order.create({
        data: {
          checkoutKey: data.checkoutKey,
          checkoutHash: hash,
          orderNumber: "SS-" + Date.now().toString(36).toUpperCase() + "-" + randomBytes(5).toString("hex").toUpperCase(),
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail,
          notes: data.notes,
          shippingAddress: data.shippingAddress,
          paymentMethod: "TO_CONFIRM",
          shippingQuoted: false,
          shipping: 0,
          subtotal,
          total: subtotal,
          items: { create: lines },
          statusHistory: { create: { to: "PENDING", note: "Envío a domicilio. Existencias apartadas al registrar; envío y pago por confirmar." } },
        },
        include: includeItems,
      });
      for (const item of data.items) {
        const result = await tx.productVariant.updateMany({
          where: { id: item.variantId, active: true, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (result.count !== 1) throw new ApiError(409, "La existencia cambió. Revisa tu carrito e intenta nuevamente.");
        const current = await tx.productVariant.findUniqueOrThrow({ where: { id: item.variantId } });
        await tx.inventoryMovement.create({ data: {
          variantId: item.variantId, orderId: order.id, type: "SALE",
          quantity: -item.quantity, previousStock: current.stock + item.quantity, newStock: current.stock,
          reason: "Apartado por pedido web pendiente de confirmación", reference: order.orderNumber,
        } });
      }
      const whatsapp = buildOrderWhatsApp(order, config);
      await tx.orderWhatsAppLog.create({ data: {
        orderId: order.id, destination: normalizePhone(config.businessPhone),
        message: whatsapp.message, action: "CHECKOUT_PREPARED",
      } });
      return order;
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
    if (code === "P2002" || error instanceof ApiError) {
      const replay = await db.order.findUnique({ where: { checkoutKey: data.checkoutKey }, include: includeItems });
      if (replay) return checkReplay(replay, hash);
    }
    throw error;
  }
}

type CheckoutOrder = Awaited<ReturnType<typeof createCheckoutOrder>>;
export function publicCheckoutOrder(order: CheckoutOrder, config: StoreConfig) {
  const whatsapp = buildOrderWhatsApp(order, config);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    total: order.total,
    shippingQuoted: order.shippingQuoted,
    status: order.status,
    whatsappUrl: order.status === "CANCELED" ? "" : whatsapp.url,
  };
}
