import { type NextRequest } from "next/server";
import { json, ok } from "@/lib/api";
import {
  getMercadoPagoPayment,
  validateMercadoPagoWebhook,
} from "@/lib/mercado-pago";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type WebhookBody = {
  type?: string;
  data?: { id?: string | number };
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as WebhookBody | null;
  const dataId =
    request.nextUrl.searchParams.get("data.id") ||
    (body?.data?.id ? String(body.data.id) : null);

  try {
    validateMercadoPagoWebhook({
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId,
    });
  } catch (error) {
    console.error("Webhook de Mercado Pago con firma inválida", error);
    return json(
      { success: false, error: { message: "Firma inválida" } },
      { status: 401 },
    );
  }

  if (!dataId || (body?.type && body.type !== "payment")) {
    return ok({ received: true });
  }

  const payment = await getMercadoPagoPayment(dataId);
  const orderNumber = payment.external_reference?.trim();
  if (!orderNumber) return ok({ received: true });

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { orderNumber } });
    if (!order || order.paymentMethod !== "ONLINE") return;

    const receivedAmount = Number(payment.transaction_amount ?? 0);
    const amountMatches = Math.abs(receivedAmount - Number(order.total)) < 0.01;
    const currencyMatches = payment.currency_id === "MXN";
    const approved = payment.status === "approved" && amountMatches && currencyMatches;

    let paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED" = "PENDING";
    if (approved) paymentStatus = "PAID";
    else if (payment.status === "refunded" || payment.status === "charged_back") {
      paymentStatus = "REFUNDED";
    } else if (
      ["rejected", "cancelled", "cancelled_by_user"].includes(payment.status ?? "") ||
      (payment.status === "approved" && (!amountMatches || !currencyMatches))
    ) {
      paymentStatus = "FAILED";
    }

    // Una notificación tardía no debe degradar un pago que ya fue aprobado.
    if (order.paymentStatus === "PAID" && paymentStatus !== "REFUNDED") return;

    const shouldConfirm = approved && order.status === "PENDING";
    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus,
        paymentReference: String(payment.id ?? dataId),
        status: shouldConfirm ? "CONFIRMED" : undefined,
      },
    });

    if (shouldConfirm) {
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          from: order.status,
          to: "CONFIRMED",
          note: "Pago aprobado por Mercado Pago",
        },
      });
    }
  });

  return ok({ received: true });
}
