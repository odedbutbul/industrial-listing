#!/usr/bin/env bash
# רץ ב-xCloud אחרי git pull ולפני ה-build האוטומטי (Site → Git → Deploy Script: `bash scripts/xcloud-deploy.sh`).
# הסודות ב-.env שמנוהל ב-Site → Node.js → Environment — לא בריפו.
set -euo pipefail
cd "${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

NPM="${XCLOUD_NPM:-npm}"

if [ ! -f .env ] || ! grep -Eq '^DATABASE_URL=.+' .env; then
  echo "✗ DATABASE_URL חסר ב-.env — להגדיר ב-Site → Node.js → Environment ואז Deploy Now" >&2
  exit 1
fi

echo "→ npm ci (כולל devDependencies — drizzle-kit ל-migrations)"
"$NPM" ci --include=dev --no-audit --no-fund

echo "→ migrations"
"$NPM" run db:migrate

echo "✓ deploy script הסתיים"
