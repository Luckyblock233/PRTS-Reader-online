#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci
[ -f reader/data/catalog.json ] || npm run data:bootstrap
npm run dev
