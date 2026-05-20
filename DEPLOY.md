# Warehaus production deployment runbook

This document covers what's needed to ship the new Statamic site to production. Phases 1-12 of the migration are complete; the site is verified launch-ready except for a handful of decisions that need client input (font license, newsletter destination, analytics, hosting platform).

## Pre-launch decisions still required from the client

These are blocking before launch. Each has a one-touch follow-up step.

1. **Font license.** The new site uses Inter as a free stand-in for the licensed Neue Haas Unica Pro. Once the client provides licensed Neue Haas Unica Pro web fonts, drop the WOFF2 files into `warehaus-statamic/public/fonts/`, register them in `warehaus-statamic/resources/css/app.css` via @font-face, and change the `--font-sans` token from "Inter" to "Neue Haas Unica Pro". Single CSS commit.

2. **Newsletter destination.** The Statamic form at `warehaus-statamic/resources/forms/newsletter.yaml` currently stores submissions in Statamic but emails nowhere. To enable email notifications, fill the `email:` block in that file with a target address (likely info@warehausae.com) and set SMTP credentials in production .env (MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM_ADDRESS, MAIL_FROM_NAME). Alternative: pipe to Mailchimp or ConvertKit via their API webhook.

3. **Analytics platform.** No tracking is installed. To add: pick Plausible / GA4 / Fathom / Matomo, drop the snippet into `warehaus-statamic/resources/views/layout.antlers.html` just before `</head>`, and configure any environment-specific token.

4. **Hosting platform.** Suitable options for Laravel 12 + Statamic 6: Laravel Forge, Ploi, Laravel Cloud, Servd (Statamic-specialist), or a managed VPS. Whatever the client picks, the steps below are roughly equivalent.

## Server requirements

