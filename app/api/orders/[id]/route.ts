import { ApiError, handleApiError, ok, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { adminOrderSchema, canChangeStage } from "@/lib/checkout-policy";
import { lockOrder, orderTransaction } from "@/lib/order-transaction";
type Context = { params: Promise<{ id: string }> };

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
        whatsappLogs: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
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
    const data = adminOrderSchema.parse(await request.json());
    const order = await orderTransaction(prisma, async tx => {
      await lockOrder(tx, id);
      const existing = await tx.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
      const nextStatus = data.status ?? existing.status;
      if (!canChangeStage(existing.status, nextStatus)) {
        throw new ApiError(409, "Ese cambio de estado no está permitido. Sigue el orden de preparación y entrega.");
      }
      const shippingQuoted = data.shippingQuoted ?? existing.shippingQuoted;
      const shipping = shippingQuoted ? data.shipping ?? Number(existing.shipping) : 0;
      const changedShipping = shipping !== Number(existing.shipping) || shippingQuoted !== existing.shippingQuoted;
      if (data.shipping !== undefined && !shippingQuoted) {
        throw new ApiError(422, "Confirma la cotización antes de guardar un costo de envío.");
      }
      if (changedShipping && (existing.paymentStatus === "PAID" || ["SHIPPED", "DELIVERED", "CANCELED"].includes(existing.status))) {
        throw new ApiError(409, "No se puede cambiar el envío de un pedido pagado, enviado, entregado o cancelado.");
      }
      const paymentMethod = data.paymentMethod ?? existing.paymentMethod;
      const paymentStatus = data.paymentStatus ?? existing.paymentStatus;
      if (paymentStatus === "PAID" && (!shippingQuoted || paymentMethod === "TO_CONFIRM")) {
        throw new ApiError(409, "Para marcar pagado, confirma el envío y el método real de pago.");
      }
      if (["SHIPPED", "DELIVERED"].includes(nextStatus) && !shippingQuoted) {
        throw new ApiError(409, "Confirma el costo de envío antes de enviar o entregar.");
      }
      const carrier = data.carrier === undefined ? existing.carrier : data.carrier || null;
      const trackingNumber = data.trackingNumber === undefined ? existing.trackingNumber : data.trackingNumber || null;
      if (existing.status === "CANCELED" && (carrier !== existing.carrier || trackingNumber !== existing.trackingNumber || paymentMethod !== existing.paymentMethod)) {
        throw new ApiError(409, "El pedido cancelado no admite cambios de envío o método de pago.");
      }
      if (existing.status === "CANCELED" && paymentStatus !== existing.paymentStatus && paymentStatus !== "REFUNDED") {
        throw new ApiError(409, "Un pedido cancelado solo permite registrar un reembolso realizado.");
      }
      if (nextStatus === "CANCELED" && existing.status !== "CANCELED") {
        if (!data.note) throw new ApiError(422, "Indica el motivo de cancelación.");
        // The order lock serializes cancellation, item editing and status changes.
        for (const item of [...existing.items].sort((a,b) => (a.variantId ?? 0) - (b.variantId ?? 0))) {
          // A reconciled sale is already deducted in Microsip. Its return must
          // be registered there and arrive in a fresh Excel before becoming available.
          if (!item.variantId || existing.microsipIncludedAt) continue;
          const after = await tx.productVariant.update({
            where: { id: item.variantId }, data: { stock: { increment: item.quantity } },
          });
          await tx.inventoryMovement.create({ data: {
            variantId: item.variantId, orderId: id, type: "CANCELLATION",
            quantity: item.quantity, previousStock: after.stock - item.quantity, newStock: after.stock,
            reason: "Cancelación de pedido", reference: existing.orderNumber, userId: user.id,
          } });
        }
        if (existing.couponId) {
          await tx.coupon.updateMany({ where: { id: existing.couponId, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } });
        }
      }
      const total = Math.round((Number(existing.subtotal) - Number(existing.discount) + shipping) * 100) / 100;
      if (total > 9999999999.99) throw new ApiError(422, "El total supera el límite permitido.");
      const changedPayment = paymentMethod !== existing.paymentMethod || paymentStatus !== existing.paymentStatus;
      if (nextStatus !== existing.status || changedShipping || changedPayment || carrier !== existing.carrier || trackingNumber !== existing.trackingNumber || data.note) {
        const details = [
          data.note,
          nextStatus === "CANCELED" && existing.microsipIncludedAt ? "Devolución pendiente de registrar en Microsip y actualizar por Excel; no se repuso stock web." : "",
          changedShipping ? "Envío: " + (shippingQuoted ? "$" + shipping.toFixed(2) : "por cotizar") : "",
          changedPayment ? "Pago: " + paymentMethod + " / " + paymentStatus : "",
          carrier !== existing.carrier ? "Paquetería: " + (carrier || "sin asignar") : "",
          trackingNumber !== existing.trackingNumber ? "Guía: " + (trackingNumber || "sin asignar") : "",
        ].filter(Boolean).join(" · ");
        await tx.orderStatusHistory.create({ data: {
          orderId: id, from: existing.status, to: nextStatus, userId: user.id,
          note: details.slice(0,255) || null,
        } });
      }
      return tx.order.update({
        where: { id },
        data: { status: nextStatus, paymentStatus, paymentMethod, shippingQuoted, shipping, total, carrier, trackingNumber },
        include: {
          items: true, customer: true, coupon: true,
          statusHistory: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
          whatsappLogs: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
        },
      });
    });
    return ok(order);
  } catch (error) {
    return handleApiError(error);
  }
}
