#!/usr/bin/env bash
set -euo pipefail

# Promote warehaus-statamic/ to the deployment root so nginx can serve public/index.php.
# Configure in Laravel Cloud → Environment → Deployments → Build commands:
#   bash scripts/laravel-cloud-build.sh
#
# Disable any default npm build steps in Laravel Cloud; this script handles them.

mkdir /tmp/monorepo_tmp
mv migration-tool /tmp/monorepo_tmp/ 2>/dev/null || true
cp -Rf warehaus-statamic/. .
rm -rf /tmp/monorepo_tmp warehaus-statamic

composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader
npm ci
npm run build
php artisan optimize
