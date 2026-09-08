export type BreakoutProbabilitySet = {
  primary: number;
  primaryTarget: string;
  top12Next4w: number | null;
  top24Next4w: number | null;
  rosTierJump: number | null;
  adpOutperformance12Slots: number | null;
  roleExpansion: number | null;
};

export type BreakoutDraftTag = {
  playerId: string | null;
  playerName: string;
  team: string | null;
  targetSeason: number;
  label: string;
  displayLabel: string;
  probability: {
    value: number;
    percent: number;
    target: string;
  };
  probabilities: BreakoutProbabilitySet;
  candidateRank: number | null;
  finalSignalScore: number | null;
  breakoutContext: string | null;
  modelVersion: string | null;
  generatedAt: string | null;
  evidenceStatus?: 'provisional_research_only' | 'certified_promoted';
  signalKind?: 'breakout' | 'rebound';
};

export type BreakoutDraftIdentity = {
  /**
   * Only provide this when the caller knows the identifier is in the same canonical
   * namespace as the breakout producer. Do not pass platform-local ESPN/Sleeper ids.
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
      source: 'certified' | 'provisional';
      promotion: unknown;
      freshness: unknown;
      validation?: unknown;
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

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isBreakoutDraftTag(value: unknown): value is BreakoutDraftTag {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BreakoutDraftTag>;
  const probability = candidate.probability;
  const probabilities = candidate.probabilities;
  const statusOk = candidate.evidenceStatus === undefined ||
    candidate.evidenceStatus === 'provisional_research_only' ||
    candidate.evidenceStatus === 'certified_promoted';
  const kindOk = candidate.signalKind === undefined ||
    candidate.signalKind === 'breakout' ||
    candidate.signalKind === 'rebound';

  return (
    isNullableString(candidate.playerId) &&
    typeof candidate.playerName === 'string' && candidate.playerName.trim().length > 0 &&
    isNullableString(candidate.team) &&
    typeof candidate.targetSeason === 'number' && Number.isInteger(candidate.targetSeason) &&
    typeof candidate.label === 'string' && candidate.label.trim().length > 0 &&
    typeof candidate.displayLabel === 'string' && candidate.displayLabel.trim().length > 0 &&
    !!probability && isProbability(probability.value) &&
    typeof probability.percent === 'number' && Number.isInteger(probability.percent) &&
    probability.percent >= 0 && probability.percent <= 100 &&
    Math.round(probability.value * 100) === probability.percent &&
    typeof probability.target === 'string' && probability.target.trim().length > 0 &&
    !!probabilities && isProbability(probabilities.primary) &&
    probabilities.primaryTarget === probability.target &&
    Math.abs(probabilities.primary - probability.value) <= 1e-12 &&
    isNullableFiniteNumber(probabilities.top12Next4w) &&
    isNullableFiniteNumber(probabilities.top24Next4w) &&
    isNullableFiniteNumber(probabilities.rosTierJump) &&
    isNullableFiniteNumber(probabilities.adpOutperformance12Slots) &&
    isNullableFiniteNumber(probabilities.roleExpansion) &&
    isNullableFiniteNumber(candidate.candidateRank) &&
    isNullableFiniteNumber(candidate.finalSignalScore) &&
    isNullableString(candidate.breakoutContext) &&
    isNullableString(candidate.modelVersion) &&
    isNullableString(candidate.generatedAt) &&
    statusOk && kindOk
  );
}

function parseTags(value: unknown, targetSeason: number): BreakoutDraftTag[] | null {
  if (!Array.isArray(value) || !value.every(isBreakoutDraftTag)) return null;
  if (!value.every((tag) => tag.targetSeason === targetSeason)) return null;
  return value;
}

function inactiveReason(responseStatus: number, code?: string): 'not_found' | 'not_promoted' | 'upstream_unavailable' {
  if (code === 'not_promoted') return 'not_promoted';
  if (responseStatus === 503) return 'upstream_unavailable';
  return 'not_found';
}

/**
 * Match evidence to a draft player without crossing opaque platform-id namespaces.
 * Exact canonical ids win. Certified evidence otherwise requires unique name+team.
 * The explicitly provisional draft-night lane may use unique name-only fallback when
 * team context has changed since the frozen 2025 feature season.
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
  if (!name) return null;

  if (team) {
    const teamMatches = tags.filter((tag) => {
      if (normalizeName(tag.playerName) !== name || normalizeTeam(tag.team) !== team) return false;
      if (canonicalPlayerId && normalizeId(tag.playerId) && normalizeId(tag.playerId) !== canonicalPlayerId) {
        return false;
      }
      return true;
    });
    if (teamMatches.length === 1) return teamMatches[0];
    if (teamMatches.length > 1) return null;
  }

  if (canonicalPlayerId) return null;

  const nameMatches = tags.filter((tag) =>
    tag.evidenceStatus === 'provisional_research_only' && normalizeName(tag.playerName) === name,
  );
  return nameMatches.length === 1 ? nameMatches[0] : null;
}

async function fetchProvisionalTags(
  targetSeason: number,
  fetchImpl: typeof fetch,
): Promise<BreakoutDraftTagsResult | null> {
  const response = await fetchImpl(`/api/data-lab/breakout-signals/draft-tags/provisional?season=${targetSeason}`);
  const payload = await response.json().catch(() => ({})) as {
    success?: boolean;
    code?: string;
    error?: string;
    data?: {
      targetSeason?: number;
      tags?: unknown;
      validation?: unknown;
    };
  };

  if (!response.ok) {
    if (INACTIVE_HTTP_STATUSES.has(response.status)) return null;
    return {
      status: 'error',
      targetSeason,
      code: payload.code ?? null,
      message: payload.error ?? `Provisional breakout draft tags failed to load (HTTP ${response.status}).`,
    };
  }

  if (payload.data?.targetSeason !== targetSeason) {
    return {
      status: 'error',
      targetSeason,
      code: 'invalid_payload',
      message: 'Provisional breakout draft-tag response targeted the wrong season.',
    };
  }

  const tags = parseTags(payload.data.tags, targetSeason);
  if (tags === null || !tags.every((tag) => tag.evidenceStatus === 'provisional_research_only')) {
    return {
      status: 'error',
      targetSeason,
      code: 'invalid_payload',
      message: 'Provisional breakout draft-tag response failed the client evidence contract.',
    };
  }

  return {
    status: 'active',
    targetSeason,
    tags,
    source: 'provisional',
    promotion: null,
    freshness: null,
    validation: payload.data.validation ?? null,
  };
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
      tags?: unknown;
      promotion?: unknown;
      freshness?: unknown;
    };
  };

  if (response.ok) {
    if (payload.data?.targetSeason !== targetSeason) {
      return {
        status: 'error',
        targetSeason,
        code: 'invalid_payload',
        message: 'Certified breakout draft-tag response targeted the wrong season.',
      };
    }

    const tags = parseTags(payload.data.tags, targetSeason);
    if (tags === null) {
      return {
        status: 'error',
        targetSeason,
        code: 'invalid_payload',
        message: 'Certified breakout draft-tag response failed the client evidence contract.',
      };
    }

    return {
      status: 'active',
      targetSeason,
      tags: tags.map((tag) => ({ ...tag, evidenceStatus: tag.evidenceStatus ?? 'certified_promoted' })),
      source: 'certified',
      promotion: payload.data?.promotion ?? null,
      freshness: payload.data?.freshness ?? null,
    };
  }

  if (!INACTIVE_HTTP_STATUSES.has(response.status)) {
    return {
      status: 'error',
      targetSeason,
      code: payload.code ?? null,
      message: payload.error ?? `Breakout draft tags failed to load (HTTP ${response.status}).`,
    };
  }

  // Certified evidence always has precedence. A separate, explicit research lane is
  // available only for the 2026 draft-night artifact and never changes promotion state.
  if (targetSeason === 2026) {
    const provisional = await fetchProvisionalTags(targetSeason, fetchImpl);
    if (provisional) return provisional;
  }

  return {
    status: 'inactive',
    targetSeason,
    reason: inactiveReason(response.status, payload.code),
  };
}
