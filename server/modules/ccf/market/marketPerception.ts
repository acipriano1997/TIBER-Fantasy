export type CCFMarketSourceFamily =
  | "crowd_market_value"
  | "startup_adp"
  | "trade_activity"
  | "expert_ranking"
  | "news"
  | "social"
  | "video_audio"
  | "league_local";

export type CCFMarketSignalKind =
  | "market_level"
  | "rank_movement"
  | "adp_movement"
  | "trade_activity"
  | "sentiment"
  | "injury_catalyst"
  | "role_catalyst";

export type CCFMarketSignalDirection = -1 | 0 | 1;

export interface CCFMarketSignalEvidence {
  contractVersion: "ccf-market-signal-evidence-v1";
  signalId: string;
  playerId: string;
  formatId: string;
  sourceId: string;
  sourceFamily: CCFMarketSourceFamily;
  signalKind: CCFMarketSignalKind;
  observedAt: string;
  knownAt: string;
  sourceRef: string;
  direction: CCFMarketSignalDirection;
  magnitude: number;
  /**
   * Optional market standing on [0, 1], normalized by a versioned source
   * adapter onto the explicitly named comparison pool. Higher always means a
   * stronger market standing. Raw provider ranks/values never enter here.
   */
  marketLevelPercentile?: number;
  marketLevelComparisonPoolId?: string;
}

export interface CCFMarketPerceptionPolicy {
  contractVersion: "ccf-market-perception-policy-v1";
  policyId: string;
  fastWindowHours: number;
  mediumWindowHours: number;
  minimumIndependentSources: number;
  sourceFamilyWeights: Record<CCFMarketSourceFamily, number>;
  collapsePolicy: "latest_per_kind_then_source_average";
}

export interface CCFMarketWindowSummary {
  windowHours: number;
  status: "available" | "insufficient";
  directionalPressure: number | null;
  marketLevelPercentile: number | null;
  marketLevelComparisonPoolId: string | null;
  rawSignalCount: number;
  independentSourceCount: number;
  independenceRatio: number;
  sourceWeightConcentration: number | null;
  sourceFamilies: CCFMarketSourceFamily[];
  sourceRefs: string[];
}

export interface CCFMarketPerceptionSnapshot {
  contractVersion: "ccf-market-perception-snapshot-v1";
  playerId: string;
  formatId: string;
  asOf: string;
  policyId: string;
  status: "available" | "insufficient";
  fast: CCFMarketWindowSummary;
  medium: CCFMarketWindowSummary;
  /**
   * Fast-window pressure minus medium-window pressure. Positive means recent
   * perception is more bullish than the broader window; negative means it is
   * cooling. This is intentionally not presented as a proprietary ADV score.
   */
  momentumDelta: number | null;
  marketLevelPercentile: number | null;
  marketLevelComparisonPoolId: string | null;
  diagnosticOnly: true;
  recommendationAuthority: "none";
}

export interface CCFMarketNeighborhoodEntry {
  playerId: string;
  marketLevelPercentile: number;
}

export interface CCFMarketNeighborhood {
  contractVersion: "ccf-market-neighborhood-v1";
  playerId: string;
  formatId: string;
  asOf: string;
  marketLevelComparisonPoolId: string;
  radius: number;
  above: CCFMarketNeighborhoodEntry[];
  target: CCFMarketNeighborhoodEntry;
  below: CCFMarketNeighborhoodEntry[];
  diagnosticOnly: true;
  recommendationAuthority: "none";
}

export class CCFMarketPerceptionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFMarketPerceptionContractError";
  }
}

const SOURCE_FAMILIES: readonly CCFMarketSourceFamily[] = [
  "crowd_market_value",
  "startup_adp",
  "trade_activity",
  "expert_ranking",
  "news",
  "social",
  "video_audio",
  "league_local",
];

function requireText(label: string, value: string): void {
  if (!value.trim()) {
    throw new CCFMarketPerceptionContractError(`${label} is required`);
  }
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFMarketPerceptionContractError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function requireUnitInterval(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new CCFMarketPerceptionContractError(`${label} must be within [0, 1]`);
  }
}

