import { z } from "zod";
import { ApiError, handleApiError, ok } from "@/lib/api";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  try {
    const data = schema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { email: data.email } });

    if (!user || !user.active || !verifyPassword(data.password, user.passwordHash)) {
      throw new ApiError(401, "Correo o contraseña incorrectos");
    }

    await setSessionCookie(createSessionToken(user.id, user.role));
    return ok({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (error) {
    return handleApiError(error);
  }
}
