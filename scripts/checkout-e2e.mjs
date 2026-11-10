import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = new URL(process.env.CHECKOUT_E2E_BASE_URL || "http://localhost:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) throw new Error("Solo se permiten pruebas en localhost.");
if (process.env.CHECKOUT_E2E_ALLOW_WRITES !== "1") throw new Error("Configura CHECKOUT_E2E_ALLOW_WRITES=1. Esta prueba CREA datos en una BD de pruebas.");
const email = process.env.CHECKOUT_E2E_ADMIN_EMAIL;
const password = process.env.CHECKOUT_E2E_ADMIN_PASSWORD;
if (!email || !password) throw new Error("Faltan las credenciales de un administrador de PRUEBAS.");

let cookie = "";
async function api(path, method = "GET", data, authenticated = false) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: { ...(data ? { "Content-Type": "application/json" } : {}), ...(authenticated ? { Cookie: cookie } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const body = await response.json();
  return { response, body };
}
function expect(result, status) {
  assert.equal(result.response.status, status, JSON.stringify(result.body));
  return result.body.data;
}

const store = expect(await api("/api/store-config"), 200);
assert.equal(store.testMode, true, "El servidor debe usar next dev, CHECKOUT_E2E=1 y una base cuyo nombre termine en _test o _e2e.");
assert.ok(store.whatsappNumber, "Configura un número de prueba; esta suite no abre WhatsApp ni envía mensajes.");
const login = await api("/api/auth/login", "POST", { email, password });
expect(login, 200);
cookie = login.response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
assert.ok(cookie, "La sesión de pruebas no fue creada.");
const stamp = Date.now().toString(36);
const category = expect(await api("/api/categories", "POST", { name: "E2E " + stamp }, true), 201);
const product = expect(await api("/api/products", "POST", {
  name: "Producto E2E " + stamp, categoryId: category.id, status: "ACTIVE",
  variants: [{ sku: "E2E-" + stamp, cost: 80, price: 125.50, stock: 6 }],
}, true), 201);
const variantId = product.variants[0].id;
async function stock() {
  const product = expect(await api("/api/products/" + productId()), 200);
  return product.variants.find(value => value.id === variantId).stock;
}
function productId() { return product.id; }
function checkout(quantity = 2) {
  return {
    checkoutKey: randomUUID(), customerName: "Cliente E2E",
    customerPhone: "8711234567", customerEmail: null,
    shippingAddress: { street: "Calle prueba", exteriorNo: "10", neighborhood: "Centro", city: "Torreón", state: "Coahuila", postalCode: "27000" },
    notes: "PRUEBA AUTOMATIZADA, NO SURTIR",
    items: [{ variantId, quantity }],
  };
}

// Same-key concurrent requests: one order and one stock deduction.
const body = checkout(2);
const copies = await Promise.all([api("/api/orders", "POST", body), api("/api/orders", "POST", body)]);
const a = expect(copies[0], 201), b = expect(copies[1], 201);
assert.equal(a.id, b.id); assert.equal(await stock(), 4);
assert.equal(Number(a.total), 251); assert.equal(a.shippingQuoted, false);
const text = new URL(a.whatsappUrl).searchParams.get("text");
assert.match(text, /Cliente E2E/); assert.match(text, /27000/); assert.match(text, /costo por confirmar/);
assert.equal(expect(await api("/api/checkout/recover", "POST", { checkoutKey: body.checkoutKey }), 200).id, a.id);
expect(await api("/api/orders", "POST", { ...body, notes: "OTROS DATOS" }), 409);
assert.equal(await stock(), 4);
console.log("OK: reintentos concurrentes, recuperación y resumen de WhatsApp.");

// Simultaneous edits/cancellations must restore exactly the initial stock.
const editAndCancel = await Promise.all([
  api("/api/orders/" + a.id + "/items", "PUT", { items: [{ variantId, quantity: 3 }] }, true),
  api("/api/orders/" + a.id, "PATCH", { status: "CANCELED", note: "Cancelación E2E" }, true),
]);
assert.ok([200, 409].includes(editAndCancel[0].response.status));
expect(editAndCancel[1], 200);
await Promise.all([
  api("/api/orders/" + a.id, "PATCH", { status: "CANCELED", note: "Reintento E2E" }, true),
  api("/api/orders/" + a.id, "PATCH", { status: "CANCELED", note: "Reintento E2E" }, true),
]).then(results => results.forEach(result => expect(result, 200)));
assert.equal(await stock(), 6);
assert.equal(expect(await api("/api/checkout/recover", "POST", { checkoutKey: body.checkoutKey }), 200).whatsappUrl, "");
console.log("OK: edición/cancelación concurrente y devolución única de existencias.");

// Different keys competing for the last stock: one winner.
const competing = await Promise.all([
  api("/api/orders", "POST", checkout(6)), api("/api/orders", "POST", checkout(6)),
]);
assert.deepEqual(competing.map(result => result.response.status).sort(), [201, 409]);
assert.equal(await stock(), 0);
const winner = competing.find(result => result.response.status === 201).body.data;
expect(await api("/api/orders/" + winner.id, "PATCH", { status: "CANCELED", note: "Liberar fixture E2E" }, true), 200);
assert.equal(await stock(), 6);
console.log("OK: no se sobrevende la última existencia.");

// Delivery quote, real payment method, preparation, shipping and delivery.
const order = expect(await api("/api/orders", "POST", checkout(1)), 201);
expect(await api("/api/orders/" + order.id, "PATCH", { status: "SHIPPED" }, true), 409);
expect(await api("/api/orders/" + order.id, "PATCH", { paymentStatus: "PAID" }, true), 409);
const quoted = expect(await api("/api/orders/" + order.id, "PATCH", {
  status: "CONFIRMED", shippingQuoted: true, shipping: 99.95, paymentMethod: "TRANSFER",
  carrier: "Mensajería E2E", trackingNumber: "E2E-" + stamp, note: "Costo autorizado de prueba",
}, true), 200);
assert.equal(Number(quoted.total), 225.45);
expect(await api("/api/orders/" + order.id, "PATCH", { paymentStatus: "PAID" }, true), 200);
expect(await api("/api/orders/" + order.id, "PATCH", { shippingQuoted: true, shipping: 10 }, true), 409);
expect(await api("/api/orders/" + order.id, "PATCH", { status: "PREPARING" }, true), 200);
expect(await api("/api/orders/" + order.id, "PATCH", { status: "SHIPPED" }, true), 200);
const message = expect(await api("/api/orders/" + order.id + "/whatsapp", "POST", {}, true), 201);
assert.equal(new URL(message.url).pathname, "/528711234567");
assert.match(message.message, /Enviado/); assert.match(message.message, /E2E-/);
expect(await api("/api/orders/" + order.id, "PATCH", { status: "DELIVERED" }, true), 200);
expect(await api("/api/orders/" + order.id, "PATCH", { status: "CANCELED", note: "No debe aceptar" }, true), 409);
expect(await api("/api/orders/" + order.id), 401);
console.log("OK: cotización, pago manual, seguimiento, guía y permisos.");
console.log("PRUEBA COMPLETA. Se conservan los registros E2E para auditoría en la BD de pruebas.");
