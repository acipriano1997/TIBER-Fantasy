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
  id: string;
  stat: CCFScoringStat;
  threshold: number;
  points: number;
  comparison: "at_least";
  /**
   * `stack` means every qualified rule applies. `highest_threshold_in_group`
   * means only the most specific qualified rule in the named group applies.
   */
  stacking: "stack" | "highest_threshold_in_group";
  group?: string;
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

  const bonusIds = new Set<string>();
  for (const bonus of rules.bonuses) {
    if (!bonus.id.trim()) {
      throw new CCFScoringContractError("bonus id is required");
    }
    if (bonusIds.has(bonus.id)) {
      throw new CCFScoringContractError(`duplicate bonus id ${bonus.id}`);
    }
    bonusIds.add(bonus.id);

    if (!bonus.stat.trim()) {
      throw new CCFScoringContractError("bonus stat is required");
    }
    assertFinite(`bonus ${bonus.id} threshold`, bonus.threshold);
    assertFinite(`bonus ${bonus.id} points`, bonus.points);

    if (bonus.stacking === "highest_threshold_in_group" && !bonus.group?.trim()) {
      throw new CCFScoringContractError(
        `bonus ${bonus.id} requires a group for highest_threshold_in_group`,
      );
    }
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

function scoreBonuses(statLine: CCFFantasyStatLine, rules: CCFLeagueScoringRules): number {
  let score = 0;
  const highestOnlyGroups = new Map<string, CCFScoringBonusRule>();

  for (const bonus of rules.bonuses) {
    const value = statLine[bonus.stat];
    if (typeof value !== "number" || value < bonus.threshold) {
      continue;
    }

    if (bonus.stacking === "stack") {
      score += bonus.points;
      continue;
    }

    const group = bonus.group!;
    const incumbent = highestOnlyGroups.get(group);
    if (
      incumbent == null ||
      bonus.threshold > incumbent.threshold ||
      (bonus.threshold === incumbent.threshold && bonus.points > incumbent.points)
    ) {
      highestOnlyGroups.set(group, bonus);
    }
  }

  highestOnlyGroups.forEach((bonus) => {
    score += bonus.points;
  });

  return score;
}

export function scoreCCFFantasyStatLine(
  statLine: CCFFantasyStatLine,
  rules: CCFLeagueScoringRules,
): number {
  validateCCFFantasyStatLine(statLine);
  validateCCFLeagueScoringRules(rules);

  const baseScore =
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

  return baseScore + scoreBonuses(statLine, rules);
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
    const group = (a.group ?? "").localeCompare(b.group ?? "");
    if (group !== 0) return group;
    const stat = a.stat.localeCompare(b.stat);
    if (stat !== 0) return stat;
    if (a.threshold !== b.threshold) return a.threshold - b.threshold;
    if (a.points !== b.points) return a.points - b.points;
    return a.id.localeCompare(b.id);
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
