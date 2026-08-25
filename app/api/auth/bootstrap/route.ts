import { z } from "zod";
import { created, handleApiError, ApiError } from "@/lib/api";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email().max(190).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      throw new ApiError(409, "El administrador inicial ya fue creado");
    }

    const data = schema.parse(await request.json());
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: hashPassword(data.password),
        role: "ADMIN",
      },
      select: { id: true, name: true, email: true, role: true },
    });

    await setSessionCookie(createSessionToken(user.id, user.role));
    return created(user);
  } catch (error) {
    return handleApiError(error);
  }
}
