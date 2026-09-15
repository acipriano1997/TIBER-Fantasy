import {
  CCFGameOpportunityError,
  deriveCCFGameOpportunityLedger,
  fingerprintCCFGameOpportunityLedger,
  type CCFCanonicalOpportunityPlay,
  type CCFGameOpportunityInput,
} from "../playByPlayOpportunity";
import type { CCFSourceState } from "../../sources/sourceState";

const SOURCE_STATE: CCFSourceState = {
  sourceId: "fixture://promoted-pbp-v1",
  evidenceClass: "source_backed",
  governanceState: "promoted",
  knownAt: "2026-09-14T23:30:00Z",
  supportWindow: {
    validFrom: "2026-09-14T23:30:00Z",
    validThrough: null,
  },
  producer: "fixture-source",
};

function play(
  eventId: string,
  overrides: Partial<CCFCanonicalOpportunityPlay> = {},
): CCFCanonicalOpportunityPlay {
  return {
    eventId,
    gameId: "2026_01_BBB_AAA",
    season: 2026,
    week: 1,
    offenseTeam: "AAA",
    countsAsOffensivePlay: true,
    dropback: false,
    rushAttempt: false,
    designedQbRush: false,
    scramble: false,
    rusherId: null,
    targetId: null,
    completedPass: false,
    airYards: null,
    down: 1,
    yardline100: 50,
    twoMinute: false,
    offenseScoreDifferential: 0,
    knownAt: "2026-09-14T23:30:00Z",
    sourceRef: "fixture://pbp/2026_01_BBB_AAA/a",
    ...overrides,
  };
}

function input(
  overrides: Partial<CCFGameOpportunityInput> = {},
): CCFGameOpportunityInput {
  return {
    contractVersion: "ccf-game-opportunity-input-v1",
    gameId: "2026_01_BBB_AAA",
    season: 2026,
    week: 1,
    asOf: "2026-09-15T12:00:00Z",
    sourceState: SOURCE_STATE,
    completeGameEvidence: true,
    plays: [
      play("p1", {
        rushAttempt: true,
        rusherId: "RB1",
        down: 1,
        yardline100: 50,
        offenseScoreDifferential: 7,
      }),
      play("p2", {
        dropback: true,
        targetId: "WR1",
        completedPass: true,
        airYards: 12,
        down: 2,
        yardline100: 18,
        twoMinute: true,
        offenseScoreDifferential: -3,
      }),
      play("p3", {
        rushAttempt: true,
        rusherId: "RB1",
        down: 3,
        yardline100: 3,
        offenseScoreDifferential: 0,
      }),
      play("p4", {
        dropback: true,
        rushAttempt: true,
        scramble: true,
        rusherId: "QB1",
        down: 2,
        yardline100: 25,
        twoMinute: true,
        offenseScoreDifferential: -10,
      }),
      play("p5", {
        rushAttempt: true,
        designedQbRush: true,
        rusherId: "QB1",
        down: 1,
        yardline100: 4,
        offenseScoreDifferential: 0,
      }),
      play("p6", {
        dropback: true,
        down: 3,
        yardline100: 40,
        offenseScoreDifferential: 3,
        sourceRef: "fixture://pbp/2026_01_BBB_AAA/b",
      }),
      play("p7", {
        offenseTeam: "BBB",
        dropback: true,
        targetId: "WR2",
        completedPass: false,
        airYards: 8,
        down: 1,
        yardline100: 35,
        offenseScoreDifferential: -7,
        sourceRef: "fixture://pbp/2026_01_BBB_AAA/b",
      }),
    ],
    ...overrides,
  };
}

