export type BeatVegasSurface =
  | "value_props"
  | "game_markets"
  | "correlated_markets"
  | "dfs_lab";

export type BeatVegasMode = "research" | "shadow" | "certified";

export type BeatVegasRequirementId =
  | "ccf_forecast_certified"
  | "ccf_target_distribution_certified"
  | "point_in_time_provenance"
  | "immutable_audit_ledger"
  | "consumer_fail_closed"
  | "ui_non_certified_labeling"
  | "market_source_gates_passed"
  | "market_feed_validated"
  | "market_replay_available"
  | "closing_line_capture"
  | "market_calibration_validated"
  | "price_integrity_validated"
  | "joint_outcome_model_certified"
  | "ownership_source_gates_passed"
  | "ownership_feed_validated"
  | "contest_rules_validated"
  | "field_simulation_certified"
  | "payout_simulation_validated"
  | "duplication_model_validated"
  | "portfolio_risk_validated";

export interface BeatVegasCertificationInputs {
  ccfForecastCertified: boolean;
  ccfTargetDistributionCertified: boolean;
  pointInTimeProvenance: boolean;
  immutableAuditLedger: boolean;
  consumerFailClosed: boolean;
  uiNonCertifiedLabeling: boolean;
  marketSourceGatesPassed: boolean;
  marketFeedValidated: boolean;
  marketReplayAvailable: boolean;
  closingLineCapture: boolean;
  marketCalibrationValidated: boolean;
  priceIntegrityValidated: boolean;
  jointOutcomeModelCertified: boolean;
  ownershipSourceGatesPassed: boolean;
  ownershipFeedValidated: boolean;
  contestRulesValidated: boolean;
  fieldSimulationCertified: boolean;
  payoutSimulationValidated: boolean;
  duplicationModelValidated: boolean;
  portfolioRiskValidated: boolean;
}

export interface BeatVegasCertificationDecision {
  surface: BeatVegasSurface;
  mode: BeatVegasMode;
  recommendationAllowed: boolean;
  blockers: BeatVegasRequirementId[];
  shadowBlockers: BeatVegasRequirementId[];
  ruleId: "beat-vegas-certification-v1";
  reason: string;
}

const CORE_REQUIREMENTS: readonly BeatVegasRequirementId[] = [
  "ccf_forecast_certified",
  "ccf_target_distribution_certified",
  "point_in_time_provenance",
  "immutable_audit_ledger",
  "consumer_fail_closed",
  "ui_non_certified_labeling",
];

const MARKET_LIVE_REQUIREMENTS: readonly BeatVegasRequirementId[] = [
  "market_source_gates_passed",
  "market_feed_validated",
];

const MARKET_CERTIFICATION_REQUIREMENTS: readonly BeatVegasRequirementId[] = [
  "market_replay_available",
  "closing_line_capture",
  "market_calibration_validated",
  "price_integrity_validated",
];

const DFS_LIVE_REQUIREMENTS: readonly BeatVegasRequirementId[] = [
  "ownership_source_gates_passed",
  "ownership_feed_validated",
  "contest_rules_validated",
];

const DFS_CERTIFICATION_REQUIREMENTS: readonly BeatVegasRequirementId[] = [
  "joint_outcome_model_certified",
  "field_simulation_certified",
  "payout_simulation_validated",
  "duplication_model_validated",
  "portfolio_risk_validated",
];

function requirementPassed(
  inputs: BeatVegasCertificationInputs,
  requirement: BeatVegasRequirementId,
): boolean {
  switch (requirement) {
    case "ccf_forecast_certified": return inputs.ccfForecastCertified;
    case "ccf_target_distribution_certified": return inputs.ccfTargetDistributionCertified;
    case "point_in_time_provenance": return inputs.pointInTimeProvenance;
    case "immutable_audit_ledger": return inputs.immutableAuditLedger;
    case "consumer_fail_closed": return inputs.consumerFailClosed;
    case "ui_non_certified_labeling": return inputs.uiNonCertifiedLabeling;
    case "market_source_gates_passed": return inputs.marketSourceGatesPassed;
    case "market_feed_validated": return inputs.marketFeedValidated;
    case "market_replay_available": return inputs.marketReplayAvailable;
    case "closing_line_capture": return inputs.closingLineCapture;
    case "market_calibration_validated": return inputs.marketCalibrationValidated;
    case "price_integrity_validated": return inputs.priceIntegrityValidated;
    case "joint_outcome_model_certified": return inputs.jointOutcomeModelCertified;
    case "ownership_source_gates_passed": return inputs.ownershipSourceGatesPassed;
    case "ownership_feed_validated": return inputs.ownershipFeedValidated;
    case "contest_rules_validated": return inputs.contestRulesValidated;
    case "field_simulation_certified": return inputs.fieldSimulationCertified;
    case "payout_simulation_validated": return inputs.payoutSimulationValidated;
    case "duplication_model_validated": return inputs.duplicationModelValidated;
    case "portfolio_risk_validated": return inputs.portfolioRiskValidated;
  }
}

function unique(requirements: readonly BeatVegasRequirementId[]): BeatVegasRequirementId[] {
  return [...new Set(requirements)];
}

function requirementsForSurface(surface: BeatVegasSurface): {
  shadow: BeatVegasRequirementId[];
  certified: BeatVegasRequirementId[];
} {
  const marketShadow = unique([...CORE_REQUIREMENTS, ...MARKET_LIVE_REQUIREMENTS]);
  const marketCertified = unique([...marketShadow, ...MARKET_CERTIFICATION_REQUIREMENTS]);

  if (surface === "correlated_markets") {
    return {
      shadow: marketShadow,
      certified: unique([...marketCertified, "joint_outcome_model_certified"]),
    };
  }

  if (surface === "dfs_lab") {
    const shadow = unique([...CORE_REQUIREMENTS, ...DFS_LIVE_REQUIREMENTS]);
    return {
      shadow,
      certified: unique([...shadow, ...DFS_CERTIFICATION_REQUIREMENTS]),
    };
  }

  return { shadow: marketShadow, certified: marketCertified };
}

export function evaluateBeatVegasCertification(
  surface: BeatVegasSurface,
  inputs: BeatVegasCertificationInputs,
): BeatVegasCertificationDecision {
  const required = requirementsForSurface(surface);
  const shadowBlockers = required.shadow.filter((requirement) => !requirementPassed(inputs, requirement));
  const blockers = required.certified.filter((requirement) => !requirementPassed(inputs, requirement));

  const mode: BeatVegasMode = blockers.length === 0
    ? "certified"
    : shadowBlockers.length === 0
      ? "shadow"
      : "research";

  return {
    surface,
    mode,
    recommendationAllowed: mode === "certified",
    blockers,
    shadowBlockers,
    ruleId: "beat-vegas-certification-v1",
    reason:
      mode === "certified"
        ? "all surface-specific certification requirements passed"
        : mode === "shadow"
          ? "eligible for shadow evaluation; recommendation authority remains blocked"
          : "research-only: prerequisites for trustworthy shadow evaluation are missing",
  };
}
