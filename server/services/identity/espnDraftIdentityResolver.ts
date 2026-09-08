import { db } from '../../infra/db';
import { playerIdentityMap } from '@shared/schema';
import { inArray } from 'drizzle-orm';

export type EspnDraftIdentityStatus = 'resolved' | 'unresolved' | 'unavailable' | 'ambiguous';

export type EspnDraftIdentityResolution = {
  espnPlayerId: string;
  canonicalPlayerId: string | null;
  status: EspnDraftIdentityStatus;
  reason: 'espn_exact_crosswalk' | 'espn_not_in_identity_map' | 'espn_identity_lookup_unavailable' | 'espn_ambiguous_duplicate_crosswalk_rows';
};

export type EspnDraftIdentityCoverage = {
  total: number;
  resolved: number;
  unresolved: number;
  unavailable: number;
  ambiguous: number;
  coverageRatio: number;
};

type IdentityRow = { espnId: string | null; canonicalId: string };
type IdentityLookup = (espnPlayerIds: string[]) => Promise<IdentityRow[]>;

async function defaultLookup(espnPlayerIds: string[]): Promise<IdentityRow[]> {
  if (espnPlayerIds.length === 0) return [];
  return db
    .select({ espnId: playerIdentityMap.espnId, canonicalId: playerIdentityMap.canonicalId })
    .from(playerIdentityMap)
    .where(inArray(playerIdentityMap.espnId, espnPlayerIds));
}

export async function resolveEspnDraftIdentities(
  rawIds: string[],
  options: { lookup?: IdentityLookup } = {},
): Promise<{ identities: Map<string, EspnDraftIdentityResolution>; coverage: EspnDraftIdentityCoverage }> {
  const ids = Array.from(new Set(rawIds.map((value) => String(value ?? '').trim()).filter(Boolean)));
  const identities = new Map<string, EspnDraftIdentityResolution>();
  const lookup = options.lookup ?? defaultLookup;

  let rows: IdentityRow[];
  try {
    rows = await lookup(ids);
  } catch (error) {
    console.error('[EspnDraftIdentityResolver] exact ESPN crosswalk lookup failed:', error);
    for (const espnPlayerId of ids) {
      identities.set(espnPlayerId, {
        espnPlayerId,
        canonicalPlayerId: null,
        status: 'unavailable',
        reason: 'espn_identity_lookup_unavailable',
      });
    }
    return { identities, coverage: measureCoverage(ids, identities) };
  }

  const owners = new Map<string, string[]>();
  for (const row of rows) {
    const espnId = row.espnId?.trim();
    const canonicalId = row.canonicalId?.trim();
    if (!espnId || !canonicalId || !ids.includes(espnId)) continue;
    const current = owners.get(espnId) ?? [];
    current.push(canonicalId);
    owners.set(espnId, current);
  }

  for (const espnPlayerId of ids) {
    const matches = Array.from(new Set(owners.get(espnPlayerId) ?? []));
    if (matches.length === 1) {
      identities.set(espnPlayerId, {
        espnPlayerId,
        canonicalPlayerId: matches[0],
        status: 'resolved',
        reason: 'espn_exact_crosswalk',
      });
    } else if (matches.length > 1) {
      identities.set(espnPlayerId, {
        espnPlayerId,
        canonicalPlayerId: null,
        status: 'ambiguous',
        reason: 'espn_ambiguous_duplicate_crosswalk_rows',
      });
    } else {
      identities.set(espnPlayerId, {
        espnPlayerId,
        canonicalPlayerId: null,
        status: 'unresolved',
        reason: 'espn_not_in_identity_map',
      });
    }
  }

  return { identities, coverage: measureCoverage(ids, identities) };
}

function measureCoverage(ids: string[], identities: Map<string, EspnDraftIdentityResolution>): EspnDraftIdentityCoverage {
  const coverage: EspnDraftIdentityCoverage = {
    total: ids.length,
    resolved: 0,
    unresolved: 0,
    unavailable: 0,
    ambiguous: 0,
    coverageRatio: ids.length === 0 ? 1 : 0,
  };

  for (const id of ids) {
    const status = identities.get(id)?.status ?? 'unresolved';
    coverage[status] += 1;
  }
  coverage.coverageRatio = coverage.total === 0 ? 1 : coverage.resolved / coverage.total;
  return coverage;
}
