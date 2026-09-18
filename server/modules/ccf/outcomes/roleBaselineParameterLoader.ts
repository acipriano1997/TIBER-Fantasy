import crypto from "crypto";
import {
  fingerprintCCFCandidateParameterArtifact,
  type CCFCandidateParameterArtifact,
} from "../certification/candidateParameterArtifact";
import type { CCFPosition } from "./contract";
import type { CCFRoleBaselineParameters } from "./roleBaselineCandidate";

export interface CCFRoleBaselineParameterPayloadV1 {
  contractVersion: "ccf-role-baseline-parameter-payload-v1";
  position: CCFPosition;
  featureContractRef: string;
  featureKeys: string[];
  meanIntercept: number;
  meanWeights: Record<string, number>;
  volatilityIntercept: number;
  volatilityWeights: Record<string, number>;
  minimumVolatility: number;
  thresholds: {
    zeroOrNearZeroFpts: number;
    bustFpts: number;
    boomFpts: number;
  };
  parameterConfidence: number;
}

export interface CCFLoadedRoleBaselineParameters {
  candidateOnly: true;
  artifactId: string;
  artifactFingerprint: string;
  parameterContentSha256: string;
  parameters: CCFRoleBaselineParameters;
}

export class CCFRoleBaselineParameterLoaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRoleBaselineParameterLoaderError";
  }
}

const PAYLOAD_KEYS = [
  "contractVersion",
  "position",
  "featureContractRef",
  "featureKeys",
  "meanIntercept",
  "meanWeights",
  "volatilityIntercept",
  "volatilityWeights",
  "minimumVolatility",
  "thresholds",
  "parameterConfidence",
] as const;

const THRESHOLD_KEYS = [
  "zeroOrNearZeroFpts",
  "bustFpts",
  "boomFpts",
] as const;

function requireText(label: string, value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CCFRoleBaselineParameterLoaderError(`${label} is required`);
  }
  return value;
}

function requireFinite(label: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CCFRoleBaselineParameterLoaderError(`${label} must be finite`);
  }
  return value;
}

function requireObject(
  label: string,
  value: unknown,
): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new CCFRoleBaselineParameterLoaderError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  label: string,
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new CCFRoleBaselineParameterLoaderError(
      `${label} keys do not match the frozen payload schema`,
    );
  }
}

function parsePosition(value: unknown): CCFPosition {
  if (value !== "QB" && value !== "RB" && value !== "WR" && value !== "TE") {
    throw new CCFRoleBaselineParameterLoaderError(
      "position must be QB, RB, WR, or TE",
    );
  }
  return value;
}

function parseFeatureKeys(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CCFRoleBaselineParameterLoaderError(
      "featureKeys must be a non-empty array",
    );
  }
  const featureKeys = value.map((item, index) =>
    requireText(`featureKeys[${index}]`, item),
  );
  if (new Set(featureKeys).size !== featureKeys.length) {
    throw new CCFRoleBaselineParameterLoaderError(
      "featureKeys must not contain duplicates",
    );
  }
  return featureKeys;
}

function parseWeights(
  label: string,
  value: unknown,
  featureKeys: readonly string[],
): Record<string, number> {
  const record = requireObject(label, value);
  requireExactKeys(label, record, featureKeys);
  return Object.fromEntries(
    featureKeys.map((key) => [
      key,
      requireFinite(`${label}.${key}`, record[key]),
    ]),
  );
}

