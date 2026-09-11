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
    implementationPaths: ["server/modules/ccf/certification/chronologicalSplit.ts"],
    testPaths: ["server/modules/ccf/certification/__tests__/chronologicalSplit.test.ts"],
    recommendationAuthority: false,
    remainingEvidence: ["point_in_time historical dataset", "rolling OOS execution", "TIBER-off replay"],
    note: "The leakage guard exists natively; it has not yet certified a production model on frozen historical observations.",
  },
  {
    capabilityId: "forecast-simple-benchmarks",
    maturity: "scaffold_implemented",
    implementationPaths: ["server/modules/ccf/certification/simpleBenchmarks.ts"],
    testPaths: ["server/modules/ccf/certification/__tests__/simpleBenchmarks.test.ts"],
    recommendationAuthority: false,
    remainingEvidence: ["chronological benchmark run", "production-model comparison", "TIBER-off replay"],
    note: "Historical mean, recent mean, and usage-rate baselines now exist so sophistication must beat simple alternatives.",
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
] as const;

export function findCCFNativeImplementationEvidence(
  capabilityId: string,
  records: readonly CCFNativeImplementationEvidenceRecord[] = CCF_NATIVE_IMPLEMENTATION_EVIDENCE_V0,
): CCFNativeImplementationEvidenceRecord | undefined {
  return records.find((record) => record.capabilityId === capabilityId);
}
