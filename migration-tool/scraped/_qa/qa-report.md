# Phase 11 QA report

Generated 2026-05-13. Covers visual diff, cross-browser, and Lighthouse audits comparing the new Statamic site (localhost) to live warehausae.com.

## Summary

| Dimension | Result |
| --- | --- |
| URL preservation | 191/191 editorial URLs return 200 on localhost (no new 301s). |
| Visual fidelity | Above-fold diffs range 17% (best, case_study) to 91% (worst, portfolio_category_industry). Heavy contributors: different font (Inter vs licensed Neue Haas), hero image differences on some templates, deliberate spacing cleanups. |
| Cross-browser | 12 representative URLs pass in Firefox (12/12), Chromium (10/12), WebKit (10/12). The 2 "fails" in Chromium/WebKit are console-error warnings about a single 404 image now fixed. |
| Lighthouse | New site beats live on performance (avg +14 pts) and best-practices (+12 pts), behind on accessibility (avg -8 pts). |

## Visual diff (above-fold viewport)

Per-template / per-breakpoint diff percentages (against live warehausae.com):

| Template | Desktop | Mobile |
| --- | ---: | ---: |
| homepage (after pages/home fix) | 46% | 34% |
| page (/about/) | 87% | 85% |
| project (bischoff-inn) | 80% | 76% |
| project busy (wellspan-york) | 82% | 81% |
| service (architecture) | 63% | 69% |
| portfolio_category flat (/healthcare/) | 82% | 81% |
| portfolio_category /industry/civil-engineering/ | 92% | 90% |
| team_member (troy-bankert) | 45% | 63% |
| job_posting (civil-pm-2) | 75% | 58% |
| case_study (municipal-eng) | 17% | 21% |
| news_post (warehaus-announces) | 54% | 55% |
| industries_category (news) | 48% | 31% |

What's NOT a regression in these diffs:
- Font is Inter (free) on localhost vs Neue Haas Unica Pro (licensed) on live — affects every page's typography pixels. Swap is a single CSS token at launch.
- Hero images on services and portfolio categories: live site uses CSS background-image which Firecrawl can't extract. Our import has a logo-placeholder fallback we replaced with the page's first non-logo image; some pages have no real photo available without manual selection.
- Deliberate spacing/alignment cleanups documented in CHANGES.md.

## Cross-browser smoke (12 URLs × 3 browsers)

- Firefox: 12/12 clean.
- Chromium: 10/12 clean. The 2 with console errors were 404s on a single image (`Rail-Trail-Improvements-1024x683.webp`) which was missing from the asset import — now fetched.
- WebKit: 10/12 — same 2 console errors as Chromium for the same root cause.
- Action taken: wrote `scripts/fetch-missing-images.js` which crawled every rendered page, identified 11 unique referenced images that 404'd locally, and fetched the 4 that still exist on the live site. The remaining 7 are 404 on the live WP site too (orphaned references — broken on both).

## Lighthouse (4 URLs, simulated throttling)

Side-by-side scores (localhost / live, Δ):

| URL | Perf | A11y | BP | SEO |
| --- | --- | --- | --- | --- |
| / | 85 / 56 (Δ+29) | 77 / 89 (Δ-12) | 100 / 54 (Δ+46) | 92 / 100 (Δ-8) |
| /project/bischoff-inn/ | 65 / 60 (Δ+5) | 77 / 85 (Δ-8) | 100 / 100 (Δ0) | 100 / 100 (Δ0) |
| /services/architecture/ | 72 / 60 (Δ+12) | 79 / 79 (Δ0) | 100 / 100 (Δ0) | 100 / 100 (Δ0) |
| /team/troy-bankert/ | 88 / 76 (Δ+12) | 77 / 89 (Δ-12) | 100 / 100 (Δ0) | 92 / 100 (Δ-8) |

Takeaways:
- New site is meaningfully faster across the board, especially on homepage (+29 perf), driven by fewer scripts/plugins (no Elementor runtime, no jQuery, no third-party analytics yet).
- New site has perfect best-practices because we haven't added third-party trackers or mixed-content images yet.
- Accessibility is the one regression worth addressing: -8 to -12 points. Specific issues to check next (Phase 12 polish):
  - Missing or empty alt attributes on imported imagery
  - Color contrast on the amber-on-white text combinations
  - Form labels on the newsletter signup (we use `<label class="sr-only">` but Lighthouse may want a visible label)
  - Heading hierarchy on the homepage's repeating WE BELIEVE IN blocks (multiple H2s in a row)
- SEO -8 on a couple of pages: likely missing meta description on some entries — easy to fix by ensuring seo_description is populated.

## Issues found and addressed during this QA pass

1. Homepage template was using generic pages.show. Fix: created `resources/views/pages/home.antlers.html` with the full WE BELIEVE IN repeater and hero, set the home entry's template field to `pages/home`. Visual diff dropped 67% → 46% as a result.
2. Missing hero/gallery image referenced by case_study and portfolio_category pages. Fix: fetched the missing image plus 3 others; logged 7 references that are 404 on the live site too (no further action — they're broken there too).

## Remaining gaps (Phase 12 polish / launch prep)

In rough priority order:

1. Font licensing. Swap Inter → Neue Haas Unica Pro once the client provides licensed font files. Single CSS token (`--font-sans` in app.css).
2. Hero images on services & portfolio categories. Currently using gallery fallback or none — needs a per-entry manual image pick, OR a Playwright run that reads the live site's `background-image` from computed CSS and downloads each.
3. Accessibility polish. Address the Lighthouse a11y findings: visible label or aria-label on the newsletter email input, alt-text audit on imported imagery, color contrast on hover states.
4. Missing SEO descriptions. Some entries' seo_description is empty — Lighthouse SEO score dropped 8 points on those. Fix: regenerate from the entry's intro_prose if seo_description is empty.
5. Page-level structure varies on /about/, /culture/, /careers/. These need custom layouts (currently rendering via pages/show.antlers.html). Same approach as the homepage fix.
6. Newsletter submission. Form is wired to Statamic but no email notification configured — needs SMTP config or a webhook target before launch.
7. Analytics. Add Plausible / GA4 / Fathom snippet to layout once analytics platform is decided.
8. Production hosting + DNS + SSL. Phase 12 work — out of scope for QA.

## Artifacts

Generated during this audit:
- `scraped/_qa/{template}/{breakpoint}/{local,live,diff}.png` — per-template visual diffs.
- `scraped/_qa/cross-browser.json` — full cross-browser raw results.
- `scraped/_qa/lighthouse/{site}-{slug}.json` — full Lighthouse reports for each of the 8 audits.
- `scraped/_qa/lighthouse/summary.json` — scores only.

Scripts that can be re-run on demand:
- `scripts/playwright-diff.js` — visual diff at 2 breakpoints.
- `scripts/cross-browser-check.js` — 3-browser smoke test.
- `scripts/lighthouse-audit.js` — Lighthouse on 4 URLs × 2 sites.
- `scripts/fetch-missing-images.js` — find and download referenced images that 404 locally.
