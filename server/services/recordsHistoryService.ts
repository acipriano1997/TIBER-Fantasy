import { createHash } from 'crypto';
import {
  sleeperClient,
  SleeperBracketMatch,
  SleeperLeagueDetail,
  SleeperMatchup,
  SleeperRoster,
  SleeperUser,
} from '../integrations/sleeperClient';

const DEFAULT_MAX_SEASONS = 12;
const HARD_MAX_SEASONS = 25;
const CACHE_TTL_MS = 5 * 60 * 1000;

export type RecordScope = 'league_series' | 'scoring_era';
export type RecordStatus = 'historical' | 'tied' | 'active';

export interface HistoryDiagnostic {
  leagueId: string;
  season?: string;
  code: 'league_unavailable' | 'season_partial' | 'lineage_cycle' | 'lineage_depth_limit';
  message: string;
}

export interface HistoricalManager {
  userId: string;
  displayName: string;
  username: string | null;
  avatar: string | null;
  seasons: string[];
}

export interface HistoricalMatchupFact {
  leagueId: string;
  season: string;
  week: number;
  matchupId: number;
  isPlayoff: boolean;
  rosterId: number;
  managerId: string | null;
  points: number;
  opponentRosterId: number | null;
  opponentManagerId: string | null;
  opponentPoints: number | null;
  won: boolean | null;
  tied: boolean;
}

export interface HistoricalSeason {
  leagueId: string;
  previousLeagueId: string | null;
  season: string;
  name: string;
  status: string | null;
  scoringFingerprint: string;
  scoringEraId: string;
  scoringSettings: Record<string, unknown>;
  rosterPositions: string[];
  playoffWeekStart: number | null;
  users: HistoricalManager[];
  rosterOwners: Array<{
    rosterId: number;
    managerId: string | null;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
  }>;
  matchups: HistoricalMatchupFact[];
  playoffRosterIds: number[];
  championRosterId: number | null;
  runnerUpRosterId: number | null;
  regularSeasonChampionRosterId: number | null;
  pointsLeaderRosterId: number | null;
  coverage: {
    complete: boolean;
    requestedWeeks: number;
    loadedWeeks: number;
    playoffBracketLoaded: boolean;
  };
}

export interface ManagerCareerSummary {
  managerId: string;
  displayName: string;
  seasons: number;
  championships: number;
  finals: number;
  playoffAppearances: number;
  regularSeasonTitles: number;
  pointsTitles: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number | null;
  pointsFor: number;
  pointsAgainst: number;
  bestWeeklyScore: number | null;
  longestWinStreak: number;
  currentWinStreak: number;
}

export interface RecordOccurrence {
  recordId: string;
  recordVersion: 1;
  label: string;
  scope: RecordScope;
  scoringEraId: string | null;
  value: number;
  unit: 'points' | 'games' | 'count';
  managerId: string | null;
  displayName: string | null;
  opponentManagerId: string | null;
  season: string | null;
  week: number | null;
  leagueId: string | null;
  matchupId: number | null;
  status: RecordStatus;
  provenance: {
    source: 'sleeper';
    leagueId: string | null;
    season: string | null;
    week: number | null;
    matchupId: number | null;
    definition: string;
  };
}

export interface RivalrySeries {
  managerAId: string;
  managerBId: string;
  managerAName: string;
  managerBName: string;
  games: number;
  managerAWins: number;
  managerBWins: number;
  ties: number;
  managerAPoints: number;
  managerBPoints: number;
  playoffGames: number;
  closestMargin: number | null;
  largestMargin: number | null;
  firstMeeting: { season: string; week: number } | null;
  lastMeeting: { season: string; week: number } | null;
}

export interface AchievementGrant {
  achievementId: string;
  version: 1;
  label: string;
  description: string;
  managerId: string;
  displayName: string;
  season: string | null;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  earnedByManagers: number;
  eligibleManagers: number;
  provenance: Array<{ leagueId: string; season: string; week?: number }>;
}

export interface SeasonAlmanacEntry {
  leagueId: string;
  season: string;
  name: string;
  scoringEraId: string;
  championManagerId: string | null;
  championName: string | null;
  runnerUpManagerId: string | null;
  runnerUpName: string | null;
  regularSeasonChampionManagerId: string | null;
  regularSeasonChampionName: string | null;
  pointsLeaderManagerId: string | null;
  pointsLeaderName: string | null;
  highestWeeklyScore: number | null;
  highestWeeklyScoreManagerId: string | null;
  highestWeeklyScoreManagerName: string | null;
  coverageComplete: boolean;
}

export interface RecordWatchItem {
  recordId: string;
  label: string;
  managerId: string;
  displayName: string;
  currentValue: number;
  recordValue: number;
  distance: number;
  scoringEraId: string | null;
}

