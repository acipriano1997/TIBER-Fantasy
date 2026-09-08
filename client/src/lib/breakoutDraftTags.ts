export type BreakoutDraftTag = {
  playerId: string | null;
  playerName: string;
  team: string | null;
  targetSeason: number;
  label: string;
  candidateRank: number | null;
  finalSignalScore: number | null;
  breakoutContext: string | null;
  modelVersion: string | null;
  generatedAt: string | null;
};

export type BreakoutDraftIdentity = {
  /**
   * Only provide this when the caller knows the identifier is in the same canonical
   * namespace as Signal-Validation-Model. Do not pass platform-local ESPN/Sleeper ids.
   */
  canonicalPlayerId?: string | null;
  name: string;
  team?: string | null;
};

export type BreakoutDraftTagsResult =
  | {
      status: 'active';
      targetSeason: number;
      tags: BreakoutDraftTag[];
      promotion: unknown;
      freshness: unknown;
    }
  | {
      status: 'inactive';
      targetSeason: number;
      reason: 'not_found' | 'not_promoted' | 'upstream_unavailable';
    }
  | {
      status: 'error';
      targetSeason: number;
      code: string | null;
      message: string;
    };

const INACTIVE_HTTP_STATUSES = new Set([404, 409, 503]);

function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeTeam(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? '';
  return normalized || null;
}

function normalizeId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isBreakoutDraftTag(value: unknown): value is BreakoutDraftTag {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BreakoutDraftTag>;
  return (
    isNullableString(candidate.playerId) &&
    typeof candidate.playerName === 'string' &&
    candidate.playerName.trim().length > 0 &&
    isNullableString(candidate.team) &&
    typeof candidate.targetSeason === 'number' &&
    Number.isInteger(candidate.targetSeason) &&
    typeof candidate.label === 'string' &&
    candidate.label.trim().length > 0 &&
    isNullableFiniteNumber(candidate.candidateRank) &&
    isNullableFiniteNumber(candidate.finalSignalScore) &&
    isNullableString(candidate.breakoutContext) &&
    isNullableString(candidate.modelVersion) &&
    isNullableString(candidate.generatedAt)
  );
}

/**
 * Match promoted evidence to a draft player without crossing opaque platform-id namespaces.
 * Exact canonical ids win. Otherwise name+team fallback must be complete and unique.
 */
export function findBreakoutDraftTag(
  identity: BreakoutDraftIdentity,
  tags: BreakoutDraftTag[],
): BreakoutDraftTag | null {
  const canonicalPlayerId = normalizeId(identity.canonicalPlayerId);

  if (canonicalPlayerId) {
    const exactMatches = tags.filter((tag) => normalizeId(tag.playerId) === canonicalPlayerId);
    if (exactMatches.length === 1) return exactMatches[0];
    if (exactMatches.length > 1) return null;
  }

  const name = normalizeName(identity.name);
  const team = normalizeTeam(identity.team);
  if (!name || !team) return null;

  const fallbackMatches = tags.filter((tag) => {
    if (normalizeName(tag.playerName) !== name || normalizeTeam(tag.team) !== team) return false;

    // If a caller supplied a canonical id, never override a conflicting canonical id
    // using a fuzzy platform-independent fallback. Missing tag ids can still fall back.
    if (canonicalPlayerId && normalizeId(tag.playerId) && normalizeId(tag.playerId) !== canonicalPlayerId) {
      return false;
    }

    return true;
  });

  return fallbackMatches.length === 1 ? fallbackMatches[0] : null;
}

export async function fetchBreakoutDraftTags(
  targetSeason: number,
  fetchImpl: typeof fetch = fetch,
): Promise<BreakoutDraftTagsResult> {
  const response = await fetchImpl(`/api/data-lab/breakout-signals/draft-tags?season=${targetSeason}`);
  const payload = await response.json().catch(() => ({})) as {
    success?: boolean;
    code?: string;
    error?: string;
    data?: {
      targetSeason?: number;
      tags?: unknown[];
      promotion?: unknown;
      freshness?: unknown;
    };
  };

  if (!response.ok) {
    if (INACTIVE_HTTP_STATUSES.has(response.status)) {
      const reason = payload.code === 'not_promoted'
        ? 'not_promoted'
        : response.status === 503
          ? 'upstream_unavailable'
          : 'not_found';
      return { status: 'inactive', targetSeason, reason };
    }

    return {
      status: 'error',
      targetSeason,
      code: payload.code ?? null,
      message: payload.error ?? `Breakout draft tags failed to load (HTTP ${response.status}).`,
    };
  }

  const tags = Array.isArray(payload.data?.tags)
    ? payload.data.tags.filter(isBreakoutDraftTag)
    : [];

  return {
    status: 'active',
    targetSeason: payload.data?.targetSeason ?? targetSeason,
    tags,
    promotion: payload.data?.promotion ?? null,
    freshness: payload.data?.freshness ?? null,
  };
}
