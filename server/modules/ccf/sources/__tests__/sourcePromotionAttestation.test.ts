import {
  evaluateCCFSourcePromotionBinding,
  fingerprintCCFSourceStateForPromotion,
  fingerprintCCFTrustedSourcePromotion,
  validateCCFTrustedSourcePromotion,
  type CCFTrustedSourcePromotion,
} from "../sourcePromotionAttestation";
import {
  fingerprintCCFSourceQualification,
  type CCFSourceState,
} from "../sourceState";
import type { CCFWeeklySourceBinding } from "../weeklySourceSpine";

function state(): CCFSourceState {
  return {
    sourceId: "nflverse-pbp",
    evidenceClass: "source_backed",
    governanceState: "promoted",
    knownAt: "2026-09-15T16:00:00Z",
    supportWindow: { validFrom: "2026-09-01T00:00:00Z", validThrough: null },
    staleAfter: "2026-09-16T16:00:00Z",
    producer: "nflverse-play-by-play-v1",
    qualification: {
      qualificationVersion: "ccf-source-qualification-v1",
      qualificationId: "nflverse-pbp-qualification-v1",
      reviewedAt: "2026-09-15T12:00:00Z",
      termsOrLicenseRef: "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md",
      permissionStatus: "permitted_for_intended_use",
      parserVersion: "nflverse-pbp-parser-v1",
      rawTraceSupported: true,
      pointInTimeSemanticsDocumented: true,
      reliabilityReviewRef: "reliability://nflverse-pbp/v1",
      reliabilityStatus: "passed",
      notes: [],
    },
  };
}

function binding(): CCFWeeklySourceBinding {
  return {
    capability: "play_by_play_opportunity",
    sourceState: state(),
    identityBindingRef: "identity://nflverse-gsis-player-map/v1",
    rawArchiveRef: "archive://nflverse-pbp/2026/week-1",
    correctionPolicyRef: "corrections://nflverse-pbp/v1",
    checkpointPolicyRef: "checkpoints://pregame-weekly/v1",
    captureMode: "prospective_capture",
  };
}

function attestation(entry = binding()): CCFTrustedSourcePromotion {
  const qualification = entry.sourceState.qualification!;
  return {
    schemaVersion: "ccf-trusted-source-promotion-v1",
    attestationId: "nflverse-pbp-promotion-v1",
    capability: entry.capability,
    intendedUse: "ffcc_native_weekly_recommendation",
    sourceId: entry.sourceState.sourceId,
    producer: entry.sourceState.producer!,
    sourceStateFingerprint: fingerprintCCFSourceStateForPromotion(entry.sourceState),
    qualificationFingerprint: fingerprintCCFSourceQualification(qualification),
    identityBindingRef: entry.identityBindingRef,
    rawArchiveRef: entry.rawArchiveRef,
    correctionPolicyRef: entry.correctionPolicyRef,
    checkpointPolicyRef: entry.checkpointPolicyRef,
    captureMode: entry.captureMode,
    attestedAt: "2026-09-15T16:10:00Z",
    validFrom: "2026-09-15T16:10:00Z",
    validThrough: null,
    status: "active",
    evidenceRefs: [
      qualification.termsOrLicenseRef!,
      qualification.reliabilityReviewRef!,
      entry.identityBindingRef,
      entry.rawArchiveRef,
      entry.correctionPolicyRef,
      entry.checkpointPolicyRef,
    ],
  };
}

const asOf = "2026-09-15T17:00:00Z";

describe("CCF trusted source promotion", () => {
  it("accepts one exact active operator attestation", () => {
    const entry = binding();
    const trusted = attestation(entry);
    expect(validateCCFTrustedSourcePromotion(trusted)).toBe(trusted);
    expect(fingerprintCCFTrustedSourcePromotion(trusted)).toMatch(/^[a-f0-9]{64}$/);
    expect(evaluateCCFSourcePromotionBinding(entry, asOf, [trusted])).toMatchObject({
      eligible: true,
      attestationId: trusted.attestationId,
      blockers: [],
    });
  });

  it("fails closed when the trusted registry is empty", () => {
    expect(evaluateCCFSourcePromotionBinding(binding(), asOf, []).blockers).toContain(
      "promotion_attestation_missing",
    );
  });

  it.each([
    ["identityBindingRef", "identity://other", "promotion_identity_binding_mismatch"],
    ["rawArchiveRef", "archive://other", "promotion_raw_archive_mismatch"],
    ["correctionPolicyRef", "corrections://other", "promotion_correction_policy_mismatch"],
    ["checkpointPolicyRef", "checkpoints://other", "promotion_checkpoint_policy_mismatch"],
  ] as const)("rejects %s drift after source promotion", (field, value, blocker) => {
    const original = binding();
    const trusted = attestation(original);
    const changed = { ...original, [field]: value };
    expect(evaluateCCFSourcePromotionBinding(changed, asOf, [trusted]).blockers).toContain(blocker);
  });

  it("rejects source-state and qualification tampering", () => {
    const original = binding();
    const trusted = attestation(original);

    const stateChanged = {
      ...original,
      sourceState: { ...original.sourceState, staleAfter: "2026-09-17T16:00:00Z" },
    };
    expect(evaluateCCFSourcePromotionBinding(stateChanged, asOf, [trusted]).blockers).toContain(
      "promotion_source_state_mismatch",
    );

    const qualificationChanged = {
      ...original,
      sourceState: {
        ...original.sourceState,
        qualification: {
          ...original.sourceState.qualification!,
          parserVersion: "unreviewed-parser-v2",
        },
      },
    };
    const blockers = evaluateCCFSourcePromotionBinding(qualificationChanged, asOf, [trusted]).blockers;
    expect(blockers).toEqual(expect.arrayContaining([
      "promotion_source_state_mismatch",
      "promotion_qualification_fingerprint_mismatch",
    ]));
  });

  it("rejects revoked, future, expired, ambiguous and duplicate attestations", () => {
    const entry = binding();
    const base = attestation(entry);

    expect(evaluateCCFSourcePromotionBinding(entry, asOf, [{ ...base, status: "revoked" }]).blockers)
      .toContain("promotion_attestation_revoked");
    expect(evaluateCCFSourcePromotionBinding(entry, asOf, [{
      ...base,
      attestedAt: "2026-09-15T18:00:00Z",
      validFrom: "2026-09-15T18:00:00Z",
    }]).blockers).toContain("promotion_attested_after_as_of");
    expect(evaluateCCFSourcePromotionBinding(entry, asOf, [{
      ...base,
      validThrough: "2026-09-15T16:59:59Z",
    }]).blockers).toContain("promotion_outside_support_window");

    const second = { ...base, attestationId: "another-attestation" };
    expect(evaluateCCFSourcePromotionBinding(entry, asOf, [base, second]).blockers).toContain(
      "promotion_attestation_ambiguous",
    );
    expect(evaluateCCFSourcePromotionBinding(entry, asOf, [base, { ...base }]).blockers).toContain(
      `duplicate_attestation_id:${base.attestationId}`,
    );
  });

  it("requires the attestation evidence list to include every governed source witness", () => {
    const entry = binding();
    const trusted = attestation(entry);
    trusted.evidenceRefs = trusted.evidenceRefs.filter((reference) => reference !== entry.rawArchiveRef);
    expect(evaluateCCFSourcePromotionBinding(entry, asOf, [trusted]).blockers).toContain(
      `promotion_evidence_missing:${entry.rawArchiveRef}`,
    );
  });
});
