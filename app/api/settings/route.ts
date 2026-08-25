import { z } from "zod";
import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  settings: z.array(
    z.object({
      key: z.string().trim().min(2).max(120),
      value: z.string().max(20000),
      group: z.string().trim().min(2).max(80).optional(),
      public: z.boolean().optional(),
    }),
  ),
});

export async function GET(request: NextRequest) {
  try {
    const includePrivate = request.nextUrl.searchParams.get("all") === "true";
    if (includePrivate) await requireUser(["ADMIN"]);
    const settings = await prisma.setting.findMany({
      where: includePrivate ? undefined : { public: true },
      orderBy: [{ group: "asc" }, { key: "asc" }],
    });
    return ok(settings);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireUser(["ADMIN"]);
    const data = schema.parse(await request.json());
    const settings = await prisma.$transaction(
      data.settings.map((setting) =>
        prisma.setting.upsert({
          where: { key: setting.key },
          update: {
            value: setting.value,
            group: setting.group,
            public: setting.public,
          },
          create: {
            key: setting.key,
            value: setting.value,
            group: setting.group ?? "store",
            public: setting.public ?? true,
          },
        }),
      ),
    );
    return ok(settings);
  } catch (error) {
    return handleApiError(error);
  }
}
