import { type NextRequest } from "next/server";
import { ApiError, created, getPagination, handleApiError, ok, paginationMeta } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { couponSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const { page, limit, skip } = getPagination(request.nextUrl.searchParams);
    const [coupons, total] = await prisma.$transaction([
      prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.coupon.count(),
    ]);
    return ok(coupons, paginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser(["ADMIN", "STAFF"]);
    const data = couponSchema.parse(await request.json());
    if (data.type === "PERCENTAGE" && data.value > 100) {
      throw new ApiError(422, "El descuento porcentual no puede superar 100%");
    }
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
      throw new ApiError(422, "La fecha final debe ser posterior a la inicial");
    }
    const coupon = await prisma.coupon.create({ data });
    return created(coupon);
  } catch (error) {
    return handleApiError(error);
  }
}
