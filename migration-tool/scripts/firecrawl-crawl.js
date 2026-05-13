// Discovery crawl for warehausae.com.
//
// Calls Firecrawl's crawl endpoint in markdown-only mode against the target
// site, saves the raw response, then post-processes the returned URLs into a
// human-readable inventory grouped by detected template pattern.
//
// Usage:
//   node scripts/firecrawl-crawl.js                  # crawl + classify
//   RECLASSIFY_ONLY=1 node scripts/firecrawl-crawl.js  # reuse cached JSON,
//                                                       only rebuild inventory
//
// Required env (in migration-tool/.env):
//   FIRECRAWL_API_KEY  — paid Firecrawl key
//
// Output:
//   scraped/_discovery/crawl-result.json   raw Firecrawl response (committed)
//   scraped/_discovery/url-inventory.md    grouped inventory (committed)
//   scraped/_discovery/pages/{slug}.md     per-URL markdown (gitignored)

import 'dotenv/config';
import FirecrawlApp from '@mendable/firecrawl-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUCKETS, classify } from './lib/classify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const OUT_DIR = join(ROOT, 'scraped', '_discovery');
const PAGES_DIR = join(OUT_DIR, 'pages');
const CRAWL_JSON = join(OUT_DIR, 'crawl-result.json');

const TARGET = process.env.TARGET_SITE ?? 'https://warehausae.com';
const API_KEY = process.env.FIRECRAWL_API_KEY;
const CRAWL_LIMIT = Number(process.env.CRAWL_LIMIT ?? 500);
const RECLASSIFY_ONLY = !!process.env.RECLASSIFY_ONLY;

await mkdir(OUT_DIR, { recursive: true });
await mkdir(PAGES_DIR, { recursive: true });

let pages;
let crawlMeta = {};

if (RECLASSIFY_ONLY) {
    console.log(`Reclassify-only mode: reading ${CRAWL_JSON}`);
    const raw = JSON.parse(await readFile(CRAWL_JSON, 'utf8'));
    pages = raw.pages ?? [];
    crawlMeta = { target: raw.target, completed: raw.completed, total: raw.total };
    console.log(`Loaded ${pages.length} pages from cache.`);
} else {
    if (!API_KEY) {
        console.error('Missing FIRECRAWL_API_KEY. Copy migration-tool/.env.example to .env and fill it in.');
        process.exit(1);
    }

    const app = new FirecrawlApp({ apiKey: API_KEY });
    console.log(`Crawling ${TARGET} (limit=${CRAWL_LIMIT}) — this may take a few minutes...`);

    const result = await app.crawlUrl(TARGET, {
        limit: CRAWL_LIMIT,
        scrapeOptions: {
            formats: ['markdown'],
            onlyMainContent: true,
        },
    });

    if (!result.success) {
        console.error('Crawl failed:', result.error ?? result);
        process.exit(1);
    }

    pages = result.data ?? [];
    crawlMeta = { target: TARGET, completed: result.completed, total: result.total };
    console.log(`Crawl complete: ${pages.length} pages.`);

    await writeFile(
        CRAWL_JSON,
        JSON.stringify({ ...crawlMeta, pageCount: pages.length, pages }, null, 2),
    );

    // Per-URL markdown for spot-checks (gitignored).
    for (const page of pages) {
        const url = page.metadata?.sourceURL ?? page.metadata?.url ?? 'unknown';
        const slug = url
            .replace(/^https?:\/\//, '')
            .replace(/[^a-zA-Z0-9._-]+/g, '_')
            .slice(0, 120) || 'index';
        const body = page.markdown ?? '';
        await writeFile(join(PAGES_DIR, `${slug}.md`), `# ${url}\n\n${body}\n`);
    }
}

// ---------------------------------------------------------------------------
// URL classification (BUCKETS + classify imported from ./lib/classify.js)
// ---------------------------------------------------------------------------

const buckets = Object.fromEntries(BUCKETS.map((b) => [b, []]));

for (const page of pages) {
    const url = page.metadata?.sourceURL ?? page.metadata?.url;
    if (!url) continue;
    const bucket = classify(url);
    buckets[bucket].push(url);
}

for (const list of Object.values(buckets)) list.sort();

const expected = {
    'Homepage': '1',
    'Portfolio index (/portfolio/)': '1',
    'Portfolio category (/industry/{slug}/)': '11',
    'Project detail (/project/{slug}/)': '~100+',
    'Service detail (/services/{slug}/) — canonical': '5',
    'Team member detail (/team/{slug}/)': '?',
    'About / Culture / Careers': '3',
    'Legal': '2',
};

const lines = [
    `# warehausae.com URL inventory`,
    ``,
    `- Target: ${crawlMeta.target ?? TARGET}`,
    `- Generated: ${new Date().toISOString()}${RECLASSIFY_ONLY ? ' (reclassify-only)' : ''}`,
    `- Pages discovered: ${pages.length}`,
    ``,
    `## Summary`,
    ``,
    `| Bucket | Count | Expected (from brief) |`,
    `| --- | ---: | --- |`,
];
for (const bucket of BUCKETS) {
    const exp = expected[bucket] ?? '—';
    lines.push(`| ${bucket} | ${buckets[bucket].length} | ${exp} |`);
}
lines.push('');
lines.push('## URLs by bucket');
lines.push('');
for (const bucket of BUCKETS) {
    const urls = buckets[bucket];
    lines.push(`### ${bucket} (${urls.length})`);
    lines.push('');
    if (urls.length === 0) {
        lines.push('_(none)_');
    } else {
        for (const url of urls) lines.push(`- ${url}`);
    }
    lines.push('');
}
lines.push('## Review notes');
lines.push('');
lines.push('- [ ] Every URL in "Unknown / unclassified" has been triaged');
lines.push('- [ ] Bucket counts match brief expectations (or deviation noted)');
lines.push('- [ ] Canonical path for services confirmed (/services/{slug}/, plural)');
lines.push('- [ ] Canonical path for portfolio categories confirmed (/industry/{slug}/)');
lines.push('- [ ] Blog/News and Job collections decided (not in original brief)');
lines.push('- [ ] Legacy redirect map drafted from "Legacy / redirect candidate" buckets');
lines.push('');

await writeFile(join(OUT_DIR, 'url-inventory.md'), lines.join('\n'));

console.log('\n=== Bucket summary ===');
for (const bucket of BUCKETS) {
    console.log(`${buckets[bucket].length.toString().padStart(4)}  ${bucket}`);
}
console.log(`\nWrote ${join(OUT_DIR, 'url-inventory.md')}`);
if (!RECLASSIFY_ONLY) console.log(`Wrote ${CRAWL_JSON}`);
