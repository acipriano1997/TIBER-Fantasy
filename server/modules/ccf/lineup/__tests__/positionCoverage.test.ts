import {
  CCF_LINEUP_POSITION_COVERAGE_VERSION,
  auditCCFLineupPositionCoverage,
  assertCCFLineupPositionCoverage,
} from "../positionCoverage";

function baseInput() {
  return {
    contractVersion: CCF_LINEUP_POSITION_COVERAGE_VERSION,
    leagueRef: "league-1",
    rosterSlotsFingerprint: "slots-sha256",
    starterEligiblePositions: ["QB", "RB", "WR", "TE"] as const,
  };
}

describe("CCF active-league position coverage", () => {
  it("certifies the current native QB/RB/WR/TE position universe", () => {
    const audit = auditCCFLineupPositionCoverage(baseInput());
    expect(audit.ready).toBe(true);
    expect(audit.unsupportedPositions).toEqual([]);
    expect(audit.requiredPositions).toEqual(["QB", "RB", "TE", "WR"]);
    expect(audit.coverageFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(assertCCFLineupPositionCoverage(baseInput())).toEqual(audit);
  });

  it.each(["K", "DST", "DL", "LB", "DB", "IDP"])(
    "fails closed when the active starter universe includes unsupported %s outcomes",
    (position) => {
      const audit = auditCCFLineupPositionCoverage({
        ...baseInput(),
        starterEligiblePositions: ["QB", "RB", "WR", "TE", position],
      });
      expect(audit.ready).toBe(false);
      expect(audit.unsupportedPositions).toContain(position);
      expect(audit.blockers).toContain(`unsupported_position:${position}`);
    },
  );

  it("normalizes case/order and fingerprints the same active coverage deterministically", () => {
    const left = auditCCFLineupPositionCoverage({
      ...baseInput(),
      starterEligiblePositions: ["wr", "QB", "rb", "TE", "WR"],
    });
    const right = auditCCFLineupPositionCoverage({
      ...baseInput(),
      starterEligiblePositions: ["TE", "RB", "WR", "QB"],
    });
    expect(left.ready).toBe(true);
    expect(right.ready).toBe(true);
    expect(left.requiredPositions).toEqual(right.requiredPositions);
    expect(left.coverageFingerprint).toBe(right.coverageFingerprint);
  });

  it("rejects missing league/slot identity and empty starter coverage", () => {
    const audit = auditCCFLineupPositionCoverage({
      contractVersion: CCF_LINEUP_POSITION_COVERAGE_VERSION,
      leagueRef: "",
      rosterSlotsFingerprint: "",
      starterEligiblePositions: [],
    });
    expect(audit.ready).toBe(false);
    expect(audit.coverageFingerprint).toBeNull();
    expect(audit.blockers).toEqual(expect.arrayContaining([
      "league_ref_missing",
      "roster_slots_fingerprint_missing",
      "starter_position_coverage_missing",
    ]));
  });

  it("does not allow blank position tokens to disappear during normalization", () => {
    const audit = auditCCFLineupPositionCoverage({
      ...baseInput(),
      starterEligiblePositions: ["QB", " "],
    });
    expect(audit.ready).toBe(false);
    expect(audit.blockers).toContain("starter_position_blank");
  });
});
