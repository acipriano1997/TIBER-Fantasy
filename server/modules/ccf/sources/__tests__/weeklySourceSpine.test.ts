import {
  CCF_WEEKLY_SOURCE_CAPABILITIES,
  evaluateCCFWeeklySourceSpine,
  fingerprintCCFWeeklySourceSpinePlan,
  type CCFWeeklySourceBinding,
  type CCFWeeklySourceSpinePlan,
} from "../weeklySourceSpine";
import type { CCFSourceState } from "../sourceState";

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

const asOf = "2026-09-15T15:00:00Z";

describe("CCF weekly source spine", () => {
  it("requires every weekly capability to pass source qualification and binding evidence", () => {
    const audit = evaluateCCFWeeklySourceSpine(plan(), asOf);
    expect(audit.productionReady).toBe(true);
    expect(audit.discoveryCoverage).toBe(CCF_WEEKLY_SOURCE_CAPABILITIES.length);
    expect(audit.productionCoverage).toBe(CCF_WEEKLY_SOURCE_CAPABILITIES.length);
    expect(audit.blockers).toEqual([]);
    expect(audit.planFingerprint).toMatch(/^[a-f0-9]{64}$/);
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
    const audit = evaluateCCFWeeklySourceSpine(candidate, asOf);
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
    const audit = evaluateCCFWeeklySourceSpine(candidate, asOf);
    expect(audit.productionReady).toBe(false);
    expect(audit.blockers).toContain("play_by_play_opportunity:source:permission_not_cleared");
  });

  it("fails closed for missing or duplicate capability bindings", () => {
    const missing = plan();
    missing.bindings = missing.bindings.filter((entry) => entry.capability !== "game_activation");
    expect(evaluateCCFWeeklySourceSpine(missing, asOf).blockers).toContain(
      "game_activation:missing_binding",
    );

    const duplicate = plan();
    duplicate.bindings.push(binding("observed_workload"));
    expect(evaluateCCFWeeklySourceSpine(duplicate, asOf).blockers).toContain(
      "observed_workload:duplicate_binding",
    );
  });

  it("requires identity, archive, correction, and checkpoint witnesses", () => {
    const candidate = plan();
    candidate.bindings[2] = {
      ...candidate.bindings[2],
      identityBindingRef: "",
      rawArchiveRef: "",
      correctionPolicyRef: "",
      checkpointPolicyRef: "",
    };
    const audit = evaluateCCFWeeklySourceSpine(candidate, asOf);
    expect(audit.blockers).toEqual(expect.arrayContaining([
      "injury_designation:identity_binding_missing",
      "injury_designation:raw_archive_missing",
      "injury_designation:correction_policy_missing",
      "injury_designation:checkpoint_policy_missing",
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
    expect(evaluateCCFWeeklySourceSpine(stale, asOf).blockers).toContain(
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
    expect(evaluateCCFWeeklySourceSpine(futureKnown, asOf).blockers).toContain(
      "game_activation:source:known_after_as_of",
    );

    const futureFrozen = { ...plan(), frozenAt: "2026-09-15T15:01:00Z" };
    expect(evaluateCCFWeeklySourceSpine(futureFrozen, asOf).blockers).toContain(
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
