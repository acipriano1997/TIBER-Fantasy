import {
  buildDraftSeasonOutcomeBands,
  type DraftSeasonOutcomeArtifact,
  type DraftSeasonOutcomeBands,
} from './draftSeasonOutcomeContract';

export type EspnDraftSeasonOutcomeContext = {
  season: number;
  scoringProfileRef: string;
  scoringProfileHash: string;
  asOf: string;
};

export type EspnDraftPlayerIdentity = {
  /** ESPN provider-local ID. Never use this as a Forecast canonical ID. */
  espnPlayerId: string;
  /** Governed crosswalk result. Null means Forecast evidence must fail closed. */
  canonicalPlayerId: string | null;
};

export type EspnDraftPlayerWithSeasonOutcome<T extends EspnDraftPlayerIdentity> = T & {
  seasonOutcome: DraftSeasonOutcomeBands;
};

function unavailable(blockers: string[]): DraftSeasonOutcomeBands {
  return {
    status: 'unavailable',
    low: null,
    median: null,
    high: null,
    lowPercentile: null,
    medianPercentile: null,
    highPercentile: null,
    modelVersion: null,
    calibrationVersion: null,
    backtestVersion: null,
    supportedPopulation: null,
    generatedAt: null,
    blockers,
  };
}

/**
 * Attach a season-outcome state to every ESPN draftable player row.
 *
 * This function is intentionally pure and linear in the number of rows/artifacts.
 * Draft surfaces should load/cache the promoted bulk artifact once, then use this
 * applicator rather than triggering per-player model work during the live draft.
 */
export function attachSeasonOutcomesToEspnDraftPlayers<T extends EspnDraftPlayerIdentity>(
  players: readonly T[],
  artifacts: readonly DraftSeasonOutcomeArtifact[],
  context: EspnDraftSeasonOutcomeContext,
): Array<EspnDraftPlayerWithSeasonOutcome<T>> {
  const byCanonicalPlayerId = new Map<string, DraftSeasonOutcomeArtifact>();
  const duplicates = new Set<string>();

  for (const artifact of artifacts) {
    if (byCanonicalPlayerId.has(artifact.playerId)) duplicates.add(artifact.playerId);
    byCanonicalPlayerId.set(artifact.playerId, artifact);
  }

  return players.map((player) => {
    if (!player.canonicalPlayerId) {
      return {
        ...player,
        seasonOutcome: unavailable(['canonical_player_identity_missing']),
      };
    }

    if (duplicates.has(player.canonicalPlayerId)) {
      return {
        ...player,
        seasonOutcome: unavailable(['duplicate_season_outcome_artifact']),
      };
    }

    const artifact = byCanonicalPlayerId.get(player.canonicalPlayerId) ?? null;
    return {
      ...player,
      seasonOutcome: buildDraftSeasonOutcomeBands(artifact, {
        playerId: player.canonicalPlayerId,
        season: context.season,
        scoringProfileRef: context.scoringProfileRef,
        scoringProfileHash: context.scoringProfileHash,
        asOf: context.asOf,
      }),
    };
  });
}
