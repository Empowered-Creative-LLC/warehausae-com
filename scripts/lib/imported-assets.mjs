import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const CONTENT_DIR = join(REPO_ROOT, 'warehaus-statamic/content');
export const IMPORTED_DIR = join(REPO_ROOT, 'warehaus-statamic/public/assets/imported');
export const PUBLIC_DIR = join(REPO_ROOT, 'warehaus-statamic/public');

const CONTENT_EXTS = ['.md', '.yaml', '.yml', '.html'];
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);

/**
 * @param {string} dir
 * @param {(path: string) => void} visit
 */
function walkFiles(dir, visit) {
  if (!existsSync(dir)) {
    return;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, visit);
      continue;
    }
    visit(full);
  }
}

/**
 * @returns {Map<string, string[]>} path → content files that reference it
 */
export function collectImportedRefs() {
  /** @type {Map<string, string[]>} */
  const refs = new Map();

  walkFiles(CONTENT_DIR, (filePath) => {
    const lower = filePath.toLowerCase();
    if (!CONTENT_EXTS.some((ext) => lower.endsWith(ext))) {
      return;
    }

    const text = readFileSync(filePath, 'utf8');
    const matches = text.matchAll(/\/assets\/imported\/[^\s'"\)>#]+/g);

    for (const match of matches) {
      const ref = match[0].replace(/[.,;]+$/, '');
      const list = refs.get(ref) ?? [];
      const rel = relative(REPO_ROOT, filePath);
      if (!list.includes(rel)) {
        list.push(rel);
      }
      refs.set(ref, list);
    }
  });

  return refs;
}

/**
 * @param {string} ref `/assets/imported/...`
 */
export function localPathForRef(ref) {
  return join(PUBLIC_DIR, ref);
}

/**
 * @param {string} ref
 */
export function refExistsLocally(ref) {
  try {
    return statSync(localPathForRef(ref)).isFile();
  } catch {
    return false;
  }
}

/**
 * Index imported files by normalized stem (size suffixes stripped).
 * @returns {Map<string, string[]>} stem → relative paths under imported/
 */
export function buildImportedIndex() {
  /** @type {Map<string, string[]>} */
  const index = new Map();

  walkFiles(IMPORTED_DIR, (filePath) => {
    if (filePath.includes(`${join('', '.meta')}`) || /[/\\]\.meta[/\\]/.test(filePath)) {
      return;
    }

    const ext = extname(filePath).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) {
      return;
    }

    const rel = relative(IMPORTED_DIR, filePath).replace(/\\/g, '/');
    const stem = normalizeStem(rel.split('/').pop() ?? '');
    if (!stem) {
      return;
    }

    const list = index.get(stem) ?? [];
    list.push(rel);
    index.set(stem, list);
  });

  return index;
}

/**
 * @param {string} filename
 */
export function normalizeStem(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const withoutSize = base.replace(/-\d+x\d+$/i, '');

  return withoutSize.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Prefer same directory + exact stem, then prefix family in the same folder,
 * then exact stem matches elsewhere.
 * @param {string} ref
 * @param {Map<string, string[]>} index
 * @returns {string | null} `/assets/imported/...` or null
 */
export function resolveReplacement(ref, index) {
  if (refExistsLocally(ref)) {
    return ref;
  }

  const rel = ref.replace(/^\/assets\/imported\//, '');
  const dir = dirname(rel);
  const file = rel.split('/').pop() ?? '';
  const stem = normalizeStem(file);
  const candidates = index.get(stem) ?? [];

  if (candidates.length > 0) {
    const sameDir = candidates.filter((c) => dirname(c) === dir);
    const pick = sameDir[0] ?? candidates[0];

    return `/assets/imported/${pick}`;
  }

  // Family match: same folder, longest shared alphanumeric prefix (min 10 chars).
  /** @type {string[]} */
  const siblings = [];
  for (const paths of index.values()) {
    for (const path of paths) {
      if (dirname(path) === dir) {
        siblings.push(path);
      }
    }
  }

  let best = null;
  let bestScore = 5;
  for (const sibling of siblings) {
    const siblingStem = normalizeStem(sibling.split('/').pop() ?? '');
    let score = 0;
    const limit = Math.min(stem.length, siblingStem.length);
    while (score < limit && stem[score] === siblingStem[score]) {
      score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = sibling;
    }
  }

  return best ? `/assets/imported/${best}` : null;
}

/**
 * @param {string} awsUrl
 * @param {string} ref
 */
export function objectUrlForRef(awsUrl, ref) {
  const base = awsUrl.replace(/\/$/, '');
  const key = ref.replace(/^\/assets/, '');

  return `${base}${key}`;
}

/**
 * @param {string} url
 * @returns {Promise<number>}
 */
export async function httpStatus(url) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    await res.arrayBuffer();

    return res.status;
  } catch {
    return 0;
  }
}
