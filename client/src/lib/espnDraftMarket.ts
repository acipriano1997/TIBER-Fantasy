export type EspnDraftScoring = 'PPR' | 'HALF_PPR' | 'STANDARD';
export type EspnDraftPosition = 'QB' | 'RB' | 'WR' | 'TE';

export type EspnDraftMarketRow = {
  espnPlayerId: string;
  playerName: string;
  team: string | null;
  position: EspnDraftPosition;
  proTeamId: number | null;
  averageDraftPosition: number | null;
  draftRank: number | null;
  auctionValueAverage: number | null;
  percentOwned: number | null;
};

export type EspnDraftMarketSnapshot = {
  schemaVersion: 'espn_draft_market_v1';
  provider: 'espn';
  season: number;
  scoring: EspnDraftScoring;
  fetchedAt: string;
  sourceEndpoint: string;
  sourceView: 'kona_player_info';
  identityStatus: 'provider_typed';
  rows: EspnDraftMarketRow[];
  warnings: string[];
  marketOnly: true;
  footballValueAuthority: false;
};

export async function fetchEspnDraftMarket(options: {
  season: number;
  scoring: EspnDraftScoring;
  position: EspnDraftPosition;
}): Promise<EspnDraftMarketSnapshot> {
  const params = new URLSearchParams({
    season: String(options.season),
    scoring: options.scoring,
    position: options.position,
  });
  const response = await fetch(`/api/management/espn-draft-market?${params.toString()}`, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success !== true || !Array.isArray(payload?.rows)) {
    throw new Error(payload?.error || `ESPN draft market returned HTTP ${response.status}.`);
  }
  return payload as EspnDraftMarketSnapshot;
}
