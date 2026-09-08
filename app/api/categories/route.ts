import { type NextRequest } from "next/server";
import { created, handleApiError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { categorySchema } from "@/lib/validators";

export const runtime = "nodejs";

const RESTRICTED_PUBLIC_CATEGORY_TERMS = [
  "ANABOL",
  "FARMACIA",
  "BETHA",
  "TRT",
  "HORMONA",
  "SARM",
  "PEPT",
] as const;

export async function GET(request: NextRequest) {
  try {
    const includeInactive = request.nextUrl.searchParams.get("all") === "true";
    if (includeInactive) await requireUser();

    const publicProductWhere = {
      status: "ACTIVE" as const,
      variants: { some: { active: true } },
    };

    const categories = await prisma.category.findMany({
      where: includeInactive
        ? undefined
        : {
            active: true,
            NOT: RESTRICTED_PUBLIC_CATEGORY_TERMS.map((term) => ({
              name: { contains: term },
            })),
            products: { some: publicProductWhere },
          },
      include: {
        _count: {
          select: {
            products: includeInactive ? true : { where: publicProductWhere },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return ok(categories);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser(["ADMIN", "STAFF"]);
    const data = categorySchema.parse(await request.json());
    const category = await prisma.category.create({
      data: {
        ...data,
        slug: slugify(data.slug || data.name),
        description: data.description || null,
      },
    });
    return created(category);
  } catch (error) {
    return handleApiError(error);
  }
}
