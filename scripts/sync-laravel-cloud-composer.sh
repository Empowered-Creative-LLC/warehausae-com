#!/usr/bin/env bash
set -euo pipefail

# Keep monorepo root composer markers in sync for Laravel Cloud pre-build checks.
# Laravel Cloud validates root composer.json/composer.lock before the build script
# promotes warehaus-statamic/ to the deployment root.
#
# Run manually after changing app dependencies:
#   bash scripts/sync-laravel-cloud-composer.sh
#
# Also runs automatically via warehaus-statamic/composer.json post-update-cmd.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/warehaus-statamic"

if [[ ! -f "$APP/composer.json" || ! -f "$APP/composer.lock" ]]; then
    echo "error: warehaus-statamic composer files not found" >&2
    exit 1
fi

cp "$APP/composer.lock" "$ROOT/composer.lock"

php <<PHP
<?php
\$root = '$ROOT';
\$appJson = json_decode(file_get_contents(\$root . '/warehaus-statamic/composer.json'), true);
\$rootJson = json_decode(file_get_contents(\$root . '/composer.json'), true);
\$rootJson['require'] = \$appJson['require'];
file_put_contents(
    \$root . '/composer.json',
    json_encode(\$rootJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n"
);
PHP

echo "Synced root composer.lock and composer.json require from warehaus-statamic/"
