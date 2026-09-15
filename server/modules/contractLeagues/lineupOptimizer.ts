import { scoreFantasyStatLine, type FantasyStatLine } from '../../enrichment/fantasyBox';
import type { ContractLeagueSnapshot } from './contracts';
import { resolveLeagueScoring } from './scoringAdapter';

export type LineupOptimizationObjective = 'EXPECTED' | 'P10' | 'P50' | 'P90';

export type FootballOutcomeSample = {
  scenarioId: string;
  probability: number;
  statLine: FantasyStatLine;
};

export type LineupCandidate = {
  playerId: string;
  sourcePlayerName?: string | null;
  position: 'QB' | 'RB' | 'WR' | 'TE';
  available: boolean;
  outcomes: FootballOutcomeSample[];
};

export type FantasyDistributionSummary = {
  expected: number;
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
};

export type ScoredLineupCandidate = LineupCandidate & {
  fantasyOutcomes: Array<{
    scenarioId: string;
    probability: number;
    points: number;
  }>;
  distribution: FantasyDistributionSummary;
};

export type OptimizedLineupAssignment = {
  slot: string;
  slotIndex: number;
  eligiblePositions: Array<'QB' | 'RB' | 'WR' | 'TE'>;
  playerId: string;
  sourcePlayerName: string | null;
  position: 'QB' | 'RB' | 'WR' | 'TE';
  objectiveValue: number;
  distribution: FantasyDistributionSummary;
};

export type LineupOptimizationResult =
  | {
      status: 'READY';
      objective: LineupOptimizationObjective;
      assignments: OptimizedLineupAssignment[];
      objectiveTotal: number;
      expectedPoints: number;
      jointDistribution: FantasyDistributionSummary | null;
      warnings: string[];
      scoredCandidates: ScoredLineupCandidate[];
    }
  | {
      status: 'UNAVAILABLE';
      reason: 'SCORING_UNAVAILABLE' | 'LINEUP_RULES_UNAVAILABLE' | 'OUTCOME_DISTRIBUTION_UNAVAILABLE';
      details: string[];
    }
  | {
      status: 'INFEASIBLE';
      reason: 'INSUFFICIENT_ELIGIBLE_PLAYERS';
      unfilledSlots: Array<{
        slot: string;
        slotIndex: number;
        eligiblePositions: Array<'QB' | 'RB' | 'WR' | 'TE'>;
      }>;
      scoredCandidates: ScoredLineupCandidate[];
    };

type StarterSlot = {
  slot: string;
  slotIndex: number;
  eligiblePositions: Array<'QB' | 'RB' | 'WR' | 'TE'>;
};

type FlowEdge = {
  to: number;
  rev: number;
  capacity: number;
  cost: number;
  playerIndex?: number;
  slotIndex?: number;
};

function weightedQuantile(
  outcomes: Array<{ probability: number; points: number }>,
  quantile: number,
): number {
  const sorted = [...outcomes].sort((a, b) => a.points - b.points);
  const total = sorted.reduce((sum, outcome) => sum + outcome.probability, 0);
  const target = total * quantile;
  let cumulative = 0;
  for (const outcome of sorted) {
    cumulative += outcome.probability;
    if (cumulative + 1e-12 >= target) return outcome.points;
  }
  return sorted[sorted.length - 1]?.points ?? 0;
}

function summarizeDistribution(
  outcomes: Array<{ probability: number; points: number }>,
): FantasyDistributionSummary {
  const totalProbability = outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  const expected = outcomes.reduce(
    (sum, outcome) => sum + outcome.points * outcome.probability,
    0,
  ) / totalProbability;
  const points = outcomes.map((outcome) => outcome.points);
  return {
    expected: Number(expected.toFixed(4)),
    p10: weightedQuantile(outcomes, 0.1),
    p50: weightedQuantile(outcomes, 0.5),
    p90: weightedQuantile(outcomes, 0.9),
    min: Math.min(...points),
    max: Math.max(...points),
  };
}

function objectiveValue(
  distribution: FantasyDistributionSummary,
  objective: LineupOptimizationObjective,
): number {
  if (objective === 'P10') return distribution.p10;
  if (objective === 'P50') return distribution.p50;
  if (objective === 'P90') return distribution.p90;
  return distribution.expected;
}

function expandStarterSlots(lineup: ContractLeagueSnapshot['league']['lineup']): StarterSlot[] | null {
  const starters: StarterSlot[] = [];
  for (const slotRule of lineup) {
    if (slotRule.slot === 'BENCH' || slotRule.slot === 'IR' || slotRule.count === 0) continue;
    if (!slotRule.eligiblePositions.length) return null;
    for (let index = 0; index < slotRule.count; index += 1) {
      starters.push({
        slot: slotRule.slot,
        slotIndex: index + 1,
        eligiblePositions: [...slotRule.eligiblePositions],
      });
    }
  }
  return starters.length ? starters : null;
}

