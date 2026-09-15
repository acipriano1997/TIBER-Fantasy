import {
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../certification/predictiveValidationProtocol";
import {
  validateCCFPredictiveValidationReceipt,
  type CCFPredictiveValidationReceipt,
} from "../certification/predictiveValidationReceipt";
import type { CCFBacktestProgressRecord } from "../certification/backtestProgressHistory";
import {
  evaluateCCFSourceStateEligibility,
  type CCFSourceState,
} from "../sources/sourceState";
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
  linkageCertified: boolean;
  evidenceRef: string | null;
}

export interface CCFPersonalBetaSmokeInput {
  state: "passed" | "pending_external" | "not_run" | "failed_internal";
  exactCandidateRef: string | null;
  evidenceRef: string | null;
}

export interface CCFPersonalBetaReadinessInput {
  asOf: string;
  requiredSourceStates: readonly CCFSourceState[];
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
  contractVersion: "ccf-personal-beta-readiness-v1";
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

function gate(
  id: CCFPersonalBetaGateId,
  label: string,
  status: CCFPersonalBetaGateStatus,
  blockers: string[] = [],
  evidenceRefs: string[] = [],
): CCFPersonalBetaGateResult {
  return { id, label, status, blockers, evidenceRefs };
}

function protocolGate(
  protocol: CCFPredictiveValidationProtocol | null,
): CCFPersonalBetaGateResult {
  if (!protocol) {
    return gate("PB-02", "Frozen historical CCF evaluation dataset", "blocked_internal", [
      "predictive_protocol_missing",
    ]);
  }
  try {
    validateCCFPredictiveValidationProtocol(protocol);
    return gate("PB-02", "Frozen historical CCF evaluation dataset", "pass", [], [
      `protocol:${protocol.protocolId}`,
      `dataset:${protocol.datasetFingerprint}`,
    ]);
  } catch (error) {
    return gate("PB-02", "Frozen historical CCF evaluation dataset", "blocked_internal", [
      `predictive_protocol_invalid:${error instanceof Error ? error.message : "unknown"}`,
    ]);
  }
}

function receiptGate(
  protocol: CCFPredictiveValidationProtocol | null,
  receipt: CCFPredictiveValidationReceipt | null,
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
  try {
    validateCCFPredictiveValidationReceipt(protocol, receipt);
    if (receipt.releaseStatus !== "certified") {
      return gate("PB-03", "Executable native CCF certification", "blocked_internal", [
        `predictive_receipt_not_certified:${receipt.releaseStatus}`,
      ], receipt.evidenceRefs);
    }
    return gate("PB-03", "Executable native CCF certification", "pass", [], [
      `run:${receipt.runId}`,
      ...receipt.evidenceRefs,
    ]);
  } catch (error) {
    return gate("PB-03", "Executable native CCF certification", "blocked_internal", [
      `predictive_receipt_invalid:${error instanceof Error ? error.message : "unknown"}`,
    ]);
  }
}

function sourceGate(
  states: readonly CCFSourceState[],
  asOf: string,
): CCFPersonalBetaGateResult {
  if (states.length === 0) {
    return gate("PB-01", "Production-native weekly data spine", "blocked_internal", [
      "required_source_states_not_declared",
    ]);
  }

  const blockers: string[] = [];
  const evidenceRefs: string[] = [];
  for (const state of states) {
    const decision = evaluateCCFSourceStateEligibility(state, asOf);
    if (!decision.eligible) blockers.push(`${state.sourceId}:${decision.reason}`);
    if (state.qualification) {
      evidenceRefs.push(
        `source:${state.sourceId}:qualification:${state.qualification.qualificationId}`,
      );
    }
  }

  return blockers.length === 0
    ? gate("PB-01", "Production-native weekly data spine", "pass", [], evidenceRefs)
    : gate("PB-01", "Production-native weekly data spine", "blocked_internal", blockers, evidenceRefs);
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

function devyGate(input: CCFPersonalBetaDevyInput): CCFPersonalBetaGateResult {
  if (!input.required) return gate("PB-07", "Devy identity linkage", "not_applicable");
  if (!input.linkageCertified || !hasText(input.evidenceRef)) {
    return gate("PB-07", "Devy identity linkage", "blocked_internal", [
      "devy_identity_linkage_not_certified",
    ]);
  }
  return gate("PB-07", "Devy identity linkage", "pass", [], [input.evidenceRef]);
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
): CCFPersonalBetaReadinessResult {
  if (!Number.isFinite(Date.parse(input.asOf))) {
    const invalid = gate("PB-01", "Production-native weekly data spine", "blocked_internal", [
      "invalid_as_of_timestamp",
    ]);
    return {
      contractVersion: "ccf-personal-beta-readiness-v1",
      asOf: input.asOf,
      overallStatus: "blocked_internal",
      ready: false,
      gates: [invalid],
      internalBlockers: ["PB-01:invalid_as_of_timestamp"],
      externalBlockers: [],
    };
  }

  const gates = [
    sourceGate(input.requiredSourceStates, input.asOf),
    protocolGate(input.predictiveProtocol),
    receiptGate(input.predictiveProtocol, input.predictiveReceipt),
    authorityGate(
      input.requiredAuthoritySurfaces,
      input.authorityInputs,
      input.backtestHistory,
    ),
    sleeperPortfolioGate(input.sleeper),
    sleeperActionGate(input.sleeper),
    devyGate(input.devy),
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
    contractVersion: "ccf-personal-beta-readiness-v1",
    asOf: input.asOf,
    overallStatus,
    ready: overallStatus === "ready",
    gates,
    internalBlockers,
    externalBlockers,
  };
}

export function assertCCFPersonalBetaReady(input: CCFPersonalBetaReadinessInput): void {
  const result = evaluateCCFPersonalBetaReadiness(input);
  if (!result.ready) {
    throw new Error(
      `CCF personal beta ${result.overallStatus}: ${[
        ...result.internalBlockers,
        ...result.externalBlockers,
      ].join(", ")}`,
    );
  }
}
