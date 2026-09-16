import crypto from "crypto";
import {
  evaluateCCFSourceStateEligibility,
  type CCFSourceEligibilityReason,
  type CCFSourceState,
} from "./sourceState";

export const CCF_WEEKLY_SOURCE_CAPABILITIES = [
  "weekly_box_score",
  "play_by_play_opportunity",
  "injury_designation",
  "practice_participation",
  "game_activation",
  "observed_workload",
  "nfl_schedule",
] as const;

export type CCFWeeklySourceCapability = typeof CCF_WEEKLY_SOURCE_CAPABILITIES[number];
export type CCFWeeklySourceCaptureMode = "prospective_capture" | "provider_historical_archive";

export interface CCFWeeklySourceBinding {
  capability: CCFWeeklySourceCapability;
  sourceState: CCFSourceState;
  identityBindingRef: string;
  rawArchiveRef: string;
  correctionPolicyRef: string;
  checkpointPolicyRef: string;
  captureMode: CCFWeeklySourceCaptureMode;
}

export interface CCFWeeklySourceSpinePlan {
  contractVersion: "ccf-weekly-source-spine-v1";
  planId: string;
  frozenAt: string;
  intendedUse: "ffcc_native_weekly_recommendation";
  bindings: CCFWeeklySourceBinding[];
  notes: string[];
}

export type CCFWeeklySourceBindingBlocker =
  | "missing_binding"
  | "duplicate_binding"
  | "identity_binding_missing"
  | "raw_archive_missing"
  | "correction_policy_missing"
  | "checkpoint_policy_missing"
  | "source_ineligible";

export interface CCFWeeklySourceCapabilityAudit {
  capability: CCFWeeklySourceCapability;
  ready: boolean;
  sourceId: string | null;
  sourceEligibilityReason: CCFSourceEligibilityReason | null;
  blockers: CCFWeeklySourceBindingBlocker[];
}

export interface CCFWeeklySourceSpineAudit {
  contractVersion: "ccf-weekly-source-spine-audit-v1";
  planId: string | null;
  asOf: string;
  productionReady: boolean;
  discoveryCoverage: number;
  productionCoverage: number;
  requiredCapabilityCount: number;
  planFingerprint: string | null;
  capabilities: CCFWeeklySourceCapabilityAudit[];
  blockers: string[];
}

export class CCFWeeklySourceSpineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFWeeklySourceSpineError";
  }
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function validateCCFWeeklySourceSpinePlan(
  plan: CCFWeeklySourceSpinePlan,
): CCFWeeklySourceSpinePlan {
  if (plan.contractVersion !== "ccf-weekly-source-spine-v1") {
    throw new CCFWeeklySourceSpineError("unsupported weekly source spine version");
  }
  if (!hasText(plan.planId)) throw new CCFWeeklySourceSpineError("planId is required");
  if (!validTimestamp(plan.frozenAt)) throw new CCFWeeklySourceSpineError("frozenAt must be a valid timestamp");
  if (plan.intendedUse !== "ffcc_native_weekly_recommendation") {
    throw new CCFWeeklySourceSpineError("intendedUse must remain ffcc_native_weekly_recommendation");
  }
  if (new Set(plan.notes).size !== plan.notes.length) {
    throw new CCFWeeklySourceSpineError("notes must not contain duplicates");
  }

  for (const binding of plan.bindings) {
    if (!CCF_WEEKLY_SOURCE_CAPABILITIES.includes(binding.capability)) {
      throw new CCFWeeklySourceSpineError(`unsupported capability ${String(binding.capability)}`);
    }
    if (!hasText(binding.sourceState.sourceId)) {
      throw new CCFWeeklySourceSpineError(`${binding.capability} sourceId is required`);
    }
  }
  return plan;
}

