// Phase 6 — import extracted JSON into Statamic content files.
//
// For each entry under migration-tool/scraped/{template}/{slug}/data.json:
//   1. Build a Statamic content file (YAML front-matter only — no body
//      markdown, since blueprint fields hold all data) at
//      warehaus-statamic/content/collections/{collection}/{slug}.md
//   2. Download every WP-hosted image referenced in the data to
//      warehaus-statamic/public/assets/imported/{yyyy}/{mm}/{file}
//   3. Rewrite https://warehausae.com/wp-content/uploads/{yyyy}/{mm}/{file}
//      references in any string fields to /assets/imported/{yyyy}/{mm}/{file}
//      so the placeholder views show real images.
//   4. Preserve the original WP URL as source_url for traceability.
//   5. For collections with per-entry URLs (pages, portfolio_categories,
//      case_studies, news_posts), set the url: field to the canonical URL
//      from url-status.json.
//
// Usage:
//   node scripts/import-to-statamic.js                 import everything
//   node scripts/import-to-statamic.js --only services import just services
//   node scripts/import-to-statamic.js --dry-run       no files written
//   node scripts/import-to-statamic.js --no-images     skip image download
//
// Output:
//   warehaus-statamic/content/collections/{collection}/{slug}.md
//   warehaus-statamic/public/assets/imported/{yyyy}/{mm}/{file}

import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import yaml from 'js-yaml';

import { slugFromUrl } from './lib/classify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const SCRAPED = join(ROOT, 'scraped');
const APP = join(ROOT, '..', 'warehaus-statamic');
const COLLECTIONS = join(APP, 'content', 'collections');
const ASSETS = join(APP, 'public', 'assets', 'imported');
const STATUS_JSON = join(SCRAPED, '_discovery', 'url-status.json');

// template → collection
const TEMPLATE_TO_COLLECTION = {
    service: 'services',
    team_member: 'team_members',
    portfolio_category: 'portfolio_categories',
    project: 'projects',
    job_posting: 'job_postings',
    case_study: 'case_studies',
    news_post: 'news_posts',
    page: 'pages',
    homepage: 'pages',
    industries_category: 'industries_categories',
};

// Plus industries_categories, because Laravel/Statamic routing appears to
// lowercase URLs derived from collection routes, so /Industries/{slug} won't
// match the original capitalization unless the entry sets its url: field
// explicitly.
const PER_ENTRY_URL_COLLECTIONS = new Set(['pages', 'portfolio_categories', 'case_studies', 'news_posts', 'industries_categories']);

const argv = process.argv.slice(2);
const args = { only: null, dryRun: false, noImages: false };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') args.only = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-images') args.noImages = true;
}

// Build URL → canonical map from url-status.json.
let CANONICAL_URL_BY_FINAL = new Map();
try {
    const status = JSON.parse(await readFile(STATUS_JSON, 'utf8'));
    for (const r of status.results) {
        if (r.finalStatus === 200) CANONICAL_URL_BY_FINAL.set(r.finalUrl, r.finalUrl);
    }
} catch (err) {
    console.warn(`Could not read url-status.json: ${err.message}`);
}

// Convert an absolute warehausae.com URL to the path Statamic should serve it
// at. We strip the protocol+host and ensure a trailing slash.
function urlToStatamicPath(absUrl) {
    try {
        const u = new URL(absUrl);
        let path = u.pathname;
        if (!path.endsWith('/') && !path.includes('.')) path += '/';
        return path;
    } catch {
        return absUrl;
    }
}

// Rewrite https://warehausae.com/wp-content/uploads/... refs to imported path.
const WP_UPLOAD_RE = /https?:\/\/warehausae\.com\/wp-content\/uploads\//g;
function rewriteImageRefs(value) {
    if (typeof value === 'string') {
        return value.replace(WP_UPLOAD_RE, '/assets/imported/');
    }
    if (Array.isArray(value)) return value.map(rewriteImageRefs);
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = rewriteImageRefs(v);
        return out;
    }
    return value;
}

