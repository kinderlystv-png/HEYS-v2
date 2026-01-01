#!/bin/bash
# Deploy landing to Yandex Object Storage

OUT_DIR="/Users/poplavskijanton/HEYS-v2/apps/landing/out"
BUCKET="heyslab.ru"

echo "🚀 Deploying landing to $BUCKET..."

cd "$OUT_DIR" || exit 1

# Function to get content-type based on extension
get_content_type() {
  case "$1" in
    *.html) echo "text/html; charset=utf-8";;
    *.css) echo "text/css; charset=utf-8";;
    *.js) echo "application/javascript";;
    *.json) echo "application/json";;
    *.svg) echo "image/svg+xml";;
    *.png) echo "image/png";;
    *.jpg|*.jpeg) echo "image/jpeg";;
    *.webp) echo "image/webp";;
    *.woff2) echo "font/woff2";;
    *.woff) echo "font/woff";;
    *.ico) echo "image/x-icon";;
    *.txt) echo "text/plain; charset=utf-8";;
    *.xml) echo "application/xml";;
    *.webmanifest) echo "application/manifest+json";;
    *) echo "application/octet-stream";;
  esac
}

# Get cache control based on file type
get_cache_control() {
  case "$1" in
    *.html) echo "public, max-age=0, must-revalidate";;
    _next/static/*) echo "public, max-age=31536000, immutable";;
    *.css|*.js) echo "public, max-age=31536000, immutable";;
    *.jpg|*.jpeg|*.png|*.webp|*.svg|*.ico) echo "public, max-age=31536000, immutable";;
    *) echo "public, max-age=3600";;
  esac
}

# Upload all files recursively
find . -type f | while read file; do
  # Remove leading ./
  key="${file#./}"
  ct=$(get_content_type "$file")
  cc=$(get_cache_control "$key")
  echo "⬆️  $key"
  yc storage s3api put-object \
    --bucket "$BUCKET" \
    --key "$key" \
    --body "$file" \
    --acl public-read \
    --content-type "$ct" \
    --cache-control "$cc" 2>/dev/null
done

echo ""
echo "✅ Deploy complete!"
echo "🌐 https://heyslab.ru"
