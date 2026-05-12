// HEAD-check every URL in the discovery crawl to determine its current
// behavior on the live WordPress site:
//
//   - 200 (final)         => canonical, must be preserved at this exact path
//   - 301 / 302           => already-handled redirect on the live site; we
//                            don't need to recreate the redirect on the new
//                            Statamic site, we just serve the destination
//   - 404 / 5xx           => dead URL; ignore
//
// Output:
//   scraped/_discovery/url-status.json   raw HEAD results
//   scraped/_discovery/canonical-url-map.md  human-readable map grouped by
//     "must preserve at this exact path" vs "redirected (no action needed)"

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const OUT_DIR = join(ROOT, 'scraped', '_discovery');
const CRAWL_JSON = join(OUT_DIR, 'crawl-result.json');
const STATUS_JSON = join(OUT_DIR, 'url-status.json');
const MAP_MD = join(OUT_DIR, 'canonical-url-map.md');

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 10);

const crawl = JSON.parse(await readFile(CRAWL_JSON, 'utf8'));
const sources = [
    ...new Set(
        (crawl.pages ?? [])
            .map((p) => p.metadata?.sourceURL ?? p.metadata?.url)
            .filter(Boolean),
    ),
].sort();

console.log(`HEAD-checking ${sources.length} URLs at concurrency=${CONCURRENCY}...`);

async function check(url) {
    try {
        // Manual redirect so we capture the chain instead of just the final.
        const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
        const status = res.status;
        const location = res.headers.get('location') ?? null;

        // Some servers don't allow HEAD; fall back to GET.
        if (status === 405 || status === 501) {
            const r2 = await fetch(url, { method: 'GET', redirect: 'manual' });
            return { url, status: r2.status, location: r2.headers.get('location') ?? null };
        }
        return { url, status, location };
    } catch (err) {
        return { url, status: 0, location: null, error: String(err) };
    }
}

async function followChain(url, maxHops = 5) {
    const hops = [];
    let current = url;
    for (let i = 0; i <= maxHops; i++) {
        const r = await check(current);
        hops.push(r);
        if (r.status >= 300 && r.status < 400 && r.location) {
            current = new URL(r.location, current).toString();
            continue;
        }
        break;
    }
    return hops;
}

const results = [];
const queue = sources.slice();
const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
        const url = queue.shift();
        if (!url) return;
        const chain = await followChain(url);
        const final = chain[chain.length - 1];
        results.push({ source: url, finalUrl: final.url, finalStatus: final.status, chain });
        if (results.length % 25 === 0) {
            console.log(`  ${results.length}/${sources.length} checked`);
        }
    }
});
await Promise.all(workers);
results.sort((a, b) => a.source.localeCompare(b.source));

await mkdir(OUT_DIR, { recursive: true });
await writeFile(STATUS_JSON, JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));

// Classify.
const canonical200 = []; // source returned 200 directly; the source IS the canonical
const redirected = []; // source returned 3xx; the live site already redirects
const dead = []; // source returned 4xx/5xx/0
const protocolOnly = []; // source's chain only differs by http→https

for (const r of results) {
    const hops = r.chain;
    const first = hops[0];
    if (first.status >= 200 && first.status < 300) {
        canonical200.push(r);
    } else if (first.status >= 300 && first.status < 400) {
        // Check whether the only "redirect" is http→https of the same path.
        const srcU = new URL(r.source);
        try {
            const dstU = new URL(r.finalUrl);
            if (
                srcU.host === dstU.host &&
                srcU.pathname.replace(/\/+$/, '') === dstU.pathname.replace(/\/+$/, '') &&
                srcU.protocol === 'http:' &&
                dstU.protocol === 'https:'
            ) {
                protocolOnly.push(r);
                continue;
            }
        } catch {
            /* fall through */
        }
        redirected.push(r);
    } else {
        dead.push(r);
    }
}

const lines = [
    `# warehausae.com canonical URL map`,
    ``,
    `- Generated: ${new Date().toISOString()}`,
    `- URLs checked: ${results.length}`,
    `- 200 OK (canonical, must preserve at this exact path): ${canonical200.length}`,
    `- 3xx http→https only (preserve canonical https path): ${protocolOnly.length}`,
    `- 3xx redirected elsewhere (existing site handles, no action needed on new site): ${redirected.length}`,
    `- Dead (4xx/5xx/network): ${dead.length}`,
    ``,
    `## Must preserve at exact path (200 OK)`,
    ``,
    `These URLs are live on the existing WP site. The new Statamic site MUST serve`,
    `each one at the same path to avoid introducing 301s.`,
    ``,
];
for (const r of canonical200) lines.push(`- ${r.source}`);

lines.push('', `## http→https only — preserve canonical https path (${protocolOnly.length})`, '');
for (const r of protocolOnly) lines.push(`- ${r.source}  →  ${r.finalUrl}`);

lines.push('', `## Already-handled redirects on live site (${redirected.length})`, '');
lines.push(
    'These URLs currently 301/302 on the WP site. The new Statamic site only needs',
    'to serve the FINAL destination at its canonical path — we do not need to',
    "recreate the legacy redirect chains.",
    '',
);
for (const r of redirected) {
    const chainStr = r.chain
        .map((h) => `${h.status}${h.location ? ' → ' : ''}${h.location ?? ''}`)
        .filter(Boolean)
        .join(' | ');
    lines.push(`- ${r.source}`);
    lines.push(`  - final: ${r.finalUrl} (${r.finalStatus})`);
    lines.push(`  - chain: ${chainStr}`);
}

lines.push('', `## Dead / error (${dead.length})`, '');
for (const r of dead) lines.push(`- ${r.source} → ${r.finalStatus}${r.chain[0]?.error ? ` (${r.chain[0].error})` : ''}`);

await writeFile(MAP_MD, lines.join('\n'));

console.log(`\n=== Status summary ===`);
console.log(`  200 canonical (preserve exactly): ${canonical200.length}`);
console.log(`  3xx http→https only            : ${protocolOnly.length}`);
console.log(`  3xx redirected elsewhere       : ${redirected.length}`);
console.log(`  dead / error                   : ${dead.length}`);
console.log(`\nWrote ${MAP_MD}`);
console.log(`Wrote ${STATUS_JSON}`);