export function validateCCFMarketSignalEvidence(
  signal: CCFMarketSignalEvidence,
  asOf: string,
): CCFMarketSignalEvidence {
  if (signal.contractVersion !== "ccf-market-signal-evidence-v1") {
    throw new CCFMarketPerceptionContractError("unsupported market signal evidence version");
  }

  requireText("signalId", signal.signalId);
  requireText("playerId", signal.playerId);
  requireText("formatId", signal.formatId);
  requireText("sourceId", signal.sourceId);
  requireText("sourceRef", signal.sourceRef);

  const asOfMs = parseTimestamp("asOf", asOf);
  const observedAtMs = parseTimestamp("observedAt", signal.observedAt);
  const knownAtMs = parseTimestamp("knownAt", signal.knownAt);

  if (observedAtMs > knownAtMs) {
    throw new CCFMarketPerceptionContractError("observedAt cannot be later than knownAt");
  }
  if (knownAtMs > asOfMs) {
    throw new CCFMarketPerceptionContractError(
      "market evidence violates temporal eligibility: knownAt > asOf",
    );
  }
  if (![-1, 0, 1].includes(signal.direction)) {
    throw new CCFMarketPerceptionContractError("direction must be -1, 0, or 1");
  }

  requireUnitInterval("magnitude", signal.magnitude);
  if (signal.marketLevelPercentile != null) {
    requireUnitInterval("marketLevelPercentile", signal.marketLevelPercentile);
    requireText(
      "marketLevelComparisonPoolId",
      signal.marketLevelComparisonPoolId ?? "",
    );
  } else if (signal.marketLevelComparisonPoolId != null) {
    throw new CCFMarketPerceptionContractError(
      "marketLevelComparisonPoolId requires marketLevelPercentile",
    );
  }

  return signal;
}

export function validateCCFMarketPerceptionPolicy(
  policy: CCFMarketPerceptionPolicy,
): CCFMarketPerceptionPolicy {
  if (policy.contractVersion !== "ccf-market-perception-policy-v1") {
    throw new CCFMarketPerceptionContractError("unsupported market perception policy version");
  }
  requireText("policyId", policy.policyId);

  if (!Number.isFinite(policy.fastWindowHours) || policy.fastWindowHours <= 0) {
    throw new CCFMarketPerceptionContractError("fastWindowHours must be positive");
  }
  if (!Number.isFinite(policy.mediumWindowHours) || policy.mediumWindowHours <= 0) {
    throw new CCFMarketPerceptionContractError("mediumWindowHours must be positive");
  }
  if (policy.mediumWindowHours <= policy.fastWindowHours) {
    throw new CCFMarketPerceptionContractError("mediumWindowHours must exceed fastWindowHours");
  }
  if (
    !Number.isInteger(policy.minimumIndependentSources) ||
    policy.minimumIndependentSources <= 0
  ) {
    throw new CCFMarketPerceptionContractError(
      "minimumIndependentSources must be a positive integer",
    );
  }
  if (policy.collapsePolicy !== "latest_per_kind_then_source_average") {
    throw new CCFMarketPerceptionContractError("unsupported market signal collapse policy");
  }

  let totalWeight = 0;
  for (const family of SOURCE_FAMILIES) {
    const weight = policy.sourceFamilyWeights[family];
    if (!Number.isFinite(weight) || weight < 0) {
      throw new CCFMarketPerceptionContractError(
        `sourceFamilyWeights.${family} must be finite and non-negative`,
      );
    }
    totalWeight += weight;
  }
  if (totalWeight <= 0) {
    throw new CCFMarketPerceptionContractError(
      "source family weights must have positive total weight",
    );
  }

  return policy;
}

interface SourceComposite {
  sourceId: string;
  sourceFamily: CCFMarketSourceFamily;
  directionalValue: number;
  marketLevelPercentile: number | null;
  marketLevelComparisonPoolId: string | null;
  sourceRefs: string[];
}

