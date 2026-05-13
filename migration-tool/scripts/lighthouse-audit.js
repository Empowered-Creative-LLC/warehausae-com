// Phase 11 — Lighthouse performance / a11y / best-practices / SEO audit.
//
// Runs 4 representative URLs against both localhost and the live site, then
// summarizes the four category scores side-by-side. Saves the raw JSON
// reports under scraped/_qa/lighthouse/{site}-{slug}.json.

import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const OUT = join(ROOT, 'scraped', '_qa', 'lighthouse');

const URLS = [
    { slug: 'home', path: '/' },
    { slug: 'project-bischoff', path: '/project/bischoff-inn/' },
    { slug: 'service-architecture', path: '/services/architecture/' },
    { slug: 'team-troy', path: '/team/troy-bankert/' },
];

const SITES = [
    { name: 'local', base: 'http://localhost:8000' },
    { name: 'live', base: 'https://warehausae.com' },
];

await mkdir(OUT, { recursive: true });

const summary = [];

// Launch Playwright Chromium for Lighthouse to attach to via CDP.
const browser = await chromium.launch({
    args: ['--remote-debugging-port=9222', '--no-sandbox'],
});
// Wait briefly for the debugging port to be ready.
await new Promise((r) => setTimeout(r, 1000));

for (const u of URLS) {
    for (const s of SITES) {
        process.stdout.write(`Lighthouse ${s.name.padEnd(5)} ${u.slug.padEnd(20)} ... `);
        try {
            const result = await lighthouse(s.base + u.path, {
                port: 9222,
                output: 'json',
                logLevel: 'error',
                onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
                disableStorageReset: false,
                throttlingMethod: 'simulate',
            });
            const lhr = result.lhr;
            const scores = {
                performance: Math.round((lhr.categories.performance?.score ?? 0) * 100),
                accessibility: Math.round((lhr.categories.accessibility?.score ?? 0) * 100),
                'best-practices': Math.round((lhr.categories['best-practices']?.score ?? 0) * 100),
                seo: Math.round((lhr.categories.seo?.score ?? 0) * 100),
            };
            summary.push({ site: s.name, slug: u.slug, path: u.path, scores });
            await writeFile(join(OUT, `${s.name}-${u.slug}.json`), result.report);
            console.log(`perf=${scores.performance} a11y=${scores.accessibility} bp=${scores['best-practices']} seo=${scores.seo}`);
        } catch (err) {
            console.log(`error: ${err.message}`);
            summary.push({ site: s.name, slug: u.slug, path: u.path, error: err.message });
        }
    }
}

await browser.close();

await writeFile(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

console.log('\n=== Side-by-side ===');
for (const u of URLS) {
    const local = summary.find((s) => s.slug === u.slug && s.site === 'local');
    const live = summary.find((s) => s.slug === u.slug && s.site === 'live');
    console.log(`\n${u.slug} (${u.path})`);
    if (local?.scores && live?.scores) {
        for (const k of ['performance', 'accessibility', 'best-practices', 'seo']) {
            const l = local.scores[k], v = live.scores[k];
            const delta = l - v;
            const arrow = delta > 0 ? `+${delta}` : `${delta}`;
            console.log(`  ${k.padEnd(15)} local=${String(l).padStart(3)}  live=${String(v).padStart(3)}  Δ${arrow}`);
        }
    } else {
        console.log('  (one or both runs failed)');
    }
}
