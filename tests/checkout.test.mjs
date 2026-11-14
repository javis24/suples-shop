import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadTs } from "./load-ts.mjs";

const { checkoutSchema, checkoutHash, adminOrderSchema, normalizePhone } = loadTs("lib/checkout-policy.ts");
const { allowedNextStages, canChangeStage } = loadTs("lib/order-stages.ts");
const { createCheckoutOrder, publicCheckoutOrder } = loadTs("lib/checkout-service.ts");
const { buildOrderWhatsApp, buildCustomerWhatsApp } = loadTs("lib/order-whatsapp.ts");
const { lockOrder, orderTransaction } = loadTs("lib/order-transaction.ts");

const input = () => ({
  checkoutKey: randomUUID(), customerName: "Cliente de prueba",
  customerPhone: "8711234567", customerEmail: "PRUEBA@example.com",
  shippingAddress: { street: "Calle de prueba", exteriorNo: "10", neighborhood: "Centro", city: "Torreón", state: "Coahuila", postalCode: "27000" },
  items: [{ variantId: 1, quantity: 2 }], notes: null,
});
const config = { businessPhone: "528711234567" };

function harness() {
  const state = { order: null, stock: 5, movements: 0, logs: 0, writes: 0, failLog: false };
  const variant = () => ({ id: 1, sku: "TEST-1", stock: state.stock, price: "125.50", active: true, presentation: "300 g", flavor: "Limón", product: { status: "ACTIVE", name: "Creatina de prueba" } });
  const tx = {
    $queryRaw: async () => [{ id: 1 }],
    productVariant: {
      findMany: async () => [variant()],
      updateMany: async ({ where, data }) => {
        if (state.stock < where.stock.gte) return { count: 0 };
        state.stock -= data.stock.decrement; return { count: 1 };
      },
      findUniqueOrThrow: async () => variant(),
    },
    order: {
      create: async ({ data }) => {
        state.writes++;
        state.order = { ...data, id: 7, status: "PENDING", items: data.items.create };
        return state.order;
      },
    },
    inventoryMovement: { create: async () => { state.movements++; } },
    orderWhatsAppLog: { create: async () => { if (state.failLog) throw new Error("log failed"); state.logs++; } },
  };
  const db = {
    order: { findUnique: async ({ where }) => state.order?.checkoutKey === where.checkoutKey ? state.order : null },
    $transaction: async callback => {
      const before = structuredClone(state);
      try { return await callback(tx); }
      catch (error) { Object.assign(state, before); throw error; }
    },
  };
  return { db, state };
}

