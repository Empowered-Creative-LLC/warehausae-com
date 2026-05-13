// Phase 4 — full content extraction.
//
// Reads scraped/_discovery/url-status.json, picks every URL with finalStatus
// === 200, classifies each by template type, then runs Firecrawl's /scrape
// endpoint with the matching extraction schema. Writes one structured JSON
// blob + markdown body + (optional) screenshot per URL.
//
// Usage:
//   node scripts/firecrawl-extract.js                    extract everything
//   node scripts/firecrawl-extract.js --only service     just services
//   node scripts/firecrawl-extract.js --only project --limit 3  spot check
//   node scripts/firecrawl-extract.js --url <full-url>   one-off, prints JSON
//   node scripts/firecrawl-extract.js --dry-run --only service --limit 1
//     print the schema + chosen URLs without calling the API
//   node scripts/firecrawl-extract.js --cache-hit-ok --only project
//     skip URLs whose data.json already exists (resume after a failure)
//
// Required env in migration-tool/.env:
//   FIRECRAWL_API_KEY
//
// Output layout under migration-tool/scraped/{template}/{slug}/:
//   data.json        the structured Firecrawl extract result
//   page.md          the markdown body Firecrawl scraped
//   images.txt       deduped image URL list (built from data.json + markdown)
//   page.png         optional full-page screenshot (only when SCREENSHOT=1)

import 'dotenv/config';
import FirecrawlApp from '@mendable/firecrawl-js';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { templateForCanonicalUrl, slugFromUrl } from './lib/classify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const STATUS_JSON = join(ROOT, 'scraped', '_discovery', 'url-status.json');
const SCHEMAS_DIR = join(ROOT, 'schemas');
const OUT_ROOT = join(ROOT, 'scraped');

const API_KEY = process.env.FIRECRAWL_API_KEY;
const WANT_SCREENSHOT = !!process.env.SCREENSHOT;
// Firecrawl proxy mode: "basic" (default, fast, cheap) or "stealth" (slower,
// residential, bypasses Cloudflare bot challenges). The live WP site
// frequently serves Cloudflare 504s to basic crawls, so default to stealth.
const PROXY = process.env.FIRECRAWL_PROXY ?? 'stealth';

// --- argv parsing ---------------------------------------------------------
const argv = process.argv.slice(2);
const args = { only: null, limit: Infinity, url: null, dryRun: false, cacheHitOk: false };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') args.only = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--url') args.url = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--cache-hit-ok') args.cacheHitOk = true;
    else if (a === '-h' || a === '--help') {
        console.log('See header comment of this file for usage.');
        process.exit(0);
    } else {
        console.error(`Unknown argument: ${a}`);
        process.exit(1);
    }
}

