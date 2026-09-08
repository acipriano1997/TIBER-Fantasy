#!/usr/bin/env bash

echo "=== LOCAL PREFLIGHT ==="

echo "Repository: $(git rev-parse --show-toplevel)"
echo "Branch: $(git branch --show-current)"
echo "Revision: $(git rev-parse HEAD)"
echo "Git: $(git --version)"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree: DIRTY"
else
  echo "Working tree: CLEAN"
fi

echo "Focused tests: NOT RUN"
echo "Broad tests: NOT RUN"
echo "Certification gates: NOT RUN"

echo "=== END PREFLIGHT ==="
