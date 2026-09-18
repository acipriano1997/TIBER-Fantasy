import {
  fetchAndArchiveNflverseInjuries,
  type CCFArchivedNflverseInjurySnapshot,
} from "./archivedNflverseInjuries";
import {
  refCCFNFLPlayerIdentityLinkageReceipt,
  type CCFNFLPlayerIdentityLinkageReceipt,
} from "./nflPlayerIdentityLinkage";
import {
  CCF_NFLVERSE_INJURY_DESIGNATION_SOURCE_ID_V2,
  CCF_NFLVERSE_PRACTICE_PARTICIPATION_SOURCE_ID_V2,
} from "./nflverseInjuryCertificationPolicy";
import {
  buildCCFNflverseInjuryReliabilityObservation,
  type CCFNflverseInjuryReliabilityCapability,
} from "./nflverseInjuryReliability";
import {
  fingerprintCCFSourceReliabilityPolicy,
  validateCCFSourceReliabilityObservation,
  validateCCFSourceReliabilityPolicy,
  type CCFSourceReliabilityObservation,
  type CCFSourceReliabilityPolicy,
} from "./sourceReliabilityReview";

export interface RunCCFNflverseInjuryCheckpointInput {
  policy: CCFSourceReliabilityPolicy;
  identityReceipt: CCFNFLPlayerIdentityLinkageReceipt;
  season: number;
  checkpointId: string;
  archiveRootDir: string;
  previousSnapshot?: CCFArchivedNflverseInjurySnapshot | null;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  now?: () => Date;
}

export interface CCFNflverseInjuryCheckpointResult {
  policyFingerprint: string;
  observation: CCFSourceReliabilityObservation;
  snapshot: CCFArchivedNflverseInjurySnapshot | null;
}

export class CCFNflverseInjuryCheckpointRunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseInjuryCheckpointRunnerError";
  }
}

function capabilityForPolicy(
  policy: CCFSourceReliabilityPolicy,
): CCFNflverseInjuryReliabilityCapability {
  if (policy.sourceId === CCF_NFLVERSE_INJURY_DESIGNATION_SOURCE_ID_V2) {
    return "injury_designation";
  }
  if (policy.sourceId === CCF_NFLVERSE_PRACTICE_PARTICIPATION_SOURCE_ID_V2) {
    return "practice_participation";
  }
  throw new CCFNflverseInjuryCheckpointRunnerError(
    `unsupported injury checkpoint sourceId ${policy.sourceId}`,
  );
}

function checkpointWeek(checkpointId: string): number {
  const match = /^w(\d+)-/.exec(checkpointId.trim().toLowerCase());
  const week = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(week) || week <= 0) {
    throw new CCFNflverseInjuryCheckpointRunnerError(
      `checkpoint ${checkpointId} does not encode an NFL week`,
    );
  }
  return week;
}

function failureObservation(
  policy: CCFSourceReliabilityPolicy,
  checkpointId: string,
  scheduledFor: string,
  capturedAt: string,
  policyFingerprint: string,
): CCFSourceReliabilityObservation {
  return validateCCFSourceReliabilityObservation({
    schemaVersion: "ccf-source-reliability-observation-v1",
    observationId: [
      policy.sourceId,
      checkpointId,
      "capture_failure",
      capturedAt,
      policyFingerprint,
    ].join(":"),
    sourceId: policy.sourceId,
    producer: policy.producer,
    checkpointId,
    scheduledFor,
    capturedAt,
    captureStatus: "failure",
    parserVersion: null,
    archiveRef: null,
    contentSha256: null,
    schemaStatus: "not_evaluated",
    rowCount: 0,
    identityEligibleCount: 0,
    identityResolvedCount: 0,
    criticalFieldEligibleCount: 0,
    criticalFieldMissingCount: 0,
    duplicateKeyCount: 0,
    correctionStatus: "not_evaluated",
    evidenceRefs: [
      policy.identityBindingRef,
      policy.criticalFieldPolicyRef,
      policy.correctionPolicyRef,
      policy.checkpointPolicyRef,
      `ccf://source-reliability-policy/sha256/${policyFingerprint}`,
    ].sort(),
    notes: ["capture_failed_before_archive"],
  });
}

/**
 * Execute exactly one frozen injury/practice reliability checkpoint.
 *
 * Governance mismatches are rejected before network access. Once a checkpoint
 * is eligible to run, provider fetch/archive failures are converted into
 * explicit reliability failure observations so missed captures cannot vanish
 * from the review ledger. Post-fetch identity/correction/integrity defects are
 * deliberately allowed to throw because they are contract failures, not source
 * availability failures.
 */
export async function runCCFNflverseInjuryCheckpoint(
  input: RunCCFNflverseInjuryCheckpointInput,
): Promise<CCFNflverseInjuryCheckpointResult> {
  validateCCFSourceReliabilityPolicy(input.policy);
  const capability = capabilityForPolicy(input.policy);
  if (input.policy.parserVersion !== "ccf-nflverse-injuries-candidate-v2") {
    throw new CCFNflverseInjuryCheckpointRunnerError(
      "injury checkpoint runner requires the injuries v2 parser policy",
    );
  }

  const expectedIdentityRef = refCCFNFLPlayerIdentityLinkageReceipt(input.identityReceipt);
  if (expectedIdentityRef !== input.policy.identityBindingRef) {
    throw new CCFNflverseInjuryCheckpointRunnerError(
      "identity receipt does not match the frozen reliability policy",
    );
  }

  const checkpoint = input.policy.checkpoints.find(
    (candidate) => candidate.checkpointId === input.checkpointId,
  );
  if (!checkpoint) {
    throw new CCFNflverseInjuryCheckpointRunnerError(
      `unknown frozen checkpoint ${input.checkpointId}`,
    );
  }
  const week = checkpointWeek(checkpoint.checkpointId);
  const now = input.now ?? (() => new Date());
  const beforeFetch = now();
  if (beforeFetch.getTime() < Date.parse(checkpoint.scheduledFor)) {
    throw new CCFNflverseInjuryCheckpointRunnerError(
      `checkpoint ${checkpoint.checkpointId} cannot run before ${checkpoint.scheduledFor}`,
    );
  }

  const policyFingerprint = fingerprintCCFSourceReliabilityPolicy(input.policy);
  let snapshot: CCFArchivedNflverseInjurySnapshot;
  try {
    snapshot = await fetchAndArchiveNflverseInjuries({
      season: input.season,
      week,
      archiveRootDir: input.archiveRootDir,
      fetchImpl: input.fetchImpl,
      signal: input.signal,
      now,
    });
  } catch {
    const capturedAt = now().toISOString();
    return {
      policyFingerprint,
      observation: failureObservation(
        input.policy,
        checkpoint.checkpointId,
        checkpoint.scheduledFor,
        capturedAt,
        policyFingerprint,
      ),
      snapshot: null,
    };
  }

  const observation = buildCCFNflverseInjuryReliabilityObservation({
    snapshot,
    previousSnapshot: input.previousSnapshot ?? null,
    capability,
    sourceId: input.policy.sourceId,
    checkpointId: checkpoint.checkpointId,
    scheduledFor: checkpoint.scheduledFor,
    identityReceipt: input.identityReceipt,
    criticalFieldPolicyRef: input.policy.criticalFieldPolicyRef,
    correctionPolicyRef: input.policy.correctionPolicyRef,
    checkpointPolicyRef: input.policy.checkpointPolicyRef,
    notes: [`policy_fingerprint:${policyFingerprint}`],
  });
  return { policyFingerprint, observation, snapshot };
}
