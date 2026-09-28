import { type NextRequest } from "next/server";
import { getPagination, handleApiError, ok, paginationMeta } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const params = request.nextUrl.searchParams;
    const { page, limit, skip } = getPagination(params);
    const q = params.get("q")?.trim();
    const paymentStatus = params.get("paymentStatus") as
      | "PENDING"
      | "PAID"
      | "FAILED"
      | "REFUNDED"
      | null;

    const where = {
      status: { not: "CANCELED" as const },
      paymentStatus: paymentStatus || undefined,
      OR: q
        ? [
            { orderNumber: { contains: q } },
            { customerName: { contains: q } },
            { customerPhone: { contains: q } },
            { customerEmail: { contains: q } },
          ]
        : undefined,
    };

    const orders = await prisma.order.findMany({
      where,
      include: {
        payments: {
          include: {
            createdBy: { select: { id: true, name: true } },
            voidedBy: { select: { id: true, name: true } },
          },
          orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });
    const total = await prisma.order.count({ where });

    const data = orders.map((order) => {
      const activePayments = order.payments.filter((payment) => !payment.voidedAt);
      const paidAmount =
        Math.round(
          activePayments.reduce((sum, payment) => sum + Number(payment.amount), 0) * 100,
        ) / 100;
      const totalAmount = Number(order.total);
      const balance = Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100);
      const reconciliationStatus =
        paidAmount <= 0 ? "PENDING" : balance > 0 ? "PARTIAL" : "PAID";

      return {
        ...order,
        paidAmount,
        balance,
        reconciliationStatus,
      };
    });

    return ok(data, paginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}
