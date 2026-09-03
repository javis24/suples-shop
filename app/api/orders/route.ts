import { type NextRequest } from "next/server";
import { ApiError, created, getPagination, handleApiError, ok, paginationMeta } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orderNumber } from "@/lib/slug";
import { orderSchema } from "@/lib/validators";
import { createMercadoPagoPreference } from "@/lib/mercado-pago";
import { Prisma } from "@/app/generated/prisma/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const params = request.nextUrl.searchParams;
    const { page, limit, skip } = getPagination(params);
    const q = params.get("q")?.trim();
    const status = params.get("status") as
      | "PENDING"
      | "CONFIRMED"
      | "PREPARING"
      | "SHIPPED"
      | "DELIVERED"
      | "CANCELED"
      | null;

    const where = {
      status: status || undefined,
      OR: q
        ? [
            { orderNumber: { contains: q } },
            { customerName: { contains: q } },
            { customerEmail: { contains: q } },
            { customerPhone: { contains: q } },
          ]
        : undefined,
    };

    const orders = await prisma.order.findMany({
      where,
      include: { items: true, customer: true, coupon: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });
    const total = await prisma.order.count({ where });
    return ok(orders, paginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const data = orderSchema.parse(await request.json());

    const order = await prisma.$transaction(
      async (tx) => {
        const variantIds = [...new Set(data.items.map((item) => item.variantId))];
        const variants = await tx.productVariant.findMany({
          where: { id: { in: variantIds }, active: true },
          include: { product: true },
        });

        if (variants.length !== variantIds.length) {
          throw new ApiError(409, "Uno o más productos ya no están disponibles");
        }

        const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
        const lines = data.items.map((item) => {
          const variant = variantMap.get(item.variantId);
          if (!variant || variant.product.status !== "ACTIVE") {
            throw new ApiError(409, "Uno o más productos están inactivos");
          }
          if (variant.stock < item.quantity) {
            throw new ApiError(409, `Existencia insuficiente para ${variant.product.name}`);
          }
          const unitPrice = Number(variant.price);
          return { item, variant, unitPrice, lineTotal: unitPrice * item.quantity };
        });

        const subtotal = Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;
        let coupon = null;
        let discount = 0;

        if (data.couponCode) {
          coupon = await tx.coupon.findUnique({
            where: { code: data.couponCode.toUpperCase() },
          });
          const now = new Date();
          if (
            !coupon ||
            !coupon.active ||
            (coupon.startsAt && coupon.startsAt > now) ||
            (coupon.endsAt && coupon.endsAt < now) ||
            (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit)
          ) {
            throw new ApiError(409, "El cupón no está disponible");
          }
          if (coupon.minimumAmount && subtotal < Number(coupon.minimumAmount)) {
            throw new ApiError(409, `El cupón requiere una compra mínima de $${coupon.minimumAmount}`);
          }

          discount =
            coupon.type === "PERCENTAGE"
              ? subtotal * (Number(coupon.value) / 100)
              : Number(coupon.value);
          if (coupon.maximumDiscount) {
            discount = Math.min(discount, Number(coupon.maximumDiscount));
          }
          discount = Math.min(subtotal, Math.round(discount * 100) / 100);
        }

        const shipping = data.shipping ?? 0;
        const total = Math.max(0, Math.round((subtotal - discount + shipping) * 100) / 100);
        let customerId = data.customerId || null;

        if (customerId) {
          const customerExists = await tx.customer.count({ where: { id: customerId, active: true } });
          if (!customerExists) throw new ApiError(404, "Cliente no encontrado");
        } else if (data.customerEmail) {
          const [firstName, ...lastNameParts] = data.customerName.split(/\s+/);
          const customer = await tx.customer.upsert({
            where: { email: data.customerEmail.toLowerCase() },
            update: { phone: data.customerPhone || undefined, active: true },
            create: {
              firstName,
              lastName: lastNameParts.join(" ") || "Sin apellido",
              email: data.customerEmail.toLowerCase(),
              phone: data.customerPhone || null,
            },
          });
          customerId = customer.id;
        }

        const createdOrder = await tx.order.create({
          data: {
            orderNumber: orderNumber(),
            customerId,
            couponId: coupon?.id ?? null,
            paymentMethod: data.paymentMethod,
            paymentProvider: data.paymentMethod === "ONLINE" ? "MERCADO_PAGO" : null,
            subtotal,
            discount,
            shipping,
            total,
            customerName: data.customerName,
            customerEmail: data.customerEmail?.toLowerCase() || null,
            customerPhone: data.customerPhone || null,
            shippingAddress: data.shippingAddress as Prisma.InputJsonValue,
            notes: data.notes || null,
            items: {
              create: lines.map(({ item, variant, unitPrice, lineTotal }) => ({
                variantId: variant.id,
                sku: variant.sku,
                productName: variant.product.name,
                variantName: [variant.presentation, variant.flavor].filter(Boolean).join(" · ") || null,
                quantity: item.quantity,
                unitPrice,
                lineTotal,
              })),
            },
            statusHistory: { create: { to: "PENDING", note: "Pedido creado" } },
          },
        });

        for (const { item, variant } of lines) {
          const updated = await tx.productVariant.updateMany({
            where: { id: variant.id, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (updated.count !== 1) {
            throw new ApiError(409, `La existencia de ${variant.product.name} cambió; intenta nuevamente`);
          }
          const current = await tx.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
          await tx.inventoryMovement.create({
            data: {
              variantId: variant.id,
              type: "SALE",
              quantity: -item.quantity,
              previousStock: current.stock + item.quantity,
              newStock: current.stock,
              reason: "Pedido en tienda en línea",
              reference: createdOrder.orderNumber,
              orderId: createdOrder.id,
            },
          });
        }

        if (coupon) {
          await tx.coupon.update({
            where: { id: coupon.id },
            data: { usageCount: { increment: 1 } },
          });
        }

        return tx.order.findUniqueOrThrow({
          where: { id: createdOrder.id },
          include: { items: true, customer: true, coupon: true, statusHistory: true },
        });
      },
      { maxWait: 20_000, timeout: 30_000 },
    );

    let checkoutUrl: string | null = null;
    let paymentError: string | null = null;

    if (data.paymentMethod === "ONLINE") {
      try {
        const payment = await createMercadoPagoPreference(
          order,
          new URL(request.url).origin,
        );
        checkoutUrl = payment.checkoutUrl;
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentPreferenceId: payment.preferenceId },
        });
      } catch (error) {
        console.error("No fue posible crear la preferencia de Mercado Pago", error);
        paymentError =
          "El pedido se guardó, pero no fue posible abrir el pago en línea. Puedes enviarlo por WhatsApp para recibir ayuda.";
      }
    }

    return created({ ...order, checkoutUrl, paymentError });
  } catch (error) {
    return handleApiError(error);
  }
}
