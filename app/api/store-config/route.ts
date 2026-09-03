import { ok } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  return ok({
    whatsappNumber: (process.env.STORE_WHATSAPP_NUMBER ?? "").replace(/\D/g, ""),
    onlinePaymentEnabled: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN),
    bank: {
      name: process.env.STORE_BANK_NAME ?? "",
      holder: process.env.STORE_BANK_HOLDER ?? "",
      clabe: (process.env.STORE_BANK_CLABE ?? "").replace(/\s/g, ""),
    },
  });
}
