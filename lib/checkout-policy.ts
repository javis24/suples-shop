import { z } from "zod";
import { createHash } from "node:crypto";

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? "52" + digits : digits;
}

export function validPhone(value: string) {
  return /^[1-9]\d{7,14}$/.test(normalizePhone(value));
}

const text = (max: number) => z.string().trim().max(max).default("");
export const deliveryAddressSchema = z.object({
  street: z.string().trim().min(2).max(255),
  exteriorNo: z.string().trim().min(1).max(40),
  interiorNo: text(40),
  neighborhood: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120),
  postalCode: z.string().trim().regex(/^\d{5}$/, "El código postal debe tener 5 dígitos"),
  references: text(500),
});

export const checkoutKeySchema = z.string().uuid();
export const checkoutSchema = z.object({
  checkoutKey: checkoutKeySchema,
  customerName: z.string().trim().min(3).max(220),
  customerPhone: z.string().trim().max(30).refine(validPhone, "Revisa el número de WhatsApp").transform(normalizePhone),
  customerEmail: z.string().trim().email().max(190).nullable().optional().transform(value => value?.toLowerCase() || null),
  shippingAddress: deliveryAddressSchema,
  notes: z.string().trim().max(1000).nullable().optional().transform(value => value || null),
  items: z.array(z.object({
    variantId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(100),
  })).min(1).max(50),
}).strict().transform(data => {
  const quantities = new Map<number, number>();
  for (const item of data.items) {
    quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
  }
  return { ...data, items: [...quantities].sort(([a], [b]) => a - b).map(([variantId, quantity]) => ({ variantId, quantity })) };
}).refine(data => data.items.every(item => item.quantity <= 100), "Máximo 100 unidades por presentación");

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export function checkoutHash(data: CheckoutInput) {
  const { checkoutKey: _checkoutKey, ...body } = data;
  void _checkoutKey;
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export { allowedNextStages, canChangeStage } from "@/lib/order-stages";
import { statusValues } from "@/lib/order-stages";

export const adminOrderSchema = z.object({
  status: z.enum(statusValues).optional(),
  paymentStatus: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED"]).optional(),
  paymentMethod: z.enum(["TO_CONFIRM", "CASH", "TRANSFER", "ONLINE"]).optional(),
  shipping: z.number().finite().min(0).max(99999).refine(value => Number(value.toFixed(2)) === value, "Máximo dos decimales").optional(),
  shippingQuoted: z.boolean().optional(),
  carrier: z.string().trim().max(120).nullable().optional(),
  trackingNumber: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(255).nullable().optional(),
}).strict().refine(data => Object.keys(data).length > 0, "No hay cambios");
