// Phase 7 — visual and motion reference capture via Playwright.
//
// For one representative URL per template type, visit warehausae.com at
// desktop (1440), tablet (768), and mobile (390) widths and:
//   - take full-page screenshots at scroll positions 0%, 25%, 50%, 75%, 100%
//   - record a short scroll-through video on the desktop run only
//   - capture key element bounding boxes for layout references
//
// Output:
//   scraped/_motion/{template}/{breakpoint}/scroll-{0,25,50,75,100}.png
//   scraped/_motion/{template}/desktop/scroll-through.webm (only on desktop)
//   scraped/_motion/{template}/{breakpoint}/metadata.json
//
// Usage:
//   node scripts/playwright-capture.js                    capture all
//   node scripts/playwright-capture.js --only project     just one template
//   node scripts/playwright-capture.js --refresh          overwrite cached
//   HEADFUL=1 node scripts/playwright-capture.js          run with UI

import { chromium } from 'playwright';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const OUT_ROOT = join(ROOT, 'scraped', '_motion');

const REPRESENTATIVES = [
    { template: 'homepage', url: 'https://warehausae.com/' },
    { template: 'page', url: 'https://warehausae.com/about/' },
    { template: 'project', url: 'https://warehausae.com/project/bischoff-inn/' },
    { template: 'project_test_fits', url: 'https://warehausae.com/project/test-fits/' },
    { template: 'service', url: 'https://warehausae.com/services/architecture/' },
    { template: 'portfolio_category_flat', url: 'https://warehausae.com/healthcare/' },
    { template: 'portfolio_category_industry', url: 'https://warehausae.com/industry/civil-engineering/' },
    { template: 'team_member', url: 'https://warehausae.com/team/troy-bankert/' },
    { template: 'job_posting', url: 'https://warehausae.com/job/civil-project-manager-2/' },
    { template: 'case_study', url: 'https://warehausae.com/case-study/municipal-engineering/' },
    { template: 'news_post', url: 'https://warehausae.com/warehaus-announces-leadership-promotions/' },
    { template: 'industries_category', url: 'https://warehausae.com/Industries/news/' },
];

const BREAKPOINTS = [
    { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
    { name: 'tablet', width: 768, height: 1024, deviceScaleFactor: 2 },
    { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 3 },
];

const SCROLL_POSITIONS = [0, 0.25, 0.5, 0.75, 1.0];

const argv = process.argv.slice(2);
const args = { only: null, refresh: false };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') args.only = argv[++i];
    else if (a === '--refresh') args.refresh = true;
}

async function fileExists(p) {
    try {
        await stat(p);
        return true;
    } catch {
        return false;
    }
}

async function captureOne(browser, rep, bp) {
    const dir = join(OUT_ROOT, rep.template, bp.name);
    await mkdir(dir, { recursive: true });

    // Skip if all positions are cached and not --refresh.
    if (!args.refresh) {
        const allCached = await Promise.all(
            SCROLL_POSITIONS.map((p) => fileExists(join(dir, `scroll-${Math.round(p * 100)}.png`))),
        );
        if (allCached.every(Boolean)) {
            return { skipped: true, dir };
        }
    }

    const recordVideo = bp.name === 'desktop' ? { dir, size: { width: bp.width, height: bp.height } } : undefined;
    const context = await browser.newContext({
        viewport: { width: bp.width, height: bp.height },
        deviceScaleFactor: bp.deviceScaleFactor,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        recordVideo,
    });
    const page = await context.newPage();
    await page.goto(rep.url, { waitUntil: 'networkidle', timeout: 60000 });

    // Total scroll height.
    const totalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const viewportHeight = bp.height;
    const maxScroll = Math.max(0, totalHeight - viewportHeight);

    // Screenshot at each scroll position (slowly, to trigger lazy-loaded images and parallax).
    for (const pos of SCROLL_POSITIONS) {
        const y = Math.round(maxScroll * pos);
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y);
        await page.waitForTimeout(500); // settle motion + lazy-loads
        const outPath = join(dir, `scroll-${Math.round(pos * 100)}.png`);
        await page.screenshot({ path: outPath, fullPage: false });
    }

    // Take a full-page screenshot too (only on desktop) for reference.
    if (bp.name === 'desktop') {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.waitForTimeout(500);
        const fullPath = join(dir, 'full-page.png');
        await page.screenshot({ path: fullPath, fullPage: true });
    }

    // Capture bounding boxes of likely-interesting elements.
    const metadata = await page.evaluate(() => {
        const rect = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
        };
        const sel = (s) => rect(document.querySelector(s));
        const h1El = document.querySelector('main h1') ?? document.querySelector('h1');
        const heroEl = document.querySelector('.hero') ?? h1El?.closest('section') ?? null;
        return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            scrollHeight: document.documentElement.scrollHeight,
            header: sel('header') ?? sel('.header') ?? sel('#header'),
            footer: sel('footer') ?? sel('.footer'),
            hero: rect(heroEl),
            h1: rect(h1El),
            title: document.title,
        };
    });
    await writeFile(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    // If we recorded a video, finalize it by closing the page.
    await page.close();
    await context.close();

    return { dir };
}

const targets = args.only
    ? REPRESENTATIVES.filter((r) => r.template === args.only)
    : REPRESENTATIVES;

if (targets.length === 0) {
    console.error(`No template matched --only ${args.only}`);
    process.exit(1);
}

console.log(`Capturing ${targets.length} URL(s) at ${BREAKPOINTS.length} breakpoints (${SCROLL_POSITIONS.length} positions each)`);

const browser = await chromium.launch({ headless: !process.env.HEADFUL });

let ok = 0;
let skipped = 0;
let errored = 0;

for (const rep of targets) {
    for (const bp of BREAKPOINTS) {
        process.stdout.write(`  ${rep.template.padEnd(28)} ${bp.name.padEnd(8)} ... `);
        try {
            const r = await captureOne(browser, rep, bp);
            if (r.skipped) {
                skipped++;
                console.log('cached');
            } else {
                ok++;
                console.log('ok');
            }
        } catch (err) {
            errored++;
            console.log(`error: ${err.message ?? err}`);
        }
    }
}

await browser.close();
console.log(`\nSummary: ok=${ok}, cached=${skipped}, errored=${errored}`);
