#!/bin/bash
# Version bump script for HEYS documentation
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <new_version>"
  echo "Example: $0 1.4.0"
  exit 1
fi

NEW_VER="$1"
DATE=$(date +%Y-%m-%d)

# Update version tracker
echo "Updating version tracker..."
if command -v yq &> /dev/null; then
  yq e ".version = \"$NEW_VER\"" -i docs/.update_tracker.yml
  yq e ".date = \"$DATE\"" -i docs/.update_tracker.yml
else
  # Fallback for systems without yq
  sed -i "s/version: .*/version: $NEW_VER/" docs/.update_tracker.yml
  sed -i "s/date: .*/date: $DATE/" docs/.update_tracker.yml
fi

# Replace version placeholders in markdown files
echo "Updating version references in documentation..."
find docs -name '*.md' -type f -exec sed -i "s/{{version}}/$NEW_VER/g" {} +

echo "Version updated to $NEW_VER successfully!"
echo "Don't forget to commit changes: git add . && git commit -m 'Version bump to $NEW_VER'"
