import { ApiError, handleApiError, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      const hasUsers = (await prisma.user.count()) > 0;
      throw new ApiError(401, hasUsers ? "Debes iniciar sesión" : "SETUP_REQUIRED");
    }
    return ok(user);
  } catch (error) {
    return handleApiError(error);
  }
}
