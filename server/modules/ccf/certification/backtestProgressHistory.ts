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
] as const;

function validMetric(value: number | null): boolean {
  return value === null || Number.isFinite(value);
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