export interface LeagueRecordsPayload {
  success: true;
  generatedAt: string;
  currentLeagueId: string;
  leagueName: string;
  seasons: HistoricalSeason[];
  managers: HistoricalManager[];
  careers: ManagerCareerSummary[];
  records: RecordOccurrence[];
  rivalries: RivalrySeries[];
  achievements: AchievementGrant[];
  almanac: SeasonAlmanacEntry[];
  recordWatch: RecordWatchItem[];
  scoringEras: Array<{ id: string; fingerprint: string; seasons: string[]; isCurrent: boolean }>;
  coverage: {
    complete: boolean;
    seasonsRequested: number;
    seasonsLoaded: number;
    diagnostics: HistoryDiagnostic[];
  };
}

type CacheEntry = { expiresAt: number; payload: LeagueRecordsPayload };
const cache = new Map<string, CacheEntry>();

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

export function createScoringFingerprint(
  league: Pick<SleeperLeagueDetail, 'scoring_settings' | 'roster_positions' | 'settings'>,
): string {
  const material = {
    scoringSettings: league.scoring_settings ?? {},
    rosterPositions: league.roster_positions ?? [],
    medianMatch: league.settings?.league_average_match ?? league.settings?.median_match ?? null,
    playoffTeams: league.settings?.playoff_teams ?? null,
  };
  return createHash('sha256').update(JSON.stringify(stable(material))).digest('hex').slice(0, 16);
}

function numeric(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function seasonOrder(a: string, b: string): number {
  return numeric(a) - numeric(b);
}

function rosterPoints(roster: SleeperRoster): number {
  return numeric(roster.settings?.fpts) + numeric(roster.settings?.fpts_decimal) / 100;
}

function rosterPointsAgainst(roster: SleeperRoster): number {
  return numeric(roster.settings?.fpts_against) + numeric(roster.settings?.fpts_against_decimal) / 100;
}

function maxRequestedWeek(league: SleeperLeagueDetail): number {
  const leg = numeric(league.settings?.leg);
  if (leg > 0) return Math.min(18, Math.max(1, leg));
  if (league.status === 'complete') return 18;
  const playoffStart = numeric(league.settings?.playoff_week_start);
  return playoffStart > 0 ? Math.min(18, playoffStart + 3) : 18;
}

async function loadMatchups(league: SleeperLeagueDetail): Promise<{
  weeks: Array<{ week: number; rows: SleeperMatchup[] }>;
  requestedWeeks: number;
  failedWeeks: number[];
}> {
  const requestedWeeks = maxRequestedWeek(league);
  const results = await Promise.allSettled(
    Array.from({ length: requestedWeeks }, (_, index) => index + 1).map(async (week) => ({
      week,
      rows: await sleeperClient.getLeagueMatchups(league.league_id, week),
    })),
  );
  const weeks: Array<{ week: number; rows: SleeperMatchup[] }> = [];
  const failedWeeks: number[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') weeks.push(result.value);
    else failedWeeks.push(index + 1);
  });
  return { weeks, requestedWeeks, failedWeeks };
}

function matchupFacts(
  league: SleeperLeagueDetail,
  rosters: SleeperRoster[],
  weeks: Array<{ week: number; rows: SleeperMatchup[] }>,
): HistoricalMatchupFact[] {
  const owners = new Map(rosters.map((roster) => [roster.roster_id, roster.owner_id ?? null]));
  const playoffWeekStart = numeric(league.settings?.playoff_week_start) || null;
  const facts: HistoricalMatchupFact[] = [];

  weeks.forEach(({ week, rows }) => {
    const grouped = new Map<number, SleeperMatchup[]>();
    rows.forEach((row) => {
      if (!row.matchup_id || row.matchup_id <= 0) return;
      const group = grouped.get(row.matchup_id) ?? [];
      group.push(row);
      grouped.set(row.matchup_id, group);
    });
    rows.forEach((row) => {
      const opponents = row.matchup_id ? grouped.get(row.matchup_id) ?? [] : [];
      const opponent = opponents.find((candidate) => candidate.roster_id !== row.roster_id) ?? null;
      const points = numeric(row.points);
      const opponentPoints = opponent ? numeric(opponent.points) : null;
      facts.push({
        leagueId: league.league_id,
        season: String(league.season),
        week,
        matchupId: row.matchup_id ?? 0,
        isPlayoff: playoffWeekStart !== null && week >= playoffWeekStart,
        rosterId: row.roster_id,
        managerId: owners.get(row.roster_id) ?? null,
        points,
        opponentRosterId: opponent?.roster_id ?? null,
        opponentManagerId: opponent ? owners.get(opponent.roster_id) ?? null : null,
        opponentPoints,
        won: opponentPoints === null ? null : points > opponentPoints,
        tied: opponentPoints !== null && points === opponentPoints,
      });
    });
  });
  return facts.sort((a, b) => a.week - b.week || a.matchupId - b.matchupId || a.rosterId - b.rosterId);
}

