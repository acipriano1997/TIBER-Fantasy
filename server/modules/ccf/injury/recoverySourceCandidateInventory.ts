import {
  fingerprintCCFRecoverySourceBindingPlan,
  validateCCFRecoverySourceBindingPlan,
  type CCFRecoverySourceBindingPlan,
} from "./injurySourceBinding";

const NFLVERSE_DATA_LICENSE_REF =
  "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md (CC BY 4.0 repository license)";
const SPORTRADAR_TERMS_REF =
  "https://developer.sportradar.com/sportradar-updates/page/terms-and-conditions";

/**
 * Concrete inventory of recovery-source capabilities that are actually
 * implemented or directly evidenced today. Nothing in this manifest is
 * production eligible. Promotion requires explicit intended-use permission,
 * passed reliability review, archived point-in-time proof, raw trace, and
 * parser/source identity.
 */
export const CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY: CCFRecoverySourceBindingPlan = {
  contractVersion: "ccf-recovery-source-binding-plan-v1",
  asOf: "2026-09-14T00:00:00Z",
  bindings: [
    {
      bindingVersion: "ccf-recovery-source-binding-v1",
      bindingId: "sportradar-nfl-weekly-injuries-designation-candidate-v1",
      sourceClass: "official_injury_designation",
      provider: "Sportradar",
      datasetOrProduct: "NFL Official API - Weekly Injuries",
      dimensions: ["structural", "participation"],
      authority: "reported_evidence",
      status: "candidate",
      temporalMode: "current_snapshot_only",
      archiveStrategy: "none",
      licenseOrTermsRef: SPORTRADAR_TERMS_REF,
      permissionStatus: "evaluation_only",
      parserVersion: null,
      sourceLocatorTemplate:
        "https://api.sportradar.com/nfl/official/{access_level}/v7/{language_code}/seasons/{season_year}/{season_type}/{week}/injuries.json",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef:
        "Sportradar NFL Weekly Injuries + Data Entry Workflow docs audited 2026-09-14",
      reliabilityStatus: "incomplete",
      notes: [
        "Weekly Injuries exposes injury designation, injury description, status_date, and player/team identity through the authenticated NFL Official API.",
        "Sportradar documents game-week injury update timing and recommends periodic pulls during the current week.",
        "Public trial terms support evaluation only; no FFCC production order/license is claimed.",
        "Historical season/week retrieval exists, but a later historical response is not assumed to prove the exact payload known at an earlier fantasy decision checkpoint.",
        "Empirical correction, latency, coverage, and missingness review is not yet complete.",
      ],
    },
    {
      bindingVersion: "ccf-recovery-source-binding-v1",
      bindingId: "sportradar-nfl-weekly-injuries-practice-candidate-v1",
      sourceClass: "official_practice_participation",
      provider: "Sportradar",
      datasetOrProduct: "NFL Official API - Weekly Injuries",
      dimensions: ["participation"],
      authority: "reported_evidence",
      status: "candidate",
      temporalMode: "current_snapshot_only",
      archiveStrategy: "none",
      licenseOrTermsRef: SPORTRADAR_TERMS_REF,
      permissionStatus: "evaluation_only",
      parserVersion: null,
      sourceLocatorTemplate:
        "https://api.sportradar.com/nfl/official/{access_level}/v7/{language_code}/seasons/{season_year}/{season_type}/{week}/injuries.json",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef:
        "Sportradar NFL Weekly Injuries + Data Entry Workflow docs audited 2026-09-14",
      reliabilityStatus: "incomplete",
      notes: [
        "Weekly Injuries explicitly includes practice participation status in addition to game-status designation.",
        "Public trial terms support evaluation only; no FFCC production order/license is claimed.",
        "CCF must capture exact bytes at decision time rather than infer earlier state from a later response.",
        "Empirical correction, latency, coverage, and missingness review is not yet complete.",
      ],
    },
    {
      bindingVersion: "ccf-recovery-source-binding-v1",
      bindingId: "sportradar-nfl-official-game-roster-candidate-v1",
      sourceClass: "official_game_activation",
      provider: "Sportradar",
      datasetOrProduct: "NFL Official API - Game Roster",
      dimensions: ["participation"],
      authority: "raw_fact",
      status: "candidate",
      temporalMode: "current_snapshot_only",
      archiveStrategy: "none",
      licenseOrTermsRef: SPORTRADAR_TERMS_REF,
      permissionStatus: "evaluation_only",
      parserVersion: null,
      sourceLocatorTemplate:
        "https://api.sportradar.com/nfl/official/{access_level}/v7/{language_code}/games/{game_id}/roster.json",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef:
        "Sportradar NFL Game Roster + Game Status Workflow docs audited 2026-09-14",
      reliabilityStatus: "incomplete",
      notes: [
        "Sportradar documents the Game Roster as the declared game roster and states NFL inactive players are entered around 90 minutes before scheduled kickoff.",
        "The feed exposes player game status including deactivated through a formal authenticated API.",
        "Public trial terms support evaluation only; production use requires an appropriate customer/order-form license and any use-specific approvals required by the agreement.",
        "No CCF API key, parser, immutable archive, historical pre-lock replay, or completed correction/latency/coverage audit is claimed.",
      ],
    },
    {
      bindingVersion: "ccf-recovery-source-binding-v1",
      bindingId: "nflverse-injuries-official-designation-historical-v1",
      sourceClass: "official_injury_designation",
      provider: "nflverse",
      datasetOrProduct: "injuries",
      dimensions: ["structural", "participation"],
      authority: "reported_evidence",
      status: "research_only",
      temporalMode: "current_snapshot_only",
      archiveStrategy: "none",
      licenseOrTermsRef: NFLVERSE_DATA_LICENSE_REF,
      permissionStatus: "unreviewed",
      parserVersion: "ccf-nflverse-injuries-candidate-v1",
      sourceLocatorTemplate:
        "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{season}.csv",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef:
        "nflverse injury availability schedule audited 2026-09-14: source ended after 2024",
      reliabilityStatus: "failed",
      notes: [
        "nflverse documents that its injury-data source died after the 2024 season and currently provides no 2025+ injury data.",
        "The CCF adapter fails closed for seasons after 2024 and is retained only for historical research/source-semantics work.",
        "Upstream date_modified is preserved separately from CCF knownAt and is not historical PIT proof by itself.",
      ],
    },
    {
      bindingVersion: "ccf-recovery-source-binding-v1",
      bindingId: "nflverse-injuries-practice-participation-historical-v1",
      sourceClass: "official_practice_participation",
      provider: "nflverse",
      datasetOrProduct: "injuries",
      dimensions: ["participation"],
      authority: "reported_evidence",
      status: "research_only",
      temporalMode: "current_snapshot_only",
      archiveStrategy: "none",
      licenseOrTermsRef: NFLVERSE_DATA_LICENSE_REF,
      permissionStatus: "unreviewed",
      parserVersion: "ccf-nflverse-injuries-candidate-v1",
      sourceLocatorTemplate:
        "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{season}.csv",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef:
        "nflverse injury availability schedule audited 2026-09-14: source ended after 2024",
      reliabilityStatus: "failed",
      notes: [
        "Historical practice fields remain useful for research through 2024 but cannot satisfy the live 2026 source spine.",
        "The adapter fails closed for seasons after 2024.",
      ],
    },
    {
      bindingVersion: "ccf-recovery-source-binding-v1",
      bindingId: "nfl-official-inactive-report-terms-blocked-v1",
      sourceClass: "official_game_activation",
      provider: "NFL.com",
      datasetOrProduct: "Inactive Reports",
      dimensions: ["participation"],
      authority: "raw_fact",
      status: "rejected",
      temporalMode: "current_snapshot_only",
      archiveStrategy: "none",
      licenseOrTermsRef:
        "https://www.nfl.com/legal/terms/ (systematic retrieval/compilation requires express prior written consent)",
      permissionStatus: "prohibited",
      parserVersion: null,
      sourceLocatorTemplate: "https://www.nfl.com/inactives/",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef: "NFL.com Terms and Conditions audited 2026-09-14",
      reliabilityStatus: "failed",
      notes: [
        "NFL.com is an official source for game-day inactive reports and historical weekly inactive-report articles.",
        "Current NFL.com Terms prohibit the systematic retrieval/compilation FFCC would require absent express prior written consent.",
        "Automated acquisition/parser work was removed after the terms audit; this source must not be used as the production feed without permission or a separately licensed data path.",
        "Do not infer activation from later snap counts, participation, roster status, or injury-report game status.",
      ],
    },
    {
      bindingVersion: "ccf-recovery-source-binding-v1",
      bindingId: "nflverse-pfr-snap-counts-candidate-v1",
      sourceClass: "observed_game_usage",
      provider: "nflverse / Pro Football Reference",
      datasetOrProduct: "snap_counts",
      dimensions: ["workload"],
      authority: "observed_football_evidence",
      status: "candidate",
      temporalMode: "archived_point_in_time",
      archiveStrategy: "immutable_snapshot",
      licenseOrTermsRef: NFLVERSE_DATA_LICENSE_REF,
      permissionStatus: "unreviewed",
      parserVersion: "ccf-nflverse-snap-counts-candidate-v1",
      sourceLocatorTemplate:
        "https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_{season}.csv",
      pointInTimeSemanticsDocumented: true,
      rawTraceSupported: true,
      reliabilityReviewRef:
        "nflverse snap-count dictionary/update schedule/license reviewed 2026-09-14; upstream PFR attribution/corrections/missingness still incomplete",
      reliabilityStatus: "incomplete",
      notes: [
        "Post-game observed workload only; never eligible for that same game's pre-lock decision.",
        "CCF has a prospective fetch-and-archive path that preserves the exact CSV bytes and source-snapshot manifest before parsed workload evidence is exposed.",
        "Prospective knownAt is the CCF retrieval time; upstream Last-Modified and nflverse polling cadence cannot backdate knowledge.",
        "Repository-level licensing is documented, but upstream PFR implications and intended-use permission still require explicit clearance.",
        "Correction behavior and missingness review remain incomplete, so reliability has not passed.",
      ],
    },
    {
      bindingVersion: "ccf-recovery-source-binding-v1",
      bindingId: "ccf-nflverse-weekly-player-stats-recovery-research-v1",
      sourceClass: "observed_performance",
      provider: "nflverse",
      datasetOrProduct: "stats_player_week",
      dimensions: ["performance", "workload"],
      authority: "observed_football_evidence",
      status: "research_only",
      temporalMode: "current_snapshot_only",
      archiveStrategy: "none",
      licenseOrTermsRef: NFLVERSE_DATA_LICENSE_REF,
      permissionStatus: "unreviewed",
      parserVersion: "ccf-nflverse-player-stats-v1",
      sourceLocatorTemplate:
        "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season}.csv",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef: null,
      reliabilityStatus: "unreviewed",
      notes: [
        "Useful for post-game opportunity/outcome labels but not snap/route restoration by itself.",
        "Existing adapter explicitly identifies current_snapshot_only semantics.",
      ],
    },
  ],
};

export const CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY_FINGERPRINT =
  fingerprintCCFRecoverySourceBindingPlan(CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY);

export function getCCFRecoverySourceCandidateInventory(): CCFRecoverySourceBindingPlan {
  return validateCCFRecoverySourceBindingPlan(CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY);
}