// --- schema loader --------------------------------------------------------
const SCHEMA_CACHE = new Map();
async function loadSchema(template) {
    if (SCHEMA_CACHE.has(template)) return SCHEMA_CACHE.get(template);
    const path = join(SCHEMAS_DIR, `${template}.json`);
    try {
        const json = JSON.parse(await readFile(path, 'utf8'));
        SCHEMA_CACHE.set(template, json);
        return json;
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

// --- URL selection --------------------------------------------------------
async function selectUrls() {
    if (args.url) {
        const template = templateForCanonicalUrl(args.url);
        return [{ url: args.url, template }];
    }
    const status = JSON.parse(await readFile(STATUS_JSON, 'utf8'));
    const all = status.results
        .filter((r) => r.finalStatus === 200)
        // url-status.json's `source` is the original crawl URL. For
        // extraction we want the actual canonical URL (after redirects),
        // which is `finalUrl`.
        .map((r) => ({ url: r.finalUrl, template: templateForCanonicalUrl(r.finalUrl) }))
        .filter((r) => r.template);

    // De-dupe by url (multiple legacy URLs can collapse to one final).
    const seen = new Set();
    const deduped = [];
    for (const r of all) {
        if (seen.has(r.url)) continue;
        seen.add(r.url);
        deduped.push(r);
    }

    let filtered = deduped;
    if (args.only) filtered = deduped.filter((r) => r.template === args.only);
    return filtered.slice(0, args.limit);
}

// --- Firecrawl scrape -----------------------------------------------------
async function scrapeOnce(app, url, schema) {
    const formats = ['markdown'];
    if (WANT_SCREENSHOT) formats.push('screenshot@fullPage');
    const params = { formats, proxy: PROXY, timeout: 60000 };
    if (schema) {
        // Firecrawl v1 SDK accepts an extract option alongside formats. The
        // SDK exposes both legacy `extract` and the formats-as-objects API;
        // we use the explicit option here which the SDK forwards as the
        // jsonOptions/extract payload depending on plan.
        params.formats.push('json');
        params.jsonOptions = {
            schema: schema.schema,
            systemPrompt: schema.systemPrompt,
            prompt: schema.prompt,
        };
    }
    return app.scrapeUrl(url, params);
}

// The live WP site occasionally returns a Cloudflare 5xx gateway page that
// Firecrawl scrapes verbatim. Detect it from the markdown body so we know to
// retry instead of saving garbage.
function looksLikeCloudflareError(markdown) {
    if (!markdown) return false;
    if (markdown.length > 3000) return false; // real pages are bigger
    return /Cloudflare Ray ID|gateway time-out|gateway-time-out|error 5\d\d|cloudflare\.com\/5xx/i.test(markdown);
}

async function scrape(app, url, schema) {
    const maxAttempts = 4;
    let delayMs = 1500;
    let last;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        last = await scrapeOnce(app, url, schema);
        if (!last.success) return last;
        if (!looksLikeCloudflareError(last.markdown)) return last;
        if (attempt === maxAttempts) break;
        process.stderr.write(`(cf-${attempt} retry in ${delayMs}ms) `);
        await new Promise((r) => setTimeout(r, delayMs));
        delayMs *= 2;
    }
    return last;
}

// --- Per-URL extract -------------------------------------------------------
async function extractOne(app, url, template) {
    const slug = slugFromUrl(url);
    const outDir = join(OUT_ROOT, template, slug);
    const outData = join(outDir, 'data.json');

    if (args.cacheHitOk) {
        try {
            await stat(outData);
            return { url, template, slug, status: 'cached' };
        } catch {
            /* not cached, fall through */
        }
    }

    const schema = await loadSchema(template);
    if (!schema) return { url, template, slug, status: 'no-schema' };

    if (args.dryRun) {
        return { url, template, slug, status: 'dry-run', schemaKeys: Object.keys(schema.schema?.properties ?? {}) };
    }

    await mkdir(outDir, { recursive: true });
    const result = await scrape(app, url, schema);
    if (!result.success) {
        await writeFile(join(outDir, 'error.json'), JSON.stringify(result, null, 2));
        return { url, template, slug, status: 'error', error: result.error ?? 'unknown' };
    }
    if (looksLikeCloudflareError(result.markdown)) {
        // Don't cache a CF-error result — leave data.json absent so a later
        // run with --cache-hit-ok re-fetches this URL.
        await writeFile(join(outDir, 'cf-error.txt'), result.markdown ?? '');
        return { url, template, slug, status: 'error', error: 'cloudflare-5xx' };
    }

    const md = result.markdown ?? '';
    const json = result.json ?? result.extract ?? null;
    const screenshot = result.screenshot ?? null;

    await writeFile(outData, JSON.stringify({ url, template, extractedAt: new Date().toISOString(), data: json, metadata: result.metadata ?? null }, null, 2));
    await writeFile(join(outDir, 'page.md'), md);

    // Collect image URLs from both the JSON extract and the markdown body.
    const images = new Set();
    const walk = (v) => {
        if (!v) return;
        if (typeof v === 'string') {
            if (/^https?:\/\/.*\.(jpe?g|png|webp|gif|svg|avif)/i.test(v)) images.add(v);
            return;
        }
        if (Array.isArray(v)) v.forEach(walk);
        else if (typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(json);
    for (const m of md.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g)) images.add(m[1]);
    await writeFile(join(outDir, 'images.txt'), [...images].sort().join('\n') + '\n');

    if (screenshot) {
        // Firecrawl returns a URL — we don't need to refetch, just store it.
        await writeFile(join(outDir, 'screenshot-url.txt'), screenshot + '\n');
    }

    return { url, template, slug, status: 'ok', imageCount: images.size, bodyChars: md.length };
}

// --- main ------------------------------------------------------------------
const targets = await selectUrls();
if (!targets.length) {
    console.log('No URLs matched. Check --only / --limit / --url flags.');
    process.exit(0);
}

console.log(`Selected ${targets.length} URL(s)${args.only ? ` (template=${args.only})` : ''}.`);

if (!args.dryRun) {
    if (!API_KEY) {
        console.error('Missing FIRECRAWL_API_KEY in migration-tool/.env.');
        process.exit(1);
    }
}

const app = !args.dryRun ? new FirecrawlApp({ apiKey: API_KEY }) : null;

let ok = 0;
let cached = 0;
let errored = 0;
let noSchema = 0;

for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    process.stdout.write(`[${(i + 1).toString().padStart(3)}/${targets.length}] ${t.template.padEnd(20)} ${t.url} ... `);
    try {
        const r = await extractOne(app, t.url, t.template);
        if (r.status === 'ok') {
            ok++;
            console.log(`ok (${r.imageCount} imgs, ${r.bodyChars} chars)`);
        } else if (r.status === 'cached') {
            cached++;
            console.log('cached');
        } else if (r.status === 'no-schema') {
            noSchema++;
            console.log('no schema yet (skipped)');
        } else if (r.status === 'dry-run') {
            console.log(`dry-run, schema fields: ${r.schemaKeys.join(', ')}`);
        } else {
            errored++;
            console.log(`error: ${r.error}`);
        }
    } catch (err) {
        errored++;
        console.log(`exception: ${err.message ?? err}`);
    }
}

console.log(`\nSummary: ok=${ok}, cached=${cached}, no-schema=${noSchema}, errored=${errored}`);
