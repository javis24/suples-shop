import { z } from "zod";
import { ApiError, created, handleApiError, ok, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  amount: z.coerce.number().positive().max(9999999),
  method: z.enum(["CASH", "TRANSFER", "CARD"]),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  receivedAt: z.coerce.date().optional(),
});

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const orderId = parseId((await context.params).id);
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: {
          include: {
            createdBy: { select: { id: true, name: true } },
            voidedBy: { select: { id: true, name: true } },
          },
          orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        },
      },
    });
    if (!order) throw new ApiError(404, "Pedido no encontrado");

    const paidAmount =
      Math.round(
        order.payments
          .filter((payment) => !payment.voidedAt)
          .reduce((sum, payment) => sum + Number(payment.amount), 0) * 100,
      ) / 100;
    const balance = Math.max(
      0,
      Math.round((Number(order.total) - paidAmount) * 100) / 100,
    );

    return ok({ ...order, paidAmount, balance });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser(["ADMIN", "STAFF"]);
    const orderId = parseId((await context.params).id);
    const data = schema.parse(await request.json());

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { payments: true },
      });
      if (!order) throw new ApiError(404, "Pedido no encontrado");
      if (order.status === "CANCELED") {
        throw new ApiError(409, "No se pueden registrar pagos en un pedido cancelado");
      }

      const paidBefore = order.payments
        .filter((payment) => !payment.voidedAt)
        .reduce((sum, payment) => sum + Number(payment.amount), 0);
      const balanceBefore = Math.max(
        0,
        Math.round((Number(order.total) - paidBefore) * 100) / 100,
      );
      if (balanceBefore <= 0) {
        throw new ApiError(409, "El pedido ya está totalmente pagado");
      }
      if (data.amount > balanceBefore + 0.001) {
        throw new ApiError(
          409,
          "El abono supera el saldo pendiente de $" + balanceBefore.toFixed(2),
        );
      }

      const payment = await tx.paymentRecord.create({
        data: {
          orderId,
          amount: data.amount,
          method: data.method,
          reference: data.reference || null,
          note: data.note || null,
          receivedAt: data.receivedAt ?? new Date(),
          createdById: user.id,
        },
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      });

      const paidAfter =
        Math.round((paidBefore + Number(payment.amount)) * 100) / 100;
      const newStatus =
        paidAfter + 0.001 >= Number(order.total) ? "PAID" : "PENDING";

      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: newStatus },
      });

      return { payment, paidAfter, newStatus };
    });

    return created(result);
  } catch (error) {
    return handleApiError(error);
  }
}
