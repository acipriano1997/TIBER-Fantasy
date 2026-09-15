import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { z } from 'zod';
import { contractLeagueSnapshotSchema, type ContractLeagueSnapshot } from './contracts';

export const CONTRACT_VALUE_EVIDENCE_VERSION = 'contract-player-value-evidence.v1' as const;
export const CONTRACT_VALUE_COMPARISON_VERSION = 'contract-value-comparison.v1' as const;

const valueDistributionSchema = z.object({
  metricId: z.string().trim().min(1),
  horizonId: z.string().trim().min(1),
  p10: z.number().finite().nullable(),
  median: z.number().finite().nullable(),
  mean: z.number().finite().nullable(),
  p90: z.number().finite().nullable(),
});

export const contractPlayerValueEvidenceSchema = z.object({
  schemaVersion: z.literal(CONTRACT_VALUE_EVIDENCE_VERSION),
  leagueKey: z.string().trim().min(1),
  decisionAsOf: z.string().datetime(),
  evidenceFingerprint: z.string().trim().min(1),
  players: z.array(z.object({
    canonicalPlayerId: z.string().trim().min(1),
    fantasyValue: valueDistributionSchema,
    rosterMarginalValue: z.object({
      metricId: z.string().trim().min(1),
      value: z.number().finite(),
    }),
    uncertaintyLabel: z.string().trim().min(1).nullable(),
  })).min(1),
});

export const contractMarketPriceEvidenceSchema = z.object({
  schemaVersion: z.literal('contract-market-price-evidence.v1'),
  leagueKey: z.string().trim().min(1),
  decisionAsOf: z.string().datetime(),
  evidenceFingerprint: z.string().trim().min(1),
  prices: z.array(z.object({
    canonicalPlayerId: z.string().trim().min(1),
    acquisitionPrice: z.number().finite().nonnegative(),
    currencyId: z.string().trim().min(1),
    confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    sourceCount: z.number().int().nonnegative(),
  })),
});

export type ContractPlayerValueEvidence = z.infer<typeof contractPlayerValueEvidenceSchema>;
export type ContractMarketPriceEvidence = z.infer<typeof contractMarketPriceEvidenceSchema>;

export type ContractCostSeason = {
  season: number;
  guaranteed: number;
  optional: number;
  capHit: number;
};

export type ContractValueRow = {
  canonicalPlayerId: string;
  sourcePlayerName: string;
  position: 'QB' | 'RB' | 'WR' | 'TE' | null;
  fantasyValue: ContractPlayerValueEvidence['players'][number]['fantasyValue'];
  rosterMarginalValue: ContractPlayerValueEvidence['players'][number]['rosterMarginalValue'];
  uncertaintyLabel: string | null;
  contractCost: {
    currentSeason: ContractCostSeason | null;
    futureSeasons: ContractCostSeason[];
    totalRemainingCapHit: number;
    totalRemainingGuaranteed: number;
    totalRemainingOptional: number;
  };
  capEfficiency: {
    metricId: string;
    currentSeasonMarginalValuePerCapUnit: number | null;
  };
  marketAcquisitionPrice: {
    amount: number;
    currencyId: string;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    sourceCount: number;
  } | null;
  monetarySurplus: {
    status: 'UNAVAILABLE';
    reason: string;
  };
};

export type ContractReplacementCandidate = {
  canonicalPlayerId: string;
  rosterMarginalValue: number;
  metricId: string;
  currentContractCapHit: number | null;
  marketAcquisitionPrice: number | null;
};

export type ContractValueComparisonResult =
  | {
    status: 'ABSTAIN';
    version: typeof CONTRACT_VALUE_COMPARISON_VERSION;
    reasonCodes: string[];
    details: string[];
  }
  | {
    status: 'READY';
    version: typeof CONTRACT_VALUE_COMPARISON_VERSION;
    leagueKey: string;
    decisionAsOf: string;
    rows: ContractValueRow[];
    replacementFrontier: ContractReplacementCandidate[];
    fingerprint: string;
  };

function money(value: number) {
  return Number(value.toFixed(6));
}

function fingerprint(value: unknown) {
  const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null';
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function time(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value).valueOf();
  return Number.isFinite(parsed) ? parsed : null;
}

function activeContract(contract: ContractLeagueSnapshot['teams'][number]['contracts'][number]) {
  return contract.status !== 'CUT' && contract.status !== 'EXPIRED';
}

