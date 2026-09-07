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
  scoringEras: Array<{
    id: string;
    fingerprint: string;
    seasons: string[];
    isCurrent: boolean;
  }>;
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

export function createScoringFingerprint(league: Pick<SleeperLeagueDetail, 'scoring_settings' | 'roster_positions' | 'settings'>): string {
  const material = {
    scoringSettings: league.scoring_settings ?? {},
    rosterPositions: league.roster_positions ?? [],
    medianMatch: league.settings?.league_average_match ?? league.settings?.median_match ?? null,
    playoffTeams: league.settings?.playoff_teams ?? null,
  };
  return createHash('sha256').update(JSON.stringify(stable(material))).digest('hex').slice(0, 16);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rosterPoints(roster: SleeperRoster): number {
  const whole = toFiniteNumber(roster.settings?.fpts, 0);
  const decimal = toFiniteNumber(roster.settings?.fpts_decimal, 0) / 100;
  return whole + decimal;
}

function rosterPointsAgainst(roster: SleeperRoster): number {
  const whole = toFiniteNumber(roster.settings?.fpts_against, 0);
  const decimal = toFiniteNumber(roster.settings?.fpts_against_decimal, 0) / 100;
  return whole + decimal;
}

function sortSeasonAsc(a: string, b: string): number {
  return toFiniteNumber(a) - toFiniteNumber(b);
}

function managerNameMap(managers: HistoricalManager[]): Map<string, string> {
  return new Map(managers.map((manager) => [manager.userId, manager.displayName]));
}

function rosterOwnerMap(season: HistoricalSeason): Map<number, string | null> {
  return new Map(season.rosterOwners.map((row) => [row.rosterId, row.managerId]));
}

function maxRequestedWeek(league: SleeperLeagueDetail): number {
  const currentLeg = toFiniteNumber(league.settings?.leg, 0);
  if (currentLeg > 0) return Math.min(18, Math.max(1, currentLeg));
  if (league.status === 'complete') return 18;
  const playoffStart = toFiniteNumber(league.settings?.playoff_week_start, 0);
  return playoffStart > 0 ? Math.min(18, playoffStart + 3) : 18;
}

async function loadMatchupWeeks(league: SleeperLeagueDetail): Promise<{
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

function deriveMatchupFacts(
  league: SleeperLeagueDetail,
  rosters: SleeperRoster[],
  matchupWeeks: Array<{ week: number; rows: SleeperMatchup[] }>,
): HistoricalMatchupFact[] {
  const ownerByRoster = new Map(rosters.map((roster) => [roster.roster_id, roster.owner_id ?? null]));
  const playoffWeekStart = toFiniteNumber(league.settings?.playoff_week_start, 0) || null;
  const facts: HistoricalMatchupFact[] = [];

  for (const { week, rows } of matchupWeeks) {
    const byMatchup = new Map<number, SleeperMatchup[]>();
    rows.forEach((row) => {
      if (!row.matchup_id || row.matchup_id <= 0) return;
      const bucket = byMatchup.get(row.matchup_id) ?? [];
      bucket.push(row);
      byMatchup.set(row.matchup_id, bucket);
    });

    for (const row of rows) {
      const opponents = row.matchup_id ? byMatchup.get(row.matchup_id) ?? [] : [];
      const opponent = opponents.find((candidate) => candidate.roster_id !== row.roster_id) ?? null;
      const points = toFiniteNumber(row.points, 0);
      const opponentPoints = opponent ? toFiniteNumber(opponent.points, 0) : null;
      facts.push({
        leagueId: league.league_id,
        season: String(league.season),
        week,
        matchupId: row.matchup_id ?? 0,
        isPlayoff: playoffWeekStart !== null && week >= playoffWeekStart,
        rosterId: row.roster_id,
        managerId: ownerByRoster.get(row.roster_id) ?? null,
        points,
        opponentRosterId: opponent?.roster_id ?? null,
        opponentManagerId: opponent ? ownerByRoster.get(opponent.roster_id) ?? null : null,
        opponentPoints,
        won: opponentPoints === null ? null : points === opponentPoints ? false : points > opponentPoints,
        tied: opponentPoints !== null && points === opponentPoints,
      });
    }
  }

  return facts.sort((a, b) => a.week - b.week || a.matchupId - b.matchupId || a.rosterId - b.rosterId);
}

function derivePlayoffResults(bracket: SleeperBracketMatch[]): {
  playoffRosterIds: number[];
  championRosterId: number | null;
  runnerUpRosterId: number | null;
} {
  const playoffRosterIds = Array.from(new Set(bracket.flatMap((match) => [match.t1, match.t2]).filter((id): id is number => typeof id === 'number')));
  if (bracket.length === 0) return { playoffRosterIds, championRosterId: null, runnerUpRosterId: null };
  const maxRound = Math.max(...bracket.map((match) => toFiniteNumber(match.r, 0)));
  const finals = bracket.filter((match) => toFiniteNumber(match.r, 0) === maxRound && typeof match.w === 'number' && typeof match.l === 'number');
  const final = finals.length === 1 ? finals[0] : finals.find((match) => match.p === 1) ?? null;
  return {
    playoffRosterIds,
    championRosterId: final?.w ?? null,
    runnerUpRosterId: final?.l ?? null,
  };
}

function seasonRosterRanks(rosters: SleeperRoster[]): SleeperRoster[] {
  return [...rosters].sort((a, b) => {
    const aw = toFiniteNumber(a.settings?.wins, 0);
    const bw = toFiniteNumber(b.settings?.wins, 0);
    if (bw !== aw) return bw - aw;
    return rosterPoints(b) - rosterPoints(a);
  });
}

function buildSeason(
  league: SleeperLeagueDetail,
  users: SleeperUser[],
  rosters: SleeperRoster[],
  matchupWeeks: Array<{ week: number; rows: SleeperMatchup[] }>,
  winnerBracket: SleeperBracketMatch[],
  failedWeeks: number[],
  requestedWeeks: number,
  bracketLoaded: boolean,
): HistoricalSeason {
  const managers: HistoricalManager[] = users.map((user) => ({
    userId: user.user_id,
    displayName: user.display_name || user.username || user.user_id,
    username: user.username ?? null,
    avatar: user.avatar ?? null,
    seasons: [String(league.season)],
  }));
  const ranked = seasonRosterRanks(rosters);
  const pointsLeader = [...rosters].sort((a, b) => rosterPoints(b) - rosterPoints(a))[0] ?? null;
  const playoffs = derivePlayoffResults(winnerBracket);
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
    playoffWeekStart: toFiniteNumber(league.settings?.playoff_week_start, 0) || null,
    users: managers,
    rosterOwners: rosters.map((roster) => ({
      rosterId: roster.roster_id,
      managerId: roster.owner_id ?? null,
      wins: toFiniteNumber(roster.settings?.wins, 0),
      losses: toFiniteNumber(roster.settings?.losses, 0),
      ties: toFiniteNumber(roster.settings?.ties, 0),
      pointsFor: rosterPoints(roster),
      pointsAgainst: rosterPointsAgainst(roster),
    })),
    matchups: deriveMatchupFacts(league, rosters, matchupWeeks),
    playoffRosterIds: playoffs.playoffRosterIds,
    championRosterId: playoffs.championRosterId,
    runnerUpRosterId: playoffs.runnerUpRosterId,
    regularSeasonChampionRosterId: ranked[0]?.roster_id ?? null,
    pointsLeaderRosterId: pointsLeader?.roster_id ?? null,
    coverage: {
      complete: failedWeeks.length === 0 && bracketLoaded,
      requestedWeeks,
      loadedWeeks: matchupWeeks.length,
      playoffBracketLoaded: bracketLoaded,
    },
  };
}

function mergeManagers(seasons: HistoricalSeason[]): HistoricalManager[] {
  const merged = new Map<string, HistoricalManager>();
  for (const season of seasons) {
    for (const manager of season.users) {
      const current = merged.get(manager.userId);
      if (!current) {
        merged.set(manager.userId, { ...manager, seasons: [season.season] });
      } else {
        current.displayName = manager.displayName || current.displayName;
        current.username = manager.username ?? current.username;
        current.avatar = manager.avatar ?? current.avatar;
        if (!current.seasons.includes(season.season)) current.seasons.push(season.season);
      }
    }
  }
  return [...merged.values()]
    .map((manager) => ({ ...manager, seasons: manager.seasons.sort(sortSeasonAsc) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function uniqueGames(seasons: HistoricalSeason[]): HistoricalMatchupFact[] {
  return seasons.flatMap((season) => season.matchups).filter((fact) => {
    if (fact.opponentRosterId === null) return false;
    return fact.rosterId < fact.opponentRosterId;
  });
}

function managerStreaks(seasons: HistoricalSeason[], managerId: string): { longest: number; current: number } {
  const games = seasons
    .flatMap((season) => season.matchups)
    .filter((fact) => fact.managerId === managerId && !fact.isPlayoff && fact.opponentManagerId)
    .sort((a, b) => sortSeasonAsc(a.season, b.season) || a.week - b.week);
  let longest = 0;
  let running = 0;
  for (const game of games) {
    if (game.won) running += 1;
    else running = 0;
    longest = Math.max(longest, running);
  }
  return { longest, current: running };
}

export function deriveManagerCareers(seasons: HistoricalSeason[], managers: HistoricalManager[]): ManagerCareerSummary[] {
  const names = managerNameMap(managers);
  return managers.map((manager) => {
    let wins = 0;
    let losses = 0;
    let ties = 0;
    let pointsFor = 0;
    let pointsAgainst = 0;
    let championships = 0;
    let finals = 0;
    let playoffAppearances = 0;
    let regularSeasonTitles = 0;
    let pointsTitles = 0;
    let bestWeeklyScore: number | null = null;

    for (const season of seasons) {
      const roster = season.rosterOwners.find((row) => row.managerId === manager.userId);
      if (!roster) continue;
      wins += roster.wins;
      losses += roster.losses;
      ties += roster.ties;
      pointsFor += roster.pointsFor;
      pointsAgainst += roster.pointsAgainst;
      if (season.championRosterId === roster.rosterId) championships += 1;
      if (season.championRosterId === roster.rosterId || season.runnerUpRosterId === roster.rosterId) finals += 1;
      if (season.playoffRosterIds.includes(roster.rosterId)) playoffAppearances += 1;
      if (season.regularSeasonChampionRosterId === roster.rosterId) regularSeasonTitles += 1;
      if (season.pointsLeaderRosterId === roster.rosterId) pointsTitles += 1;
      for (const matchup of season.matchups.filter((fact) => fact.managerId === manager.userId)) {
        bestWeeklyScore = bestWeeklyScore === null ? matchup.points : Math.max(bestWeeklyScore, matchup.points);
      }
    }

    const streaks = managerStreaks(seasons, manager.userId);
    const decisions = wins + losses + ties;
    return {
      managerId: manager.userId,
      displayName: names.get(manager.userId) ?? manager.displayName,
      seasons: manager.seasons.length,
      championships,
      finals,
      playoffAppearances,
      regularSeasonTitles,
      pointsTitles,
      wins,
      losses,
      ties,
      winPct: decisions > 0 ? wins / decisions : null,
      pointsFor: Number(pointsFor.toFixed(2)),
      pointsAgainst: Number(pointsAgainst.toFixed(2)),
      bestWeeklyScore,
      longestWinStreak: streaks.longest,
      currentWinStreak: streaks.current,
    };
  }).sort((a, b) => b.championships - a.championships || b.wins - a.wins || b.pointsFor - a.pointsFor);
}

function recordFromFact(
  recordId: string,
  label: string,
  fact: HistoricalMatchupFact,
  value: number,
  displayNames: Map<string, string>,
  scope: RecordScope,
  scoringEraId: string | null,
): RecordOccurrence {
  return {
    recordId,
    recordVersion: 1,
    label,
    scope,
    scoringEraId,
    value: Number(value.toFixed(2)),
    unit: 'points',
    managerId: fact.managerId,
    displayName: fact.managerId ? displayNames.get(fact.managerId) ?? fact.managerId : null,
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
      definition: `${recordId}.v1`,
    },
  };
}

function extrema<T>(rows: T[], score: (row: T) => number, direction: 'max' | 'min'): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, row) => {
    const current = score(row);
    const bestScore = score(best);
    return direction === 'max' ? (current > bestScore ? row : best) : (current < bestScore ? row : best);
  });
}

export function deriveLeagueRecords(seasons: HistoricalSeason[], managers: HistoricalManager[]): RecordOccurrence[] {
  const displayNames = managerNameMap(managers);
  const records: RecordOccurrence[] = [];
  const eraIds = Array.from(new Set(seasons.map((season) => season.scoringEraId)));

  for (const eraId of eraIds) {
    const facts = seasons.filter((season) => season.scoringEraId === eraId).flatMap((season) => season.matchups).filter((fact) => fact.opponentPoints !== null && fact.managerId);
    const games = facts.filter((fact) => fact.opponentRosterId !== null && fact.rosterId < fact.opponentRosterId);
    const candidates: Array<[string, string, HistoricalMatchupFact | null, (fact: HistoricalMatchupFact) => number]> = [
      ['highest_weekly_score', 'Highest weekly score', extrema(facts, (fact) => fact.points, 'max'), (fact) => fact.points],
      ['highest_losing_score', 'Highest losing score', extrema(facts.filter((fact) => fact.won === false && !fact.tied), (fact) => fact.points, 'max'), (fact) => fact.points],
      ['lowest_winning_score', 'Lowest winning score', extrema(facts.filter((fact) => fact.won === true), (fact) => fact.points, 'min'), (fact) => fact.points],
      ['largest_victory', 'Largest victory', extrema(facts.filter((fact) => fact.won === true), (fact) => fact.points - (fact.opponentPoints ?? 0), 'max'), (fact) => fact.points - (fact.opponentPoints ?? 0)],
      ['closest_victory', 'Closest victory', extrema(facts.filter((fact) => fact.won === true), (fact) => fact.points - (fact.opponentPoints ?? 0), 'min'), (fact) => fact.points - (fact.opponentPoints ?? 0)],
      ['most_combined_points', 'Most combined points', extrema(games, (fact) => fact.points + (fact.opponentPoints ?? 0), 'max'), (fact) => fact.points + (fact.opponentPoints ?? 0)],
      ['lowest_combined_points', 'Lowest combined points', extrema(games, (fact) => fact.points + (fact.opponentPoints ?? 0), 'min'), (fact) => fact.points + (fact.opponentPoints ?? 0)],
      ['highest_playoff_score', 'Highest playoff score', extrema(facts.filter((fact) => fact.isPlayoff), (fact) => fact.points, 'max'), (fact) => fact.points],
    ];
    candidates.forEach(([id, label, fact, score]) => {
      if (fact) records.push(recordFromFact(id, label, fact, score(fact), displayNames, 'scoring_era', eraId));
    });
  }

  const careerRows = deriveManagerCareers(seasons, managers);
  const careerDefinitions: Array<[string, string, keyof ManagerCareerSummary]> = [
    ['career_championships', 'Career championships', 'championships'],
    ['career_wins', 'Career wins', 'wins'],
    ['career_playoff_appearances', 'Career playoff appearances', 'playoffAppearances'],
    ['career_points', 'Career points scored', 'pointsFor'],
    ['longest_win_streak', 'Longest regular-season win streak', 'longestWinStreak'],
  ];
  for (const [recordId, label, key] of careerDefinitions) {
    const best = extrema(careerRows, (row) => Number(row[key] ?? 0), 'max');
    if (!best) continue;
    records.push({
      recordId,
      recordVersion: 1,
      label,
      scope: 'league_series',
      scoringEraId: null,
      value: Number(best[key] ?? 0),
      unit: key === 'pointsFor' ? 'points' : key === 'longestWinStreak' ? 'games' : 'count',
      managerId: best.managerId,
      displayName: best.displayName,
      opponentManagerId: null,
      season: null,
      week: null,
      leagueId: null,
      matchupId: null,
      status: 'historical',
      provenance: {
        source: 'sleeper',
        leagueId: null,
        season: null,
        week: null,
        matchupId: null,
        definition: `${recordId}.v1`,
      },
    });
  }
  return records;
}

export function deriveRivalries(seasons: HistoricalSeason[], managers: HistoricalManager[]): RivalrySeries[] {
  const names = managerNameMap(managers);
  const series = new Map<string, RivalrySeries>();
  for (const game of uniqueGames(seasons)) {
    if (!game.managerId || !game.opponentManagerId || game.opponentPoints === null) continue;
    const [managerAId, managerBId] = [game.managerId, game.opponentManagerId].sort();
    const key = `${managerAId}::${managerBId}`;
    const row = series.get(key) ?? {
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
    if (!row.firstMeeting || sortSeasonAsc(meeting.season, row.firstMeeting.season) < 0 || (meeting.season === row.firstMeeting.season && meeting.week < row.firstMeeting.week)) row.firstMeeting = meeting;
    if (!row.lastMeeting || sortSeasonAsc(meeting.season, row.lastMeeting.season) > 0 || (meeting.season === row.lastMeeting.season && meeting.week > row.lastMeeting.week)) row.lastMeeting = meeting;
    series.set(key, row);
  }
  return [...series.values()]
    .map((row) => ({
      ...row,
      managerAPoints: Number(row.managerAPoints.toFixed(2)),
      managerBPoints: Number(row.managerBPoints.toFixed(2)),
      closestMargin: row.closestMargin === null ? null : Number(row.closestMargin.toFixed(2)),
      largestMargin: row.largestMargin === null ? null : Number(row.largestMargin.toFixed(2)),
    }))
    .sort((a, b) => b.games - a.games || a.managerAName.localeCompare(b.managerAName));
}

function rarity(earnedByManagers: number, eligibleManagers: number): AchievementGrant['rarity'] {
  if (eligibleManagers <= 0) return 'common';
  const rate = earnedByManagers / eligibleManagers;
  if (rate <= 0.1) return 'legendary';
  if (rate <= 0.25) return 'rare';
  if (rate <= 0.5) return 'uncommon';
  return 'common';
}

export function deriveAchievements(seasons: HistoricalSeason[], managers: HistoricalManager[], careers: ManagerCareerSummary[]): AchievementGrant[] {
  const names = managerNameMap(managers);
  const raw: Array<Omit<AchievementGrant, 'rarity' | 'earnedByManagers' | 'eligibleManagers'>> = [];
  const grant = (achievementId: string, label: string, description: string, managerId: string, season: string | null, provenance: AchievementGrant['provenance']) => {
    raw.push({ achievementId, version: 1, label, description, managerId, displayName: names.get(managerId) ?? managerId, season, provenance });
  };

  for (const season of seasons) {
    const ownerByRoster = rosterOwnerMap(season);
    const championId = season.championRosterId ? ownerByRoster.get(season.championRosterId) : null;
    const pointsLeaderId = season.pointsLeaderRosterId ? ownerByRoster.get(season.pointsLeaderRosterId) : null;
    const regularId = season.regularSeasonChampionRosterId ? ownerByRoster.get(season.regularSeasonChampionRosterId) : null;
    if (championId) grant('champion', 'Champion', 'Won the league championship.', championId, season.season, [{ leagueId: season.leagueId, season: season.season }]);
    if (pointsLeaderId) grant('points_king', 'Points King', 'Led the league in regular-season points.', pointsLeaderId, season.season, [{ leagueId: season.leagueId, season: season.season }]);
    if (championId && regularId === championId) grant('wire_to_wire', 'Wire to Wire', 'Finished first in the regular season and won the championship.', championId, season.season, [{ leagueId: season.leagueId, season: season.season }]);

    for (const fact of season.matchups.filter((matchup) => matchup.isPlayoff && matchup.won && matchup.managerId && matchup.opponentPoints !== null)) {
      if (fact.points - fact.opponentPoints! < 1) {
        grant('heartbreaker', 'Heartbreaker', 'Won a playoff matchup by less than one point.', fact.managerId!, season.season, [{ leagueId: fact.leagueId, season: fact.season, week: fact.week }]);
      }
    }
  }

  for (const career of careers) {
    if (career.longestWinStreak >= 8) grant('on_fire', 'On Fire', 'Won at least eight consecutive regular-season matchups.', career.managerId, null, []);
    if (career.wins >= 100) grant('century_club', 'Century Club', 'Reached 100 career wins in this league series.', career.managerId, null, []);
    const managerSeasons = seasons.filter((season) => season.rosterOwners.some((row) => row.managerId === career.managerId));
    if (managerSeasons.length === seasons.length && seasons.length > 1) {
      grant('original_member', 'Original Member', 'Has participated in every reconstructed season of this league series.', career.managerId, null, managerSeasons.map((season) => ({ leagueId: season.leagueId, season: season.season })));
    }
    const titleYears = managerSeasons.filter((season) => season.rosterOwners.find((row) => row.managerId === career.managerId)?.rosterId === season.championRosterId).map((season) => toFiniteNumber(season.season));
    const dynasty = titleYears.some((year) => titleYears.filter((other) => other >= year && other <= year + 2).length >= 2);
    if (dynasty) grant('dynasty', 'Dynasty', 'Won at least two championships within a three-season span.', career.managerId, null, []);
  }

  const uniqueManagersByAchievement = new Map<string, Set<string>>();
  raw.forEach((entry) => {
    const set = uniqueManagersByAchievement.get(entry.achievementId) ?? new Set<string>();
    set.add(entry.managerId);
    uniqueManagersByAchievement.set(entry.achievementId, set);
  });
  return raw.map((entry) => {
    const earnedByManagers = uniqueManagersByAchievement.get(entry.achievementId)?.size ?? 0;
    return {
      ...entry,
      earnedByManagers,
      eligibleManagers: managers.length,
      rarity: rarity(earnedByManagers, managers.length),
    };
  }).sort((a, b) => sortSeasonAsc(b.season ?? '0', a.season ?? '0') || a.label.localeCompare(b.label));
}

export function deriveAlmanac(seasons: HistoricalSeason[], managers: HistoricalManager[]): SeasonAlmanacEntry[] {
  const names = managerNameMap(managers);
  return [...seasons].sort((a, b) => sortSeasonAsc(b.season, a.season)).map((season) => {
    const owners = rosterOwnerMap(season);
    const championManagerId = season.championRosterId ? owners.get(season.championRosterId) ?? null : null;
    const runnerUpManagerId = season.runnerUpRosterId ? owners.get(season.runnerUpRosterId) ?? null : null;
    const regularSeasonChampionManagerId = season.regularSeasonChampionRosterId ? owners.get(season.regularSeasonChampionRosterId) ?? null : null;
    const pointsLeaderManagerId = season.pointsLeaderRosterId ? owners.get(season.pointsLeaderRosterId) ?? null : null;
    const highest = extrema(season.matchups.filter((fact) => fact.managerId), (fact) => fact.points, 'max');
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
      highestWeeklyScore: highest?.points ?? null,
      highestWeeklyScoreManagerId: highest?.managerId ?? null,
      highestWeeklyScoreManagerName: highest?.managerId ? names.get(highest.managerId) ?? highest.managerId : null,
      coverageComplete: season.coverage.complete,
    };
  });
}

function deriveRecordWatch(careers: ManagerCareerSummary[], records: RecordOccurrence[], currentEraId: string): RecordWatchItem[] {
  const streakRecord = records.find((record) => record.recordId === 'longest_win_streak');
  const eraScoreRecord = records.find((record) => record.recordId === 'highest_weekly_score' && record.scoringEraId === currentEraId);
  const watch: RecordWatchItem[] = [];
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
  if (eraScoreRecord?.managerId) {
    watch.push({
      recordId: eraScoreRecord.recordId,
      label: 'Current scoring-era high score',
      managerId: eraScoreRecord.managerId,
      displayName: eraScoreRecord.displayName ?? eraScoreRecord.managerId,
      currentValue: eraScoreRecord.value,
      recordValue: eraScoreRecord.value,
      distance: 0,
      scoringEraId: currentEraId,
    });
  }
  return watch.sort((a, b) => a.distance - b.distance).slice(0, 8);
}

function scoringEras(seasons: HistoricalSeason[]): LeagueRecordsPayload['scoringEras'] {
  const currentEraId = seasons[seasons.length - 1]?.scoringEraId ?? '';
  const eras = new Map<string, { id: string; fingerprint: string; seasons: string[]; isCurrent: boolean }>();
  for (const season of seasons) {
    const row = eras.get(season.scoringEraId) ?? {
      id: season.scoringEraId,
      fingerprint: season.scoringFingerprint,
      seasons: [],
      isCurrent: season.scoringEraId === currentEraId,
    };
    row.seasons.push(season.season);
    eras.set(season.scoringEraId, row);
  }
  return [...eras.values()].map((era) => ({ ...era, seasons: era.seasons.sort(sortSeasonAsc) }));
}

export async function buildLeagueRecordsPayload(currentLeagueId: string, options?: { maxSeasons?: number; bypassCache?: boolean }): Promise<LeagueRecordsPayload> {
  const maxSeasons = Math.min(25, Math.max(1, options?.maxSeasons ?? DEFAULT_MAX_SEASONS));
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

    const [usersResult, rostersResult, matchupsResult, bracketResult] = await Promise.allSettled([
      sleeperClient.getLeagueUsers(nextLeagueId),
      sleeperClient.getLeagueRosters(nextLeagueId),
      loadMatchupWeeks(league),
      sleeperClient.getWinnersBracket(nextLeagueId),
    ]);

    const users = usersResult.status === 'fulfilled' ? usersResult.value : [];
    const rosters = rostersResult.status === 'fulfilled' ? rostersResult.value : [];
    const matchupData = matchupsResult.status === 'fulfilled' ? matchupsResult.value : { weeks: [], requestedWeeks: maxRequestedWeek(league), failedWeeks: Array.from({ length: maxRequestedWeek(league) }, (_, i) => i + 1) };
    const winnerBracket = bracketResult.status === 'fulfilled' ? bracketResult.value : [];
    const bracketLoaded = bracketResult.status === 'fulfilled';
    const partial = usersResult.status === 'rejected' || rostersResult.status === 'rejected' || matchupsResult.status === 'rejected' || bracketResult.status === 'rejected' || matchupData.failedWeeks.length > 0;
    if (partial) {
      diagnostics.push({
        leagueId: nextLeagueId,
        season: String(league.season),
        code: 'season_partial',
        message: `Season loaded with incomplete Sleeper coverage${matchupData.failedWeeks.length ? `; matchup weeks unavailable: ${matchupData.failedWeeks.join(', ')}` : ''}.`,
      });
    }

    seasons.push(buildSeason(league, users, rosters, matchupData.weeks, winnerBracket, matchupData.failedWeeks, matchupData.requestedWeeks, bracketLoaded));
    nextLeagueId = league.previous_league_id ?? null;
  }

  if (nextLeagueId && requested >= maxSeasons) {
    diagnostics.push({ leagueId: nextLeagueId, code: 'lineage_depth_limit', message: `History traversal stopped at the configured ${maxSeasons}-season safety limit.` });
  }

  seasons.sort((a, b) => sortSeasonAsc(a.season, b.season));
  if (seasons.length === 0) throw new Error('No Sleeper league history could be reconstructed.');
  const managers = mergeManagers(seasons);
  const careers = deriveManagerCareers(seasons, managers);
  const records = deriveLeagueRecords(seasons, managers);
  const rivalries = deriveRivalries(seasons, managers);
  const achievements = deriveAchievements(seasons, managers, careers);
  const almanac = deriveAlmanac(seasons, managers);
  const eras = scoringEras(seasons);
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
    scoringEras: eras,
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
