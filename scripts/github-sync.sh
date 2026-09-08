#!/usr/bin/env bash

set -euo pipefail

PUSH=false
ALLOW_MAIN=false

for arg in "$@"; do
  case "$arg" in
    --push) PUSH=true ;;
    --allow-main) ALLOW_MAIN=true ;;
  esac
done

branch="$(git branch --show-current)"
revision="$(git rev-parse HEAD)"
origin="$(git remote get-url origin)"
status="$(git status --porcelain)"

echo "Branch: $branch"
echo "Revision: $revision"
echo "Origin: $origin"

if [ -n "$status" ]; then
  echo "GitHub sync: FAIL"
  echo "Working tree is not clean. Sync blocked."
  exit 1
fi

if [ "$branch" = "main" ] && [ "$ALLOW_MAIN" != true ]; then
  echo "GitHub sync: FAIL"
  echo "Direct main push blocked."
  exit 1
fi

if [ "$PUSH" != true ]; then
  echo "Preview only. No push performed."
  exit 0
fi

git push -u origin "$branch"
echo "GitHub sync: PASS"
