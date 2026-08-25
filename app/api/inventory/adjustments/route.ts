import { z } from "zod";
import { ApiError, created, handleApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  variantId: z.coerce.number().int().positive(),
  mode: z.enum(["DELTA", "SET"]).default("DELTA"),
  quantity: z.coerce.number().int(),
  reason: z.string().trim().min(3).max(255),
  reference: z.string().trim().max(120).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser(["ADMIN", "STAFF"]);
    const data = schema.parse(await request.json());

    const movement = await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUnique({
        where: { id: data.variantId },
      });
      if (!variant) throw new ApiError(404, "Variante no encontrada");

      const newStock = data.mode === "SET" ? data.quantity : variant.stock + data.quantity;
      if (newStock < 0) throw new ApiError(409, "La existencia no puede quedar negativa");

      await tx.productVariant.update({
        where: { id: variant.id },
        data: { stock: newStock },
      });

      return tx.inventoryMovement.create({
        data: {
          variantId: variant.id,
          type: "ADJUSTMENT",
          quantity: newStock - variant.stock,
          previousStock: variant.stock,
          newStock,
          reason: data.reason,
          reference: data.reference || null,
          userId: user.id,
        },
        include: { variant: { include: { product: true } }, user: true },
      });
    });

    return created(movement);
  } catch (error) {
    return handleApiError(error);
  }
}