function parsePayload(parameterContent: string): CCFRoleBaselineParameterPayloadV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(parameterContent);
  } catch {
    throw new CCFRoleBaselineParameterLoaderError(
      "parameter content must be valid JSON",
    );
  }

  const record = requireObject("parameter payload", parsed);
  requireExactKeys("parameter payload", record, PAYLOAD_KEYS);

  if (record.contractVersion !== "ccf-role-baseline-parameter-payload-v1") {
    throw new CCFRoleBaselineParameterLoaderError(
      "unsupported role baseline parameter payload version",
    );
  }

  const featureKeys = parseFeatureKeys(record.featureKeys);
  const thresholds = requireObject("thresholds", record.thresholds);
  requireExactKeys("thresholds", thresholds, THRESHOLD_KEYS);

  return {
    contractVersion: "ccf-role-baseline-parameter-payload-v1",
    position: parsePosition(record.position),
    featureContractRef: requireText(
      "featureContractRef",
      record.featureContractRef,
    ),
    featureKeys,
    meanIntercept: requireFinite("meanIntercept", record.meanIntercept),
    meanWeights: parseWeights("meanWeights", record.meanWeights, featureKeys),
    volatilityIntercept: requireFinite(
      "volatilityIntercept",
      record.volatilityIntercept,
    ),
    volatilityWeights: parseWeights(
      "volatilityWeights",
      record.volatilityWeights,
      featureKeys,
    ),
    minimumVolatility: requireFinite(
      "minimumVolatility",
      record.minimumVolatility,
    ),
    thresholds: {
      zeroOrNearZeroFpts: requireFinite(
        "thresholds.zeroOrNearZeroFpts",
        thresholds.zeroOrNearZeroFpts,
      ),
      bustFpts: requireFinite("thresholds.bustFpts", thresholds.bustFpts),
      boomFpts: requireFinite("thresholds.boomFpts", thresholds.boomFpts),
    },
    parameterConfidence: requireFinite(
      "parameterConfidence",
      record.parameterConfidence,
    ),
  };
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Convert exact frozen parameter bytes into the candidate-only role-baseline
 * parameter contract.
 *
 * Governance identity is never trusted from the JSON payload. Model version,
 * freeze time, dataset fingerprint, scoring fingerprint and artifact reference
 * are derived only from the immutable candidate artifact whose content hash is
 * verified against the exact bytes supplied here.
 */
export function loadCCFRoleBaselineParametersFromCandidateArtifact(
  artifact: CCFCandidateParameterArtifact,
  parameterContent: string,
): CCFLoadedRoleBaselineParameters {
  const artifactFingerprint = fingerprintCCFCandidateParameterArtifact(artifact);

  if (artifact.modelFamily !== "role_opportunity_baseline") {
    throw new CCFRoleBaselineParameterLoaderError(
      `candidate modelFamily ${artifact.modelFamily} is not role_opportunity_baseline`,
    );
  }
  requireText("artifact.modelVersion", artifact.modelVersion);
  requireText("artifact.datasetFingerprint", artifact.datasetFingerprint);
  requireText(
    "artifact.scoringProfileFingerprint",
    artifact.scoringProfileFingerprint,
  );
  requireText("artifact.parameterRef", artifact.parameterRef);
  requireText("artifact.frozenAt", artifact.frozenAt);
  if (!/^[a-f0-9]{64}$/.test(artifact.parameterContentSha256)) {
    throw new CCFRoleBaselineParameterLoaderError(
      "artifact parameterContentSha256 is invalid",
    );
  }

  const actualContentSha256 = sha256(parameterContent);
  if (actualContentSha256 !== artifact.parameterContentSha256) {
    throw new CCFRoleBaselineParameterLoaderError(
      "parameter bytes do not match the frozen candidate artifact",
    );
  }

  const payload = parsePayload(parameterContent);

  return {
    candidateOnly: true,
    artifactId: artifact.artifactId,
    artifactFingerprint,
    parameterContentSha256: actualContentSha256,
    parameters: {
      contractVersion: "ccf-role-baseline-parameters-v1",
      modelVersion: artifact.modelVersion,
      position: payload.position,
      frozenAt: artifact.frozenAt,
      parameterArtifactRef: artifact.artifactId,
      trainingDatasetFingerprint: artifact.datasetFingerprint,
      featureContractRef: payload.featureContractRef,
      scoringProfileFingerprint: artifact.scoringProfileFingerprint,
      featureKeys: [...payload.featureKeys],
      meanIntercept: payload.meanIntercept,
      meanWeights: { ...payload.meanWeights },
      volatilityIntercept: payload.volatilityIntercept,
      volatilityWeights: { ...payload.volatilityWeights },
      minimumVolatility: payload.minimumVolatility,
      thresholds: { ...payload.thresholds },
      parameterConfidence: payload.parameterConfidence,
      certificationState: "uncertified_candidate",
    },
  };
}
