import crypto from "crypto";
import {
  fingerprintCCFSourceQualification,
  type CCFSourceState,
} from "./sourceState";
import type {
  CCFWeeklySourceBinding,
  CCFWeeklySourceCapability,
  CCFWeeklySourceCaptureMode,
} from "./weeklySourceSpine";

export interface CCFTrustedSourcePromotion {
  schemaVersion: "ccf-trusted-source-promotion-v1";
  attestationId: string;
  capability: CCFWeeklySourceCapability;
  intendedUse: "ffcc_native_weekly_recommendation";
  sourceId: string;
  producer: string;
  sourceStateFingerprint: string;
  qualificationFingerprint: string;
  identityBindingRef: string;
  rawArchiveRef: string;
  correctionPolicyRef: string;
  checkpointPolicyRef: string;
  captureMode: CCFWeeklySourceCaptureMode;
  attestedAt: string;
  validFrom: string;
  validThrough: string | null;
  status: "active" | "revoked";
  evidenceRefs: string[];
}

export interface CCFSourcePromotionBindingAudit {
  eligible: boolean;
  attestationId: string | null;
  attestationFingerprint: string | null;
  blockers: string[];
}

/**
 * Operator-controlled production promotions only. Request payloads must never
 * populate this registry. It intentionally starts empty until a source has
 * completed real permission, parser, PIT, archive, identity and reliability
 * qualification against production evidence.
 */
export const CCF_TRUSTED_SOURCE_PROMOTIONS_V1: readonly CCFTrustedSourcePromotion[] = [];

export class CCFSourcePromotionAttestationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFSourcePromotionAttestationError";
  }
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFSourcePromotionAttestationError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function canonicalSourceState(state: CCFSourceState) {
  return {
    ...state,
    qualification: state.qualification
      ? {
          ...state.qualification,
          notes: [...state.qualification.notes].sort(),
        }
      : null,
  };
}

export function fingerprintCCFSourceStateForPromotion(state: CCFSourceState): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalSourceState(state)))
    .digest("hex");
}

export function validateCCFTrustedSourcePromotion(
  attestation: CCFTrustedSourcePromotion,
): CCFTrustedSourcePromotion {
  if (attestation.schemaVersion !== "ccf-trusted-source-promotion-v1") {
    throw new CCFSourcePromotionAttestationError("unsupported trusted source promotion version");
  }
  for (const [label, value] of [
    ["attestationId", attestation.attestationId],
    ["sourceId", attestation.sourceId],
    ["producer", attestation.producer],
    ["sourceStateFingerprint", attestation.sourceStateFingerprint],
    ["qualificationFingerprint", attestation.qualificationFingerprint],
    ["identityBindingRef", attestation.identityBindingRef],
    ["rawArchiveRef", attestation.rawArchiveRef],
    ["correctionPolicyRef", attestation.correctionPolicyRef],
    ["checkpointPolicyRef", attestation.checkpointPolicyRef],
  ] as const) {
    if (!hasText(value)) {
      throw new CCFSourcePromotionAttestationError(`${label} is required`);
    }
  }
  if (attestation.intendedUse !== "ffcc_native_weekly_recommendation") {
    throw new CCFSourcePromotionAttestationError(
      "intendedUse must remain ffcc_native_weekly_recommendation",
    );
  }
  const attestedAt = parseTimestamp("attestedAt", attestation.attestedAt);
  const validFrom = parseTimestamp("validFrom", attestation.validFrom);
  if (attestedAt > validFrom) {
    throw new CCFSourcePromotionAttestationError("attestedAt cannot occur after validFrom");
  }
  if (attestation.validThrough != null) {
    const validThrough = parseTimestamp("validThrough", attestation.validThrough);
    if (validThrough < validFrom) {
      throw new CCFSourcePromotionAttestationError("validThrough cannot precede validFrom");
    }
  }
  if (attestation.evidenceRefs.length === 0) {
    throw new CCFSourcePromotionAttestationError("evidenceRefs must not be empty");
  }
  if (
    attestation.evidenceRefs.some((reference) => !hasText(reference)) ||
    new Set(attestation.evidenceRefs).size !== attestation.evidenceRefs.length
  ) {
    throw new CCFSourcePromotionAttestationError(
      "evidenceRefs must contain unique non-empty references",
    );
  }
  return attestation;
}

