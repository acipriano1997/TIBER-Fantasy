const BASE_URL = 'https://api.sleeper.app/v1';
const SLEEPER_REQUEST_TIMEOUT_MS = 10_000;

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  scoring_settings?: Record<string, any>;
  total_rosters?: number;
  status?: string;
  roster_positions?: string[];
}

export interface SleeperLeagueDetail extends SleeperLeague {
  type?: string;
  draft_id?: string;
  previous_league_id?: string | null;
  owner_id?: string | null;
  settings?: Record<string, any> & {
    type?: number;
    leg?: number;
    playoff_week_start?: number;
    playoff_teams?: number;
    league_average_match?: number;
    median_match?: number;
  };
}

export interface SleeperUser {
  user_id: string;
  display_name: string;
  is_owner?: boolean;
  avatar?: string | null;
  metadata?: Record<string, any>;
  is_bot?: boolean;
  team_name?: string;
  username?: string;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  co_owners?: string[] | null;
  players?: string[];
  starters?: string[] | null;
  reserve?: string[] | null;
  taxi?: string[] | null;
  settings?: Record<string, any> & {
    wins?: number;
    losses?: number;
    ties?: number;
    fpts?: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
    rank?: number;
    waiver_position?: number;
    waiver_budget_used?: number;
  };
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id?: number | null;
  points?: number | null;
  starters?: string[] | null;
  starters_points?: number[] | null;
  players?: string[] | null;
  players_points?: Record<string, number> | null;
  custom_points?: number | null;
}

export interface SleeperBracketMatch {
  r: number;
  m: number;
  t1?: number | null;
  t2?: number | null;
  w?: number | null;
  l?: number | null;
  p?: number | null;
  t1_from?: Record<string, unknown> | null;
  t2_from?: Record<string, unknown> | null;
}

export interface SleeperDraftPick {
  player_id: string;
  roster_id: number;
  draft_slot?: number;
  round: number;
  pick_no: number;
  picked_by?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SleeperDraft {
  draft_id: string;
  league_id?: string | null;
  status?: string | null;
  type?: string | null;
  season?: string | null;
  settings?: Record<string, any> & {
    teams?: number;
    rounds?: number;
    pick_timer?: number;
  };
  slot_to_roster_id?: Record<string, number | string> | null;
}

export interface SleeperTradedPick {
  season: string;
  round: number;
  roster_id: number;
  previous_owner_id: number;
  owner_id: number;
}

export interface SleeperPlayer {
  player_id?: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  team?: string | null;
  active?: boolean | null;
  status?: string | null;
  fantasy_data_id?: string | number | null;
  gsis_id?: string | null;
  birth_date?: string | null;
  college?: string | null;
  height?: string | null;
  weight?: string | number | null;
}

async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLEEPER_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, { signal: controller.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Sleeper API error ${res.status}: ${text}`);
    }
    return await res.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

export const sleeperClient = {
  async getLeague(leagueId: string): Promise<SleeperLeagueDetail> {
    return fetchJson<SleeperLeagueDetail>(`/league/${leagueId}`);
  },

  async getUser(userIdOrUsername: string): Promise<SleeperUser> {
    return fetchJson<SleeperUser>(`/user/${userIdOrUsername}`);
  },

  async getLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
    return fetchJson<SleeperUser[]>(`/league/${leagueId}/users`);
  },

  async getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
    return fetchJson<SleeperRoster[]>(`/league/${leagueId}/rosters`);
  },

  async getLeagueMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    return fetchJson<SleeperMatchup[]>(`/league/${leagueId}/matchups/${week}`);
  },

  async getWinnersBracket(leagueId: string): Promise<SleeperBracketMatch[]> {
    return fetchJson<SleeperBracketMatch[]>(`/league/${leagueId}/winners_bracket`);
  },

  async getLosersBracket(leagueId: string): Promise<SleeperBracketMatch[]> {
    return fetchJson<SleeperBracketMatch[]>(`/league/${leagueId}/losers_bracket`);
  },

  async getTradedPicks(leagueId: string): Promise<SleeperTradedPick[]> {
    return fetchJson<SleeperTradedPick[]>(`/league/${leagueId}/traded_picks`);
  },

  async getUserLeagues(userId: string, season: string): Promise<SleeperLeagueDetail[]> {
    return fetchJson<SleeperLeagueDetail[]>(`/user/${userId}/leagues/nfl/${season}`);
  },

  async getNflPlayers(): Promise<Record<string, SleeperPlayer>> {
    return fetchJson<Record<string, SleeperPlayer>>('/players/nfl');
  },

  async getDraftPicks(draftId: string): Promise<SleeperDraftPick[]> {
    return fetchJson<SleeperDraftPick[]>(`/draft/${draftId}/picks`);
  },

  async getDraft(draftId: string): Promise<SleeperDraft> {
    return fetchJson<SleeperDraft>(`/draft/${draftId}`);
  },
};

export function deriveSleeperScoringFormat(scoringSettings?: Record<string, any>): string | null {
  if (!scoringSettings) return null;
  const reception = Number(scoringSettings.rec ?? scoringSettings.recption ?? scoringSettings.rec_per_rx ?? scoringSettings.rec_per_game);

  if (Number.isNaN(reception)) return null;
  if (reception >= 1) return 'ppr';
  if (reception >= 0.5) return 'half_ppr';
  if (reception === 0) return 'standard';
  return `${reception}_ppr`;
}
