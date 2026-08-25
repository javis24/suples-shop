import { type NextRequest } from "next/server";
import { getPagination, handleApiError, ok, paginationMeta } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const params = request.nextUrl.searchParams;
    const { page, limit, skip } = getPagination(params);
    const q = params.get("q")?.trim();
    const lowStock = params.get("lowStock") === "true";
    const threshold = Math.max(0, Number(params.get("threshold") ?? 5) || 5);

    const where = {
      active: true,
      stock: lowStock ? { lte: threshold } : undefined,
      OR: q
        ? [
            { sku: { contains: q } },
            { microsipName: { contains: q } },
            { product: { name: { contains: q } } },
          ]
        : undefined,
    };

    const [variants, total] = await prisma.$transaction([
      prisma.productVariant.findMany({
        where,
        include: { product: { include: { category: true, brand: true } } },
        orderBy: [{ stock: "asc" }, { updatedAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.productVariant.count({ where }),
    ]);

    return ok(variants, paginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}
