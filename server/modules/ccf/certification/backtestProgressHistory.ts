export type CCFBacktestProgressStage =
  | "evaluation_infrastructure"
  | "native_scaffold"
  | "production_candidate"
  | "certified_release";

export type CCFBacktestProgressStatus =
  | "infrastructure_only"
  | "not_run"
  | "failed"
  | "passed"
  | "certified";

export interface CCFBacktestMetricSet {
  mae: number | null;
  rmse: number | null;
  spearman: number | null;
  central50Coverage: number | null;
  central80Coverage: number | null;
  brier: number | null;
  lineupRegret: number | null;
  abstentionRate: number | null;
}

export interface CCFBacktestComparisonIdentity {
  protocolVersion: string;
  scoringProfileHash: string | null;
  supportedPopulation: string | null;
  testWindow: string | null;
  datasetFingerprint: string | null;
}

export interface CCFCertificationBinding {
  receiptFingerprint: string;
  protocolFingerprint: string;
  candidateArtifactFingerprint: string;
  nativeBaselineFingerprint: string;
  calibrationArtifactFingerprint: string;
  sourcePlanFingerprint: string;
  featureSetFingerprint: string;
  decisionPolicyFingerprint: string;
  finalHoldoutAccessCount: 1;
}

export interface CCFBacktestProgressRecord {
  id: string;
  recordedAt: string;
  stage: CCFBacktestProgressStage;
  status: CCFBacktestProgressStatus;
  modelVersion: string | null;
  calibrationVersion: string | null;
  comparisonIdentity: CCFBacktestComparisonIdentity;
  metrics: CCFBacktestMetricSet;
  simpleBaselineMetrics: CCFBacktestMetricSet | null;
  challengerMetrics: CCFBacktestMetricSet | null;
  tiberRole: "none" | "challenger_only";
  evidenceRefs: readonly string[];
  claim: string;
  certificationBinding?: CCFCertificationBinding | null;
}

export const EMPTY_CCF_BACKTEST_METRICS: CCFBacktestMetricSet = Object.freeze({
  mae: null,
  rmse: null,
  spearman: null,
  central50Coverage: null,
  central80Coverage: null,
  brier: null,
  lineupRegret: null,
  abstentionRate: null,
});

/**
 * Append-only program history. Entries document what was actually proven at the
 * time, not what later code is capable of doing. Never backfill numeric metrics
 * into an older entry after the fact; append a new frozen run instead.
 */
