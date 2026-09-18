import { z } from 'zod';

/**
 * Contract-league data is user/league state, not canonical NFL player truth.
 * These contracts define the normalized boundary consumed by TIBER-Fantasy.
 * Source-specific workbook parsing must happen before this boundary and must
 * preserve unresolved/ambiguous values instead of guessing.
 */

export const contractMoneyComponentSchema = z.object({
  season: z.number().int().min(2000).max(2200),
  guaranteed: z.number().finite().nonnegative(),
  optional: z.number().finite().nonnegative(),
  capHit: z.number().finite().nonnegative(),
});

export const contractStatusSchema = z.enum([
  'ACTIVE',
  'IR',
  'SEASON_ENDING_IR',
  'CUT',
  'EXPIRED',
  'UNKNOWN',
]);

export const playerContractSchema = z.object({
  sourcePlayerName: z.string().trim().min(1),
  canonicalPlayerId: z.string().trim().min(1).nullable(),
  position: z.enum(['QB', 'RB', 'WR', 'TE']).nullable(),
  status: contractStatusSchema.default('ACTIVE'),
  totalValue: z.number().finite().nonnegative().nullable(),
  aav: z.number().finite().nonnegative().nullable(),
  years: z.array(contractMoneyComponentSchema).min(1),
  metadata: z.object({
    contractStructure: z.string().trim().min(1).nullable().optional(),
    distribution: z.enum(['FRONTLOADED', 'EVEN']).nullable().optional(),
    amnestyEligible: z.boolean().nullable().optional(),
    reSignEligible: z.boolean().nullable().optional(),
    notes: z.array(z.string()).default([]),
  }).default({ notes: [] }),
});

export const teamCapSeasonSchema = z.object({
  season: z.number().int().min(2000).max(2200),
  totalGuaranteed: z.number().finite().nonnegative(),
  totalCapHit: z.number().finite().nonnegative(),
  capAfterGuarantees: z.number().finite(),
  // Negative cap remaining is valid evidence of an over-cap future state.
  capRemaining: z.number().finite(),
});

export const contractLeagueTeamSchema = z.object({
  sourceTeamName: z.string().trim().min(1),
  platformRosterId: z.string().trim().min(1).nullable().optional(),
  contracts: z.array(playerContractSchema),
  deadCap: z.array(z.object({
    sourcePlayerName: z.string().trim().min(1),
    canonicalPlayerId: z.string().trim().min(1).nullable(),
    years: z.array(z.object({
      season: z.number().int().min(2000).max(2200),
      amount: z.number().finite().nonnegative(),
    })).min(1),
  })).default([]),
  cap: z.array(teamCapSeasonSchema).min(1),
});

export const contractLeagueScoringSchema = z.object({
  passYardsPerPoint: z.number().finite().positive().nullable(),
  passTd: z.number().finite().nullable(),
  interceptionThrown: z.number().finite().nullable(),
  rushYardsPerPoint: z.number().finite().positive().nullable(),
  rushTd: z.number().finite().nullable(),
  reception: z.number().finite().nullable(),
  receivingYardsPerPoint: z.number().finite().positive().nullable(),
  receivingTd: z.number().finite().nullable(),
  teReceptionBonus: z.number().finite().nullable(),
  fumbleLost: z.number().finite().nullable(),
  twoPointConversion: z.number().finite().nullable(),
});

export const lineupSlotSchema = z.object({
  slot: z.enum(['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPERFLEX', 'BENCH', 'IR']),
  count: z.number().int().nonnegative(),
  eligiblePositions: z.array(z.enum(['QB', 'RB', 'WR', 'TE'])).default([]),
});

export const contractLeagueSnapshotSchema = z.object({
  schemaVersion: z.literal('contract-league-snapshot.v1'),
  league: z.object({
    sourceLeagueName: z.string().trim().min(1),
    platform: z.enum(['sleeper', 'espn', 'yahoo', 'manual', 'unknown']),
    platformLeagueId: z.string().trim().min(1).nullable(),
    season: z.number().int().min(2000).max(2200),
    salaryCap: z.number().finite().positive().nullable(),
    scoring: contractLeagueScoringSchema.nullable(),
    lineup: z.array(lineupSlotSchema),
  }),
  teams: z.array(contractLeagueTeamSchema).min(1),
  provenance: z.object({
    sourceKind: z.enum(['google_drive_excel', 'google_sheet', 'manual', 'api']),
    sourceDisplayName: z.string().trim().min(1),
    sourceLocator: z.string().trim().min(1).nullable(),
    sourceModifiedAt: z.string().datetime().nullable(),
    importedAt: z.string().datetime(),
    importerVersion: z.string().trim().min(1),
  }),
  validation: z.object({
    status: z.enum(['VALID', 'PARTIAL', 'REJECTED']),
    warnings: z.array(z.string()).default([]),
    unresolved: z.array(z.object({
      code: z.string().trim().min(1),
      path: z.string().trim().min(1),
      detail: z.string().trim().min(1),
    })).default([]),
  }),
});

export type ContractLeagueSnapshot = z.infer<typeof contractLeagueSnapshotSchema>;

export function validateContractLeagueSnapshot(input: unknown) {
  return contractLeagueSnapshotSchema.safeParse(input);
}