function latestPerKind(
  signals: readonly CCFMarketSignalEvidence[],
): CCFMarketSignalEvidence[] {
  const latest = new Map<CCFMarketSignalKind, CCFMarketSignalEvidence>();
  const ordered = [...signals].sort((left, right) => {
    const timeDiff = Date.parse(right.knownAt) - Date.parse(left.knownAt);
    if (timeDiff !== 0) return timeDiff;
    return right.signalId.localeCompare(left.signalId);
  });

  for (const signal of ordered) {
    if (!latest.has(signal.signalKind)) {
      latest.set(signal.signalKind, signal);
    }
  }
  return [...latest.values()];
}

function buildSourceComposites(
  signals: readonly CCFMarketSignalEvidence[],
): SourceComposite[] {
  const bySource = new Map<string, CCFMarketSignalEvidence[]>();
  for (const signal of signals) {
    const current = bySource.get(signal.sourceId) ?? [];
    current.push(signal);
    bySource.set(signal.sourceId, current);
  }

  const composites: SourceComposite[] = [];
  for (const [sourceId, sourceSignals] of bySource.entries()) {
    const sourceFamilies = new Set(sourceSignals.map((signal) => signal.sourceFamily));
    if (sourceFamilies.size !== 1) {
      throw new CCFMarketPerceptionContractError(
        `sourceId ${sourceId} cannot span multiple source families in one snapshot`,
      );
    }

    const collapsed = latestPerKind(sourceSignals);
    const directionalValue =
      collapsed.reduce((sum, signal) => sum + signal.direction * signal.magnitude, 0) /
      collapsed.length;
    const levelSignals = collapsed.filter(
      (signal) => signal.marketLevelPercentile != null,
    );
    const comparisonPoolIds = new Set(
      levelSignals.map((signal) => signal.marketLevelComparisonPoolId as string),
    );
    if (comparisonPoolIds.size > 1) {
      throw new CCFMarketPerceptionContractError(
        `sourceId ${sourceId} contains incompatible market comparison pools`,
      );
    }
    const marketLevelPercentile =
      levelSignals.length === 0
        ? null
        : levelSignals.reduce(
            (sum, signal) => sum + (signal.marketLevelPercentile as number),
            0,
          ) / levelSignals.length;
    const marketLevelComparisonPoolId =
      comparisonPoolIds.size === 0 ? null : [...comparisonPoolIds][0];

    composites.push({
      sourceId,
      sourceFamily: collapsed[0].sourceFamily,
      directionalValue,
      marketLevelPercentile,
      marketLevelComparisonPoolId,
      sourceRefs: [...new Set(collapsed.map((signal) => signal.sourceRef))].sort(),
    });
  }

  return composites.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function summarizeWindow(
  allSignals: readonly CCFMarketSignalEvidence[],
  asOfMs: number,
  windowHours: number,
  policy: CCFMarketPerceptionPolicy,
): CCFMarketWindowSummary {
  const cutoffMs = asOfMs - windowHours * 60 * 60 * 1000;
  const windowSignals = allSignals.filter(
    (signal) => Date.parse(signal.knownAt) >= cutoffMs,
  );
  const composites = buildSourceComposites(windowSignals);
  const weightedComposites = composites.filter(
    (source) => policy.sourceFamilyWeights[source.sourceFamily] > 0,
  );
  const totalSourceWeight = weightedComposites.reduce(
    (sum, source) => sum + policy.sourceFamilyWeights[source.sourceFamily],
    0,
  );
  const independentSourceCount = weightedComposites.length;
  const status =
    independentSourceCount >= policy.minimumIndependentSources && totalSourceWeight > 0
      ? "available"
      : "insufficient";

  const directionalPressure =
    totalSourceWeight <= 0
      ? null
      : weightedComposites.reduce(
          (sum, source) =>
            sum + source.directionalValue * policy.sourceFamilyWeights[source.sourceFamily],
          0,
        ) / totalSourceWeight;

  const levelComposites = weightedComposites.filter(
    (source) => source.marketLevelPercentile != null,
  );
  const comparisonPoolIds = new Set(
    levelComposites.map((source) => source.marketLevelComparisonPoolId as string),
  );
  if (comparisonPoolIds.size > 1) {
    throw new CCFMarketPerceptionContractError(
      "market level evidence cannot combine incompatible comparison pools",
    );
  }
  const marketLevelComparisonPoolId =
    comparisonPoolIds.size === 0 ? null : [...comparisonPoolIds][0];
  const totalLevelWeight = levelComposites.reduce(
    (sum, source) => sum + policy.sourceFamilyWeights[source.sourceFamily],
    0,
  );
  const marketLevelPercentile =
    totalLevelWeight <= 0
      ? null
      : levelComposites.reduce(
          (sum, source) =>
            sum +
            (source.marketLevelPercentile as number) *
              policy.sourceFamilyWeights[source.sourceFamily],
          0,
        ) / totalLevelWeight;

  const sourceWeightConcentration =
    totalSourceWeight <= 0
      ? null
      : weightedComposites.reduce((sum, source) => {
          const share = policy.sourceFamilyWeights[source.sourceFamily] / totalSourceWeight;
          return sum + share * share;
        }, 0);

  return {
    windowHours,
    status,
    directionalPressure,
    marketLevelPercentile,
    marketLevelComparisonPoolId,
    rawSignalCount: windowSignals.length,
    independentSourceCount,
    independenceRatio:
      windowSignals.length === 0 ? 0 : independentSourceCount / windowSignals.length,
    sourceWeightConcentration,
    sourceFamilies: [
      ...new Set(weightedComposites.map((source) => source.sourceFamily)),
    ].sort(),
    sourceRefs: [
      ...new Set(weightedComposites.flatMap((source) => source.sourceRefs)),
    ].sort(),
  };
}

export function buildCCFMarketPerceptionSnapshot(
  signals: readonly CCFMarketSignalEvidence[],
  asOf: string,
  policy: CCFMarketPerceptionPolicy,
): CCFMarketPerceptionSnapshot {
  validateCCFMarketPerceptionPolicy(policy);
  const asOfMs = parseTimestamp("asOf", asOf);
  if (signals.length === 0) {
    throw new CCFMarketPerceptionContractError("at least one market signal is required");
  }

  const signalIds = new Set<string>();
  let playerId: string | null = null;
  let formatId: string | null = null;
  const sourceFamilyById = new Map<string, CCFMarketSourceFamily>();

  for (const signal of signals) {
    validateCCFMarketSignalEvidence(signal, asOf);
    if (signalIds.has(signal.signalId)) {
      throw new CCFMarketPerceptionContractError(`duplicate signalId ${signal.signalId}`);
    }
    signalIds.add(signal.signalId);

    playerId ??= signal.playerId;
    formatId ??= signal.formatId;
    if (signal.playerId !== playerId) {
      throw new CCFMarketPerceptionContractError(
        "all market signals must refer to one player",
      );
    }
    if (signal.formatId !== formatId) {
      throw new CCFMarketPerceptionContractError(
        "all market signals must use one formatId",
      );
    }

    const knownFamily = sourceFamilyById.get(signal.sourceId);
    if (knownFamily != null && knownFamily !== signal.sourceFamily) {
      throw new CCFMarketPerceptionContractError(
        `sourceId ${signal.sourceId} cannot span multiple source families`,
      );
    }
    sourceFamilyById.set(signal.sourceId, signal.sourceFamily);
  }

  const fast = summarizeWindow(signals, asOfMs, policy.fastWindowHours, policy);
  const medium = summarizeWindow(signals, asOfMs, policy.mediumWindowHours, policy);
  const momentumDelta =
    fast.status === "available" &&
    medium.status === "available" &&
    fast.directionalPressure != null &&
    medium.directionalPressure != null
      ? fast.directionalPressure - medium.directionalPressure
      : null;
  const marketLevelPercentile =
    medium.status === "available" ? medium.marketLevelPercentile : null;
  const marketLevelComparisonPoolId =
    marketLevelPercentile == null ? null : medium.marketLevelComparisonPoolId;

  return {
    contractVersion: "ccf-market-perception-snapshot-v1",
    playerId: playerId as string,
    formatId: formatId as string,
    asOf,
    policyId: policy.policyId,
    status: medium.status,
    fast,
    medium,
    momentumDelta,
    marketLevelPercentile,
    marketLevelComparisonPoolId,
    diagnosticOnly: true,
    recommendationAuthority: "none",
  };
}

export function buildCCFMarketNeighborhood(
  targetPlayerId: string,
  snapshots: readonly CCFMarketPerceptionSnapshot[],
  radius = 2,
): CCFMarketNeighborhood {
  requireText("targetPlayerId", targetPlayerId);
  if (!Number.isInteger(radius) || radius <= 0) {
    throw new CCFMarketPerceptionContractError(
      "market neighborhood radius must be positive",
    );
  }
  if (snapshots.length === 0) {
    throw new CCFMarketPerceptionContractError(
      "market neighborhood requires snapshots",
    );
  }

  const formatId = snapshots[0].formatId;
  const asOf = snapshots[0].asOf;
  const playerIds = new Set<string>();
  const comparisonPoolIds = new Set<string>();
  const eligible: CCFMarketNeighborhoodEntry[] = [];

  for (const snapshot of snapshots) {
    if (snapshot.formatId !== formatId || snapshot.asOf !== asOf) {
      throw new CCFMarketPerceptionContractError(
        "market neighborhood snapshots must share formatId and asOf",
      );
    }
    if (snapshot.recommendationAuthority !== "none" || !snapshot.diagnosticOnly) {
      throw new CCFMarketPerceptionContractError(
        "market neighborhood accepts diagnostic-only market snapshots",
      );
    }
    if (playerIds.has(snapshot.playerId)) {
      throw new CCFMarketPerceptionContractError(
        `duplicate player snapshot ${snapshot.playerId}`,
      );
    }
    playerIds.add(snapshot.playerId);

    if (snapshot.marketLevelPercentile != null) {
      requireUnitInterval(
        "snapshot.marketLevelPercentile",
        snapshot.marketLevelPercentile,
      );
      requireText(
        "snapshot.marketLevelComparisonPoolId",
        snapshot.marketLevelComparisonPoolId ?? "",
      );
      comparisonPoolIds.add(snapshot.marketLevelComparisonPoolId as string);
      eligible.push({
        playerId: snapshot.playerId,
        marketLevelPercentile: snapshot.marketLevelPercentile,
      });
    }
  }

  if (comparisonPoolIds.size > 1) {
    throw new CCFMarketPerceptionContractError(
      "market neighborhood snapshots must share one comparison pool",
    );
  }
  if (comparisonPoolIds.size === 0) {
    throw new CCFMarketPerceptionContractError(
      "market neighborhood requires an eligible market comparison pool",
    );
  }
  const marketLevelComparisonPoolId = [...comparisonPoolIds][0];

  eligible.sort((left, right) => {
    const levelDiff = right.marketLevelPercentile - left.marketLevelPercentile;
    if (levelDiff !== 0) return levelDiff;
    return left.playerId.localeCompare(right.playerId);
  });

  const targetIndex = eligible.findIndex((entry) => entry.playerId === targetPlayerId);
  if (targetIndex < 0) {
    throw new CCFMarketPerceptionContractError(
      "target player lacks an eligible market level for neighborhood construction",
    );
  }

  return {
    contractVersion: "ccf-market-neighborhood-v1",
    playerId: targetPlayerId,
    formatId,
    asOf,
    marketLevelComparisonPoolId,
    radius,
    above: eligible.slice(Math.max(0, targetIndex - radius), targetIndex),
    target: eligible[targetIndex],
    below: eligible.slice(targetIndex + 1, targetIndex + 1 + radius),
    diagnosticOnly: true,
    recommendationAuthority: "none",
  };
}
