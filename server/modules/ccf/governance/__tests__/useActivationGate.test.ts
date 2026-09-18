import {
  ccfFailedUseGate,
  ccfPassedUseGate,
  evaluateCCFSourceUseActivation,
} from "../useActivationGate";

describe("CCF per-use activation gates", () => {
  const required = ["availability", "provenance", "freshness"] as const;

  it("fails closed when any required gate is missing", () => {
    const decision = evaluateCCFSourceUseActivation({
      sourceId: "source-1",
      useId: "ranking",
      requestedLevel: 3,
      requiredGates: required,
      gateResults: [
        ccfPassedUseGate("availability", "available"),
        ccfPassedUseGate("freshness", "fresh"),
      ],
    });
    expect(decision.resolvedLevel).toBe(0);
    expect(decision.missingRequiredGates).toEqual(["provenance"]);
  });

  it("permits the requested level only when all required gates allow it", () => {
    const decision = evaluateCCFSourceUseActivation({
      sourceId: "source-1",
      useId: "ranking",
      requestedLevel: 3,
      requiredGates: required,
      gateResults: [
        ccfPassedUseGate("availability", "available"),
        ccfPassedUseGate("provenance", "source-backed"),
        ccfPassedUseGate("freshness", "fresh"),
      ],
    });
    expect(decision.resolvedLevel).toBe(3);
    expect(decision.active).toBe(true);
  });

  it("caps visibility-only evidence even if a higher use level was requested", () => {
    const decision = evaluateCCFSourceUseActivation({
      sourceId: "source-1",
      useId: "ranking",
      requestedLevel: 3,
      requiredGates: required,
      gateResults: [
        ccfPassedUseGate("availability", "available"),
        ccfPassedUseGate("provenance", "generated baseline", 1),
        ccfPassedUseGate("freshness", "fresh"),
      ],
    });
    expect(decision.resolvedLevel).toBe(1);
  });

  it("lets the same source resolve differently for different uses", () => {
    const visibility = evaluateCCFSourceUseActivation({
      sourceId: "source-1",
      useId: "display",
      requestedLevel: 1,
      requiredGates: ["availability"],
      gateResults: [ccfPassedUseGate("availability", "available")],
    });
    const recommendation = evaluateCCFSourceUseActivation({
      sourceId: "source-1",
      useId: "recommendation",
      requestedLevel: 3,
      requiredGates: ["availability", "provenance"],
      gateResults: [
        ccfPassedUseGate("availability", "available"),
        ccfFailedUseGate("provenance", "not evidence-bearing"),
      ],
    });

    expect(visibility.resolvedLevel).toBe(1);
    expect(recommendation.resolvedLevel).toBe(0);
  });
});