export function fingerprintCCFTrustedSourcePromotion(
  attestation: CCFTrustedSourcePromotion,
): string {
  validateCCFTrustedSourcePromotion(attestation);
  const canonical = {
    ...attestation,
    evidenceRefs: [...attestation.evidenceRefs].sort(),
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function requiredEvidenceRefs(binding: CCFWeeklySourceBinding): string[] {
  const refs = [
    binding.sourceState.qualification?.termsOrLicenseRef,
    binding.sourceState.qualification?.reliabilityReviewRef,
    binding.identityBindingRef,
    binding.rawArchiveRef,
    binding.correctionPolicyRef,
    binding.checkpointPolicyRef,
  ];
  return refs.filter(hasText);
}

export function evaluateCCFSourcePromotionBinding(
  binding: CCFWeeklySourceBinding,
  asOf: string,
  trustedPromotions: readonly unknown[] = CCF_TRUSTED_SOURCE_PROMOTIONS_V1,
): CCFSourcePromotionBindingAudit {
  const blockers = new Set<string>();
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(asOfMs)) blockers.add("invalid_as_of");

  const parsed: CCFTrustedSourcePromotion[] = [];
  const attestationIds = new Set<string>();
  trustedPromotions.forEach((candidate, index) => {
    try {
      const attestation = validateCCFTrustedSourcePromotion(candidate as CCFTrustedSourcePromotion);
      if (attestationIds.has(attestation.attestationId)) {
        blockers.add(`duplicate_attestation_id:${attestation.attestationId}`);
      }
      attestationIds.add(attestation.attestationId);
      parsed.push(attestation);
    } catch {
      blockers.add(`invalid_trusted_source_promotion:${index}`);
    }
  });

  const matches = parsed.filter((attestation) =>
    attestation.capability === binding.capability &&
    attestation.sourceId === binding.sourceState.sourceId,
  );
  if (matches.length === 0) {
    blockers.add("promotion_attestation_missing");
    return {
      eligible: false,
      attestationId: null,
      attestationFingerprint: null,
      blockers: Array.from(blockers).sort(),
    };
  }
  if (matches.length > 1) {
    blockers.add("promotion_attestation_ambiguous");
    return {
      eligible: false,
      attestationId: null,
      attestationFingerprint: null,
      blockers: Array.from(blockers).sort(),
    };
  }

  const attestation = matches[0];
  let attestationFingerprint: string | null = null;
  try {
    attestationFingerprint = fingerprintCCFTrustedSourcePromotion(attestation);
  } catch {
    blockers.add("promotion_attestation_invalid");
  }

  if (attestation.status !== "active") blockers.add("promotion_attestation_revoked");
  if (Number.isFinite(asOfMs)) {
    if (Date.parse(attestation.attestedAt) > asOfMs) {
      blockers.add("promotion_attested_after_as_of");
    }
    if (Date.parse(attestation.validFrom) > asOfMs) {
      blockers.add("promotion_outside_support_window");
    }
    if (
      attestation.validThrough != null &&
      Date.parse(attestation.validThrough) < asOfMs
    ) {
      blockers.add("promotion_outside_support_window");
    }
  }

  const qualification = binding.sourceState.qualification;
  if (!qualification) {
    blockers.add("promotion_qualification_missing");
  } else {
    const expectedQualification = fingerprintCCFSourceQualification(qualification);
    if (attestation.qualificationFingerprint !== expectedQualification) {
      blockers.add("promotion_qualification_fingerprint_mismatch");
    }
  }

  const exactPairs: Array<[string, string | null, string | null]> = [
    ["source_state", attestation.sourceStateFingerprint, fingerprintCCFSourceStateForPromotion(binding.sourceState)],
    ["producer", attestation.producer, binding.sourceState.producer],
    ["identity_binding", attestation.identityBindingRef, binding.identityBindingRef],
    ["raw_archive", attestation.rawArchiveRef, binding.rawArchiveRef],
    ["correction_policy", attestation.correctionPolicyRef, binding.correctionPolicyRef],
    ["checkpoint_policy", attestation.checkpointPolicyRef, binding.checkpointPolicyRef],
    ["capture_mode", attestation.captureMode, binding.captureMode],
  ];
  for (const [label, actual, expected] of exactPairs) {
    if (actual !== expected) blockers.add(`promotion_${label}_mismatch`);
  }

  for (const reference of requiredEvidenceRefs(binding)) {
    if (!attestation.evidenceRefs.includes(reference)) {
      blockers.add(`promotion_evidence_missing:${reference}`);
    }
  }

  return {
    eligible: blockers.size === 0,
    attestationId: attestation.attestationId,
    attestationFingerprint,
    blockers: Array.from(blockers).sort(),
  };
}
