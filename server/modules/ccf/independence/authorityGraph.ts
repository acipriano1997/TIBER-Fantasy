import crypto from "crypto";
import { z } from "zod";
import {
  CCF_BACKTEST_PROGRESS_HISTORY_V1,
  type CCFBacktestProgressRecord,
} from "../certification/backtestProgressHistory";

export const CCF_AUTHORITY_SURFACES = [
  "draft", "lineup", "waiver", "trade", "keeper", "dynasty", "devy", "beat_vegas",
] as const;
export type CCFAuthoritySurface = typeof CCF_AUTHORITY_SURFACES[number];

const text = z.string().trim().min(1).refine(
  (value) => !/^(unknown|unavailable|tbd|todo|placeholder|null|none|n\/a)$/i.test(value),
  "unresolved placeholder",
);
const timestamp = z.string().datetime({ offset: true });
const stageSchema = z.enum([
  "source", "evidence", "eligibility", "feature", "model", "policy", "recommendation", "context",
]);
const nodeSchema = z.object({
  id: text,
  stage: stageSchema,
  producer: text,
  producerFamily: z.enum([
    "ccf_native_fact", "ccf_native_derived", "ccf_native_model", "ccf_native_policy",
    "tiber_model", "external_consensus", "external_projection", "market_challenger",
    "expert_challenger", "legacy_internal_heuristic", "challenger_only", "unknown",
  ]),
  evidenceKind: z.enum(["fact", "deterministic_derivative", "model_inference", "policy", "external_challenger", "unknown"]),
  criticality: z.enum(["recommendation_critical", "context_only"]),
  availability: z.enum(["eligible", "unavailable", "stale", "malformed", "unsupported", "unknown"]),
  knownAt: timestamp.nullable(),
  provenanceRef: text.nullable(),
  certificationState: z.enum(["certified", "partial", "blocked", "non_authoritative"]),
  fallbackBehavior: text,
  dependsOn: z.array(text).max(128),
  modelIdentity: z.object({
    modelVersion: text,
    calibrationVersion: text,
    certificationRunId: text,
  }).strict().nullable(),
}).strict();

const graphSchema = z.object({
  schemaVersion: z.literal("ccf-authority-graph-v1"),
  graphId: text,
  surface: z.enum(CCF_AUTHORITY_SURFACES),
  purpose: z.enum(["production", "fixture"]),
  asOf: timestamp,
  scoringProfileHash: text,
  supportedPopulation: text,
  recommendationNodeIds: z.array(text).min(1).max(128),
  nodes: z.array(nodeSchema).min(1).max(512),
}).strict();

export type CCFAuthorityGraph = z.infer<typeof graphSchema>;
export type CCFAuthorityNode = z.infer<typeof nodeSchema>;
type Stage = CCFAuthorityNode["stage"];

export interface CCFAuthorityGraphAudit {
  surface: CCFAuthoritySurface | null;
  graphFingerprint: string | null;
  lineageEligible: boolean;
  modelCertificationEligible: boolean;
  /** Structural validation is never a production recommendation receipt. */
  recommendationAuthority: false;
  criticalNodeIds: string[];
  blockers: string[];
  modelCertificationBlockers: string[];
}

const stages: readonly Stage[] = [
  "source", "evidence", "eligibility", "feature", "model", "policy", "recommendation",
];
const expectedFamily: Partial<Record<Stage, CCFAuthorityNode["producerFamily"]>> = {
  source: "ccf_native_fact", evidence: "ccf_native_fact",
  eligibility: "ccf_native_derived", feature: "ccf_native_derived",
  model: "ccf_native_model", policy: "ccf_native_policy", recommendation: "ccf_native_policy",
};
const expectedKind: Partial<Record<Stage, CCFAuthorityNode["evidenceKind"]>> = {
  source: "fact", evidence: "fact", eligibility: "deterministic_derivative",
  feature: "deterministic_derivative", model: "model_inference",
  policy: "policy", recommendation: "policy",
};

