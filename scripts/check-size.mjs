// Gzips every file in dist/, prints the total and fails when it is above the 3 MB first-load budget.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET = 3 * 1024 * 1024;

const total = readdirSync('dist', { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .reduce((sum, entry) => sum + gzipSync(readFileSync(join(entry.parentPath, entry.name))).length, 0);

console.log(`dist/ gzipped: ${total} bytes (${(total / 1024).toFixed(0)} KB) of ${BUDGET} allowed`);
if (total > BUDGET) { console.error('Over the size budget'); process.exit(1); }
