// Discovery crawl for warehausae.com.
//
// Calls Firecrawl's crawl endpoint in markdown-only mode against the target
// site, saves the raw response, then post-processes the returned URLs into a
// human-readable inventory grouped by detected template pattern.
//
// Usage:
//   node scripts/firecrawl-crawl.js
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
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const OUT_DIR = join(ROOT, 'scraped', '_discovery');
const PAGES_DIR = join(OUT_DIR, 'pages');

const TARGET = process.env.TARGET_SITE ?? 'https://warehausae.com';
const API_KEY = process.env.FIRECRAWL_API_KEY;
const CRAWL_LIMIT = Number(process.env.CRAWL_LIMIT ?? 500);

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

const pages = result.data ?? [];
console.log(`Crawl complete: ${pages.length} pages.`);

await mkdir(OUT_DIR, { recursive: true });
await mkdir(PAGES_DIR, { recursive: true });

await writeFile(
    join(OUT_DIR, 'crawl-result.json'),
    JSON.stringify(
        { target: TARGET, completed: result.completed, total: result.total, pageCount: pages.length, pages },
        null,
        2,
    ),
);

// Drop per-URL markdown for spot-checks (gitignored alongside scraped/).
for (const page of pages) {
    const url = page.metadata?.sourceURL ?? page.metadata?.url ?? 'unknown';
    const slug = url
        .replace(/^https?:\/\//, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 120) || 'index';
    const body = page.markdown ?? '';
    await writeFile(join(PAGES_DIR, `${slug}.md`), `# ${url}\n\n${body}\n`);
}

// Classify URLs by path pattern.
const buckets = {
    'Homepage': [],
    'Portfolio index': [],
    'Portfolio category': [],
    'Project detail': [],
    'Service detail': [],
    'Team member detail': [],
    'About / Culture / Careers': [],
    'Legal': [],
    'WordPress internals (skip)': [],
    'Unknown / unclassified': [],
};

const legalPatterns = [/privacy/i, /terms/i, /cookie/i, /disclaimer/i];
const wpPatterns = [
    /^\/wp-/, /^\/feed/, /^\/xmlrpc/, /\/cdn-cgi\//, /^\/\?p=/, /^\/page\/\d+/,
    /^\/author\//, /^\/tag\//, /^\/category\//, /^\/comments\//, /^\/wp-json\//,
];

function classify(rawUrl) {
    let path;
    try {
        path = new URL(rawUrl).pathname.replace(/\/+$/, '') || '/';
    } catch {
        return 'Unknown / unclassified';
    }

    if (path === '/' || path === '/home' || path === '/index') return 'Homepage';
    if (wpPatterns.some((re) => re.test(path))) return 'WordPress internals (skip)';
    if (path === '/portfolio') return 'Portfolio index';
    if (/^\/portfolio\/[^/]+$/.test(path)) return 'Portfolio category';
    if (/^\/project\/[^/]+$/.test(path)) return 'Project detail';
    if (/^\/(service|services)\/[^/]+$/.test(path)) return 'Service detail';
    if (/^\/team\/[^/]+$/.test(path)) return 'Team member detail';
    if (path === '/about' || path === '/culture' || path === '/careers') {
        return 'About / Culture / Careers';
    }
    if (legalPatterns.some((re) => re.test(path))) return 'Legal';
    return 'Unknown / unclassified';
}

for (const page of pages) {
    const url = page.metadata?.sourceURL ?? page.metadata?.url;
    if (!url) continue;
    const bucket = classify(url);
    buckets[bucket].push(url);
}

for (const list of Object.values(buckets)) list.sort();

const expected = {
    'Homepage': 1,
    'Portfolio index': 1,
    'Portfolio category': 11,
    'Project detail': '~100+',
    'Service detail': 5,
    'Team member detail': '?',
    'About / Culture / Careers': 3,
    'Legal': 2,
};

const lines = [
    `# warehausae.com URL inventory`,
    ``,
    `- Target: ${TARGET}`,
    `- Crawl run: ${new Date().toISOString()}`,
    `- Pages discovered: ${pages.length}`,
    ``,
    `## Summary`,
    ``,
    `| Bucket | Count | Expected (from brief) |`,
    `| --- | ---: | --- |`,
];
for (const [bucket, urls] of Object.entries(buckets)) {
    const exp = expected[bucket] ?? '—';
    lines.push(`| ${bucket} | ${urls.length} | ${exp} |`);
}
lines.push('');
lines.push('## URLs by bucket');
lines.push('');
for (const [bucket, urls] of Object.entries(buckets)) {
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
lines.push('- [ ] Path shape for services confirmed (/service/ vs /services/)');
lines.push('- [ ] Any URL patterns suggesting template variants beyond the brief have been flagged');
lines.push('');

await writeFile(join(OUT_DIR, 'url-inventory.md'), lines.join('\n'));

console.log('\n=== Bucket summary ===');
for (const [bucket, urls] of Object.entries(buckets)) {
    console.log(`${urls.length.toString().padStart(4)}  ${bucket}`);
}
console.log(`\nWrote ${join(OUT_DIR, 'url-inventory.md')}`);
console.log(`Wrote ${join(OUT_DIR, 'crawl-result.json')}`);
