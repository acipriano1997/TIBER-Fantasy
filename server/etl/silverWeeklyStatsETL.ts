/**
 * Silver Layer ETL: bronze_nflfastr_plays → silver_player_weekly_stats
 *
 * Aggregates play-by-play data from the Bronze layer into weekly player stats.
 *
 * Metrics aggregated:
 * - Passing: attempts, completions, yards, TDs, INTs, EPA
 * - Receiving: targets, receptions, yards, TDs, air_yards, YAC, EPA
 * - Rushing: attempts, yards, TDs, EPA
 *
 * Usage:
 *   npx tsx server/etl/silverWeeklyStatsETL.ts [season] [startWeek] [endWeek]
 *   npx tsx server/etl/silverWeeklyStatsETL.ts 2025           # All available weeks
 *   npx tsx server/etl/silverWeeklyStatsETL.ts 2025 1 17      # Weeks 1-17
 */

import { db } from '../infra/db';
import { sql, eq, and } from 'drizzle-orm';
import { silverPlayerWeeklyStats, bronzeNflfastrPlays } from '@shared/schema';

interface PlayerWeekStats {
  playerId: string;
  playerName: string;
  position: string | null;
  team: string | null;
  season: number;
  week: number;

  // Passing
  passAttempts: number;
  completions: number;
  passingYards: number;
  passingTds: number;
  interceptions: number;
  passingEpa: number;

  // Receiving
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTds: number;
  receivingEpa: number;
  airYards: number;
  yac: number;

  // Usage/Opportunity
  snaps: number;
  routes: number;

  // Rushing
  rushAttempts: number;
  rushingYards: number;
  rushingTds: number;
  rushingEpa: number;

  // Efficiency metrics
  stuffed: number;        // TFL count
  firstDownsRush: number;
  firstDownsRec: number;

  // Red zone metrics
  rzRushAtt: number;
  rzTargets: number;
}

