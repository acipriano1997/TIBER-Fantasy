import crypto from "crypto";
import {
  fingerprintCCFCandidateParameterArtifact,
  type CCFCandidateParameterArtifact,
} from "./candidateParameterArtifact";

export interface CCFVerifiedCandidateParameterPayload {
  contractVersion: "ccf-verified-candidate-parameter-payload-v1";
  artifactId: string;
  artifactFingerprint: string;
  parameterRef: string;
  parameterContentSha256: string;
  parsedPayload: Record<string, unknown>;
}

export class CCFVerifiedCandidateParameterPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFVerifiedCandidateParameterPayloadError";
  }
}

function requireObjectPayload(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new CCFVerifiedCandidateParameterPayloadError(
      "candidate parameter JSON must decode to a top-level object",
    );
  }
  return value as Record<string, unknown>;
}

/**
 * Verify the exact UTF-8 JSON bytes presented to a model consumer against the
 * already-frozen candidate parameter artifact before any model-specific parsing
 * or inference occurs.
 *
 * This is intentionally model-agnostic. It proves content identity only; a
 * downstream model adapter must still validate the decoded payload's schema.
 */
export function verifyCCFCandidateParameterPayload(
  artifact: CCFCandidateParameterArtifact,
  parameterContent: string,
): CCFVerifiedCandidateParameterPayload {
  const artifactFingerprint =
    fingerprintCCFCandidateParameterArtifact(artifact);

  if (artifact.parameterFormat !== "json") {
    throw new CCFVerifiedCandidateParameterPayloadError(
      `unsupported candidate parameter format ${artifact.parameterFormat}`,
    );
  }

  const actualSha256 = crypto
    .createHash("sha256")
    .update(parameterContent)
    .digest("hex");
  if (actualSha256 !== artifact.parameterContentSha256) {
    throw new CCFVerifiedCandidateParameterPayloadError(
      "candidate parameter bytes do not match the frozen artifact hash",
    );
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(parameterContent);
  } catch {
    throw new CCFVerifiedCandidateParameterPayloadError(
      "candidate parameter content is not valid JSON",
    );
  }

  return {
    contractVersion: "ccf-verified-candidate-parameter-payload-v1",
    artifactId: artifact.artifactId,
    artifactFingerprint,
    parameterRef: artifact.parameterRef,
    parameterContentSha256: actualSha256,
    parsedPayload: requireObjectPayload(decoded),
  };
}
