import {
  nflversePlayersUrl,
  parseNflversePlayerIdCrosswalkCsv,
} from "../nflversePlayerIdCrosswalk";

const HEADER = "gsis_id,pfr_id,display_name,position";

function csv(rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

describe("nflverse exact PFR to GSIS player identity crosswalk", () => {
  it("uses the maintained nflverse players release", () => {
    expect(nflversePlayersUrl()).toBe(
      "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv",
    );
  });

  it("returns only exact rows with both namespaces and normalizes position", () => {
    const rows = parseNflversePlayerIdCrosswalkCsv(
      csv([
        "00-0000002,JoneJa00,James Jones,wr",
        "00-0000001,SmitJo00,John Smith,QB",
        "00-0000003,,Missing PFR,RB",
        ",BrowMi00,Missing GSIS,TE",
      ]),
    );

    expect(rows).toEqual([
      {
        gsisId: "00-0000002",
        pfrId: "JoneJa00",
        displayName: "James Jones",
        position: "WR",
      },
      {
        gsisId: "00-0000001",
        pfrId: "SmitJo00",
        displayName: "John Smith",
        position: "QB",
      },
    ]);
  });

  it("rejects duplicate PFR ids instead of guessing which GSIS row wins", () => {
    expect(() =>
      parseNflversePlayerIdCrosswalkCsv(
        csv([
          "00-0000001,SmitJo00,John Smith,QB",
          "00-0000009,SmitJo00,Other Smith,QB",
        ]),
      ),
    ).toThrow(/duplicate PFR player id SmitJo00/);
  });

  it("rejects duplicate GSIS ids instead of claiming multiple PFR identities", () => {
    expect(() =>
      parseNflversePlayerIdCrosswalkCsv(
        csv([
          "00-0000001,SmitJo00,John Smith,QB",
          "00-0000001,SmitJo99,John Smith,QB",
        ]),
      ),
    ).toThrow(/duplicate GSIS player id 00-0000001/);
  });

  it("fails closed when required identity columns disappear", () => {
    expect(() =>
      parseNflversePlayerIdCrosswalkCsv(
        "gsis_id,display_name,position\n00-0000001,John Smith,QB",
      ),
    ).toThrow(/schema missing required columns: pfr_id/);
  });
});
