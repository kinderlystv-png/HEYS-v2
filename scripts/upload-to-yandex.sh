#!/bin/bash
# Upload script for Yandex Object Storage

DIST_DIR="/Users/poplavskijanton/HEYS-v2/apps/web/dist"
BUCKET="heys-static"

cd "$DIST_DIR"

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
    *.md) echo "text/markdown; charset=utf-8";;
    *.map) echo "application/json";;
    *) echo "application/octet-stream";;
  esac
}

# Upload all files recursively
find . -type f | while read file; do
  # Remove leading ./
  key="${file#./}"
  ct=$(get_content_type "$file")
  echo "⬆️  $key ($ct)"
  yc storage s3api put-object --bucket "$BUCKET" --key "$key" --body "$file" --acl public-read --content-type "$ct" 2>/dev/null
done

echo "✅ Upload complete!"
