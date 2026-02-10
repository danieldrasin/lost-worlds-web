#!/bin/bash
set -e

# ============================================================
# Bump app version for a new staging deployment
#
# Usage: bash scripts/bump-version.sh [patch|minor|major]
#        Default: patch
#
# This script:
#   1. Bumps package.json version (npm version)
#   2. Updates deployment-versions.json staging entry
#   3. Stages the files for commit
#   4. Shows what to do next (does NOT commit/push)
# ============================================================

BUMP_TYPE=${1:-patch}

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: bash scripts/bump-version.sh [patch|minor|major]"
  exit 1
fi

echo ""
echo "=== Bumping version ($BUMP_TYPE) ==="
echo ""

# Get current version
OLD_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $OLD_VERSION"

# Bump it (no git tag, no commit)
npm version "$BUMP_TYPE" --no-git-tag-version > /dev/null
NEW_VERSION=$(node -p "require('./package.json').version")
echo "New version:     $NEW_VERSION"

# Update deployment-versions.json staging entry
DESCRIPTION=$(echo "Version bump to $NEW_VERSION")
node -e "
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('deployment-versions.json', 'utf-8'));
d.staging = { version: '$NEW_VERSION', description: '$DESCRIPTION' };
fs.writeFileSync('deployment-versions.json', JSON.stringify(d, null, 2) + '\n');
"

echo ""
echo "Updated deployment-versions.json (staging → $NEW_VERSION)"
echo ""

# Stage the files
git add package.json deployment-versions.json
echo "Files staged. Next steps:"
echo ""
echo "  1. Review:  git diff --cached"
echo "  2. Commit:  git commit -m \"Bump version to $NEW_VERSION\""
echo "  3. Push:    git push origin master"
echo "  4. Wait for staging to deploy (~2-5 min)"
echo "  5. Test:    npm run test:e2e:staging"
echo ""
