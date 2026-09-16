import {
  auditCCFHistoricalDatasetProtocolBinding,
} from "../certification/historicalDatasetProtocolBinding";
import type { CCFHistoricalDatasetManifest } from "../certification/historicalDatasetManifest";
import {
  certifiedModelIdentityFromRelease,
} from "../certification/certifiedReleasePromotion";
import {
  validateCCFBacktestProgressHistory,
  type CCFBacktestProgressRecord,
} from "../certification/backtestProgressHistory";
import {
  fingerprintCCFPredictiveValidationReceipt,
  validateCCFPredictiveValidationReceipt,
  type CCFPredictiveValidationReceipt,
} from "../certification/predictiveValidationReceipt";
import {
  type CCFPredictiveValidationProtocol,
} from "../certification/predictiveValidationProtocol";
import {
  evaluateCCFDevyIdentityLinkage,
  type CCFDevyIdentityLinkageReceipt,
} from "../sources/devyIdentityLinkage";
import {
  CCF_TRUSTED_SOURCE_PROMOTIONS_V1,
  type CCFTrustedSourcePromotion,
} from "../sources/sourcePromotionAttestation";
import {
  evaluateCCFWeeklySourceSpine,
  type CCFWeeklySourceSpinePlan,
} from "../sources/weeklySourceSpine";
import {
  evaluateCCFAuthorityGraph,
  type CCFAuthoritySurface,
  type CCFTrustedAuthorityBinding,
} from "./authorityGraph";

export const CCF_PERSONAL_BETA_GATE_IDS = [
  "PB-01",
  "PB-02",
  "PB-03",
  "PB-04",
  "PB-05",
  "PB-06",
  "PB-07",
  "PB-08",
] as const;

export type CCFPersonalBetaGateId = typeof CCF_PERSONAL_BETA_GATE_IDS[number];
export type CCFPersonalBetaGateStatus =
  | "pass"
  | "blocked_internal"
  | "blocked_external"
  | "not_applicable";
export type CCFPersonalBetaOverallStatus =
  | "ready"
  | "blocked_internal"
  | "blocked_external";

export interface CCFPersonalBetaGateResult {
  id: CCFPersonalBetaGateId;
  label: string;
  status: CCFPersonalBetaGateStatus;
  blockers: string[];
  evidenceRefs: string[];
}

export interface CCFPersonalBetaAuthorityInput {
  surface: CCFAuthoritySurface;
  graph: unknown;
  trustedBindings: readonly CCFTrustedAuthorityBinding[];
}

export interface CCFPersonalBetaSleeperInput {
  portfolioPreflight: "passed" | "pending_external" | "not_run" | "failed_internal";
  portfolioEvidenceRef: string | null;
  writeActionsRequired: boolean;
  writeAuthorization: "authorized" | "pending_external" | "not_required" | "failed_internal";
  actionSafetyCertified: boolean;
  actionSafetyEvidenceRef: string | null;
}

export interface CCFPersonalBetaDevyInput {
  required: boolean;
  state: "ready" | "pending_external" | "not_run" | "failed_internal";
  expectedSleeperLeagueId: string | null;
  linkageReceipt: CCFDevyIdentityLinkageReceipt | null;
}

export interface CCFPersonalBetaSmokeInput {
  state: "passed" | "pending_external" | "not_run" | "failed_internal";
  exactCandidateRef: string | null;
  evidenceRef: string | null;
}

export interface CCFPersonalBetaReadinessInput {
  asOf: string;
  weeklySourceSpine: CCFWeeklySourceSpinePlan | null;
  historicalDataset: CCFHistoricalDatasetManifest | null;
  predictiveProtocol: CCFPredictiveValidationProtocol | null;
  predictiveReceipt: CCFPredictiveValidationReceipt | null;
  backtestHistory: readonly CCFBacktestProgressRecord[];
  requiredAuthoritySurfaces: readonly CCFAuthoritySurface[];
  authorityInputs: readonly CCFPersonalBetaAuthorityInput[];
  sleeper: CCFPersonalBetaSleeperInput;
  devy: CCFPersonalBetaDevyInput;
  smoke: CCFPersonalBetaSmokeInput;
}

