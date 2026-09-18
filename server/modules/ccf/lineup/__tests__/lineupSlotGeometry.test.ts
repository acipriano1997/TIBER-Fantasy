import {
  createCCFLineupSlotGeometry,
  fingerprintCCFLineupSlots,
  verifyCCFLineupSlotGeometry,
} from "../lineupSlotGeometry";
import type { CCFLineupSlot } from "../lineupDecision";

function slots(): CCFLineupSlot[] {
  return [
    {
      slotId: "WR:1",
      slotType: "WR",
      eligiblePositions: ["WR"],
      lockedPlayerId: null,
    },
    {
      slotId: "FLEX:1",
      slotType: "FLEX",
      eligiblePositions: ["WR", "RB", "TE"],
      lockedPlayerId: "rb-1",
    },
  ];
}

describe("CCF lineup slot geometry", () => {
  it("canonicalizes slot and eligible-position presentation order", () => {
    const first = slots();
    const reordered = [
      {
        ...first[1],
        eligiblePositions: ["TE", "WR", "RB"] as const,
      },
      first[0],
    ] as unknown as CCFLineupSlot[];

    expect(fingerprintCCFLineupSlots(first)).toBe(
      fingerprintCCFLineupSlots(reordered),
    );
  });

  it("changes when recommendation-relevant slot eligibility changes", () => {
    const first = slots();
    const changed = slots();
    changed[1] = {
      ...changed[1],
      eligiblePositions: ["WR", "RB"],
    };

    expect(fingerprintCCFLineupSlots(first)).not.toBe(
      fingerprintCCFLineupSlots(changed),
    );
  });

  it("changes when the frozen locked-player slot binding changes", () => {
    const first = slots();
    const changed = slots();
    changed[1] = {
      ...changed[1],
      lockedPlayerId: "rb-2",
    };

    expect(fingerprintCCFLineupSlots(first)).not.toBe(
      fingerprintCCFLineupSlots(changed),
    );
  });

  it("rejects duplicate slots and duplicate locked players", () => {
    expect(() =>
      createCCFLineupSlotGeometry([slots()[0], slots()[0]]),
    ).toThrow(/duplicate lineup slot/);

    const duplicateLocked = slots();
    duplicateLocked.push({
      slotId: "RB:1",
      slotType: "RB",
      eligiblePositions: ["RB"],
      lockedPlayerId: "rb-1",
    });
    expect(() => createCCFLineupSlotGeometry(duplicateLocked)).toThrow(
      /appears in multiple slots/,
    );
  });

  it("detects mutation after a slot geometry has been frozen", () => {
    const frozen = createCCFLineupSlotGeometry(slots());
    expect(verifyCCFLineupSlotGeometry(frozen)).toBe(true);

    frozen.slots[1].eligiblePositions = ["RB"];
    expect(verifyCCFLineupSlotGeometry(frozen)).toBe(false);
  });
});
