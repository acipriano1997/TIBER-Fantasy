import { optimizeLeagueLineup, type LineupCandidate } from '../lineupOptimizer';
import type { ContractLeagueSnapshot } from '../contracts';

const baseScoring: NonNullable<ContractLeagueSnapshot['league']['scoring']> = {
  passYardsPerPoint: 25,
  passTd: 4,
  interceptionThrown: -2,
  rushYardsPerPoint: 10,
  rushTd: 6,
  reception: 1,
  receivingYardsPerPoint: 10,
  receivingTd: 6,
  teReceptionBonus: 0,
  fumbleLost: -2,
  twoPointConversion: 2,
};

const lineup: ContractLeagueSnapshot['league']['lineup'] = [
  { slot: 'QB', count: 1, eligiblePositions: ['QB'] },
  { slot: 'RB', count: 1, eligiblePositions: ['RB'] },
  { slot: 'WR', count: 1, eligiblePositions: ['WR'] },
  { slot: 'TE', count: 1, eligiblePositions: ['TE'] },
  { slot: 'FLEX', count: 1, eligiblePositions: ['RB', 'WR', 'TE'] },
  { slot: 'SUPERFLEX', count: 1, eligiblePositions: ['QB', 'RB', 'WR', 'TE'] },
  { slot: 'BENCH', count: 8, eligiblePositions: ['QB', 'RB', 'WR', 'TE'] },
];

function constantCandidate(
  playerId: string,
  position: LineupCandidate['position'],
  statLine: Record<string, number>,
): LineupCandidate {
  return {
    playerId,
    sourcePlayerName: playerId,
    position,
    available: true,
    outcomes: [
      { scenarioId: 's1', probability: 0.5, statLine },
      { scenarioId: 's2', probability: 0.5, statLine },
    ],
  };
}

function completeRoster(): LineupCandidate[] {
  return [
    constantCandidate('qb-a', 'QB', { passing_yards: 250, passing_tds: 2 }),
    constantCandidate('qb-b', 'QB', { passing_yards: 225, passing_tds: 2 }),
    constantCandidate('rb-a', 'RB', { rushing_yards: 90, receptions: 3, receiving_yards: 20 }),
    constantCandidate('rb-b', 'RB', { rushing_yards: 70, receptions: 4, receiving_yards: 30 }),
    constantCandidate('wr-a', 'WR', { receptions: 7, receiving_yards: 90 }),
    constantCandidate('wr-b', 'WR', { receptions: 6, receiving_yards: 80 }),
    constantCandidate('te-a', 'TE', { receptions: 5, receiving_yards: 60 }),
  ];
}

