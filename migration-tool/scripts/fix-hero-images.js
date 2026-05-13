// Phase 9.5 polish — replace WP-header-logo hero_image_url values with the
// first real image found in each entry's markdown.
//
// Why: Firecrawl's extraction picked up the page's <header> logo
// (Asset-1.png) as hero_image_url on many entries, instead of the actual
// project / service / category hero image. The fix walks scraped/*/*/page.md,
// finds the first image URL that isn't a known logo, and rewrites both the
// scraped data.json AND the corresponding Statamic .md content file in place.

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const SCRAPED = join(ROOT, 'scraped');
const APP_COLLECTIONS = join(ROOT, '..', 'warehaus-statamic', 'content', 'collections');

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

// URLs / filename patterns we consider "logo-ish" and want to replace.
const LOGO_PATTERNS = [
    /Asset-\d+\.png/i,
    /-logo\.(png|jpg|webp|svg)/i,
    /warehaus.*logo/i,
];

function isLogoUrl(url) {
    if (!url) return true;
    return LOGO_PATTERNS.some((re) => re.test(url));
}

// Find the first non-logo image URL referenced in the markdown body. We
// convert to the local /assets/imported/ path so it matches the rewritten
// references in the Statamic content file.
function firstRealImage(markdown) {
    if (!markdown) return null;
    const re = /(https?:\/\/warehausae\.com\/wp-content\/uploads\/[^\s)"'<>]+\.(?:jpe?g|png|webp|gif|svg|avif))/gi;
    const seen = new Set();
    for (const m of markdown.matchAll(re)) {
        const url = m[1].replace(/[)\].,;:!?"']+$/, '');
        if (isLogoUrl(url)) continue;
        if (seen.has(url)) continue;
        seen.add(url);
        return url.replace('https://warehausae.com/wp-content/uploads/', '/assets/imported/');
    }
    return null;
}

let changed = 0;
let skipped = 0;
let noFix = 0;

for (const template of await readdir(SCRAPED, { withFileTypes: true })) {
    if (!template.isDirectory() || template.name.startsWith('_')) continue;
    const collection = TEMPLATE_TO_COLLECTION[template.name];
    if (!collection) continue;

    const baseDir = join(SCRAPED, template.name);
    for (const entry of await readdir(baseDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dataPath = join(baseDir, entry.name, 'data.json');
        let raw;
        try {
            raw = JSON.parse(await readFile(dataPath, 'utf8'));
        } catch {
            continue;
        }
        const data = raw.data ?? {};
        const currentHero = data.hero_image_url ?? data.featured_image_url ?? '';
        if (!isLogoUrl(currentHero)) {
            skipped++;
            continue;
        }

        // Read the page markdown to find a candidate.
        let md;
        try {
            md = await readFile(join(baseDir, entry.name, 'page.md'), 'utf8');
        } catch {
            noFix++;
            continue;
        }

        const candidate = firstRealImage(md);
        if (!candidate) {
            noFix++;
            continue;
        }

        // Update the entry's data.json.
        const heroField = data.hero_image_url !== undefined ? 'hero_image_url' : 'featured_image_url';
        data[heroField] = candidate;
        raw.data = data;
        await writeFile(dataPath, JSON.stringify(raw, null, 2));

        // Update the Statamic content file.
        const slug = entry.name;
        const contentFile = join(APP_COLLECTIONS, collection, `${slug}.md`);
        try {
            const content = await readFile(contentFile, 'utf8');
            const re = new RegExp(`^(${heroField}: ).*$`, 'm');
            const updated = content.replace(re, `$1${candidate}`);
            if (updated !== content) {
                await writeFile(contentFile, updated);
                changed++;
                console.log(`  fixed ${template.name}/${slug}: ${currentHero} -> ${candidate}`);
            } else {
                noFix++;
            }
        } catch {
            noFix++;
        }
    }
}

console.log(`\nSummary: changed=${changed}, already-ok=${skipped}, no-real-image-available=${noFix}`);
