import {
  CCF_WEEKLY_SOURCE_CAPABILITIES,
  evaluateCCFWeeklySourceSpine,
  fingerprintCCFWeeklySourceSpinePlan,
  type CCFWeeklySourceBinding,
  type CCFWeeklySourceSpinePlan,
} from "../weeklySourceSpine";
import {
  fingerprintCCFSourceStateForPromotion,
  type CCFTrustedSourcePromotion,
} from "../sourcePromotionAttestation";
import {
  fingerprintCCFSourceQualification,
  type CCFSourceState,
} from "../sourceState";

function sourceState(sourceId: string): CCFSourceState {
  return {
    sourceId,
    evidenceClass: "source_backed",
    governanceState: "promoted",
    knownAt: "2026-09-15T14:00:00Z",
    supportWindow: {
      validFrom: "2026-09-01T00:00:00Z",
      validThrough: null,
    },
    staleAfter: "2026-09-16T14:00:00Z",
    producer: "provider-adapter-v1",
    qualification: {
      qualificationVersion: "ccf-source-qualification-v1",
      qualificationId: `qualification-${sourceId}`,
      reviewedAt: "2026-09-15T12:00:00Z",
      termsOrLicenseRef: `license://${sourceId}/ffcc-native-use`,
      permissionStatus: "permitted_for_intended_use",
      parserVersion: `${sourceId}-parser-v1`,
      rawTraceSupported: true,
      pointInTimeSemanticsDocumented: true,
      reliabilityReviewRef: `reliability://${sourceId}/v1`,
      reliabilityStatus: "passed",
      notes: [],
    },
  };
}

function binding(capability: typeof CCF_WEEKLY_SOURCE_CAPABILITIES[number]): CCFWeeklySourceBinding {
  return {
    capability,
    sourceState: sourceState(`source-${capability}`),
    identityBindingRef: `identity://${capability}/v1`,
    rawArchiveRef: `archive://${capability}/v1`,
    correctionPolicyRef: `corrections://${capability}/v1`,
    checkpointPolicyRef: `checkpoints://${capability}/v1`,
    captureMode: "prospective_capture",
  };
}

function plan(): CCFWeeklySourceSpinePlan {
  return {
    contractVersion: "ccf-weekly-source-spine-v1",
    planId: "weekly-source-spine-production-v1",
    frozenAt: "2026-09-15T14:30:00Z",
    intendedUse: "ffcc_native_weekly_recommendation",
    bindings: CCF_WEEKLY_SOURCE_CAPABILITIES.map(binding),
    notes: [],
  };
}