function fingerprint(graph: CCFAuthorityGraph): string {
  const canonical = {
    ...graph,
    recommendationNodeIds: [...graph.recommendationNodeIds].sort(),
    nodes: [...graph.nodes]
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      .map((node) => ({ ...node, dependsOn: [...node.dependsOn].sort() })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function certifiedModel(
  graph: CCFAuthorityGraph,
  node: CCFAuthorityNode,
  history: readonly CCFBacktestProgressRecord[],
): boolean {
  const identity = node.modelIdentity;
  if (!identity) return false;
  const matches = history.filter((record) => record.id === identity.certificationRunId);
  if (matches.length !== 1) return false;
  const record = matches[0];
  const comparison = record.comparisonIdentity;
  const nonempty = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  return record.stage === "certified_release" && record.status === "certified"
    && record.modelVersion === identity.modelVersion
    && record.calibrationVersion === identity.calibrationVersion
    && Number.isFinite(Date.parse(record.recordedAt))
    && Date.parse(record.recordedAt) <= Date.parse(graph.asOf)
    && comparison.scoringProfileHash === graph.scoringProfileHash
    && comparison.supportedPopulation === graph.supportedPopulation
    && [comparison.protocolVersion, comparison.testWindow, comparison.datasetFingerprint].every(nonempty)
    && record.evidenceRefs.length > 0 && record.evidenceRefs.every(nonempty)
    && (record.tiberRole === "none" || record.tiberRole === "challenger_only")
    && [record.metrics.mae, record.metrics.rmse,
      record.simpleBaselineMetrics?.mae, record.simpleBaselineMetrics?.rmse]
      .every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
}

/**
 * Audit declared lineage, including transitive ancestors regardless of their
 * criticality labels. Provenance still requires trusted source/runtime binding;
 * a graph or a caller-supplied history is not a promotion credential.
 */
export function evaluateCCFAuthorityGraph(
  input: unknown,
  expectedSurface?: CCFAuthoritySurface,
  history: readonly CCFBacktestProgressRecord[] = CCF_BACKTEST_PROGRESS_HISTORY_V1,
): CCFAuthorityGraphAudit {
  const parsed = graphSchema.safeParse(input);
  const result: CCFAuthorityGraphAudit = {
    surface: expectedSurface ?? null, graphFingerprint: null,
    lineageEligible: false, modelCertificationEligible: false,
    recommendationAuthority: false, criticalNodeIds: [], blockers: [], modelCertificationBlockers: [],
  };
  if (!parsed.success) {
    result.blockers = parsed.error.issues.map((issue) => "invalid_graph:" + issue.path.join(".") + ":" + issue.message);
    return result;
  }
  const graph = parsed.data;
  result.surface = graph.surface;
  result.graphFingerprint = fingerprint(graph);
  const blockers = new Set<string>();
  if (expectedSurface && graph.surface !== expectedSurface) blockers.add("surface_mismatch");
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  if (byId.size !== graph.nodes.length) blockers.add("duplicate_node_id");
  if (new Set(graph.recommendationNodeIds).size !== graph.recommendationNodeIds.length) blockers.add("duplicate_recommendation_id");
  for (const node of graph.nodes) {
    if (new Set(node.dependsOn).size !== node.dependsOn.length) blockers.add(node.id + ":duplicate_dependency");
    for (const id of node.dependsOn) if (!byId.has(id)) blockers.add(node.id + ":missing_dependency:" + id);
  }
  for (const id of graph.recommendationNodeIds) {
    if (byId.get(id)?.stage !== "recommendation") blockers.add(id + ":missing_recommendation_root");
  }
  if (blockers.size > 0) {
    result.blockers = Array.from(blockers).sort();
    return result;
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  function visit(id: string): void {
    if (active.has(id)) { blockers.add(id + ":cycle"); return; }
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of byId.get(id)!.dependsOn) visit(dependency);
    active.delete(id);
    visited.add(id);
  }
  for (const node of graph.nodes) visit(node.id);

  const critical = new Set<string>();
  const pending = [...graph.recommendationNodeIds];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (critical.has(id)) continue;
    critical.add(id);
    pending.push(...byId.get(id)!.dependsOn);
  }
  for (const node of graph.nodes) {
    if (!critical.has(node.id)) {
      if (node.criticality === "recommendation_critical") blockers.add(node.id + ":unreachable_critical_node");
      continue;
    }
    if (node.criticality !== "recommendation_critical") blockers.add(node.id + ":hidden_critical_dependency");
    if (node.producerFamily !== expectedFamily[node.stage]) blockers.add(node.id + ":non_native_producer");
    if (node.evidenceKind !== expectedKind[node.stage]) blockers.add(node.id + ":evidence_kind_mismatch");
    if (node.availability !== "eligible") blockers.add(node.id + ":ineligible");
    if (node.certificationState !== "certified") blockers.add(node.id + ":uncertified");
    if (!node.provenanceRef) blockers.add(node.id + ":missing_provenance");
    if (!node.knownAt || Date.parse(node.knownAt) > Date.parse(graph.asOf)) blockers.add(node.id + ":temporal_ineligible");
    const rank = stages.indexOf(node.stage);
    if (rank < 0) blockers.add(node.id + ":invalid_critical_stage");
    if (rank === 0 && node.dependsOn.length > 0) blockers.add(node.id + ":source_has_dependencies");
    if (rank > 0 && !node.dependsOn.some((id) => byId.get(id)!.stage === stages[rank - 1])) blockers.add(node.id + ":missing_lineage_stage");
    for (const id of node.dependsOn) {
      const parent = byId.get(id)!;
      if (stages.indexOf(parent.stage) >= rank) blockers.add(node.id + ":invalid_stage_order");
      if (parent.knownAt && node.knownAt && Date.parse(parent.knownAt) > Date.parse(node.knownAt)) blockers.add(node.id + ":dependency_known_after_output");
    }
    if (node.stage === "model") {
      if (!node.modelIdentity) blockers.add(node.id + ":missing_model_identity");
      if (!certifiedModel(graph, node, history)) result.modelCertificationBlockers.push(node.id + ":missing_matching_certified_backtest");
    }
  }
  if (graph.purpose !== "production") result.modelCertificationBlockers.push("fixture_has_no_production_authority");
  result.criticalNodeIds = Array.from(critical).sort();
  result.blockers = Array.from(blockers).sort();
  result.modelCertificationBlockers.sort();
  result.lineageEligible = result.blockers.length === 0;
  result.modelCertificationEligible = result.lineageEligible && result.modelCertificationBlockers.length === 0;
  return result;
}

export function auditCCFUniversalAuthority(graphs: readonly unknown[] = []) {
  const audits = graphs.map((graph) => evaluateCCFAuthorityGraph(graph));
  const inputBlockers = audits.filter((audit) => audit.surface === null).flatMap((audit) => audit.blockers);
  const surfaces = CCF_AUTHORITY_SURFACES.map((surface) => {
    const matches = audits.filter((audit) => audit.surface === surface);
    if (matches.length === 1) return matches[0];
    return {
      surface, graphFingerprint: null, lineageEligible: false, modelCertificationEligible: false,
      recommendationAuthority: false as const, criticalNodeIds: [],
      blockers: [matches.length === 0 ? "missing_surface_graph" : "duplicate_surface_graph"],
      modelCertificationBlockers: [],
    };
  });
  return {
    surfaces, inputBlockers,
    lineageComplete: inputBlockers.length === 0 && surfaces.every((audit) => audit.lineageEligible),
    modelCertificationComplete: inputBlockers.length === 0 && surfaces.every((audit) => audit.modelCertificationEligible),
  };
}
