import { handleApiError, noContent, ok, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bannerSchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    await requireUser(["ADMIN", "STAFF"]);
    const id = parseId((await context.params).id);
    const data = bannerSchema.partial().parse(await request.json());
    const banner = await prisma.banner.update({ where: { id }, data });
    return ok(banner);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    await requireUser(["ADMIN"]);
    const id = parseId((await context.params).id);
    await prisma.banner.delete({ where: { id } });
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
