// GET only: no orders, uploads, login, imports or mutations.
const target = process.argv[2] || process.env.TEST_BASE_URL;
if (!target) { console.error('Uso: pnpm test:smoke -- https://tu-sitio'); process.exit(2); }
const base = new URL(target);
if (!['https:', 'http:'].includes(base.protocol)) throw new Error('URL HTTP/HTTPS requerida');
const checks = [
  ['Salud y BD', '/api/health', 200, b => b?.data?.database === 'connected'],
  ['Productos', '/api/products?limit=1', 200, b => Array.isArray(b?.data)],
  ['Categorías', '/api/categories', 200, b => Array.isArray(b?.data)],
  ['Marcas', '/api/brands', 200, b => Array.isArray(b?.data)],
  ['Banners', '/api/banners', 200, b => Array.isArray(b?.data)],
  ['Sesión anónima', '/api/auth/me', 401, b => b?.error?.code === 'UNAUTHORIZED'],
  ['Pedidos protegidos', '/api/orders', 401, b => b?.error?.code === 'UNAUTHORIZED'],
  ['Productos administrativos protegidos', '/api/products?all=true', 401, b => b?.error?.code === 'UNAUTHORIZED'],
];
let failures = 0;
for (const [name, path, status, validate] of checks) {
  const started = Date.now();
  try {
    const response = await fetch(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const body = await response.json().catch(() => null);
    const passed = response.status === status && validate(body);
    if (!passed) failures++;
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: HTTP ${response.status}, ${Date.now() - started} ms${body?.error?.code ? `, ${body.error.code}` : ''}`);
  } catch (error) { failures++; console.log(`FAIL ${name}: ${error.name}, ${Date.now() - started} ms`); }
}
console.log(`${checks.length - failures}/${checks.length} comprobaciones aprobadas. No mide avance funcional completo.`);
process.exitCode = failures ? 1 : 0;