export const CCF_BACKTEST_PROGRESS_HISTORY_V1: readonly CCFBacktestProgressRecord[] = [
  {
    id: "2026-09-07-gate2-postgame-evaluation",
    recordedAt: "2026-09-07T23:21:36.000Z",
    stage: "evaluation_infrastructure",
    status: "infrastructure_only",
    modelVersion: null,
    calibrationVersion: null,
    comparisonIdentity: {
      protocolVersion: "weekly_decision_postgame_evaluation_v1",
      scoringProfileHash: null,
      supportedPopulation: null,
      testWindow: null,
      datasetFingerprint: null,
    },
    metrics: { ...EMPTY_CCF_BACKTEST_METRICS },
    simpleBaselineMetrics: null,
    challengerMetrics: null,
    tiberRole: "none",
    evidenceRefs: [
      "TIBER-Fantasy PR #10",
      "server/services/weeklyDecisionPostgameEvaluation.ts",
    ],
    claim:
      "Certified the ability to evaluate immutable pregame decisions and homogeneous calibration cohorts; did not establish production CCF predictive performance.",
  },
  {
    id: "2026-09-11-ccf-independence-foundation",
    recordedAt: "2026-09-11T16:00:00.000Z",
    stage: "native_scaffold",
    status: "not_run",
    modelVersion: null,
    calibrationVersion: null,
    comparisonIdentity: {
      protocolVersion: "ccf-chronological-oos-v1",
      scoringProfileHash: null,
      supportedPopulation: "QB/RB/WR/TE weekly outcome candidate",
      testWindow: null,
      datasetFingerprint: null,
    },
    metrics: { ...EMPTY_CCF_BACKTEST_METRICS },
    simpleBaselineMetrics: { ...EMPTY_CCF_BACKTEST_METRICS },
    challengerMetrics: { ...EMPTY_CCF_BACKTEST_METRICS },
    tiberRole: "challenger_only",
    evidenceRefs: [
      "TIBER-Fantasy PR #25",
      "server/modules/ccf/certification/chronologicalSplit.ts",
      "server/modules/ccf/certification/rollingBacktest.ts",
      "server/modules/ccf/certification/simpleBenchmarks.ts",
      "server/modules/ccf/certification/modelComparison.ts",
      "server/modules/ccf/certification/calibration.ts",
      "server/modules/ccf/certification/subgroupStability.ts",
    ],
    claim:
      "Native leakage-safe backtest/calibration tooling exists, but no frozen production CCF candidate has yet completed a point-in-time historical OOS run; numeric performance claims are therefore intentionally absent.",
  },
  {
    id: "2026-09-15-predictive-validation-error-intelligence",
    recordedAt: "2026-09-15T05:45:00.000Z",
    stage: "native_scaffold",
    status: "not_run",
    modelVersion: null,
    calibrationVersion: null,
    comparisonIdentity: {
      protocolVersion: "ccf-predictive-validation-protocol-v1",
      scoringProfileHash: null,
      supportedPopulation: "QB/RB/WR/TE weekly fantasy decision candidate",
      testWindow: null,
      datasetFingerprint: null,
    },
    metrics: { ...EMPTY_CCF_BACKTEST_METRICS },
    simpleBaselineMetrics: { ...EMPTY_CCF_BACKTEST_METRICS },
    challengerMetrics: { ...EMPTY_CCF_BACKTEST_METRICS },
    tiberRole: "challenger_only",
    evidenceRefs: [
      "server/modules/ccf/certification/predictiveValidationProtocol.ts",
      "server/modules/ccf/certification/pairedUncertainty.ts",
      "server/modules/ccf/certification/decisionRegret.ts",
      "server/modules/ccf/certification/missAttribution.ts",
      "server/modules/ccf/certification/featureAblation.ts",
      "server/modules/ccf/certification/calibration.ts",
      "server/modules/ccf/certification/selectivePrediction.ts",
      "server/modules/ccf/certification/quantileScoring.ts",
      "server/modules/ccf/certification/rankMetrics.ts",
      "server/modules/ccf/certification/promotionEvaluation.ts",
      "docs/architecture/CCF_PREDICTIVE_VALIDATION_AND_ERROR_INTELLIGENCE_V0.md",
    ],
    claim:
      "Added CCF-wide preregistration, paired block uncertainty, decision-regret, calibration/sharpness and proper-scoring diagnostics, selective-prediction risk/coverage, rank metrics, feature ablation, deterministic promotion evaluation, and miss attribution; no production historical OOS run has been executed and no predictive improvement is claimed.",
  },
] as const;

