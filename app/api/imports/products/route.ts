import { ApiError, created, handleApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { parseMicrosipInventory } from "@/lib/microsip-excel";
import { prisma } from "@/lib/prisma";
import { microsipSku, slugify } from "@/lib/slug";

export const runtime = "nodejs";
export const maxDuration = 120;

function salePrice(cost: number, markupPercent: number) {
  return Math.round(cost * (1 + markupPercent / 100) * 100) / 100;
}

export async function POST(request: Request) {
  let batchId: number | null = null;

  try {
    const user = await requireUser(["ADMIN", "STAFF"]);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Debes seleccionar un archivo Excel");

    const updatePrices = formData.get("updatePrices") === "true";
    const defaultMarkup = Number(process.env.DEFAULT_MARKUP_PERCENT ?? 35);
    const markupPercent = Number(formData.get("markupPercent") ?? defaultMarkup);
    if (!Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent > 1000) {
      throw new ApiError(422, "El porcentaje de utilidad no es válido");
    }

    const parsed = await parseMicrosipInventory(file);
    const batch = await prisma.importBatch.create({
      data: {
        fileName: file.name,
        totalRows: parsed.products.length,
        updatePrices,
        markupPercent,
        userId: user.id,
      },
    });
    batchId = batch.id;

    const result = await prisma.$transaction(
      async (tx) => {
        const counters = { created: 0, updated: 0, skipped: 0, errors: 0 };
        const categoryIds = new Map<string, number>();

        for (const row of parsed.products) {
          try {
            let categoryId = categoryIds.get(row.category);
            if (!categoryId) {
              const category = await tx.category.upsert({
                where: { name: row.category },
                update: { active: true },
                create: {
                  name: row.category,
                  slug: slugify(row.category),
                  active: true,
                },
              });
              categoryId = category.id;
              categoryIds.set(row.category, category.id);
            }

            const existing = await tx.productVariant.findUnique({
              where: { microsipName: row.name },
              include: { product: true },
            });

            if (existing) {
              const nextPrice = updatePrices
                ? salePrice(row.cost, markupPercent)
                : Number(existing.price);

              await tx.product.update({
                where: { id: existing.productId },
                data: { categoryId, status: "ACTIVE" },
              });
              await tx.productVariant.update({
                where: { id: existing.id },
                data: {
                  unit: row.unit,
                  cost: row.cost,
                  price: nextPrice,
                  stock: row.stock,
                  active: true,
                },
              });

              if (existing.stock !== row.stock) {
                await tx.inventoryMovement.create({
                  data: {
                    variantId: existing.id,
                    type: "IMPORT",
                    quantity: row.stock - existing.stock,
                    previousStock: existing.stock,
                    newStock: row.stock,
                    reason: "Importación de existencia de Microsip",
                    importBatchId: batch.id,
                    userId: user.id,
                  },
                });
              }

              if (nextPrice !== Number(existing.price)) {
                await tx.priceHistory.create({
                  data: {
                    variantId: existing.id,
                    previousPrice: existing.price,
                    newPrice: nextPrice,
                    reason: `Costo + ${markupPercent}% de utilidad`,
                    importBatchId: batch.id,
                    userId: user.id,
                  },
                });
              }

              await tx.importRow.create({
                data: {
                  importBatchId: batch.id,
                  variantId: existing.id,
                  sourceRow: row.sourceRow,
                  status: "UPDATED",
                  categoryName: row.category,
                  productName: row.name,
                  stock: row.stock,
                  cost: row.cost,
                  sourceData: row,
                },
              });
              counters.updated += 1;
            } else {
              const sku = microsipSku(row.name);
              const uniqueSlug = `${slugify(row.name)}-${sku.slice(-6).toLowerCase()}`;
              const product = await tx.product.create({
                data: {
                  name: row.name,
                  slug: uniqueSlug,
                  categoryId,
                  status: "ACTIVE",
                  variants: {
                    create: {
                      sku,
                      microsipName: row.name,
                      unit: row.unit,
                      cost: row.cost,
                      price: salePrice(row.cost, markupPercent),
                      stock: row.stock,
                      active: true,
                    },
                  },
                },
                include: { variants: true },
              });
              const variant = product.variants[0];

              if (row.stock > 0) {
                await tx.inventoryMovement.create({
                  data: {
                    variantId: variant.id,
                    type: "IMPORT",
                    quantity: row.stock,
                    previousStock: 0,
                    newStock: row.stock,
                    reason: "Carga inicial desde Microsip",
                    importBatchId: batch.id,
                    userId: user.id,
                  },
                });
              }

              await tx.importRow.create({
                data: {
                  importBatchId: batch.id,
                  variantId: variant.id,
                  sourceRow: row.sourceRow,
                  status: "CREATED",
                  categoryName: row.category,
                  productName: row.name,
                  stock: row.stock,
                  cost: row.cost,
                  sourceData: row,
                },
              });
              counters.created += 1;
            }
          } catch (rowError) {
            counters.errors += 1;
            await tx.importRow.create({
              data: {
                importBatchId: batch.id,
                sourceRow: row.sourceRow,
                status: "ERROR",
                categoryName: row.category,
                productName: row.name,
                stock: row.stock,
                cost: row.cost,
                message: rowError instanceof Error ? rowError.message : "Error desconocido",
                sourceData: row,
              },
            });
          }
        }

        const status = counters.errors === 0 ? "COMPLETED" : "PARTIAL";
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status,
            createdRows: counters.created,
            updatedRows: counters.updated,
            skippedRows: counters.skipped,
            errorRows: counters.errors,
            finishedAt: new Date(),
          },
        });

        return { ...counters, status, total: parsed.products.length };
      },
      { maxWait: 10_000, timeout: 120_000 },
    );

    return created({
      batchId: batch.id,
      fileName: file.name,
      sheet: parsed.sheetName,
      status: result.status,
      totalRows: result.total,
      createdRows: result.created,
      updatedRows: result.updated,
      skippedRows: result.skipped,
      errorRows: result.errors,
    });
  } catch (error) {
    if (batchId) {
      await prisma.importBatch
        .update({
          where: { id: batchId },
          data: { status: "FAILED", finishedAt: new Date() },
        })
        .catch(() => undefined);
    }
    return handleApiError(error);
  }
}
