export type DraftBustTag = {
  playerId: string;
  targetSeason: number;
  probability: {
    value: number;
    percent: number;
  };
  severityExpected: number | null;
  mechanisms: string[];
  modelVersion: string;
  calibrationVersion: string;
  labelDefinitionVersion: string;
  asOf: string;
  provenance: unknown[];
  freshnessContext: unknown;
};

export type DraftBustTagsResult =
  | {
      status: 'active';
      targetSeason: number;
      tags: DraftBustTag[];
      source: unknown;
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

export type DraftBustEspnIdentity = {
  espnPlayerId: string;
  canonicalPlayerId: string | null;
  status: 'resolved' | 'unresolved' | 'unavailable' | 'ambiguous';
  reason: 'espn_exact_crosswalk' | 'espn_not_in_identity_map' | 'espn_identity_lookup_unavailable' | 'espn_ambiguous_duplicate_crosswalk_rows';
};

export type DraftBustEspnIdentityResult = {
  identities: Map<string, DraftBustEspnIdentity>;
  coverage: {
    total: number;
    resolved: number;
    unresolved: number;
    unavailable: number;
    ambiguous: number;
    coverageRatio: number;
  };
};

const INACTIVE_HTTP_STATUSES = new Set([404, 409, 503]);

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1;
}

function isDraftBustTag(value: unknown): value is DraftBustTag {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DraftBustTag>;
  const probability = candidate.probability;
  return (
    typeof candidate.playerId === 'string' && candidate.playerId.trim().length > 0
    && typeof candidate.targetSeason === 'number' && Number.isInteger(candidate.targetSeason)
    && !!probability && isProbability(probability.value)
    && typeof probability.percent === 'number' && Number.isInteger(probability.percent)
    && probability.percent === Math.round(probability.value * 100)
    && probability.percent >= 1 && probability.percent <= 100
    && (candidate.severityExpected === null || candidate.severityExpected === undefined
      || (typeof candidate.severityExpected === 'number' && Number.isFinite(candidate.severityExpected)))
    && Array.isArray(candidate.mechanisms) && candidate.mechanisms.every((item) => typeof item === 'string' && item.length > 0)
    && typeof candidate.modelVersion === 'string' && candidate.modelVersion.length > 0
    && typeof candidate.calibrationVersion === 'string' && candidate.calibrationVersion.length > 0
    && typeof candidate.labelDefinitionVersion === 'string' && candidate.labelDefinitionVersion.length > 0
    && typeof candidate.asOf === 'string' && candidate.asOf.length > 0
    && Array.isArray(candidate.provenance) && candidate.provenance.length > 0
    && candidate.freshnessContext !== null && candidate.freshnessContext !== undefined
  );
}

function isDraftBustEspnIdentity(value: unknown): value is DraftBustEspnIdentity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DraftBustEspnIdentity>;
  const statusOk = candidate.status === 'resolved'
    || candidate.status === 'unresolved'
    || candidate.status === 'unavailable'
    || candidate.status === 'ambiguous';
  const reasonOk = candidate.reason === 'espn_exact_crosswalk'
    || candidate.reason === 'espn_not_in_identity_map'
    || candidate.reason === 'espn_identity_lookup_unavailable'
    || candidate.reason === 'espn_ambiguous_duplicate_crosswalk_rows';
  const canonicalOk = candidate.status === 'resolved'
    ? typeof candidate.canonicalPlayerId === 'string' && candidate.canonicalPlayerId.trim().length > 0
    : candidate.canonicalPlayerId === null;
  return typeof candidate.espnPlayerId === 'string'
    && candidate.espnPlayerId.trim().length > 0
    && statusOk
    && reasonOk
    && canonicalOk;
}

function inactiveReason(status: number, code?: string): 'not_found' | 'not_promoted' | 'upstream_unavailable' {
  if (code === 'not_promoted' || status === 409) return 'not_promoted';
  if (status === 503) return 'upstream_unavailable';
  return 'not_found';
}

