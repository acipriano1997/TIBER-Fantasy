import {
  createCCFHistoricalExpectationFreeze,
  fingerprintCCFHistoricalFreeze,
  verifyCCFHistoricalFrozenArtifact,
} from "../historicalFreeze";

describe("CCF historical expectation freeze", () => {
  const baseInput = {
    subjectId: "rookie-1",
    decisionAsOf: "2026-04-20T12:00:00Z",
    frozenAt: "2026-04-20T12:05:00Z",
    artifacts: [
      {
        artifactId: "predraft",
        role: "predraft_profile" as const,
        knownAt: "2026-04-19T12:00:00Z",
        content: '{"grade":1}',
        sourceRef: "source://predraft",
      },
      {
        artifactId: "team-context",
        role: "team_context" as const,
        knownAt: "2026-04-20T10:00:00Z",
        content: '{"team":"AAA"}',
        sourceRef: "source://team",
      },
    ],
  };

  it("freezes only temporally eligible pre-outcome bytes", () => {
    const frozen = createCCFHistoricalExpectationFreeze(baseInput);
    expect(frozen.outcomesIncluded).toBe(false);
    expect(frozen.artifacts).toHaveLength(2);
    expect(verifyCCFHistoricalFrozenArtifact(frozen.artifacts[0], '{"grade":1}')).toBe(true);
    expect(verifyCCFHistoricalFrozenArtifact(frozen.artifacts[0], '{"grade":2}')).toBe(false);
  });

  it("rejects future-known and outcome-contaminated inputs", () => {
    expect(() =>
      createCCFHistoricalExpectationFreeze({
        ...baseInput,
        artifacts: [
          {
            ...baseInput.artifacts[0],
            knownAt: "2026-04-21T00:00:00Z",
          },
        ],
      }),
    ).toThrow(/after decisionAsOf/);

    expect(() =>
      createCCFHistoricalExpectationFreeze({
        ...baseInput,
        artifacts: [
          {
            ...baseInput.artifacts[0],
            outcomeContaminated: true,
          },
        ],
      }),
    ).toThrow(/outcome-contaminated/);
  });

  it("requires and records an explicit reason for refreezing changed historical context", () => {
    const first = createCCFHistoricalExpectationFreeze(baseInput);
    expect(() =>
      createCCFHistoricalExpectationFreeze({
        ...baseInput,
        frozenAt: "2026-04-20T13:00:00Z",
        previous: first,
      }),
    ).toThrow(/refreezeReason/);

    const second = createCCFHistoricalExpectationFreeze({
      ...baseInput,
      frozenAt: "2026-04-20T13:00:00Z",
      previous: first,
      refreezeReason: "corrected source-backed team assignment",
    });
    expect(second.refreezeHistory).toHaveLength(1);
    expect(second.refreezeHistory[0]).toMatchObject({
      reason: "corrected source-backed team assignment",
      priorManifestSha256: fingerprintCCFHistoricalFreeze(first),
    });
  });
});
