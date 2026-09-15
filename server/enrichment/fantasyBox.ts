/**
 * Fantasy Points Enrichment Handler
 *
 * Auto-calculates fantasy points for common scoring formats while also exposing
 * an explicit league-scoring primitive for league-aware decision systems.
 */

export interface EnrichedFantasy {
  fantasy_points_standard: number;
  fantasy_points_half_ppr: number;
  fantasy_points_ppr: number;
  fantasy_rank_standard: number | null;
  fantasy_rank_ppr: number | null;
  projected_points_ppr: number | null;
  [key: string]: any;
}

export interface FantasyScoringSettings {
  passingYard: number;
  passingTd: number;
  interceptionThrown: number;
  rushingYard: number;
  rushingTd: number;
  reception: number;
  receivingYard: number;
  receivingTd: number;
  twoPointConversion: number;
  fumbleLost: number;
  teReceptionBonus: number;
}

export interface FantasyStatLine {
  position?: string | null;
  passing_yards?: number | null;
  pass_yd?: number | null;
  passing_tds?: number | null;
  pass_td?: number | null;
  interceptions?: number | null;
  int?: number | null;
  rushing_yards?: number | null;
  rush_yd?: number | null;
  rushing_tds?: number | null;
  rush_td?: number | null;
  receptions?: number | null;
  rec?: number | null;
  receiving_yards?: number | null;
  rec_yd?: number | null;
  receiving_tds?: number | null;
  rec_td?: number | null;
  two_pt?: number | null;
  two_point_conversions?: number | null;
  fumbles_lost?: number | null;
  fumbles?: number | null;
}

export const standardScoring: FantasyScoringSettings = {
  passingYard: 0.04,
  passingTd: 4,
  interceptionThrown: -2,
  rushingYard: 0.1,
  rushingTd: 6,
  reception: 0,
  receivingYard: 0.1,
  receivingTd: 6,
  twoPointConversion: 2,
  fumbleLost: -2,
  teReceptionBonus: 0,
};

export const halfPprScoring: FantasyScoringSettings = {
  ...standardScoring,
  reception: 0.5,
};

export const pprScoring: FantasyScoringSettings = {
  ...standardScoring,
  reception: 1,
};

const finite = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Convert a football stat line into fantasy points under one explicit league
 * scoring profile. The football outcome remains unchanged; only the scoring
 * translation changes.
 */
export function scoreFantasyStatLine(
  p: FantasyStatLine,
  scoring: FantasyScoringSettings,
): number {
  const passTd = finite(p.passing_tds ?? p.pass_td);
  const rushTd = finite(p.rushing_tds ?? p.rush_td);
  const recTd = finite(p.receiving_tds ?? p.rec_td);
  const rec = finite(p.receptions ?? p.rec);
  const rushYds = finite(p.rushing_yards ?? p.rush_yd);
  const recYds = finite(p.receiving_yards ?? p.rec_yd);
  const passYds = finite(p.passing_yards ?? p.pass_yd);
  const interceptions = finite(p.interceptions ?? p.int);
  // Prefer the semantically correct lost-fumble field when available while
  // retaining the legacy fallback for older enrichment payloads.
  const fumblesLost = finite(p.fumbles_lost ?? p.fumbles);
  const twoPt = finite(p.two_pt ?? p.two_point_conversions);
  const teBonus = p.position?.toUpperCase() === 'TE'
    ? rec * scoring.teReceptionBonus
    : 0;

  const points =
    passYds * scoring.passingYard +
    passTd * scoring.passingTd +
    interceptions * scoring.interceptionThrown +
    rushYds * scoring.rushingYard +
    rushTd * scoring.rushingTd +
    rec * scoring.reception +
    recYds * scoring.receivingYard +
    recTd * scoring.receivingTd +
    twoPt * scoring.twoPointConversion +
    fumblesLost * scoring.fumbleLost +
    teBonus;

  return Number(points.toFixed(2));
}

export const enrichFantasy = (p: any): EnrichedFantasy => {
  const standard = scoreFantasyStatLine(p, standardScoring);
  const ppr = scoreFantasyStatLine(p, pprScoring);
  const halfPpr = scoreFantasyStatLine(p, halfPprScoring);

  return {
    ...p,
    fantasy_points_standard: standard,
    fantasy_points_half_ppr: halfPpr,
    fantasy_points_ppr: ppr,
    fantasy_rank_standard: null,   // Filled by ranking job
    fantasy_rank_ppr: null,        // Filled by ranking job
    projected_points_ppr: null,    // Hook for projection model
  };
};

export interface EnrichmentResult {
  player: EnrichedFantasy;
  enriched: boolean;
  enrichments: string[];
}

export function enrichFantasyWithMeta(player: any): EnrichmentResult {
  const enriched = enrichFantasy(player);
  const enrichments: string[] = ['fantasy_standard', 'fantasy_half', 'fantasy_ppr'];

  return {
    player: enriched,
    enriched: true,
    enrichments,
  };
}
