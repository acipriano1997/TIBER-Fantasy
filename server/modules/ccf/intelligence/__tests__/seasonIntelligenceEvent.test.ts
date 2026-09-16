import {
  CCFSeasonIntelligenceContractError,
  fingerprintCCFSeasonIntelligenceSnapshot,
  summarizeCCFSeasonIntelligenceEvidenceBreadth,
  validateCCFSeasonIntelligenceSnapshot,
  type CCFSeasonIntelligenceEventV1,
  type CCFSeasonIntelligenceSnapshotV1,
} from "../seasonIntelligenceEvent";

function roleChangeEvent(
  overrides: Partial<CCFSeasonIntelligenceEventV1> = {},
): CCFSeasonIntelligenceEventV1 {
  return {
    eventVersion: "ccf-season-intelligence-event-v1",
    eventId: "evt-role-1",
    season: 2026,
    week: 1,
    subjectType: "player",
    playerIds: ["player-1"],
    teamId: "TEAM",
    eventType: "role_change",
    transitionKind: "role",
    evidenceState: "available",
    reportedAt: "2026-09-09T14:00:00Z",
    knownAt: "2026-09-09T14:02:00Z",
    effectiveAt: "2026-09-10T00:00:00Z",
    sourceRefs: ["ccf://source/report-a", "ccf://source/mirror-a"],
    evidenceRootRefs: ["ccf://root/report-a"],
    traitPriorTreatment: "preserve",
    rolePriorTreatment: "discount",
    effects: [
      {
        variableKey: "route_participation",
        mechanismFamily: "role",
        direction: "up",
        uncertaintyEffect: "widen",
        note: "New role is reported before it has enough observed games to stabilize.",
      },
    ],
    supersedesEventIds: [],
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<CCFSeasonIntelligenceSnapshotV1> = {},
): CCFSeasonIntelligenceSnapshotV1 {
  return {
    snapshotVersion: "ccf-season-intelligence-snapshot-v1",
    snapshotId: "snapshot-week-1-player-1",
    playerId: "player-1",
    position: "WR",
    teamId: "TEAM",
    season: 2026,
    week: 1,
    frozenAt: "2026-09-09T18:00:00Z",
    asOf: "2026-09-09T18:05:00Z",
    priorContext: {
      traitPrior: {
        status: "available",
        ref: "ccf://prior/trait/player-1",
      },
      rolePrior: {
        status: "available",
        ref: "ccf://prior/role/player-1",
      },
      measurementRegime: {
        status: "available",
        ref: "ccf://regime/2026-week-1",
      },
    },
    events: [roleChangeEvent()],
    missingInputs: [],
    recommendationAuthority: "none",
    ...overrides,
  };
}

describe("CCF season intelligence event", () => {
  it("accepts a frozen Week 1 role-change snapshot while preserving the trait prior", () => {
    const packet = snapshot();

    expect(validateCCFSeasonIntelligenceSnapshot(packet)).toEqual(packet);
    expect(packet.events[0].traitPriorTreatment).toBe("preserve");
    expect(packet.events[0].rolePriorTreatment).toBe("discount");
    expect(packet.recommendationAuthority).toBe("none");
  });

  it("rejects news that became known after the snapshot was frozen", () => {
    const packet = snapshot({
      events: [
        roleChangeEvent({
          knownAt: "2026-09-09T18:01:00Z",
        }),
      ],
    });

    expect(() => validateCCFSeasonIntelligenceSnapshot(packet)).toThrow(
      CCFSeasonIntelligenceContractError,
    );
  });

  it("keeps unavailable evidence explicit instead of turning it into a neutral effect", () => {
    const packet = snapshot({
      events: [
        roleChangeEvent({
          eventId: "evt-unavailable",
          evidenceState: "unavailable",
          sourceRefs: [],
          evidenceRootRefs: [],
          effects: [],
          reason: "No qualified source was available before freeze.",
        }),
      ],
      priorContext: {
        traitPrior: {
          status: "available",
          ref: "ccf://prior/trait/player-1",
        },
        rolePrior: {
          status: "unavailable",
          reason: "No compatible prior role measurement exists in the current regime.",
        },
        measurementRegime: {
          status: "available",
          ref: "ccf://regime/2026-week-1",
        },
      },
      missingInputs: [
        {
          key: "role_prior",
          reason: "No compatible prior role measurement exists in the current regime.",
        },
      ],
    });

    expect(validateCCFSeasonIntelligenceSnapshot(packet)).toEqual(packet);
  });

  it("blocks stale evidence from producing variable effects", () => {
    const packet = snapshot({
      events: [
        roleChangeEvent({
          evidenceState: "stale",
          sourceRefs: ["ccf://source/old-report"],
          evidenceRootRefs: ["ccf://root/old-report"],
          reason: "The report predates the current depth-chart transition.",
        }),
      ],
    });

    expect(() => validateCCFSeasonIntelligenceSnapshot(packet)).toThrow(
      "stale evidence cannot produce variable effects",
    );
  });

  it("does not let conflicted reporting pick a directional winner", () => {
    const packet = snapshot({
      events: [
        roleChangeEvent({
          evidenceState: "conflicted",
          sourceRefs: ["ccf://source/report-a", "ccf://source/report-b"],
          evidenceRootRefs: ["ccf://root/report-a", "ccf://root/report-b"],
          effects: [
            {
              variableKey: "goal_line_share",
              mechanismFamily: "opportunity",
              direction: "up",
              uncertaintyEffect: "widen",
            },
          ],
        }),
      ],
    });

    expect(() => validateCCFSeasonIntelligenceSnapshot(packet)).toThrow(
      "conflicted evidence may only express uncertain direction with widened uncertainty",
    );
  });

  it("represents a conflict safely by widening uncertainty without choosing direction", () => {
    const packet = snapshot({
      events: [
        roleChangeEvent({
          evidenceState: "conflicted",
          sourceRefs: ["ccf://source/report-a", "ccf://source/report-b"],
          evidenceRootRefs: ["ccf://root/report-a", "ccf://root/report-b"],
          effects: [
            {
              variableKey: "goal_line_share",
              mechanismFamily: "opportunity",
              direction: "uncertain",
              uncertaintyEffect: "widen",
            },
          ],
        }),
      ],
    });

    expect(validateCCFSeasonIntelligenceSnapshot(packet)).toEqual(packet);
  });

  it("counts mirrored reports as multiple sources but only one independent evidence root", () => {
    const breadth = summarizeCCFSeasonIntelligenceEvidenceBreadth(snapshot());

    expect(breadth).toEqual({
      sourceRefCount: 2,
      independentRootCount: 1,
    });
  });

  it("produces the same fingerprint when event and reference ordering changes", () => {
    const secondEvent = roleChangeEvent({
      eventId: "evt-team-scheme",
      subjectType: "team",
      playerIds: [],
      eventType: "scheme_change",
      transitionKind: "scheme",
      sourceRefs: ["ccf://source/scheme-b", "ccf://source/scheme-a"],
      evidenceRootRefs: ["ccf://root/scheme-b", "ccf://root/scheme-a"],
      effects: [
        {
          variableKey: "team_pass_volume",
          mechanismFamily: "scheme",
          direction: "up",
          uncertaintyEffect: "widen",
        },
        {
          variableKey: "first_read_share",
          mechanismFamily: "opportunity",
          direction: "uncertain",
          uncertaintyEffect: "widen",
        },
      ],
      rolePriorTreatment: "new_state",
    });

    const left = snapshot({
      events: [roleChangeEvent(), secondEvent],
      missingInputs: [
        { key: "first_read_share", reason: "Not yet observed under the new coordinator." },
        { key: "target_quality", reason: "Qualified evidence unavailable before freeze." },
      ],
    });
    const right = snapshot({
      events: [
        {
          ...secondEvent,
          sourceRefs: [...secondEvent.sourceRefs].reverse(),
          evidenceRootRefs: [...secondEvent.evidenceRootRefs].reverse(),
          effects: [...secondEvent.effects].reverse(),
        },
        roleChangeEvent({
          sourceRefs: [...roleChangeEvent().sourceRefs].reverse(),
        }),
      ],
      missingInputs: [...left.missingInputs].reverse(),
    });

    expect(fingerprintCCFSeasonIntelligenceSnapshot(right)).toBe(
      fingerprintCCFSeasonIntelligenceSnapshot(left),
    );
  });

  it("rejects a team event that is unrelated to the snapshot team or player", () => {
    const packet = snapshot({
      events: [
        roleChangeEvent({
          eventId: "evt-other-team",
          subjectType: "team",
          playerIds: [],
          teamId: "OTHER",
          eventType: "defensive_context",
          transitionKind: "defensive",
        }),
      ],
    });

    expect(() => validateCCFSeasonIntelligenceSnapshot(packet)).toThrow(
      "does not apply to snapshot player or team",
    );
  });

  it("rejects any attempt to turn the intelligence snapshot into recommendation authority", () => {
    const packet = snapshot() as unknown as { recommendationAuthority: string };
    packet.recommendationAuthority = "primary";

    expect(() =>
      validateCCFSeasonIntelligenceSnapshot(
        packet as unknown as CCFSeasonIntelligenceSnapshotV1,
      ),
    ).toThrow("season intelligence snapshots cannot hold recommendation authority");
  });
});