export function formatDraftBustTag(probability: number): string | null {
  if (!isProbability(probability)) return null;
  return `BUST ${Math.round(probability * 100)}%`;
}

/** Bust evidence is intentionally stricter than breakout evidence: canonical id only. */
export function findDraftBustTag(canonicalPlayerId: string | null | undefined, tags: DraftBustTag[]): DraftBustTag | null {
  const playerId = canonicalPlayerId?.trim();
  if (!playerId) return null;
  const matches = tags.filter((tag) => tag.playerId === playerId);
  return matches.length === 1 ? matches[0] : null;
}

export async function fetchDraftBustEspnIdentities(
  espnPlayerIds: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<DraftBustEspnIdentityResult> {
  const uniqueIds = Array.from(new Set(espnPlayerIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    return {
      identities: new Map(),
      coverage: { total: 0, resolved: 0, unresolved: 0, unavailable: 0, ambiguous: 0, coverageRatio: 1 },
    };
  }

  const response = await fetchImpl('/api/data-lab/draft-bust-signals/identity/espn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ espnPlayerIds: uniqueIds }),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({})) as {
    success?: boolean;
    error?: string;
    data?: {
      identities?: unknown;
      coverage?: Partial<DraftBustEspnIdentityResult['coverage']>;
    };
  };
  if (!response.ok || !Array.isArray(payload.data?.identities)) {
    throw new Error(payload.error ?? `ESPN identity join failed (HTTP ${response.status}).`);
  }

  const identities = payload.data.identities;
  if (!identities.every(isDraftBustEspnIdentity)) {
    throw new Error('ESPN identity join failed the client evidence contract.');
  }

  const coverage = payload.data.coverage;
  if (!coverage
    || !Number.isInteger(coverage.total)
    || !Number.isInteger(coverage.resolved)
    || !Number.isInteger(coverage.unresolved)
    || !Number.isInteger(coverage.unavailable)
    || !Number.isInteger(coverage.ambiguous)
    || typeof coverage.coverageRatio !== 'number'
    || !Number.isFinite(coverage.coverageRatio)
    || coverage.coverageRatio < 0
    || coverage.coverageRatio > 1) {
    throw new Error('ESPN identity join coverage failed the client evidence contract.');
  }

  return {
    identities: new Map(identities.map((identity) => [identity.espnPlayerId, identity])),
    coverage: coverage as DraftBustEspnIdentityResult['coverage'],
  };
}

export async function fetchDraftBustTags(
  targetSeason: number,
  fetchImpl: typeof fetch = fetch,
): Promise<DraftBustTagsResult> {
  const response = await fetchImpl(`/api/data-lab/draft-bust-signals/draft-tags?season=${targetSeason}`, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({})) as {
    success?: boolean;
    code?: string;
    error?: string;
    data?: {
      targetSeason?: number;
      tags?: unknown;
      source?: unknown;
    };
  };

  if (!response.ok) {
    if (INACTIVE_HTTP_STATUSES.has(response.status)) {
      return {
        status: 'inactive',
        targetSeason,
        reason: inactiveReason(response.status, payload.code),
      };
    }
    return {
      status: 'error',
      targetSeason,
      code: payload.code ?? null,
      message: payload.error ?? `Draft bust tags failed to load (HTTP ${response.status}).`,
    };
  }

  if (payload.data?.targetSeason !== targetSeason || !Array.isArray(payload.data.tags)) {
    return { status: 'error', targetSeason, code: 'invalid_payload', message: 'Draft bust response failed the client contract.' };
  }

  const tags = payload.data.tags;
  if (!tags.every(isDraftBustTag) || !tags.every((tag) => tag.targetSeason === targetSeason)) {
    return { status: 'error', targetSeason, code: 'invalid_payload', message: 'Draft bust tags failed the client evidence contract.' };
  }

  return {
    status: 'active',
    targetSeason,
    tags,
    source: payload.data.source ?? null,
  };
}
