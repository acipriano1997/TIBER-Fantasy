import {
  buildTeamPassingIntentPreworkV1,
  type TeamPassingIntentPreworkInput,
} from "../prework_teamPassingIntentV1";

function input(
  overrides: Partial<TeamPassingIntentPreworkInput> = {},
): TeamPassingIntentPreworkInput {
  return {
    teamId: "DAL",
    season: 2026,
    asOfWeek: 3,
    cutoffAt: "2026-09-20T17:00:00.000Z",
    knownAt: "2026-09-20T12:00:00.000Z",
    regimeId: "dal-2026-offense-v1",
    neutralPassRate: 0.61,
    proe: 0.045,
    earlyDownPassRate: 0.59,
    firstDownPassRate: 0.57,
    neutralPlayCount: 96,
    sourceRefs: ["teamstate://example"],
    ...overrides,
  };
}

describe("CCF team passing intent prework v1", () => {
  it("keeps neutral pass rate and PROE semantically distinct", () => {
    const result = buildTeamPassingIntentPreworkV1(input());

    expect(result.metrics.neutralPassRate).toBe(0.61);
    expect(result.metrics.proe).toBe(0.045);
    expect(result.semantics.neutralPassRate).toBe("observed neutral-script pass share");
    expect(result.semantics.proe).toBe("situation-adjusted pass tendency residual");
  });

  it("declares one latent family and prohibits additive/direct-player bonus stacking", () => {
    const result = buildTeamPassingIntentPreworkV1(input());

    expect(result.family).toBe("PASS_RUN_TENDENCY");
    expect(result.downstreamUse.primaryMechanism).toBe("team_dropback_volume");
    expect(result.downstreamUse.directPlayerFantasyBonusAllowed).toBe(false);
    expect(result.downstreamUse.additiveMetricStackingAllowed).toBe(false);
  });

  it("preserves null versus zero and degrades coverage instead of fabricating PROE", () => {
    const result = buildTeamPassingIntentPreworkV1(
      input({ proe: null, firstDownPassRate: 0, neutralPlayCount: null }),
    );

    expect(result.metrics.proe).toBeNull();
    expect(result.metrics.firstDownPassRate).toBe(0);
    expect(result.coverage).toBe("partial");
    expect(result.warnings).toContain("PROE is unavailable; do not infer it from neutral pass rate");
  });

  it("returns unavailable when no passing-tendency metrics are governed", () => {
    const result = buildTeamPassingIntentPreworkV1(
      input({
        neutralPassRate: null,
        proe: null,
        earlyDownPassRate: null,
        firstDownPassRate: null,
        neutralPlayCount: null,
        regimeId: null,
      }),
    );

    expect(result.coverage).toBe("unavailable");
  });

  it("fails closed on future-known evidence", () => {
    expect(() =>
      buildTeamPassingIntentPreworkV1(
        input({ knownAt: "2026-09-20T18:00:00.000Z" }),
      ),
    ).toThrow("knownAt cannot be after cutoffAt");
  });

  it("fails closed on malformed rates and denominators", () => {
    expect(() => buildTeamPassingIntentPreworkV1(input({ neutralPassRate: 1.01 }))).toThrow(
      "neutralPassRate",
    );
    expect(() => buildTeamPassingIntentPreworkV1(input({ proe: -1.01 }))).toThrow("proe");
    expect(() => buildTeamPassingIntentPreworkV1(input({ neutralPlayCount: -1 }))).toThrow(
      "neutralPlayCount",
    );
  });
});
