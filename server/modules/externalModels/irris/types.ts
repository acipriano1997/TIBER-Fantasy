export type IrrisIntegrationErrorCode =
  | 'config_error'
  | 'upstream_timeout'
  | 'upstream_unavailable'
  | 'invalid_payload';

export class IrrisIntegrationError extends Error {
  constructor(
    public readonly code: IrrisIntegrationErrorCode,
    message: string,
    public readonly status: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'IrrisIntegrationError';
  }
}

export interface IrrisClientConfig {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface TiberIrrisCandidate {
  injuryFamily: string;
  probability: number;
  severity: { mild: number; moderate: number; severe: number };
}

export interface TiberIrrisInsight {
  source: 'tiber-forecast-irris';
  schemaVersion: 'irris-assessment-v0';
  modelVersion: string;
  playerId: string;
  asOf: string;
  inferenceStatus: 'model_inference_not_medically_confirmed';
  officialGameStatus: string | null;
  differential: TiberIrrisCandidate[];
  activeNextGameProbability: number;
  fullWorkloadNextGameProbability: number;
  medianGamesMissedBucket: string;
  returnToWorkloadLagGames: { low: number; median: number; high: number };
  returnToPerformanceLagGames: { low: number; median: number; high: number };
  recurrenceRisk: string;
  readiness: { score: number; label: string; uncertainty: number; drivers: string[] };
  scenarios: {
    inactive: number;
    activeNormal: number;
    activeLimited: number;
    activeEarlyExit: number;
  };
  functionalLimitations: Record<string, number>;
  narrativeDivergence: { level: string; score: number; explanation: string[] };
  confidence: number;
  medicalClearanceForecast: 'not_applicable' | 'not_predicted';
  eligibleEvidenceIds: string[];
  excludedFutureEvidenceIds: string[];
  caveats: string[];
}

export interface TiberIrrisServiceResult {
  ok: boolean;
  insight?: TiberIrrisInsight;
  error?: { code: IrrisIntegrationErrorCode; message: string; status: number };
}
