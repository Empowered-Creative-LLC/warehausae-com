# Warehaus production deployment runbook

This document covers what's needed to ship the new Statamic site to production. Phases 1-12 of the migration are complete; the site is verified launch-ready except for a handful of decisions that need client input (font license, newsletter destination, analytics, hosting platform).

## Pre-launch decisions still required from the client

These are blocking before launch. Each has a one-touch follow-up step.

1. **Font license.** The new site uses Inter as a free stand-in for the licensed Neue Haas Unica Pro. Once the client provides licensed Neue Haas Unica Pro web fonts, drop the WOFF2 files into `warehaus-statamic/public/fonts/`, register them in `warehaus-statamic/resources/css/app.css` via @font-face, and change the `--font-sans` token from "Inter" to "Neue Haas Unica Pro". Single CSS commit.

2. **Newsletter destination.** The Statamic form at `warehaus-statamic/resources/forms/newsletter.yaml` currently stores submissions in Statamic but emails nowhere. To enable email notifications, fill the `email:` block in that file with a target address (likely info@warehausae.com). Outbound mail is sent through SendGrid (Symfony SendGrid API transport) — set `MAIL_MAILER=sendgrid`, `SENDGRID_API_KEY`, `MAIL_FROM_ADDRESS`, and `MAIL_FROM_NAME` in production .env (see the env-var section below). Alternative: pipe to Mailchimp or ConvertKit via their API webhook.

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

# Mail — SendGrid (used for CP password resets, user invites, form notifications)
MAIL_MAILER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxx   # SendGrid → Settings → API Keys ("Mail Send" scope)
MAIL_FROM_ADDRESS=info@warehausae.com        # must be a SendGrid verified sender / authenticated domain
MAIL_FROM_NAME=Warehaus