export interface CCFPersonalBetaReadinessResult {
  contractVersion: "ccf-personal-beta-readiness-v2";
  asOf: string;
  overallStatus: CCFPersonalBetaOverallStatus;
  ready: boolean;
  gates: CCFPersonalBetaGateResult[];
  internalBlockers: string[];
  externalBlockers: string[];
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function gate(
  id: CCFPersonalBetaGateId,
  label: string,
  status: CCFPersonalBetaGateStatus,
  blockers: string[] = [],
  evidenceRefs: string[] = [],
): CCFPersonalBetaGateResult {
  return {
    id,
    label,
    status,
    blockers: Array.from(new Set(blockers)).sort(),
    evidenceRefs: Array.from(new Set(evidenceRefs)).sort(),
  };
}

function sourceGate(
  plan: CCFWeeklySourceSpinePlan | null,
  asOf: string,
  trustedSourcePromotions: readonly CCFTrustedSourcePromotion[],
): CCFPersonalBetaGateResult {
  if (!plan) {
    return gate("PB-01", "Production-native weekly data spine", "blocked_internal", [
      "weekly_source_spine_missing",
    ]);
  }
  const audit = evaluateCCFWeeklySourceSpine(plan, asOf, trustedSourcePromotions);
  const evidenceRefs = audit.planFingerprint
    ? [`weekly-source-plan:${audit.planFingerprint}`]
    : [];
  for (const capability of audit.capabilities) {
    if (capability.promotionAttestationFingerprint) {
      evidenceRefs.push(
        `source-promotion:${capability.capability}:${capability.promotionAttestationFingerprint}`,
      );
    }
  }
  return audit.productionReady
    ? gate("PB-01", "Production-native weekly data spine", "pass", [], evidenceRefs)
    : gate(
        "PB-01",
        "Production-native weekly data spine",
        "blocked_internal",
        audit.blockers.length > 0 ? audit.blockers : ["weekly_source_spine_not_production_ready"],
        evidenceRefs,
      );
}

function datasetGate(
  plan: CCFWeeklySourceSpinePlan | null,
  dataset: CCFHistoricalDatasetManifest | null,
  protocol: CCFPredictiveValidationProtocol | null,
  asOf: string,
): CCFPersonalBetaGateResult {
  const blockers: string[] = [];
  const evidenceRefs: string[] = [];
  if (!dataset) blockers.push("historical_dataset_manifest_missing");
  if (!protocol) blockers.push("predictive_protocol_missing");
  if (blockers.length > 0 || !dataset || !protocol) {
    return gate("PB-02", "Frozen historical CCF evaluation dataset", "blocked_internal", blockers);
  }

  const binding = auditCCFHistoricalDatasetProtocolBinding(dataset, protocol);
  if (!binding.eligible) blockers.push(...binding.blockers);
  if (binding.datasetFingerprint) evidenceRefs.push(`dataset:${binding.datasetFingerprint}`);
  evidenceRefs.push(`protocol:${protocol.protocolId}`);

  if (Date.parse(dataset.frozenAt) > Date.parse(asOf)) blockers.push("dataset_frozen_after_as_of");
  if (Date.parse(protocol.frozenAt) > Date.parse(asOf)) blockers.push("protocol_frozen_after_as_of");

  if (!plan) {
    blockers.push("weekly_source_spine_missing");
  } else {
    const sourceAudit = evaluateCCFWeeklySourceSpine(plan, asOf, []);
    if (!sourceAudit.planFingerprint) {
      blockers.push("weekly_source_plan_fingerprint_missing");
    } else {
      evidenceRefs.push(`weekly-source-plan:${sourceAudit.planFingerprint}`);
      if (dataset.sourcePlanFingerprint !== sourceAudit.planFingerprint) {
        blockers.push("historical_dataset_source_plan_mismatch");
      }
    }
  }

  return blockers.length === 0
    ? gate("PB-02", "Frozen historical CCF evaluation dataset", "pass", [], evidenceRefs)
    : gate("PB-02", "Frozen historical CCF evaluation dataset", "blocked_internal", blockers, evidenceRefs);
}

function receiptGate(
  protocol: CCFPredictiveValidationProtocol | null,
  receipt: CCFPredictiveValidationReceipt | null,
  history: readonly CCFBacktestProgressRecord[],
  asOf: string,
): CCFPersonalBetaGateResult {
  if (!protocol) {
    return gate("PB-03", "Executable native CCF certification", "blocked_internal", [
      "predictive_protocol_missing",
    ]);
  }
  if (!receipt) {
    return gate("PB-03", "Executable native CCF certification", "blocked_internal", [
      "predictive_receipt_missing",
    ]);
  }

  const blockers: string[] = [];
  const evidenceRefs: string[] = [];
  try {
    validateCCFPredictiveValidationReceipt(protocol, receipt);
  } catch (error) {
    return gate("PB-03", "Executable native CCF certification", "blocked_internal", [
      `predictive_receipt_invalid:${error instanceof Error ? error.message : "unknown"}`,
    ]);
  }
  if (receipt.releaseStatus !== "certified") {
    blockers.push(`predictive_receipt_not_certified:${receipt.releaseStatus}`);
  }
  if (Date.parse(receipt.completedAt) > Date.parse(asOf)) {
    blockers.push("predictive_receipt_completed_after_as_of");
  }

  const receiptFingerprint = fingerprintCCFPredictiveValidationReceipt(protocol, receipt);
  evidenceRefs.push(`receipt:${receiptFingerprint}`, `run:${receipt.runId}`, ...receipt.evidenceRefs);

  const matches = history.filter((record) => record.id === receipt.runId);
  if (matches.length !== 1) {
    blockers.push(matches.length === 0
      ? "certified_release_record_missing"
      : "certified_release_record_duplicate");
  } else {
    const record = matches[0];
    try {
      validateCCFBacktestProgressHistory([record]);
      const identity = certifiedModelIdentityFromRelease(record);
      evidenceRefs.push(
        `certified-model:${identity.modelVersion}:${identity.calibrationVersion}:${identity.certificationRunId}`,
      );
    } catch (error) {
      blockers.push(`certified_release_invalid:${error instanceof Error ? error.message : "unknown"}`);
    }

    const binding = record.certificationBinding;
    if (!binding) {
      blockers.push("certified_release_binding_missing");
    } else {
      const exactPairs: Array<[string, string | null | undefined, string]> = [
        ["receipt_fingerprint", binding.receiptFingerprint, receiptFingerprint],
        ["protocol_fingerprint", binding.protocolFingerprint, receipt.protocolFingerprint],
        ["candidate_artifact", binding.candidateArtifactFingerprint, receipt.candidateArtifactFingerprint],
        ["native_baseline", binding.nativeBaselineFingerprint, receipt.nativeBaselineFingerprint],
        ["source_plan", binding.sourcePlanFingerprint, receipt.sourcePlanFingerprint],
        ["feature_set", binding.featureSetFingerprint, receipt.featureSetFingerprint],
        ["decision_policy", binding.decisionPolicyFingerprint, receipt.decisionPolicyFingerprint],
      ];
      for (const [label, actual, expected] of exactPairs) {
        if (actual !== expected) blockers.push(`certified_release_${label}_mismatch`);
      }
    }
    if (record.modelVersion !== receipt.modelVersion) blockers.push("certified_release_model_mismatch");
    if (record.recordedAt !== receipt.completedAt) blockers.push("certified_release_time_mismatch");
    if (record.comparisonIdentity.datasetFingerprint !== receipt.datasetFingerprint) {
      blockers.push("certified_release_dataset_mismatch");
    }
    if (record.comparisonIdentity.scoringProfileHash !== receipt.scoringProfileFingerprint) {
      blockers.push("certified_release_scoring_mismatch");
    }
    if (record.comparisonIdentity.supportedPopulation !== receipt.supportedPopulation) {
      blockers.push("certified_release_population_mismatch");
    }
  }

  return blockers.length === 0
    ? gate("PB-03", "Executable native CCF certification", "pass", [], evidenceRefs)
    : gate("PB-03", "Executable native CCF certification", "blocked_internal", blockers, evidenceRefs);
}

function authorityGate(
  requiredSurfaces: readonly CCFAuthoritySurface[],
  authorityInputs: readonly CCFPersonalBetaAuthorityInput[],
  history: readonly CCFBacktestProgressRecord[],
): CCFPersonalBetaGateResult {
  if (requiredSurfaces.length === 0) {
    return gate("PB-04", "Recommendation authority cutover", "blocked_internal", [
      "required_authority_surfaces_not_declared",
    ]);
  }
  if (new Set(requiredSurfaces).size !== requiredSurfaces.length) {
    return gate("PB-04", "Recommendation authority cutover", "blocked_internal", [
      "duplicate_required_authority_surface",
    ]);
  }

  const blockers: string[] = [];
  const evidenceRefs: string[] = [];
  for (const surface of requiredSurfaces) {
    const matches = authorityInputs.filter((input) => input.surface === surface);
    if (matches.length !== 1) {
      blockers.push(`${surface}:${matches.length === 0 ? "authority_input_missing" : "authority_input_duplicate"}`);
      continue;
    }
    const input = matches[0];
    const audit = evaluateCCFAuthorityGraph(
      input.graph,
      surface,
      history,
      input.trustedBindings,
    );
    if (!audit.lineageEligible) {
      blockers.push(...audit.blockers.map((blocker) => `${surface}:lineage:${blocker}`));
    }
    if (!audit.trustedBindingEligible) {
      blockers.push(...audit.trustedBindingBlockers.map((blocker) => `${surface}:binding:${blocker}`));
    }
    if (!audit.modelCertificationEligible) {
      blockers.push(
        ...audit.modelCertificationBlockers.map((blocker) => `${surface}:model:${blocker}`),
      );
    }
    if (audit.graphFingerprint) evidenceRefs.push(`authority:${surface}:${audit.graphFingerprint}`);
    if (audit.trustedBindingFingerprint) {
      evidenceRefs.push(`bindings:${surface}:${audit.trustedBindingFingerprint}`);
    }
  }

  return blockers.length === 0
    ? gate("PB-04", "Recommendation authority cutover", "pass", [], evidenceRefs)
    : gate("PB-04", "Recommendation authority cutover", "blocked_internal", blockers, evidenceRefs);
}

function sleeperPortfolioGate(input: CCFPersonalBetaSleeperInput): CCFPersonalBetaGateResult {
  if (input.portfolioPreflight === "pending_external") {
    return gate("PB-05", "Real Sleeper portfolio preflight", "blocked_external", [
      "sleeper_portfolio_preflight_pending_external",
    ]);
  }
  if (input.portfolioPreflight !== "passed") {
    return gate("PB-05", "Real Sleeper portfolio preflight", "blocked_internal", [
      `sleeper_portfolio_preflight_${input.portfolioPreflight}`,
    ]);
  }
  if (!hasText(input.portfolioEvidenceRef)) {
    return gate("PB-05", "Real Sleeper portfolio preflight", "blocked_internal", [
      "sleeper_portfolio_evidence_missing",
    ]);
  }
  return gate("PB-05", "Real Sleeper portfolio preflight", "pass", [], [input.portfolioEvidenceRef]);
}

function sleeperActionGate(input: CCFPersonalBetaSleeperInput): CCFPersonalBetaGateResult {
  if (!input.actionSafetyCertified || !hasText(input.actionSafetyEvidenceRef)) {
    return gate("PB-06", "Guarded Sleeper actions", "blocked_internal", [
      "sleeper_action_safety_not_certified",
    ]);
  }
  if (!input.writeActionsRequired) {
    return gate("PB-06", "Guarded Sleeper actions", "not_applicable", [], [
      input.actionSafetyEvidenceRef,
    ]);
  }
  if (input.writeAuthorization === "pending_external") {
    return gate("PB-06", "Guarded Sleeper actions", "blocked_external", [
      "sleeper_write_authorization_pending_external",
    ], [input.actionSafetyEvidenceRef]);
  }
  if (input.writeAuthorization !== "authorized") {
    return gate("PB-06", "Guarded Sleeper actions", "blocked_internal", [
      `sleeper_write_authorization_${input.writeAuthorization}`,
    ], [input.actionSafetyEvidenceRef]);
  }
  return gate("PB-06", "Guarded Sleeper actions", "pass", [], [input.actionSafetyEvidenceRef]);
}

function devyGate(input: CCFPersonalBetaDevyInput, asOf: string): CCFPersonalBetaGateResult {
  if (!input.required) return gate("PB-07", "Devy identity linkage", "not_applicable");
  if (input.state === "pending_external") {
    return gate("PB-07", "Devy identity linkage", "blocked_external", [
      "devy_identity_linkage_pending_external",
    ]);
  }
  if (input.state !== "ready") {
    return gate("PB-07", "Devy identity linkage", "blocked_internal", [
      `devy_identity_linkage_${input.state}`,
    ]);
  }
  if (!input.linkageReceipt) {
    return gate("PB-07", "Devy identity linkage", "blocked_internal", [
      "devy_identity_linkage_receipt_missing",
    ]);
  }
  if (!hasText(input.expectedSleeperLeagueId)) {
    return gate("PB-07", "Devy identity linkage", "blocked_internal", [
      "devy_expected_sleeper_league_missing",
    ]);
  }

  const audit = evaluateCCFDevyIdentityLinkage(input.linkageReceipt, asOf);
  const blockers = [...audit.blockers];
  if (input.linkageReceipt.sleeperLeagueId !== input.expectedSleeperLeagueId) {
    blockers.push("devy_sleeper_league_mismatch");
  }
  const evidenceRefs = audit.fingerprint ? [`devy-linkage:${audit.fingerprint}`] : [];
  return audit.ready && blockers.length === 0
    ? gate("PB-07", "Devy identity linkage", "pass", [], evidenceRefs)
    : gate("PB-07", "Devy identity linkage", "blocked_internal", blockers, evidenceRefs);
}

function smokeGate(input: CCFPersonalBetaSmokeInput): CCFPersonalBetaGateResult {
  if (input.state === "pending_external") {
    return gate("PB-08", "Exact-candidate personal-beta smoke", "blocked_external", [
      "personal_beta_smoke_pending_external",
    ]);
  }
  if (input.state !== "passed") {
    return gate("PB-08", "Exact-candidate personal-beta smoke", "blocked_internal", [
      `personal_beta_smoke_${input.state}`,
    ]);
  }
  if (!hasText(input.exactCandidateRef) || !hasText(input.evidenceRef)) {
    return gate("PB-08", "Exact-candidate personal-beta smoke", "blocked_internal", [
      "personal_beta_smoke_evidence_missing",
    ]);
  }
  return gate("PB-08", "Exact-candidate personal-beta smoke", "pass", [], [
    input.exactCandidateRef,
    input.evidenceRef,
  ]);
}

export function evaluateCCFPersonalBetaReadiness(
  input: CCFPersonalBetaReadinessInput,
  trustedSourcePromotions: readonly CCFTrustedSourcePromotion[] = CCF_TRUSTED_SOURCE_PROMOTIONS_V1,
): CCFPersonalBetaReadinessResult {
  if (!validTimestamp(input.asOf)) {
    const invalid = gate("PB-01", "Production-native weekly data spine", "blocked_internal", [
      "invalid_as_of_timestamp",
    ]);
    return {
      contractVersion: "ccf-personal-beta-readiness-v2",
      asOf: input.asOf,
      overallStatus: "blocked_internal",
      ready: false,
      gates: [invalid],
      internalBlockers: ["PB-01:invalid_as_of_timestamp"],
      externalBlockers: [],
    };
  }

  const gates = [
    sourceGate(input.weeklySourceSpine, input.asOf, trustedSourcePromotions),
    datasetGate(
      input.weeklySourceSpine,
      input.historicalDataset,
      input.predictiveProtocol,
      input.asOf,
    ),
    receiptGate(
      input.predictiveProtocol,
      input.predictiveReceipt,
      input.backtestHistory,
      input.asOf,
    ),
    authorityGate(
      input.requiredAuthoritySurfaces,
      input.authorityInputs,
      input.backtestHistory,
    ),
    sleeperPortfolioGate(input.sleeper),
    sleeperActionGate(input.sleeper),
    devyGate(input.devy, input.asOf),
    smokeGate(input.smoke),
  ];

  const internalBlockers = gates
    .filter((result) => result.status === "blocked_internal")
    .flatMap((result) => result.blockers.map((blocker) => `${result.id}:${blocker}`));
  const externalBlockers = gates
    .filter((result) => result.status === "blocked_external")
    .flatMap((result) => result.blockers.map((blocker) => `${result.id}:${blocker}`));

  const overallStatus: CCFPersonalBetaOverallStatus = internalBlockers.length > 0
    ? "blocked_internal"
    : externalBlockers.length > 0
      ? "blocked_external"
      : "ready";

  return {
    contractVersion: "ccf-personal-beta-readiness-v2",
    asOf: input.asOf,
    overallStatus,
    ready: overallStatus === "ready",
    gates,
    internalBlockers,
    externalBlockers,
  };
}

export function assertCCFPersonalBetaReady(
  input: CCFPersonalBetaReadinessInput,
  trustedSourcePromotions: readonly CCFTrustedSourcePromotion[] = CCF_TRUSTED_SOURCE_PROMOTIONS_V1,
): void {
  const result = evaluateCCFPersonalBetaReadiness(input, trustedSourcePromotions);
  if (!result.ready) {
    throw new Error(
      `CCF personal beta ${result.overallStatus}: ${[
        ...result.internalBlockers,
        ...result.externalBlockers,
      ].join(", ")}`,
    );
  }
}
