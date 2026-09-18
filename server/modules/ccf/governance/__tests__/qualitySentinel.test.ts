import {
  evaluateCCFQualityRules,
  fingerprintCCFQualityEvent,
  type CCFQualityRule,
} from "../qualitySentinel";

interface Payload {
  playerId: string;
  projection: number;
}

describe("CCF quality sentinel", () => {
  it("emits stable fingerprinted blocking events", () => {
    const rules: CCFQualityRule<Payload>[] = [
      {
        id: "projection.nonnegative",
        surface: "weekly_outcome",
        severity: "block",
        check: (data) => ({
          passed: data.projection >= 0,
          confidence: 1,
          message: "projection must be nonnegative",
          entityKey: data.playerId,
        }),
      },
    ];
    const report = evaluateCCFQualityRules(
      "weekly_outcome",
      { playerId: "p1", projection: -1 },
      rules,
    );
    expect(report.hasBlockingIssues).toBe(true);
    expect(report.events[0].fingerprint).toBe(
      fingerprintCCFQualityEvent({
        ruleId: "projection.nonnegative",
        surface: "weekly_outcome",
        entityKey: "p1",
      }),
    );
  });

  it("does not emit events for passing rules", () => {
    const report = evaluateCCFQualityRules(
      "weekly_outcome",
      { playerId: "p1", projection: 10 },
      [
        {
          id: "projection.nonnegative",
          surface: "weekly_outcome",
          severity: "block",
          check: (data) => ({ passed: data.projection >= 0, confidence: 1, message: "ok" }),
        },
      ],
    );
    expect(report.events).toEqual([]);
    expect(report.hasBlockingIssues).toBe(false);
  });

  it("fails closed when a quality rule itself throws", () => {
    const report = evaluateCCFQualityRules(
      "weekly_outcome",
      { playerId: "p1", projection: 10 },
      [
        {
          id: "broken.rule",
          surface: "weekly_outcome",
          severity: "warn",
          check: () => {
            throw new Error("boom");
          },
        },
      ],
    );
    expect(report.events[0]).toMatchObject({
      ruleId: "broken.rule",
      severity: "block",
    });
    expect(report.hasBlockingIssues).toBe(true);
  });
});
