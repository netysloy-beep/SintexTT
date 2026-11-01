#!/bin/sh
# Full local verification: typecheck, lint, tests. Run from repo root after `pnpm install`.
set -e
echo "== pnpm install =="
pnpm install --frozen-lockfile || pnpm install
echo "== typecheck =="
pnpm -r typecheck
echo "== lint =="
pnpm -r lint
echo "== tests =="
pnpm -r test
echo "ALL CHECKS PASSED"
