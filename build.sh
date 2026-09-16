#!/bin/sh
set -e

# Temporary baseline validation only: prove repository-wide typecheck debt on
# the untouched upstream base used by ESE-0. Not part of any canonical PR.
npm run typecheck

./node_modules/.bin/esbuild server/index.ts \
  --platform=node \
  --bundle \
  --packages=external \
  --format=esm \
  --outfile=dist/app.mjs \
  && ./node_modules/.bin/vite build \
  && cp server/bootstrap.mjs dist/index.mjs
