// Strip the warehausae.com host from cross-reference URL fields so links
// route through the local Statamic dev server. After deploy, the same
// relative paths will serve from production at the same URLs.
//
// What gets rewritten:
//   - url:      <prod-host>/path  ->  /path  (or rewritten path)
//   - team_url: <prod-host>/path  ->  /path
// What is preserved as absolute:
//   - source_url:    (origin tracking, not a link)
//   - seo_og_image_url:, hero_image_url:, image_url:   (image URLs already
//     migrated to /assets/imported/... if applicable)
//   - any path that we know does NOT resolve locally (WP-only stubs)
//
// Path rewrites: certain paths existed under different prefixes on WP than
// they do on the Statamic site. We rewrite those when stripping the host.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = '/Users/danielferry/sites/Custom Sites/warehausae-com/warehaus-statamic/content/collections';

// Path prefixes that resolve locally (so it's safe to make these relative).
const SAFE_PREFIXES = ['/project/', '/team/', '/services/', '/case-study/', '/job/', '/Industries/', '/portfolio/', '/about/', '/culture/', '/careers/', '/healthcare/', '/education/', '/historic/', '/adaptive-reuse/', '/arts_culture/', '/building-sciences/', '/corporate-office/', '/distribution_manufacturing/', '/industry/', '/multi-family/', '/residential-development/', '/retail_hospitality/', '/privacy-policy/', '/terms-and-conditions/'];

// Path patterns that WP uses but Statamic routes differently.
// Order matters — more specific rewrites first.
const PATH_REWRITES = [
    { from: /^\/service\/(.+)$/, to: '/services/$1' },           // WP /service/architecture/ -> /services/architecture/
    { from: /^\/category\/(.+)$/, to: '/Industries/$1' },        // WP /category/news/ -> /Industries/news/
    { from: /^\/case-study-([^/]+)\/?$/, to: '/case-study/$1/' },// WP /case-study-bischoff-inn/ -> /case-study/bischoff-inn/
    // Service slug fixes — local entries use underscores or full names.
    { from: /^\/services\/civil\/?$/, to: '/services/civil_engineering/' },
    { from: /^\/services\/interior-design\/?$/, to: '/services/interior_design/' },
    { from: /^\/services\/structural-engineering\/?$/, to: '/services/structural/' },
    // Industry routes — only 3 portfolio_category entries live under /industry/
    // (civil-engineering, historic, municipal). All other industry/* paths
    // are root-level locally (e.g. /industry/adaptive-reuse/ -> /adaptive-reuse/).
    { from: /^\/industry\/(?!civil-engineering|historic|municipal)([^/]+)\/?$/, to: '/$1/' },
];

function rewritePath(path) {
    for (const r of PATH_REWRITES) {
        if (r.from.test(path)) return path.replace(r.from, r.to);
    }
    return path;
}

function shouldRelativize(path) {
    const rewritten = rewritePath(path);
    return SAFE_PREFIXES.some(p => rewritten.startsWith(p));
}

// Match url/team_url fields that are either absolute (warehausae.com host)
// OR already-relative paths that may still need path-pattern rewriting
// (from a previous run that stripped the host but didn't rewrite the slug).
const FIELD_PATTERN = /^(\s*(?:url|team_url):\s*)(?:https?:\/\/(?:www\.)?warehausae\.com)?(\/[^\s]+)\s*$/;

async function fixFile(path) {
    const orig = await readFile(path, 'utf8');
    const lines = orig.split('\n');
    let changed = 0;
    let skipped = 0;
    const out = lines.map(line => {
        const m = line.match(FIELD_PATTERN);
        if (!m) return line;
        const [, prefix, urlPath] = m;
        const newPath = rewritePath(urlPath);
        // Path didn't need rewriting and was already relative? Leave as is.
        if (newPath === urlPath && !line.includes('warehausae.com')) return line;
        // Path doesn't resolve locally even after rewrite? Keep the original
        // absolute URL so the link still works (against production).
        if (line.includes('warehausae.com') && !shouldRelativize(urlPath)) {
            skipped++;
            return line;
        }
        changed++;
        return `${prefix}${newPath}`;
    });
    if (changed > 0) {
        await writeFile(path, out.join('\n'));
    }
    return { changed, skipped };
}

let totalChanged = 0;
let totalSkipped = 0;
let filesTouched = 0;

for (const collection of await readdir(ROOT)) {
    const dir = join(ROOT, collection);
    let entries;
    try { entries = await readdir(dir); }
    catch { continue; }
    for (const f of entries) {
        if (!f.endsWith('.md')) continue;
        const path = join(dir, f);
        const { changed, skipped } = await fixFile(path);
        if (changed > 0) {
            filesTouched++;
            totalChanged += changed;
            console.log(`  ${collection}/${f}  +${changed}${skipped ? ` (${skipped} left absolute)` : ''}`);
        }
        totalSkipped += skipped;
    }
}

console.log(`\nDone. Rewrote ${totalChanged} cross-reference URLs across ${filesTouched} files.`);
console.log(`Left ${totalSkipped} URLs absolute (path doesn't resolve locally — they'll go to production).`);