describe('league scoring legal lineup optimizer', () => {
  it('solves explicit QB/FLEX/SUPERFLEX eligibility without counting bench slots', () => {
    const result = optimizeLeagueLineup({
      scoring: baseScoring,
      lineup,
      candidates: completeRoster(),
      objective: 'EXPECTED',
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;

    expect(result.assignments).toHaveLength(6);
    expect(result.assignments.filter((assignment) => assignment.position === 'QB')).toHaveLength(2);
    expect(result.assignments.find((assignment) => assignment.slot === 'SUPERFLEX')?.position).toBe('QB');
    expect(result.assignments.every((assignment) => assignment.slot !== 'BENCH')).toBe(true);
  });

  it('changes QB fantasy value under the same football outcomes when passing-TD scoring changes', () => {
    const candidates = completeRoster();
    const fourPoint = optimizeLeagueLineup({
      scoring: baseScoring,
      lineup,
      candidates,
      objective: 'EXPECTED',
    });
    const sixPoint = optimizeLeagueLineup({
      scoring: { ...baseScoring, passTd: 6 },
      lineup,
      candidates,
      objective: 'EXPECTED',
    });

    expect(fourPoint.status).toBe('READY');
    expect(sixPoint.status).toBe('READY');
    if (fourPoint.status !== 'READY' || sixPoint.status !== 'READY') return;

    const qbFour = fourPoint.scoredCandidates.find((candidate) => candidate.playerId === 'qb-a')!;
    const qbSix = sixPoint.scoredCandidates.find((candidate) => candidate.playerId === 'qb-a')!;
    expect(qbSix.distribution.expected - qbFour.distribution.expected).toBe(4);
  });

  it('applies TE reception premium only to tight ends and can change the optimal flex', () => {
    const candidates = [
      constantCandidate('rb-a', 'RB', { rushing_yards: 80, receptions: 3, receiving_yards: 20 }),
      constantCandidate('te-a', 'TE', { receptions: 8, receiving_yards: 40 }),
    ];
    const oneFlex: ContractLeagueSnapshot['league']['lineup'] = [
      { slot: 'FLEX', count: 1, eligiblePositions: ['RB', 'TE'] },
    ];

    const noPremium = optimizeLeagueLineup({
      scoring: baseScoring,
      lineup: oneFlex,
      candidates,
      objective: 'EXPECTED',
    });
    const premium = optimizeLeagueLineup({
      scoring: { ...baseScoring, teReceptionBonus: 1 },
      lineup: oneFlex,
      candidates,
      objective: 'EXPECTED',
    });

    expect(noPremium.status).toBe('READY');
    expect(premium.status).toBe('READY');
    if (noPremium.status !== 'READY' || premium.status !== 'READY') return;

    expect(noPremium.assignments[0].playerId).toBe('rb-a');
    expect(premium.assignments[0].playerId).toBe('te-a');
  });

  it('lets CCF choose an explicit floor or ceiling objective instead of hiding a risk preference', () => {
    const safe: LineupCandidate = {
      playerId: 'safe-wr',
      position: 'WR',
      available: true,
      outcomes: [
        { scenarioId: 'low', probability: 0.5, statLine: { receptions: 6, receiving_yards: 60 } },
        { scenarioId: 'high', probability: 0.5, statLine: { receptions: 6, receiving_yards: 60 } },
      ],
    };
    const volatile: LineupCandidate = {
      playerId: 'volatile-wr',
      position: 'WR',
      available: true,
      outcomes: [
        { scenarioId: 'low', probability: 0.5, statLine: { receptions: 1, receiving_yards: 10 } },
        { scenarioId: 'high', probability: 0.5, statLine: { receptions: 10, receiving_yards: 160, receiving_tds: 1 } },
      ],
    };
    const oneWr: ContractLeagueSnapshot['league']['lineup'] = [
      { slot: 'WR', count: 1, eligiblePositions: ['WR'] },
    ];

    const floor = optimizeLeagueLineup({
      scoring: baseScoring,
      lineup: oneWr,
      candidates: [safe, volatile],
      objective: 'P10',
    });
    const ceiling = optimizeLeagueLineup({
      scoring: baseScoring,
      lineup: oneWr,
      candidates: [safe, volatile],
      objective: 'P90',
    });

    expect(floor.status).toBe('READY');
    expect(ceiling.status).toBe('READY');
    if (floor.status !== 'READY' || ceiling.status !== 'READY') return;

    expect(floor.assignments[0].playerId).toBe('safe-wr');
    expect(ceiling.assignments[0].playerId).toBe('volatile-wr');
  });

  it('produces a lineup-level joint distribution only when scenario IDs/probabilities align', () => {
    const aligned = optimizeLeagueLineup({
      scoring: baseScoring,
      lineup,
      candidates: completeRoster(),
      objective: 'EXPECTED',
    });

    expect(aligned.status).toBe('READY');
    if (aligned.status !== 'READY') return;
    expect(aligned.jointDistribution).not.toBeNull();
    expect(aligned.warnings).toHaveLength(0);

    const misaligned = completeRoster();
    misaligned[0].outcomes[1].scenarioId = 'different-scenario';
    const result = optimizeLeagueLineup({
      scoring: baseScoring,
      lineup,
      candidates: misaligned,
      objective: 'EXPECTED',
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.jointDistribution).toBeNull();
    expect(result.warnings[0]).toContain('JOINT_DISTRIBUTION_UNAVAILABLE');
  });

  it('fails closed when scoring is unavailable', () => {
    const result = optimizeLeagueLineup({
      scoring: null,
      lineup,
      candidates: completeRoster(),
      objective: 'EXPECTED',
    });

    expect(result).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'SCORING_UNAVAILABLE',
    });
  });

  it('fails closed when starter eligibility is not explicit', () => {
    const result = optimizeLeagueLineup({
      scoring: baseScoring,
      lineup: [{ slot: 'SUPERFLEX', count: 1, eligiblePositions: [] }],
      candidates: completeRoster(),
      objective: 'EXPECTED',
    });

    expect(result).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'LINEUP_RULES_UNAVAILABLE',
    });
  });

  it('returns the exact unfilled legal slot when the roster cannot satisfy the lineup', () => {
    const result = optimizeLeagueLineup({
      scoring: baseScoring,
      lineup: [
        { slot: 'QB', count: 1, eligiblePositions: ['QB'] },
        { slot: 'TE', count: 1, eligiblePositions: ['TE'] },
      ],
      candidates: [constantCandidate('qb-only', 'QB', { passing_yards: 200 })],
      objective: 'EXPECTED',
    });

    expect(result.status).toBe('INFEASIBLE');
    if (result.status !== 'INFEASIBLE') return;
    expect(result.unfilledSlots).toEqual([
      { slot: 'TE', slotIndex: 1, eligiblePositions: ['TE'] },
    ]);
  });
});
