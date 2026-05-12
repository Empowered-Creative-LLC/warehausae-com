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
// URL classification
// ---------------------------------------------------------------------------

const BUCKETS = [
    'Homepage',
    'Portfolio index (/portfolio/)',
    'Portfolio category (/industry/{slug}/)',
    'Project detail (/project/{slug}/)',
    'Project sub-page (/project/{slug}/{n}/)',
    'Service detail (/services/{slug}/) — canonical',
    'Service detail (/service/{slug}/) — legacy',
    'Services index',
    'Team member detail (/team/{slug}/)',
    'About / Culture / Careers',
    'Job posting (/job/{slug}/)',
    'Blog / News category index (/Industries/{slug}/)',
    'Blog / News post',
    'Case study (/case-study/{slug}/)',
    'Legal',
    'Legacy / redirect candidate (flat industry slug)',
    'Legacy / redirect candidate (/work/, /work__trashed/)',
    'WordPress / plugin internals (skip)',
    'One-off landing page',
    'Unknown / unclassified',
];

const buckets = Object.fromEntries(BUCKETS.map((b) => [b, []]));

// Known canonical industry slugs (used to detect legacy flat URLs).
const INDUSTRY_SLUGS = new Set([
    'adaptive-reuse',
    'arts-and-culture',
    'building-sciences',
    'civil-engineering',
    'distribution-and-manufacturing',
    'education',
    'healthcare',
    'historic',
    'multi-family',
    'municipal',
    'retail-and-hospitality',
    // Legacy underscore/alternate spellings that show up flat:
    'arts_culture',
    'corporate-office',
    'distribution_manufacturing',
    'multi-family',
    'residential-development',
    'retail_hospitality',
]);

const legalPatterns = [/privacy/i, /^\/terms/i, /cookie/i, /disclaimer/i];

// WordPress internals + plugin pages + Elementor previews + trashed/orphaned.
const wpInternalPatterns = [
    /^\/wp-/, /^\/feed/, /^\/xmlrpc/, /\/cdn-cgi\//, /^\/\?p=/, /^\/page\/\d+/,
    /^\/author\//, /^\/tag\//, /^\/category\//, /^\/comments\//, /^\/wp-json\//,
    /^\/elementor-/, /^\/themencode-/, /^\/unlimited-charts-/, /^\/layout\//,
    /^\/work__trashed/,
];

// "Article-like" slugs we treat as Blog/News posts — single-segment URLs that
// look like marketing/news content (long descriptive slug, no parent path).
function looksLikeNewsPost(path) {
    if (path.split('/').filter(Boolean).length !== 1) return false;
    if (!/^[a-z0-9_-]+$/.test(path.slice(1))) return false;
    // Heuristics: matches typical announcement slugs warehaus uses.
    if (/^\/warehaus-/.test(path)) return true;
    if (/^\/press_release/.test(path)) return true;
    if (/^\/case-study-/.test(path)) return true;
    return false;
}

// One-off landing pages — single-segment, descriptive, but neither industry
// nor news.
const ONE_OFF_LANDINGS = new Set([
    '/future-architects-and-engineers',
    '/get-rewarded-for-referrals',
    '/happyholidays',
    '/harrisburg-project-map',
    '/interiors_visit',
    '/lunch-and-learns',
]);

function classify(rawUrl) {
    let path;
    try {
        path = new URL(rawUrl).pathname.replace(/\/+$/, '') || '/';
    } catch {
        return 'Unknown / unclassified';
    }

    if (path === '/' || path === '/home' || path === '/index') return 'Homepage';
    if (wpInternalPatterns.some((re) => re.test(path))) return 'WordPress / plugin internals (skip)';

    if (path === '/portfolio') return 'Portfolio index (/portfolio/)';
    if (path === '/services') return 'Services index';

    if (/^\/industry\/[^/]+$/.test(path)) return 'Portfolio category (/industry/{slug}/)';
    if (/^\/Industries\/[^/]+$/.test(path)) return 'Blog / News category index (/Industries/{slug}/)';

    if (/^\/project\/[^/]+$/.test(path)) return 'Project detail (/project/{slug}/)';
    if (/^\/project\/[^/]+\/\d+$/.test(path)) return 'Project sub-page (/project/{slug}/{n}/)';

    if (/^\/services\/[^/]+$/.test(path)) return 'Service detail (/services/{slug}/) — canonical';
    if (/^\/service\/[^/]+$/.test(path)) return 'Service detail (/service/{slug}/) — legacy';

    if (/^\/team\/[^/]+$/.test(path)) return 'Team member detail (/team/{slug}/)';
    if (path === '/about' || path === '/culture' || path === '/careers') {
        return 'About / Culture / Careers';
    }
    if (/^\/job\/[^/]+$/.test(path)) return 'Job posting (/job/{slug}/)';
    if (/^\/case-study\/[^/]+$/.test(path)) return 'Case study (/case-study/{slug}/)';
    if (legalPatterns.some((re) => re.test(path))) return 'Legal';
    if (/^\/work\/[^/]+$/.test(path)) return 'Legacy / redirect candidate (/work/, /work__trashed/)';

    // Flat single-segment URLs that look like legacy industry pages.
    if (path.split('/').filter(Boolean).length === 1) {
        const slug = path.slice(1);
        if (INDUSTRY_SLUGS.has(slug)) return 'Legacy / redirect candidate (flat industry slug)';
        if (ONE_OFF_LANDINGS.has(path)) return 'One-off landing page';
        if (looksLikeNewsPost(path)) return 'Blog / News post';
    }

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
