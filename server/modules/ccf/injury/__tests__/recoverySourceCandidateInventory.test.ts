import {
  assertCCFRecoveryMinimumSourceCoverage,
  fingerprintCCFRecoverySourceBindingPlan,
} from "../injurySourceBinding";
import {
  CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY,
  CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY_FINGERPRINT,
  getCCFRecoverySourceCandidateInventory,
} from "../recoverySourceCandidateInventory";

describe("CCF recovery source candidate inventory", () => {
  it("is valid and deterministically fingerprinted", () => {
    const inventory = getCCFRecoverySourceCandidateInventory();
    expect(fingerprintCCFRecoverySourceBindingPlan(inventory)).toBe(
      CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY_FINGERPRINT,
    );
  });

  it("contains no production-eligible bindings", () => {
    expect(
      CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.filter(
        (binding) => binding.status === "production_eligible",
      ),
    ).toEqual([]);
  });

  it("uses Sportradar Weekly Injuries as the leading designation and practice candidates", () => {
    const designation = CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.find(
      (binding) =>
        binding.sourceClass === "official_injury_designation" &&
        binding.status === "candidate",
    );
    const practice = CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.find(
      (binding) =>
        binding.sourceClass === "official_practice_participation" &&
        binding.status === "candidate",
    );

    expect(designation).toMatchObject({
      bindingId: "sportradar-nfl-weekly-injuries-designation-candidate-v1",
      provider: "Sportradar",
      datasetOrProduct: "NFL Official API - Weekly Injuries",
      permissionStatus: "evaluation_only",
      parserVersion: null,
      status: "candidate",
    });
    expect(practice).toMatchObject({
      bindingId: "sportradar-nfl-weekly-injuries-practice-candidate-v1",
      provider: "Sportradar",
      datasetOrProduct: "NFL Official API - Weekly Injuries",
      permissionStatus: "evaluation_only",
      parserVersion: null,
      status: "candidate",
    });
  });

  it("tracks the reactivated nflverse injury feed as prospectively archived without production promotion", () => {
    const nflverse = CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.filter(
      (binding) => binding.provider === "nflverse" && binding.datasetOrProduct === "injuries",
    );

    expect(nflverse).toHaveLength(2);
    expect(nflverse.every((binding) => binding.status === "candidate")).toBe(true);
    expect(nflverse.every((binding) => binding.permissionStatus === "unreviewed")).toBe(true);
    expect(nflverse.every((binding) => binding.reliabilityStatus === "incomplete")).toBe(true);
    expect(nflverse.every((binding) => binding.parserVersion === "ccf-nflverse-injuries-candidate-v2")).toBe(true);
    expect(nflverse.every((binding) => binding.temporalMode === "archived_point_in_time")).toBe(true);
    expect(nflverse.every((binding) => binding.archiveStrategy === "immutable_snapshot")).toBe(true);
    expect(nflverse.every((binding) => binding.pointInTimeSemanticsDocumented)).toBe(true);
    expect(nflverse.every((binding) => binding.rawTraceSupported)).toBe(true);
    expect(
      nflverse.every((binding) =>
        binding.notes.some((note) => /2026|reactivated|live release|publishes 2025 and 2026/i.test(note)),
      ),
    ).toBe(true);
    expect(
      nflverse.every((binding) =>
        binding.notes.some((note) => /knownAt|exact.*bytes|prospectiv/i.test(note)),
      ),
    ).toBe(true);
  });

  it("tracks Sportradar NFL Official Game Roster as the viable activation candidate", () => {
    const activation = CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.find(
      (binding) =>
        binding.sourceClass === "official_game_activation" &&
        binding.status === "candidate",
    );

    expect(activation).toMatchObject({
      bindingId: "sportradar-nfl-official-game-roster-candidate-v1",
      provider: "Sportradar",
      datasetOrProduct: "NFL Official API - Game Roster",
      authority: "raw_fact",
      status: "candidate",
      permissionStatus: "evaluation_only",
      temporalMode: "current_snapshot_only",
      archiveStrategy: "none",
      parserVersion: null,
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
    });
    expect(activation?.sourceLocatorTemplate).toContain("api.sportradar.com/nfl/official/");
    expect(activation?.licenseOrTermsRef).toContain("developer.sportradar.com");
  });

  it("uses SportsDataIO as the leading workload candidate with an explicit model-license path", () => {
    const workload = CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.find(
      (binding) =>
        binding.sourceClass === "observed_game_usage" &&
        binding.status === "candidate",
    );

    expect(workload).toMatchObject({
      bindingId: "sportsdataio-nfl-player-game-snap-counts-candidate-v1",
      provider: "SportsDataIO",
      datasetOrProduct: "NFL PlayerGame / Snap Counts",
      authority: "observed_football_evidence",
      status: "candidate",
      permissionStatus: "evaluation_only",
      reliabilityStatus: "incomplete",
    });
    expect(workload?.licenseOrTermsRef).toContain("sportsdata.io");
    expect(workload?.notes.some((note) => /statistical\/ML model inputs/i.test(note))).toBe(true);
  });

  it("keeps PFR-derived nflverse snap counts off the production path while intended-use rights conflict", () => {
    const pfr = CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.find(
      (binding) => binding.bindingId === "nflverse-pfr-snap-counts-reference-v1",
    );

    expect(pfr).toMatchObject({
      provider: "nflverse / Pro Football Reference",
      sourceClass: "observed_game_usage",
      status: "research_only",
      permissionStatus: "conflicted",
      temporalMode: "archived_point_in_time",
      rawTraceSupported: true,
    });
    expect(pfr?.notes.some((note) => /Do not use.*production model fitting/i.test(note))).toBe(true);
  });

  it("retains NFL.com public inactive reports as a terms-blocked rejected path", () => {
    const rejected = CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.find(
      (binding) => binding.bindingId === "nfl-official-inactive-report-terms-blocked-v1",
    );

    expect(rejected).toMatchObject({
      sourceClass: "official_game_activation",
      provider: "NFL.com",
      status: "rejected",
      permissionStatus: "prohibited",
      archiveStrategy: "none",
      parserVersion: null,
    });
    expect(rejected?.licenseOrTermsRef).toMatch(/systematic retrieval/i);
  });

  it("keeps the minimum source coverage gate failing until promotion proof exists", () => {
    expect(() =>
      assertCCFRecoveryMinimumSourceCoverage(CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY),
    ).toThrow(/official injury designation evidence/);
  });
});