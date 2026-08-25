import { type NextRequest } from "next/server";
import { getPagination, handleApiError, ok, paginationMeta } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const params = request.nextUrl.searchParams;
    const { page, limit, skip } = getPagination(params);
    const variantId = Number(params.get("variantId"));

    const where = Number.isInteger(variantId) && variantId > 0 ? { variantId } : undefined;
    const [movements, total] = await prisma.$transaction([
      prisma.inventoryMovement.findMany({
        where,
        include: {
          variant: { include: { product: true } },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    return ok(movements, paginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}