function rejectFutureEvidence(
  reasons: Array<{ code: string; detail: string }>,
  decisionMs: number,
  label: string,
  value: string | null | undefined,
  code: string,
) {
  if (!value) return;
  const evidenceMs = time(value);
  if (evidenceMs === null) {
    reasons.push({ code: `${code}_INVALID`, detail: `${label} must be a valid timestamp when present.` });
    return;
  }
  if (evidenceMs > decisionMs) {
    reasons.push({ code, detail: `${label} occurs after the frozen decision timestamp and is ineligible for comparison.` });
  }
}

export function compareContractPlayerValues(input: {
  snapshot: unknown;
  leagueKey: string;
  sourceTeamName: string;
  decisionAsOf: string;
  valueEvidence: unknown;
  marketPriceEvidence?: unknown | null;
  replacementPlayerIds?: string[];
}): ContractValueComparisonResult {
  const reasons: Array<{ code: string; detail: string }> = [];
  const snapshotResult = contractLeagueSnapshotSchema.safeParse(input.snapshot);
  if (!snapshotResult.success) {
    return { status: 'ABSTAIN', version: CONTRACT_VALUE_COMPARISON_VERSION, reasonCodes: ['SNAPSHOT_INVALID'], details: ['Contract snapshot failed schema validation.'] };
  }
  const valueResult = contractPlayerValueEvidenceSchema.safeParse(input.valueEvidence);
  if (!valueResult.success) {
    return { status: 'ABSTAIN', version: CONTRACT_VALUE_COMPARISON_VERSION, reasonCodes: ['CCF_VALUE_EVIDENCE_INVALID'], details: ['CCF player-value evidence failed schema validation.'] };
  }

  const snapshot = snapshotResult.data;
  const values = valueResult.data;
  if (snapshot.validation.status !== 'VALID') reasons.push({ code: 'SNAPSHOT_NOT_DECISION_READY', detail: 'Only a VALID contract snapshot may drive contract-value comparison.' });
  if (!input.leagueKey.trim()) reasons.push({ code: 'LEAGUE_KEY_REQUIRED', detail: 'Contract-value comparison requires an explicit internal league key.' });
  if (values.leagueKey !== input.leagueKey.trim()) reasons.push({ code: 'CCF_VALUE_LEAGUE_MISMATCH', detail: 'CCF value evidence belongs to a different internal league.' });

  const decisionMs = time(input.decisionAsOf);
  const valueMs = time(values.decisionAsOf);
  if (decisionMs === null) reasons.push({ code: 'DECISION_TIME_INVALID', detail: 'decisionAsOf must be a valid timestamp.' });
  if (valueMs === null) reasons.push({ code: 'CCF_VALUE_TIME_INVALID', detail: 'CCF value evidence has an invalid decision timestamp.' });
  if (decisionMs !== null) {
    rejectFutureEvidence(
      reasons,
      decisionMs,
      'snapshot provenance.importedAt',
      snapshot.provenance.importedAt,
      'SNAPSHOT_IMPORTED_AFTER_DECISION',
    );
    rejectFutureEvidence(
      reasons,
      decisionMs,
      'snapshot provenance.sourceModifiedAt',
      snapshot.provenance.sourceModifiedAt,
      'SNAPSHOT_SOURCE_MODIFIED_AFTER_DECISION',
    );
  }
  if (decisionMs !== null && valueMs !== null && valueMs > decisionMs) reasons.push({ code: 'CCF_VALUE_AFTER_DECISION', detail: 'CCF value evidence occurs after the frozen contract decision time.' });

  const teamMatches = snapshot.teams.filter((team) => team.sourceTeamName === input.sourceTeamName.trim());
  if (teamMatches.length !== 1) reasons.push({ code: 'TEAM_BINDING_UNRESOLVED', detail: 'Contract-value comparison requires exactly one bound source team.' });

  let market: ContractMarketPriceEvidence | null = null;
  if (input.marketPriceEvidence !== undefined && input.marketPriceEvidence !== null) {
    const marketResult = contractMarketPriceEvidenceSchema.safeParse(input.marketPriceEvidence);
    if (!marketResult.success) {
      reasons.push({ code: 'MARKET_PRICE_EVIDENCE_INVALID', detail: 'Provided market-price evidence failed schema validation.' });
    } else {
      market = marketResult.data;
      if (market.leagueKey !== input.leagueKey.trim()) reasons.push({ code: 'MARKET_PRICE_LEAGUE_MISMATCH', detail: 'Market-price evidence belongs to a different internal league.' });
      const marketMs = time(market.decisionAsOf);
      if (marketMs === null) reasons.push({ code: 'MARKET_PRICE_TIME_INVALID', detail: 'Market-price evidence has an invalid timestamp.' });
      if (decisionMs !== null && marketMs !== null && marketMs > decisionMs) reasons.push({ code: 'MARKET_PRICE_AFTER_DECISION', detail: 'Market-price evidence occurs after the frozen decision time.' });
    }
  }

  if (reasons.length) {
    return {
      status: 'ABSTAIN',
      version: CONTRACT_VALUE_COMPARISON_VERSION,
      reasonCodes: [...new Set(reasons.map((item) => item.code))],
      details: reasons.map((item) => item.detail),
    };
  }

  const team = teamMatches[0];
  if (!team) {
    return { status: 'ABSTAIN', version: CONTRACT_VALUE_COMPARISON_VERSION, reasonCodes: ['TEAM_BINDING_UNRESOLVED'], details: ['Bound source team is unavailable.'] };
  }

  const contractByPlayer = new Map(team.contracts
    .filter(activeContract)
    .filter((contract) => contract.canonicalPlayerId !== null)
    .map((contract) => [contract.canonicalPlayerId as string, contract]));
  const marketByPlayer = new Map((market?.prices ?? []).map((price) => [price.canonicalPlayerId, price]));

  const rows = values.players.flatMap((player): ContractValueRow[] => {
    const contract = contractByPlayer.get(player.canonicalPlayerId);
    if (!contract) return [];
    const remaining = contract.years
      .filter((year) => year.season >= snapshot.league.season)
      .sort((a, b) => a.season - b.season)
      .map((year) => ({ season: year.season, guaranteed: money(year.guaranteed), optional: money(year.optional), capHit: money(year.capHit) }));
    const currentSeason = remaining.find((year) => year.season === snapshot.league.season) ?? null;
    const price = marketByPlayer.get(player.canonicalPlayerId) ?? null;
    return [{
      canonicalPlayerId: player.canonicalPlayerId,
      sourcePlayerName: contract.sourcePlayerName,
      position: contract.position,
      fantasyValue: player.fantasyValue,
      rosterMarginalValue: player.rosterMarginalValue,
      uncertaintyLabel: player.uncertaintyLabel,
      contractCost: {
        currentSeason,
        futureSeasons: remaining.filter((year) => year.season > snapshot.league.season),
        totalRemainingCapHit: money(remaining.reduce((sum, year) => sum + year.capHit, 0)),
        totalRemainingGuaranteed: money(remaining.reduce((sum, year) => sum + year.guaranteed, 0)),
        totalRemainingOptional: money(remaining.reduce((sum, year) => sum + year.optional, 0)),
      },
      capEfficiency: {
        metricId: player.rosterMarginalValue.metricId,
        currentSeasonMarginalValuePerCapUnit: currentSeason && currentSeason.capHit > 0
          ? money(player.rosterMarginalValue.value / currentSeason.capHit)
          : null,
      },
      marketAcquisitionPrice: price ? {
        amount: money(price.acquisitionPrice),
        currencyId: price.currencyId,
        confidence: price.confidence,
        sourceCount: price.sourceCount,
      } : null,
      monetarySurplus: {
        status: 'UNAVAILABLE',
        reason: 'CCF football value and cap dollars remain separate until a validated league-local value-to-price model exists.',
      },
    }];
  });

  const replacementIds = new Set(input.replacementPlayerIds ?? []);
  const replacementFrontier = values.players
    .filter((player) => replacementIds.has(player.canonicalPlayerId))
    .map((player): ContractReplacementCandidate => {
      const contract = contractByPlayer.get(player.canonicalPlayerId);
      const currentContractCapHit = contract?.years.find((year) => year.season === snapshot.league.season)?.capHit ?? null;
      const price = marketByPlayer.get(player.canonicalPlayerId) ?? null;
      return {
        canonicalPlayerId: player.canonicalPlayerId,
        rosterMarginalValue: player.rosterMarginalValue.value,
        metricId: player.rosterMarginalValue.metricId,
        currentContractCapHit: currentContractCapHit === null ? null : money(currentContractCapHit),
        marketAcquisitionPrice: price ? money(price.acquisitionPrice) : null,
      };
    })
    .sort((a, b) => b.rosterMarginalValue - a.rosterMarginalValue);

  const output = {
    version: CONTRACT_VALUE_COMPARISON_VERSION,
    leagueKey: input.leagueKey.trim(),
    decisionAsOf: input.decisionAsOf,
    rows,
    replacementFrontier,
    valueEvidenceFingerprint: values.evidenceFingerprint,
    marketEvidenceFingerprint: market?.evidenceFingerprint ?? null,
  };

  return {
    status: 'READY',
    version: CONTRACT_VALUE_COMPARISON_VERSION,
    leagueKey: output.leagueKey,
    decisionAsOf: output.decisionAsOf,
    rows,
    replacementFrontier,
    fingerprint: fingerprint(output),
  };
}
