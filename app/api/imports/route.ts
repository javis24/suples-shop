import { type NextRequest } from "next/server";
import { getPagination, handleApiError, ok, paginationMeta } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const { page, limit, skip } = getPagination(request.nextUrl.searchParams);
    const [imports, total] = await prisma.$transaction([
      prisma.importBatch.findMany({
        include: {
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { rows: true } },
        },
        orderBy: { startedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.importBatch.count(),
    ]);
    return ok(imports, paginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}
