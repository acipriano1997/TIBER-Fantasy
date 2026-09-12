import crypto from "crypto";

export type CCFHistoricalArtifactRole =
  | "predraft_profile"
  | "landing_context"
  | "injury_context"
  | "market_context"
  | "team_context"
  | "other_predecision";

export interface CCFHistoricalArtifactInput {
  artifactId: string;
  role: CCFHistoricalArtifactRole;
  knownAt: string;
  content: string | Buffer | Uint8Array;
  sourceRef: string;
  outcomeContaminated?: boolean;
}

export interface CCFHistoricalFrozenArtifact {
  artifactId: string;
  role: CCFHistoricalArtifactRole;
  knownAt: string;
  sourceRef: string;
  sha256: string;
  bytes: number;
}

export interface CCFHistoricalRefreezeRecord {
  refrozenAt: string;
  reason: string;
  priorManifestSha256: string;
}

export interface CCFHistoricalExpectationFreeze {
  contractVersion: "ccf-historical-expectation-freeze-v1";
  subjectId: string;
  decisionAsOf: string;
  frozenAt: string;
  artifacts: CCFHistoricalFrozenArtifact[];
  outcomesIncluded: false;
  refreezeHistory: CCFHistoricalRefreezeRecord[];
}

export class CCFHistoricalFreezeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFHistoricalFreezeError";
  }
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new CCFHistoricalFreezeError(`${label} must be a valid timestamp`);
  return parsed;
}

function bytesOf(content: string | Buffer | Uint8Array): Buffer {
  if (typeof content === "string") return Buffer.from(content, "utf8");
  return Buffer.from(content);
}

function hash(content: string | Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(bytesOf(content)).digest("hex");
}

export function fingerprintCCFHistoricalFreeze(
  freeze: CCFHistoricalExpectationFreeze,
): string {
  const canonical = JSON.stringify({
    contractVersion: freeze.contractVersion,
    subjectId: freeze.subjectId,
    decisionAsOf: freeze.decisionAsOf,
    frozenAt: freeze.frozenAt,
    outcomesIncluded: freeze.outcomesIncluded,
    artifacts: [...freeze.artifacts].sort((a, b) => a.artifactId.localeCompare(b.artifactId)),
    refreezeHistory: freeze.refreezeHistory,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function createCCFHistoricalExpectationFreeze(input: {
  subjectId: string;
  decisionAsOf: string;
  frozenAt: string;
  artifacts: readonly CCFHistoricalArtifactInput[];
  previous?: CCFHistoricalExpectationFreeze;
  refreezeReason?: string;
}): CCFHistoricalExpectationFreeze {
  if (!input.subjectId.trim()) throw new CCFHistoricalFreezeError("subjectId is required");
  const decisionAsOf = parseTimestamp("decisionAsOf", input.decisionAsOf);
  const frozenAt = parseTimestamp("frozenAt", input.frozenAt);
  if (frozenAt < decisionAsOf) {
    throw new CCFHistoricalFreezeError("frozenAt cannot precede decisionAsOf");
  }
  if (input.artifacts.length === 0) {
    throw new CCFHistoricalFreezeError("at least one pre-decision artifact is required");
  }

  if (input.previous) {
    if (!input.refreezeReason?.trim()) {
      throw new CCFHistoricalFreezeError("refreezing requires an explicit non-empty refreezeReason");
    }
    if (input.previous.subjectId !== input.subjectId) {
      throw new CCFHistoricalFreezeError("refreeze subjectId must match the previous freeze");
    }
  } else if (input.refreezeReason != null) {
    throw new CCFHistoricalFreezeError("refreezeReason is only valid when a previous freeze is supplied");
  }

  const ids = new Set<string>();
  const artifacts = input.artifacts.map((artifact) => {
    if (!artifact.artifactId.trim()) throw new CCFHistoricalFreezeError("artifactId is required");
    if (ids.has(artifact.artifactId)) {
      throw new CCFHistoricalFreezeError(`duplicate artifactId ${artifact.artifactId}`);
    }
    ids.add(artifact.artifactId);
    if (!artifact.sourceRef.trim()) throw new CCFHistoricalFreezeError(`${artifact.artifactId} sourceRef is required`);
    if (artifact.outcomeContaminated) {
      throw new CCFHistoricalFreezeError(`${artifact.artifactId} is outcome-contaminated and cannot enter a pre-decision freeze`);
    }
    const knownAt = parseTimestamp(`${artifact.artifactId}.knownAt`, artifact.knownAt);
    if (knownAt > decisionAsOf) {
      throw new CCFHistoricalFreezeError(`${artifact.artifactId} became known after decisionAsOf`);
    }
    const bytes = bytesOf(artifact.content);
    if (bytes.byteLength === 0) {
      throw new CCFHistoricalFreezeError(`${artifact.artifactId} content must not be empty`);
    }
    return {
      artifactId: artifact.artifactId,
      role: artifact.role,
      knownAt: artifact.knownAt,
      sourceRef: artifact.sourceRef,
      sha256: hash(bytes),
      bytes: bytes.byteLength,
    };
  });

  const refreezeHistory = input.previous
    ? [
        ...input.previous.refreezeHistory,
        {
          refrozenAt: input.frozenAt,
          reason: input.refreezeReason!.trim(),
          priorManifestSha256: fingerprintCCFHistoricalFreeze(input.previous),
        },
      ]
    : [];

  return {
    contractVersion: "ccf-historical-expectation-freeze-v1",
    subjectId: input.subjectId,
    decisionAsOf: input.decisionAsOf,
    frozenAt: input.frozenAt,
    artifacts,
    outcomesIncluded: false,
    refreezeHistory,
  };
}

export function verifyCCFHistoricalFrozenArtifact(
  frozen: CCFHistoricalFrozenArtifact,
  content: string | Buffer | Uint8Array,
): boolean {
  const bytes = bytesOf(content);
  return bytes.byteLength === frozen.bytes && hash(bytes) === frozen.sha256;
}
