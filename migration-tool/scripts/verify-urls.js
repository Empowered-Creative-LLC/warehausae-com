// Phase 6 acceptance test: HEAD-check every canonical URL on the local
// Statamic dev server and assert it returns 200 (no redirects, no 404s).
//
// Usage:
//   node scripts/verify-urls.js               default base: http://localhost:8000
//   BASE=http://localhost:8000 node scripts/verify-urls.js
//
// Reads canonical URLs from scraped/_discovery/url-status.json (entries
// where finalStatus === 200) and rewrites the host to the BASE.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const STATUS_JSON = join(ROOT, 'scraped', '_discovery', 'url-status.json');
const BASE = process.env.BASE ?? 'http://localhost:8000';
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 10);

const status = JSON.parse(await readFile(STATUS_JSON, 'utf8'));
const canonicalUrls = [...new Set(
    status.results
        .filter((r) => r.finalStatus === 200)
        .map((r) => r.finalUrl),
)].sort();

// Skip WP-cruft URLs that we explicitly do not preserve.
const SKIP_PATTERNS = [
    /^https?:\/\/warehausae\.com\/author\//,
    /^https?:\/\/warehausae\.com\/tag\//,
    /^https?:\/\/warehausae\.com\/elementor-/,
    /^https?:\/\/warehausae\.com\/themencode-/,
    /^https?:\/\/warehausae\.com\/unlimited-charts-/,
    /^https?:\/\/warehausae\.com\/layout\//,
    /^https?:\/\/warehausae\.com\/service\//, // 200 archive pages, not editorial
];

const targets = canonicalUrls.filter((u) => !SKIP_PATTERNS.some((re) => re.test(u)));
const skipped = canonicalUrls.length - targets.length;
console.log(`Checking ${targets.length} editorial URLs against ${BASE} (${skipped} WP-system URLs skipped)`);

const results = [];
const queue = targets.slice();
const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
        const sourceUrl = queue.shift();
        if (!sourceUrl) return;
        const path = new URL(sourceUrl).pathname;
        const target = BASE + path;
        try {
            const res = await fetch(target, { method: 'HEAD', redirect: 'manual' });
            results.push({ path, status: res.status });
        } catch (err) {
            results.push({ path, status: 0, error: String(err) });
        }
    }
});
await Promise.all(workers);
results.sort((a, b) => a.path.localeCompare(b.path));

const byStatus = {};
for (const r of results) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

console.log('\n=== Status histogram ===');
for (const [s, n] of Object.entries(byStatus).sort()) {
    console.log(`  ${s}: ${n}`);
}

const notOk = results.filter((r) => r.status !== 200);
if (notOk.length) {
    console.log(`\n=== Non-200 (${notOk.length}) ===`);
    for (const r of notOk.slice(0, 50)) {
        console.log(`  ${r.status.toString().padStart(3)}  ${r.path}`);
    }
    if (notOk.length > 50) console.log(`  ... and ${notOk.length - 50} more`);
}

console.log(`\nTotal: ${results.length}, 200 OK: ${results.filter((r) => r.status === 200).length}`);

process.exit(notOk.length === 0 ? 0 : 1);