// Collect every WP image URL in a value.
function collectImageUrls(value, acc = new Set()) {
    if (typeof value === 'string') {
        // Pull out all wp-content/uploads/... URLs.
        for (const m of value.matchAll(/(https?:\/\/warehausae\.com\/wp-content\/uploads\/[^\s)"'<>]+)/g)) {
            // Strip query strings or trailing punctuation/markdown noise.
            const cleaned = m[1].replace(/[)\].,;:!?"']+$/, '');
            if (/\.(jpe?g|png|webp|gif|svg|avif)(?:$|\?)/i.test(cleaned)) acc.add(cleaned);
        }
    } else if (Array.isArray(value)) {
        for (const v of value) collectImageUrls(v, acc);
    } else if (value && typeof value === 'object') {
        for (const v of Object.values(value)) collectImageUrls(v, acc);
    }
    return acc;
}

// Download one image into the assets/imported tree mirroring its WP path.
async function downloadImage(absUrl) {
    const u = new URL(absUrl);
    const tail = u.pathname.replace(/^\/wp-content\/uploads\//, '');
    const outPath = join(ASSETS, tail);
    try {
        await stat(outPath);
        return { skipped: true, outPath }; // already downloaded
    } catch {
        /* not present, proceed */
    }
    await mkdir(dirname(outPath), { recursive: true });
    const res = await fetch(absUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (warehaus-migration-tool)' },
        redirect: 'follow',
    });
    if (!res.ok || !res.body) throw new Error(`download ${absUrl}: HTTP ${res.status}`);
    await pipeline(res.body, createWriteStream(outPath));
    return { downloaded: true, outPath };
}

// Determine the slug for a Statamic content file given the URL.
function entrySlugFromUrl(absUrl) {
    return slugFromUrl(absUrl);
}

// Build the YAML front-matter for an entry.
function buildFrontmatter({ data, sourceUrl, template, collection, slug, canonicalPath }) {
    const fm = {
        id: randomUUID(),
        blueprint: collection === 'pages' && template === 'homepage' ? 'homepage' : (
            collection === 'pages' ? 'page' :
            collection === 'projects' ? 'project' :
            collection === 'services' ? 'service' :
            collection === 'team_members' ? 'team_member' :
            collection === 'portfolio_categories' ? 'portfolio_category' :
            collection === 'job_postings' ? 'job_posting' :
            collection === 'case_studies' ? 'case_study' :
            collection === 'news_posts' ? 'news_post' :
            collection === 'industries_categories' ? 'industries_category' :
            null
        ),
        title: data.title || data.name || data.service_name || data.category_name || data.hero_overlay_heading || slug,
        slug,
        source_url: sourceUrl,
    };

    if (PER_ENTRY_URL_COLLECTIONS.has(collection) || (collection === 'pages' && canonicalPath === '/')) {
        fm.url = canonicalPath;
    } else {
        // For collections with a fixed route like /project/{slug} or
        // /services/{slug}, set an explicit url override only when the
        // canonical path doesn't match what the collection route would
        // produce. Example: /project/test-fits/3/ has slug "test-fits-3"
        // and route "/project/{slug}" would yield "/project/test-fits-3/",
        // so we need url: "/project/test-fits/3/" to preserve the
        // canonical URL exactly.
        const routePrefix = {
            projects: '/project/',
            services: '/services/',
            team_members: '/team/',
            job_postings: '/job/',
        }[collection];
        const expected = routePrefix ? `${routePrefix}${slug}/` : null;
        if (expected && canonicalPath !== expected) {
            fm.url = canonicalPath;
        }
    }

    // Copy every field from the extracted data into front-matter,
    // rewriting image refs. Exclude duplicate-title fields we already handled.
    const transformed = rewriteImageRefs(data);
    for (const [k, v] of Object.entries(transformed)) {
        if (k === 'title') continue; // already set
        if (k === 'seo' && v) {
            if (v.title) fm.seo_title = v.title;
            if (v.description) fm.seo_description = v.description;
            if (v.og_image_url) fm.seo_og_image_url = v.og_image_url;
            continue;
        }
        if (v === null || v === undefined) continue;
        if (typeof v === 'string' && v.trim() === '') continue;
        if (Array.isArray(v) && v.length === 0) continue;
        fm[k] = v;
    }

    return fm;
}

function dumpFrontmatter(obj) {
    return yaml.dump(obj, { lineWidth: 200, noRefs: true, quotingType: '"' });
}

async function importEntry(entryDir, template) {
    const dataPath = join(entryDir, 'data.json');
    let raw;
    try {
        raw = JSON.parse(await readFile(dataPath, 'utf8'));
    } catch (err) {
        return { status: 'skip', reason: `cannot read ${dataPath}: ${err.message}` };
    }
    const sourceUrl = raw.url;
    const data = raw.data ?? {};
    const collection = TEMPLATE_TO_COLLECTION[template];
    if (!collection) return { status: 'skip', reason: `no collection for template ${template}` };

    // Special case: homepage entry lives at URL "/" within pages collection.
    const slug = template === 'homepage' ? 'home' : entrySlugFromUrl(sourceUrl);
    const canonicalPath = template === 'homepage' ? '/' : urlToStatamicPath(sourceUrl);

    const fm = buildFrontmatter({ data, sourceUrl, template, collection, slug, canonicalPath });

    // Download all wp-content images.
    let downloaded = 0;
    let imgErrors = 0;
    if (!args.noImages) {
        const urls = collectImageUrls(data);
        for (const u of urls) {
            try {
                const r = await downloadImage(u);
                if (r.downloaded) downloaded++;
            } catch (err) {
                imgErrors++;
                console.warn(`    image fail: ${u}: ${err.message}`);
            }
        }
    }

    // Write the Statamic content file.
    const colDir = join(COLLECTIONS, collection);
    const filePath = join(colDir, `${slug}.md`);
    const body = `---\n${dumpFrontmatter(fm)}---\n`;
    if (args.dryRun) {
        return { status: 'dry-run', slug, collection, canonicalPath, downloaded, imgErrors };
    }
    await mkdir(colDir, { recursive: true });
    await writeFile(filePath, body);
    return { status: 'ok', slug, collection, canonicalPath, downloaded, imgErrors };
}

const templates = args.only ? [args.only] : Object.keys(TEMPLATE_TO_COLLECTION);

let okCount = 0;
let skipCount = 0;
let errCount = 0;
let totalDownloaded = 0;

for (const template of templates) {
    const baseDir = join(SCRAPED, template);
    let entries;
    try {
        entries = (await readdir(baseDir, { withFileTypes: true })).filter((e) => e.isDirectory());
    } catch {
        continue;
    }
    if (!entries.length) continue;
    console.log(`\n[${template}] (${entries.length} entries)`);
    for (const e of entries) {
        const r = await importEntry(join(baseDir, e.name), template);
        if (r.status === 'ok' || r.status === 'dry-run') {
            okCount++;
            totalDownloaded += r.downloaded ?? 0;
            console.log(`  ${r.status === 'dry-run' ? 'DRY' : ' OK'}  ${r.slug.padEnd(40)} ${r.canonicalPath}  (+${r.downloaded ?? 0} imgs)`);
        } else if (r.status === 'skip') {
            skipCount++;
            console.log(`  SKIP ${e.name} — ${r.reason}`);
        } else {
            errCount++;
            console.log(`  ERR  ${e.name} — ${r.reason ?? 'unknown'}`);
        }
    }
}

console.log(`\nSummary: ok=${okCount}, skip=${skipCount}, err=${errCount}, images_downloaded=${totalDownloaded}`);
