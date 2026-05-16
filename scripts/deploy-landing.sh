#!/bin/bash
# Deploy landing to Yandex Object Storage (heys-static bucket → heyslab.ru CDN).
# Parallel uploads via xargs for speed (~8-10x faster than serial).

OUT_DIR="/Users/poplavskijanton/HEYS-v2/apps/landing/out"
BUCKET="heys-static"
PARALLEL="${UPLOAD_PARALLEL:-6}"

echo "🚀 Deploying landing to $BUCKET (parallel=$PARALLEL)..."

cd "$OUT_DIR" || exit 1

upload_one() {
  local file="$1"
  local bucket="$2"
  local key="${file#./}"
  local ct cc

  case "$file" in
    *.html) ct="text/html; charset=utf-8";;
    *.css)  ct="text/css; charset=utf-8";;
    *.js)   ct="application/javascript";;
    *.json) ct="application/json";;
    *.svg)  ct="image/svg+xml";;
    *.png)  ct="image/png";;
    *.jpg|*.jpeg) ct="image/jpeg";;
    *.webp) ct="image/webp";;
    *.woff2) ct="font/woff2";;
    *.woff) ct="font/woff";;
    *.ico)  ct="image/x-icon";;
    *.txt)  ct="text/plain; charset=utf-8";;
    *.xml)  ct="application/xml";;
    *.webmanifest) ct="application/manifest+json";;
    *)      ct="application/octet-stream";;
  esac

  case "$key" in
    *.html) cc="public, max-age=0, must-revalidate";;
    _next/static/*) cc="public, max-age=31536000, immutable";;
    *.css|*.js) cc="public, max-age=31536000, immutable";;
    *.jpg|*.jpeg|*.png|*.webp|*.svg|*.ico|*.woff2|*.woff) cc="public, max-age=31536000, immutable";;
    *) cc="public, max-age=3600";;
  esac

  # Up to 3 attempts — yc CLI occasionally drops sockets under parallel load.
  for try in 1 2 3; do
    if yc storage s3api put-object \
        --bucket "$bucket" \
        --key "$key" \
        --body "$file" \
        --acl public-read \
        --content-type "$ct" \
        --cache-control "$cc" >/dev/null 2>&1; then
      echo "  ⬆ $key"
      return 0
    fi
    sleep 1
  done
  echo "  ✗ $key FAILED after 3 attempts"
  return 1
}
export -f upload_one

# Find all files and upload in parallel
find . -type f -print0 | xargs -0 -P "$PARALLEL" -I {} bash -c 'upload_one "$1" "$2"' _ {} "$BUCKET"

UPLOADED=$(find . -type f | wc -l | tr -d ' ')

echo ""
echo "✅ Deploy complete! Uploaded $UPLOADED files."
echo "🌐 https://heyslab.ru"
