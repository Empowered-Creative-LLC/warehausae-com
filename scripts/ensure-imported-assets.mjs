#!/usr/bin/env node
/**
 * Ensure content-referenced /assets/imported/ files exist locally:
 * 1. Try downloading from the live WordPress uploads path
 * 2. If that fails, rewrite content URLs to an existing same-stem file
 *
 * Usage (from repo root):
 *   node scripts/ensure-imported-assets.mjs
 *   node scripts/ensure-imported-assets.mjs --dry-run
 *
 * Afterward, upload to R2:
 *   bash scripts/upload-imported-to-r2.sh
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import {
  REPO_ROOT,
  buildImportedIndex,
  collectImportedRefs,
  localPathForRef,
  refExistsLocally,
  resolveReplacement,
} from './lib/imported-assets.mjs';

const LIVE_UPLOADS = 'https://warehausae.com/wp-content/uploads/';
const dryRun = process.argv.includes('--dry-run');

const refs = collectImportedRefs();
const index = buildImportedIndex();

let downloaded = 0;
let rewritten = 0;
let unresolved = 0;
/** @type {Map<string, string>} oldRef → newRef */
const rewrites = new Map();
/** @type {string[]} */
const stillMissing = [];

async function downloadRef(ref) {
  const localPath = localPathForRef(ref);
  const tail = ref.replace(/^\/assets\/imported\//, '');
  const remote = LIVE_UPLOADS + tail;

  const res = await fetch(remote, {
    headers: { 'User-Agent': 'Mozilla/5.0 (warehaus-ensure-imported-assets)' },
    redirect: 'follow',
  });

  if (!res.ok || !res.body) {
    return false;
  }

  if (dryRun) {
    return true;
  }

  mkdirSync(dirname(localPath), { recursive: true });
  await pipeline(res.body, createWriteStream(localPath));

  return true;
}

/**
 * Copy an existing local asset into the exact path content expects.
 * Prefer this over rewriting when the replacement is the same logical image
 * (extension / size-variant swap).
 * @param {string} missingRef
 * @param {string} existingRef
 */
function materializeRef(missingRef, existingRef) {
  const dest = localPathForRef(missingRef);
  const src = localPathForRef(existingRef);

  if (dryRun) {
    return true;
  }

  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);

  return true;
}

function sameLogicalImage(missingRef, existingRef) {
  const a = missingRef.replace(/^\/assets\/imported\//, '');
  const b = existingRef.replace(/^\/assets\/imported\//, '');
  const aBase = a.split('/').pop() ?? '';
  const bBase = b.split('/').pop() ?? '';

  // Exact stem match (e.g. .jpg vs .webp, or size-variant swap) → safe to copy.
  const stemA = aBase.replace(/-\d+x\d+/i, '').replace(/\.[^.]+$/, '').toLowerCase();
  const stemB = bBase.replace(/-\d+x\d+/i, '').replace(/\.[^.]+$/, '').toLowerCase();

  return stemA === stemB;
}

/**
 * Last resort: reuse another imported image that already exists and is
 * referenced in one of the same content files.
 * @param {string} missingRef
 * @param {Map<string, string[]>} allRefs
 */
function resolveFromSameContentFile(missingRef, allRefs) {
  const files = allRefs.get(missingRef) ?? [];

  for (const rel of files) {
    const abs = join(REPO_ROOT, rel);
    const text = readFileSync(abs, 'utf8');
    const candidates = [...text.matchAll(/\/assets\/imported\/[^\s'"\)>#]+/g)]
      .map((m) => m[0].replace(/[.,;]+$/, ''))
      .filter((ref) => ref !== missingRef && refExistsLocally(ref));

    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  return null;
}

for (const ref of [...refs.keys()].sort()) {
  if (refExistsLocally(ref)) {
    continue;
  }

  process.stdout.write(`Missing ${ref} … `);

  if (await downloadRef(ref)) {
    downloaded += 1;
    console.log(dryRun ? 'would download from WP' : 'downloaded from WP');
    continue;
  }

  const replacement = resolveReplacement(ref, index);
  if (replacement && replacement !== ref) {
    if (sameLogicalImage(ref, replacement)) {
      materializeRef(ref, replacement);
      downloaded += 1;
      console.log(
        dryRun
          ? `would copy from ${replacement}`
          : `copied from ${replacement}`,
      );
      continue;
    }

    rewrites.set(ref, replacement);
    console.log(`rewrite → ${replacement}`);
    continue;
  }

  const sameFileAlt = resolveFromSameContentFile(ref, refs);
  if (sameFileAlt) {
    rewrites.set(ref, sameFileAlt);
    console.log(`rewrite (same file) → ${sameFileAlt}`);
    continue;
  }

  unresolved += 1;
  stillMissing.push(ref);
  console.log('UNRESOLVED');
}

if (rewrites.size > 0) {
  /** @type {Map<string, string>} path → text */
  const files = new Map();

  for (const [oldRef, newRef] of rewrites) {
    for (const rel of refs.get(oldRef) ?? []) {
      const abs = join(REPO_ROOT, rel);
      if (!files.has(abs)) {
        files.set(abs, readFileSync(abs, 'utf8'));
      }
      files.set(abs, files.get(abs).split(oldRef).join(newRef));
    }
  }

  for (const [abs, text] of files) {
    if (dryRun) {
      console.log(`would rewrite ${abs}`);
    } else {
      writeFileSync(abs, text);
      console.log(`rewrote ${abs}`);
    }
    rewritten += 1;
  }
}

console.log('\nSummary');
console.log(`  downloaded/copied: ${downloaded}`);
console.log(`  content rewrites:  ${rewrites.size} refs across ${rewritten} files`);
console.log(`  unresolved:        ${unresolved}`);

if (stillMissing.length > 0) {
  console.error('\nStill missing — fix these manually before uploading:');
  for (const ref of stillMissing) {
    console.error(`  ${ref}`);
  }
  process.exit(1);
}

if (dryRun) {
  console.log('\nDry run complete — re-run without --dry-run to apply.');
} else {
  console.log('\nLocal assets ready. Upload with:');
  console.log('  bash scripts/upload-imported-to-r2.sh');
  console.log('  node scripts/verify-imported-assets.mjs --remote');
}