function playoffResults(bracket: SleeperBracketMatch[]): {
  playoffRosterIds: number[];
  championRosterId: number | null;
  runnerUpRosterId: number | null;
} {
  const ids = bracket
    .flatMap((match) => [match.t1, match.t2])
    .filter((id): id is number => typeof id === 'number');
  const playoffRosterIds = Array.from(new Set(ids));
  if (!bracket.length) return { playoffRosterIds, championRosterId: null, runnerUpRosterId: null };
  const maxRound = Math.max(...bracket.map((match) => numeric(match.r)));
  const finals = bracket.filter(
    (match) => numeric(match.r) === maxRound && typeof match.w === 'number' && typeof match.l === 'number',
  );
  const final = finals.length === 1 ? finals[0] : finals.find((match) => match.p === 1) ?? null;
  return {
    playoffRosterIds,
    championRosterId: final?.w ?? null,
    runnerUpRosterId: final?.l ?? null,
  };
}

function buildSeason(
  league: SleeperLeagueDetail,
  users: SleeperUser[],
  rosters: SleeperRoster[],
  weeks: Array<{ week: number; rows: SleeperMatchup[] }>,
  bracket: SleeperBracketMatch[],
  requestedWeeks: number,
  failedWeeks: number[],
  bracketLoaded: boolean,
): HistoricalSeason {
  const managers = users.map<HistoricalManager>((user) => ({
    userId: user.user_id,
    displayName: user.display_name || user.username || user.user_id,
    username: user.username ?? null,
    avatar: user.avatar ?? null,
    seasons: [String(league.season)],
  }));
  const ranked = rosters.slice().sort((a, b) => {
    const wins = numeric(b.settings?.wins) - numeric(a.settings?.wins);
    return wins || rosterPoints(b) - rosterPoints(a);
  });
  const pointRanked = rosters.slice().sort((a, b) => rosterPoints(b) - rosterPoints(a));
  const playoffs = playoffResults(bracket);
  const fingerprint = createScoringFingerprint(league);
  return {
    leagueId: league.league_id,
    previousLeagueId: league.previous_league_id ?? null,
    season: String(league.season),
    name: league.name,
    status: league.status ?? null,
    scoringFingerprint: fingerprint,
    scoringEraId: `era-${fingerprint}`,
    scoringSettings: league.scoring_settings ?? {},
    rosterPositions: league.roster_positions ?? [],
    playoffWeekStart: numeric(league.settings?.playoff_week_start) || null,
    users: managers,
    rosterOwners: rosters.map((roster) => ({
      rosterId: roster.roster_id,
      managerId: roster.owner_id ?? null,
      wins: numeric(roster.settings?.wins),
      losses: numeric(roster.settings?.losses),
      ties: numeric(roster.settings?.ties),
      pointsFor: rosterPoints(roster),
      pointsAgainst: rosterPointsAgainst(roster),
    })),
    matchups: matchupFacts(league, rosters, weeks),
    playoffRosterIds: playoffs.playoffRosterIds,
    championRosterId: playoffs.championRosterId,
    runnerUpRosterId: playoffs.runnerUpRosterId,
    regularSeasonChampionRosterId: ranked[0]?.roster_id ?? null,
    pointsLeaderRosterId: pointRanked[0]?.roster_id ?? null,
    coverage: {
      complete: failedWeeks.length === 0 && bracketLoaded,
      requestedWeeks,
      loadedWeeks: weeks.length,
      playoffBracketLoaded: bracketLoaded,
    },
  };
}

