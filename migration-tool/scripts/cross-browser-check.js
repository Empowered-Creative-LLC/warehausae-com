// Phase 11 — cross-browser smoke test.
//
// Hits a representative URL set in Chromium, Firefox, and WebKit and checks
// that each page returns 200, the title element is non-empty, and there are
// no JS console errors. Not a full QA run, but it catches the obvious
// "broken in Firefox" regressions before launch.

import { chromium, firefox, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const OUT = join(ROOT, 'scraped', '_qa');

const BASE = 'http://localhost:8000';

const URLS = [
    '/',
    '/about/',
    '/services/architecture/',
    '/team/troy-bankert/',
    '/project/bischoff-inn/',
    '/healthcare/',
    '/industry/civil-engineering/',
    '/case-study/municipal-engineering/',
    '/Industries/news/',
    '/warehaus-announces-leadership-promotions/',
    '/job/civil-project-manager-2/',
    '/design/styleguide',
];

const BROWSERS = [
    { name: 'chromium', launcher: chromium },
    { name: 'firefox', launcher: firefox },
    { name: 'webkit', launcher: webkit },
];

const results = [];

for (const b of BROWSERS) {
    console.log(`\n[${b.name}]`);
    const browser = await b.launcher.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    for (const url of URLS) {
        const errors = [];
        const page = await context.newPage();
        page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
        });
        try {
            const resp = await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 30000 });
            const status = resp?.status() ?? 0;
            const title = await page.title();
            const h1 = await page.locator('h1').first().textContent().catch(() => '');
            const ok = status === 200 && title && errors.length === 0;
            console.log(`  ${ok ? 'OK' : 'FAIL'} ${status} ${url} — title: "${(title ?? '').slice(0, 50)}"${errors.length ? ` [${errors.length} errors]` : ''}`);
            results.push({ browser: b.name, url, status, title, h1: h1?.slice(0, 80), errors });
        } catch (err) {
            console.log(`  EXC ${url} — ${err.message}`);
            results.push({ browser: b.name, url, status: 0, exception: err.message });
        }
        await page.close();
    }
    await browser.close();
}

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'cross-browser.json'), JSON.stringify(results, null, 2));

// Summary
const byBrowser = {};
for (const r of results) {
    byBrowser[r.browser] ??= { total: 0, ok: 0, fail: 0 };
    byBrowser[r.browser].total++;
    if (r.status === 200 && (r.errors?.length ?? 0) === 0) byBrowser[r.browser].ok++;
    else byBrowser[r.browser].fail++;
}
console.log('\n=== Cross-browser summary ===');
for (const [b, s] of Object.entries(byBrowser)) {
    console.log(`${b.padEnd(10)} ${s.ok}/${s.total} ok, ${s.fail} fail`);
}
