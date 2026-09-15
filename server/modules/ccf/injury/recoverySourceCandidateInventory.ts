import {
  fingerprintCCFRecoverySourceBindingPlan,
  validateCCFRecoverySourceBindingPlan,
  type CCFRecoverySourceBindingPlan,
} from "./injurySourceBinding";

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
      licenseOrTermsRef: null,
      parserVersion: "ccf-nflverse-injuries-candidate-v1",
      sourceLocatorTemplate:
        "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{season}.csv",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef: null,
      notes: [
        "Adapter preserves upstream date_modified separately from CCF knownAt.",
        "Do not promote until historical timestamp/revision semantics and exact terms are audited.",
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
      licenseOrTermsRef: null,
      parserVersion: "ccf-nflverse-injuries-candidate-v1",
      sourceLocatorTemplate:
        "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{season}.csv",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef: null,
      notes: [
        "Practice status is a separate evidence role from final game activation.",
        "Historical point-in-time eligibility remains unproven.",
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
      licenseOrTermsRef: "https://www.nfl.com/legal/terms/ (systematic retrieval/compilation requires express prior written consent)",
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
      licenseOrTermsRef: null,
      parserVersion: "ccf-nflverse-snap-counts-candidate-v1",
      sourceLocatorTemplate:
        "https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_{season}.csv",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
      reliabilityReviewRef: null,
      notes: [
        "Post-game observed workload only; never eligible for that same game's pre-lock decision.",
        "Exact downstream terms/attribution and historical publication/revision semantics require review.",
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
      licenseOrTermsRef: "CC-BY-4.0",
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