export function fingerprintCCFWeeklySourceSpinePlan(plan: CCFWeeklySourceSpinePlan): string {
  validateCCFWeeklySourceSpinePlan(plan);
  const canonical = {
    ...plan,
    bindings: [...plan.bindings]
      .sort((left, right) => left.capability.localeCompare(right.capability))
      .map((binding) => ({ ...binding })),
    notes: [...plan.notes],
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function auditBinding(
  capability: CCFWeeklySourceCapability,
  matches: readonly CCFWeeklySourceBinding[],
  asOf: string,
): CCFWeeklySourceCapabilityAudit {
  if (matches.length === 0) {
    return {
      capability,
      ready: false,
      sourceId: null,
      sourceEligibilityReason: null,
      blockers: ["missing_binding"],
    };
  }
  if (matches.length > 1) {
    return {
      capability,
      ready: false,
      sourceId: null,
      sourceEligibilityReason: null,
      blockers: ["duplicate_binding"],
    };
  }

  const binding = matches[0];
  const blockers: CCFWeeklySourceBindingBlocker[] = [];
  if (!hasText(binding.identityBindingRef)) blockers.push("identity_binding_missing");
  if (!hasText(binding.rawArchiveRef)) blockers.push("raw_archive_missing");
  if (!hasText(binding.correctionPolicyRef)) blockers.push("correction_policy_missing");
  if (!hasText(binding.checkpointPolicyRef)) blockers.push("checkpoint_policy_missing");

  const eligibility = evaluateCCFSourceStateEligibility(binding.sourceState, asOf);
  if (!eligibility.eligible) blockers.push("source_ineligible");

  return {
    capability,
    ready: blockers.length === 0,
    sourceId: binding.sourceState.sourceId,
    sourceEligibilityReason: eligibility.reason,
    blockers,
  };
}

export function evaluateCCFWeeklySourceSpine(
  input: CCFWeeklySourceSpinePlan,
  asOf: string,
): CCFWeeklySourceSpineAudit {
  const blockers: string[] = [];
  let planFingerprint: string | null = null;

  if (!validTimestamp(asOf)) {
    return {
      contractVersion: "ccf-weekly-source-spine-audit-v1",
      planId: input?.planId ?? null,
      asOf,
      productionReady: false,
      discoveryCoverage: 0,
      productionCoverage: 0,
      requiredCapabilityCount: CCF_WEEKLY_SOURCE_CAPABILITIES.length,
      planFingerprint: null,
      capabilities: CCF_WEEKLY_SOURCE_CAPABILITIES.map((capability) => ({
        capability,
        ready: false,
        sourceId: null,
        sourceEligibilityReason: null,
        blockers: ["missing_binding"],
      })),
      blockers: ["invalid_as_of"],
    };
  }

  try {
    validateCCFWeeklySourceSpinePlan(input);
    planFingerprint = fingerprintCCFWeeklySourceSpinePlan(input);
  } catch (error) {
    blockers.push(`invalid_plan:${error instanceof Error ? error.message : "unknown"}`);
  }

  if (validTimestamp(input.frozenAt) && Date.parse(input.frozenAt) > Date.parse(asOf)) {
    blockers.push("plan_frozen_after_as_of");
  }

  const capabilities = CCF_WEEKLY_SOURCE_CAPABILITIES.map((capability) =>
    auditBinding(
      capability,
      input.bindings.filter((binding) => binding.capability === capability),
      asOf,
    ),
  );

  const discoveryCoverage = capabilities.filter((capability) => capability.sourceId !== null).length;
  const productionCoverage = capabilities.filter((capability) => capability.ready).length;
  for (const capability of capabilities) {
    for (const blocker of capability.blockers) {
      blockers.push(`${capability.capability}:${blocker}`);
    }
    if (capability.sourceEligibilityReason && capability.sourceEligibilityReason !== "eligible") {
      blockers.push(`${capability.capability}:source:${capability.sourceEligibilityReason}`);
    }
  }

  const uniqueBlockers = Array.from(new Set(blockers)).sort();
  return {
    contractVersion: "ccf-weekly-source-spine-audit-v1",
    planId: hasText(input.planId) ? input.planId : null,
    asOf,
    productionReady: productionCoverage === CCF_WEEKLY_SOURCE_CAPABILITIES.length && uniqueBlockers.length === 0,
    discoveryCoverage,
    productionCoverage,
    requiredCapabilityCount: CCF_WEEKLY_SOURCE_CAPABILITIES.length,
    planFingerprint,
    capabilities,
    blockers: uniqueBlockers,
  };
}

export function assertCCFWeeklySourceSpineReady(
  plan: CCFWeeklySourceSpinePlan,
  asOf: string,
): void {
  const audit = evaluateCCFWeeklySourceSpine(plan, asOf);
  if (!audit.productionReady) {
    throw new CCFWeeklySourceSpineError(
      `weekly source spine is not production ready (${audit.productionCoverage}/${audit.requiredCapabilityCount}): ${audit.blockers.join(", ")}`,
    );
  }
}
