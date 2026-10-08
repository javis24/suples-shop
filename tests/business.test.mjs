import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const { hashPassword, verifyPassword } = loadTs('lib/password.ts');
const { orderSchema } = loadTs('lib/validators.ts');
const { buildOrderWhatsApp } = loadTs('lib/order-whatsapp.ts');
const { createWhatsAppOrderUrl } = loadTs('lib/whatsapp-order.ts');
const { buildProductSourceKey, normalizeProductKey } = loadTs('lib/microsip-excel.ts');
const { ApiError, parseId, getPagination, handleApiError } = loadTs('lib/api.ts');
const validOrder = { customerName: 'Cliente de prueba', shippingAddress: {}, items: [{ variantId: 1, quantity: 2 }] };
test('Contraseña correcta y sal aleatoria', () => {
  const hash = hashPassword('Prueba segura 123');
  assert.equal(verifyPassword('Prueba segura 123', hash), true);
  assert.notEqual(hashPassword('Prueba segura 123'), hash);
});
test('Contraseña incorrecta y hashes dañados se rechazan', () => {
  assert.equal(verifyPassword('otra', hashPassword('correcta')), false);
  for (const value of ['', 'bad', 'salt:bad']) assert.equal(verifyPassword('x', value), false);
});
test('Pedido válido usa efectivo por defecto', () => assert.equal(orderSchema.parse(validOrder).paymentMethod, 'CASH'));
for (const [name, patch] of [
  ['carrito vacío', { items: [] }],
  ['cantidad cero', { items: [{ variantId: 1, quantity: 0 }] }],
  ['cantidad negativa', { items: [{ variantId: 1, quantity: -1 }] }],
  ['cantidad fraccionaria', { items: [{ variantId: 1, quantity: 1.5 }] }],
  ['cantidad mayor de 100', { items: [{ variantId: 1, quantity: 101 }] }],
  ['envío negativo', { shipping: -1 }],
  ['email inválido', { customerEmail: 'sin-arroba' }],
]) test(`Validación rechaza ${name}`, () => assert.equal(orderSchema.safeParse({ ...validOrder, ...patch }).success, false));
test('SKU estable aunque cambie el nombre y sabores con SKU distintos', () => {
  assert.equal(buildProductSourceKey('ABC1', 'Nombre anterior'), buildProductSourceKey('ABC1', 'Nombre nuevo'));
  assert.notEqual(buildProductSourceKey('ABC1', 'Proteína chocolate'), buildProductSourceKey('ABC2', 'Proteína vainilla'));
});
test('Identidad sin SKU normaliza espacios, mayúsculas y acentos', () => assert.equal(normalizeProductKey('  Proteína   Vainilla '), 'PROTEINA VAINILLA'));
test('WhatsApp incluye folio y total final con envío/descuento', () => {
  const result = buildOrderWhatsApp({ orderNumber: 'SS-TEST', customerName: 'Prueba', customerPhone: '8710000000', customerEmail: null, notes: null, paymentMethod: 'CASH', total: 195, shippingAddress: { city: 'Gómez Palacio' }, items: [{ productName: 'Proteína', variantName: 'Vainilla', quantity: 2, unitPrice: 100, lineTotal: 200 }] }, { businessPhone: '+52 871 000 0000' });
  assert.equal(new URL(result.url).searchParams.get('text'), result.message);
  assert.match(result.message, /SS-TEST/); assert.match(result.message, /195\.00/); assert.match(result.message, /Efectivo/);
});
test('WhatsApp sin teléfono no genera una liga', () => {
  const result = buildOrderWhatsApp({ ...validOrder, orderNumber: 'TEST', customerPhone: null, customerEmail: null, notes: null, paymentMethod: 'CASH', total: 0, items: [] }, { businessPhone: '' });
  assert.equal(result.url, '');
});
test('Carrito WhatsApp rechaza vacío y teléfono inválido', () => {
  const input = { businessPhone: '528710000000', customer: { name: 'Prueba', phone: '8710000000' }, paymentMethod: 'CASH', items: [] };
  assert.throws(() => createWhatsAppOrderUrl(input));
  assert.throws(() => createWhatsAppOrderUrl({ ...input, businessPhone: '123', items: [{ name: 'Producto', quantity: 1, unitPrice: 10 }] }));
});
test('IDs inválidos se rechazan', () => {
  for (const value of ['0', '-1', '1.5', 'abc']) assert.throws(() => parseId(value), ApiError);
  assert.equal(parseId('12'), 12);
});
test('Paginación limita tamaño y calcula desplazamiento', () => {
  assert.deepEqual(getPagination(new URLSearchParams('page=2&limit=200')), { page: 2, limit: 100, skip: 100 });
});
test('Errores de validación/autorización/conflicto conservan HTTP', async () => {
  for (const status of [401, 403, 409, 413, 415]) assert.equal(handleApiError(new ApiError(status, 'Prueba')).status, status);
  assert.equal(handleApiError({ code: 'P2002' }).status, 409);
  const result = orderSchema.safeParse({ ...validOrder, items: [] });
  assert.equal(handleApiError(result.error).status, 422);
});

test('Excel real: sabores separados, SKU con ceros, duplicados, exclusiones y stock cero', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseMicrosipPriceList } = loadTs('lib/microsip-excel.ts');
  const bytes = Buffer.from(readFileSync('tests/export-fixture.base64', 'utf8').trim(), 'base64');
  const result = await parseMicrosipPriceList(new File([bytes], 'ExportacionWeb.xlsx'));
  assert.equal(result.format, 'WEB_EXPORT');
  assert.equal(result.products.length, 3);
  const chocolate = result.products.find(row => row.sku === '001');
  const vanilla = result.products.find(row => row.sku === '002');
  assert.equal(chocolate.stock, 7); assert.equal(chocolate.price, 520);
  assert.notEqual(chocolate.productKey, vanilla.productKey);
  assert.equal(result.products.find(row => row.sku === '006').stock, 0);
  assert.equal(result.duplicateRows.length, 1);
  assert.equal(result.skippedRows.length, 4);
});
