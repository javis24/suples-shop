import { z } from "zod";
import { ApiError, handleApiError, ok, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  email: z.string().trim().email().max(190).transform((value) => value.toLowerCase()).optional(),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(["ADMIN", "STAFF"]).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request, context: Context) {
  try {
    const current = await requireUser(["ADMIN"]);
    const id = parseId((await context.params).id);
    const data = schema.parse(await request.json());
    if (current.id === id && data.active === false) {
      throw new ApiError(409, "No puedes desactivar tu propia cuenta");
    }
    const user = await prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        passwordHash: data.password ? hashPassword(data.password) : undefined,
        role: data.role,
        active: data.active,
      },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    return ok(user);
  } catch (error) {
    return handleApiError(error);
  }
}