async function getAvailableWeeks(season: number): Promise<number[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT week
    FROM bronze_nflfastr_plays
    WHERE season = ${season}
    ORDER BY week
  `);
  return (result.rows as any[]).map(r => r.week);
}

async function aggregateWeek(season: number, week: number): Promise<PlayerWeekStats[]> {
  console.log(`  Aggregating week ${week}...`);

  // Aggregate passing stats
  const passingResult = await db.execute(sql`
    SELECT
      passer_player_id as player_id,
      passer_player_name as player_name,
      posteam as team,
      COUNT(*) FILTER (WHERE play_type = 'pass') as pass_attempts,
      COUNT(*) FILTER (WHERE complete_pass = true) as completions,
      COALESCE(SUM(yards_gained) FILTER (WHERE play_type = 'pass'), 0) as passing_yards,
      COUNT(*) FILTER (WHERE touchdown = true AND play_type = 'pass') as passing_tds,
      COUNT(*) FILTER (WHERE interception = true) as interceptions,
      COALESCE(SUM(epa) FILTER (WHERE play_type = 'pass'), 0) as passing_epa
    FROM bronze_nflfastr_plays
    WHERE season = ${season}
      AND week = ${week}
      AND passer_player_id IS NOT NULL
      AND passer_player_id != ''
    GROUP BY passer_player_id, passer_player_name, posteam
  `);

  // Aggregate receiving stats
  const receivingResult = await db.execute(sql`
    SELECT
      receiver_player_id as player_id,
      receiver_player_name as player_name,
      posteam as team,
      COUNT(*) as targets,
      COUNT(*) FILTER (WHERE complete_pass = true) as receptions,
      COALESCE(SUM(yards_gained) FILTER (WHERE complete_pass = true), 0) as receiving_yards,
      COUNT(*) FILTER (WHERE touchdown = true AND complete_pass = true) as receiving_tds,
      COALESCE(SUM(epa), 0) as receiving_epa,
      COALESCE(SUM(air_yards), 0) as air_yards,
      COALESCE(SUM(yards_after_catch), 0) as yac,
      COUNT(*) FILTER (WHERE first_down_pass = true OR (touchdown = true AND complete_pass = true)) as first_downs_rec,
      COUNT(*) FILTER (WHERE (raw_data->>'yardline_100')::numeric <= 20) as rz_targets
    FROM bronze_nflfastr_plays
    WHERE season = ${season}
      AND week = ${week}
      AND receiver_player_id IS NOT NULL
      AND receiver_player_id != ''
    GROUP BY receiver_player_id, receiver_player_name, posteam
  `);

  // Aggregate rushing stats
  const rushingResult = await db.execute(sql`
    SELECT
      rusher_player_id as player_id,
      rusher_player_name as player_name,
      posteam as team,
      COUNT(*) as rush_attempts,
      COALESCE(SUM(yards_gained), 0) as rushing_yards,
      COUNT(*) FILTER (WHERE touchdown = true) as rushing_tds,
      COALESCE(SUM(epa), 0) as rushing_epa,
      COUNT(*) FILTER (WHERE (raw_data->>'tackled_for_loss')::numeric = 1) as stuffed,
      COUNT(*) FILTER (WHERE first_down_rush = true) as first_downs_rush,
      COUNT(*) FILTER (WHERE (raw_data->>'yardline_100')::numeric <= 20) as rz_rush_att
    FROM bronze_nflfastr_plays
    WHERE season = ${season}
      AND week = ${week}
      AND rusher_player_id IS NOT NULL
      AND rusher_player_id != ''
      AND play_type = 'run'
    GROUP BY rusher_player_id, rusher_player_name, posteam
  `);

  // Aggregate snap counts from bronze_nflfastr_snap_counts
  // Note: Snap counts use PFR IDs, but we aggregate by player name for now
  // This data will be joined with play-by-play data later via player_id matching
  const snapsByNameAndTeam = new Map<string, number>();
  const snapResult = await db.execute(sql`
    SELECT
      player as player_name,
      team,
      SUM(offense_snaps) as snaps
    FROM bronze_nflfastr_snap_counts
    WHERE season = ${season}
      AND week = ${week}
    GROUP BY player, team
  `);

  for (const row of snapResult.rows as any[]) {
    const key = `${row.player_name}|${row.team}`;
    snapsByNameAndTeam.set(key, Number(row.snaps) || 0);
  }

  // Calculate team pass attempts by team for routes estimation
  const teamPassPlaysResult = await db.execute(sql`
    SELECT
      posteam as team,
      COUNT(*) FILTER (WHERE play_type = 'pass') as pass_plays,
      COUNT(DISTINCT game_id) as games
    FROM bronze_nflfastr_plays
    WHERE season = ${season}
      AND week = ${week}
      AND posteam IS NOT NULL
    GROUP BY posteam
  `);

  const teamPassPlaysMap = new Map<string, number>();
  for (const row of teamPassPlaysResult.rows as any[]) {
    teamPassPlaysMap.set(row.team, Number(row.pass_plays) || 0);
  }

  // Merge all stats by player
  const playerMap = new Map<string, PlayerWeekStats>();

  const initPlayer = (playerId: string, playerName: string, team: string | null): PlayerWeekStats => ({
    playerId,
    playerName,
    position: null, // Will be enriched later from identity map
    team,
    season,
    week,
    passAttempts: 0,
    completions: 0,
    passingYards: 0,
    passingTds: 0,
    interceptions: 0,
    passingEpa: 0,
    targets: 0,
    receptions: 0,
    receivingYards: 0,
    receivingTds: 0,
    receivingEpa: 0,
    airYards: 0,
    yac: 0,
    snaps: 0,
    routes: 0,
    rushAttempts: 0,
    rushingYards: 0,
    rushingTds: 0,
    rushingEpa: 0,
    rzRushAtt: 0,
    rzTargets: 0,
  });

  // Add passing stats
  for (const row of passingResult.rows as any[]) {
    const player = playerMap.get(row.player_id) || initPlayer(row.player_id, row.player_name, row.team);
    player.passAttempts = Number(row.pass_attempts) || 0;
    player.completions = Number(row.completions) || 0;
    player.passingYards = Number(row.passing_yards) || 0;
    player.passingTds = Number(row.passing_tds) || 0;
    player.interceptions = Number(row.interceptions) || 0;
    player.passingEpa = Number(row.passing_epa) || 0;
    playerMap.set(row.player_id, player);
  }

  // Add receiving stats
  for (const row of receivingResult.rows as any[]) {
    const player = playerMap.get(row.player_id) || initPlayer(row.player_id, row.player_name, row.team);
    player.targets = Number(row.targets) || 0;
    player.receptions = Number(row.receptions) || 0;
    player.receivingYards = Number(row.receiving_yards) || 0;
    player.receivingTds = Number(row.receiving_tds) || 0;
    player.receivingEpa = Number(row.receiving_epa) || 0;
    player.airYards = Number(row.air_yards) || 0;
    player.yac = Number(row.yac) || 0;
    player.rzTargets = Number(row.rz_targets) || 0;
    if (!player.team) player.team = row.team;
    playerMap.set(row.player_id, player);
  }

  // Add rushing stats
  for (const row of rushingResult.rows as any[]) {
    const player = playerMap.get(row.player_id) || initPlayer(row.player_id, row.player_name, row.team);
    player.rushAttempts = Number(row.rush_attempts) || 0;
    player.rushingYards = Number(row.rushing_yards) || 0;
    player.rushingTds = Number(row.rushing_tds) || 0;
    player.rushingEpa = Number(row.rushing_epa) || 0;
    player.rzRushAtt = Number(row.rz_rush_att) || 0;
    if (!player.team) player.team = row.team;
    playerMap.set(row.player_id, player);
  }

  // Enrich with positions AND full names from identity map (needed for snap count matching)
  const playerIds = Array.from(playerMap.keys());
  const gsisToFullName = new Map<string, string>();

  if (playerIds.length > 0) {
    // Build IN clause with escaped strings
    const escaped = playerIds.map(id => `'${id.replace(/'/g, "''")}'`).join(', ');
    const identityData = await db.execute(
      sql.raw(`SELECT gsis_id, full_name, position FROM player_identity_map WHERE gsis_id IN (${escaped})`)
    );

    for (const row of identityData.rows as any[]) {
      const player = playerMap.get(row.gsis_id);
      if (player) {
        player.position = row.position;
      }
      // Build GSIS ID → full name mapping for snap count lookup
      if (row.full_name) {
        gsisToFullName.set(row.gsis_id, row.full_name);
      }
    }
  }

  // Add snap counts via GSIS ID → full_name → snap counts lookup
  // This handles cases where play-by-play uses abbreviated names (L.Burden)
  // but snap counts uses full names (Luther Burden)
  let snapMatchCount = 0;
  let snapMissCount = 0;
  for (const player of playerMap.values()) {
    if (player.team) {
      // Try 1: Use full name from identity map (most reliable)
      const fullName = gsisToFullName.get(player.playerId);
      if (fullName) {
        // Try exact full name match first
        let key = `${fullName}|${player.team}`;
        let snaps = snapsByNameAndTeam.get(key);

        // Try without suffix (III, Jr., Sr., II, IV, V)
        if (!snaps) {
          const nameWithoutSuffix = fullName.replace(/\s+(III|II|IV|V|Jr\.?|Sr\.?|Junior|Senior)$/i, '').trim();
          if (nameWithoutSuffix !== fullName) {
            key = `${nameWithoutSuffix}|${player.team}`;
            snaps = snapsByNameAndTeam.get(key);
          }
        }

        // Try normalizing accented characters (é → e, etc.)
        if (!snaps) {
          const normalizedName = fullName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (normalizedName !== fullName) {
            key = `${normalizedName}|${player.team}`;
            snaps = snapsByNameAndTeam.get(key);
          }
        }

        // Try both: remove suffix AND normalize accents
        if (!snaps) {
          const normalizedNoSuffix = fullName
            .replace(/\s+(III|II|IV|V|Jr\.?|Sr\.?|Junior|Senior)$/i, '')
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
          if (normalizedNoSuffix !== fullName) {
            key = `${normalizedNoSuffix}|${player.team}`;
            snaps = snapsByNameAndTeam.get(key);
          }
        }

        if (snaps) {
          player.snaps = snaps;
          snapMatchCount++;
        } else {
          snapMissCount++;
        }
      } else {
        // Try 2: Fallback to abbreviated name (original behavior)
        const key = `${player.playerName}|${player.team}`;
        const snaps = snapsByNameAndTeam.get(key);
        if (snaps) {
          player.snaps = snaps;
          snapMatchCount++;
        } else {
          snapMissCount++;
        }
      }
    }
  }
  console.log(`    Snap count matching: ${snapMatchCount} matched, ${snapMissCount} missed`);

  // Calculate routes for skill position players (WR, TE, RB)
  // Routes ≈ 85% of snaps for WR/TE (they run routes on most pass plays)
  // Routes ≈ 50% of snaps for RB (split between routes and pass protection)
  for (const player of playerMap.values()) {
    if (player.snaps > 0 && player.team) {
      const teamPassPlays = teamPassPlaysMap.get(player.team) || 0;

      if (player.position === 'WR' || player.position === 'TE') {
        // WR/TE run routes on ~85% of their snaps
        player.routes = Math.round(player.snaps * 0.85);
      } else if (player.position === 'RB') {
        // RB run routes on ~50% of snaps (other half is pass blocking)
        player.routes = Math.round(player.snaps * 0.50);
      } else if (player.position === 'QB') {
        // QBs don't run routes
        player.routes = 0;
      }
    }
  }

  return Array.from(playerMap.values());
}