function validateAndScoreCandidates(
  candidates: LineupCandidate[],
  scoring: ReturnType<typeof resolveLeagueScoring> & { status: 'READY' },
): { scored: ScoredLineupCandidate[]; errors: string[] } {
  const errors: string[] = [];
  const seenPlayerIds = new Set<string>();
  const scored: ScoredLineupCandidate[] = [];

  for (const candidate of candidates) {
    if (!candidate.available) continue;
    if (!candidate.playerId.trim()) {
      errors.push('A lineup candidate is missing playerId.');
      continue;
    }
    if (seenPlayerIds.has(candidate.playerId)) {
      errors.push(`Duplicate lineup candidate playerId ${candidate.playerId}.`);
      continue;
    }
    seenPlayerIds.add(candidate.playerId);

    if (!candidate.outcomes.length) {
      errors.push(`${candidate.playerId} has no football outcome samples.`);
      continue;
    }

    const seenScenarioIds = new Set<string>();
    let valid = true;
    for (const outcome of candidate.outcomes) {
      if (!outcome.scenarioId.trim()) {
        errors.push(`${candidate.playerId} has an outcome with no scenarioId.`);
        valid = false;
      }
      if (seenScenarioIds.has(outcome.scenarioId)) {
        errors.push(`${candidate.playerId} has duplicate scenarioId ${outcome.scenarioId}.`);
        valid = false;
      }
      seenScenarioIds.add(outcome.scenarioId);
      if (!Number.isFinite(outcome.probability) || outcome.probability <= 0) {
        errors.push(`${candidate.playerId}/${outcome.scenarioId} has invalid probability.`);
        valid = false;
      }
    }
    if (!valid) continue;

    const fantasyOutcomes = candidate.outcomes.map((outcome) => ({
      scenarioId: outcome.scenarioId,
      probability: outcome.probability,
      points: scoreFantasyStatLine(
        { ...outcome.statLine, position: candidate.position },
        scoring.scoring,
      ),
    }));

    scored.push({
      ...candidate,
      sourcePlayerName: candidate.sourcePlayerName ?? null,
      fantasyOutcomes,
      distribution: summarizeDistribution(fantasyOutcomes),
    });
  }

  return { scored, errors };
}

function addEdge(graph: FlowEdge[][], from: number, edge: Omit<FlowEdge, 'rev'>) {
  const forward: FlowEdge = { ...edge, rev: graph[edge.to].length };
  const reverse: FlowEdge = {
    to: from,
    rev: graph[from].length,
    capacity: 0,
    cost: -edge.cost,
  };
  graph[from].push(forward);
  graph[edge.to].push(reverse);
}

