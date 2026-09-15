# Platform Sync

Multi-platform fantasy sports data synchronization. Pulls rosters, leagues, transactions, and scores from ESPN, Yahoo, NFL.com, Sleeper, and MySportsFeeds into TIBER's unified data model.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | `PlatformSyncManager` class — orchestrates auth, full sync, incremental sync, webhooks |
| `leagueAwareSync.ts` | **Preferred FFCC decision-data entrypoint** — wraps platform sync and immediately builds `UnifiedLeagueContextV1` for every league |
| `adapters/sleeperAdapter.ts` | Sleeper API integration |
| `adapters/espnAdapter.ts` | ESPN API integration (uses SWID + espn_s2 cookies) |
| `adapters/yahooAdapter.ts` | Yahoo API integration (OAuth consumer key/secret) |
| `adapters/nflAdapter.ts` | NFL.com API integration |
| `adapters/mysportsfeedsAdapter.ts` | MySportsFeeds API integration (API key auth) |

## Decision-producing sync

Decision-producing FFCC code should call `syncUserDataWithLeagueContext()` from `leagueAwareSync.ts`, not consume raw platform `LeagueData` as sufficient decision context.

The wrapper:
- preserves the platform's exact scoring settings and certifies them without generic scoring defaults;
- resolves linked Devy and contract capabilities;
- attaches supplemental data only when a caller supplies an explicitly refreshed snapshot/as-of witness;
- exposes source freshness, conflicts, unknown rules, and decision-readiness blockers;
- gives Canonical Decision Packet builders one shared league-context object.

A linked Google Drive workbook or Devy sheet is **not** considered freshly ingested merely because its registry mapping exists. Contract/cap and Devy-ownership decisions remain fail-closed until the corresponding live supplemental snapshot is supplied.

## Sync Modes

| Mode | Method | Description |
|------|--------|-------------|
| Full sync | `syncUserData()` | Fetches all data: profile, leagues, teams, rosters, transactions, scores, settings |
| League-aware full sync | `syncUserDataWithLeagueContext()` | Full platform sync plus certified Unified League Context v1 |
| Incremental | `incrementalSync()` | Only fetches changes since last sync timestamp |
| Real-time | `setupRealTimeSync()` | Webhook-based (where platform supports it) |
| Force refresh | `forceRefresh()` | Clears sync timestamp, runs full sync |

## Data Model

Each adapter normalizes platform-specific data into shared interfaces:
- `UserProfile` — user info
- `LeagueData` — league settings, scoring, roster positions
- `TeamData` — record, points, rank
- `RosterData` — starters, bench, IR, taxi
- `TransactionData` — trades, waivers, free agent pickups
- `ScoreData` — weekly team/player scores

`leagueAwareSync.ts` then promotes normalized `LeagueData` into `UnifiedLeagueContextV1`, which is the required league/rules evidence boundary for CCF and other recommendation code.

## Adding a New Platform

1. Create `adapters/newPlatformAdapter.ts`
2. Implement the adapter interface with these methods:
   - `authenticate(credentials)` → boolean
   - `fetchUserProfile(credentials)` → UserProfile
   - `fetchLeagues(credentials)` → LeagueData[]
   - `fetchTeams(credentials)` → TeamData[]
   - `fetchRosters(credentials)` → RosterData[]
   - `fetchTransactions(credentials)` → TransactionData[]
   - `fetchScores(credentials)` → ScoreData[]
   - `fetchSettings(credentials)` → PlatformSettings
   - Optional: `fetchChangesSince(credentials, since)`, `setupWebhook()`, `processWebhookData()`
3. Add platform to `PlatformCredentials.platform` union type in `index.ts`
4. Register adapter in `PlatformSyncManager` constructor
5. Add a scoring-schema certification fixture before permitting decision-producing use through Unified League Context v1.
