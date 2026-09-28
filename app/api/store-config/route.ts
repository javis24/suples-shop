import { ok } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  return ok({
    whatsappNumber: (process.env.STORE_WHATSAPP_NUMBER ?? "").replace(/\D/g, ""),
  });
}
