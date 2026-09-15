import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type LeagueSourceRole = 'devy_rights';

export interface SupplementalLeagueSource {
  sourceId: string;
  kind: 'google_sheet';
  role: LeagueSourceRole;
  authority: string;
  driveFileName: string;
  spreadsheetId: string;
  sheetName: string;
  ownerSelector: {
    type: 'manager_handle';
    value: string;
    normalization: string[];
  };
  layout: {
    leagueTeamHeaderRow: number;
    managerHandleRow: number;
    columnLabelRow: number;
    prospectLabel: string;
    schoolLabel: string;
    columnResolution: string;
  };
  joinPolicy: {
    mode: 'supplement';
    sleeperRemainsAuthoritativeFor: string[];
    sheetRemainsAuthoritativeFor: string[];
    neverTreatDevyProspectsAsSleeperNflRosterPlayers: boolean;
  };
  validation: {
    requireLeagueNameMatch: boolean;
    requireManagerHandleMatch: boolean;
    rejectAmbiguousManagerHandleMatches: boolean;
    preserveUnmatchedProspectsForIdentityResolution: boolean;
  };
}

export interface LeagueSourceLink {
  schemaVersion: 'league-source-link.v1';
  league: {
    name: string;
    platform: 'sleeper';
    platformLeagueId: string;
    platformUsername: string;
  };
  supplementalSources: SupplementalLeagueSource[];
}

const REGISTRY_DIR = path.resolve(process.cwd(), 'data', 'league-sources');

export function normalizeManagerHandle(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export async function listLeagueSourceLinks(): Promise<LeagueSourceLink[]> {
  let entries: string[];
  try {
    entries = await readdir(REGISTRY_DIR);
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const links: LeagueSourceLink[] = [];
  for (const entry of entries.filter((name) => name.endsWith('.json')).sort()) {
    const raw = await readFile(path.join(REGISTRY_DIR, entry), 'utf8');
    const parsed = JSON.parse(raw) as LeagueSourceLink;
    if (parsed.schemaVersion !== 'league-source-link.v1') continue;
    links.push(parsed);
  }
  return links;
}

export async function getLeagueSourceLink(
  platform: LeagueSourceLink['league']['platform'],
  platformLeagueId: string,
): Promise<LeagueSourceLink | null> {
  const links = await listLeagueSourceLinks();
  return links.find(
    (link) => link.league.platform === platform && link.league.platformLeagueId === platformLeagueId,
  ) ?? null;
}

export async function getDevyRightsSource(platformLeagueId: string): Promise<SupplementalLeagueSource | null> {
  const link = await getLeagueSourceLink('sleeper', platformLeagueId);
  return link?.supplementalSources.find((source) => source.role === 'devy_rights') ?? null;
}
