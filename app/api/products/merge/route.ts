import { z } from "zod";

import { ApiError, handleApiError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  normalizeProductKey,
  resolveVariantIdentity,
} from "@/lib/microsip-excel";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const mergeSchema = z.object({
  productIds: z.array(z.number().int().positive()).min(2).max(20),
});

function preservationScore(product: {
  id: number;
  brandId: number | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  featured: boolean;
  images: { id: number }[];
}) {
  return (
    product.images.length * 100 +
    (product.description ? 50 : 0) +
    (product.seoTitle ? 20 : 0) +
    (product.seoDescription ? 20 : 0) +
    (product.brandId ? 10 : 0) +
    (product.featured ? 5 : 0) -
    product.id / 1_000_000
  );
}

export async function POST(request: Request) {
  try {
    await requireUser(["ADMIN"]);
    const input = mergeSchema.parse(await request.json());
    const productIds = [...new Set(input.productIds)];

    if (productIds.length < 2) {
      throw new ApiError(422, "Selecciona al menos dos productos diferentes");
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          include: {
            category: true,
            images: { orderBy: [{ primary: "desc" }, { sortOrder: "asc" }] },
            variants: { orderBy: { id: "asc" } },
          },
        });

        if (products.length !== productIds.length) {
          throw new ApiError(404, "Uno de los productos seleccionados ya no existe");
        }

        if (new Set(products.map((product) => product.categoryId)).size !== 1) {
          throw new ApiError(
            422,
            "Solo se pueden combinar productos de la misma categoría",
          );
        }

        const identities = products.flatMap((product) =>
          product.variants.map((variant) =>
            resolveVariantIdentity(
              variant.microsipName ?? product.name,
              product.category.name,
            ),
          ),
        );

        if (identities.some((identity) => !identity)) {
          throw new ApiError(
            422,
            "No fue posible reconocer el sabor o la presentación de todos los productos",
          );
        }

        const families = new Map(
          identities.map((identity) => [identity!.productKey, identity!]),
        );

        if (families.size !== 1) {
          throw new ApiError(
            422,
            "Los productos seleccionados no pertenecen a la misma familia",
            products.map((product) => product.name),
          );
        }

        const family = [...families.values()][0];
        const collision = await tx.product.findUnique({
          where: { importKey: family.productKey },
          select: { id: true },
        });

        if (collision && !productIds.includes(collision.id)) {
          throw new ApiError(
            409,
            "Ya existe otro producto principal para esta familia",
          );
        }

        const [target, ...sources] = [...products].sort(
          (first, second) =>
            preservationScore(second) - preservationScore(first),
        );
        const sourceIds = sources.map((product) => product.id);
        const allVariants = products.flatMap((product) => product.variants);
        const sourceVariants = sources.flatMap((product) => product.variants);
        const sourceImageCount = sources.reduce(
          (total, product) => total + product.images.length,
          0,
        );

        // Liberamos primero las claves únicas de los productos duplicados.
        await tx.product.updateMany({
          where: { id: { in: sourceIds } },
          data: { importKey: null },
        });

        await tx.product.update({
          where: { id: target.id },
          data: {
            importKey: family.productKey,
            name: family.productName,
            status: "ACTIVE",
          },
        });

        // También completamos sabor y presentación en las variantes que ya
        // pertenecían al producto conservado.
        for (const variant of allVariants) {
          const identity = resolveVariantIdentity(
            variant.microsipName ?? family.productName,
            target.category.name,
          );

          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              productId: target.id,
              flavor: identity?.flavor ?? variant.flavor,
              presentation: identity?.presentation ?? variant.presentation,
            },
          });
        }

        await tx.productImage.updateMany({
          where: { productId: { in: sourceIds } },
          data: { productId: target.id, primary: false },
        });

        const primaryImage = await tx.productImage.findFirst({
          where: { productId: target.id, primary: true },
          select: { id: true },
        });

        if (!primaryImage) {
          const firstImage = await tx.productImage.findFirst({
            where: { productId: target.id },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: { id: true },
          });

          if (firstImage) {
            await tx.productImage.update({
              where: { id: firstImage.id },
              data: { primary: true },
            });
          }
        }

        await tx.product.updateMany({
          where: { id: { in: sourceIds } },
          data: { importKey: null, status: "ARCHIVED" },
        });

        return {
          productId: target.id,
          productName: family.productName,
          importKey: normalizeProductKey(family.productName),
          movedVariants: sourceVariants.length,
          movedImages: sourceImageCount,
          archivedProducts: sourceIds.length,
        };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );

    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
