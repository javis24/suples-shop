export type WhatsAppOrderItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  sku?: string | null;
  variant?: string | null;
};

export type WhatsAppCustomer = {
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
};

type WhatsAppOrderInput = {
  businessPhone: string;
  customer: WhatsAppCustomer;
  items: WhatsAppOrderItem[];
  paymentMethod: string;
  notes?: string | null;
  orderNumber?: string | null;
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

function paymentMethodLabel(value: string) {
  const method = value.trim().toUpperCase();

  if (["CASH", "CASH_ON_DELIVERY", "EFECTIVO"].includes(method)) {
    return "Efectivo";
  }

  if (["TRANSFER", "TRANSFERENCIA", "BANK_TRANSFER"].includes(method)) {
    return "Transferencia bancaria";
  }

  if (["ONLINE", "CARD", "MERCADO_PAGO", "PAGO_EN_LINEA"].includes(method)) {
    return "Pago en línea";
  }

  return value.trim() || "Por confirmar";
}

function cleanLine(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

export function createWhatsAppOrderUrl(input: WhatsAppOrderInput) {
  const businessPhone = input.businessPhone.replace(/\D/g, "");

  if (!/^\d{10,15}$/.test(businessPhone)) {
    throw new Error(
      "Configura NEXT_PUBLIC_WHATSAPP_NUMBER con código de país y solo números",
    );
  }

  if (input.items.length === 0) {
    throw new Error("El carrito está vacío");
  }

  const subtotal = input.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );

  const productLines = input.items.flatMap((item, index) => {
    const detail = [cleanLine(item.variant), item.sku ? `SKU: ${item.sku}` : ""]
      .filter(Boolean)
      .join(" · ");

    return [
      `*${index + 1}. ${cleanLine(item.name)}*`,
      detail || null,
      `Cantidad: ${item.quantity}`,
      `Precio: ${money.format(item.unitPrice)}`,
      `Importe: ${money.format(item.unitPrice * item.quantity)}`,
      "",
    ].filter((line): line is string => line !== null);
  });

  const message = [
    "*NUEVO PEDIDO - SUPLES SHOP*",
    input.orderNumber ? `Pedido: *${cleanLine(input.orderNumber)}*` : null,
    "",
    "*DATOS DEL CLIENTE*",
    `Nombre: ${cleanLine(input.customer.name)}`,
    `WhatsApp: ${cleanLine(input.customer.phone)}`,
    input.customer.email ? `Correo: ${cleanLine(input.customer.email)}` : null,
    input.customer.address ? `Dirección: ${cleanLine(input.customer.address)}` : null,
    "",
    "*PRODUCTOS*",
    ...productLines,
    `*TOTAL: ${money.format(subtotal)}*`,
    `*FORMA DE PAGO: ${paymentMethodLabel(input.paymentMethod)}*`,
    input.notes ? `Notas: ${cleanLine(input.notes)}` : null,
    "",
    "Quedo pendiente de la confirmación de disponibilidad y entrega.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return `https://wa.me/${businessPhone}?text=${encodeURIComponent(message)}`;
}
