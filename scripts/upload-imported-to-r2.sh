#!/usr/bin/env bash
set -euo pipefail

# Sync local WordPress migration images to Laravel Cloud R2 object storage.
# Requires AWS CLI configured with R2 credentials (or pass env vars).
#
# Usage (from repo root):
#   export AWS_ACCESS_KEY_ID=...
#   export AWS_SECRET_ACCESS_KEY=...
#   export AWS_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
#   export AWS_DEFAULT_REGION=auto
#   export AWS_BUCKET=warehaus-com
#   bash scripts/upload-imported-to-r2.sh
#
# Loads AWS_* from warehaus-statamic/.env when those vars are unset.
# Objects land under imported/ in the bucket, matching ImportedAssetUrl
# resolution (AWS_URL + /imported/...).
#
# After content changes that add new /assets/imported/ paths:
#   1. node scripts/ensure-imported-assets.mjs
#   2. bash scripts/upload-imported-to-r2.sh
#   3. node scripts/verify-imported-assets.mjs --remote

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f warehaus-statamic/.env ]]; then
  # shellcheck disable=SC2046
  export $(grep -E '^AWS_' warehaus-statamic/.env | grep -v '^#' | xargs) 2>/dev/null || true
fi

SOURCE_DIR="warehaus-statamic/public/assets/imported"
DEST="s3://${AWS_BUCKET:?Set AWS_BUCKET}/imported"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Source not found: $SOURCE_DIR"
  echo "Run migration-tool import locally first, or extract a tarball into that path."
  exit 1
fi

if ! command -v aws &>/dev/null; then
  echo "AWS CLI is required. Install: https://aws.cli.amazonaws.com/"
  exit 1
fi

echo "Verifying content image references exist locally…"
node scripts/verify-imported-assets.mjs

echo "Syncing $SOURCE_DIR → $DEST"
aws s3 sync "$SOURCE_DIR" "$DEST" \
  --endpoint-url "${AWS_ENDPOINT:?Set AWS_ENDPOINT}" \
  --no-progress

echo "Verifying content image references on object storage…"
node scripts/verify-imported-assets.mjs --remote

echo "Done. Ensure AWS_URL on Laravel Cloud is the bucket public URL."
