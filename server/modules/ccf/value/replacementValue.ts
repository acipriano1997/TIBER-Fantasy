export type CCFReplacementPosition = "QB" | "RB" | "WR" | "TE";

export interface CCFProjectedPlayerValue {
  playerId: string;
  position: CCFReplacementPosition;
  projectedPoints: number;
}

export interface CCFLeagueReplacementConfig {
  managerCount: number;
  startersByPosition: Record<CCFReplacementPosition, number>;
  flexStartersPerManager: number;
  flexEligiblePositions: readonly CCFReplacementPosition[];
}

export interface CCFReplacementBaseline {
  position: CCFReplacementPosition;
  starterDemand: number;
  flexAllocatedStarters: number;
  replacementRankWithinPosition: number;
  replacementPlayerId: string | null;
  replacementPoints: number | null;
}

export interface CCFVorpValue {
  playerId: string;
  position: CCFReplacementPosition;
  projectedPoints: number;
  replacementPoints: number | null;
  vorp: number | null;
}

function assertNonNegativeInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

export function validateCCFLeagueReplacementConfig(
  config: CCFLeagueReplacementConfig,
): CCFLeagueReplacementConfig {
  if (!Number.isInteger(config.managerCount) || config.managerCount < 1) {
    throw new Error("managerCount must be a positive integer");
  }
  assertNonNegativeInteger("flexStartersPerManager", config.flexStartersPerManager);

  for (const position of ["QB", "RB", "WR", "TE"] as const) {
    assertNonNegativeInteger(`startersByPosition.${position}`, config.startersByPosition[position]);
  }

  const uniqueFlex = new Set(config.flexEligiblePositions);
  if (uniqueFlex.size !== config.flexEligiblePositions.length) {
    throw new Error("flexEligiblePositions must not contain duplicates");
  }

  return config;
}

function validatePlayers(players: readonly CCFProjectedPlayerValue[]): void {
  const ids = new Set<string>();
  for (const player of players) {
    if (!player.playerId.trim()) throw new Error("playerId is required");
    if (ids.has(player.playerId)) throw new Error(`duplicate playerId ${player.playerId}`);
    ids.add(player.playerId);
    if (!Number.isFinite(player.projectedPoints)) {
      throw new Error(`projectedPoints must be finite for ${player.playerId}`);
    }
  }
}

export function calculateCCFReplacementBaselines(
  players: readonly CCFProjectedPlayerValue[],
  config: CCFLeagueReplacementConfig,
): CCFReplacementBaseline[] {
  validateCCFLeagueReplacementConfig(config);
  validatePlayers(players);

  const positions = ["QB", "RB", "WR", "TE"] as const;
  const sortedByPosition = new Map<CCFReplacementPosition, CCFProjectedPlayerValue[]>();
  const coreSelected = new Set<string>();
  const starterDemand = new Map<CCFReplacementPosition, number>();

  for (const position of positions) {
    const sorted = players
      .filter((player) => player.position === position)
      .sort((a, b) => b.projectedPoints - a.projectedPoints || a.playerId.localeCompare(b.playerId));
    sortedByPosition.set(position, sorted);

    const demand = config.managerCount * config.startersByPosition[position];
    starterDemand.set(position, demand);
    for (const player of sorted.slice(0, demand)) coreSelected.add(player.playerId);
  }

  const flexSlots = config.managerCount * config.flexStartersPerManager;
  const flexPool = players
    .filter(
      (player) =>
        config.flexEligiblePositions.includes(player.position) && !coreSelected.has(player.playerId),
    )
    .sort((a, b) => b.projectedPoints - a.projectedPoints || a.playerId.localeCompare(b.playerId));
  const flexSelected = new Set(flexPool.slice(0, flexSlots).map((player) => player.playerId));

  return positions.map((position) => {
    const sorted = sortedByPosition.get(position) ?? [];
    const baseDemand = starterDemand.get(position) ?? 0;
    const flexAllocated = sorted.filter((player) => flexSelected.has(player.playerId)).length;
    const startersAtPosition = baseDemand + flexAllocated;
    const replacementIndex = startersAtPosition;
    const replacement = sorted[replacementIndex] ?? null;

    return {
      position,
      starterDemand: baseDemand,
      flexAllocatedStarters: flexAllocated,
      replacementRankWithinPosition: replacementIndex + 1,
      replacementPlayerId: replacement?.playerId ?? null,
      replacementPoints: replacement?.projectedPoints ?? null,
    };
  });
}

export function calculateCCFVorp(
  players: readonly CCFProjectedPlayerValue[],
  baselines: readonly CCFReplacementBaseline[],
): CCFVorpValue[] {
  const baselineByPosition = new Map(baselines.map((baseline) => [baseline.position, baseline]));

  return players.map((player) => {
    const baseline = baselineByPosition.get(player.position);
    const replacementPoints = baseline?.replacementPoints ?? null;
    return {
      playerId: player.playerId,
      position: player.position,
      projectedPoints: player.projectedPoints,
      replacementPoints,
      vorp: replacementPoints == null ? null : player.projectedPoints - replacementPoints,
    };
  });
}
