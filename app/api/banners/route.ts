import { type NextRequest } from "next/server";
import { created, handleApiError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bannerSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const includeAll = params.get("all") === "true";
    const position = params.get("position")?.trim();
    if (includeAll) await requireUser();

    const now = new Date();
    const banners = await prisma.banner.findMany({
      where: {
        position: position || undefined,
        active: includeAll ? undefined : true,
        AND: includeAll
          ? undefined
          : [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
            ],
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return ok(banners);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser(["ADMIN", "STAFF"]);
    const data = bannerSchema.parse(await request.json());
    const banner = await prisma.banner.create({ data });
    return created(banner);
  } catch (error) {
    return handleApiError(error);
  }
}
