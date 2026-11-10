import { ok } from "@/lib/api";
import { storeWhatsAppConfig } from "@/lib/order-whatsapp";
import { validPhone } from "@/lib/checkout-policy";

export const runtime = "nodejs";
export async function GET() {
  const { businessPhone } = storeWhatsAppConfig();
  return ok({
    whatsappNumber: validPhone(businessPhone) ? businessPhone : "",
    deliveryMode: "HOME",
    shippingPolicy: "QUOTE",
    paymentPolicy: "WHATSAPP",
    testMode: process.env.NODE_ENV !== "production" && process.env.CHECKOUT_E2E === "1" && /(?:_test|_e2e)$/.test(new URL(process.env.DATABASE_URL || "mysql://localhost/disabled").pathname),
  });
}
