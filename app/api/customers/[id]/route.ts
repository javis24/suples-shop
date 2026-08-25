import { ApiError, handleApiError, ok, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { customerSchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const id = parseId((await context.params).id);
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        addresses: { orderBy: [{ default: "desc" }, { createdAt: "desc" }] },
        orders: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!customer) throw new ApiError(404, "Cliente no encontrado");
    return ok(customer);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    await requireUser(["ADMIN", "STAFF"]);
    const id = parseId((await context.params).id);
    const data = customerSchema.partial().parse(await request.json());
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...data,
        email: data.email === undefined ? undefined : data.email?.toLowerCase() || null,
        phone: data.phone === "" ? null : data.phone,
      },
    });
    return ok(customer);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    await requireUser(["ADMIN"]);
    const id = parseId((await context.params).id);
    const customer = await prisma.customer.update({
      where: { id },
      data: { active: false },
    });
    return ok({ id: customer.id, active: customer.active });
  } catch (error) {
    return handleApiError(error);
  }
}
