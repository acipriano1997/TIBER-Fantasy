import {
  CCFNflOfficialInactivesSourceError,
  fetchNflOfficialInactives,
  parseNflOfficialInactivesHtml,
} from "../nflOfficialInactives";

const INACTIVES_HTML = `
<!doctype html>
<html>
  <head>
    <meta property="article:published_time" content="2026-09-13T11:46:00-04:00" />
    <meta property="article:modified_time" content="2026-09-13T12:03:00-04:00" />
  </head>
  <body>
    <article>
      <h2>EARLY WINDOW</h2>
      <h3>PANTHERS</h3>
      <ul>
        <li>TE Ja'Tavion Sanders</li>
        <li>WR John Metchie</li>
        <li>QB Haynes King (emergency third QB)</li>
      </ul>
      <h3>BEARS</h3>
      <ul>
        <li>QB Miller Moss</li>
        <li>DB Xavier Woods</li>
      </ul>
      <h3>WHERE</h3>
      <ul><li>Bank of America Stadium</li></ul>
    </article>
  </body>
</html>`;

describe("official NFL inactive-report candidate parser", () => {
  it("extracts only expected team inactive lists without CSS-class coupling", () => {
    const rows = parseNflOfficialInactivesHtml(INACTIVES_HTML, {
      expectedTeams: ["Panthers", "Bears"],
    });

    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      teamHeading: "PANTHERS",
      position: "TE",
      playerName: "Ja'Tavion Sanders",
      emergencyThirdQb: false,
    });
    expect(rows[2]).toMatchObject({
      teamHeading: "PANTHERS",
      position: "QB",
      playerName: "Haynes King",
      emergencyThirdQb: true,
    });
    expect(rows.some((row) => row.playerName === "Bank of America Stadium")).toBe(false);
  });

  it("fails closed when an expected team heading is absent", () => {
    expect(() =>
      parseNflOfficialInactivesHtml(INACTIVES_HTML, {
        expectedTeams: ["Panthers", "Bears", "Cowboys"],
      }),
    ).toThrow(/missing expected team heading COWBOYS/);
  });

  it("fails closed when an expected team has no inactive rows", () => {
    const html = INACTIVES_HTML.replace(
      "<li>QB Miller Moss</li>\n        <li>DB Xavier Woods</li>",
      "",
    );
    expect(() =>
      parseNflOfficialInactivesHtml(html, { expectedTeams: ["Panthers", "Bears"] }),
    ).toThrow(/contains no inactive players for expected team BEARS/);
  });

  it("preserves upstream article timing separately from CCF knownAt", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(INACTIVES_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchNflOfficialInactives({
      sourceUrl: "https://amp.nfl.com/news/inactive-reports-sunday-week-1-2026-nfl-season",
      expectedTeams: ["Panthers", "Bears"],
      fetchImpl,
      now: () => new Date("2026-09-13T16:10:00Z"),
    });

    expect(snapshot.provenance.knownAt).toBe("2026-09-13T16:10:00.000Z");
    expect(snapshot.provenance.upstreamPublishedAt).toBe("2026-09-13T15:46:00.000Z");
    expect(snapshot.provenance.upstreamUpdatedAt).toBe("2026-09-13T16:03:00.000Z");
    expect(snapshot.provenance.temporalMode).toBe("current_snapshot_only");
    expect(snapshot.provenance.termsStatus).toBe("candidate_review_required");
    expect(snapshot.provenance.rawTraceStatus).toBe("not_archived");
  });

  it("rejects non-NFL hosts", async () => {
    await expect(
      fetchNflOfficialInactives({
        sourceUrl: "https://example.com/inactives",
        expectedTeams: ["Panthers", "Bears"],
        fetchImpl: jest.fn() as unknown as typeof fetch,
      }),
    ).rejects.toThrow(CCFNflOfficialInactivesSourceError);
  });
});