function solveMaximumWeightAssignment(
  candidates: ScoredLineupCandidate[],
  slots: StarterSlot[],
  objective: LineupOptimizationObjective,
) {
  const playerCount = candidates.length;
  const slotCount = slots.length;
  const source = 0;
  const playerOffset = 1;
  const slotOffset = playerOffset + playerCount;
  const sink = slotOffset + slotCount;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);

  candidates.forEach((candidate, playerIndex) => {
    addEdge(graph, source, {
      to: playerOffset + playerIndex,
      capacity: 1,
      cost: 0,
    });

    slots.forEach((slot, slotIndex) => {
      if (!slot.eligiblePositions.includes(candidate.position)) return;
      addEdge(graph, playerOffset + playerIndex, {
        to: slotOffset + slotIndex,
        capacity: 1,
        cost: -objectiveValue(candidate.distribution, objective),
        playerIndex,
        slotIndex,
      });
    });
  });

  slots.forEach((_, slotIndex) => {
    addEdge(graph, slotOffset + slotIndex, {
      to: sink,
      capacity: 1,
      cost: 0,
    });
  });

  let flow = 0;
  let totalCost = 0;
  while (flow < slotCount) {
    const distance = Array(graph.length).fill(Number.POSITIVE_INFINITY);
    const prevNode = Array(graph.length).fill(-1);
    const prevEdge = Array(graph.length).fill(-1);
    distance[source] = 0;

    // Bellman-Ford is sufficient here: the graph is small (roster x starter
    // slots) and negative player->slot costs keep the implementation explicit.
    for (let iteration = 0; iteration < graph.length - 1; iteration += 1) {
      let changed = false;
      for (let node = 0; node < graph.length; node += 1) {
        if (!Number.isFinite(distance[node])) continue;
        for (let edgeIndex = 0; edgeIndex < graph[node].length; edgeIndex += 1) {
          const edge = graph[node][edgeIndex];
          if (edge.capacity <= 0) continue;
          const nextDistance = distance[node] + edge.cost;
          if (nextDistance < distance[edge.to] - 1e-9) {
            distance[edge.to] = nextDistance;
            prevNode[edge.to] = node;
            prevEdge[edge.to] = edgeIndex;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    if (!Number.isFinite(distance[sink])) break;

    let node = sink;
    while (node !== source) {
      const from = prevNode[node];
      const edgeIndex = prevEdge[node];
      const edge = graph[from][edgeIndex];
      edge.capacity -= 1;
      graph[node][edge.rev].capacity += 1;
      node = from;
    }
    flow += 1;
    totalCost += distance[sink];
  }

  const matches: Array<{ playerIndex: number; slotIndex: number }> = [];
  candidates.forEach((_, playerIndex) => {
    const node = playerOffset + playerIndex;
    for (const edge of graph[node]) {
      if (edge.playerIndex === undefined || edge.slotIndex === undefined) continue;
      if (edge.capacity === 0) {
        matches.push({ playerIndex: edge.playerIndex, slotIndex: edge.slotIndex });
      }
    }
  });

  return { flow, totalCost, matches };
}

function buildJointDistribution(
  selected: ScoredLineupCandidate[],
): FantasyDistributionSummary | null {
  if (!selected.length) return null;

  const first = new Map(
    selected[0].fantasyOutcomes.map((outcome) => [outcome.scenarioId, outcome]),
  );
  const totals: Array<{ probability: number; points: number }> = [];

  for (const [scenarioId, firstOutcome] of first) {
    let points = firstOutcome.points;
    let probability = firstOutcome.probability;
    for (let index = 1; index < selected.length; index += 1) {
      const match = selected[index].fantasyOutcomes.find(
        (outcome) => outcome.scenarioId === scenarioId,
      );
      if (!match || Math.abs(match.probability - probability) > 1e-9) return null;
      points += match.points;
    }
    totals.push({ probability, points: Number(points.toFixed(4)) });
  }

  if (selected.some((candidate) => candidate.fantasyOutcomes.length !== first.size)) return null;
  return summarizeDistribution(totals);
}

export function optimizeLeagueLineup(args: {
  scoring: ContractLeagueSnapshot['league']['scoring'];
  lineup: ContractLeagueSnapshot['league']['lineup'];
  candidates: LineupCandidate[];
  objective: LineupOptimizationObjective;
}): LineupOptimizationResult {
  const scoring = resolveLeagueScoring(args.scoring);
  if (scoring.status === 'UNAVAILABLE') {
    return {
      status: 'UNAVAILABLE',
      reason: 'SCORING_UNAVAILABLE',
      details: scoring.missingFields,
    };
  }

  const slots = expandStarterSlots(args.lineup);
  if (!slots) {
    return {
      status: 'UNAVAILABLE',
      reason: 'LINEUP_RULES_UNAVAILABLE',
      details: ['Starter slots or explicit eligible positions are missing.'],
    };
  }

  const { scored, errors } = validateAndScoreCandidates(args.candidates, scoring);
  if (errors.length) {
    return {
      status: 'UNAVAILABLE',
      reason: 'OUTCOME_DISTRIBUTION_UNAVAILABLE',
      details: errors,
    };
  }

  const orderedCandidates = [...scored].sort((a, b) => a.playerId.localeCompare(b.playerId));
  const solved = solveMaximumWeightAssignment(orderedCandidates, slots, args.objective);
  if (solved.flow < slots.length) {
    const filled = new Set(solved.matches.map((match) => match.slotIndex));
    return {
      status: 'INFEASIBLE',
      reason: 'INSUFFICIENT_ELIGIBLE_PLAYERS',
      unfilledSlots: slots.filter((_, index) => !filled.has(index)),
      scoredCandidates: orderedCandidates,
    };
  }

  const assignments = solved.matches
    .map(({ playerIndex, slotIndex }) => {
      const player = orderedCandidates[playerIndex];
      const slot = slots[slotIndex];
      return {
        slot: slot.slot,
        slotIndex: slot.slotIndex,
        eligiblePositions: slot.eligiblePositions,
        playerId: player.playerId,
        sourcePlayerName: player.sourcePlayerName ?? null,
        position: player.position,
        objectiveValue: objectiveValue(player.distribution, args.objective),
        distribution: player.distribution,
      } satisfies OptimizedLineupAssignment;
    })
    .sort((a, b) => slots.findIndex((slot) => slot.slot === a.slot && slot.slotIndex === a.slotIndex)
      - slots.findIndex((slot) => slot.slot === b.slot && slot.slotIndex === b.slotIndex));

  const selectedIds = new Set(assignments.map((assignment) => assignment.playerId));
  const selected = orderedCandidates.filter((candidate) => selectedIds.has(candidate.playerId));
  const jointDistribution = buildJointDistribution(selected);
  const warnings: string[] = [];
  if (!jointDistribution) {
    warnings.push(
      'JOINT_DISTRIBUTION_UNAVAILABLE: selected players do not share aligned scenario IDs/probabilities; player-level uncertainty is preserved but lineup-level quantiles are omitted.',
    );
  }

  return {
    status: 'READY',
    objective: args.objective,
    assignments,
    objectiveTotal: Number((-solved.totalCost).toFixed(4)),
    expectedPoints: Number(assignments.reduce(
      (sum, assignment) => sum + assignment.distribution.expected,
      0,
    ).toFixed(4)),
    jointDistribution,
    warnings,
    scoredCandidates: orderedCandidates,
  };
}
