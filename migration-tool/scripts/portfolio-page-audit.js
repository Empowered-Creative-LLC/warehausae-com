#!/usr/bin/env node
/**
 * Compare portfolio category pages on local vs live site.
 * Run from migration-tool/:
 *   LOCAL_BASE=http://localhost:8000 node scripts/portfolio-page-audit.js
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_BASE = process.env.LOCAL_BASE || 'http://localhost:8000';
const LIVE_BASE = 'https://warehausae.com';

const pages = [
  'adaptive-reuse', 'arts_culture', 'building-sciences', 'corporate-office',
  'distribution_manufacturing', 'education', 'healthcare', 'historic',
  'multi-family', 'residential-development', 'retail_hospitality',
];

const expectedVideos = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../scraped/portfolio-live-audit.json'), 'utf8')
);

async function auditPage(page, base, slug) {
  const url = `${base}/${slug}/`;
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (!res || res.status() >= 400) {
    return { url, error: `HTTP ${res?.status()}` };
  }

  return page.evaluate(() => {
    const skip = ['We listen', 'Partnership', 'What our', 'Recent', 'project in mind', "Let's talk"];
    const leadH2 = [...document.querySelectorAll('h2')].find(
      (h) => !skip.some((s) => h.textContent.includes(s))
    );
    const video = [...document.querySelectorAll('iframe[src*="youtube"]')].map(
      (f) => f.src.match(/embed\/([^?]+)/)?.[1]
    ).filter(Boolean)[0] || null;

    const slideshow = document.querySelector('[data-haus-portfolio-slideshow], .elementor-background-slideshow, .elementor-image-carousel');
    const slideshowImgs = slideshow
      ? slideshow.querySelectorAll('img, .swiper-slide').length
      : 0;

    const capGroups = leadH2
      ? [...(leadH2.closest('section, .e-con')?.parentElement?.querySelectorAll('ul') || document.querySelectorAll('section ul'))]
          .filter((ul) => {
            const items = [...ul.querySelectorAll('li')];
            return items.length && items.length < 20 && !items[0].textContent.includes('Adaptive Reuse');
          })
          .map((ul) => ({
            count: ul.querySelectorAll('li').length,
            bullets: [...ul.querySelectorAll('li')].every((li) => {
              const style = getComputedStyle(li, '::before');
              return li.querySelector('.bg-haus-amber-500, [class*="amber"]') || li.textContent.trim().length > 0;
            }),
            links: [...ul.querySelectorAll('a')].length,
          }))
      : [];

    return {
      lead: leadH2?.textContent?.trim() || null,
      video,
      hasSlideshow: Boolean(slideshow),
      slideshowImgs,
      capGroups,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = [];

for (const slug of pages) {
  const live = await auditPage(page, LIVE_BASE, slug);
  const local = await auditPage(page, LOCAL_BASE, slug);
  const expect = expectedVideos[slug];

  const issues = [];
  const expVideo = expect?.video || null;
  if (local.video !== expVideo) {
    issues.push(`video: local=${local.video || 'none'} expected=${expVideo || 'none'}`);
  }
  const expGallery = (expect?.gallery?.length || 0) > 0;
  if (expGallery && !local.hasSlideshow) {
    issues.push('missing photo slideshow');
  }
  if (!expGallery && local.hasSlideshow && slug === 'building-sciences') {
    issues.push('unexpected slideshow on building-sciences');
  }
  if ((local.capGroups?.length || 0) < (live.capGroups?.length || 0)) {
    issues.push(`capability lists: local=${local.capGroups?.length} live=${live.capGroups?.length}`);
  }

  results.push({ slug, live, local, issues });
  const status = issues.length ? 'FAIL' : 'OK';
  console.log(`${status} ${slug}${issues.length ? ` — ${issues.join('; ')}` : ''}`);
}

await browser.close();

const failed = results.filter((r) => r.issues.length);
process.exit(failed.length ? 1 : 0);
