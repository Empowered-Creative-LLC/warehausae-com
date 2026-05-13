// Phase 11 — visual diff between localhost and the live warehausae.com.
//
// For each representative URL, capture the same scroll position at the same
// viewport on both sites, compute a per-pixel difference, and write:
//   scraped/_qa/{template}/{breakpoint}/local.png
//   scraped/_qa/{template}/{breakpoint}/live.png
//   scraped/_qa/{template}/{breakpoint}/diff.png
//   scraped/_qa/qa-report.md (overall summary)
//
// We compare only the above-the-fold screenshot (viewport-sized) at each
// breakpoint. Full-page diffs are noisy because the live site has ads and
// dynamic widgets that shift between renders.

import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const OUT = join(ROOT, 'scraped', '_qa');

const TARGETS = [
    { template: 'homepage', path: '/' },
    { template: 'page', path: '/about/' },
    { template: 'project', path: '/project/bischoff-inn/' },
    { template: 'project_busy', path: '/project/wellspan-health-york-hospital/' },
    { template: 'service', path: '/services/architecture/' },
    { template: 'portfolio_category_flat', path: '/healthcare/' },
    { template: 'portfolio_category_industry', path: '/industry/civil-engineering/' },
    { template: 'team_member', path: '/team/troy-bankert/' },
    { template: 'job_posting', path: '/job/civil-project-manager-2/' },
    { template: 'case_study', path: '/case-study/municipal-engineering/' },
    { template: 'news_post', path: '/warehaus-announces-leadership-promotions/' },
    { template: 'industries_category', path: '/Industries/news/' },
];

const BREAKPOINTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
];

const LOCAL_BASE = process.env.LOCAL_BASE ?? 'http://localhost:8000';
const LIVE_BASE = 'https://warehausae.com';
const DIFF_THRESHOLD = 0.1; // pixelmatch threshold (0..1, smaller = more sensitive)

async function captureScroll0(page, base, path, width, height) {
    await page.setViewportSize({ width, height });
    await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 });
    // Block ads, cookie banners on the live site that would inject noise
    await page.evaluate(() => {
        document.querySelectorAll('[class*=cookie i], [id*=cookie i], [class*=ad i][class*=banner i], iframe[src*=youtube]').forEach((el) => el.remove());
    });
    // Wait for fonts and animations to settle
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(800);
    // Scroll to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    return await page.screenshot({ fullPage: false });
}

async function comparePngs(localBuf, liveBuf) {
    const local = PNG.sync.read(localBuf);
    const live = PNG.sync.read(liveBuf);
    const w = Math.min(local.width, live.width);
    const h = Math.min(local.height, live.height);
    const diff = new PNG({ width: w, height: h });

    // Re-pack to common dims (top-left crop)
    const reCrop = (img) => {
        if (img.width === w && img.height === h) return img.data;
        const out = new PNG({ width: w, height: h });
        for (let y = 0; y < h; y++) {
            const srcStart = y * img.width * 4;
            const dstStart = y * w * 4;
            img.data.copy(out.data, dstStart, srcStart, srcStart + w * 4);
        }
        return out.data;
    };

    const mismatched = pixelmatch(
        reCrop(local),
        reCrop(live),
        diff.data,
        w,
        h,
        { threshold: DIFF_THRESHOLD, includeAA: false },
    );
    const total = w * h;
    return { mismatched, total, pct: mismatched / total, diff };
}

async function run() {
    await mkdir(OUT, { recursive: true });

    const browser = await chromium.launch();
    const localCtx = await browser.newContext({ deviceScaleFactor: 1 });
    const liveCtx = await browser.newContext({
        deviceScaleFactor: 1,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    });
    const localPage = await localCtx.newPage();
    const livePage = await liveCtx.newPage();

    const results = [];

    for (const t of TARGETS) {
        for (const bp of BREAKPOINTS) {
            const dir = join(OUT, t.template, bp.name);
            await mkdir(dir, { recursive: true });
            process.stdout.write(`${t.template} (${bp.name}) ... `);
            try {
                const [localBuf, liveBuf] = await Promise.all([
                    captureScroll0(localPage, LOCAL_BASE, t.path, bp.width, bp.height),
                    captureScroll0(livePage, LIVE_BASE, t.path, bp.width, bp.height),
                ]);
                await writeFile(join(dir, 'local.png'), localBuf);
                await writeFile(join(dir, 'live.png'), liveBuf);

                const { mismatched, total, pct, diff } = await comparePngs(localBuf, liveBuf);
                await writeFile(join(dir, 'diff.png'), PNG.sync.write(diff));

                results.push({ template: t.template, path: t.path, breakpoint: bp.name, pct, mismatched, total });
                console.log(`diff ${(pct * 100).toFixed(2)}%`);
            } catch (err) {
                console.log(`error: ${err.message}`);
                results.push({ template: t.template, path: t.path, breakpoint: bp.name, error: err.message });
            }
        }
    }

    await browser.close();

    // Write a markdown report.
    const lines = [
        `# Phase 11 visual diff report`,
        ``,
        `Generated ${new Date().toISOString()}`,
        ``,
        `Compares localhost (${LOCAL_BASE}) to live (${LIVE_BASE}) at the same`,
        `URL and same viewport. Pixel diff threshold is ${DIFF_THRESHOLD}.`,
        ``,
        `## Summary (above-the-fold viewport)`,
        ``,
        `| Template | Path | Breakpoint | Diff |`,
        `| --- | --- | --- | ---: |`,
    ];
    for (const r of results) {
        if (r.error) {
            lines.push(`| ${r.template} | ${r.path} | ${r.breakpoint} | error: ${r.error} |`);
        } else {
            lines.push(`| ${r.template} | ${r.path} | ${r.breakpoint} | ${(r.pct * 100).toFixed(2)}% |`);
        }
    }
    lines.push('');
    lines.push('## Notes');
    lines.push('');
    lines.push('Diffs above ~30% indicate substantively different visuals (likely template mismatch, missing hero image, or significant typography drift). Diffs in the 10–30% band are usually font-rendering differences plus minor spacing. Diffs under 10% are noise (anti-aliasing).');
    lines.push('');
    lines.push('Per-template artifacts: scraped/_qa/{template}/{breakpoint}/{local,live,diff}.png');
    await writeFile(join(OUT, 'qa-report.md'), lines.join('\n'));

    console.log(`\nReport: ${join(OUT, 'qa-report.md')}`);
}

run().catch((err) => { console.error(err); process.exit(1); });
