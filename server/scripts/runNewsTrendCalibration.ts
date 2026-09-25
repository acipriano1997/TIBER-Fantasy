// server/scripts/runNewsTrendCalibration.ts
//
// Historical NEWS-001 persistence replay. Network access is intentional: the
// script reads immutable/completed historical nflverse season files and writes
// an evidence artifact. It does not modify runtime thresholds.

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  NflverseTeamTrendClient,
  NflverseTeamStatRow,
  offenseMetricsFromTeamRow,
  defenseMetricsFromOpponentRow,
} from '../data/nflverseTeamTrendClient';
import {
  JoinedFtnPlay,
  NflverseFtnTrendClient,
  joinFtnChartingToPbp,
} from '../data/nflverseFtnTrendClient';
import {
  TrendCalibrationObservation,
  calibrateTrendObservations,
  trendCalibrationMarkdown,
} from '../data/newsTrendCalibration';

const seasons = (process.env.NEWS_CALIBRATION_SEASONS ?? '2022,2023,2024,2025')
  .split(',')
  .map(value => Number(value.trim()))
  .filter(value => Number.isInteger(value));

const outputDir =
  process.env.NEWS_CALIBRATION_OUTPUT_DIR ??
  path.resolve(process.cwd(), 'artifacts/news-001-calibration');

