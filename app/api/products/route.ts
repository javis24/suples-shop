import { type NextRequest } from "next/server";
import {
  created,
  getPagination,
  handleApiError,
  ok,
  paginationMeta,
} from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { productSchema } from "@/lib/validators";

export const runtime = "nodejs";

const productInclude = {
  category: true,
  brand: true,
  variants: { orderBy: { id: "asc" as const } },
  images: { orderBy: [{ primary: "desc" as const }, { sortOrder: "asc" as const }] },
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = getPagination(searchParams);
    const q = searchParams.get("q")?.trim().slice(0, 100);
    const category = searchParams.get("category")?.trim();
    const brand = searchParams.get("brand")?.trim();
    const includeAll = searchParams.get("all") === "true";
    const status = searchParams.get("status")?.trim();
    const lowStock = searchParams.get("lowStock") === "true";
    const lowStockAt = Math.max(0, Number(searchParams.get("lowStockAt") ?? 5) || 5);

    if (includeAll) await requireUser();

    const adminStatus =
      includeAll && ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"].includes(status ?? "")
        ? (status as "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED")
        : undefined;

        const variantMatches = q
  ? await prisma.productVariant.findMany({
      where: {
        active: includeAll ? undefined : true,
        OR: [
          { sku: { contains: q } },
          { barcode: { contains: q } },
          { microsipName: { contains: q } },
        ],
          },
          select: { productId: true },
          distinct: ["productId"],
        })
      : [];

    const variantProductIds = variantMatches.map(
      (variant) => variant.productId,
    );

    const where = {
      status: includeAll ? adminStatus : ("ACTIVE" as const),
      category: category ? { slug: category } : undefined,
      brand: brand ? { slug: brand } : undefined,
      OR: q
  ? [
      { name: { contains: q } },
      { description: { contains: q } },
      ...(variantProductIds.length > 0
        ? [{ id: { in: variantProductIds } }]
        : []),
    ]
  : undefined,
      variants: lowStock
        ? { some: { active: true, stock: { lte: lowStockAt } } }
        : includeAll
          ? undefined
          : { some: { active: true } },
    };

    // Son consultas de lectura independientes. Ejecutarlas sin transacción
    // evita competir por una conexión transaccional en pools remotos pequeños.
    const products = await prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: [{ featured: "desc" }, { updatedAt: "desc" }],
      skip,
      take: limit,
    });
    const total = await prisma.product.count({ where });

    return ok(products, paginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser(["ADMIN", "STAFF"]);
    const data = productSchema.parse(await request.json());

    const product = await prisma.product.create({
      data: {
        name: data.name,
        slug: slugify(data.slug || data.name),
        description: data.description || null,
        categoryId: data.categoryId,
        brandId: data.brandId || null,
        status: data.status ?? "ACTIVE",
        featured: data.featured ?? false,
        seoTitle: data.seoTitle || null,
        seoDescription: data.seoDescription || null,
        variants: {
          create: data.variants.map((variant) => ({
            ...variant,
            barcode: variant.barcode || null,
            microsipName: variant.microsipName || null,
            flavor: variant.flavor || null,
            presentation: variant.presentation || null,
            unit: variant.unit ?? "Pieza",
            stock: variant.stock ?? 0,
            lowStockAt: variant.lowStockAt ?? 5,
            active: variant.active ?? true,
          })),
        },
        images: data.images
          ? {
              create: data.images.map((image, index) => ({
                ...image,
                alt: image.alt || null,
                sortOrder: index,
                primary:
                  index ===
                  Math.max(
                    0,
                    data.images?.findIndex((item) => item.primary) ?? -1,
                  ),
              })),
            }
          : undefined,
      },
      include: productInclude,
    });

    return created(product);
  } catch (error) {
    return handleApiError(error);
  }
}
