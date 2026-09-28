import { z } from "zod";
import { ApiError, handleApiError, ok, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().positive().max(100),
      }),
    )
    .min(1),
});

export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireUser(["ADMIN", "STAFF"]);
    const id = parseId((await context.params).id);
    const data = schema.parse(await request.json());

    const order = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { id },
        include: { items: true, coupon: true, payments: { where: { voidedAt: null } } },
      });
      if (!existing) throw new ApiError(404, "Pedido no encontrado");
      if (
        existing.paymentStatus === "PAID" ||
        ["SHIPPED", "DELIVERED", "CANCELED"].includes(existing.status)
      ) {
        throw new ApiError(
          409,
          "Los productos ya no pueden modificarse porque el pedido está pagado, enviado, entregado o cancelado",
        );
      }

      const desired = new Map<number, number>();
      for (const item of data.items) {
        desired.set(item.variantId, (desired.get(item.variantId) ?? 0) + item.quantity);
      }

      const oldByVariant = new Map<number, number>();
      for (const item of existing.items) {
        if (item.variantId) {
          oldByVariant.set(
            item.variantId,
            (oldByVariant.get(item.variantId) ?? 0) + item.quantity,
          );
        }
      }

      const variantIds = [...desired.keys()];
      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds }, active: true },
        include: { product: true },
      });
      if (variants.length !== variantIds.length) {
        throw new ApiError(409, "Uno o más productos ya no están disponibles");
      }

      const byId = new Map(variants.map((variant) => [variant.id, variant]));
      for (const [variantId, quantity] of desired) {
        const variant = byId.get(variantId);
        if (!variant || variant.product.status !== "ACTIVE") {
          throw new ApiError(409, "Uno o más productos están inactivos");
        }
        const available = variant.stock + (oldByVariant.get(variantId) ?? 0);
        if (quantity > available) {
          throw new ApiError(
            409,
            `Existencia insuficiente para ${variant.product.name}. Disponible: ${available}`,
          );
        }
      }

      const allVariantIds = new Set([...oldByVariant.keys(), ...desired.keys()]);
      for (const variantId of allVariantIds) {
        const previousOrdered = oldByVariant.get(variantId) ?? 0;
        const nextOrdered = desired.get(variantId) ?? 0;
        const stockDelta = previousOrdered - nextOrdered;
        if (stockDelta === 0) continue;

        const before = await tx.productVariant.findUnique({ where: { id: variantId } });
        if (!before) continue;

        if (stockDelta < 0) {
          const needed = Math.abs(stockDelta);
          const changed = await tx.productVariant.updateMany({
            where: { id: variantId, stock: { gte: needed } },
            data: { stock: { decrement: needed } },
          });
          if (changed.count !== 1) {
            throw new ApiError(409, "La existencia cambió mientras editabas el pedido; vuelve a intentarlo");
          }
        } else {
          await tx.productVariant.update({
            where: { id: variantId },
            data: { stock: { increment: stockDelta } },
          });
        }

        const after = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId } });
        await tx.inventoryMovement.create({
          data: {
            variantId,
            type: stockDelta > 0 ? "RETURN" : "SALE",
            quantity: stockDelta,
            previousStock: before.stock,
            newStock: after.stock,
            reason: "Edición administrativa de pedido",
            reference: existing.orderNumber,
            orderId: existing.id,
            userId: user.id,
          },
        });
      }

      const lines = [...desired.entries()].map(([variantId, quantity]) => {
        const variant = byId.get(variantId)!;
        const unitPrice = Number(variant.price);
        return {
          variantId,
          sku: variant.sku,
          productName: variant.product.name,
          variantName:
            [variant.presentation, variant.flavor].filter(Boolean).join(" · ") || null,
          quantity,
          unitPrice,
          lineTotal: Math.round(unitPrice * quantity * 100) / 100,
        };
      });

      const subtotal =
        Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;
      let discount = 0;
      const coupon = existing.coupon;
      if (
        coupon &&
        (!coupon.minimumAmount || subtotal >= Number(coupon.minimumAmount))
      ) {
        discount =
          coupon.type === "PERCENTAGE"
            ? subtotal * (Number(coupon.value) / 100)
            : Number(coupon.value);
        if (coupon.maximumDiscount) {
          discount = Math.min(discount, Number(coupon.maximumDiscount));
        }
        discount = Math.min(subtotal, Math.round(discount * 100) / 100);
      }

      const total = Math.max(
        0,
        Math.round((subtotal - discount + Number(existing.shipping)) * 100) / 100,
      );
      const paidAmount =
        Math.round(
          existing.payments.reduce((sum, payment) => sum + Number(payment.amount), 0) * 100,
        ) / 100;
      if (paidAmount > total + 0.001) {
        throw new ApiError(
          409,
          "El nuevo total no puede ser menor que lo ya cobrado. Anula o ajusta primero los pagos conciliados.",
        );
      }
      const paymentStatus = paidAmount + 0.001 >= total ? "PAID" : "PENDING";

      await tx.orderItem.deleteMany({ where: { orderId: existing.id } });
      await tx.orderItem.createMany({
        data: lines.map((line) => ({ orderId: existing.id, ...line })),
      });

      return tx.order.update({
        where: { id: existing.id },
        data: { subtotal, discount, total, paymentStatus },
        include: {
          items: true,
          customer: true,
          coupon: true,
          statusHistory: {
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: "asc" },
          },
          whatsappLogs: {
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
      });
    });

    return ok(order);
  } catch (error) {
    return handleApiError(error);
  }
}
