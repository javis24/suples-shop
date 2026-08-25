import { ApiError, handleApiError, noContent, ok, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { brandSchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const id = parseId((await context.params).id);
    const brand = await prisma.brand.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) throw new ApiError(404, "Marca no encontrada");
    return ok(brand);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    await requireUser(["ADMIN", "STAFF"]);
    const id = parseId((await context.params).id);
    const data = brandSchema.partial().parse(await request.json());
    const brand = await prisma.brand.update({
      where: { id },
      data: {
        ...data,
        slug: data.slug ? slugify(data.slug) : undefined,
        logoUrl: data.logoUrl === "" ? null : data.logoUrl,
      },
    });
    return ok(brand);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    await requireUser(["ADMIN"]);
    const id = parseId((await context.params).id);
    const products = await prisma.product.count({ where: { brandId: id } });
    if (products > 0) {
      throw new ApiError(409, "La marca tiene productos; desactívala en lugar de eliminarla");
    }
    await prisma.brand.delete({ where: { id } });
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
