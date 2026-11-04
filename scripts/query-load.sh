#!/usr/bin/env bash
# Phase C query benchmark. Needs MySQL and the phase C migration.
# Does not start the API. Cleans up qload-* rows unless KEEP=1.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export NODE_PATH="${ROOT}/apps/api/node_modules${NODE_PATH:+:${NODE_PATH}}"
exec node "${ROOT}/scripts/query-load.cjs" "$@"
