#!/usr/bin/env bash
# Sleeper production-preflight smoke against the mounted V2 API surface.
# Usage: ./scripts/test-sleeper-sync.sh [BASE_URL] [USERNAME] [EXPECTED_USER_ID] [EXPECTED_LEAGUE_ID]
set -euo pipefail

BASE_URL=${1:-"http://127.0.0.1:5000"}
TEST_USERNAME=${2:?"Sleeper username is required"}
TEST_USER_ID=${3:-}
TEST_LEAGUE_ID=${4:-}
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
echo "Expected immutable user ID: ${TEST_USER_ID:-<discover-live>}"
echo "Expected league ID: ${TEST_LEAGUE_ID:-<discover-live>}"
echo "Season: $TEST_SEASON"

# 1. The active V2 route must resolve the configured username using live
# Sleeper data and preserve immutable identity, raw league rules, per-league
# scoring coverage, and explicit provenance.
mapfile -t portfolio_response < <(request_live_portfolio "$TEST_USERNAME" "$TEST_SEASON")
portfolio_status=${portfolio_response[0]:-000}
portfolio_body=$(printf '%s\n' "${portfolio_response[@]:1}")

[[ "$portfolio_status" == "200" ]] || fail \
  "Expected live portfolio discovery to return HTTP 200, got $portfolio_status" \
  "$portfolio_body"

echo "$portfolio_body" | jq -e \
  --argjson season "$TEST_SEASON" '
    .success == true and
    (.data.userId | type == "string") and
    (.data.userId | length > 0) and
    .data.season == $season and
    (.data.count | type == "number") and
    .data.count > 0 and
    (.data.leagues | type == "array") and
    (.data.leagues | length == .data.count) and
    all(.data.leagues[];
      (.leagueId | type == "string") and
      (.scoringSettings | type == "object") and
      (.rosterPositions | type == "array") and
      (.settings | type == "object") and
      (.scoringCoverage | type == "object") and
      (.scoringCoverage.status == "GREEN" or .scoringCoverage.status == "RED") and
      (.scoringCoverage.coveragePct | type == "number") and
      (.scoringCoverage.unsupportedKeys | type == "array") and
      (.scoringCoverage.coefficientMismatches | type == "array") and
      (.scoringCoverage.invalidKeys | type == "array")
    ) and
    (.data.summary | type == "object") and
    (.data.summary.greenLeagueCount | type == "number") and
    (.data.summary.redLeagueCount | type == "number") and
    (.data.summary.redLeagueIds | type == "array") and
    (.data.summary.productionAuthorityUnlocked | type == "boolean") and
    .data.provenance.source == "sleeper" and
    .data.provenance.mode == "live" and
    .data.provenance.complete == true and
    .data.provenance.syntheticFallbackAllowed == false and
    (.data.provenance.fetchedAt | type == "string")
  ' >/dev/null || fail \
    "Live portfolio response violated identity/raw-rule/scoring/provenance contract" \
    "$portfolio_body"

resolved_user_id=$(echo "$portfolio_body" | jq -r '.data.userId')
if [[ -n "$TEST_USER_ID" && "$resolved_user_id" != "$TEST_USER_ID" ]]; then
  fail "Live portfolio resolved an unexpected immutable Sleeper user ID" "$portfolio_body"
fi

if [[ -n "$TEST_LEAGUE_ID" ]]; then
  echo "$portfolio_body" | jq -e --arg league "$TEST_LEAGUE_ID" '
    any(.data.leagues[]; .leagueId == $league)
  ' >/dev/null || fail "Expected 2026 Sleeper league was not present in the live portfolio" "$portfolio_body"
fi

echo "PASS: live portfolio resolved with immutable identity and complete per-league rules/provenance."

# Persist the certification evidence in the job log without flattening league
# scoring. This is intentionally read-only evidence from the live response.
echo "=== LIVE SLEEPER PORTFOLIO CERTIFICATION EVIDENCE ==="
echo "$portfolio_body" | jq '{
  username: .data.username,
  displayName: .data.displayName,
  userId: .data.userId,
  season: .data.season,
  count: .data.count,
  summary: .data.summary,
  provenance: .data.provenance,
  leagues: [.data.leagues[] | {
    leagueId,
    name,
    season,
    status,
    totalRosters,
    rosterPositions,
    scoringSettings,
    scoringCoverage,
    settings,
    draftId,
    previousLeagueId
  }]
}'
echo "=== END LIVE SLEEPER PORTFOLIO CERTIFICATION EVIDENCE ==="

# 2. Recommendation authority is a zero-red-league gate. If the route found a
# real portfolio but any league cannot be scored exactly by the promoted
# Forecast profile, fail closed and print only the concrete scoring blocker(s).
if ! echo "$portfolio_body" | jq -e '
  .data.summary.productionAuthorityUnlocked == true and
  .data.summary.redLeagueCount == 0 and
  all(.data.leagues[]; .scoringCoverage.status == "GREEN")
' >/dev/null; then
  scoring_blockers=$(echo "$portfolio_body" | jq '{
    productionAuthorityUnlocked: .data.summary.productionAuthorityUnlocked,
    redLeagueCount: .data.summary.redLeagueCount,
    redLeagueIds: .data.summary.redLeagueIds,
    blockers: [.data.leagues[] | select(.scoringCoverage.status == "RED") | {
      leagueId,
      name,
      coveragePct: .scoringCoverage.coveragePct,
      unsupportedKeys: .scoringCoverage.unsupportedKeys,
      coefficientMismatches: .scoringCoverage.coefficientMismatches,
      invalidKeys: .scoringCoverage.invalidKeys
    }]
  }')
  fail "Live portfolio is valid, but per-league scoring coverage still blocks recommendation authority" "$scoring_blockers"
fi

echo "PASS: every live 2026 league is GREEN; recommendation authority is unlocked by the live-portfolio scoring gate."

# 3. Unknown users must fail closed. No stored or synthetic portfolio is an
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

# 4. Malformed input must be rejected before upstream access.
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