async function upsertWeekStats(stats: PlayerWeekStats[]): Promise<number> {
  if (stats.length === 0) return 0;

  let upserted = 0;
  const chunkSize = 50;

  for (let i = 0; i < stats.length; i += chunkSize) {
    const chunk = stats.slice(i, i + chunkSize);

    for (const stat of chunk) {
      await db
        .insert(silverPlayerWeeklyStats)
        .values({
          playerId: stat.playerId,
          playerName: stat.playerName,
          position: stat.position,
          team: stat.team,
          season: stat.season,
          week: stat.week,
          passAttempts: stat.passAttempts,
          completions: stat.completions,
          passingYards: stat.passingYards,
          passingTds: stat.passingTds,
          interceptions: stat.interceptions,
          passingEpa: stat.passingEpa,
          targets: stat.targets,
          receptions: stat.receptions,
          receivingYards: stat.receivingYards,
          receivingTds: stat.receivingTds,
          receivingEpa: stat.receivingEpa,
          airYards: stat.airYards,
          yac: stat.yac,
          snaps: stat.snaps,
          routes: stat.routes,
          rushAttempts: stat.rushAttempts,
          rushingYards: stat.rushingYards,
          rushingTds: stat.rushingTds,
          rushingEpa: stat.rushingEpa,
          rzRushAtt: stat.rzRushAtt,
          rzTargets: stat.rzTargets,
        })
        .onConflictDoUpdate({
          target: [
            silverPlayerWeeklyStats.playerId,
            silverPlayerWeeklyStats.season,
            silverPlayerWeeklyStats.week,
          ],
          set: {
            playerName: stat.playerName,
            position: stat.position,
            team: stat.team,
            passAttempts: stat.passAttempts,
            completions: stat.completions,
            passingYards: stat.passingYards,
            passingTds: stat.passingTds,
            interceptions: stat.interceptions,
            passingEpa: stat.passingEpa,
            targets: stat.targets,
            receptions: stat.receptions,
            receivingYards: stat.receivingYards,
            receivingTds: stat.receivingTds,
            receivingEpa: stat.receivingEpa,
            airYards: stat.airYards,
            yac: stat.yac,
            snaps: stat.snaps,
            routes: stat.routes,
            rushAttempts: stat.rushAttempts,
            rushingYards: stat.rushingYards,
            rushingTds: stat.rushingTds,
            rushingEpa: stat.rushingEpa,
            rzRushAtt: stat.rzRushAtt,
            rzTargets: stat.rzTargets,
            updatedAt: new Date(),
          },
        });
      upserted++;
    }
  }

  return upserted;
}

