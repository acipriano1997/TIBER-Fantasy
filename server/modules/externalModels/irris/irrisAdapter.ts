import { IrrisIntegrationError, TiberIrrisInsight } from './types';

const asRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IrrisIntegrationError('invalid_payload', `${path} must be an object.`, 502);
  }
  return value as Record<string, unknown>;
};

const asNumber = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new IrrisIntegrationError('invalid_payload', `${path} must be a finite number.`, 502);
  }
  return value;
};

const asString = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new IrrisIntegrationError('invalid_payload', `${path} must be a non-empty string.`, 502);
  }
  return value;
};

const asStringArray = (value: unknown, path: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new IrrisIntegrationError('invalid_payload', `${path} must be a string array.`, 502);
  }
  return value as string[];
};

const probability = (value: unknown, path: string) => {
  const n = asNumber(value, path);
  if (n < 0 || n > 1) throw new IrrisIntegrationError('invalid_payload', `${path} must be between 0 and 1.`, 502);
  return n;
};

export const adaptIrrisAssessment = (payload: unknown): TiberIrrisInsight => {
  const root = asRecord(payload, 'IRRIS response');
  if (root.ok !== true) throw new IrrisIntegrationError('invalid_payload', 'IRRIS response did not report ok=true.', 502);
  const assessment = asRecord(root.assessment, 'assessment');

  if (assessment.schema_version !== 'irris-assessment-v0') {
    throw new IrrisIntegrationError('invalid_payload', 'Unsupported IRRIS assessment schema version.', 502);
  }
  if (assessment.inference_status !== 'model_inference_not_medically_confirmed') {
    throw new IrrisIntegrationError('invalid_payload', 'IRRIS payload lost its model-inference status marker.', 502);
  }

  const recovery = asRecord(assessment.recovery, 'assessment.recovery');
  const readiness = asRecord(assessment.readiness, 'assessment.readiness');
  const scenarios = asRecord(assessment.scenarios, 'assessment.scenarios');
  const divergence = asRecord(assessment.narrative_divergence, 'assessment.narrative_divergence');
  const official = assessment.official == null ? null : asRecord(assessment.official, 'assessment.official');

  if (!Array.isArray(assessment.differential)) {
    throw new IrrisIntegrationError('invalid_payload', 'assessment.differential must be an array.', 502);
  }

  const differential = assessment.differential.map((candidate, index) => {
    const row = asRecord(candidate, `assessment.differential[${index}]`);
    const severity = asRecord(row.severity, `assessment.differential[${index}].severity`);
    return {
      injuryFamily: asString(row.injury_family, `assessment.differential[${index}].injury_family`),
      probability: probability(row.probability, `assessment.differential[${index}].probability`),
      severity: {
        mild: probability(severity.mild, `assessment.differential[${index}].severity.mild`),
        moderate: probability(severity.moderate, `assessment.differential[${index}].severity.moderate`),
        severe: probability(severity.severe, `assessment.differential[${index}].severity.severe`),
      },
    };
  });

  const functional = asRecord(assessment.functional_limitations, 'assessment.functional_limitations');
  const functionalLimitations = Object.fromEntries(
    Object.entries(functional).map(([key, value]) => [key, probability(value, `assessment.functional_limitations.${key}`)]),
  );

  const scenarioValues = {
    inactive: probability(scenarios.inactive, 'assessment.scenarios.inactive'),
    activeNormal: probability(scenarios.active_normal, 'assessment.scenarios.active_normal'),
    activeLimited: probability(scenarios.active_limited, 'assessment.scenarios.active_limited'),
    activeEarlyExit: probability(scenarios.active_early_exit, 'assessment.scenarios.active_early_exit'),
  };
  const scenarioSum = Object.values(scenarioValues).reduce((sum, value) => sum + value, 0);
  if (Math.abs(scenarioSum - 1) > 0.01) {
    throw new IrrisIntegrationError('invalid_payload', 'IRRIS scenario probabilities must sum to 1.', 502);
  }

  const workloadLag = asRecord(recovery.return_to_workload_lag_games, 'assessment.recovery.return_to_workload_lag_games');
  const performanceLag = asRecord(recovery.return_to_performance_lag_games, 'assessment.recovery.return_to_performance_lag_games');
  const medicalClearance = assessment.medical_clearance_forecast;
  if (medicalClearance !== 'not_applicable' && medicalClearance !== 'not_predicted') {
    throw new IrrisIntegrationError('invalid_payload', 'Unsupported medical clearance forecast state.', 502);
  }

  return {
    source: 'tiber-forecast-irris',
    schemaVersion: 'irris-assessment-v0',
    modelVersion: asString(assessment.model_version, 'assessment.model_version'),
    playerId: asString(assessment.player_id, 'assessment.player_id'),
    asOf: asString(assessment.as_of, 'assessment.as_of'),
    inferenceStatus: 'model_inference_not_medically_confirmed',
    officialGameStatus: official && typeof official.game_status === 'string' ? official.game_status : null,
    differential,
    activeNextGameProbability: probability(recovery.active_next_game_probability, 'assessment.recovery.active_next_game_probability'),
    fullWorkloadNextGameProbability: probability(recovery.full_workload_next_game_probability, 'assessment.recovery.full_workload_next_game_probability'),
    medianGamesMissedBucket: asString(recovery.median_games_missed_bucket, 'assessment.recovery.median_games_missed_bucket'),
    returnToWorkloadLagGames: {
      low: asNumber(workloadLag.low, 'assessment.recovery.return_to_workload_lag_games.low'),
      median: asNumber(workloadLag.median, 'assessment.recovery.return_to_workload_lag_games.median'),
      high: asNumber(workloadLag.high, 'assessment.recovery.return_to_workload_lag_games.high'),
    },
    returnToPerformanceLagGames: {
      low: asNumber(performanceLag.low, 'assessment.recovery.return_to_performance_lag_games.low'),
      median: asNumber(performanceLag.median, 'assessment.recovery.return_to_performance_lag_games.median'),
      high: asNumber(performanceLag.high, 'assessment.recovery.return_to_performance_lag_games.high'),
    },
    recurrenceRisk: asString(recovery.recurrence_risk, 'assessment.recovery.recurrence_risk'),
    readiness: {
      score: asNumber(readiness.score, 'assessment.readiness.score'),
      label: asString(readiness.label, 'assessment.readiness.label'),
      uncertainty: probability(readiness.uncertainty, 'assessment.readiness.uncertainty'),
      drivers: asStringArray(readiness.drivers, 'assessment.readiness.drivers'),
    },
    scenarios: scenarioValues,
    functionalLimitations,
    narrativeDivergence: {
      level: asString(divergence.level, 'assessment.narrative_divergence.level'),
      score: probability(divergence.score, 'assessment.narrative_divergence.score'),
      explanation: asStringArray(divergence.explanation, 'assessment.narrative_divergence.explanation'),
    },
    confidence: probability(assessment.confidence, 'assessment.confidence'),
    medicalClearanceForecast: medicalClearance,
    eligibleEvidenceIds: asStringArray(assessment.eligible_evidence_ids, 'assessment.eligible_evidence_ids'),
    excludedFutureEvidenceIds: asStringArray(assessment.excluded_future_evidence_ids, 'assessment.excluded_future_evidence_ids'),
    caveats: asStringArray(assessment.caveats, 'assessment.caveats'),
  };
};