# Analytics (once platform is decided)
# Examples:
# PLAUSIBLE_DOMAIN=warehausae.com
# GA4_MEASUREMENT_ID=G-XXXXXXXX
```

## Content strategy (CP-authoritative)

The client edits **only through the Statamic Control Panel** — no GitHub access required.

Statamic uses a **flat-file** content driver (not a CMS database):

- Entries, pages, globals, and navigation live as YAML/Markdown under `warehaus-statamic/content/`.
- CP uploads land in `public/assets/` (except legacy `imported/`, which is served from R2 — see Asset strategy).
- **Laravel's database** stores sessions, cache, and queue jobs only — not CMS content.

### Production workflow

1. Client saves in Statamic CP → files written on the server.
2. Statamic Git integration queues a commit job (requires a **queue worker**).
3. Server runs `git add`, `git commit`, and `git push` to the `dev` branch.
4. Laravel Cloud auto-deploys from `dev` with the latest content.

Enable on Laravel Cloud only (see [Laravel Cloud CP setup](#laravel-cloud-cp-setup)):

```
STATAMIC_GIT_ENABLED=true
STATAMIC_GIT_PUSH=true
STATAMIC_GIT_DISPATCH_DELAY=2
```

### Developer workflow guardrails

- **Code changes:** feature branch → PR → merge to `dev` → Cloud deploys.
- **Content changes:** production (or staging) CP only; auto-push back to `dev`.
- **Before merging code PRs:** `git pull origin dev` to incorporate any production content commits.
- **Never** `git push --force` to `dev`.

### Admin users

`warehaus-statamic/users/*.yaml` is gitignored (bcrypt hashes). Statamic Git does **not** back up CP-created accounts. Create production admins with `php artisan statamic:make:user` after each fresh environment bootstrap.

## Asset strategy

Legacy WordPress images (~350MB) live in `warehaus-statamic/public/assets/imported/` and are **gitignored**.

**Laravel Cloud (R2):**

1. Create an object storage bucket on Laravel Cloud (e.g. `warehaus-com`).
2. Upload local `imported/` once: `bash scripts/upload-imported-to-r2.sh` (requires AWS CLI + R2 credentials).
3. Set `AWS_URL` on the environment to the bucket **public** URL.
4. [`ImportedAssetUrl`](warehaus-statamic/app/Support/ImportedAssetUrl.php) rewrites `/assets/imported/...` in templates to `{AWS_URL}/imported/...`.

**CP uploads** to `public/assets/images/...` are tracked by Statamic Git and deploy via the normal commit/push flow.

**Homepage and design assets** under `public/assets/images/home/` are in Git and deploy normally.

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

The root `composer.lock` and `require` block must stay in sync with `warehaus-statamic/` — Laravel Cloud validates them **before** the build script runs (e.g. object storage requires `league/flysystem-aws-s3-v3` in the root lock). After any `composer require` / `composer update` in `warehaus-statamic/`, run:

```bash
bash scripts/sync-laravel-cloud-composer.sh
```

This also runs automatically via `warehaus-statamic`'s `post-update-cmd` Composer hook.

### Build script

Laravel Cloud serves from `public/index.php` at the **repository root**. This monorepo keeps the app in `warehaus-statamic/`, so the build must promote that directory to the deployment root before `composer install` and `npm run build` run.

After creating the application in Laravel Cloud, set the environment **Build commands** to:

```bash
bash scripts/laravel-cloud-build.sh
```

The script lives at `scripts/laravel-cloud-build.sh` in this repo. It copies `warehaus-statamic/` to the deployment root (so `public/index.php` is in the right place), then installs PHP/JS dependencies and compiles assets.

**Important:** Disable Laravel Cloud's default `npm install` / `npm run build` steps if they are configured separately — they run against the repo root (which has no `package.json`) and will fail or no-op before the promotion step.

### Deploy commands

Set **Deploy commands** on the environment to:

```bash
php artisan migrate --force
php artisan cache:clear
php artisan statamic:stache:clear
php artisan statamic:stache:warm
```

> **Why the clear steps:** Statamic's Stache is persisted in the database cache store, so `stache:warm` on its own can keep serving a stale content index across deploys — git-committed content changes (`content/*.md`, blueprints) then won't appear on the site even though the code deployed. Clearing the app cache and the Stache before warming forces the deployed content to take effect. `scripts/laravel-cloud-deploy.sh` already does this.

If using Statamic Git push with a deploy key, also run the git SSH setup from [Git push credentials](#3-git-push-credentials-server-side-client-has-no-github-access) as additional deploy commands, or use [`warehaus-statamic/scripts/laravel-cloud-deploy.sh`](warehaus-statamic/scripts/laravel-cloud-deploy.sh) after copying it into the promoted app (see script header).

### Required environment variables

```
APP_KEY=...                   # php artisan key:generate --show (run locally)
APP_URL=https://warehausae.com
APP_ENV=production
APP_DEBUG=false
STATAMIC_LICENSE_KEY=...

# Managed database (Laravel Cloud injects DB_* when attached)
DB_CONNECTION=mysql
SESSION_DRIVER=database
CACHE_STORE=database
QUEUE_CONNECTION=database

# R2 object storage for legacy /assets/imported/ images
AWS_URL=...                   # public bucket URL from Laravel Cloud bucket settings
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=auto
AWS_BUCKET=warehaus-com
AWS_ENDPOINT=...              # R2 S3 API endpoint

# Statamic Git — CP content auto-push to dev (production only)
STATAMIC_GIT_ENABLED=true
STATAMIC_GIT_AUTOMATIC=true
STATAMIC_GIT_PUSH=true
STATAMIC_GIT_DISPATCH_DELAY=2
STATAMIC_GIT_USER_NAME=Warehaus CMS
STATAMIC_GIT_USER_EMAIL=cms@warehausae.com
```

### Laravel Cloud CP setup

Complete these steps in the Laravel Cloud dashboard after the first successful build.

**`APP_URL`:** Set to `https://warehausae.com` (production canonical URL). Add `warehausae.com` as a custom domain on the environment when ready for DNS cutover. Until then, the Cloud dev URL (`warehausae-com-dev-ee1qzs.laravel.cloud`) can be used to visit the site, but keep `APP_URL` on `warehausae.com` so Statamic generates correct absolute URLs once DNS points here.

#### 1. Managed database

1. Laravel Cloud → **Resources** → **Create database** (MySQL or Postgres).
2. Attach the database to your environment.
3. Confirm `DB_*` variables appear in **Environment variables** (Cloud usually injects them).
4. Deploy commands already run `php artisan migrate --force` — verify migrations succeed in deploy logs.

The database powers **sessions, cache, and queues** — not Statamic entries.

#### 2. Queue worker (required for Statamic Git)

Statamic Git commits are **queued**. Without a worker, CP saves write files but never push to GitHub.

Laravel Cloud → **Resources** → **Workers** → add:

```bash
php artisan queue:work --sleep=3 --tries=3 --max-time=3600
```

#### 3. Git push credentials (server-side; client has no GitHub access)

The runtime must `git push` to `dev` after each CP save.

**Option A — GitHub deploy key (recommended):**

1. Generate an SSH key pair: `ssh-keygen -t ed25519 -C "warehaus-cloud-statamic" -f warehaus-cloud-git -N ""`
2. GitHub → repo **Settings** → **Deploy keys** → add public key with **Allow write access**.
3. Laravel Cloud → **Environment variables** → add secret `GIT_SSH_PRIVATE_KEY` (full private key contents).
4. Add a **Deploy command** (runs after each deploy) to configure git for push:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "$GIT_SSH_PRIVATE_KEY" > ~/.ssh/id_ed25519 && chmod 600 ~/.ssh/id_ed25519
ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null
git config --global user.email "${STATAMIC_GIT_USER_EMAIL}"
git config --global user.name "${STATAMIC_GIT_USER_NAME}"
git remote set-url origin git@github.com:Empowered-Creative-LLC/warehausae-com.git 2>/dev/null || true
```

**Option B — fine-grained PAT:**

Set remote to `https://x-access-token:TOKEN@github.com/Empowered-Creative-LLC/warehausae-com.git` via a deploy command or build hook.

**Validate:** After deploy, confirm `.git` exists in the app root and `git remote -v` shows the correct origin. If Laravel Cloud strips `.git` at runtime, contact Laravel Cloud support or use persistent storage for `content/` as a fallback.

#### 4. One-time bootstrap

Run via Laravel Cloud **Commands** (one-off) after first deploy:

```bash
php artisan statamic:make:user
```

Upload legacy images to R2 from your local machine (not on Cloud):

```bash
bash scripts/upload-imported-to-r2.sh
```

Set `AWS_URL` to the bucket public URL, then verify a project page loads an `/assets/imported/` image.

#### 5. Staging verification checklist

Before DNS cutover, on staging URL:

- [ ] Cloud build succeeds (`bash scripts/laravel-cloud-build.sh` in build logs)
- [ ] Deploy commands complete (`migrate`, `stache:warm`)
- [ ] CP login works
- [ ] Queue worker is running (check Workers tab)
- [ ] Legacy `/assets/imported/` image loads (R2 + `AWS_URL`)
- [ ] Create a test news entry in CP
- [ ] Within ~2 minutes, commit appears on `dev` in GitHub
- [ ] Cloud redeploys and entry is visible on frontend
- [ ] Code PR merged to `dev` does not wipe recent CP content (`git pull` before merge test)
- [ ] `BASE=https://staging.example.com node migration-tool/scripts/verify-urls.js` (optional)

Upload migrated images to the bucket under the `imported/` prefix using `scripts/upload-imported-to-r2.sh`.
