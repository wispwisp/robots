// Vitest setup: load the vendored Skulpt into Node so that globalThis.Sk exists, as in the browser.
// The files are classic scripts; with "type": "module" in package.json, require() would treat them
// as ES modules (`this` is undefined and Skulpt falls back to `window`), so they run via the vm module.
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

for (const name of ['skulpt.min.js', 'skulpt-stdlib.js']) {
  const url = new URL(`../../public/vendor/skulpt/${name}`, import.meta.url);
  runInThisContext(readFileSync(url, 'utf8'), { filename: url.pathname });
}
