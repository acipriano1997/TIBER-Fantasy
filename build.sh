#!/bin/sh
set -e

# Temporary validation branch only: prove the ESE-0 focused conformance tests
# and repository typecheck at the exact implementation head before running the
# normal application build. This file is NOT part of canonical PR #395.
npm test -- server/modules/expertSignals/__tests__/contracts.test.ts server/modules/expertSignals/__tests__/eligibility.test.ts
npm run typecheck

# Build server bundle to dist/app.mjs (NOT index.mjs)
# Then copy bootstrap as dist/index.mjs so "node dist/index.mjs" runs the
# tiny bootstrap first, binding the port before the big bundle loads.
./node_modules/.bin/esbuild server/index.ts \
  --platform=node \
  --bundle \
  --packages=external \
  --format=esm \
  --outfile=dist/app.mjs \
  && ./node_modules/.bin/vite build \
  && cp server/bootstrap.mjs dist/index.mjs
