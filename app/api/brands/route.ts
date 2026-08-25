import { type NextRequest } from "next/server";
import { created, handleApiError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { brandSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const includeInactive = request.nextUrl.searchParams.get("all") === "true";
    if (includeInactive) await requireUser();

    const brands = await prisma.brand.findMany({
      where: includeInactive ? undefined : { active: true },
      include: { _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    });
    return ok(brands);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser(["ADMIN", "STAFF"]);
    const data = brandSchema.parse(await request.json());
    const brand = await prisma.brand.create({
      data: {
        ...data,
        slug: slugify(data.slug || data.name),
        logoUrl: data.logoUrl || null,
      },
    });
    return created(brand);
  } catch (error) {
    return handleApiError(error);
  }
}
