import { Prisma } from "@/app/generated/prisma/client";
import { ApiError, created, handleApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  buildProductSourceKey,
  normalizeProductKey,
  parseMicrosipPriceList,
} from "@/lib/microsip-excel";
import { prisma } from "@/lib/prisma";
import { microsipSku, slugify } from "@/lib/slug";

export const runtime = "nodejs";
export const maxDuration = 600;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function productScore(
  product: {
    id: number;
    name: string;
    description: string | null;
    brandId: number | null;
    featured: boolean;
    seoTitle: string | null;
    seoDescription: string | null;
    _count: { images: number; variants: number };
  },
  productName: string,
) {
  let score = 0;

  if (normalizeProductKey(product.name) === normalizeProductKey(productName)) {
    score += 1_000;
  }

  score += product._count.images * 100;
  if (product.description) score += 50;
  if (product.seoTitle) score += 20;
  if (product.seoDescription) score += 20;
  if (product.brandId) score += 10;
  if (product.featured) score += 5;

  return score;
}

export async function POST(request: Request) {
  let batchId: number | null = null;

  try {
    const user = await requireUser(["ADMIN", "STAFF"]);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new ApiError(400, "Debes seleccionar un archivo Excel");
    }

    const parsed = await parseMicrosipPriceList(file);

    if (parsed.format !== "WEB_EXPORT") {
      throw new ApiError(
        422,
        "Este importador solamente acepta ExportacionWeb.xlsx para evitar duplicar el catálogo anterior",
      );
    }

    const snapshotAt = new Date();
    const batch = await prisma.importBatch.create({
      data: {
        fileName: file.name,
        status: "PROCESSING",
        totalRows: parsed.sourceProductRows,
        updatePrices: true,
        markupPercent: null,
        userId: user.id,
      },
    });

    batchId = batch.id;

    const result = await prisma.$transaction(
      async (tx) => {
        const rowsByProductKey = new Map<
          string,
          typeof parsed.products
        >();

        for (const row of parsed.products) {
          const group = rowsByProductKey.get(row.productKey) ?? [];
          group.push(row);
          rowsByProductKey.set(row.productKey, group);
        }

        const sourceKeys = [...new Set(parsed.products.map((row) => row.key))];
        const sourceNames = [
          ...new Set(parsed.products.map((row) => row.name)),
        ];
        const sourceSkus = [
          ...new Set(
            parsed.products
              .map((row) => row.sku)
              .filter((sku): sku is string => Boolean(sku)),
          ),
        ];
        const productKeys = [...rowsByProductKey.keys()];

        /*
         * Tanto sourceKey como importKey identifican una fila concreta del
         * ExportacionWeb. Cada SKU se administra como producto independiente.
         */
        const existingVariants = await tx.productVariant.findMany({
          where: {
            OR: [
              { sourceKey: { in: sourceKeys } },
              ...(sourceSkus.length > 0
                ? [
                    { barcode: { in: sourceSkus } },
                    { sku: { in: sourceSkus } },
                  ]
                : []),
              { microsipName: { in: sourceNames } },
            ],
          },
          include: {
            product: {
              include: {
                _count: { select: { images: true, variants: true } },
              },
            },
          },
        });

        const productsWithImportKey = await tx.product.findMany({
          where: { importKey: { in: productKeys } },
          include: {
            _count: { select: { images: true, variants: true } },
          },
        });

        type ExistingVariant = (typeof existingVariants)[number];
        type CandidateProduct = ExistingVariant["product"];

        const existingByKey = new Map<string, ExistingVariant>();
        const existingByName = new Map<string, ExistingVariant>();
        const ambiguousNames = new Set<string>();

        const registerExistingKey = (
          key: string,
          variant: ExistingVariant,
        ) => {
          const collision = existingByKey.get(key);

          if (collision && collision.id !== variant.id) {
            throw new ApiError(
              409,
              `La base de datos contiene dos variantes para la clave ${key}`,
            );
          }

          existingByKey.set(key, variant);
        };

        for (const variant of existingVariants) {
          if (variant.sourceKey) {
            registerExistingKey(variant.sourceKey, variant);
          }

          if (variant.barcode) {
            registerExistingKey(
              buildProductSourceKey(
                variant.barcode,
                variant.microsipName ?? variant.product.name,
              ),
              variant,
            );
          }

          registerExistingKey(
            buildProductSourceKey(
              variant.sku,
              variant.microsipName ?? variant.product.name,
            ),
            variant,
          );

          const nameKey = normalizeProductKey(
            variant.microsipName ?? variant.product.name,
          );
          const nameCollision = existingByName.get(nameKey);

          if (nameCollision && nameCollision.id !== variant.id) {
            existingByName.delete(nameKey);
            ambiguousNames.add(nameKey);
          } else if (!ambiguousNames.has(nameKey)) {
            existingByName.set(nameKey, variant);
          }
        }

        const findExistingVariant = (
          row: (typeof parsed.products)[number],
        ) =>
          existingByKey.get(row.key) ??
          existingByName.get(normalizeProductKey(row.name));

        const productsByImportKey = new Map(
          productsWithImportKey.map((product) => [product.importKey!, product]),
        );
        const claimedProductIds = new Map<number, string>();
        const categoryIds = new Map<string, number>();
        const importRows: Prisma.ImportRowCreateManyInput[] = [];
        const inventoryMovements: Prisma.InventoryMovementCreateManyInput[] =
          [];
        const priceHistory: Prisma.PriceHistoryCreateManyInput[] = [];
        const movedProducts = new Map<number, Set<number>>();

        let createdRows = 0;
        let updatedRows = 0;
        let unchangedPriceRows = 0;
        let archivedDuplicateProducts = 0;
        let deactivatedVariants = 0;

        const resolveCategoryId = async (categoryName: string) => {
          const cached = categoryIds.get(categoryName);
          if (cached) return cached;

          const category = await tx.category.upsert({
            where: { name: categoryName },
            update: { active: true },
            create: {
              name: categoryName,
              slug: slugify(categoryName),
              active: true,
            },
          });

          categoryIds.set(categoryName, category.id);
          return category.id;
        };

        for (const [productKey, groupRows] of rowsByProductKey) {
          const productName = groupRows[0].productName;
          const matchedVariants = [
            ...new Map(
              groupRows
                .map(findExistingVariant)
                .filter(
                  (variant): variant is ExistingVariant => Boolean(variant),
                )
                .map((variant) => [variant.id, variant]),
            ).values(),
          ];

          const candidateProducts = [
            ...new Map<number, CandidateProduct>(
              matchedVariants.map((variant) => [
                variant.product.id,
                variant.product,
              ]),
            ).values(),
          ]
            .filter((product) => {
              const claimedKey = claimedProductIds.get(product.id);
              return !claimedKey || claimedKey === productKey;
            })
            .sort((first, second) => {
              const scoreDifference =
                productScore(second, productName) -
                productScore(first, productName);

              return scoreDifference || first.id - second.id;
            });

          const existingParent =
            productsByImportKey.get(productKey) ?? candidateProducts[0];

          let parentProductId: number;

          if (existingParent) {
            parentProductId = existingParent.id;
            claimedProductIds.set(existingParent.id, productKey);

            const matchedVariant = matchedVariants.find(
              (variant) => variant.productId === existingParent.id,
            );
            const previousImportedName = matchedVariant?.microsipName;
            const legacyImportedName = Boolean(
              existingParent.importKey &&
                existingParent.importKey !== productKey &&
                normalizeProductKey(existingParent.name) ===
                  existingParent.importKey,
            );
            const nameWasImported = Boolean(
              existingParent._count.variants > 1 ||
                legacyImportedName ||
                (previousImportedName &&
                  normalizeProductKey(existingParent.name) ===
                    normalizeProductKey(previousImportedName)),
            );

            await tx.product.update({
              where: { id: existingParent.id },
              data: {
                importKey: productKey,
                // Un nombre personalizado desde el panel nunca se sobrescribe.
                // Los productos que antes estaban agrupados sí recuperan el
                // nombre completo de la fila, incluido su sabor.
                name: nameWasImported ? productName : undefined,
              },
            });
          } else {
            const categoryId = await resolveCategoryId(groupRows[0].category);
            const generatedProductCode = microsipSku(`PRODUCT:${productKey}`);
            const product = await tx.product.create({
              data: {
                importKey: productKey,
                name: productName,
                slug: `${slugify(productName)}-${generatedProductCode
                  .slice(-6)
                  .toLowerCase()}`,
                categoryId,
                status: "ACTIVE",
              },
            });

            parentProductId = product.id;
            claimedProductIds.set(product.id, productKey);
          }

          for (const row of groupRows) {
            const existing = findExistingVariant(row);

            if (existing) {
              const previousPrice = Number(existing.price);
              const previousStock = existing.stock;
              const changedParent = existing.productId !== parentProductId;

              await tx.productVariant.update({
                where: { id: existing.id },
                data: {
                  productId: parentProductId,
                  sourceKey: row.key,
                  microsipName: row.name,
                  flavor: row.flavor,
                  presentation: row.presentation,
                  price: row.price,
                  stock: row.stock,
                  active: true,
                  lastSeenAt: snapshotAt,
                },
              });

              if (previousStock !== row.stock) {
                inventoryMovements.push({
                  variantId: existing.id,
                  type: "IMPORT",
                  quantity: row.stock - previousStock,
                  previousStock,
                  newStock: row.stock,
                  reason: "Existencia actualizada desde ExportacionWeb",
                  importBatchId: batch.id,
                  userId: user.id,
                });
              }

              if (changedParent) {
                await tx.productImage.updateMany({
                  where: { variantId: existing.id },
                  data: { productId: parentProductId },
                });

                const targets =
                  movedProducts.get(existing.productId) ?? new Set<number>();
                targets.add(parentProductId);
                movedProducts.set(existing.productId, targets);
              }

              if (previousPrice !== row.price) {
                priceHistory.push({
                  variantId: existing.id,
                  previousPrice: existing.price,
                  newPrice: row.price,
                  reason: "Precio público actualizado desde Excel",
                  importBatchId: batch.id,
                  userId: user.id,
                });
              } else {
                unchangedPriceRows += 1;
              }

              importRows.push({
                importBatchId: batch.id,
                variantId: existing.id,
                sourceRow: row.sourceRow,
                status: "UPDATED",
                categoryName: row.category,
                productName: row.name,
                stock: row.stock,
                price: row.price,
                message: changedParent
                  ? "Se separó como producto independiente"
                  : previousPrice !== row.price && previousStock !== row.stock
                    ? "Se actualizaron precio y existencia"
                    : previousPrice !== row.price
                      ? "Se actualizó el precio"
                      : previousStock !== row.stock
                        ? "Se actualizó la existencia"
                        : "El producto no presentó cambios",
                sourceData: json({
                  key: row.key,
                  productKey: row.productKey,
                  productName: row.productName,
                  flavor: row.flavor,
                  presentation: row.presentation,
                  sku: row.sku,
                  name: row.name,
                  category: row.category,
                  unit: row.unit,
                  excelStock: row.stock,
                  previousPrice,
                  newPrice: row.price,
                }),
              });

              updatedRows += 1;
              continue;
            }

            const generatedSku = microsipSku(row.key);
            const createdVariant = await tx.productVariant.create({
              data: {
                productId: parentProductId,
                sku: generatedSku,
                barcode: row.sku,
                sourceKey: row.key,
                microsipName: row.name,
                flavor: row.flavor,
                presentation: row.presentation,
                unit: row.unit,
                price: row.price,
                cost: 0,
                stock: row.stock,
                lowStockAt: 1,
                active: true,
                lastSeenAt: snapshotAt,
              },
            });

            if (row.stock !== 0) {
              inventoryMovements.push({
                variantId: createdVariant.id,
                type: "IMPORT",
                quantity: row.stock,
                previousStock: 0,
                newStock: row.stock,
                reason: "Nuevo producto agregado desde ExportacionWeb",
                importBatchId: batch.id,
                userId: user.id,
              });
            }

            importRows.push({
              importBatchId: batch.id,
              variantId: createdVariant.id,
              sourceRow: row.sourceRow,
              status: "CREATED",
              categoryName: row.category,
              productName: row.name,
              stock: row.stock,
              price: row.price,
              message: "Se creó el producto independiente",
              sourceData: json({
                key: row.key,
                productKey: row.productKey,
                productName: row.productName,
                flavor: row.flavor,
                presentation: row.presentation,
                sku: row.sku,
                name: row.name,
                category: row.category,
                unit: row.unit,
                price: row.price,
                stock: row.stock,
              }),
            });

            createdRows += 1;
          }
        }

        /*
         * ExportacionWeb representa una fotografía completa del catálogo.
         * Una variante importada que ya no aparece queda agotada e inactiva,
         * pero conserva su ID para no afectar pedidos históricos.
         */
        const unseenVariants = await tx.productVariant.findMany({
          where: {
            active: true,
            sourceKey: { not: null },
            OR: [
              { lastSeenAt: null },
              { lastSeenAt: { lt: snapshotAt } },
            ],
          },
          select: { id: true, stock: true },
        });

        for (const variant of unseenVariants) {
          if (variant.stock === 0) continue;

          inventoryMovements.push({
            variantId: variant.id,
            type: "IMPORT",
            quantity: -variant.stock,
            previousStock: variant.stock,
            newStock: 0,
            reason: "Variante ausente en el último ExportacionWeb",
            importBatchId: batch.id,
            userId: user.id,
          });
        }

        if (unseenVariants.length > 0) {
          await tx.productVariant.updateMany({
            where: { id: { in: unseenVariants.map((variant) => variant.id) } },
            data: { stock: 0, active: false },
          });
          deactivatedVariants = unseenVariants.length;
        }

        /*
         * Si un producto agrupado queda sin variantes, conservamos sus datos
         * históricos, movemos sus imágenes generales a uno de los productos
         * separados y finalmente lo archivamos.
         */
        for (const [oldProductId, targetProductIds] of movedProducts) {
          const remainingVariants = await tx.productVariant.count({
            where: { productId: oldProductId },
          });

          if (remainingVariants > 0) continue;

          const targetProductId = targetProductIds.values().next().value;

          if (!targetProductId) continue;

          await tx.productImage.updateMany({
            where: { productId: oldProductId, variantId: null },
            data: {
              productId: targetProductId,
              primary: false,
            },
          });

          await tx.product.update({
            where: { id: oldProductId },
            data: {
              importKey: null,
              status: "ARCHIVED",
            },
          });

          archivedDuplicateProducts += 1;
        }

        for (const skipped of parsed.skippedRows) {
          importRows.push({
            importBatchId: batch.id,
            sourceRow: skipped.sourceRow,
            status: "SKIPPED",
            categoryName: skipped.category,
            productName: skipped.name || null,
            stock: skipped.stock,
            price: skipped.price,
            message: skipped.message,
            sourceData: json(skipped),
          });
        }

        for (const duplicate of parsed.duplicateRows) {
          importRows.push({
            importBatchId: batch.id,
            sourceRow: duplicate.sourceRow,
            status: "SKIPPED",
            categoryName: duplicate.category,
            productName: duplicate.name,
            stock: duplicate.stock,
            price: duplicate.price,
            message: duplicate.message,
            sourceData: json(duplicate),
          });
        }

        if (importRows.length > 0) {
          await tx.importRow.createMany({ data: importRows });
        }

        if (inventoryMovements.length > 0) {
          await tx.inventoryMovement.createMany({
            data: inventoryMovements,
          });
        }

        if (priceHistory.length > 0) {
          await tx.priceHistory.createMany({ data: priceHistory });
        }

        const skippedRows =
          parsed.skippedRows.length + parsed.duplicateRows.length;
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: "COMPLETED",
            createdRows,
            updatedRows,
            skippedRows,
            errorRows: 0,
            finishedAt: new Date(),
          },
        });

        return {
          totalRows: parsed.sourceProductRows,
          processedRows: parsed.products.length,
          createdRows,
          updatedRows,
          unchangedPriceRows,
          skippedRows,
          duplicateRows: parsed.duplicateRows.length,
          groupedProducts: 0,
          groupedVariants: 0,
          archivedDuplicateProducts,
          deactivatedVariants,
          errorRows: 0,
        };
      },
      {
        maxWait: 20_000,
        timeout: 600_000,
      },
    );

    return created({
      batchId: batch.id,
      fileName: file.name,
      sheet: parsed.sheetName,
      format: parsed.format,
      ...result,
    });
  } catch (error) {
    if (batchId) {
      await prisma.importBatch
        .update({
          where: { id: batchId },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }

    return handleApiError(error);
  }
}
