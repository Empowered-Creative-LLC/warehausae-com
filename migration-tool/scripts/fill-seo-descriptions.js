// Phase 12 polish — fill empty seo_description fields on Statamic entries
// using the first ~160 chars of intro_prose (or bio for team_members).
//
// Lighthouse SEO dropped 8 points on entries with no meta description.
// The layout already has a template-level fallback chain, but populating
// seo_description on each entry means the CP shows the value the client
// can override (rather than appearing empty).

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const APP_COLLECTIONS = join(ROOT, '..', 'warehaus-statamic', 'content', 'collections');

function parseFrontmatter(content) {
    const m = content.match(/^---\n([\s\S]*?)\n---/);
    if (!m) return null;
    try { return yaml.load(m[1]) ?? {}; } catch { return null; }
}

function rewriteFrontmatter(content, fm) {
    const m = content.match(/^---\n[\s\S]*?\n---/);
    const out = yaml.dump(fm, { lineWidth: 200, noRefs: true, quotingType: '"' });
    const block = `---\n${out}---`;
    return m ? content.replace(m[0], block) : `${block}\n${content}`;
}

function truncate(text, n) {
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (clean.length <= n) return clean;
    const cut = clean.slice(0, n);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

// Source field priority by collection. First non-empty wins.
const SOURCES = {
    projects: ['intro_prose', 'lead_heading'],
    services: ['intro_prose', 'lead_heading'],
    portfolio_categories: ['intro_prose', 'lead_heading'],
    team_members: ['bio'],
    job_postings: ['overview'],
    case_studies: ['intro_prose'],
    news_posts: ['body_markdown'],
    industries_categories: ['intro_prose'],
    pages: ['intro_prose', 'lead_heading', 'raw_body_markdown'],
};

let scanned = 0;
let updated = 0;
let alreadySet = 0;
let noSource = 0;

for (const col of await readdir(APP_COLLECTIONS, { withFileTypes: true })) {
    if (!col.isDirectory()) continue;
    const dir = join(APP_COLLECTIONS, col.name);
    const sources = SOURCES[col.name] ?? ['intro_prose'];
    for (const f of await readdir(dir)) {
        if (!f.endsWith('.md')) continue;
        scanned++;
        const path = join(dir, f);
        const content = await readFile(path, 'utf8');
        const fm = parseFrontmatter(content);
        if (!fm) continue;

        if (fm.seo_description && String(fm.seo_description).trim().length > 0) {
            alreadySet++;
            continue;
        }

        let text = null;
        for (const field of sources) {
            const v = fm[field];
            if (v && String(v).trim().length > 0) { text = v; break; }
        }
        if (!text) { noSource++; continue; }

        fm.seo_description = truncate(text, 160);
        await writeFile(path, rewriteFrontmatter(content, fm));
        updated++;
    }
}

console.log(`scanned=${scanned}, updated=${updated}, already-set=${alreadySet}, no-source=${noSource}`);
