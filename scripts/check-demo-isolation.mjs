#!/usr/bin/env node
/**
 * Production modules must not own implicit demo-fixture cleanup.
 * The uid prefix lives in apps/api/src/demo and seed scripts.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const roots = [
  'apps/api/src/sync',
  'apps/api/src/end-users',
  'apps/api/src/analytics',
  'apps/api/src/kafka',
  'apps/api/src/system-health',
  'apps/api/src/jobs',
  'apps/api/src/devices/devices.service.ts',
  'apps/api/src/tuya/tuya.module.ts',
];

const patterns = [
  'uid-demo-',
  "startsWith('demo-')",
  'startsWith("demo-")',
  "startsWith: 'demo-'",
  'startsWith: "demo-"',
];

const failures = [];

function filesUnder(rel) {
  const full = join(root, rel);
  if (!existsSync(full)) {
    failures.push(`missing ${rel}`);
    return [];
  }
  const stat = statSync(full);
  if (stat.isFile()) return [full];
  const out = [];
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    const child = join(full, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(relative(root, child)));
    else if (entry.isFile() && !entry.name.endsWith('.spec.ts')) out.push(child);
  }
  return out;
}

for (const rel of roots) {
  for (const file of filesUnder(rel)) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      if (text.includes(pattern)) {
        failures.push(`${relative(root, file)} contains ${pattern}`);
      }
    }
  }
}

const moduleText = readFileSync(join(root, 'apps/api/src/tuya/tuya.module.ts'), 'utf8');
if (moduleText.includes('TuyaMockClient')) {
  failures.push('tuya.module.ts still constructs or names TuyaMockClient');
}
if (moduleText.includes('DEMO_MODE')) {
  failures.push('tuya.module.ts still branches on DEMO_MODE');
}

function walkSrc(dir, hits) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'demo' || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkSrc(full, hits);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      const text = readFileSync(full, 'utf8');
      if (/MAX_DEVICES\s*=\s*50/.test(text)) hits.push(relative(root, full));
    }
  }
}

const hardCaps = [];
walkSrc(join(root, 'apps/api/src'), hardCaps);
for (const hit of hardCaps) failures.push(`${hit} still hardcodes MAX_DEVICES = 50`);

if (failures.length > 0) {
  console.error('demo isolation check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('demo isolation ok (no implicit uid-demo-/demo-* purge outside apps/api/src/demo)');
