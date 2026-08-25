import { ApiError, handleApiError, noContent, ok, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { couponSchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    await requireUser(["ADMIN", "STAFF"]);
    const id = parseId((await context.params).id);
    const data = couponSchema.partial().parse(await request.json());
    if (data.type === "PERCENTAGE" && data.value && data.value > 100) {
      throw new ApiError(422, "El descuento porcentual no puede superar 100%");
    }
    const coupon = await prisma.coupon.update({ where: { id }, data });
    return ok(coupon);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    await requireUser(["ADMIN"]);
    const id = parseId((await context.params).id);
    const used = await prisma.order.count({ where: { couponId: id } });
    if (used > 0) {
      await prisma.coupon.update({ where: { id }, data: { active: false } });
      return ok({ id, active: false, deleted: false });
    }
    await prisma.coupon.delete({ where: { id } });
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
