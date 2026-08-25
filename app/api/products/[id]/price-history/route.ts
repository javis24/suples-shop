import { type NextRequest } from "next/server";
import { getPagination, handleApiError, ok, paginationMeta, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    await requireUser();
    const productId = parseId((await context.params).id);
    const { page, limit, skip } = getPagination(request.nextUrl.searchParams);
    const where = { variant: { productId } };
    const [history, total] = await prisma.$transaction([
      prisma.priceHistory.findMany({
        where,
        include: {
          variant: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.priceHistory.count({ where }),
    ]);
    return ok(history, paginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}
