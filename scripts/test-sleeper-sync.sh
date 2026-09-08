#!/usr/bin/env bash
# Sleeper production-preflight smoke against the mounted V2 API surface.
# Usage: ./scripts/test-sleeper-sync.sh [BASE_URL] [USERNAME] [USER_ID] [LEAGUE_ID]
set -euo pipefail

BASE_URL=${1:-"http://127.0.0.1:5000"}
TEST_USERNAME=${2:?"Sleeper username is required"}
TEST_USER_ID=${3:?"Sleeper immutable user ID is required"}
TEST_LEAGUE_ID=${4:?"At least one expected 2026 Sleeper league ID is required"}
TEST_SEASON=${SLEEPER_SEASON:-2026}

CURL_OPTS=( -sS --max-time 15 --connect-timeout 5 )

if ! command -v jq >/dev/null 2>&1; then
  echo "::error::jq is required for Sleeper production-preflight contract assertions."
  exit 1
fi

fail() {
  echo "::error::$1"
  if [[ -n "${2:-}" ]]; then
    echo "$2" | jq . 2>/dev/null || echo "$2"
  fi
  exit 1
}

request_live_portfolio() {
  local username="$1"
  local season="$2"
  local response http_code body

  response=$(curl "${CURL_OPTS[@]}" -G -w $'\n%{http_code}' \
    --data-urlencode "username=$username" \
    --data-urlencode "season=$season" \
    "$BASE_URL/api/sleeper/leagues/live" || true)

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n -1)
  printf '%s\n%s\n' "$http_code" "$body"
}

echo "Sleeper production-preflight live smoke"
echo "Base URL: $BASE_URL"
echo "Username: $TEST_USERNAME"
echo "Expected immutable user ID: $TEST_USER_ID"
echo "Expected league ID: $TEST_LEAGUE_ID"
echo "Season: $TEST_SEASON"

# 1. The active V2 route must resolve the configured username using live
# Sleeper data and preserve the immutable user identity plus raw league rules.
mapfile -t portfolio_response < <(request_live_portfolio "$TEST_USERNAME" "$TEST_SEASON")
portfolio_status=${portfolio_response[0]:-000}
portfolio_body=$(printf '%s\n' "${portfolio_response[@]:1}")

[[ "$portfolio_status" == "200" ]] || fail \
  "Expected live portfolio discovery to return HTTP 200, got $portfolio_status" \
  "$portfolio_body"

echo "$portfolio_body" | jq -e \
  --arg uid "$TEST_USER_ID" \
  --arg league "$TEST_LEAGUE_ID" \
  --argjson season "$TEST_SEASON" '
    .success == true and
    .data.userId == $uid and
    .data.season == $season and
    (.data.count | type == "number") and
    .data.count > 0 and
    (.data.leagues | type == "array") and
    any(.data.leagues[]; .leagueId == $league) and
    all(.data.leagues[];
      (.scoringSettings | type == "object") and
      (.rosterPositions | type == "array") and
      (.settings | type == "object")
    ) and
    .data.provenance.source == "sleeper" and
    .data.provenance.mode == "live" and
    .data.provenance.complete == true and
    .data.provenance.syntheticFallbackAllowed == false and
    (.data.provenance.fetchedAt | type == "string")
  ' >/dev/null || fail \
    "Live portfolio response violated immutable-ID/raw-rule/provenance contract" \
    "$portfolio_body"

echo "PASS: live portfolio resolved and expected league is present."

# 2. Unknown users must fail closed. No stored or synthetic portfolio is an
# acceptable fallback for production certification.
BAD_USERNAME="tiber_preflight_missing_user_9f3c2d1a"
mapfile -t missing_response < <(request_live_portfolio "$BAD_USERNAME" "$TEST_SEASON")
missing_status=${missing_response[0]:-000}
missing_body=$(printf '%s\n' "${missing_response[@]:1}")

[[ "$missing_status" == "404" ]] || fail \
  "Expected unknown user to return HTTP 404, got $missing_status" \
  "$missing_body"

echo "$missing_body" | jq -e '
  .success == false and .code == "USER_NOT_FOUND"
' >/dev/null || fail "Unknown-user response was not typed USER_NOT_FOUND" "$missing_body"

echo "PASS: unknown user fails closed with typed 404."

# 3. Malformed input must be rejected before upstream access.
malformed_response=$(curl "${CURL_OPTS[@]}" -G -w $'\n%{http_code}' \
  --data-urlencode "username= " \
  --data-urlencode "season=not-a-season" \
  "$BASE_URL/api/sleeper/leagues/live" || true)
malformed_status=$(echo "$malformed_response" | tail -n1)
malformed_body=$(echo "$malformed_response" | head -n -1)

[[ "$malformed_status" == "400" ]] || fail \
  "Expected malformed live portfolio query to return HTTP 400, got $malformed_status" \
  "$malformed_body"

echo "$malformed_body" | jq -e '
  .success == false and .code == "INVALID_PORTFOLIO_QUERY"
' >/dev/null || fail "Malformed query response lacked typed validation failure" "$malformed_body"

echo "PASS: malformed portfolio query is rejected before live discovery."

echo "Sleeper production-preflight live smoke PASSED."
