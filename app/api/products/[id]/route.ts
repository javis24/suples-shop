import { ApiError, handleApiError, ok, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { productUpdateSchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

const productInclude = {
  category: true,
  brand: true,
  variants: { orderBy: { id: "asc" as const } },
  images: { orderBy: [{ primary: "desc" as const }, { sortOrder: "asc" as const }] },
};

export async function GET(_request: Request, context: Context) {
  try {
    const id = parseId((await context.params).id);
    const product = await prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) throw new ApiError(404, "Producto no encontrado");
    return ok(product);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser(["ADMIN", "STAFF"]);
    const id = parseId((await context.params).id);
    const data = productUpdateSchema.parse(await request.json());

    const product = await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { id },
        include: { variants: true },
      });
      if (!existing) throw new ApiError(404, "Producto no encontrado");

      await tx.product.update({
        where: { id },
        data: {
          name: data.name,
          slug: data.slug ? slugify(data.slug) : undefined,
          description: data.description === "" ? null : data.description,
          categoryId: data.categoryId,
          brandId: data.brandId === undefined ? undefined : data.brandId || null,
          status: data.status,
          featured: data.featured,
          seoTitle: data.seoTitle === "" ? null : data.seoTitle,
          seoDescription: data.seoDescription === "" ? null : data.seoDescription,
        },
      });

      for (const variant of data.variants ?? []) {
        if (variant.id) {
          const previous = existing.variants.find((item) => item.id === variant.id);
          if (!previous) throw new ApiError(400, "Una variante no pertenece al producto");

          const newStock = variant.stock ?? previous.stock;
          const newPrice = variant.price ?? Number(previous.price);

          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              sku: variant.sku,
              barcode:
                variant.barcode === undefined ? undefined : variant.barcode || null,
              microsipName:
                variant.microsipName === undefined
                  ? undefined
                  : variant.microsipName || null,
              flavor:
                variant.flavor === undefined ? undefined : variant.flavor || null,
              presentation:
                variant.presentation === undefined
                  ? undefined
                  : variant.presentation || null,
              unit: variant.unit,
              cost: variant.cost,
              price: variant.price,
              compareAtPrice: variant.compareAtPrice,
              stock: variant.stock,
              lowStockAt: variant.lowStockAt,
              active: variant.active,
            },
          });

          if (newStock !== previous.stock) {
            await tx.inventoryMovement.create({
              data: {
                variantId: variant.id,
                type: "ADJUSTMENT",
                quantity: newStock - previous.stock,
                previousStock: previous.stock,
                newStock,
                reason: "Actualización desde el dashboard",
                userId: user.id,
              },
            });
          }

          if (newPrice !== Number(previous.price)) {
            await tx.priceHistory.create({
              data: {
                variantId: variant.id,
                previousPrice: previous.price,
                newPrice,
                reason: "Actualización desde el dashboard",
                userId: user.id,
              },
            });
          }
        } else {
          await tx.productVariant.create({
            data: {
              productId: id,
              sku: variant.sku,
              barcode: variant.barcode || null,
              microsipName: variant.microsipName || null,
              flavor: variant.flavor || null,
              presentation: variant.presentation || null,
              unit: variant.unit ?? "Pieza",
              cost: variant.cost,
              price: variant.price,
              compareAtPrice: variant.compareAtPrice,
              stock: variant.stock ?? 0,
              lowStockAt: variant.lowStockAt ?? 5,
              active: variant.active ?? true,
            },
          });
        }
      }

      if (data.images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        if (data.images.length > 0) {
          await tx.productImage.createMany({
            data: data.images.map((image, index) => ({
              productId: id,
              url: image.url,
              alt: image.alt || null,
              sortOrder: index,
              primary:
                index ===
                Math.max(
                  0,
                  data.images?.findIndex((item) => item.primary) ?? -1,
                ),
            })),
          });
        }
      }

      return tx.product.findUniqueOrThrow({
        where: { id },
        include: productInclude,
      });
    });

    return ok(product);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    await requireUser(["ADMIN"]);
    const id = parseId((await context.params).id);
    const product = await prisma.product.update({
      where: { id },
      data: {
        status: "ARCHIVED",
        variants: { updateMany: { where: {}, data: { active: false } } },
      },
    });
    return ok({ id: product.id, archived: true });
  } catch (error) {
    return handleApiError(error);
  }
}
