export interface CCFFantasyStatLine {
  passingYards: number;
  passingTouchdowns: number;
  interceptions: number;
  passingTwoPointConversions: number;
  sacksTaken: number;

  rushingYards: number;
  rushingTouchdowns: number;
  rushingTwoPointConversions: number;

  receptions: number;
  receivingYards: number;
  receivingTouchdowns: number;
  receivingTwoPointConversions: number;

  fumblesLost: number;
  returnTouchdowns: number;

  longestPassingTouchdown?: number;
  longestRushingTouchdown?: number;
  longestReceivingTouchdown?: number;
}

export type CCFScoringStat = keyof CCFFantasyStatLine;

export interface CCFScoringBonusRule {
  stat: CCFScoringStat;
  threshold: number;
  points: number;
  comparison: "at_least";
}

export interface CCFLeagueScoringRules {
  passingYard: number;
  passingTouchdown: number;
  interception: number;
  passingTwoPointConversion: number;
  sackTaken: number;

  rushingYard: number;
  rushingTouchdown: number;
  rushingTwoPointConversion: number;

  reception: number;
  receivingYard: number;
  receivingTouchdown: number;
  receivingTwoPointConversion: number;

  fumbleLost: number;
  returnTouchdown: number;

  bonuses: CCFScoringBonusRule[];
}

export class CCFScoringContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFScoringContractError";
  }
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new CCFScoringContractError(`${label} must be finite`);
  }
}

export function validateCCFLeagueScoringRules(
  rules: CCFLeagueScoringRules,
): CCFLeagueScoringRules {
  const coefficients: Array<[string, number]> = [
    ["passingYard", rules.passingYard],
    ["passingTouchdown", rules.passingTouchdown],
    ["interception", rules.interception],
    ["passingTwoPointConversion", rules.passingTwoPointConversion],
    ["sackTaken", rules.sackTaken],
    ["rushingYard", rules.rushingYard],
    ["rushingTouchdown", rules.rushingTouchdown],
    ["rushingTwoPointConversion", rules.rushingTwoPointConversion],
    ["reception", rules.reception],
    ["receivingYard", rules.receivingYard],
    ["receivingTouchdown", rules.receivingTouchdown],
    ["receivingTwoPointConversion", rules.receivingTwoPointConversion],
    ["fumbleLost", rules.fumbleLost],
    ["returnTouchdown", rules.returnTouchdown],
  ];

  for (const [label, value] of coefficients) {
    assertFinite(label, value);
  }

  for (const bonus of rules.bonuses) {
    if (!bonus.stat.trim()) {
      throw new CCFScoringContractError("bonus stat is required");
    }
    assertFinite(`bonus ${bonus.stat} threshold`, bonus.threshold);
    assertFinite(`bonus ${bonus.stat} points`, bonus.points);
  }

  return rules;
}

export function validateCCFFantasyStatLine(statLine: CCFFantasyStatLine): CCFFantasyStatLine {
  for (const [key, value] of Object.entries(statLine)) {
    if (value == null) {
      continue;
    }
    assertFinite(key, value);
  }
  return statLine;
}

export function scoreCCFFantasyStatLine(
  statLine: CCFFantasyStatLine,
  rules: CCFLeagueScoringRules,
): number {
  validateCCFFantasyStatLine(statLine);
  validateCCFLeagueScoringRules(rules);

  let score =
    statLine.passingYards * rules.passingYard +
    statLine.passingTouchdowns * rules.passingTouchdown +
    statLine.interceptions * rules.interception +
    statLine.passingTwoPointConversions * rules.passingTwoPointConversion +
    statLine.sacksTaken * rules.sackTaken +
    statLine.rushingYards * rules.rushingYard +
    statLine.rushingTouchdowns * rules.rushingTouchdown +
    statLine.rushingTwoPointConversions * rules.rushingTwoPointConversion +
    statLine.receptions * rules.reception +
    statLine.receivingYards * rules.receivingYard +
    statLine.receivingTouchdowns * rules.receivingTouchdown +
    statLine.receivingTwoPointConversions * rules.receivingTwoPointConversion +
    statLine.fumblesLost * rules.fumbleLost +
    statLine.returnTouchdowns * rules.returnTouchdown;

  for (const bonus of rules.bonuses) {
    const value = statLine[bonus.stat];
    if (typeof value === "number" && value >= bonus.threshold) {
      score += bonus.points;
    }
  }

  return score;
}

export const CCF_BASE_PPR_RULES: CCFLeagueScoringRules = {
  passingYard: 0.04,
  passingTouchdown: 4,
  interception: -1,
  passingTwoPointConversion: 2,
  sackTaken: 0,
  rushingYard: 0.1,
  rushingTouchdown: 6,
  rushingTwoPointConversion: 2,
  reception: 1,
  receivingYard: 0.1,
  receivingTouchdown: 6,
  receivingTwoPointConversion: 2,
  fumbleLost: -2,
  returnTouchdown: 6,
  bonuses: [],
};

export const CCF_BASE_HALF_PPR_RULES: CCFLeagueScoringRules = {
  ...CCF_BASE_PPR_RULES,
  reception: 0.5,
  bonuses: [],
};

export const CCF_BASE_STANDARD_RULES: CCFLeagueScoringRules = {
  ...CCF_BASE_PPR_RULES,
  reception: 0,
  bonuses: [],
};

/**
 * Stable, human-auditable fingerprint for an exact scoring configuration.
 * The field order is intentional and versioned by this contract rather than
 * relying on arbitrary object serialization order.
 */
export function fingerprintCCFLeagueScoringRules(rules: CCFLeagueScoringRules): string {
  validateCCFLeagueScoringRules(rules);
  const orderedBonuses = [...rules.bonuses].sort((a, b) => {
    const stat = a.stat.localeCompare(b.stat);
    if (stat !== 0) return stat;
    if (a.threshold !== b.threshold) return a.threshold - b.threshold;
    return a.points - b.points;
  });

  return JSON.stringify({
    version: "ccf-league-scoring-v1",
    passingYard: rules.passingYard,
    passingTouchdown: rules.passingTouchdown,
    interception: rules.interception,
    passingTwoPointConversion: rules.passingTwoPointConversion,
    sackTaken: rules.sackTaken,
    rushingYard: rules.rushingYard,
    rushingTouchdown: rules.rushingTouchdown,
    rushingTwoPointConversion: rules.rushingTwoPointConversion,
    reception: rules.reception,
    receivingYard: rules.receivingYard,
    receivingTouchdown: rules.receivingTouchdown,
    receivingTwoPointConversion: rules.receivingTwoPointConversion,
    fumbleLost: rules.fumbleLost,
    returnTouchdown: rules.returnTouchdown,
    bonuses: orderedBonuses,
  });
}
