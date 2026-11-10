import { z } from "zod";
import { ApiError, handleApiError, ok } from "@/lib/api";
import { checkoutKeySchema } from "@/lib/checkout-policy";
import { publicCheckoutOrder } from "@/lib/checkout-service";
import { storeWhatsAppConfig } from "@/lib/order-whatsapp";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { checkoutKey } = z.object({ checkoutKey: checkoutKeySchema }).strict().parse(await request.json());
    // The unguessable UUID is a bearer capability; never accept an order ID/folio here.
    const order = await prisma.order.findUnique({ where: { checkoutKey }, include: { items: true } });
    if (!order) throw new ApiError(404, "El pedido aún no está registrado. Reintenta la solicitud original.");
    const response = ok(publicCheckoutOrder(order, storeWhatsAppConfig()));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
