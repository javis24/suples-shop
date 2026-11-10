import { type NextRequest } from "next/server";
import { created, getPagination, handleApiError, ok, paginationMeta } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkoutSchema } from "@/lib/checkout-policy";
import { createCheckoutOrder, publicCheckoutOrder } from "@/lib/checkout-service";
import { storeWhatsAppConfig } from "@/lib/order-whatsapp";
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

    const paymentStatus = params.get("paymentStatus") as
      | "PENDING"
      | "PAID"
      | "FAILED"
      | "REFUNDED"
      | null;

    const where = {
      status: status || undefined,
      paymentStatus: paymentStatus || undefined,
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
    const data = checkoutSchema.parse(await request.json());
    const config = storeWhatsAppConfig();
    const order = await createCheckoutOrder(prisma, data, config);
    const response = created(publicCheckoutOrder(order, config));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
