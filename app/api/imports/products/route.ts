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
        const sourceKeys = parsed.products.map((product) => product.key);
        const sourceNames = parsed.products.map((product) => product.name);
        const sourceSkus = parsed.products
          .map((product) => product.sku)
          .filter((sku): sku is string => Boolean(sku));

        /*
         * sourceKey es la identidad permanente de la fila:
         * SKU:<código de la columna A> o NAME:<nombre normalizado>.
         * barcode y sku sirven como respaldo para enlazar productos creados
         * manualmente sin generar un duplicado.
         */
        const existingVariants = await tx.productVariant.findMany({
          where: {
            OR: [
              {
                sourceKey: {
                  in: sourceKeys,
                },
              },
              ...(sourceSkus.length > 0
                ? [
                    {
                      barcode: {
                        in: sourceSkus,
                      },
                    },
                    {
                      sku: {
                        in: sourceSkus,
                      },
                    },
                  ]
                : []),
              {
                microsipName: {
                  in: sourceNames,
                },
              },
            ],
          },
          include: {
            product: true,
          },
        });

        const existingByKey = new Map<
          string,
          (typeof existingVariants)[number]
        >();
        const existingByName = new Map<
          string,
          (typeof existingVariants)[number]
        >();

        const registerExistingKey = (
          key: string,
          variant: (typeof existingVariants)[number],
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
            throw new ApiError(
              409,
              `La base de datos contiene dos variantes para el producto ${variant.product.name}`,
            );
          }

          existingByName.set(nameKey, variant);
        }

        const categoryIds = new Map<string, number>();
        const importRows: Prisma.ImportRowCreateManyInput[] = [];
        const inventoryMovements: Prisma.InventoryMovementCreateManyInput[] =
          [];
        const priceHistory: Prisma.PriceHistoryCreateManyInput[] = [];

        let createdRows = 0;
        let updatedRows = 0;
        let unchangedPriceRows = 0;

        for (const row of parsed.products) {
          const existing =
            existingByKey.get(row.key) ??
            existingByName.get(normalizeProductKey(row.name));

          if (existing) {
            const previousPrice = Number(existing.price);

            // Para productos existentes solamente se cambia el precio.
            // sourceKey y lastSeenAt son metadatos internos de importación.
            await tx.productVariant.update({
              where: {
                id: existing.id,
              },
              data: {
                sourceKey: row.key,
                price: row.price,
                lastSeenAt: snapshotAt,
              },
            });

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
              message:
                previousPrice === row.price
                  ? "El precio no presentó cambios"
                  : "Se actualizó únicamente el precio",
              sourceData: json({
                key: row.key,
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

          let categoryId = categoryIds.get(row.category);

          if (!categoryId) {
            const category = await tx.category.upsert({
              where: {
                name: row.category,
              },
              update: {
                active: true,
              },
              create: {
                name: row.category,
                slug: slugify(row.category),
                active: true,
              },
            });

            categoryId = category.id;
            categoryIds.set(row.category, category.id);
          }

          const generatedSku = microsipSku(row.key);
          const slug = `${slugify(row.name)}-${generatedSku
            .slice(-6)
            .toLowerCase()}`;

          const createdProduct = await tx.product.create({
            data: {
              name: row.name,
              slug,
              categoryId,
              status: "ACTIVE",
            },
          });

          const createdVariant = await tx.productVariant.create({
            data: {
              productId: createdProduct.id,
              sku: generatedSku,
              barcode: row.sku,
              sourceKey: row.key,
              microsipName: row.name,
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
              reason: "Producto nuevo agregado desde ExportacionWeb",
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
            sourceData: json({
              key: row.key,
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
          await tx.importRow.createMany({
            data: importRows,
          });
        }

        if (inventoryMovements.length > 0) {
          await tx.inventoryMovement.createMany({
            data: inventoryMovements,
          });
        }

        if (priceHistory.length > 0) {
          await tx.priceHistory.createMany({
            data: priceHistory,
          });
        }

        const skippedRows =
          parsed.skippedRows.length + parsed.duplicateRows.length;

        await tx.importBatch.update({
          where: {
            id: batch.id,
          },
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
          where: {
            id: batchId,
          },
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
