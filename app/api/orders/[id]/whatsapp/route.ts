import { ApiError, created, handleApiError, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { buildCustomerWhatsApp } from "@/lib/order-whatsapp";
import { prisma } from "@/lib/prisma";
type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const user = await requireUser(["ADMIN", "STAFF"]);
    const id = parseId((await context.params).id);
    const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new ApiError(404, "Pedido no encontrado");
    const whatsapp = buildCustomerWhatsApp(order);
    if (!whatsapp.url) throw new ApiError(409, "El cliente no tiene un número de WhatsApp válido.");
    const log = await prisma.orderWhatsAppLog.create({
      data: { orderId: id, destination: whatsapp.destination, message: whatsapp.message, action: "ADMIN_PREPARED", userId: user.id },
      include: { user: { select: { id: true, name: true } } },
    });
    return created({ ...whatsapp, log });
  } catch (error) {
    return handleApiError(error);
  }
}
