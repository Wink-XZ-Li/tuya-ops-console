#!/usr/bin/env bash
# Repeatable phase B ingest check. Needs MySQL, Redpanda, and one API process.
# Does not create or expand Kafka partitions.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export NODE_PATH="${ROOT}/apps/api/node_modules${NODE_PATH:+:${NODE_PATH}}"
exec node "${ROOT}/scripts/ingest-load.cjs" "$@"
