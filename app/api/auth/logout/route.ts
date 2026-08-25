import { clearSessionCookie } from "@/lib/auth";
import { ok } from "@/lib/api";

export async function POST() {
  await clearSessionCookie();
  return ok({ loggedOut: true });
}
