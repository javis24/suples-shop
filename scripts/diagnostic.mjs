import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const steps = [
 ['Prisma generate', 'prisma/build/index.js', ['generate']],
 ['Prisma validate', 'prisma/build/index.js', ['validate']],
 ['ESLint', 'eslint/bin/eslint.js', ['.']],
 ['TypeScript', 'typescript/bin/tsc', ['--noEmit']],
 ['Pruebas unitarias', null, ['--test', 'tests/business.test.mjs']],
 ['Build producción', 'next/dist/bin/next', ['build']],
];
const results = [];
for (const [name, bin, args] of steps) {
 console.log(`\nEjecutando ${name}...`);
 const result = spawnSync(process.execPath, bin ? [resolve('node_modules', bin), ...args] : args, {
   encoding: 'utf8', timeout: 300000, env: process.env,
 });
 const output = `${result.stdout || ''}${result.stderr || ''}`;
 console.log(output);
 results.push({ name, status: result.status === 0 ? 'PASS' : 'FAIL', exitCode: result.status, error: result.error?.message });
}
mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/diagnostic.json', JSON.stringify({ timestamp: new Date().toISOString(), checks: results, scope: 'Local. No valida BD remota, Blob ni flujos autenticados.' }, null, 2));
console.table(results);
process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
