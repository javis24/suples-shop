import { normalizePhone, validPhone } from "@/lib/checkout-policy";

type OrderForWhatsApp = {
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
  paymentMethod: "TO_CONFIRM" | "CASH" | "TRANSFER" | "ONLINE";
  shippingQuoted?: boolean;
  shipping?: unknown;
  subtotal?: unknown;
  discount?: unknown;
  status?: string;
  carrier?: string | null;
  trackingNumber?: string | null;
  total: unknown;
  shippingAddress: unknown;
  items: Array<{
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: unknown;
    lineTotal: unknown;
  }>;
};

type StoreWhatsAppConfig = {
  businessPhone: string;
  bank?: { name?: string; holder?: string; clabe?: string };
  checkoutUrl?: string | null;
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

function paymentLabel(value: OrderForWhatsApp["paymentMethod"]) {
  if (value === "TO_CONFIRM") return "Por acordar por WhatsApp";
  if (value === "ONLINE") return "Pago en línea con Mercado Pago";
  if (value === "TRANSFER") return "Transferencia bancaria";
  return "Efectivo";
}

function addressLine(address: unknown) {
  const value =
    typeof address === "object" && address !== null
      ? (address as Record<string, unknown>)
      : {};
  const street = String(value.street ?? "").trim();
  const exteriorNo = String(value.exteriorNo ?? "").trim();
  const interiorNo = String(value.interiorNo ?? "").trim();
  const neighborhood = String(value.neighborhood ?? "").trim();
  const city = String(value.city ?? "").trim();
  const state = String(value.state ?? "").trim();
  const postalCode = String(value.postalCode ?? "").trim();

  return [
    [street, exteriorNo ? `#${exteriorNo}` : "", interiorNo ? `Int. ${interiorNo}` : ""]
      .filter(Boolean)
      .join(" "),
    neighborhood ? `Col. ${neighborhood}` : "",
    city,
    state,
    postalCode ? `C.P. ${postalCode}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildOrderWhatsApp(order: OrderForWhatsApp, config: StoreWhatsAppConfig) {
  const businessPhone = normalizePhone(config.businessPhone);
  const lines = order.items.map(
    (item) =>
      `• ${item.quantity} × ${item.productName}${item.variantName ? ` (${item.variantName})` : ""}\n  ${money.format(Number(item.unitPrice))} c/u — ${money.format(Number(item.lineTotal))}`,
  );

  const address =
    typeof order.shippingAddress === "object" && order.shippingAddress !== null
      ? (order.shippingAddress as Record<string, unknown>)
      : {};
  const references = String(address.references ?? "").trim();
  const bank = config.bank ?? {};
  const transfer =
    order.paymentMethod === "TRANSFER" && bank.clabe
      ? [
          "",
          `Banco: ${bank.name || "Por confirmar"}`,
          `Titular: ${bank.holder || "Por confirmar"}`,
          `CLABE: ${bank.clabe}`,
        ]
      : [];
  const onlinePayment =
    order.paymentMethod === "ONLINE" && config.checkoutUrl
      ? ["", `Liga para pagar: ${config.checkoutUrl}`]
      : [];

  const message = [
    "Hola Suples Shop, quiero realizar el siguiente pedido:",
    `*Pedido ${order.orderNumber}*`,
    "",
    "*DATOS DEL CLIENTE*",
    `Nombre: ${order.customerName}`,
    `WhatsApp: ${order.customerPhone || "No proporcionado"}`,
    ...(order.customerEmail ? [`Correo: ${order.customerEmail}`] : []),
    "",
    "*PRODUCTOS*",
    ...lines,
    "",
    ...(order.shippingQuoted === false
      ? [`*TOTAL DE PRODUCTOS: ${money.format(Number(order.total))}*`, "Envío a domicilio: costo por confirmar. No incluido en este importe."]
      : [`Envío: ${money.format(Number(order.shipping ?? 0))}`, `*TOTAL: ${money.format(Number(order.total))}*`]),
    `*FORMA DE PAGO: ${paymentLabel(order.paymentMethod)}*`,
    "",
    "*DATOS DE ENTREGA A DOMICILIO*",
    addressLine(order.shippingAddress),
    ...(references ? [`Referencias: ${references}`] : []),
    ...(order.notes ? ["", `Notas: ${order.notes}`] : []),
    ...(order.carrier ? ["Paquetería: " + order.carrier] : []),
    ...(order.trackingNumber ? ["Guía: " + order.trackingNumber] : []),
    ...transfer,
    ...onlinePayment,
  ].join("\n");

  return {
    destination: businessPhone,
    message,
    url: validPhone(businessPhone)
      ? `https://wa.me/${businessPhone}?text=${encodeURIComponent(message)}`
      : "",
  };
}

export function storeWhatsAppConfig() {
  return {
    businessPhone: normalizePhone(process.env.STORE_WHATSAPP_NUMBER ?? ""),
    bank: {
      name: process.env.STORE_BANK_NAME ?? "",
      holder: process.env.STORE_BANK_HOLDER ?? "",
      clabe: (process.env.STORE_BANK_CLABE ?? "").replace(/\s/g, ""),
    },
  };
}

export function buildCustomerWhatsApp(order: OrderForWhatsApp) {
  const labels: Record<string, string> = {
    PENDING: "Pendiente de confirmar", CONFIRMED: "Confirmado",
    PREPARING: "En preparación", SHIPPED: "Enviado", DELIVERED: "Entregado", CANCELED: "Cancelado",
  };
  const result = buildOrderWhatsApp(order, { businessPhone: order.customerPhone ?? "" });
  const body = result.message.split("\n");
  body[0] = "Hola " + order.customerName + ", somos Suples Shop. Este es el resumen de tu pedido:";
  body.splice(2, 0, "Estado: " + (labels[order.status ?? "PENDING"] ?? order.status));
  const message = body.join("\n");
  return { ...result, message, url: result.url ? "https://wa.me/" + result.destination + "?text=" + encodeURIComponent(message) : "" };
}
