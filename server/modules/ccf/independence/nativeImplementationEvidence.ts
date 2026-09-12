export type CCFNativeImplementationMaturity =
  | "scaffold_implemented"
  | "production_implemented"
  | "certified";

export interface CCFNativeImplementationEvidenceRecord {
  capabilityId: string;
  maturity: CCFNativeImplementationMaturity;
  implementationPaths: readonly string[];
  testPaths: readonly string[];
  recommendationAuthority: boolean;
  remainingEvidence: readonly string[];
  note: string;
}

/**
 * Implementation evidence is deliberately separate from capability migration
 * certification. A file existing does not mean a model/mechanism has earned
 * recommendation authority.
 */
export const CCF_NATIVE_IMPLEMENTATION_EVIDENCE_V0: readonly CCFNativeImplementationEvidenceRecord[] = [
  {
    capabilityId: "forecast-time-series-backtest",
    maturity: "scaffold_implemented",
    implementationPaths: ["server/modules/ccf/certification/chronologicalSplit.ts", "server/modules/ccf/certification/rollingBacktest.ts"],
    testPaths: ["server/modules/ccf/certification/__tests__/chronologicalSplit.test.ts", "server/modules/ccf/certification/__tests__/rollingBacktest.test.ts"],
    recommendationAuthority: false,
    remainingEvidence: ["point_in_time historical dataset", "rolling OOS execution", "TIBER-off replay"],
    note: "The leakage guard and expanding rolling windows exist natively; they have not yet certified a production model on frozen historical observations.",
  },
  {
    capabilityId: "forecast-simple-benchmarks",
    maturity: "scaffold_implemented",
    implementationPaths: ["server/modules/ccf/certification/simpleBenchmarks.ts", "server/modules/ccf/certification/modelComparison.ts"],
    testPaths: ["server/modules/ccf/certification/__tests__/simpleBenchmarks.test.ts", "server/modules/ccf/certification/__tests__/modelComparison.test.ts"],
    recommendationAuthority: false,
    remainingEvidence: ["chronological benchmark run", "production-model comparison", "TIBER-off replay"],
    note: "Historical mean, recent mean, and usage-rate baselines now exist with paired comparison so sophistication must beat simple alternatives.",
  },
  {
    capabilityId: "forecast-calibration-reliability",
    maturity: "scaffold_implemented",
    implementationPaths: ["server/modules/ccf/certification/calibration.ts"],
    testPaths: ["server/modules/ccf/certification/__tests__/calibration.test.ts"],
    recommendationAuthority: false,
    remainingEvidence: ["frozen OOS predictions", "position/context reliability report", "promotion thresholds", "TIBER-off replay"],
    note: "CCF can now measure interval coverage, median error, probability reliability bins, and Brier score without borrowing TIBER calibration outputs.",
  },
  {
    capabilityId: "forecast-subgroup-stability",
    maturity: "scaffold_implemented",
    implementationPaths: ["server/modules/ccf/certification/subgroupStability.ts"],
    testPaths: ["server/modules/ccf/certification/__tests__/subgroupStability.test.ts"],
    recommendationAuthority: false,
    remainingEvidence: ["frozen subgroup definitions", "minimum sample policy", "chronological OOS subgroup report", "TIBER-off replay"],
    note: "CCF can now expose aggregate-vs-subgroup error and interval-coverage gaps so broad accuracy cannot hide weak cohorts.",
  },
  {
    capabilityId: "forecast-replacement-vorp",
    maturity: "scaffold_implemented",
    implementationPaths: ["server/modules/ccf/value/replacementValue.ts"],
    testPaths: ["server/modules/ccf/value/__tests__/replacementValue.test.ts"],
    recommendationAuthority: false,
    remainingEvidence: ["real league roster/scoring binding", "historical decision-value evaluation", "ablation", "TIBER-off replay"],
    note: "Replacement baselines are derived from league starter demand plus actual flex allocation rather than static universal defaults.",
  },
  {
    capabilityId: "data-source-state-support-windows",
    maturity: "scaffold_implemented",
    implementationPaths: ["server/modules/ccf/sources/sourceState.ts"],
    testPaths: ["server/modules/ccf/sources/__tests__/sourceState.test.ts"],
    recommendationAuthority: false,
    remainingEvidence: ["bind every recommendation-critical provider", "point-in-time replay", "TIBER-off replay"],
    note: "CCF now rejects fixtures, candidates, future-known, stale and out-of-window evidence instead of inferring trust from paths or filenames.",
  },
  {
    capabilityId: "data-weather-evidence-contract",
    maturity: "scaffold_implemented",
    implementationPaths: ["server/modules/ccf/weather/weatherEvidence.ts"],
    testPaths: ["server/modules/ccf/weather/__tests__/weatherEvidence.test.ts"],
    recommendationAuthority: false,
    remainingEvidence: ["live direct providers", "immutable historical weather archive", "provider reconciliation", "fantasy-impact ablation", "TIBER-off replay"],
    note: "CCF owns the temporal/source/venue/roof/measurement contract and deterministic field-relative wind, but no provider or fantasy-impact weights are promoted.",
  },
  {
    capabilityId: "rookies-historical-reconstruction-freeze",
    maturity: "scaffold_implemented",
    implementationPaths: ["server/modules/ccf/certification/historicalFreeze.ts"],
    testPaths: ["server/modules/ccf/certification/__tests__/historicalFreeze.test.ts"],
    recommendationAuthority: false,
    remainingEvidence: ["historical source coverage", "real decision-time reconstruction", "contamination audit", "TIBER-off replay"],
    note: "CCF can freeze pre-decision inputs by known-time/hash, reject outcome contamination and require an explicit reason for refreezing historical context.",
  },
  {
    capabilityId: "rookies-transactional-artifact-promotion",
    maturity: "scaffold_implemented",
    implementationPaths: ["server/modules/ccf/sources/sourceSnapshot.ts", "server/modules/ccf/sources/transactionalArtifactPromotion.ts"],
    testPaths: ["server/modules/ccf/sources/__tests__/sourceSnapshot.test.ts", "server/modules/ccf/sources/__tests__/transactionalArtifactPromotion.test.ts"],
    recommendationAuthority: false,
    remainingEvidence: ["real promotion workflow binding", "failure-injection suite", "concurrency stress", "TIBER-off replay"],
    note: "CCF now binds source bytes and implements validate-before-swap, candidate/destination drift checks, rollback, and rejected-candidate preservation; operational certification remains required.",
  },
] as const;

export function findCCFNativeImplementationEvidence(
  capabilityId: string,
  records: readonly CCFNativeImplementationEvidenceRecord[] = CCF_NATIVE_IMPLEMENTATION_EVIDENCE_V0,
): CCFNativeImplementationEvidenceRecord | undefined {
  return records.find((record) => record.capabilityId === capabilityId);
}
