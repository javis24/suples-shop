import { ApiError, created, handleApiError, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { buildOrderWhatsApp, storeWhatsAppConfig } from "@/lib/order-whatsapp";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const user = await requireUser(["ADMIN", "STAFF"]);
    const id = parseId((await context.params).id);
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new ApiError(404, "Pedido no encontrado");

    const checkoutUrl =
      order.paymentMethod === "ONLINE" && order.paymentPreferenceId
        ? null
        : null;
    const whatsapp = buildOrderWhatsApp(order, {
      ...storeWhatsAppConfig(),
      checkoutUrl,
    });
    if (!whatsapp.destination) {
      throw new ApiError(409, "No está configurado STORE_WHATSAPP_NUMBER");
    }

    const log = await prisma.orderWhatsAppLog.create({
      data: {
        orderId: order.id,
        destination: whatsapp.destination,
        message: whatsapp.message,
        action: "ADMIN_OPENED",
        userId: user.id,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    return created({ ...whatsapp, log });
  } catch (error) {
    return handleApiError(error);
  }
}
