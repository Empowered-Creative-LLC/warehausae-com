#!/usr/bin/env bash
set -euo pipefail

# Laravel Cloud deploy commands — configure in Environment → Deployments → Deploy commands:
#   bash scripts/laravel-cloud-deploy.sh
#
# Note: On first deploy from monorepo, this script exists only after build promotion.
# If Cloud runs deploy from promoted app root, use inline commands from DEPLOY.md instead,
# or copy this file into warehaus-statamic/ if needed.

php artisan migrate --force

# Refresh Statamic's flat-file content cache. `stache:warm` alone can keep
# serving a stale index across deploys (the Stache is persisted in the DB cache
# store), so git-committed content changes wouldn't appear on the site. Clearing
# the app cache + the Stache first, then warming, guarantees deployed content
# (content/*.md, blueprints) takes effect.
php artisan cache:clear
php artisan statamic:stache:clear
php artisan statamic:stache:warm
php artisan statamic:search:update --all

# Optional: configure git push when GIT_SSH_PRIVATE_KEY is set (Statamic CP workflow)
if [[ -n "${GIT_SSH_PRIVATE_KEY:-}" ]]; then
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  echo "$GIT_SSH_PRIVATE_KEY" > ~/.ssh/id_ed25519
  chmod 600 ~/.ssh/id_ed25519
  ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null || true
  git config --global user.email "${STATAMIC_GIT_USER_EMAIL:-cms@warehausae.com}"
  git config --global user.name "${STATAMIC_GIT_USER_NAME:-Warehaus CMS}"
  if git rev-parse --git-dir >/dev/null 2>&1; then
    git remote set-url origin git@github.com:Empowered-Creative-LLC/warehausae-com.git 2>/dev/null || true
  fi
fi
