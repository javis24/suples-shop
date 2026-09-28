type OrderForWhatsApp = {
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
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
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

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
  const businessPhone = config.businessPhone.replace(/\D/g, "");
  const lines = order.items.map(
    (item) =>
      `• ${item.quantity} × ${item.productName}${item.variantName ? ` (${item.variantName})` : ""}\n  ${money.format(Number(item.unitPrice))} c/u — ${money.format(Number(item.lineTotal))}`,
  );

  const address =
    typeof order.shippingAddress === "object" && order.shippingAddress !== null
      ? (order.shippingAddress as Record<string, unknown>)
      : {};
  const references = String(address.references ?? "").trim();
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
    `*TOTAL: ${money.format(Number(order.total))}*`,
    "*DATOS DE ENTREGA*",
    addressLine(order.shippingAddress),
    ...(references ? [`Referencias: ${references}`] : []),
    ...(order.notes ? ["", `Notas: ${order.notes}`] : []),
  ].join("\n");

  return {
    destination: businessPhone,
    message,
    url: businessPhone
      ? `https://wa.me/${businessPhone}?text=${encodeURIComponent(message)}`
      : "",
  };
}

export function storeWhatsAppConfig() {
  return {
    businessPhone: (process.env.STORE_WHATSAPP_NUMBER ?? "").replace(/\D/g, ""),
  };
}