describe("CCF game opportunity derivation", () => {
  it("derives deterministic team and player opportunity ledgers without model weights", () => {
    const ledger = deriveCCFGameOpportunityLedger(input());

    expect(ledger).toMatchObject({
      gameId: "2026_01_BBB_AAA",
      producerFamily: "ccf_native_derived",
      evidenceKind: "derived",
      sourceId: "fixture://promoted-pbp-v1",
      knownAt: "2026-09-14T23:30:00Z",
    });

    const aaa = ledger.teams.find((team) => team.team === "AAA");
    expect(aaa).toMatchObject({
      offensivePlays: 6,
      dropbacks: 3,
      rushAttempts: 4,
      targets: 1,
      receptions: 1,
      airYards: 12,
      redZoneOpportunities: 3,
      goalLineOpportunities: 2,
      twoMinuteOpportunities: 2,
      firstDownOpportunities: 2,
      opportunitiesWhileLeading: 1,
      opportunitiesWhileTied: 2,
      opportunitiesWhileTrailing: 2,
    });

    const rb = ledger.players.find((player) => player.playerId === "RB1");
    expect(rb).toMatchObject({
      team: "AAA",
      carries: 2,
      targets: 0,
      receptions: 0,
      touches: 2,
      redZoneCarries: 1,
      goalLineCarries: 1,
      carryShare: 0.5,
      targetShare: 0,
      carryTargetOpportunityShare: 0.4,
      redZoneOpportunityShare: 1 / 3,
      goalLineOpportunityShare: 0.5,
    });

    const wr = ledger.players.find((player) => player.playerId === "WR1");
    expect(wr).toMatchObject({
      team: "AAA",
      carries: 0,
      targets: 1,
      receptions: 1,
      touches: 1,
      airYards: 12,
      targetShare: 1,
      airYardsShare: 1,
      redZoneTargets: 1,
      twoMinuteTargets: 1,
      opportunitiesWhileTrailing: 1,
    });
    expect(wr?.sourceRefs).toEqual([
      "fixture://pbp/2026_01_BBB_AAA/a",
      "fixture://pbp/2026_01_BBB_AAA/b",
    ]);

    const qb = ledger.players.find((player) => player.playerId === "QB1");
    expect(qb).toMatchObject({
      carries: 2,
      designedQbRushes: 1,
      scrambles: 1,
      goalLineCarries: 1,
      twoMinuteCarries: 1,
    });
  });

  it("is deterministic regardless of play order", () => {
    const original = deriveCCFGameOpportunityLedger(input());
    const reversed = deriveCCFGameOpportunityLedger(
      input({ plays: [...input().plays].reverse() }),
    );

    expect(fingerprintCCFGameOpportunityLedger(original)).toBe(
      fingerprintCCFGameOpportunityLedger(reversed),
    );
  });

  it("uses the later of source promotion state and play evidence as ledger knownAt", () => {
    const ledger = deriveCCFGameOpportunityLedger(
      input({
        sourceState: {
          ...SOURCE_STATE,
          knownAt: "2026-09-15T01:00:00Z",
          supportWindow: { validFrom: "2026-09-15T01:00:00Z", validThrough: null },
        },
      }),
    );
    expect(ledger.knownAt).toBe("2026-09-15T01:00:00Z");
  });

  it("fails closed when the game evidence is incomplete", () => {
    expect(() => deriveCCFGameOpportunityLedger(input({ completeGameEvidence: false }))).toThrow(
      /explicitly complete game evidence/,
    );
  });

  it("rejects a source that has not been promoted for native use", () => {
    expect(() =>
      deriveCCFGameOpportunityLedger(
        input({
          sourceState: { ...SOURCE_STATE, governanceState: "candidate" },
        }),
      ),
    ).toThrow(/not_promoted/);
  });

  it("rejects play evidence learned after the decision as-of", () => {
    expect(() =>
      deriveCCFGameOpportunityLedger(
        input({
          plays: [
            play("late", {
              knownAt: "2026-09-16T00:00:00Z",
              rushAttempt: true,
              rusherId: "RB1",
            }),
          ],
        }),
      ),
    ).toThrow(/knownAt > asOf/);
  });

  it("rejects malformed opportunity normalization instead of guessing intent", () => {
    expect(() =>
      deriveCCFGameOpportunityLedger(
        input({
          plays: [
            play("hybrid", {
              dropback: true,
              rushAttempt: true,
              rusherId: "RB1",
              targetId: "WR1",
            }),
          ],
        }),
      ),
    ).toThrow(CCFGameOpportunityError);

    expect(() =>
      deriveCCFGameOpportunityLedger(
        input({ plays: [play("bad-completion", { completedPass: true })] }),
      ),
    ).toThrow(/completedPass requires targetId/);

    expect(() =>
      deriveCCFGameOpportunityLedger(
        input({
          plays: [
            play("qb-classification-conflict", {
              dropback: true,
              rushAttempt: true,
              rusherId: "QB1",
              scramble: true,
              designedQbRush: true,
            }),
          ],
        }),
      ),
    ).toThrow(/cannot be both scramble and designedQbRush/);
  });

  it("does not coerce zero-denominator shares into fake neutral values", () => {
    const ledger = deriveCCFGameOpportunityLedger(
      input({
        plays: [
          play("sack", {
            dropback: true,
            down: 3,
            offenseScoreDifferential: 0,
          }),
        ],
      }),
    );

    expect(ledger.players).toEqual([]);
    expect(ledger.teams[0]).toMatchObject({ rushAttempts: 0, targets: 0 });
  });
});
