import { z } from "zod";
import { created, handleApiError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email().max(190).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  role: z.enum(["ADMIN", "STAFF"]).default("STAFF"),
});

export async function GET() {
  try {
    await requireUser(["ADMIN"]);
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      orderBy: { name: "asc" },
    });
    return ok(users);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser(["ADMIN"]);
    const data = schema.parse(await request.json());
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: hashPassword(data.password),
        role: data.role,
      },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    return created(user);
  } catch (error) {
    return handleApiError(error);
  }
}