function attestation(entry: CCFWeeklySourceBinding): CCFTrustedSourcePromotion {
  const qualification = entry.sourceState.qualification!;
  return {
    schemaVersion: "ccf-trusted-source-promotion-v1",
    attestationId: `attestation-${entry.capability}-${entry.sourceState.sourceId}`,
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
    attestedAt: "2026-09-15T13:00:00Z",
    validFrom: "2026-09-15T13:00:00Z",
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

function trusted(candidate: CCFWeeklySourceSpinePlan): CCFTrustedSourcePromotion[] {
  return candidate.bindings.map(attestation);
}

const asOf = "2026-09-15T15:00:00Z";

describe("CCF weekly source spine", () => {
  it("requires every weekly capability to pass source qualification, binding evidence, and operator promotion", () => {
    const candidate = plan();
    const audit = evaluateCCFWeeklySourceSpine(candidate, asOf, trusted(candidate));
    expect(audit.productionReady).toBe(true);
    expect(audit.discoveryCoverage).toBe(CCF_WEEKLY_SOURCE_CAPABILITIES.length);
    expect(audit.productionCoverage).toBe(CCF_WEEKLY_SOURCE_CAPABILITIES.length);
    expect(audit.blockers).toEqual([]);
    expect(audit.planFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.capabilities.every((entry) =>
      entry.promotionAttestationFingerprint?.match(/^[a-f0-9]{64}$/),
    )).toBe(true);
  });

  it("does not trust a self-described promoted source when the operator registry is empty", () => {
    const candidate = plan();
    const audit = evaluateCCFWeeklySourceSpine(candidate, asOf);
    expect(audit.productionReady).toBe(false);
    expect(audit.discoveryCoverage).toBe(CCF_WEEKLY_SOURCE_CAPABILITIES.length);
    expect(audit.productionCoverage).toBe(0);
    expect(audit.blockers).toEqual(expect.arrayContaining([
      "weekly_box_score:promotion_attestation_ineligible",
      "weekly_box_score:promotion:promotion_attestation_missing",
    ]));
  });

  it("separates discovery coverage from production eligibility", () => {
    const candidate = plan();
    candidate.bindings[0] = {
      ...candidate.bindings[0],
      sourceState: {
        ...candidate.bindings[0].sourceState,
        governanceState: "candidate",
      },
    };
    const audit = evaluateCCFWeeklySourceSpine(candidate, asOf, trusted(candidate));
    expect(audit.discoveryCoverage).toBe(CCF_WEEKLY_SOURCE_CAPABILITIES.length);
    expect(audit.productionCoverage).toBe(CCF_WEEKLY_SOURCE_CAPABILITIES.length - 1);
    expect(audit.productionReady).toBe(false);
    expect(audit.blockers).toEqual(expect.arrayContaining([
      "weekly_box_score:source_ineligible",
      "weekly_box_score:source:not_promoted",
    ]));
  });

  it("rejects evaluation-only permission and incomplete reliability", () => {
    const candidate = plan();
    const qualification = candidate.bindings[1].sourceState.qualification!;
    candidate.bindings[1] = {
      ...candidate.bindings[1],
      sourceState: {
        ...candidate.bindings[1].sourceState,
        qualification: {
          ...qualification,
          permissionStatus: "evaluation_only",
          reliabilityStatus: "incomplete",
        },
      },
    };
    const audit = evaluateCCFWeeklySourceSpine(candidate, asOf, trusted(candidate));
    expect(audit.productionReady).toBe(false);
    expect(audit.blockers).toContain("play_by_play_opportunity:source:permission_not_cleared");
  });

  it("fails closed for missing or duplicate capability bindings", () => {
    const missing = plan();
    missing.bindings = missing.bindings.filter((entry) => entry.capability !== "game_activation");
    expect(evaluateCCFWeeklySourceSpine(missing, asOf, trusted(missing)).blockers).toContain(
      "game_activation:missing_binding",
    );

    const duplicate = plan();
    duplicate.bindings.push(binding("observed_workload"));
    expect(evaluateCCFWeeklySourceSpine(duplicate, asOf, trusted(duplicate)).blockers).toContain(
      "observed_workload:duplicate_binding",
    );
  });

  it("requires identity, archive, correction, and checkpoint witnesses", () => {
    const candidate = plan();
    const originalTrusted = trusted(candidate);
    candidate.bindings[2] = {
      ...candidate.bindings[2],
      identityBindingRef: "",
      rawArchiveRef: "",
      correctionPolicyRef: "",
      checkpointPolicyRef: "",
    };
    const audit = evaluateCCFWeeklySourceSpine(candidate, asOf, originalTrusted);
    expect(audit.blockers).toEqual(expect.arrayContaining([
      "injury_designation:identity_binding_missing",
      "injury_designation:raw_archive_missing",
      "injury_designation:correction_policy_missing",
      "injury_designation:checkpoint_policy_missing",
      "injury_designation:promotion_attestation_ineligible",
    ]));
  });

  it("rejects stale, future-known and future-frozen plans", () => {
    const stale = plan();
    stale.bindings[3] = {
      ...stale.bindings[3],
      sourceState: {
        ...stale.bindings[3].sourceState,
        staleAfter: "2026-09-15T14:59:59Z",
      },
    };
    expect(evaluateCCFWeeklySourceSpine(stale, asOf, trusted(stale)).blockers).toContain(
      "practice_participation:source:stale",
    );

    const futureKnown = plan();
    futureKnown.bindings[4] = {
      ...futureKnown.bindings[4],
      sourceState: {
        ...futureKnown.bindings[4].sourceState,
        knownAt: "2026-09-15T15:01:00Z",
      },
    };
    expect(evaluateCCFWeeklySourceSpine(futureKnown, asOf, trusted(futureKnown)).blockers).toContain(
      "game_activation:source:known_after_as_of",
    );

    const futureFrozen = { ...plan(), frozenAt: "2026-09-15T15:01:00Z" };
    expect(evaluateCCFWeeklySourceSpine(futureFrozen, asOf, trusted(futureFrozen)).blockers).toContain(
      "plan_frozen_after_as_of",
    );
  });

  it("fingerprints equivalent capability ordering deterministically", () => {
    const first = plan();
    const reordered = { ...first, bindings: [...first.bindings].reverse() };
    expect(fingerprintCCFWeeklySourceSpinePlan(reordered)).toBe(
      fingerprintCCFWeeklySourceSpinePlan(first),
    );
  });
});
