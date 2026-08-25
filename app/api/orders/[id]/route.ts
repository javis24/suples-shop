import { z } from "zod";
import { ApiError, handleApiError, ok, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED", "CANCELED"]).optional(),
  paymentStatus: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED"]).optional(),
  note: z.string().trim().max(255).optional().nullable(),
});

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const id = parseId((await context.params).id);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        customer: true,
        coupon: true,
        statusHistory: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) throw new ApiError(404, "Pedido no encontrado");
    return ok(order);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser(["ADMIN", "STAFF"]);
    const id = parseId((await context.params).id);
    const data = schema.parse(await request.json());

    const order = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!existing) throw new ApiError(404, "Pedido no encontrado");
      if (existing.status === "CANCELED" && data.status && data.status !== "CANCELED") {
        throw new ApiError(409, "Un pedido cancelado no puede reactivarse");
      }

      if (data.status === "CANCELED" && existing.status !== "CANCELED") {
        for (const item of existing.items) {
          if (!item.variantId) continue;
          const before = await tx.productVariant.findUnique({ where: { id: item.variantId } });
          if (!before) continue;
          const after = await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
          await tx.inventoryMovement.create({
            data: {
              variantId: item.variantId,
              type: "CANCELLATION",
              quantity: item.quantity,
              previousStock: before.stock,
              newStock: after.stock,
              reason: "Cancelación de pedido",
              reference: existing.orderNumber,
              orderId: existing.id,
              userId: user.id,
            },
          });
        }
        if (existing.couponId) {
          await tx.coupon.updateMany({
            where: { id: existing.couponId, usageCount: { gt: 0 } },
            data: { usageCount: { decrement: 1 } },
          });
        }
      }

      if (data.status && data.status !== existing.status) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: existing.id,
            from: existing.status,
            to: data.status,
            note: data.note || null,
            userId: user.id,
          },
        });
      }

      return tx.order.update({
        where: { id },
        data: { status: data.status, paymentStatus: data.paymentStatus },
        include: { items: true, customer: true, coupon: true, statusHistory: true },
      });
    });

    return ok(order);
  } catch (error) {
    return handleApiError(error);
  }
}
