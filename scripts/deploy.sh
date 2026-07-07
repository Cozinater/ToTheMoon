#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build          # typecheck + SPA → dist/
npm run build:lambda   # Lambda → dist-server/lambda.zip

terraform -chdir=infra apply -auto-approve

BUCKET=$(terraform -chdir=infra output -raw bucket_name)
DIST_ID=$(terraform -chdir=infra output -raw distribution_id)
DOMAIN=$(terraform -chdir=infra output -raw cloudfront_domain)

: "${BUCKET:?bucket_name output is empty — did terraform apply succeed?}"
: "${DIST_ID:?distribution_id output is empty — did terraform apply succeed?}"
: "${DOMAIN:?cloudfront_domain output is empty — did terraform apply succeed?}"

# hashed assets: cache forever; index.html: always revalidate
aws s3 sync dist "s3://$BUCKET" --delete \
  --cache-control "public,max-age=31536000,immutable" --exclude "index.html"
aws s3 cp dist/index.html "s3://$BUCKET/index.html" --cache-control "no-cache"

aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/index.html" >/dev/null

echo "Deployed: https://$DOMAIN"
