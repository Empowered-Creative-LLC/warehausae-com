// Phase 12 polish — extract hero images from the live site's CSS background-image
// declarations. Firecrawl-based extraction only sees HTML <img> tags; the live
// warehausae.com puts hero photos on <section> background-image CSS for service
// and portfolio_category pages.
//
// For each affected URL:
//   1. Open in Playwright
//   2. Find the topmost large element that has an <h1> and a background-image
//   3. Pull the URL from the computed style
//   4. Download to public/assets/imported/ mirroring the WP path
//   5. Patch the corresponding Statamic content file's hero_image_url

import { chromium } from 'playwright';
import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const APP_PUBLIC = join(ROOT, '..', 'warehaus-statamic', 'public');
const APP_COLLECTIONS = join(ROOT, '..', 'warehaus-statamic', 'content', 'collections');
const STATUS_JSON = join(ROOT, 'scraped', '_discovery', 'url-status.json');

const status = JSON.parse(await readFile(STATUS_JSON, 'utf8'));
const liveUrls = status.results
    .filter((r) => r.finalStatus === 200)
    .map((r) => r.finalUrl);

// Pick only the URLs whose canonical path is a service or portfolio category.
const TARGETS = liveUrls.filter((u) => {
    const p = new URL(u).pathname;
    if (/^\/services\/[^/]+\/?$/.test(p)) return true;
    if (/^\/industry\/[^/]+\/?$/.test(p)) return true;
    // Flat portfolio category URLs — check against known industry slugs.
    const KNOWN_FLAT = new Set([
        '/adaptive-reuse', '/arts_culture', '/building-sciences', '/corporate-office',
        '/distribution_manufacturing', '/education', '/healthcare', '/historic',
        '/multi-family', '/residential-development', '/retail_hospitality',
    ]);
    const norm = p.replace(/\/$/, '');
    return KNOWN_FLAT.has(norm);
});

console.log(`Will inspect ${TARGETS.length} URLs for CSS background-image heroes.`);

// Build slug → content-file index for services + portfolio_categories.
async function buildContentIndex() {
    const map = new Map(); // canonical-path -> content-file
    for (const col of ['services', 'portfolio_categories']) {
        const dir = join(APP_COLLECTIONS, col);
        for (const f of await readdir(dir)) {
            if (!f.endsWith('.md')) continue;
            const path = join(dir, f);
            const content = await readFile(path, 'utf8');
            const m = content.match(/^---\n([\s\S]*?)\n---/);
            if (!m) continue;
            const urlMatch = m[1].match(/^url:\s*(.+)$/m);
            const sourceMatch = m[1].match(/^source_url:\s*(.+)$/m);
            const candidates = new Set();
            if (urlMatch) candidates.add(urlMatch[1].trim().replace(/^"|"$/g, ''));
            if (sourceMatch) {
                try { candidates.add(new URL(sourceMatch[1].trim().replace(/^"|"$/g, '')).pathname); } catch { /* ignore */ }
            }
            // Also try collection-route-derived path.
            const slug = f.replace(/\.md$/, '');
            if (col === 'services') candidates.add(`/services/${slug}`);
            if (col === 'services') candidates.add(`/services/${slug}/`);
            for (const c of candidates) map.set(c, path);
        }
    }
    return map;
}

const contentIndex = await buildContentIndex();

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
});
const page = await ctx.newPage();

let updated = 0;
let downloaded = 0;
let skipped = 0;
let noBg = 0;

for (const url of TARGETS) {
    const path = new URL(url).pathname;
    process.stdout.write(`${path.padEnd(48)} ... `);
    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        // Find the largest viewport-spanning element that has a background-image AND contains an h1.
        const bgUrl = await page.evaluate(() => {
            const h1 = document.querySelector('main h1, h1');
            if (!h1) return null;
            // Walk up the tree finding ancestors with a non-empty background-image.
            let el = h1;
            while (el && el !== document.body) {
                const cs = getComputedStyle(el);
                const bg = cs.backgroundImage;
                if (bg && bg !== 'none') {
                    // Extract first url(...) from background-image
                    const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
                    if (m) return m[1];
                }
                el = el.parentElement;
            }
            return null;
        });

        if (!bgUrl) {
            console.log('no bg-image');
            noBg++;
            continue;
        }

        // Normalize to full WP-uploads URL.
        let absUrl;
        try {
            absUrl = new URL(bgUrl, url).toString();
        } catch {
            console.log('bad url');
            continue;
        }
        if (!absUrl.includes('warehausae.com/wp-content/uploads/')) {
            console.log(`non-WP bg: ${absUrl}`);
            continue;
        }

        // Local path mirror the WP uploads path.
        const tail = new URL(absUrl).pathname.replace(/^\/wp-content\/uploads\//, '');
        const localPath = join(APP_PUBLIC, 'assets', 'imported', tail);

        try {
            await stat(localPath);
            // Already exists, just patch the entry.
        } catch {
            await mkdir(dirname(localPath), { recursive: true });
            const res = await fetch(absUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (warehaus-migration-tool)' },
                redirect: 'follow',
            });
            if (!res.ok || !res.body) {
                console.log(`fetch ${res.status}`);
                continue;
            }
            await pipeline(res.body, createWriteStream(localPath));
            downloaded++;
        }

        // Patch the entry's hero_image_url.
        const candidates = [path, path.replace(/\/$/, ''), path + '/'];
        let contentFile = null;
        for (const c of candidates) {
            if (contentIndex.has(c)) { contentFile = contentIndex.get(c); break; }
        }
        if (!contentFile) {
            console.log('no matching entry');
            skipped++;
            continue;
        }
        const heroPath = `/assets/imported/${tail}`;
        const content = await readFile(contentFile, 'utf8');
        const re = /^(hero_image_url:\s*).*$/m;
        const updatedContent = re.test(content)
            ? content.replace(re, `$1${heroPath}`)
            : content.replace(/^(---\n)/, `$1hero_image_url: ${heroPath}\n`);
        await writeFile(contentFile, updatedContent);
        updated++;
        console.log(`ok -> ${heroPath}`);
    } catch (err) {
        console.log(`error: ${err.message}`);
    }
}

await browser.close();
console.log(`\nSummary: updated=${updated}, downloaded=${downloaded}, no-bg=${noBg}, skipped=${skipped}`);
