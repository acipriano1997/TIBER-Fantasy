const season = 2026;
const endpoint = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?scoringPeriodId=0&view=kona_player_info`;
const filter = {
  players: {
    filterSlotIds: { value: [0, 2, 4, 6] },
    filterRanksForScoringPeriodIds: { value: [1] },
    filterRanksForRankTypes: { value: ['PPR'] },
    filterRanksForSlotIds: { value: [0, 2, 4, 6, 17, 16] },
    sortDraftRanks: { sortPriority: 1, sortAsc: true, value: 'PPR' },
    sortPercOwned: { sortPriority: 4, sortAsc: false },
    limit: 500,
    offset: 0,
  },
};

const response = await fetch(endpoint, {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'TIBER-Command-Center-Certification/1.0',
    'X-Fantasy-Source': 'kona',
    'X-Fantasy-Filter': JSON.stringify(filter),
  },
});
if (!response.ok) throw new Error(`ESPN live market returned HTTP ${response.status}`);
const payload = await response.json();
const players = Array.isArray(payload?.players) ? payload.players : [];
const positionMap = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE' };
const counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
const usable = [];

for (const entry of players) {
  const player = entry?.player;
  const pos = positionMap[player?.defaultPositionId];
  if (!pos || player?.active === false) continue;
  const ownership = player?.ownership ?? entry?.playerPoolEntry?.ownership;
  const adp = Number(ownership?.averageDraftPosition);
  const rank = Number(player?.draftRanksByRankType?.PPR?.rank ?? player?.draftRank);
  if (!(Number.isFinite(adp) && adp > 0) && !(Number.isFinite(rank) && rank > 0)) continue;
  counts[pos] += 1;
  usable.push({ id: String(entry?.id ?? player?.id ?? ''), name: player?.fullName, pos, adp: Number.isFinite(adp) ? adp : null, rank: Number.isFinite(rank) ? rank : null });
}

if (players.length < 100) throw new Error(`ESPN returned only ${players.length} player records`);
if (usable.length < 80) throw new Error(`ESPN returned only ${usable.length} rows with truthful draft-rank/ADP evidence`);
for (const pos of Object.keys(counts)) {
  if (counts[pos] < 10) throw new Error(`ESPN ${pos} coverage too small: ${counts[pos]}`);
}
if (usable.some((row) => !row.id || !row.name)) throw new Error('ESPN live market contains usable rows without provider identity/name');

console.log(JSON.stringify({ season, playerRecords: players.length, usableRows: usable.length, positionCoverage: counts, sample: usable.slice(0, 5) }, null, 2));
