import {
  evaluateCCFRecoverySourcePlanPromotionReadiness,
  evaluateCCFRecoverySourcePromotionReadiness,
  type CCFRecoverySourceBinding,
} from "../injurySourceBinding";
import { CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY } from "../recoverySourceCandidateInventory";

function readyCandidate(
  overrides: Partial<CCFRecoverySourceBinding> = {},
): CCFRecoverySourceBinding {
  return {
    bindingVersion: "ccf-recovery-source-binding-v1",
    bindingId: "ready-candidate",
    sourceClass: "official_game_activation",
    provider: "licensed-provider",
    datasetOrProduct: "game-roster",
    dimensions: ["participation"],
    authority: "raw_fact",
    status: "candidate",
    temporalMode: "archived_point_in_time",
    archiveStrategy: "immutable_snapshot",
    licenseOrTermsRef: "terms://licensed",
    permissionStatus: "permitted_for_intended_use",
    parserVersion: "parser-v1",
    sourceLocatorTemplate: "provider://game/{id}/roster",
    pointInTimeSemanticsDocumented: true,
    rawTraceSupported: true,
    reliabilityReviewRef: "review://provider/game-roster-v1",
    reliabilityStatus: "passed",
    notes: [],
    ...overrides,
  };
}

describe("CCF recovery source promotion readiness", () => {
  it("reports no blockers for a fully qualified candidate without auto-promoting it", () => {
    expect(evaluateCCFRecoverySourcePromotionReadiness(readyCandidate())).toEqual({
      bindingId: "ready-candidate",
      status: "candidate",
      promotable: true,
      blockers: [],
    });
  });

  it("enumerates missing provenance instead of relying on the first thrown gate", () => {
    const result = evaluateCCFRecoverySourcePromotionReadiness(
      readyCandidate({
        temporalMode: "current_snapshot_only",
        archiveStrategy: "none",
        licenseOrTermsRef: null,
        permissionStatus: "unreviewed",
        parserVersion: null,
        sourceLocatorTemplate: null,
        pointInTimeSemanticsDocumented: false,
        rawTraceSupported: false,
        reliabilityReviewRef: null,
        reliabilityStatus: "unreviewed",
      }),
    );

    expect(result.promotable).toBe(false);
    expect(result.blockers).toEqual([
      "temporal_mode_not_archived_point_in_time",
      "archive_strategy_missing",
      "license_or_terms_missing",
      "permission_not_cleared",
      "parser_version_missing",
      "source_locator_missing",
      "point_in_time_semantics_undocumented",
      "raw_trace_missing",
      "reliability_review_missing",
      "reliability_review_not_passed",
    ]);
  });

  it("keeps evaluation-only and conflicted permission states non-promotable", () => {
    expect(
      evaluateCCFRecoverySourcePromotionReadiness(
        readyCandidate({ permissionStatus: "evaluation_only" }),
      ).blockers,
    ).toEqual(["permission_not_cleared"]);
    expect(
      evaluateCCFRecoverySourcePromotionReadiness(
        readyCandidate({ permissionStatus: "conflicted" }),
      ).blockers,
    ).toEqual(["permission_not_cleared"]);
  });

  it("never marks rejected, research-only, challenger, or speculative sources promotable", () => {
    expect(
      evaluateCCFRecoverySourcePromotionReadiness(
        readyCandidate({ status: "rejected" }),
      ).blockers,
    ).toContain("status_rejected");
    expect(
      evaluateCCFRecoverySourcePromotionReadiness(
        readyCandidate({ status: "research_only" }),
      ).blockers,
    ).toContain("status_research_only");

    const speculative = evaluateCCFRecoverySourcePromotionReadiness(
      readyCandidate({
        authority: "challenger_inference",
        sourceClass: "social_media_speculation",
      }),
    );
    expect(speculative.promotable).toBe(false);
    expect(speculative.blockers).toEqual([
      "challenger_inference_not_eligible",
      "social_media_speculation_not_eligible",
    ]);
  });

  it("makes the live candidate inventory blockers explicit and reviewable", () => {
    const results = evaluateCCFRecoverySourcePlanPromotionReadiness(
      CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY,
    );
    const byId = new Map(results.map((row) => [row.bindingId, row]));
    const licensedCurrentCandidateBlockers = [
      "temporal_mode_not_archived_point_in_time",
      "archive_strategy_missing",
      "permission_not_cleared",
      "parser_version_missing",
      "point_in_time_semantics_undocumented",
      "raw_trace_missing",
      "reliability_review_not_passed",
    ];

    expect(
      byId.get("sportradar-nfl-weekly-injuries-designation-candidate-v1")?.blockers,
    ).toEqual(licensedCurrentCandidateBlockers);
    expect(
      byId.get("sportradar-nfl-weekly-injuries-practice-candidate-v1")?.blockers,
    ).toEqual(licensedCurrentCandidateBlockers);
    expect(
      byId.get("sportradar-nfl-official-game-roster-candidate-v1")?.blockers,
    ).toEqual(licensedCurrentCandidateBlockers);

    expect(
      byId.get("sportsdataio-nfl-player-game-snap-counts-candidate-v1")?.blockers,
    ).toEqual([
      "temporal_mode_not_archived_point_in_time",
      "archive_strategy_missing",
      "permission_not_cleared",
      "parser_version_missing",
      "source_locator_missing",
      "point_in_time_semantics_undocumented",
      "raw_trace_missing",
      "reliability_review_not_passed",
    ]);

    const revivedNflverseCandidateBlockers = [
      "temporal_mode_not_archived_point_in_time",
      "archive_strategy_missing",
      "permission_not_cleared",
      "point_in_time_semantics_undocumented",
      "raw_trace_missing",
      "reliability_review_not_passed",
    ];

    expect(
      byId.get("nflverse-injuries-official-designation-current-candidate-v2")?.blockers,
    ).toEqual(revivedNflverseCandidateBlockers);
    expect(
      byId.get("nflverse-injuries-practice-participation-current-candidate-v2")?.blockers,
    ).toEqual(revivedNflverseCandidateBlockers);

    expect(byId.get("nflverse-pfr-snap-counts-reference-v1")?.blockers).toEqual([
      "status_research_only",
      "permission_not_cleared",
      "reliability_review_not_passed",
    ]);

    expect(byId.get("nfl-official-inactive-report-terms-blocked-v1")?.blockers).toContain(
      "status_rejected",
    );
    expect(results.every((row) => row.promotable === false)).toBe(true);
  });
});