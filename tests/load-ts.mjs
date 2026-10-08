import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const cache = new Map();
// Transpile the real pure modules; application typechecking runs separately.
export function loadTs(path) {
  const filename = resolve(path);
  if (cache.has(filename)) return cache.get(filename);
  const require = createRequire(filename);
  const loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (name) => name.startsWith('@/')
    ? loadTs(`${name.slice(2)}.ts`) : require(name);
  new Function('require', 'module', 'exports', source)(localRequire, loaded, loaded.exports);
  cache.set(filename, loaded.exports);
  return loaded.exports;
}
