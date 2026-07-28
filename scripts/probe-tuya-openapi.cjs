#!/usr/bin/env node
/**
 * Probe Tuya OpenAPI with root `.env` credentials.
 *
 * Usage:
 *   node scripts/probe-tuya-openapi.mjs
 *   node scripts/probe-tuya-openapi.mjs --devices=vdevo178520780361270,vdevo178520783549089
 *
 * Does not print secrets. Safe to re-run after IoT Core renewals.
 */
const { existsSync, readFileSync } = require('fs');
const { resolve } = require('path');

function loadRootEnv() {
  const path = resolve(__dirname, '../.env');
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}`);
  }
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    let key = t.slice(0, i).trim();
    let value = t.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function preview(value, max = 240) {
  if (value == null) return null;
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

async function main() {
  loadRootEnv();
  // Resolve from apps/api so workspace dependency is found.
  const { TuyaContext } = require(resolve(
    __dirname,
    '../apps/api/node_modules/@tuya/tuya-connector-nodejs',
  ));

  const accessId = process.env.TUYA_ACCESS_ID;
  const accessSecret = process.env.TUYA_ACCESS_SECRET;
  if (!accessId || !accessSecret) {
    throw new Error('TUYA_ACCESS_ID / TUYA_ACCESS_SECRET required in .env');
  }

  const ctx = new TuyaContext({
    baseUrl: process.env.TUYA_BASE_URL || 'https://openapi.tuyacn.com',
    accessKey: accessId,
    secretKey: accessSecret,
  });

  const devices = argValue(
    'devices',
    'vdevo178520780361270,vdevo178520783549089',
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const products = String(process.env.TUYA_PRODUCT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  async function tryReq(label, opts) {
    const res = await ctx.request(opts);
    console.log(
      `\n[${label}] success=${res.success} code=${res.code ?? '-'} msg=${res.msg ?? '-'}`,
    );
    console.log('result:', preview(res.result));
    return res;
  }

  console.log(`Access ID: ${accessId.slice(0, 6)}…  base: ${process.env.TUYA_BASE_URL || 'https://openapi.tuyacn.com'}`);

  await tryReq('batch', {
    method: 'GET',
    path: '/v2.0/cloud/thing/batch',
    query: { device_ids: devices.join(',') },
  });

  for (const id of devices) {
    await tryReq(`v1 device ${id}`, {
      method: 'GET',
      path: `/v1.0/devices/${id}`,
    });
  }

  for (const pid of products.slice(0, 5)) {
    await tryReq(`v2 list product ${pid}`, {
      method: 'GET',
      path: '/v2.0/cloud/thing/device',
      query: { product_ids: pid, page_size: 5 },
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
