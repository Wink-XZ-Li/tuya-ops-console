#!/usr/bin/env bash
# Demo smoke: login, device count, RBAC command send.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${API_BASE:-http://127.0.0.1:3000/api}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-ChangeMe123!}"
OPERATOR_USER="${OPERATOR_USER:-operator}"
READONLY_USER="${READONLY_USER:-readonly}"
DEVICE_ID="${DEVICE_ID:-demo-001}"
COMMAND_CODE="${COMMAND_CODE:-switch}"
COMMAND_VALUE="${COMMAND_VALUE:-true}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}▸${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*" >&2; }
fail() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }
skip() { warn "$1"; exit 2; }

json_field() {
  local json="$1" field="$2"
  node -e "const o=JSON.parse(process.argv[1]); const v=o[process.argv[2]]; if(v===undefined) process.exit(1); process.stdout.write(String(v));" "$json" "$field"
}

http_post() {
  local url="$1" body="$2" token="${3:-}"
  local tmp
  tmp="$(mktemp)"
  local args=(-sS -o "$tmp" -w "%{http_code}" -X POST "$url" -H "Content-Type: application/json")
  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer $token")
  fi
  args+=(-d "$body")
  local code
  if ! code="$(curl "${args[@]}")"; then
    code="000"
  fi
  echo "$code" "$tmp"
}

http_get() {
  local url="$1" token="$2"
  local tmp
  tmp="$(mktemp)"
  local code
  if ! code="$(curl -sS -o "$tmp" -w "%{http_code}" -H "Authorization: Bearer $token" "$url")"; then
    code="000"
  fi
  echo "$code" "$tmp"
}

login() {
  local user="$1" pass="$2"
  read -r code tmp <<<"$(http_post "${API_BASE}/auth/login" "{\"username\":\"${user}\",\"password\":\"${pass}\"}")"
  if [[ "$code" == "000" ]]; then
    skip "API 不可达 (${API_BASE})。请先 docker compose up -d、pnpm demo:mock、pnpm dev:api"
  fi
  if [[ "$code" != "201" && "$code" != "200" ]]; then
    local body
    body="$(cat "$tmp")"
    rm -f "$tmp"
    if [[ "$code" == "500" || "$code" == "503" ]]; then
      skip "API 返回 ${code}，可能 MySQL 未就绪。请检查 docker compose ps 与 DATABASE_URL"
    fi
    fail "登录 ${user} 失败 (HTTP ${code}): ${body}"
  fi
  local body token
  body="$(cat "$tmp")"
  rm -f "$tmp"
  token="$(json_field "$body" accessToken)"
  echo "$token"
}

check_mysql_hint() {
  if command -v docker >/dev/null 2>&1; then
    if ! docker compose -f "$ROOT/docker-compose.yml" ps --status running 2>/dev/null | grep -q mysql; then
      warn "MySQL 容器未运行。执行: pnpm demo:up"
    fi
  else
    warn "未检测到 docker，跳过容器检查。请确保 MySQL (3306) 与 Redpanda (19092) 已启动"
  fi
}

maybe_seed() {
  local token="$1"
  read -r code tmp <<<"$(http_get "${API_BASE}/devices?pageSize=1" "$token")"
  if [[ "$code" != "200" ]]; then
    rm -f "$tmp"
    return
  fi
  local body total
  body="$(cat "$tmp")"
  rm -f "$tmp"
  total="$(json_field "$body" total)"
  if [[ "$total" == "0" ]]; then
    info "设备数为 0，执行 pnpm seed:mock ..."
    (cd "$ROOT" && pnpm seed:mock) || skip "seed:mock 失败，请检查 DATABASE_URL 与 migrate/seed"
  fi
}

info "Tuya Ops Demo smoke (API=${API_BASE})"
check_mysql_hint

info "1/5 登录 admin"
ADMIN_TOKEN="$(login "$ADMIN_USER" "$ADMIN_PASS")"
info "   admin 登录 OK"

maybe_seed "$ADMIN_TOKEN"

info "2/5 列表设备数 ∈ [1, 9]"
read -r code tmp <<<"$(http_get "${API_BASE}/devices?pageSize=20" "$ADMIN_TOKEN")"
[[ "$code" == "200" ]] || fail "GET /devices 失败 (HTTP ${code})"
body="$(cat "$tmp")"
rm -f "$tmp"
total="$(json_field "$body" total)"
if [[ "$total" -lt 1 || "$total" -gt 9 ]]; then
  fail "设备数 ${total} 不在 [1, 9]，Demo 约束不满足"
fi
info "   设备数 ${total} OK"

info "3/5 readonly 下发指令 → 403"
READONLY_TOKEN="$(login "$READONLY_USER" "$ADMIN_PASS")"
read -r code tmp <<<"$(http_post "${API_BASE}/devices/${DEVICE_ID}/commands" "{\"code\":\"${COMMAND_CODE}\",\"value\":${COMMAND_VALUE}}" "$READONLY_TOKEN")"
body="$(cat "$tmp")"
rm -f "$tmp"
[[ "$code" == "403" ]] || fail "readonly 下发应 403，实际 HTTP ${code}: ${body}"
info "   readonly 403 OK"

info "4/5 operator 下发指令 → 200"
OPERATOR_TOKEN="$(login "$OPERATOR_USER" "$ADMIN_PASS")"
read -r code tmp <<<"$(http_post "${API_BASE}/devices/${DEVICE_ID}/commands" "{\"code\":\"${COMMAND_CODE}\",\"value\":${COMMAND_VALUE}}" "$OPERATOR_TOKEN")"
body="$(cat "$tmp")"
rm -f "$tmp"
[[ "$code" == "200" || "$code" == "201" ]] || fail "operator 下发应 200，实际 HTTP ${code}: ${body}"
success="$(json_field "$body" success)"
[[ "$success" == "true" ]] || fail "operator 下发 success 应为 true: ${body}"
info "   operator 200 OK (mock)"

info "5/5 完成"
echo -e "${GREEN}✓ smoke 全部通过${NC}"
