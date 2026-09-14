import {
  CCF_AUTHORITY_SURFACES, auditCCFUniversalAuthority, evaluateCCFAuthorityGraph,
  type CCFAuthorityGraph, type CCFAuthoritySurface,
} from "../authorityGraph";
import {
  CCF_BACKTEST_PROGRESS_HISTORY_V1, EMPTY_CCF_BACKTEST_METRICS,
  type CCFBacktestProgressRecord,
} from "../../certification/backtestProgressHistory";

function fixture(surface: CCFAuthoritySurface = "lineup"): CCFAuthorityGraph {
  const stages = ["source", "evidence", "eligibility", "feature", "model", "policy", "recommendation"] as const;
  const families = {
    source: "ccf_native_fact", evidence: "ccf_native_fact", eligibility: "ccf_native_derived",
    feature: "ccf_native_derived", model: "ccf_native_model", policy: "ccf_native_policy",
    recommendation: "ccf_native_policy",
  } as const;
  const kinds = {
    source: "fact", evidence: "fact", eligibility: "deterministic_derivative",
    feature: "deterministic_derivative", model: "model_inference", policy: "policy", recommendation: "policy",
  } as const;
  return {
    schemaVersion: "ccf-authority-graph-v1", graphId: "synthetic-" + surface,
    surface, purpose: "fixture", asOf: "2026-09-13T12:00:00Z",
    scoringProfileHash: "synthetic-score", supportedPopulation: "synthetic-population",
    recommendationNodeIds: ["recommendation"],
    nodes: stages.map((stage, index): CCFAuthorityGraph["nodes"][number] => ({
      id: stage, stage, producer: "synthetic-ccf-" + stage,
      producerFamily: families[stage], evidenceKind: kinds[stage],
      criticality: "recommendation_critical", availability: "eligible",
      knownAt: "2026-09-13T10:00:00Z", provenanceRef: "synthetic://" + stage,
      certificationState: "certified", fallbackBehavior: "abstain",
      dependsOn: index === 0 ? [] : [stages[index - 1]],
      modelIdentity: stage === "model" ? {
        modelVersion: "synthetic-model", calibrationVersion: "synthetic-calibration",
        certificationRunId: "synthetic-run",
      } : null,
    })),
  };
}

function certifiedRecord(): CCFBacktestProgressRecord {
  return {
    ...CCF_BACKTEST_PROGRESS_HISTORY_V1[1],
    id: "synthetic-run", recordedAt: "2026-09-12T12:00:00Z",
    stage: "certified_release", status: "certified",
    modelVersion: "synthetic-model", calibrationVersion: "synthetic-calibration",
    comparisonIdentity: {
      protocolVersion: "synthetic-protocol", scoringProfileHash: "synthetic-score",
      supportedPopulation: "synthetic-population", testWindow: "synthetic-window",
      datasetFingerprint: "synthetic-dataset",
    },
    metrics: { ...EMPTY_CCF_BACKTEST_METRICS, mae: 3, rmse: 4 },
    simpleBaselineMetrics: { ...EMPTY_CCF_BACKTEST_METRICS, mae: 4, rmse: 5 },
    evidenceRefs: ["synthetic://certification"],
  };
}

