import { z } from "zod";
import { ApiError, handleApiError, ok, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string; paymentId: string }> };

const schema = z.object({
  reason: z.string().trim().min(3).max(255),
});

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await requireUser(["ADMIN", "STAFF"]);
    const params = await context.params;
    const orderId = parseId(params.id);
    const paymentId = parseId(params.paymentId);
    const data = schema.parse(await request.json());

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.paymentRecord.findFirst({
        where: { id: paymentId, orderId },
      });
      if (!payment) throw new ApiError(404, "Pago no encontrado");
      if (payment.voidedAt) {
        throw new ApiError(409, "Este pago ya fue anulado");
      }

      const updated = await tx.paymentRecord.update({
        where: { id: payment.id },
        data: {
          voidedAt: new Date(),
          voidReason: data.reason,
          voidedById: user.id,
        },
        include: {
          createdBy: { select: { id: true, name: true } },
          voidedBy: { select: { id: true, name: true } },
        },
      });

      const activePayments = await tx.paymentRecord.findMany({
        where: { orderId, voidedAt: null },
        select: { amount: true },
      });
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new ApiError(404, "Pedido no encontrado");

      const paidAmount =
        Math.round(
          activePayments.reduce((sum, item) => sum + Number(item.amount), 0) * 100,
        ) / 100;
      const paymentStatus =
        paidAmount + 0.001 >= Number(order.total) ? "PAID" : "PENDING";

      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus },
      });

      return { payment: updated, paidAmount, paymentStatus };
    });

    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
