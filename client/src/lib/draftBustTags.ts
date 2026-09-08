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
