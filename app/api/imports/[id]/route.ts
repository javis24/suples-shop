import { type NextRequest } from "next/server";
import { ApiError, getPagination, handleApiError, ok, paginationMeta, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    await requireUser();
    const id = parseId((await context.params).id);
    const { page, limit, skip } = getPagination(request.nextUrl.searchParams);
    const status = request.nextUrl.searchParams.get("status") as
      | "CREATED"
      | "UPDATED"
      | "SKIPPED"
      | "ERROR"
      | null;

    const batch = await prisma.importBatch.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!batch) throw new ApiError(404, "Importación no encontrada");

    const where = { importBatchId: id, status: status || undefined };
    const [rows, total] = await prisma.$transaction([
      prisma.importRow.findMany({ where, orderBy: { sourceRow: "asc" }, skip, take: limit }),
      prisma.importRow.count({ where }),
    ]);
    return ok({ batch, rows }, paginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}
