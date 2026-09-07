# Records & Legacy v0

## Purpose

Records is a read-only fantasy history surface built from reconstructable Sleeper league facts. It preserves league memory without treating model opinion as historical truth.

Route: `/records`  
API: `GET /api/league-records?league_id=<current Sleeper league id>`

## Truth boundary

Sleeper is the source for league lineage and observed historical facts used by v0. The Records layer derives summaries from those facts; it does not become a new canonical upstream data authority.

Rules:

1. Sleeper `user_id` is the stable manager identity. Usernames/display names may change.
2. `roster_id` ownership is season-specific. A new owner of an orphan roster does not inherit the previous manager's personal championships, wins, or achievements.
3. League seasons are linked backward only through Sleeper `previous_league_id`.
4. Missing leagues, failed matchup weeks, or unavailable bracket data remain explicit coverage gaps. No scores, winners, or standings are imputed.
5. Record definitions are versioned in the response provenance (`<record_id>.v1`).
6. Weekly raw-score records are scoped to a scoring-era fingerprint derived from scoring settings and roster configuration. Career counting records span the reconstructed league series.
7. Subjective retrospective claims such as “greatest trade” or “best draft pick” are out of scope for the factual record book.

## History loading

The service starts from the supplied current Sleeper league ID and follows `previous_league_id` backward. Traversal has:

- a cycle guard;
- a default 12-season limit;
- a hard maximum of 25 seasons;
- per-season partial-coverage diagnostics;
- a five-minute in-memory response cache;
- `refresh=1` to bypass cache.

For each season, v0 attempts to load:

- league metadata/settings;
- league users;
- rosters and season standings totals;
- weekly matchups through the league's current/final leg;
- winner playoff bracket.

## Derived surfaces

### My Legacy / manager legacy

- seasons reconstructed;
- championships;
- finals;
- playoff appearances;
- regular-season titles;
- points titles;
- W-L-T and winning percentage;
- career points for/against;
- best weekly score;
- longest/current regular-season win streak.

The manager selector can inspect any reconstructed manager, so the same surface supports the user's history and other league members.

### League Record Book

Scoring-era weekly records currently include:

- highest weekly score;
- highest losing score;
- lowest winning score;
- largest victory;
- closest victory;
- most combined points;
- lowest combined points;
- highest playoff score.

League-series career records currently include:

- championships;
- wins;
- playoff appearances;
- career points scored;
- longest regular-season win streak.

### Rivalries

Head-to-head series are keyed by manager IDs rather than roster slots and include:

- games;
- wins/losses/ties;
- aggregate points;
- playoff meetings;
- closest/largest margin;
- first and latest meeting.

### Achievements

v0 only grants achievements from reconstructable facts. Initial definitions include:

- Champion;
- Points King;
- Wire to Wire;
- Heartbreaker;
- On Fire;
- Century Club;
- Original Member;
- Dynasty.

Rarity is derived from the share of reconstructed managers who have earned that achievement. It is not a manually assigned engagement tier.

### Season Almanac

Each reconstructed season exposes:

- champion and runner-up when the winner bracket resolves them;
- regular-season leader;
- points leader;
- highest weekly score and manager;
- scoring-era ID;
- coverage completeness.

### Record Watch

v0 Record Watch is deterministic. It can show current regular-season streak distance to the league-series record and the current scoring-era high-score holder. Forecast-driven record-break probabilities are deliberately deferred until a governed forecast integration is wired to this surface.

## Unavailable / partial states

The page must show history as partial whenever the API reports coverage diagnostics. A successful response does not imply every historical Sleeper week is complete.

The API can return `SLEEPER_HISTORY_UNAVAILABLE` when the current league cannot be reconstructed at all.

## Validation

`Records History Certification` runs on changes to this surface and performs:

1. focused derivation regression tests;
2. typecheck delta gating for Records production files while respecting repository-wide baseline debt;
3. the deployment-equivalent application build.

Focused tests cover scoring-fingerprint determinism, manager identity across roster-slot ownership changes, scoring-era isolation, rivalry aggregation, and factual achievement grants.

## Deferred extensions

- transaction and draft history ledgers;
- clearly labeled retrospective trade/draft analysis;
- championship-specific record expansion;
- normalized cross-league portfolio records (percentile/z-score rather than blind raw-point comparison);
- format-specific chopped/guillotine and keeper record definitions;
- forecast-calibrated probability of breaking an active record;
- permanent persisted historical snapshots if repeated live reconstruction proves too slow or Sleeper retention requires local archival.
