import {
  createCCFContextModelVersion,
  createCCFContextObservation,
  resolveCCFContextRead,
} from "../contextLineage";

describe("CCF context lineage", () => {
  it("appends immutable model versions bound to canonical identity", () => {
    const first = createCCFContextModelVersion({
      versionId: "v1",
      workspaceId: "w1",
      canonicalSubjectId: "player-1",
      operatorId: "operator-1",
      createdAt: "2026-09-11T12:00:00Z",
      payload: { preference: "ceiling" },
    });
    const second = createCCFContextModelVersion({
      versionId: "v2",
      workspaceId: "w1",
      canonicalSubjectId: "player-1",
      operatorId: "operator-1",
      createdAt: "2026-09-11T13:00:00Z",
      payload: { preference: "floor" },
      previous: first,
    });
    expect(second.supersedesVersionId).toBe("v1");
    expect(second.payloadSha256).not.toBe(first.payloadSha256);
  });

  it("rejects future observations and identity drift", () => {
    expect(() =>
      createCCFContextObservation({
        observationId: "o1",
        workspaceId: "w1",
        canonicalSubjectId: "player-1",
        operatorId: "operator-1",
        observedAt: "2026-09-11T13:01:00Z",
        recordedAt: "2026-09-11T13:00:00Z",
        payload: { note: "future" },
      }),
    ).toThrow(/future/);

    const first = createCCFContextModelVersion({
      versionId: "v1",
      workspaceId: "w1",
      canonicalSubjectId: "player-1",
      operatorId: "operator-1",
      createdAt: "2026-09-11T12:00:00Z",
      payload: { a: 1 },
    });
    expect(() =>
      createCCFContextModelVersion({
        versionId: "v2",
        workspaceId: "w1",
        canonicalSubjectId: "player-2",
        operatorId: "operator-1",
        createdAt: "2026-09-11T13:00:00Z",
        payload: { a: 2 },
        previous: first,
      }),
    ).toThrow(/canonical subject/);
  });

  it("keeps store outage distinct from genuinely absent context", () => {
    expect(resolveCCFContextRead({ storeAvailable: false, models: [], observations: [] }).status).toBe(
      "store_unavailable",
    );
    expect(resolveCCFContextRead({ storeAvailable: true, models: [], observations: [] }).status).toBe(
      "absent",
    );
  });
});
