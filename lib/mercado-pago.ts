import {
  MercadoPagoConfig,
  Payment,
  Preference,
  WebhookSignatureValidator,
} from "mercadopago";
import { ApiError } from "@/lib/api";

type CheckoutOrder = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  items: Array<{
    sku: string;
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: unknown;
  }>;
};

function accessToken() {
  const value = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (!value) {
    throw new ApiError(503, "El pago en línea todavía no está configurado");
  }
  return value;
}

function client() {
  return new MercadoPagoConfig({
    accessToken: accessToken(),
    options: { timeout: 10_000 },
  });
}

export function validateMercadoPagoWebhook(input: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
}) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new ApiError(503, "La firma de webhooks de Mercado Pago no está configurada");
  }

  WebhookSignatureValidator.validate({
    xSignature: input.signature,
    xRequestId: input.requestId,
    dataId: input.dataId,
    secret,
    toleranceSeconds: 300,
  });
}

export async function createMercadoPagoPreference(
  order: CheckoutOrder,
  requestOrigin: string,
) {
  const siteUrl = (process.env.SITE_URL?.trim() || requestOrigin).replace(/\/$/, "");
  const preference = new Preference(client());
  const response = await preference.create({
    body: {
      items: order.items.map((item) => ({
        id: item.sku,
        title: item.variantName
          ? `${item.productName} · ${item.variantName}`
          : item.productName,
        quantity: item.quantity,
        unit_price: Number(item.unitPrice),
        currency_id: "MXN",
      })),
      external_reference: order.orderNumber,
      payer: {
        name: order.customerName,
        email: order.customerEmail || undefined,
      },
      metadata: {
        order_id: order.id,
        order_number: order.orderNumber,
      },
      back_urls: {
        success: `${siteUrl}/pedido/gracias?status=success&order=${encodeURIComponent(order.orderNumber)}`,
        pending: `${siteUrl}/pedido/gracias?status=pending&order=${encodeURIComponent(order.orderNumber)}`,
        failure: `${siteUrl}/pedido/gracias?status=failure&order=${encodeURIComponent(order.orderNumber)}`,
      },
      auto_return: "approved",
      statement_descriptor: "SUPLES SHOP",
    },
    requestOptions: {
      idempotencyKey: `order-${order.id}`,
    },
  });

  const checkoutUrl = response.init_point || response.sandbox_init_point;
  if (!response.id || !checkoutUrl) {
    throw new Error("Mercado Pago no devolvió una liga de pago");
  }

  return {
    preferenceId: response.id,
    checkoutUrl,
  };
}

export async function getMercadoPagoPayment(paymentId: string) {
  const payment = new Payment(client());
  return payment.get({ id: paymentId });
}
