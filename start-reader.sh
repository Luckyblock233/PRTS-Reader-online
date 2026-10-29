#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
reader_python="${TERRA_PYTHON:-python3}"
if [ ! -f reader/data/catalog.json ] && [ ! -f data/active-reader.json ]; then
  "$reader_python" scripts/bootstrap.py
fi
exec "$reader_python" scripts/serve.py --port "${1:-8766}"
