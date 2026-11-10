export type CheckoutBody = {
  checkoutKey: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  shippingAddress: Record<string, string>;
  notes: string | null;
  items: Array<{ variantId: number; quantity: number }>;
};
export type CheckoutResult = {
  id: number;
  orderNumber: string;
  total: string | number;
  shippingQuoted: boolean;
  status: string;
  whatsappUrl: string;
};
export type SavedCheckout = CheckoutResult & { checkoutKey: string };
export const PENDING_CHECKOUT_KEY = "suples-shop-pending-checkout-v2";
export const LAST_CHECKOUT_KEY = "suples-shop-last-checkout-v2";
