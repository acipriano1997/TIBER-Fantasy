import crypto from "crypto";
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

export type CCFRecoveryPermissionStatus =
  | "unreviewed"
  | "evaluation_only"
  | "permitted_for_intended_use"
  | "prohibited";

export type CCFRecoveryReliabilityStatus =
  | "unreviewed"
  | "incomplete"
  | "passed"
  | "failed";

export type CCFRecoverySourcePromotionBlocker =
  | "status_rejected"
  | "status_research_only"
  | "challenger_inference_not_eligible"
  | "social_media_speculation_not_eligible"
  | "temporal_mode_not_archived_point_in_time"
  | "archive_strategy_missing"
  | "license_or_terms_missing"
  | "permission_not_cleared"
  | "parser_version_missing"
  | "source_locator_missing"
  | "point_in_time_semantics_undocumented"
  | "raw_trace_missing"
  | "reliability_review_missing"
  | "reliability_review_not_passed";

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
  permissionStatus: CCFRecoveryPermissionStatus;
  parserVersion: string | null;
  sourceLocatorTemplate: string | null;
  pointInTimeSemanticsDocumented: boolean;
  rawTraceSupported: boolean;
  reliabilityReviewRef: string | null;
  reliabilityStatus: CCFRecoveryReliabilityStatus;
  notes: string[];
}

export interface CCFRecoverySourceBindingPlan {
  contractVersion: "ccf-recovery-source-binding-plan-v1";
  asOf: string;
  bindings: CCFRecoverySourceBinding[];
}

export interface CCFRecoverySourcePromotionReadiness {
  bindingId: string;
  status: CCFRecoveryBindingStatus;
  promotable: boolean;
  blockers: CCFRecoverySourcePromotionBlocker[];
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

export function evaluateCCFRecoverySourcePromotionReadiness(
  binding: CCFRecoverySourceBinding,
): CCFRecoverySourcePromotionReadiness {
  validateCCFRecoverySourceBinding({
    ...binding,
    // Candidate/readiness evaluation must inspect incomplete bindings without
    // pretending they are already production eligible.
    status: binding.status === "production_eligible" ? "candidate" : binding.status,
  });

  const blockers: CCFRecoverySourcePromotionBlocker[] = [];
  if (binding.status === "rejected") blockers.push("status_rejected");
  if (binding.status === "research_only") blockers.push("status_research_only");
  if (binding.authority === "challenger_inference") {
    blockers.push("challenger_inference_not_eligible");
  }
  if (binding.sourceClass === "social_media_speculation") {
    blockers.push("social_media_speculation_not_eligible");
  }
  if (binding.temporalMode !== "archived_point_in_time") {
    blockers.push("temporal_mode_not_archived_point_in_time");
  }
  if (binding.archiveStrategy === "none") blockers.push("archive_strategy_missing");
  if (!binding.licenseOrTermsRef?.trim()) blockers.push("license_or_terms_missing");
  if (binding.permissionStatus !== "permitted_for_intended_use") {
    blockers.push("permission_not_cleared");
  }
  if (!binding.parserVersion?.trim()) blockers.push("parser_version_missing");
  if (!binding.sourceLocatorTemplate?.trim()) blockers.push("source_locator_missing");
  if (!binding.pointInTimeSemanticsDocumented) {
    blockers.push("point_in_time_semantics_undocumented");
  }
  if (!binding.rawTraceSupported) blockers.push("raw_trace_missing");
  if (!binding.reliabilityReviewRef?.trim()) blockers.push("reliability_review_missing");
  if (binding.reliabilityStatus !== "passed") {
    blockers.push("reliability_review_not_passed");
  }

  return {
    bindingId: binding.bindingId,
    status: binding.status,
    promotable:
      (binding.status === "candidate" || binding.status === "production_eligible") &&
      blockers.length === 0,
    blockers,
  };
}

export function evaluateCCFRecoverySourcePlanPromotionReadiness(
  plan: CCFRecoverySourceBindingPlan,
): CCFRecoverySourcePromotionReadiness[] {
  validateCCFRecoverySourceBindingPlan(plan);
  return [...plan.bindings]
    .sort((left, right) => left.bindingId.localeCompare(right.bindingId))
    .map(evaluateCCFRecoverySourcePromotionReadiness);
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

  if (binding.sourceClass === "social_media_speculation" && binding.status === "production_eligible") {
    throw new CCFRecoverySourceBindingError(
      `${binding.bindingId} social-media speculation cannot be production eligible`,
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
    if (binding.permissionStatus !== "permitted_for_intended_use") {
      throw new CCFRecoverySourceBindingError(
        `${binding.bindingId} production eligibility requires permission cleared for the intended use`,
      );
    }
    requireText(`${binding.bindingId}.parserVersion`, binding.parserVersion);
    requireText(`${binding.bindingId}.sourceLocatorTemplate`, binding.sourceLocatorTemplate);
    requireText(`${binding.bindingId}.reliabilityReviewRef`, binding.reliabilityReviewRef);
    if (binding.reliabilityStatus !== "passed") {
      throw new CCFRecoverySourceBindingError(
        `${binding.bindingId} production eligibility requires a passed reliability review`,
      );
    }
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

export function fingerprintCCFRecoverySourceBindingPlan(
  plan: CCFRecoverySourceBindingPlan,
): string {
  validateCCFRecoverySourceBindingPlan(plan);
  const canonical = JSON.stringify({
    contractVersion: plan.contractVersion,
    asOf: plan.asOf,
    bindings: [...plan.bindings]
      .map((binding) => ({
        ...binding,
        dimensions: [...binding.dimensions].sort(),
        notes: [...binding.notes],
      }))
      .sort((left, right) => left.bindingId.localeCompare(right.bindingId)),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
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
