import {
  nflverseSnapCountsUrl,
  parseNflverseSnapCountsCsv,
} from "../nflverseSnapCounts";

const HEADER = [
  "game_id",
  "pfr_game_id",
  "season",
  "game_type",
  "week",
  "player",
  "pfr_player_id",
  "position",
  "team",
  "opponent",
  "offense_snaps",
  "offense_pct",
  "defense_snaps",
  "defense_pct",
  "st_snaps",
  "st_pct",
].join(",");

const BASE = [
  "2026_02_BBB_AAA",
  "202609130aaa",
  "2026",
  "REG",
  "2",
  "Example Receiver",
  "ReceEx00",
  "WR",
  "AAA",
  "BBB",
  "52",
  "80%",
  "0",
  "0%",
  "2",
  "10%",
];

function rowWith(index: number, value: string): string {
  const row = [...BASE];
  row[index] = value;
  return row.join(",");
}

describe("nflverse snap-count source", () => {
  it("uses the maintained snap-count release path", () => {
    expect(nflverseSnapCountsUrl(2026)).toBe(
      "https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2026.csv",
    );
  });

  it("parses workload counts and percentage shares", () => {
    const rows = parseNflverseSnapCountsCsv(`${HEADER}\n${BASE.join(",")}\n`, {
      season: 2026,
      week: 2,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pfrPlayerId: "ReceEx00",
      position: "WR",
      offenseSnaps: 52,
      offensePct: 0.8,
      defenseSnaps: 0,
      specialTeamsSnaps: 2,
      specialTeamsPct: 0.1,
    });
  });

  it.each([
    [10, "-1", "offense_snaps"],
    [12, "-1", "defense_snaps"],
    [14, "-1", "st_snaps"],
  ])("rejects negative snap counts at column %s", (index, value, field) => {
    expect(() =>
      parseNflverseSnapCountsCsv(`${HEADER}\n${rowWith(index as number, value as string)}\n`, {
        season: 2026,
        week: 2,
      }),
    ).toThrow(new RegExp(`snap count field ${field} cannot be negative`));
  });

  it("rejects fractional snap counts", () => {
    expect(() =>
      parseNflverseSnapCountsCsv(`${HEADER}\n${rowWith(10, "51.5")}\n`, {
        season: 2026,
        week: 2,
      }),
    ).toThrow(/snap count field offense_snaps must be an integer/);
  });

  it("keeps a row with missing position visible for reliability missingness", () => {
    const rows = parseNflverseSnapCountsCsv(`${HEADER}\n${rowWith(7, "")}\n`, {
      season: 2026,
      week: 2,
      positions: ["WR"],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].position).toBeNull();
  });

  it("filters explicit out-of-scope positions", () => {
    const rows = parseNflverseSnapCountsCsv(`${HEADER}\n${rowWith(7, "TE")}\n`, {
      season: 2026,
      week: 2,
      positions: ["WR"],
    });

    expect(rows).toEqual([]);
  });
});