function mergeManagers(seasons: HistoricalSeason[]): HistoricalManager[] {
  const merged = new Map<string, HistoricalManager>();
  seasons.forEach((season) => {
    season.users.forEach((manager) => {
      const existing = merged.get(manager.userId);
      if (!existing) {
        merged.set(manager.userId, { ...manager, seasons: [season.season] });
        return;
      }
      existing.displayName = manager.displayName || existing.displayName;
      existing.username = manager.username ?? existing.username;
      existing.avatar = manager.avatar ?? existing.avatar;
      if (!existing.seasons.includes(season.season)) existing.seasons.push(season.season);
    });
  });
  return Array.from(merged.values())
    .map((manager) => ({ ...manager, seasons: manager.seasons.slice().sort(seasonOrder) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function ownerMap(season: HistoricalSeason): Map<number, string | null> {
  return new Map(season.rosterOwners.map((row) => [row.rosterId, row.managerId]));
}

function displayMap(managers: HistoricalManager[]): Map<string, string> {
  return new Map(managers.map((manager) => [manager.userId, manager.displayName]));
}

function managerStreaks(seasons: HistoricalSeason[], managerId: string): { longest: number; current: number } {
  let longest = 0;
  let current = 0;
  let latestSeason: string | null = null;
  seasons.slice().sort((a, b) => seasonOrder(a.season, b.season)).forEach((season) => {
    const games = season.matchups
      .filter((fact) => fact.managerId === managerId && !fact.isPlayoff && fact.opponentManagerId)
      .sort((a, b) => a.week - b.week);
    if (!games.length) return;
    let seasonRun = 0;
    games.forEach((game) => {
      seasonRun = game.won ? seasonRun + 1 : 0;
      longest = Math.max(longest, seasonRun);
    });
    latestSeason = season.season;
    current = seasonRun;
  });
  if (!latestSeason) current = 0;
  return { longest, current };
}

export function deriveManagerCareers(
  seasons: HistoricalSeason[],
  managers: HistoricalManager[],
): ManagerCareerSummary[] {
  return managers.map((manager) => {
    let championships = 0;
    let finals = 0;
    let playoffAppearances = 0;
    let regularSeasonTitles = 0;
    let pointsTitles = 0;
    let wins = 0;
    let losses = 0;
    let ties = 0;
    let pointsFor = 0;
    let pointsAgainst = 0;
    let bestWeeklyScore: number | null = null;

    seasons.forEach((season) => {
      const roster = season.rosterOwners.find((row) => row.managerId === manager.userId);
      if (!roster) return;
      wins += roster.wins;
      losses += roster.losses;
      ties += roster.ties;
      pointsFor += roster.pointsFor;
      pointsAgainst += roster.pointsAgainst;
      if (roster.rosterId === season.championRosterId) championships += 1;
      if (roster.rosterId === season.championRosterId || roster.rosterId === season.runnerUpRosterId) finals += 1;
      if (season.playoffRosterIds.includes(roster.rosterId)) playoffAppearances += 1;
      if (roster.rosterId === season.regularSeasonChampionRosterId) regularSeasonTitles += 1;
      if (roster.rosterId === season.pointsLeaderRosterId) pointsTitles += 1;
      season.matchups.filter((fact) => fact.managerId === manager.userId).forEach((fact) => {
        bestWeeklyScore = bestWeeklyScore === null ? fact.points : Math.max(bestWeeklyScore, fact.points);
      });
    });

    const streaks = managerStreaks(seasons, manager.userId);
    const decisions = wins + losses + ties;
    return {
      managerId: manager.userId,
      displayName: manager.displayName,
      seasons: manager.seasons.length,
      championships,
      finals,
      playoffAppearances,
      regularSeasonTitles,
      pointsTitles,
      wins,
      losses,
      ties,
      winPct: decisions ? wins / decisions : null,
      pointsFor: Number(pointsFor.toFixed(2)),
      pointsAgainst: Number(pointsAgainst.toFixed(2)),
      bestWeeklyScore,
      longestWinStreak: streaks.longest,
      currentWinStreak: streaks.current,
    };
  }).sort((a, b) => b.championships - a.championships || b.wins - a.wins || b.pointsFor - a.pointsFor);
}

function extreme<T>(rows: T[], score: (row: T) => number, direction: 'max' | 'min'): T | null {
  if (!rows.length) return null;
  return rows.reduce((best, row) => {
    const better = direction === 'max' ? score(row) > score(best) : score(row) < score(best);
    return better ? row : best;
  });
}

function matchupRecord(
  id: string,
  label: string,
  fact: HistoricalMatchupFact,
  value: number,
  names: Map<string, string>,
  scoringEraId: string,
): RecordOccurrence {
  return {
    recordId: id,
    recordVersion: 1,
    label,
    scope: 'scoring_era',
    scoringEraId,
    value: Number(value.toFixed(2)),
    unit: 'points',
    managerId: fact.managerId,
    displayName: fact.managerId ? names.get(fact.managerId) ?? fact.managerId : null,
    opponentManagerId: fact.opponentManagerId,
    season: fact.season,
    week: fact.week,
    leagueId: fact.leagueId,
    matchupId: fact.matchupId,
    status: 'historical',
    provenance: {
      source: 'sleeper',
      leagueId: fact.leagueId,
      season: fact.season,
      week: fact.week,
      matchupId: fact.matchupId,
      definition: `${id}.v1`,
    },
  };
}

export function deriveLeagueRecords(
  seasons: HistoricalSeason[],
  managers: HistoricalManager[],
): RecordOccurrence[] {
  const records: RecordOccurrence[] = [];
  const names = displayMap(managers);
  const eraIds = Array.from(new Set(seasons.map((season) => season.scoringEraId)));

  eraIds.forEach((eraId) => {
    const facts = seasons
      .filter((season) => season.scoringEraId === eraId)
      .flatMap((season) => season.matchups)
      .filter((fact) => fact.managerId && fact.opponentPoints !== null);
    const games = facts.filter(
      (fact) => fact.opponentRosterId !== null && fact.rosterId < fact.opponentRosterId,
    );
    const definitions: Array<{
      id: string;
      label: string;
      rows: HistoricalMatchupFact[];
      direction: 'max' | 'min';
      score: (fact: HistoricalMatchupFact) => number;
    }> = [
      { id: 'highest_weekly_score', label: 'Highest weekly score', rows: facts, direction: 'max', score: (fact) => fact.points },
      { id: 'highest_losing_score', label: 'Highest losing score', rows: facts.filter((fact) => fact.won === false && !fact.tied), direction: 'max', score: (fact) => fact.points },
      { id: 'lowest_winning_score', label: 'Lowest winning score', rows: facts.filter((fact) => fact.won === true), direction: 'min', score: (fact) => fact.points },
      { id: 'largest_victory', label: 'Largest victory', rows: facts.filter((fact) => fact.won === true), direction: 'max', score: (fact) => fact.points - (fact.opponentPoints ?? 0) },
      { id: 'closest_victory', label: 'Closest victory', rows: facts.filter((fact) => fact.won === true), direction: 'min', score: (fact) => fact.points - (fact.opponentPoints ?? 0) },
      { id: 'most_combined_points', label: 'Most combined points', rows: games, direction: 'max', score: (fact) => fact.points + (fact.opponentPoints ?? 0) },
      { id: 'lowest_combined_points', label: 'Lowest combined points', rows: games, direction: 'min', score: (fact) => fact.points + (fact.opponentPoints ?? 0) },
      { id: 'highest_playoff_score', label: 'Highest playoff score', rows: facts.filter((fact) => fact.isPlayoff), direction: 'max', score: (fact) => fact.points },
    ];
    definitions.forEach((definition) => {
      const fact = extreme(definition.rows, definition.score, definition.direction);
      if (fact) records.push(matchupRecord(definition.id, definition.label, fact, definition.score(fact), names, eraId));
    });
  });

  const careers = deriveManagerCareers(seasons, managers);
  const careerDefs: Array<{
    id: string;
    label: string;
    key: keyof ManagerCareerSummary;
    unit: RecordOccurrence['unit'];
  }> = [
    { id: 'career_championships', label: 'Career championships', key: 'championships', unit: 'count' },
    { id: 'career_wins', label: 'Career wins', key: 'wins', unit: 'count' },
    { id: 'career_playoff_appearances', label: 'Career playoff appearances', key: 'playoffAppearances', unit: 'count' },
    { id: 'career_points', label: 'Career points scored', key: 'pointsFor', unit: 'points' },
    { id: 'longest_win_streak', label: 'Longest regular-season win streak', key: 'longestWinStreak', unit: 'games' },
  ];
  careerDefs.forEach((definition) => {
    const best = extreme(careers, (career) => Number(career[definition.key] ?? 0), 'max');
    if (!best) return;
    records.push({
      recordId: definition.id,
      recordVersion: 1,
      label: definition.label,
      scope: 'league_series',
      scoringEraId: null,
      value: Number(best[definition.key] ?? 0),
      unit: definition.unit,
      managerId: best.managerId,
      displayName: best.displayName,
      opponentManagerId: null,
      season: null,
      week: null,
      leagueId: null,
      matchupId: null,
      status: 'historical',
      provenance: {
        source: 'sleeper', leagueId: null, season: null, week: null, matchupId: null,
        definition: `${definition.id}.v1`,
      },
    });
  });
  return records;
}

export function deriveRivalries(
  seasons: HistoricalSeason[],
  managers: HistoricalManager[],
): RivalrySeries[] {
  const names = displayMap(managers);
  const rows = new Map<string, RivalrySeries>();
  seasons.flatMap((season) => season.matchups)
    .filter((fact) => fact.opponentRosterId !== null && fact.rosterId < fact.opponentRosterId)
    .forEach((game) => {
      if (!game.managerId || !game.opponentManagerId || game.opponentPoints === null) return;
      const ids = [game.managerId, game.opponentManagerId].sort();
      const managerAId = ids[0];
      const managerBId = ids[1];
      const key = `${managerAId}::${managerBId}`;
      const row = rows.get(key) ?? {
        managerAId,
        managerBId,
        managerAName: names.get(managerAId) ?? managerAId,
        managerBName: names.get(managerBId) ?? managerBId,
        games: 0,
        managerAWins: 0,
        managerBWins: 0,
        ties: 0,
        managerAPoints: 0,
        managerBPoints: 0,
        playoffGames: 0,
        closestMargin: null,
        largestMargin: null,
        firstMeeting: null,
        lastMeeting: null,
      };
      const aIsFact = game.managerId === managerAId;
      const aPoints = aIsFact ? game.points : game.opponentPoints;
      const bPoints = aIsFact ? game.opponentPoints : game.points;
      row.games += 1;
      row.managerAPoints += aPoints;
      row.managerBPoints += bPoints;
      if (aPoints === bPoints) row.ties += 1;
      else if (aPoints > bPoints) row.managerAWins += 1;
      else row.managerBWins += 1;
      if (game.isPlayoff) row.playoffGames += 1;
      const margin = Math.abs(aPoints - bPoints);
      row.closestMargin = row.closestMargin === null ? margin : Math.min(row.closestMargin, margin);
      row.largestMargin = row.largestMargin === null ? margin : Math.max(row.largestMargin, margin);
      const meeting = { season: game.season, week: game.week };
      if (!row.firstMeeting || seasonOrder(meeting.season, row.firstMeeting.season) < 0 || (meeting.season === row.firstMeeting.season && meeting.week < row.firstMeeting.week)) row.firstMeeting = meeting;
      if (!row.lastMeeting || seasonOrder(meeting.season, row.lastMeeting.season) > 0 || (meeting.season === row.lastMeeting.season && meeting.week > row.lastMeeting.week)) row.lastMeeting = meeting;
      rows.set(key, row);
    });

  return Array.from(rows.values()).map((row) => ({
    ...row,
    managerAPoints: Number(row.managerAPoints.toFixed(2)),
    managerBPoints: Number(row.managerBPoints.toFixed(2)),
    closestMargin: row.closestMargin === null ? null : Number(row.closestMargin.toFixed(2)),
    largestMargin: row.largestMargin === null ? null : Number(row.largestMargin.toFixed(2)),
  })).sort((a, b) => b.games - a.games || a.managerAName.localeCompare(b.managerAName));
}

function achievementRarity(count: number, eligible: number): AchievementGrant['rarity'] {
  const rate = eligible ? count / eligible : 1;
  if (rate <= 0.1) return 'legendary';
  if (rate <= 0.25) return 'rare';
  if (rate <= 0.5) return 'uncommon';
  return 'common';
}

export function deriveAchievements(
  seasons: HistoricalSeason[],
  managers: HistoricalManager[],
  careers: ManagerCareerSummary[],
): AchievementGrant[] {
  type Raw = Omit<AchievementGrant, 'rarity' | 'earnedByManagers' | 'eligibleManagers'>;
  const names = displayMap(managers);
  const raw: Raw[] = [];
  const grant = (
    achievementId: string,
    label: string,
    description: string,
    managerId: string,
    season: string | null,
    provenance: Raw['provenance'],
  ) => raw.push({ achievementId, version: 1, label, description, managerId, displayName: names.get(managerId) ?? managerId, season, provenance });

  seasons.forEach((season) => {
    const owners = ownerMap(season);
    const champion = season.championRosterId ? owners.get(season.championRosterId) : null;
    const pointsLeader = season.pointsLeaderRosterId ? owners.get(season.pointsLeaderRosterId) : null;
    const regularLeader = season.regularSeasonChampionRosterId ? owners.get(season.regularSeasonChampionRosterId) : null;
    if (champion) grant('champion', 'Champion', 'Won the league championship.', champion, season.season, [{ leagueId: season.leagueId, season: season.season }]);
    if (pointsLeader) grant('points_king', 'Points King', 'Led the league in regular-season points.', pointsLeader, season.season, [{ leagueId: season.leagueId, season: season.season }]);
    if (champion && champion === regularLeader) grant('wire_to_wire', 'Wire to Wire', 'Finished first in the regular season and won the championship.', champion, season.season, [{ leagueId: season.leagueId, season: season.season }]);
    season.matchups.filter((fact) => fact.isPlayoff && fact.won && fact.managerId && fact.opponentPoints !== null && fact.points - fact.opponentPoints < 1).forEach((fact) => {
      grant('heartbreaker', 'Heartbreaker', 'Won a playoff matchup by less than one point.', fact.managerId!, season.season, [{ leagueId: fact.leagueId, season: fact.season, week: fact.week }]);
    });
  });

  careers.forEach((career) => {
    if (career.longestWinStreak >= 8) grant('on_fire', 'On Fire', 'Won at least eight consecutive regular-season matchups.', career.managerId, null, []);
    if (career.wins >= 100) grant('century_club', 'Century Club', 'Reached 100 career wins in this league series.', career.managerId, null, []);
    const played = seasons.filter((season) => season.rosterOwners.some((row) => row.managerId === career.managerId));
    if (seasons.length > 1 && played.length === seasons.length) grant('original_member', 'Original Member', 'Has participated in every reconstructed season of this league series.', career.managerId, null, played.map((season) => ({ leagueId: season.leagueId, season: season.season })));
    const titleYears = played
      .filter((season) => season.rosterOwners.find((row) => row.managerId === career.managerId)?.rosterId === season.championRosterId)
      .map((season) => numeric(season.season));
    const dynasty = titleYears.some((year) => titleYears.filter((other) => other >= year && other <= year + 2).length >= 2);
    if (dynasty) grant('dynasty', 'Dynasty', 'Won at least two championships within a three-season span.', career.managerId, null, []);
  });

  const earned = new Map<string, Set<string>>();
  raw.forEach((entry) => {
    const managersForAchievement = earned.get(entry.achievementId) ?? new Set<string>();
    managersForAchievement.add(entry.managerId);
    earned.set(entry.achievementId, managersForAchievement);
  });
  return raw.map((entry) => {
    const count = earned.get(entry.achievementId)?.size ?? 0;
    return {
      ...entry,
      earnedByManagers: count,
      eligibleManagers: managers.length,
      rarity: achievementRarity(count, managers.length),
    };
  }).sort((a, b) => seasonOrder(b.season ?? '0', a.season ?? '0') || a.label.localeCompare(b.label));
}

function deriveAlmanac(seasons: HistoricalSeason[], managers: HistoricalManager[]): SeasonAlmanacEntry[] {
  const names = displayMap(managers);
  return seasons.slice().sort((a, b) => seasonOrder(b.season, a.season)).map((season) => {
    const owners = ownerMap(season);
    const championManagerId = season.championRosterId ? owners.get(season.championRosterId) ?? null : null;
    const runnerUpManagerId = season.runnerUpRosterId ? owners.get(season.runnerUpRosterId) ?? null : null;
    const regularSeasonChampionManagerId = season.regularSeasonChampionRosterId ? owners.get(season.regularSeasonChampionRosterId) ?? null : null;
    const pointsLeaderManagerId = season.pointsLeaderRosterId ? owners.get(season.pointsLeaderRosterId) ?? null : null;
    const high = extreme(season.matchups.filter((fact) => fact.managerId), (fact) => fact.points, 'max');
    return {
      leagueId: season.leagueId,
      season: season.season,
      name: season.name,
      scoringEraId: season.scoringEraId,
      championManagerId,
      championName: championManagerId ? names.get(championManagerId) ?? championManagerId : null,
      runnerUpManagerId,
      runnerUpName: runnerUpManagerId ? names.get(runnerUpManagerId) ?? runnerUpManagerId : null,
      regularSeasonChampionManagerId,
      regularSeasonChampionName: regularSeasonChampionManagerId ? names.get(regularSeasonChampionManagerId) ?? regularSeasonChampionManagerId : null,
      pointsLeaderManagerId,
      pointsLeaderName: pointsLeaderManagerId ? names.get(pointsLeaderManagerId) ?? pointsLeaderManagerId : null,
      highestWeeklyScore: high?.points ?? null,
      highestWeeklyScoreManagerId: high?.managerId ?? null,
      highestWeeklyScoreManagerName: high?.managerId ? names.get(high.managerId) ?? high.managerId : null,
      coverageComplete: season.coverage.complete,
    };
  });
}

function deriveScoringEras(seasons: HistoricalSeason[]): LeagueRecordsPayload['scoringEras'] {
  const current = seasons[seasons.length - 1]?.scoringEraId ?? '';
  const eras = new Map<string, LeagueRecordsPayload['scoringEras'][number]>();
  seasons.forEach((season) => {
    const existing = eras.get(season.scoringEraId) ?? {
      id: season.scoringEraId,
      fingerprint: season.scoringFingerprint,
      seasons: [],
      isCurrent: season.scoringEraId === current,
    };
    existing.seasons.push(season.season);
    eras.set(season.scoringEraId, existing);
  });
  return Array.from(eras.values()).map((era) => ({ ...era, seasons: era.seasons.slice().sort(seasonOrder) }));
}

function deriveRecordWatch(
  careers: ManagerCareerSummary[],
  records: RecordOccurrence[],
  currentEraId: string,
): RecordWatchItem[] {
  const watch: RecordWatchItem[] = [];
  const streakRecord = records.find((record) => record.recordId === 'longest_win_streak');
  if (streakRecord) {
    careers.filter((career) => career.currentWinStreak > 0 && career.currentWinStreak < streakRecord.value).forEach((career) => {
      watch.push({
        recordId: streakRecord.recordId,
        label: 'Win-streak record watch',
        managerId: career.managerId,
        displayName: career.displayName,
        currentValue: career.currentWinStreak,
        recordValue: streakRecord.value,
        distance: streakRecord.value - career.currentWinStreak,
        scoringEraId: null,
      });
    });
  }
  const high = records.find((record) => record.recordId === 'highest_weekly_score' && record.scoringEraId === currentEraId);
  if (high?.managerId) {
    watch.push({
      recordId: high.recordId,
      label: 'Current scoring-era high score',
      managerId: high.managerId,
      displayName: high.displayName ?? high.managerId,
      currentValue: high.value,
      recordValue: high.value,
      distance: 0,
      scoringEraId: currentEraId,
    });
  }
  return watch.sort((a, b) => a.distance - b.distance).slice(0, 8);
}

export async function buildLeagueRecordsPayload(
  currentLeagueId: string,
  options?: { maxSeasons?: number; bypassCache?: boolean },
): Promise<LeagueRecordsPayload> {
  const maxSeasons = Math.min(HARD_MAX_SEASONS, Math.max(1, Math.trunc(options?.maxSeasons ?? DEFAULT_MAX_SEASONS)));
  const cacheKey = `${currentLeagueId}:${maxSeasons}`;
  const cached = cache.get(cacheKey);
  if (!options?.bypassCache && cached && cached.expiresAt > Date.now()) return cached.payload;

  const diagnostics: HistoryDiagnostic[] = [];
  const seasons: HistoricalSeason[] = [];
  const seen = new Set<string>();
  let nextLeagueId: string | null = currentLeagueId;
  let requested = 0;

  while (nextLeagueId && requested < maxSeasons) {
    if (seen.has(nextLeagueId)) {
      diagnostics.push({ leagueId: nextLeagueId, code: 'lineage_cycle', message: 'Sleeper previous_league_id lineage contains a cycle; traversal stopped.' });
      break;
    }
    seen.add(nextLeagueId);
    requested += 1;

    let league: SleeperLeagueDetail;
    try {
      league = await sleeperClient.getLeague(nextLeagueId);
    } catch (error) {
      diagnostics.push({ leagueId: nextLeagueId, code: 'league_unavailable', message: (error as Error).message || 'Sleeper league could not be loaded.' });
      break;
    }

    const results = await Promise.allSettled([
      sleeperClient.getLeagueUsers(nextLeagueId),
      sleeperClient.getLeagueRosters(nextLeagueId),
      loadMatchups(league),
      sleeperClient.getWinnersBracket(nextLeagueId),
    ]);
    const users = results[0].status === 'fulfilled' ? results[0].value as SleeperUser[] : [];
    const rosters = results[1].status === 'fulfilled' ? results[1].value as SleeperRoster[] : [];
    const matchupData = results[2].status === 'fulfilled'
      ? results[2].value as Awaited<ReturnType<typeof loadMatchups>>
      : { weeks: [], requestedWeeks: maxRequestedWeek(league), failedWeeks: Array.from({ length: maxRequestedWeek(league) }, (_, index) => index + 1) };
    const bracket = results[3].status === 'fulfilled' ? results[3].value as SleeperBracketMatch[] : [];
    const bracketLoaded = results[3].status === 'fulfilled';
    const partial = results.some((result) => result.status === 'rejected') || matchupData.failedWeeks.length > 0;
    if (partial) {
      diagnostics.push({
        leagueId: nextLeagueId,
        season: String(league.season),
        code: 'season_partial',
        message: `Season loaded with incomplete Sleeper coverage${matchupData.failedWeeks.length ? `; matchup weeks unavailable: ${matchupData.failedWeeks.join(', ')}` : ''}.`,
      });
    }
    seasons.push(buildSeason(
      league,
      users,
      rosters,
      matchupData.weeks,
      bracket,
      matchupData.requestedWeeks,
      matchupData.failedWeeks,
      bracketLoaded,
    ));
    nextLeagueId = league.previous_league_id ?? null;
  }

  if (nextLeagueId && requested >= maxSeasons) {
    diagnostics.push({ leagueId: nextLeagueId, code: 'lineage_depth_limit', message: `History traversal stopped at the configured ${maxSeasons}-season safety limit.` });
  }
  seasons.sort((a, b) => seasonOrder(a.season, b.season));
  if (!seasons.length) throw new Error('No Sleeper league history could be reconstructed.');

  const managers = mergeManagers(seasons);
  const careers = deriveManagerCareers(seasons, managers);
  const records = deriveLeagueRecords(seasons, managers);
  const rivalries = deriveRivalries(seasons, managers);
  const achievements = deriveAchievements(seasons, managers, careers);
  const almanac = deriveAlmanac(seasons, managers);
  const scoringEras = deriveScoringEras(seasons);
  const currentSeason = seasons.find((season) => season.leagueId === currentLeagueId) ?? seasons[seasons.length - 1];
  const payload: LeagueRecordsPayload = {
    success: true,
    generatedAt: new Date().toISOString(),
    currentLeagueId,
    leagueName: currentSeason.name,
    seasons,
    managers,
    careers,
    records,
    rivalries,
    achievements,
    almanac,
    recordWatch: deriveRecordWatch(careers, records, currentSeason.scoringEraId),
    scoringEras,
    coverage: {
      complete: diagnostics.length === 0 && seasons.every((season) => season.coverage.complete),
      seasonsRequested: requested,
      seasonsLoaded: seasons.length,
      diagnostics,
    },
  };
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  return payload;
}