test("checkout exige datos reales de domicilio, teléfono y clave UUID", () => {
  const body = input();
  const parsed = checkoutSchema.parse(body);
  assert.equal(parsed.customerPhone, "528711234567");
  assert.equal(parsed.customerEmail, "prueba@example.com");
  for (const patch of [
    { checkoutKey: "123" }, { customerPhone: "123" }, { customerName: " " },
    { shippingAddress: {} }, { items: [] },
    { shippingAddress: { ...body.shippingAddress, postalCode: "2700A" } },
    { shippingAddress: { ...body.shippingAddress, city: "" } },
  ]) assert.equal(checkoutSchema.safeParse({ ...body, ...patch }).success, false);
});
test("checkout rechaza importes, identidad de otro cliente y método impuestos por navegador", () => {
  for (const patch of [{ shipping: 0 }, { total: 1 }, { customerId: 1 }, { paymentMethod: "PAID" }, { couponCode: "X" }]) {
    assert.equal(checkoutSchema.safeParse({ ...input(), ...patch }).success, false);
  }
});
test("agrupa variantes repetidas y limita la cantidad acumulada", () => {
  const body = input();
  const parsed = checkoutSchema.parse({ ...body, items: [{ variantId: 1, quantity: 2 }, { variantId: 1, quantity: 3 }] });
  assert.deepEqual(parsed.items, [{ variantId: 1, quantity: 5 }]);
  assert.equal(checkoutSchema.safeParse({ ...body, items: [{ variantId: 1, quantity: 60 }, { variantId: 1, quantity: 60 }] }).success, false);
});
test("el hash no depende del orden del carrito ni de la clave y detecta cambios reales", () => {
  const body = input();
  const a = checkoutSchema.parse({ ...body, items: [{ variantId: 2, quantity: 1 }, { variantId: 1, quantity: 2 }] });
  const b = checkoutSchema.parse({ ...body, checkoutKey: randomUUID(), items: [...a.items].reverse() });
  assert.equal(checkoutHash(a), checkoutHash(b));
  assert.notEqual(checkoutHash(a), checkoutHash({ ...a, notes: "Otro domicilio" }));
});
test("servidor usa precio de BD y registra pedido, movimiento y mensaje juntos", async () => {
  const { db, state } = harness();
  const order = await createCheckoutOrder(db, checkoutSchema.parse(input()), config);
  assert.equal(order.total, 251);
  assert.equal(order.shippingQuoted, false);
  assert.equal(order.paymentMethod, "TO_CONFIRM");
  assert.equal(state.stock, 3);
  assert.equal(state.movements, 1);
  assert.equal(state.logs, 1);
});
test("reintento con la misma clave devuelve el mismo pedido sin bajar stock otra vez", async () => {
  const { db, state } = harness(); const body = checkoutSchema.parse(input());
  const a = await createCheckoutOrder(db, body, config);
  const b = await createCheckoutOrder(db, body, config);
  assert.equal(a.id, b.id); assert.equal(state.writes, 1); assert.equal(state.stock, 3);
});
test("misma clave con datos diferentes se rechaza", async () => {
  const { db, state } = harness(); const body = checkoutSchema.parse(input());
  await createCheckoutOrder(db, body, config);
  await assert.rejects(createCheckoutOrder(db, { ...body, notes: "Cambio" }, config), error => error.status === 409);
  assert.equal(state.stock, 3);
});
test("falta de stock o WhatsApp inválido no crea pedidos", async () => {
  const { db, state } = harness(); const body = checkoutSchema.parse(input());
  state.stock = 1;
  await assert.rejects(createCheckoutOrder(db, body, config), error => error.status === 409);
  assert.equal(state.writes, 0);
  await assert.rejects(createCheckoutOrder(db, body, { businessPhone: "" }), error => error.status === 503);
});
test("fallo de bitácora aborta el callback transaccional; el adaptador simula rollback", async () => {
  const { db, state } = harness(); state.failLog = true;
  await assert.rejects(createCheckoutOrder(db, checkoutSchema.parse(input()), config), /log failed/);
  assert.equal(state.order, null); assert.equal(state.stock, 5); assert.equal(state.movements, 0);
});
test("colisión de clave concurrente recupera el pedido confirmado", async () => {
  const body = checkoutSchema.parse(input());
  const saved = { id: 7, checkoutHash: checkoutHash(body) };
  let reads = 0;
  const db = {
    order: { findUnique: async () => ++reads === 1 ? null : saved },
    $transaction: async () => { throw { code: "P2002" }; },
  };
  assert.equal((await createCheckoutOrder(db, body, config)).id, 7);
});
test("WhatsApp detalla cantidades, sabor, domicilio y envío por cotizar", () => {
  const order = { ...input(), orderNumber: "SS-TEST", total: 251, paymentMethod: "TO_CONFIRM", shippingQuoted: false, items: [{ productName: "Creatina", variantName: "Limón", quantity: 2, unitPrice: 125.5, lineTotal: 251 }] };
  const result = buildOrderWhatsApp(order, config);
  assert.equal(new URL(result.url).searchParams.get("text"), result.message);
  for (const text of ["SS-TEST", "Cliente de prueba", "2 × Creatina", "Limón", "27000", "251.00", "costo por confirmar", "Por acordar"]) assert.ok(result.message.includes(text), text);
  assert.ok(!result.message.includes("Envío: $0.00"));
});
test("contacto del administrador apunta al cliente y agrega estado y guía", () => {
  const order = { ...input(), orderNumber: "SS-TEST", total: 350, shipping: 99, shippingQuoted: true, paymentMethod: "TRANSFER", status: "SHIPPED", carrier: "Mensajería de prueba", trackingNumber: "GUIA-123", items: [] };
  const result = buildCustomerWhatsApp(order);
  assert.equal(new URL(result.url).pathname, "/528711234567");
  assert.match(result.message, /somos Suples Shop/);
  assert.match(result.message, /Enviado/); assert.match(result.message, /GUIA-123/);
});
test("pedido cancelado no permite recuperar un enlace de compra y oculta datos internos", () => {
  const result = publicCheckoutOrder({ id: 1, orderNumber: "SS-X", status: "CANCELED", paymentMethod: "TO_CONFIRM", shippingQuoted: false, total: 100, customerName: "X", customerPhone: null, customerEmail: null, notes: null, shippingAddress: {}, items: [], checkoutHash: "secreto" }, config);
  assert.equal(result.whatsappUrl, "");
  assert.equal("checkoutHash" in result, false);
  assert.equal("customerPhone" in result, false);
});
test("estados siguen preparación y entrega; cancelado y entregado son terminales", () => {
  assert.equal(canChangeStage("PENDING", "SHIPPED"), false);
  assert.equal(canChangeStage("PREPARING", "SHIPPED"), true);
  assert.equal(canChangeStage("SHIPPED", "CANCELED"), false);
  assert.deepEqual(allowedNextStages("CANCELED"), ["CANCELED"]);
  assert.deepEqual(allowedNextStages("DELIVERED"), ["DELIVERED"]);
});
test("cotización admite centavos y cero explícito, rechaza cifras inválidas", () => {
  for (const shipping of [0, 19.99, 99.95]) assert.equal(adminOrderSchema.safeParse({ shipping, shippingQuoted: true }).success, true);
  for (const shipping of [-1, 1.001, Infinity, NaN]) assert.equal(adminOrderSchema.safeParse({ shipping }).success, false);
});
test("bloqueo de pedido usa parámetros y rechaza IDs inexistentes", async () => {
  let bound;
  await lockOrder({ $queryRaw: async (_sql, id) => { bound = id; return [{ id }]; } }, 12);
  assert.equal(bound, 12);
  await assert.rejects(lockOrder({ $queryRaw: async () => [] }, 13), error => error.status === 404);
});
test("reintenta conflictos transaccionales, pero no errores de negocio", async () => {
  let attempts = 0;
  const db = { $transaction: async callback => { if (++attempts < 3) throw { code: "P2034" }; return callback({ $queryRaw: async () => [{ id: 1 }] }); } };
  assert.equal(await orderTransaction(db, async () => "ok"), "ok"); assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(orderTransaction({ $transaction: async () => { attempts++; throw new Error("negocio"); } }, async () => 0), /negocio/);
  assert.equal(attempts, 1);
});
test("teléfonos de México se normalizan sin perder prefijo internacional", () => {
  assert.equal(normalizePhone("+52 871 123 4567"), "528711234567");
  assert.equal(normalizePhone("8711234567"), "528711234567");
});
