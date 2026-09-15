import {
  fingerprintCCFRecoverySourceBindingPlan,
  validateCCFRecoverySourceBindingPlan,
  type CCFRecoverySourceBindingPlan,
} from "./injurySourceBinding";

const NFLVERSE_DATA_LICENSE_REF =
  "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md (CC BY 4.0 repository license)";

/**
 * Concrete inventory of recovery-source capabilities that are actually
 * implemented or directly evidenced today. Nothing in this manifest is
 * production eligible. Promotion requires a separate binding update with
 * archived point-in-time proof, exact terms/license, raw trace, parser identity,
 * and reliability review.
 */
export const CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY: CCFRecoverySourceBindingPlan = {
  contractVersion: "ccf-recovery-source-binding-plan-v1",
  asOf: "2026-09-14T00:00:00Z",
  bindings: [
    {
      bindingVersion: "ccf-recovery-source-binding-v1",
      bindingId: "nflverse-injuries-official-designation-candidate-v1",
      sourceClass: "official_injury_designation",
      provider: "nflverse",
      datasetOrProduct: "injuries",
      dimensions: ["structural", "participation"],
      authority: "reported_evidence",
      status: "candidate",
      temporalMode: "current_snapshot_only",
      archiveStrategy: "none",
      licenseOrTermsRef: NFLVERSE_DATA_LICENSE_REF,
      parserVersion: "ccf-nflverse-injuries-candidate-v1",
      sourceLocatorTemplate:
        "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{season}.csv",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef: null,
      notes: [
        "Adapter preserves upstream date_modified separately from CCF knownAt.",
        "The nflverse-data repository declares CC BY 4.0; promotion still requires dataset/provenance review, attribution handling, immutable capture, and historical timestamp/revision audit.",
      ],
    },
    {
      bindingVersion: "ccf-recovery-source-binding-v1",
      bindingId: "nflverse-injuries-practice-participation-candidate-v1",
      sourceClass: "official_practice_participation",
      provider: "nflverse",
      datasetOrProduct: "injuries",
      dimensions: ["participation"],
      authority: "reported_evidence",
      status: "candidate",
      temporalMode: "current_snapshot_only",
      archiveStrategy: "none",
      licenseOrTermsRef: NFLVERSE_DATA_LICENSE_REF,
      parserVersion: "ccf-nflverse-injuries-candidate-v1",
      sourceLocatorTemplate:
        "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{season}.csv",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef: null,
      notes: [
        "Practice status is a separate evidence role from final game activation.",
        "The nflverse-data repository declares CC BY 4.0; historical point-in-time eligibility and upstream correction semantics remain unproven.",
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
      licenseOrTermsRef:
        "https://developer.sportradar.com/sportradar-updates/page/terms-and-conditions",
      parserVersion: null,
      sourceLocatorTemplate:
        "https://api.sportradar.com/nfl/official/{access_level}/v7/{language_code}/games/{game_id}/roster.json",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef:
        "Sportradar NFL Game Roster + Game Status Workflow docs audited 2026-09-14",
      notes: [
        "Sportradar documents the Game Roster as the declared game roster and states NFL inactive players are entered around 90 minutes before scheduled kickoff.",
        "The feed exposes player game status including deactivated and uses a formal authenticated trial/production API rather than public-page scraping.",
        "Free-trial terms permit internal evaluation only; production use requires an appropriate customer/order-form license and any use-specific approvals required by the agreement.",
        "No CCF API key, parser, immutable archive, historical pre-lock replay, correction audit, or production-use authorization is claimed by this candidate record.",
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
      parserVersion: null,
      sourceLocatorTemplate: "https://www.nfl.com/inactives/",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef: "NFL.com Terms and Conditions audited 2026-09-14",
      notes: [
        "NFL.com is an official source for game-day inactive reports and historical weekly inactive-report articles.",
        "Current NFL.com Terms permit individual non-commercial informational use but prohibit systematic retrieval or compilation absent express prior written consent.",
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
      temporalMode: "current_snapshot_only",
      archiveStrategy: "none",
      licenseOrTermsRef: NFLVERSE_DATA_LICENSE_REF,
      parserVersion: "ccf-nflverse-snap-counts-candidate-v1",
      sourceLocatorTemplate:
        "https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_{season}.csv",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef: null,
      notes: [
        "Post-game observed workload only; never eligible for that same game's pre-lock decision.",
        "nflverse documents snap-count polling four times daily; exact publication/revision timing, upstream PFR attribution implications, immutable capture, and historical knownAt remain review items.",
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
      parserVersion: "ccf-nflverse-player-stats-v1",
      sourceLocatorTemplate:
        "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_{season}.csv",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef: null,
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
