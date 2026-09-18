import {
  buildCCFRollingValidationForecastQuality,
} from "../rollingValidationForecastQuality";
import type { CCFRollingValidationExecutionV1 } from "../rollingValidationExecution";

function outcome(
  rowId: string,
  week: number,
  actual: number,
  predicted: number,
  confidence: number,
) {
  return {
    contractVersion: "ccf-historical-validation-prediction-v1" as const,
    rowId,
    blockId: `2024-W${week}`,
    actualFantasyPoints: actual,
    predictedFantasyPoints: predicted,
    pointEstimate: "mean_fpts" as const,
    abstained: false,
    replayBindingId: "ccf://rolling-replay-binding/sha256/quality",
    featureSnapshotFingerprint: `feature-${rowId}`,
    outcomeArtifactFingerprint: `outcome-${rowId}`,
    modelArtifactFingerprint: "model-v1",
    outcome: {
      playerId: rowId,
      position: "RB" as const,
      season: 2024,
      week,
      asOf: `2024-09-${String(week + 15).padStart(2, "0")}T16:00:00Z`,
      modelVersion: "ccf-player-outcome-v0",
      modelFamily: "CCF_PLAYER_OUTCOME" as const,
      mode: "CCF_NATIVE" as const,
      scoringFormat: "CUSTOM" as const,
      scoringFingerprint: "scoring-v1",
      meanFpts: predicted,
      medianFpts: predicted - 0.5,
      p10Fpts: predicted - 5,
      p25Fpts: predicted - 2,
      p75Fpts: predicted + 2,
      p90Fpts: predicted + 5,
      stddevFpts: 3,
      zeroOrNearZeroProbability: 0.05,
      boomProbability: 0.2,
      bustProbability: 0.1,
      coverageScore: 1,
      confidenceScore: confidence,
      abstain: false,
      criticalFeatureLineage: [],
      warnings: [],
    },
  };
}

function execution(): CCFRollingValidationExecutionV1 {
  return {
    contractVersion: "ccf-rolling-validation-execution-v1",
    replayBinding: {
      contractVersion: "ccf-rolling-replay-binding-v1",
      bindingId: "ccf://rolling-replay-binding/sha256/quality",
      windowIndex: 0,
      manifestFingerprint: "manifest-v1",
      protocolFingerprint: "protocol-v1",
      trainingDatasetFingerprint: "training-v1",
      trainingDatasetRef: "ccf://rolling-training-subset/sha256/training-v1",
      trainingRowIds: ["train-1"],
      evaluationRowIds: ["val-1", "val-2", "val-3"],
      trainingEvidenceMaxKnownAt: "2024-09-15T03:00:00Z",
      earliestEvaluationDecisionAsOf: "2024-09-22T16:00:00Z",
      modelArtifactFingerprint: "model-v1",
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    },
    pointEstimate: "mean_fpts",
    predictions: [
      outcome("val-1", 3, 10, 9, 0.95),
      outcome("val-2", 4, 20, 17, 0.7),
      outcome("val-3", 5, 5, 10, 0.2),
    ],
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}

describe("CCF rolling validation forecast quality", () => {
  it("derives distribution, interval, rank, and selective-prediction evidence without opening holdout", () => {
    const result = buildCCFRollingValidationForecastQuality(execution());

    expect(result).toMatchObject({
      sampleSize: 3,
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    });
    expect(result.intervalCalibration.sampleSize).toBe(3);
    expect(result.quantileScoring.sampleSize).toBe(15);
    expect(result.quantileScoring.byQuantile.map((row) => row.quantile)).toEqual([
      0.1,
      0.25,
      0.5,
      0.75,
      0.9,
    ]);
    expect(result.rankQuality.sampleSize).toBe(3);
    expect(result.selectivePrediction.sampleSize).toBe(3);
    expect(result.selectivePrediction.points[0].risk).toBe(1);
    expect(result.evidenceRefs.calibration).toMatch(
      /^ccf:\/\/rolling-validation-calibration\/sha256\/[a-f0-9]{64}$/,
    );
    expect(result.evidenceRefs.distributionQuality).toMatch(
      /^ccf:\/\/rolling-validation-distributionQuality\/sha256\/[a-f0-9]{64}$/,
    );
    expect(result.evidenceRefs.rankQuality).toMatch(
      /^ccf:\/\/rolling-validation-rankQuality\/sha256\/[a-f0-9]{64}$/,
    );
    expect(result.evidenceRefs.selectivePrediction).toMatch(
      /^ccf:\/\/rolling-validation-selectivePrediction\/sha256\/[a-f0-9]{64}$/,
    );
  });

  it("rejects incomplete evaluation-row coverage", () => {
    const run = execution();
    run.predictions = run.predictions.slice(0, 2);
    expect(() => buildCCFRollingValidationForecastQuality(run)).toThrow(
      /exact replay evaluation-row coverage/,
    );
  });

  it("refuses any execution that claims final-holdout access", () => {
    const run = execution() as CCFRollingValidationExecutionV1 & {
      finalHoldoutAccessed: boolean;
    };
    (run as any).finalHoldoutAccessed = true;
    expect(() =>
      buildCCFRollingValidationForecastQuality(
        run as CCFRollingValidationExecutionV1,
      ),
    ).toThrow(/sealed holdout/);
  });

  it("uses confidenceScore only as a selection score, not as a probability-calibration label", () => {
    const result = buildCCFRollingValidationForecastQuality(execution());
    expect(result.selectivePrediction.fullCoverageRisk).toBeCloseTo(3);
    expect(result).not.toHaveProperty("probabilityCalibration");
  });
});
