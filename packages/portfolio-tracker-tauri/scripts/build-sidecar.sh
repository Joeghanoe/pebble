#!/bin/bash
set -e

TRIPLE=$(rustc -vV | grep "^host:" | awk '{print $2}')
OUT="src-tauri/binaries/portfolio-api-$TRIPLE"

echo "Building sidecar for $TRIPLE..."
mkdir -p src-tauri/binaries

bun build --compile \
  --external keytar \
  ../portfolio-api/src/index.ts \
  --outfile "$OUT"

echo "Sidecar built at $OUT"