function validMetric(value: number | null): boolean {
  return value === null || Number.isFinite(value);
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function requireAuthorityMetric(record: CCFBacktestProgressRecord, label: "metrics" | "simpleBaselineMetrics", metric: "mae" | "rmse"): void {
  const set = record[label];
  const value = set?.[metric];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${record.id} ${label}.${metric} is required for certified release`);
  }
}

function validateCertificationBinding(record: CCFBacktestProgressRecord): void {
  const binding = record.certificationBinding;
  if (!binding) throw new Error(`${record.id} certified release requires certificationBinding`);
  for (const [label, value] of [
    ["receiptFingerprint", binding.receiptFingerprint],
    ["protocolFingerprint", binding.protocolFingerprint],
    ["candidateArtifactFingerprint", binding.candidateArtifactFingerprint],
    ["nativeBaselineFingerprint", binding.nativeBaselineFingerprint],
    ["calibrationArtifactFingerprint", binding.calibrationArtifactFingerprint],
    ["sourcePlanFingerprint", binding.sourcePlanFingerprint],
    ["featureSetFingerprint", binding.featureSetFingerprint],
    ["decisionPolicyFingerprint", binding.decisionPolicyFingerprint],
  ] as const) {
    if (!hasText(value)) throw new Error(`${record.id} certificationBinding.${label} is required`);
  }
  if (binding.finalHoldoutAccessCount !== 1) {
    throw new Error(`${record.id} certified release requires exactly one final holdout access`);
  }
  if (record.calibrationVersion !== binding.calibrationArtifactFingerprint) {
    throw new Error(`${record.id} calibrationVersion must equal certification calibration fingerprint`);
  }
  const requiredEvidence = [
    `ccf-predictive-receipt:${binding.receiptFingerprint}`,
    `ccf-predictive-protocol:${binding.protocolFingerprint}`,
    `ccf-candidate:${binding.candidateArtifactFingerprint}`,
    `ccf-native-baseline:${binding.nativeBaselineFingerprint}`,
    `ccf-calibration:${binding.calibrationArtifactFingerprint}`,
  ];
  for (const reference of requiredEvidence) {
    if (!record.evidenceRefs.includes(reference)) {
      throw new Error(`${record.id} missing certification evidence ${reference}`);
    }
  }
}

export function validateCCFBacktestProgressHistory(
  history: readonly CCFBacktestProgressRecord[] = CCF_BACKTEST_PROGRESS_HISTORY_V1,
): void {
  const ids = new Set<string>();
  let lastRecordedAt = -Infinity;

  for (const record of history) {
    if (!record.id.trim()) throw new Error("backtest history record id is required");
    if (ids.has(record.id)) throw new Error(`duplicate backtest history record id ${record.id}`);
    ids.add(record.id);
    if (!hasText(record.claim)) throw new Error(`${record.id} claim is required`);
    if (record.evidenceRefs.length === 0 || record.evidenceRefs.some((reference) => !hasText(reference))) {
      throw new Error(`${record.id} evidenceRefs must contain non-empty evidence`);
    }
    if (new Set(record.evidenceRefs).size !== record.evidenceRefs.length) {
      throw new Error(`${record.id} evidenceRefs must not contain duplicates`);
    }

    const recordedAt = Date.parse(record.recordedAt);
    if (!Number.isFinite(recordedAt)) throw new Error(`invalid recordedAt for ${record.id}`);
    if (recordedAt < lastRecordedAt) throw new Error("backtest history must remain chronological and append-only");
    lastRecordedAt = recordedAt;

    for (const metrics of [record.metrics, record.simpleBaselineMetrics, record.challengerMetrics]) {
      if (!metrics) continue;
      for (const value of Object.values(metrics)) {
        if (!validMetric(value)) throw new Error(`non-finite metric in ${record.id}`);
      }
    }

    if ((record.status === "infrastructure_only" || record.status === "not_run") &&
        Object.values(record.metrics).some((value) => value !== null)) {
      throw new Error(`${record.id} cannot carry performance metrics before a completed backtest`);
    }

    const isCertifiedRelease = record.stage === "certified_release" || record.status === "certified";
    if (isCertifiedRelease) {
      if (record.stage !== "certified_release" || record.status !== "certified") {
        throw new Error(`${record.id} certified stage/status must appear together`);
      }
      if (!hasText(record.modelVersion) || !hasText(record.calibrationVersion)) {
        throw new Error(`${record.id} certified release requires model and calibration versions`);
      }
      for (const [label, value] of [
        ["protocolVersion", record.comparisonIdentity.protocolVersion],
        ["scoringProfileHash", record.comparisonIdentity.scoringProfileHash],
        ["supportedPopulation", record.comparisonIdentity.supportedPopulation],
        ["testWindow", record.comparisonIdentity.testWindow],
        ["datasetFingerprint", record.comparisonIdentity.datasetFingerprint],
      ] as const) {
        if (!hasText(value)) throw new Error(`${record.id} comparisonIdentity.${label} is required`);
      }
      requireAuthorityMetric(record, "metrics", "mae");
      requireAuthorityMetric(record, "metrics", "rmse");
      requireAuthorityMetric(record, "simpleBaselineMetrics", "mae");
      requireAuthorityMetric(record, "simpleBaselineMetrics", "rmse");
      validateCertificationBinding(record);
    } else if (record.certificationBinding) {
      throw new Error(`${record.id} non-certified record cannot carry certificationBinding`);
    }
  }
}

export function areCCFBacktestRecordsComparable(
  left: CCFBacktestProgressRecord,
  right: CCFBacktestProgressRecord,
): boolean {
  const a = left.comparisonIdentity;
  const b = right.comparisonIdentity;
  return (
    a.protocolVersion === b.protocolVersion &&
    a.scoringProfileHash !== null &&
    a.scoringProfileHash === b.scoringProfileHash &&
    a.supportedPopulation !== null &&
    a.supportedPopulation === b.supportedPopulation &&
    a.testWindow !== null &&
    a.testWindow === b.testWindow &&
    a.datasetFingerprint !== null &&
    a.datasetFingerprint === b.datasetFingerprint
  );
}

export function latestCompletedCCFBacktest(
  history: readonly CCFBacktestProgressRecord[] = CCF_BACKTEST_PROGRESS_HISTORY_V1,
): CCFBacktestProgressRecord | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const record = history[index];
    if (record.status === "passed" || record.status === "failed" || record.status === "certified") {
      return record;
    }
  }
  return null;
}