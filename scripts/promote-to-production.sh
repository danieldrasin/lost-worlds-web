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
# ============================================================

echo ""
echo "=== Promoting master → production ==="
echo ""

# Ensure working tree is clean
if [ -n "$(git status --porcelain)" ]; then
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

read -p "Proceed with promotion? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  git checkout master
  exit 0
fi

# Merge master into production
git merge master --no-edit
git push origin production

# Return to master
git checkout master

echo ""
echo "=== Promotion complete ==="
echo ""
echo "Deployments triggered. Monitor progress at:"
echo "  Vercel:  https://vercel.com/dashboard"
echo "  Render:  https://dashboard.render.com"
echo ""
echo "Production URLs:"
echo "  Client:  https://lost-worlds-prod.vercel.app"
echo "  Server:  https://lost-worlds-server-prod.onrender.com"
echo ""
echo "Run E2E tests against production:"
echo "  npm run test:e2e:prod"
echo ""