async function runSilverETL(season: number, startWeek?: number, endWeek?: number): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SILVER LAYER ETL: bronze_nflfastr_plays → silver_player_weekly_stats`);
  console.log(`Season: ${season}`);
  console.log(`${'='.repeat(60)}\n`);

  // Get available weeks from bronze
  const availableWeeks = await getAvailableWeeks(season);
  console.log(`Available weeks in bronze: ${availableWeeks.join(', ')}`);

  // Filter to requested range
  let weeksToProcess = availableWeeks;
  if (startWeek !== undefined) {
    weeksToProcess = weeksToProcess.filter(w => w >= startWeek);
  }
  if (endWeek !== undefined) {
    weeksToProcess = weeksToProcess.filter(w => w <= endWeek);
  }

  console.log(`Weeks to process: ${weeksToProcess.join(', ')}\n`);

  let totalPlayers = 0;
  const weekSummary: { week: number; players: number }[] = [];

  for (const week of weeksToProcess) {
    const stats = await aggregateWeek(season, week);
    const upserted = await upsertWeekStats(stats);
    totalPlayers += upserted;
    weekSummary.push({ week, players: upserted });
    console.log(`  Week ${week}: ${upserted} players processed`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SILVER ETL COMPLETE`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total weeks processed: ${weeksToProcess.length}`);
  console.log(`Total player-weeks upserted: ${totalPlayers}`);
  console.log(`\nWeek summary:`);
  for (const { week, players } of weekSummary) {
    console.log(`  Week ${week}: ${players} players`);
  }

  // Verify final counts
  const finalCount = await db.execute(sql`
    SELECT COUNT(*) as total, COUNT(DISTINCT player_id) as players, MIN(week) as min_week, MAX(week) as max_week
    FROM silver_player_weekly_stats
    WHERE season = ${season}
  `);
  const row = (finalCount.rows as any[])[0];
  console.log(`\nFinal silver_player_weekly_stats state for ${season}:`);
  console.log(`  Total rows: ${row.total}`);
  console.log(`  Unique players: ${row.players}`);
  console.log(`  Week range: ${row.min_week} - ${row.max_week}`);
}

// CLI entry point
const args = process.argv.slice(2);
const season = parseInt(args[0]) || 2025;
const startWeek = args[1] ? parseInt(args[1]) : undefined;
const endWeek = args[2] ? parseInt(args[2]) : undefined;

runSilverETL(season, startWeek, endWeek)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Silver ETL failed:', err);
    process.exit(1);
  });
