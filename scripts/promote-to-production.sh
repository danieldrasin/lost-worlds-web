#!/bin/bash
set -e

# ============================================================
# Promote staging (master) to production
#
# This merges the current master branch into the production
# branch and pushes, triggering auto-deploy on both:
#   - Vercel (production client)
#   - Render (production server)
#
# Usage: bash scripts/promote-to-production.sh
#        bash scripts/promote-to-production.sh --yes   (skip confirmation)
# ============================================================

AUTO_CONFIRM=false
if [ "$1" = "--yes" ] || [ "$1" = "-y" ]; then
  AUTO_CONFIRM=true
fi

echo ""
echo "=== Promoting master → production ==="
echo ""

# Ensure working tree is clean
if [ -n "$(git status --porcelain -uno)" ]; then
  echo "ERROR: Working tree has uncommitted changes. Commit or stash them first."
  exit 1
fi

# Ensure we're on master and up to date
git checkout master
git pull origin master

# Show what's being promoted
STAGING_HEAD=$(git log --oneline -1)
echo "Staging HEAD: $STAGING_HEAD"
echo ""

# Check what's new since last promotion
git checkout production 2>/dev/null || { echo "ERROR: production branch not found. Create it first."; exit 1; }
git pull origin production

DIFF_COUNT=$(git log --oneline production..master | wc -l | tr -d ' ')
if [ "$DIFF_COUNT" = "0" ]; then
  echo "Nothing to promote — production is already up to date with master."
  git checkout master
  exit 0
fi

echo "Commits to promote ($DIFF_COUNT):"
git log --oneline production..master
echo ""

if [ "$AUTO_CONFIRM" = false ]; then
  read -p "Proceed with promotion? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    git checkout master
    exit 0
  fi
else
  echo "Auto-confirmed (--yes flag)"
fi

# Merge master into production
git merge master --no-edit
git push origin production

# Update deployment-versions.json with the promoted version
PROMOTED_VERSION=$(node -p "require('./package.json').version")
DESCRIPTION=$(git log --format=%s -n 1)
node -e "
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('deployment-versions.json', 'utf-8'));
d.production = { version: '$PROMOTED_VERSION', description: '$DESCRIPTION' };
fs.writeFileSync('deployment-versions.json', JSON.stringify(d, null, 2) + '\n');
"
git add deployment-versions.json
git commit -m "Release: update production version to $PROMOTED_VERSION [skip ci]"
git push origin production

# Return to master and sync the tracking file
git checkout master
git merge production --no-edit
git push origin master

echo ""
echo "=== Promotion complete ==="
echo ""
echo "Deployments triggered. Monitor progress at:"
echo "  Vercel:  https://vercel.com/dashboard"
echo "  Render:  https://dashboard.render.com"
echo ""
echo "Production URLs:"
echo "  Client:  https://lost-worlds-prod.vercel.app"
echo "  Server:  https://lost-worlds-web-prod.onrender.com"
echo ""
echo "Run E2E tests against production:"
echo "  npm run test:e2e:prod"
echo ""
