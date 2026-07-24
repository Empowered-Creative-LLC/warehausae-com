#!/usr/bin/env node
/**
 * Verify every /assets/imported/ path referenced in Statamic content exists
 * locally (and optionally on Laravel Cloud object storage when AWS_URL is set).
 *
 * Usage (from repo root):
 *   node scripts/verify-imported-assets.mjs
 *   node scripts/verify-imported-assets.mjs --remote
 *
 * Exit 0 when all referenced assets exist; exit 1 otherwise.
 * Skips local checks (exit 0) when the imported/ tree is empty so CI without
 * the gitignored assets still passes — use --remote to enforce production CDN.
 *
 * --remote prefers `aws s3 ls` when AWS_BUCKET + AWS_ENDPOINT are set (fast).
 * Falls back to HTTP GET against AWS_URL when the CLI inventory is unavailable.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  IMPORTED_DIR,
  REPO_ROOT,
  collectImportedRefs,
  httpStatus,
  objectUrlForRef,
  refExistsLocally,
} from './lib/imported-assets.mjs';

function envValue(name) {
  if (process.env[name]) {
    return process.env[name].trim().replace(/^["']|["']$/g, '');
  }

  const envPath = resolve(REPO_ROOT, 'warehaus-statamic/.env');
  if (!existsSync(envPath)) {
    return '';
  }

  const match = readFileSync(envPath, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!match) {
    return '';
  }

  return match[1].trim().replace(/^["']|["']$/g, '');
}

function loadAwsEnvFromDotenv() {
  for (const key of [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_ENDPOINT',
    'AWS_BUCKET',
    'AWS_DEFAULT_REGION',
    'AWS_URL',
  ]) {
    if (!process.env[key]) {
      const value = envValue(key);
      if (value) {
        process.env[key] = value;
      }
    }
  }
}

function importedTreeHasFiles() {
  if (!existsSync(IMPORTED_DIR)) {
    return false;
  }

  try {
    return readdirSync(IMPORTED_DIR).length > 0;
  } catch {
    return false;
  }
}

/**
 * @returns {Set<string> | null} set of `/assets/imported/...` keys, or null on failure
 */
function listRemoteImportedViaAwsCli() {
  const bucket = envValue('AWS_BUCKET');
  const endpoint = envValue('AWS_ENDPOINT');
  if (!bucket || !endpoint) {
    return null;
  }

  const result = spawnSync(
    'aws',
    ['s3', 'ls', `s3://${bucket}/imported/`, '--endpoint-url', endpoint, '--recursive'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  if (result.status !== 0) {
    console.error(result.stderr || 'aws s3 ls failed');
    return null;
  }

  /** @type {Set<string>} */
  const keys = new Set();
  for (const line of result.stdout.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) {
      continue;
    }
    const key = parts.slice(3).join(' ');
    if (key.startsWith('imported/')) {
      keys.add(`/assets/${key}`);
    }
  }

  return keys;
}

loadAwsEnvFromDotenv();

const checkRemote = process.argv.includes('--remote');
const refs = collectImportedRefs();

if (refs.size === 0) {
  console.log('No /assets/imported/ references found in content.');
  process.exit(0);
}

const hasLocalTree = importedTreeHasFiles();

if (!hasLocalTree && !checkRemote) {
  console.log(
    `Skipping: ${IMPORTED_DIR} is missing or empty.\n` +
      'Populate imported assets locally, or run with --remote against object storage.',
  );
  process.exit(0);
}

/** @type {string[]} */
const missingLocal = [];
if (hasLocalTree) {
  for (const ref of [...refs.keys()].sort()) {
    if (!refExistsLocally(ref)) {
      missingLocal.push(ref);
    }
  }

  console.log(`Content references: ${refs.size} unique /assets/imported/ paths`);
  console.log(`Missing locally: ${missingLocal.length}`);
  for (const ref of missingLocal) {
    const usedIn = (refs.get(ref) ?? []).slice(0, 2).join(', ');
    console.log(`  ${ref}`);
    if (usedIn) {
      console.log(`    ← ${usedIn}`);
    }
  }
} else {
  console.log(`Content references: ${refs.size} unique /assets/imported/ paths`);
  console.log('Local imported/ tree empty — checking object storage only.');
}

/** @type {string[]} */
const missingRemote = [];
if (checkRemote) {
  console.log('\nChecking object storage …');
  const inventory = listRemoteImportedViaAwsCli();

  if (inventory) {
    console.log(`Remote inventory: ${inventory.size} objects under imported/`);
    for (const ref of [...refs.keys()].sort()) {
      if (!inventory.has(ref)) {
        missingRemote.push(ref);
      }
    }
  } else {
    const base = envValue('AWS_URL');
    if (!base) {
      console.error('AWS_URL / AWS_BUCKET not available for --remote check.');
      process.exit(1);
    }

    console.log(`Falling back to HTTP checks via ${base}`);
    let i = 0;
    for (const ref of [...refs.keys()].sort()) {
      i += 1;
      if (i % 100 === 0) {
        console.log(`  … ${i}/${refs.size}`);
      }
      const status = await httpStatus(objectUrlForRef(base, ref));
      if (status !== 200) {
        missingRemote.push(`${ref} (${status || 'network error'})`);
      }
    }
  }

  console.log(`Missing on object storage: ${missingRemote.length}`);
  for (const line of missingRemote) {
    console.log(`  ${line}`);
  }
}

const localFailed = hasLocalTree && missingLocal.length > 0;
const remoteFailed = checkRemote && missingRemote.length > 0;

if (localFailed || remoteFailed) {
  console.error('\nImported asset verification failed.');
  console.error('Fix missing files (or rewrite content URLs), then re-upload:');
  console.error('  node scripts/ensure-imported-assets.mjs');
  console.error('  bash scripts/upload-imported-to-r2.sh');
  console.error('  node scripts/verify-imported-assets.mjs --remote');
  process.exit(1);
}

console.log('\nAll referenced imported assets are present.');
process.exit(0);
