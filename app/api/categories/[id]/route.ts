import { ApiError, handleApiError, noContent, ok, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { categorySchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const id = parseId((await context.params).id);
    const category = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!category) throw new ApiError(404, "Categoría no encontrada");
    return ok(category);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    await requireUser(["ADMIN", "STAFF"]);
    const id = parseId((await context.params).id);
    const data = categorySchema.partial().parse(await request.json());
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...data,
        slug: data.slug ? slugify(data.slug) : undefined,
        description: data.description === "" ? null : data.description,
      },
    });
    return ok(category);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    await requireUser(["ADMIN"]);
    const id = parseId((await context.params).id);
    const products = await prisma.product.count({ where: { categoryId: id } });
    if (products > 0) {
      throw new ApiError(409, "La categoría tiene productos; desactívala en lugar de eliminarla");
    }
    await prisma.category.delete({ where: { id } });
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
