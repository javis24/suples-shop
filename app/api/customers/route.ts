import { type NextRequest } from "next/server";
import { created, getPagination, handleApiError, ok, paginationMeta } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { customerSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const params = request.nextUrl.searchParams;
    const { page, limit, skip } = getPagination(params);
    const q = params.get("q")?.trim();
    const where = q
      ? {
          OR: [
            { firstName: { contains: q } },
            { lastName: { contains: q } },
            { email: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : undefined;

    const [customers, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        include: { _count: { select: { orders: true, addresses: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);
    return ok(customers, paginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const data = customerSchema.parse(await request.json());
    const customer = await prisma.customer.create({
      data: {
        ...data,
        email: data.email?.toLowerCase() || null,
        phone: data.phone || null,
      },
    });
    return created(customer);
  } catch (error) {
    return handleApiError(error);
  }
}
