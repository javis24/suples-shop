import { type NextRequest } from "next/server";
import { ApiError, handleApiError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase();
    const subtotal = Number(request.nextUrl.searchParams.get("subtotal") ?? 0);
    if (!code) throw new ApiError(400, "Falta el código del cupón");

    const coupon = await prisma.coupon.findUnique({ where: { code } });
    const now = new Date();
    if (
      !coupon ||
      !coupon.active ||
      (coupon.startsAt && coupon.startsAt > now) ||
      (coupon.endsAt && coupon.endsAt < now) ||
      (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit)
    ) {
      throw new ApiError(404, "Cupón no disponible");
    }
    if (coupon.minimumAmount && subtotal < Number(coupon.minimumAmount)) {
      throw new ApiError(409, `Compra mínima: $${coupon.minimumAmount}`);
    }
    return ok({
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value),
      maximumDiscount: coupon.maximumDiscount ? Number(coupon.maximumDiscount) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
