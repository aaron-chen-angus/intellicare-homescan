// Optional: run the same suite from a terminal with `node tests/run-node.mjs` (no npm packages needed).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHarness } from './harness.js';
import { runSuite } from './suite.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const loadJson = async (p) => JSON.parse(await readFile(root + p, 'utf8'));

const h = createHarness();
await runSuite(h, loadJson);
const s = h.summary();
for (const r of s.failedTests) console.log(`FAIL ${r.name}\n  ${r.failures.join('\n  ')}`);
console.log(`${s.passed}/${s.total} passed, ${s.failed} failed`);
process.exit(s.failed ? 1 : 0);