function clean(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function weekOf(row: NflverseTeamStatRow): number | undefined {
  const parsed = Number(row.week);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function finiteEntries(record: Record<string, number | null>) {
  return Object.entries(record).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === 'number' && Number.isFinite(entry[1]),
  );
}

function addTeamStatObservations(
  rows: NflverseTeamStatRow[],
  season: number,
  observations: TrendCalibrationObservation[],
) {
  const regular = rows.filter(
    row =>
      Number(row.season) === season &&
      clean(row.season_type) !== 'POST' &&
      (weekOf(row) ?? 99) <= 18,
  );
  const opponentIndex = new Map<string, NflverseTeamStatRow>();

  for (const row of regular) {
    const gameId = clean(row.game_id);
    const team = clean(row.team);
    if (gameId && team) opponentIndex.set(`${gameId}:${team}`, row);
  }

  for (const row of regular) {
    const team = clean(row.team);
    const week = weekOf(row);
    if (!team || !week) continue;

    const offense = offenseMetricsFromTeamRow(row);
    for (const [metric, value] of finiteEntries(
      offense as unknown as Record<string, number | null>,
    )) {
      observations.push({
        source: 'TEAM_STATS',
        family: 'OFF_TREND',
        metric,
        season,
        team,
        week,
        value,
      });
    }

    const gameId = clean(row.game_id);
    const opponent = clean(row.opponent_team);
    const opponentRow =
      gameId && opponent ? opponentIndex.get(`${gameId}:${opponent}`) : undefined;
    if (!opponentRow) continue;

    const defense = defenseMetricsFromOpponentRow(opponentRow);
    for (const [metric, value] of finiteEntries(
      defense as unknown as Record<string, number | null>,
    )) {
      observations.push({
        source: 'TEAM_STATS',
        family: 'DEF_TREND',
        metric,
        season,
        team,
        week,
        value,
      });
    }
  }
}

function bool(value?: string): boolean | null {
  const normalized = clean(value)?.toLowerCase();
  if (!normalized) return null;
  if (['true', 't', '1'].includes(normalized)) return true;
  if (['false', 'f', '0'].includes(normalized)) return false;
  return null;
}

function numberValue(value?: string): number | null {
  const normalized = clean(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function rate(values: Array<boolean | null>): number | null {
  const known = values.filter((value): value is boolean => value !== null);
  if (known.length === 0) return null;
  return known.filter(Boolean).length / known.length;
}

function average(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0) return null;
  return known.reduce((sum, value) => sum + value, 0) / known.length;
}

function addFtnMetric(
  observations: TrendCalibrationObservation[],
  family: 'OFF_TREND' | 'DEF_TREND',
  metric: string,
  season: number,
  team: string,
  week: number,
  value: number | null,
) {
  if (value === null || !Number.isFinite(value)) return;
  observations.push({
    source: 'FTN_CHARTING',
    family,
    metric,
    season,
    team,
    week,
    value,
  });
}

function addFtnObservations(
  joined: JoinedFtnPlay[],
  season: number,
  observations: TrendCalibrationObservation[],
) {
  const regular = joined.filter(row => row.season === season && row.week <= 18);
  const offenseGroups = new Map<string, JoinedFtnPlay[]>();
  const defenseGroups = new Map<string, JoinedFtnPlay[]>();

  for (const row of regular) {
    const offenseKey = `${row.posteam}|${row.week}`;
    const defenseKey = `${row.defteam}|${row.week}`;
    offenseGroups.set(offenseKey, [...(offenseGroups.get(offenseKey) ?? []), row]);
    defenseGroups.set(defenseKey, [...(defenseGroups.get(defenseKey) ?? []), row]);
  }

  for (const [key, rows] of offenseGroups) {
    const [team, weekText] = key.split('|');
    const week = Number(weekText);
    const qbLocations = rows
      .map(row => clean(row.charting.qb_location)?.toUpperCase())
      .filter((value): value is string => Boolean(value));
    const dropbacks = rows.filter(row => row.qbDropback);

    addFtnMetric(
      observations,
      'OFF_TREND',
      'underCenterRate',
      season,
      team,
      week,
      qbLocations.length
        ? qbLocations.filter(value => value === 'U').length / qbLocations.length
        : null,
    );
    addFtnMetric(
      observations,
      'OFF_TREND',
      'shotgunRate',
      season,
      team,
      week,
      qbLocations.length
        ? qbLocations.filter(value => value === 'S').length / qbLocations.length
        : null,
    );
    addFtnMetric(
      observations,
      'OFF_TREND',
      'pistolRate',
      season,
      team,
      week,
      qbLocations.length
        ? qbLocations.filter(value => value === 'P').length / qbLocations.length
        : null,
    );
    addFtnMetric(
      observations,
      'OFF_TREND',
      'motionRate',
      season,
      team,
      week,
      rate(rows.map(row => bool(row.charting.is_motion))),
    );
    addFtnMetric(
      observations,
      'OFF_TREND',
      'playActionRate',
      season,
      team,
      week,
      rate(dropbacks.map(row => bool(row.charting.is_play_action))),
    );
    addFtnMetric(
      observations,
      'OFF_TREND',
      'noHuddleRate',
      season,
      team,
      week,
      rate(rows.map(row => bool(row.charting.is_no_huddle))),
    );
    addFtnMetric(
      observations,
      'OFF_TREND',
      'rpoRate',
      season,
      team,
      week,
      rate(rows.map(row => bool(row.charting.is_rpo))),
    );
    addFtnMetric(
      observations,
      'OFF_TREND',
      'screenRate',
      season,
      team,
      week,
      rate(dropbacks.map(row => bool(row.charting.is_screen_pass))),
    );
    addFtnMetric(
      observations,
      'OFF_TREND',
      'avgBackfieldCount',
      season,
      team,
      week,
      average(rows.map(row => numberValue(row.charting.n_offense_backfield))),
    );
  }

  for (const [key, rows] of defenseGroups) {
    const [team, weekText] = key.split('|');
    const week = Number(weekText);
    const dropbacks = rows.filter(row => row.qbDropback);
    const passRushers = dropbacks.map(row =>
      numberValue(row.charting.n_pass_rushers),
    );
    const blitzers = dropbacks.map(row => numberValue(row.charting.n_blitzers));
    const knownRushers = passRushers.filter(
      (value): value is number => value !== null,
    );
    const knownBlitzers = blitzers.filter(
      (value): value is number => value !== null,
    );

    addFtnMetric(
      observations,
      'DEF_TREND',
      'avgBoxCount',
      season,
      team,
      week,
      average(rows.map(row => numberValue(row.charting.n_defense_box))),
    );
    addFtnMetric(
      observations,
      'DEF_TREND',
      'fivePlusPassRusherRate',
      season,
      team,
      week,
      knownRushers.length
        ? knownRushers.filter(value => value >= 5).length / knownRushers.length
        : null,
    );
    addFtnMetric(
      observations,
      'DEF_TREND',
      'blitzerPresentRate',
      season,
      team,
      week,
      knownBlitzers.length
        ? knownBlitzers.filter(value => value >= 1).length / knownBlitzers.length
        : null,
    );
    addFtnMetric(
      observations,
      'DEF_TREND',
      'fourOrFewerRushRate',
      season,
      team,
      week,
      knownRushers.length
        ? knownRushers.filter(value => value <= 4).length / knownRushers.length
        : null,
    );
    addFtnMetric(
      observations,
      'DEF_TREND',
      'avgPassRushers',
      season,
      team,
      week,
      average(passRushers),
    );
  }
}

async function main() {
  if (seasons.length < 4) {
    throw new Error(
      'NEWS-001 calibration requires at least four completed seasons for the configured historical replay.',
    );
  }

  const observations: TrendCalibrationObservation[] = [];
  const provenance: Array<Record<string, unknown>> = [];

  for (const season of seasons) {
    console.log(`[NEWS-001 calibration] team stats ${season}`);
    const teamClient = new NflverseTeamTrendClient();
    const teamResult = await teamClient.fetchSeason(
      season,
      new Date().toISOString(),
    );
    if (teamResult.state !== 'CURRENT') {
      throw new Error(
        `team stats fetch failed for ${season}: ${teamResult.error ?? teamResult.state}`,
      );
    }
    addTeamStatObservations(teamResult.rows, season, observations);
    provenance.push({
      season,
      source: 'nflverse-team-stats',
      rows: teamResult.rows.length,
      sourceUpdatedAt: teamResult.sourceUpdatedAt ?? null,
    });

    console.log(`[NEWS-001 calibration] FTN charting + PBP join ${season}`);
    const ftnClient = new NflverseFtnTrendClient({
      cacheTtlMs: 1,
      requestTimeoutMs: 120_000,
    });
    const ftnResult = await ftnClient.fetchSeason(
      season,
      new Date().toISOString(),
      true,
    );
    if (ftnResult.state === 'ERROR') {
      throw new Error(
        `FTN/PBP fetch failed for ${season}: ${ftnResult.error ?? ftnResult.state}`,
      );
    }

    const joined = joinFtnChartingToPbp(
      ftnResult.chartingRows,
      ftnResult.pbpRows,
    );
    if (joined.joined.length === 0) {
      throw new Error(`FTN/PBP join produced zero rows for ${season}`);
    }
    addFtnObservations(joined.joined, season, observations);
    provenance.push({
      season,
      source: 'FTN Data via nflverse + nflverse PBP',
      chartingRows: ftnResult.chartingRows.length,
      pbpRows: ftnResult.pbpRows.length,
      joinedRows: joined.joined.length,
      unmatchedChartingRows: joined.unmatched,
      sourceUpdatedAt: ftnResult.sourceUpdatedAt ?? null,
    });
  }

  const generatedAt = new Date().toISOString();
  const report = calibrateTrendObservations(observations, generatedAt);
  const evidence = {
    ...report,
    seasons,
    observationCount: observations.length,
    provenance,
    sourceNotes: {
      ftnAttribution: 'FTN Data via nflverse (CC-BY-SA 4.0)',
      participationBoundary:
        'nflverse participation contains personnel/man-zone/coverage fields historically, but 2023+ participation is released only after the postseason; it is not a current-season NEWS-001 runtime source.',
    },
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, 'news-001-trend-calibration.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  await fs.writeFile(
    path.join(outputDir, 'news-001-trend-calibration.md'),
    trendCalibrationMarkdown(report) +
      '\n## Source boundary\n\nFTN charting is attributed to **FTN Data via nflverse**. Historical nflverse participation can expose personnel and coverage fields, but 2023+ participation is only released after the postseason, so it is not used as a live NEWS-001 source.\n',
  );

  console.log('NEWS_001_CALIBRATION_SUMMARY=' + JSON.stringify(report.summary));
  for (const metric of report.metrics) {
    console.log(
      [
        'NEWS_001_CALIBRATION_METRIC',
        metric.source,
        metric.family,
        metric.metric,
        `n=${metric.n}`,
        `gain=${metric.maeGainPct}%`,
        `corr=${metric.deltaCorrelation ?? 'n/a'}`,
        `folds+=${metric.positiveFolds}`,
        `folds-=${metric.materiallyNegativeFolds}`,
        metric.disposition,
        'runtimePromotionAllowed=false',
      ].join('|'),
    );
  }
  console.log(`NEWS_001_CALIBRATION_ARTIFACT_DIR=${outputDir}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