- PHP 8.4 (the site is developed against 8.4.7; 8.2+ should work)
- Composer 2.x
- Node 22+ (or 25, what we used locally) for one-time asset build
- SQLite (sessions/cache use the DB; we don't have a domain DB schema beyond the Laravel defaults)
- Required PHP extensions: standard Laravel set plus gd (for Statamic's Glide asset processing)
- HTTPS / SSL — required for the Statamic CP login and OG images

## Initial deploy

1. Provision the host and SSH access.
2. Clone the repo to the host.
3. Composer install: `composer install --no-dev --optimize-autoloader`
4. Node build: `npm ci && npm run build` (Vite produces public/build/)
5. Generate APP_KEY in production .env: `php artisan key:generate`
6. Set production .env values (see the section below).
7. Add the Statamic Pro license key to .env: `STATAMIC_LICENSE_KEY=...` Then run `php artisan statamic:license:set` to activate.
8. Storage symlink: `php artisan storage:link`
9. Optimize: `php artisan optimize`
10. Statamic content cache: `php artisan statamic:stache:warm`
11. Create the admin user on the host: `php artisan statamic:make:user`
12. Point the webserver root at `public/`.

## Required .env values in production

```
APP_NAME=Warehaus
APP_ENV=production
APP_KEY=...                  generated via php artisan key:generate
APP_DEBUG=false
APP_URL=https://warehausae.com

STATAMIC_LICENSE_KEY=...      from statamic.com → My Account

# Mail (once newsletter destination is decided)
MAIL_MAILER=smtp
MAIL_HOST=...
MAIL_PORT=587
MAIL_USERNAME=...
MAIL_PASSWORD=...
MAIL_FROM_ADDRESS=info@warehausae.com
MAIL_FROM_NAME=Warehaus

# Analytics (once platform is decided)
# Examples:
# PLAUSIBLE_DOMAIN=warehausae.com
# GA4_MEASUREMENT_ID=G-XXXXXXXX
```

## Content strategy

The new site uses Statamic's file-based content driver. This means:

- Every content edit in the CP is a file write under `warehaus-statamic/content/`.
- The CP can edit in production but those edits won't be in your git repo unless you have a workflow to commit them. Two common patterns:
  - Edits flow only through git (developer edits + push). Disable the CP's save buttons or restrict CP write access.
  - Edits flow through both: configure Statamic's git integration so each CP save creates a commit (see `config/statamic/git.php`).
- The client probably wants the CP to be authoritative — set up the git-integration option.

## Asset strategy

The migration imported 350MB of images under `warehaus-statamic/public/assets/imported/`. These are currently gitignored (see root .gitignore) — you'll need a strategy to deploy them to production:

- **Option A (recommended for v1):** Run `node migration-tool/scripts/import-to-statamic.js` (without --no-images) on the production host once. This re-downloads from the live WP site to populate `public/assets/imported/`. Fast and simple. Risk: if warehausae.com goes down after the cutover, you lose access to the source images. Mitigation: snapshot the directory locally before launch.
- **Option B (better long-term):** Move imported assets to S3 / CloudFront / Bunny CDN. Rewrite the `/assets/imported/` paths in content files to a CDN domain. Requires more setup; worth doing once site traffic is meaningful.

For launch: take a tarball of your local `public/assets/imported/` directory, SCP it to the host, extract. One-time operation.

## DNS cutover

1. Set up the production app at a staging subdomain first (e.g. staging.warehausae.com). Run all the verification steps below against staging.
2. When ready, switch the `warehausae.com` A and CNAME records to point at the new host.
3. Update the Statamic Pro license to bind to the production domain.
4. Confirm SSL certificate is issued (Let's Encrypt via the host).
5. Test the 191-URL verification against the production domain.

## Pre-launch checklist

In rough order:

- [ ] Production .env populated and APP_KEY set
- [ ] Statamic license activated against the production domain
- [ ] Admin user created via `php artisan statamic:make:user`
- [ ] `php artisan storage:link` run
- [ ] `php artisan optimize` and `statamic:stache:warm` run
- [ ] All 191 editorial URLs return 200 on the production domain (run `BASE=https://warehausae.com node migration-tool/scripts/verify-urls.js`)
- [ ] Lighthouse on production matches or exceeds localhost scores
- [ ] Newsletter form submits and notifies the configured destination
- [ ] Analytics snippet installed and reporting
- [ ] Font swap: if Neue Haas Unica Pro license is in hand, swap before launch
- [ ] Take a snapshot of `public/assets/imported/` for backup
- [ ] Plan a maintenance window for the DNS cutover

## What stays the same vs. the live site

- All 191 editorial URLs are preserved exactly. Zero new 301 redirects.
- WordPress feature parity: yes for the editorial surface (projects, services, portfolio categories, team, news, jobs, case studies, pages). The dev tooling, plugin landing pages, and Elementor previews from the WP site are intentionally not preserved (they're auto-generated artifacts, not editorial content).

## What changes on the new site (intentional)

See `CHANGES.md` at the repo root for a complete list. Highlights:

- Font swap (Inter stand-in pending Neue Haas license).
- Unified type scale and spacing rhythm.
- Sticky job-application sidebar.
- Newsletter form is Statamic-native (replaces the Elementor form on the live site).

## Rollback plan

The old WordPress site stays live until DNS is cut over. If you find a critical issue after launch:

1. Revert DNS to the WP host.
2. The new Statamic deploy stays running at the staging URL for further debugging.
3. The migration tooling under `migration-tool/scripts/` is reusable for re-extraction or hero-image refresh.

## Useful scripts (run from migration-tool/)

- `scripts/verify-urls.js` — 191-URL parity check. Run with `BASE=https://warehausae.com` for production.
- `scripts/cross-browser-check.js` — quick Chrome/Firefox/Safari smoke test on 12 representative URLs.
- `scripts/lighthouse-audit.js` — performance/a11y/SEO/best-practices comparison vs the live site.
- `scripts/playwright-diff.js` — visual diff at desktop + mobile vs the live site.
- `scripts/fetch-missing-images.js` — crawl rendered pages and download any /assets/imported/ images that 404 locally.
- `scripts/extract-css-heroes.js` — re-extract hero background images from the live site via Playwright.
- `scripts/import-to-statamic.js` — re-import content from scraped/ data into Statamic content files.

## Contact for migration questions

Refer to commits on the main branch — each phase commit message has detailed notes on what was implemented and any decisions made. The plan file at `~/.claude/plans/warehaus-site-migration-delightful-creek.md` has the original architecture rationale.

## Laravel Cloud (monorepo)

This repository is a **monorepo**. The deployable Laravel + Statamic app is in `warehaus-statamic/`.

### Repository root markers

`composer.json`, `composer.lock`, and `artisan` at the repository root exist so **Laravel Cloud can detect this repo as a Laravel project** during import. They are not for local development — always work inside `warehaus-statamic/` locally.

The root `composer.lock` does not need to stay in sync with `warehaus-statamic/composer.lock` ([Laravel Cloud monorepo docs](https://cloud.laravel.com/docs/knowledge-base/monorepo-support)).

### Build script

After creating the application in Laravel Cloud, set a **custom build script** on your environment:

```bash
# Promote warehaus-statamic to the deployment root
mkdir /tmp/monorepo_tmp
mv migration-tool /tmp/monorepo_tmp/ 2>/dev/null || true
cp -Rf warehaus-statamic/. .
rm -rf /tmp/monorepo_tmp warehaus-statamic

# Remove monorepo root markers (optional)
rm -f composer.json composer.lock artisan

composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader
npm install
npm run build
```

If Laravel Cloud already runs default `npm` steps, align or remove them so they run against the promoted app.
