#!/usr/bin/env node
/**
 * Fault meanings may live only in PRODUCT_FAULT_MEANINGS.json.
 * A second maintained copy (embedded TS, another JSON, a seed literal) fails CI.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceName = 'PRODUCT_FAULT_MEANINGS.json';
const sourcePath = join(root, sourceName);
const doc = JSON.parse(readFileSync(sourcePath, 'utf8'));

const symptoms = new Set();
for (const family of Object.values(doc.families ?? {})) {
  for (const code of Object.values(family.codes ?? {})) {
    if (typeof code.symptom === 'string' && code.symptom.length >= 12) {
      symptoms.add(code.symptom);
    }
  }
}

if (symptoms.size < 8) {
  console.error(`dictionary check: expected symptom fingerprints in ${sourceName}`);
  process.exit(1);
}

const skipDirs = new Set(['node_modules', 'dist', 'coverage', '.git', 'data']);
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.sql']);
const threshold = 6;
const failures = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!extensions.has(extname(entry.name))) continue;
    if (resolve(full) === resolve(sourcePath)) continue;
    const text = readFileSync(full, 'utf8');
    let hits = 0;
    for (const symptom of symptoms) {
      if (text.includes(symptom)) hits += 1;
      if (hits >= threshold) break;
    }
    if (hits >= threshold) {
      failures.push(`${relative(root, full)} contains ${hits}+ fault symptom strings`);
    }
  }
}

walk(root);

const loaderText = readFileSync(join(root, 'apps/api/src/devices/product-fault-meanings.ts'), 'utf8');
if (/nameZh:\s*['"]/.test(loaderText)) {
  failures.push('product-fault-meanings.ts still embeds nameZh string literals');
}

if (failures.length > 0) {
  console.error('dictionary single-source check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `dictionary single-source ok (${symptoms.size} symptom fingerprints, no third full copy)`,
);
