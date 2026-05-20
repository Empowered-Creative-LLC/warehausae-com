// Fix broken `image_url: http://www.warehausae.com/` entries scattered
// across project / service / portfolio markdown files. For each broken
// image_url, find the title row directly above it, resolve that title to
// a project entry, and look up its correct hero image.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = '/Users/danielferry/sites/Custom Sites/warehausae-com/warehaus-statamic/content/collections';

// Build slug -> hero_image_url map from all project entries
async function buildProjectImageMap() {
    const projDir = join(ROOT, 'projects');
    const files = await readdir(projDir);
    const map = new Map();
    for (const f of files) {
        if (!f.endsWith('.md')) continue;
        const slug = f.replace(/\.md$/, '');
        const body = await readFile(join(projDir, f), 'utf8');
        const titleMatch = body.match(/^title:\s*(.+)$/m);
        const heroMatch = body.match(/^hero_image_url:\s*(.+)$/m);
        let hero = heroMatch ? heroMatch[1].trim() : '';
        // Strip surrounding quotes
        hero = hero.replace(/^['"]|['"]$/g, '');
        if (!hero || hero === 'http://www.warehausae.com/' || hero === 'https://www.warehausae.com/') {
            // Fall back to first gallery image
            const galleryMatch = body.match(/gallery_images:\s*\n((?:\s+-\s+url:\s*(.+)\n[\s\S]*?)+)/);
            if (galleryMatch) {
                const firstUrlMatch = galleryMatch[1].match(/url:\s*(.+)/);
                if (firstUrlMatch) hero = firstUrlMatch[1].trim().replace(/^['"]|['"]$/g, '');
            }
        }
        const title = titleMatch?.[1].trim();
        if (title && hero && hero !== 'http://www.warehausae.com/') {
            map.set(title, hero);
            map.set(slug, hero);
        }
    }
    return map;
}

async function fixFile(path, projectMap) {
    let body = await readFile(path, 'utf8');
    const orig = body;
    // Find any block matching:
    //   - title: <title>
    //     ... (other fields)
    //     image_url: http://www.warehausae.com/
    // and replace the broken image_url with the correct one.
    const lines = body.split('\n');
    const fixed = [];
    let titleCarry = null;
    let titleCarryAt = -10;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const titleMatch = line.match(/^\s*-?\s*title:\s*(.+)$/);
        if (titleMatch) {
            titleCarry = titleMatch[1].trim().replace(/^['"]|['"]$/g, '');
            titleCarryAt = i;
        }
        const brokenMatch = line.match(/^(\s*)image_url:\s*https?:\/\/www\.warehausae\.com\/?\s*$/);
        if (brokenMatch && titleCarry && (i - titleCarryAt) < 12) {
            // Try to resolve from project map
            const correctUrl = projectMap.get(titleCarry);
            if (correctUrl) {
                fixed.push(`${brokenMatch[1]}image_url: ${correctUrl}`);
                console.log(`  ${titleCarry} -> ${correctUrl}`);
                continue;
            }
            console.log(`  ${titleCarry} -> UNRESOLVED`);
        }
        fixed.push(line);
    }
    const newBody = fixed.join('\n');
    if (newBody !== orig) {
        await writeFile(path, newBody);
        return true;
    }
    return false;
}

const projectMap = await buildProjectImageMap();
console.log(`Built project image map with ${projectMap.size} entries`);

// Sweep services, projects, portfolio_categories, industries_categories
for (const collection of ['services', 'projects', 'portfolio_categories', 'industries_categories', 'pages', 'case_studies', 'news_posts']) {
    const dir = join(ROOT, collection);
    try {
        const files = await readdir(dir);
        for (const f of files) {
            if (!f.endsWith('.md')) continue;
            const path = join(dir, f);
            const body = await readFile(path, 'utf8');
            if (!/image_url:\s*https?:\/\/www\.warehausae\.com\/?\s*$/m.test(body)) continue;
            console.log(`\n=== ${collection}/${f} ===`);
            await fixFile(path, projectMap);
        }
    } catch (e) {
        console.log(`Skip ${collection}: ${e.message}`);
    }
}
console.log('\nDone.');
