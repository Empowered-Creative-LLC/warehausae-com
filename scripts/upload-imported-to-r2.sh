#!/usr/bin/env bash
set -euo pipefail

# One-time upload of gitignored WordPress migration images to Laravel Cloud R2.
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
# Objects land under imported/ in the bucket, matching ImportedAssetUrl resolution
# (AWS_URL + /imported/...).

SOURCE_DIR="warehaus-statamic/public/assets/imported"
DEST="s3://${AWS_BUCKET:?Set AWS_BUCKET}/imported"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Source not found: $SOURCE_DIR"
  echo "Run migration-tool import locally first, or extract a tarball into that path."
  exit 1
fi

if ! command -v aws &>/dev/null; then
  echo "AWS CLI is required. Install: https://aws.amazon.com/cli/"
  exit 1
fi

echo "Syncing $SOURCE_DIR → $DEST"
aws s3 sync "$SOURCE_DIR" "$DEST" \
  --endpoint-url "${AWS_ENDPOINT:?Set AWS_ENDPOINT}" \
  --no-progress

echo "Done. Set AWS_URL on Laravel Cloud to the bucket public URL (e.g. https://pub-xxx.r2.dev)."
