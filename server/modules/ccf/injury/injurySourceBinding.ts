import type {
  CCFRecoveryDimension,
  CCFRecoverySourceClass,
} from "./injuryRecoveryEvidence";
import type { CCFSourceTemporalMode } from "../sources/sourceSnapshot";

export type CCFRecoveryBindingStatus =
  | "candidate"
  | "research_only"
  | "production_eligible"
  | "rejected";

export type CCFRecoverySourceAuthority =
  | "raw_fact"
  | "reported_evidence"
  | "observed_football_evidence"
  | "challenger_inference";

export type CCFRecoveryArchiveStrategy =
  | "immutable_snapshot"
  | "append_only_event_log"
  | "provider_archive"
  | "none";

export interface CCFRecoverySourceBinding {
  bindingVersion: "ccf-recovery-source-binding-v1";
  bindingId: string;
  sourceClass: CCFRecoverySourceClass;
  provider: string;
  datasetOrProduct: string;
  dimensions: CCFRecoveryDimension[];
  authority: CCFRecoverySourceAuthority;
  status: CCFRecoveryBindingStatus;
  temporalMode: CCFSourceTemporalMode;
  archiveStrategy: CCFRecoveryArchiveStrategy;
  licenseOrTermsRef: string | null;
  parserVersion: string | null;
  sourceLocatorTemplate: string | null;
  pointInTimeSemanticsDocumented: boolean;
  rawTraceSupported: boolean;
  reliabilityReviewRef: string | null;
  notes: string[];
}

export interface CCFRecoverySourceBindingPlan {
  contractVersion: "ccf-recovery-source-binding-plan-v1";
  asOf: string;
  bindings: CCFRecoverySourceBinding[];
}

export class CCFRecoverySourceBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRecoverySourceBindingError";
  }
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFRecoverySourceBindingError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function requireText(label: string, value: string | null): string {
  if (!value?.trim()) throw new CCFRecoverySourceBindingError(`${label} is required`);
  return value;
}

export function validateCCFRecoverySourceBinding(
  binding: CCFRecoverySourceBinding,
): CCFRecoverySourceBinding {
  if (binding.bindingVersion !== "ccf-recovery-source-binding-v1") {
    throw new CCFRecoverySourceBindingError("unsupported recovery source bindingVersion");
  }
  requireText("bindingId", binding.bindingId);
  requireText("provider", binding.provider);
  requireText("datasetOrProduct", binding.datasetOrProduct);
  if (binding.dimensions.length === 0) {
    throw new CCFRecoverySourceBindingError(`${binding.bindingId} must declare at least one recovery dimension`);
  }
  if (new Set(binding.dimensions).size !== binding.dimensions.length) {
    throw new CCFRecoverySourceBindingError(`${binding.bindingId} contains duplicate dimensions`);
  }

  if (binding.authority === "challenger_inference" && binding.status === "production_eligible") {
    throw new CCFRecoverySourceBindingError(
      `${binding.bindingId} challenger inference cannot be production-eligible recommendation evidence`,
    );
  }

  if (binding.status === "production_eligible") {
    if (binding.temporalMode !== "archived_point_in_time") {
      throw new CCFRecoverySourceBindingError(
        `${binding.bindingId} production eligibility requires archived_point_in_time support`,
      );
    }
    if (binding.archiveStrategy === "none") {
      throw new CCFRecoverySourceBindingError(
        `${binding.bindingId} production eligibility requires an archive strategy`,
      );
    }
    requireText(`${binding.bindingId}.licenseOrTermsRef`, binding.licenseOrTermsRef);
    requireText(`${binding.bindingId}.parserVersion`, binding.parserVersion);
    requireText(`${binding.bindingId}.sourceLocatorTemplate`, binding.sourceLocatorTemplate);
    requireText(`${binding.bindingId}.reliabilityReviewRef`, binding.reliabilityReviewRef);
    if (!binding.pointInTimeSemanticsDocumented) {
      throw new CCFRecoverySourceBindingError(
        `${binding.bindingId} production eligibility requires documented point-in-time semantics`,
      );
    }
    if (!binding.rawTraceSupported) {
      throw new CCFRecoverySourceBindingError(
        `${binding.bindingId} production eligibility requires raw-trace support`,
      );
    }
  }

  if (binding.sourceClass === "social_media_speculation" && binding.status === "production_eligible") {
    throw new CCFRecoverySourceBindingError(
      `${binding.bindingId} social-media speculation cannot be production eligible`,
    );
  }

  return binding;
}

export function validateCCFRecoverySourceBindingPlan(
  plan: CCFRecoverySourceBindingPlan,
): CCFRecoverySourceBindingPlan {
  if (plan.contractVersion !== "ccf-recovery-source-binding-plan-v1") {
    throw new CCFRecoverySourceBindingError("unsupported recovery source binding plan version");
  }
  parseTimestamp("asOf", plan.asOf);
  if (plan.bindings.length === 0) {
    throw new CCFRecoverySourceBindingError("source binding plan requires at least one binding");
  }

  const ids = new Set<string>();
  for (const binding of plan.bindings) {
    validateCCFRecoverySourceBinding(binding);
    if (ids.has(binding.bindingId)) {
      throw new CCFRecoverySourceBindingError(`duplicate bindingId ${binding.bindingId}`);
    }
    ids.add(binding.bindingId);
  }
  return plan;
}

export function productionEligibleCCFRecoveryBindings(
  plan: CCFRecoverySourceBindingPlan,
): CCFRecoverySourceBinding[] {
  validateCCFRecoverySourceBindingPlan(plan);
  return plan.bindings.filter((binding) => binding.status === "production_eligible");
}

/**
 * Declares the minimum evidence-role coverage needed before a recovery feature
 * pipeline can be considered source-bound. This does not certify predictive
 * value; it only certifies that point-in-time evidence exists for the major
 * decision dimensions.
 */
export function assertCCFRecoveryMinimumSourceCoverage(
  plan: CCFRecoverySourceBindingPlan,
): CCFRecoverySourceBindingPlan {
  const eligible = productionEligibleCCFRecoveryBindings(plan);

  const hasClass = (sourceClass: CCFRecoverySourceClass) =>
    eligible.some((binding) => binding.sourceClass === sourceClass);
  const hasDimension = (dimension: CCFRecoveryDimension) =>
    eligible.some((binding) => binding.dimensions.includes(dimension));

  if (!hasClass("official_injury_designation")) {
    throw new CCFRecoverySourceBindingError(
      "minimum source coverage requires production-eligible official injury designation evidence",
    );
  }
  if (!hasClass("official_practice_participation")) {
    throw new CCFRecoverySourceBindingError(
      "minimum source coverage requires production-eligible official practice participation evidence",
    );
  }
  if (!hasClass("official_game_activation")) {
    throw new CCFRecoverySourceBindingError(
      "minimum source coverage requires production-eligible official game activation evidence",
    );
  }
  if (!hasDimension("workload")) {
    throw new CCFRecoverySourceBindingError(
      "minimum source coverage requires production-eligible observed workload evidence",
    );
  }

  return plan;
}
