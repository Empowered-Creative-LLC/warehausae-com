// Polish task — for every entry with a `related_projects` or `recent_projects`
// array (each item being { title, url, categories }), look up the matching
// project entry by URL and inject its hero_image_url as `image_url`.
//
// Effect: project tiles on the project pages' "Similar Projects" grid and on
// service / portfolio_category pages' "Recent Projects" grid now show real
// thumbnails instead of placeholder gray boxes.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const APP_COLLECTIONS = join(ROOT, '..', 'warehaus-statamic', 'content', 'collections');

// Build a map of canonical URL -> hero_image_url by scanning the projects
// collection. Other collections rarely back related lists, so projects only.
async function buildProjectHeroMap() {
    const map = new Map();
    const dir = join(APP_COLLECTIONS, 'projects');
    for (const f of await readdir(dir)) {
        if (!f.endsWith('.md')) continue;
        const content = await readFile(join(dir, f), 'utf8');
        const fm = parseFrontmatter(content);
        const sourceUrl = fm.source_url;
        const hero = fm.hero_image_url;
        if (sourceUrl && hero) map.set(sourceUrl, hero);
        // Also accept the canonical url override for entries with custom URLs.
        if (fm.url) {
            const abs = fm.url.startsWith('http') ? fm.url : `https://warehausae.com${fm.url}`;
            map.set(abs, hero);
            if (!abs.endsWith('/')) map.set(abs + '/', hero);
        }
    }
    return map;
}

function parseFrontmatter(content) {
    const m = content.match(/^---\n([\s\S]*?)\n---/);
    if (!m) return {};
    try {
        return yaml.load(m[1]) ?? {};
    } catch {
        return {};
    }
}

function rewriteFrontmatter(content, newFm) {
    const m = content.match(/^---\n[\s\S]*?\n---/);
    const yamlOut = yaml.dump(newFm, { lineWidth: 200, noRefs: true, quotingType: '"' });
    const block = `---\n${yamlOut}---`;
    if (!m) return block + '\n' + content;
    return content.replace(m[0], block);
}

const heroByUrl = await buildProjectHeroMap();
console.log(`Indexed ${heroByUrl.size} project entries by URL.`);

// Now walk every collection's entries and patch related_projects / recent_projects.
const RELATED_FIELDS = ['related_projects', 'recent_projects'];
let touched = 0;
let updatedTiles = 0;

for (const collection of await readdir(APP_COLLECTIONS, { withFileTypes: true })) {
    if (!collection.isDirectory()) continue;
    const colDir = join(APP_COLLECTIONS, collection.name);
    for (const f of await readdir(colDir)) {
        if (!f.endsWith('.md')) continue;
        const path = join(colDir, f);
        const content = await readFile(path, 'utf8');
        const fm = parseFrontmatter(content);
        let changed = false;
        for (const field of RELATED_FIELDS) {
            if (!Array.isArray(fm[field])) continue;
            for (const item of fm[field]) {
                if (!item.url || item.image_url) continue;
                const candidates = [item.url, item.url.replace(/\/$/, ''), item.url + '/'];
                let hero = null;
                for (const c of candidates) {
                    if (heroByUrl.has(c)) { hero = heroByUrl.get(c); break; }
                }
                if (hero) {
                    item.image_url = hero;
                    changed = true;
                    updatedTiles++;
                }
            }
        }
        if (changed) {
            await writeFile(path, rewriteFrontmatter(content, fm));
            touched++;
        }
    }
}

console.log(`\nSummary: entries touched=${touched}, tiles given an image_url=${updatedTiles}`);