describe("CCF universal recommendation authority graph", () => {
  it.each(CCF_AUTHORITY_SURFACES)("validates native lineage for %s without granting authority", (surface) => {
    const audit = evaluateCCFAuthorityGraph(fixture(surface), surface);
    expect(audit.lineageEligible).toBe(true);
    expect(audit.criticalNodeIds).toHaveLength(7);
    expect(audit.modelCertificationEligible).toBe(false);
    expect(audit.recommendationAuthority).toBe(false);
  });

  it.each([
    "tiber_model", "external_consensus", "external_projection", "market_challenger",
    "expert_challenger", "legacy_internal_heuristic", "challenger_only", "unknown",
  ] as const)("rejects %s despite certified/eligible labels", (family) => {
    const graph = fixture();
    graph.nodes.find((node) => node.id === "feature")!.producerFamily = family;
    expect(evaluateCCFAuthorityGraph(graph).blockers).toContain("feature:non_native_producer");
  });

  it("cannot hide an ancestor by relabeling it context-only", () => {
    const graph = fixture();
    graph.nodes[0].criticality = "context_only";
    graph.nodes[0].producerFamily = "tiber_model";
    expect(evaluateCCFAuthorityGraph(graph).blockers).toEqual(expect.arrayContaining([
      "source:hidden_critical_dependency", "source:non_native_producer",
    ]));
  });

  it("permits disconnected stale challenger context but never native use of it", () => {
    const graph = fixture();
    graph.nodes.push({
      ...graph.nodes[0], id: "expert", stage: "context", producerFamily: "expert_challenger",
      evidenceKind: "external_challenger", criticality: "context_only",
      availability: "stale", certificationState: "non_authoritative", knownAt: null, provenanceRef: null,
    });
    expect(evaluateCCFAuthorityGraph(graph).lineageEligible).toBe(true);
    graph.nodes.find((node) => node.id === "policy")!.dependsOn.push("expert");
    expect(evaluateCCFAuthorityGraph(graph).lineageEligible).toBe(false);
  });

  it.each(["stale", "unavailable", "malformed", "unsupported", "unknown"] as const)(
    "rejects %s critical evidence", (availability) => {
      const graph = fixture();
      graph.nodes[0].availability = availability;
      expect(evaluateCCFAuthorityGraph(graph).blockers).toContain("source:ineligible");
    },
  );

  it("requires provenance, known-time eligibility, and model/calibration identity", () => {
    const graph = fixture();
    graph.nodes[0].provenanceRef = null;
    graph.nodes[0].knownAt = "2026-09-14T12:00:00Z";
    graph.nodes.find((node) => node.id === "model")!.modelIdentity = null;
    expect(evaluateCCFAuthorityGraph(graph).blockers).toEqual(expect.arrayContaining([
      "source:missing_provenance", "source:temporal_ineligible", "model:missing_model_identity",
    ]));
  });

  it("rejects inputs learned after their derived output, even before asOf", () => {
    const graph = fixture();
    graph.nodes[0].knownAt = "2026-09-13T11:00:00Z";
    expect(evaluateCCFAuthorityGraph(graph).blockers).toContain("evidence:dependency_known_after_output");
  });

  it("requires all lineage stages and rejects cycles", () => {
    const skipped = fixture();
    skipped.nodes.find((node) => node.id === "model")!.dependsOn = ["evidence"];
    expect(evaluateCCFAuthorityGraph(skipped).blockers).toContain("model:missing_lineage_stage");
    const cyclic = fixture();
    cyclic.nodes[0].dependsOn = ["model"];
    expect(evaluateCCFAuthorityGraph(cyclic).blockers.some((blocker) => blocker.endsWith(":cycle"))).toBe(true);
  });

  it("rejects empty graphs, missing roots, broken references, and duplicate nodes", () => {
    expect(evaluateCCFAuthorityGraph({ ...fixture(), nodes: [] }).lineageEligible).toBe(false);
    expect(evaluateCCFAuthorityGraph({ ...fixture(), recommendationNodeIds: [] }).lineageEligible).toBe(false);
    const broken = fixture();
    broken.nodes[1].dependsOn = ["absent"];
    expect(evaluateCCFAuthorityGraph(broken).blockers).toContain("evidence:missing_dependency:absent");
    const duplicate = fixture();
    duplicate.nodes.push({ ...duplicate.nodes[0] });
    expect(evaluateCCFAuthorityGraph(duplicate).blockers).toContain("duplicate_node_id");
  });

  it("rejects duplicate roots/dependencies, disconnected critical nodes, and invalid stage/kind labels", () => {
    const roots = fixture();
    roots.recommendationNodeIds.push("recommendation");
    expect(evaluateCCFAuthorityGraph(roots).blockers).toContain("duplicate_recommendation_id");
    const deps = fixture();
    deps.nodes[1].dependsOn.push("source");
    expect(evaluateCCFAuthorityGraph(deps).blockers).toContain("evidence:duplicate_dependency");
    const disconnected = fixture();
    disconnected.nodes.push({ ...disconnected.nodes[0], id: "disconnected" });
    expect(evaluateCCFAuthorityGraph(disconnected).blockers).toContain("disconnected:unreachable_critical_node");
    const mislabeled = fixture();
    mislabeled.nodes[0].evidenceKind = "model_inference";
    expect(evaluateCCFAuthorityGraph(mislabeled).blockers).toContain("source:evidence_kind_mismatch");
  });

  it("rejects unsupported surfaces, wrong context, placeholders, and timezone-free timestamps", () => {
    expect(evaluateCCFAuthorityGraph({ ...fixture(), surface: "unregistered" }).lineageEligible).toBe(false);
    expect(evaluateCCFAuthorityGraph(fixture("draft"), "lineup").blockers).toContain("surface_mismatch");
    expect(evaluateCCFAuthorityGraph({ ...fixture(), scoringProfileHash: "TBD" }).lineageEligible).toBe(false);
    expect(evaluateCCFAuthorityGraph({ ...fixture(), asOf: "2026-09-13T12:00:00" }).lineageEligible).toBe(false);
  });

  it("fingerprints deterministically without mutating inputs and detects changed provenance", () => {
    const graph = fixture();
    const before = JSON.stringify(graph);
    const first = evaluateCCFAuthorityGraph(graph);
    expect(JSON.stringify(graph)).toBe(before);
    expect(evaluateCCFAuthorityGraph({ ...graph, nodes: [...graph.nodes].reverse() }).graphFingerprint).toBe(first.graphFingerprint);
    graph.nodes[0].provenanceRef = "synthetic://correction";
    expect(evaluateCCFAuthorityGraph(graph).graphFingerprint).not.toBe(first.graphFingerprint);
  });

  it("requires a matching previously known certified release in the ledger", () => {
    const graph = fixture();
    graph.purpose = "production";
    const record = certifiedRecord();
    const audit = evaluateCCFAuthorityGraph(graph, "lineup", [record]);
    expect(audit.modelCertificationEligible).toBe(true);
    expect(audit.recommendationAuthority).toBe(false);
    const invalidRecords: CCFBacktestProgressRecord[] = [
      { ...record, status: "passed" }, { ...record, stage: "native_scaffold" },
      { ...record, modelVersion: "another-model" }, { ...record, calibrationVersion: "another-calibration" },
      { ...record, recordedAt: "2026-09-14T12:00:00Z" }, { ...record, evidenceRefs: [] },
      { ...record, simpleBaselineMetrics: null }, { ...record, metrics: { ...record.metrics, mae: null } },
      { ...record, comparisonIdentity: { ...record.comparisonIdentity, scoringProfileHash: "another-score" } },
      { ...record, comparisonIdentity: { ...record.comparisonIdentity, supportedPopulation: "another-population" } },
      { ...record, comparisonIdentity: { ...record.comparisonIdentity, datasetFingerprint: null } },
    ];
    for (const invalid of invalidRecords) expect(evaluateCCFAuthorityGraph(graph, "lineup", [invalid]).modelCertificationEligible).toBe(false);
    expect(evaluateCCFAuthorityGraph(graph, "lineup", [record, record]).modelCertificationEligible).toBe(false);
    expect(evaluateCCFAuthorityGraph(fixture(), "lineup", [record]).modelCertificationEligible).toBe(false);
  });

  it("requires all eight unique surfaces; missing audits never count as green", () => {
    const missing = auditCCFUniversalAuthority();
    expect(missing.surfaces).toHaveLength(8);
    expect(missing.surfaces.every((surface) => surface.blockers.includes("missing_surface_graph"))).toBe(true);
    expect(missing.lineageComplete).toBe(false);
    const graphs = CCF_AUTHORITY_SURFACES.map(fixture);
    expect(auditCCFUniversalAuthority(graphs).lineageComplete).toBe(true);
    expect(auditCCFUniversalAuthority(graphs).modelCertificationComplete).toBe(false);
    expect(auditCCFUniversalAuthority(graphs.slice(1)).lineageComplete).toBe(false);
    expect(auditCCFUniversalAuthority([...graphs, fixture()]).lineageComplete).toBe(false);
    expect(auditCCFUniversalAuthority([...graphs, {}]).lineageComplete).toBe(false);
  });
});
