import {
  CCF_BASE_HALF_PPR_RULES,
  CCF_BASE_PPR_RULES,
  CCFScoringContractError,
  fingerprintCCFLeagueScoringRules,
  scoreCCFFantasyStatLine,
  type CCFFantasyStatLine,
  type CCFLeagueScoringRules,
} from "../scoringRules";

function emptyStatLine(): CCFFantasyStatLine {
  return {
    passingYards: 0,
    passingTouchdowns: 0,
    interceptions: 0,
    passingTwoPointConversions: 0,
    sacksTaken: 0,
    rushingYards: 0,
    rushingTouchdowns: 0,
    rushingTwoPointConversions: 0,
    receptions: 0,
    receivingYards: 0,
    receivingTouchdowns: 0,
    receivingTwoPointConversions: 0,
    fumblesLost: 0,
    returnTouchdowns: 0,
  };
}

describe("CCF native league scoring", () => {
  it("scores PPR and half-PPR from the same football stat line without external projections", () => {
    const line = {
      ...emptyStatLine(),
      receptions: 6,
      receivingYards: 80,
      receivingTouchdowns: 1,
    };

    expect(scoreCCFFantasyStatLine(line, CCF_BASE_PPR_RULES)).toBeCloseTo(20);
    expect(scoreCCFFantasyStatLine(line, CCF_BASE_HALF_PPR_RULES)).toBeCloseTo(17);
  });

  it("supports exact custom coefficients such as six-point passing TDs and sack penalties", () => {
    const rules: CCFLeagueScoringRules = {
      ...CCF_BASE_PPR_RULES,
      passingTouchdown: 6,
      sackTaken: -1,
      bonuses: [],
    };
    const line = {
      ...emptyStatLine(),
      passingYards: 250,
      passingTouchdowns: 2,
      interceptions: 1,
      sacksTaken: 3,
      rushingYards: 20,
    };

    // 10 passing yards + 12 pass TD - 1 INT - 3 sacks + 2 rush yards
    expect(scoreCCFFantasyStatLine(line, rules)).toBeCloseTo(20);
  });

  it("supports additive bonus rules", () => {
    const rules: CCFLeagueScoringRules = {
      ...CCF_BASE_PPR_RULES,
      bonuses: [
        {
          id: "pass-300",
          stat: "passingYards",
          threshold: 300,
          points: 3,
          comparison: "at_least",
          stacking: "stack",
        },
        {
          id: "pass-400",
          stat: "passingYards",
          threshold: 400,
          points: 2,
          comparison: "at_least",
          stacking: "stack",
        },
      ],
    };
    const line = { ...emptyStatLine(), passingYards: 410 };

    expect(scoreCCFFantasyStatLine(line, rules)).toBeCloseTo(21.4);
  });

  it("can make threshold tiers mutually exclusive within an explicit group", () => {
    const rules: CCFLeagueScoringRules = {
      ...CCF_BASE_PPR_RULES,
      bonuses: [
        {
          id: "long-pass-40",
          stat: "longestPassingTouchdown",
          threshold: 40,
          points: 2,
          comparison: "at_least",
          stacking: "highest_threshold_in_group",
          group: "long-pass-td",
        },
        {
          id: "long-pass-50",
          stat: "longestPassingTouchdown",
          threshold: 50,
          points: 4,
          comparison: "at_least",
          stacking: "highest_threshold_in_group",
          group: "long-pass-td",
        },
      ],
    };
    const line = {
      ...emptyStatLine(),
      longestPassingTouchdown: 55,
    };

    expect(scoreCCFFantasyStatLine(line, rules)).toBe(4);
  });

  it("fingerprints equivalent scoring rules deterministically regardless of bonus input order", () => {
    const bonusA = {
      id: "a",
      stat: "passingYards" as const,
      threshold: 300,
      points: 3,
      comparison: "at_least" as const,
      stacking: "stack" as const,
    };
    const bonusB = {
      id: "b",
      stat: "rushingYards" as const,
      threshold: 100,
      points: 3,
      comparison: "at_least" as const,
      stacking: "stack" as const,
    };

    const first = { ...CCF_BASE_PPR_RULES, bonuses: [bonusA, bonusB] };
    const second = { ...CCF_BASE_PPR_RULES, bonuses: [bonusB, bonusA] };

    expect(fingerprintCCFLeagueScoringRules(first)).toBe(
      fingerprintCCFLeagueScoringRules(second),
    );
  });

  it("rejects ambiguous highest-only bonus semantics without a group", () => {
    const rules: CCFLeagueScoringRules = {
      ...CCF_BASE_PPR_RULES,
      bonuses: [
        {
          id: "bad",
          stat: "passingYards",
          threshold: 300,
          points: 3,
          comparison: "at_least",
          stacking: "highest_threshold_in_group",
        },
      ],
    };

    expect(() => scoreCCFFantasyStatLine(emptyStatLine(), rules)).toThrow(
      CCFScoringContractError,
    );
  });
});
