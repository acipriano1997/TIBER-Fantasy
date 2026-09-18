import crypto from "crypto";
import type { CCFLineupSlot } from "./lineupDecision";

export const CCF_LINEUP_SLOT_GEOMETRY_VERSION =
  "ccf-lineup-slot-geometry-v1" as const;

export interface CCFLineupSlotGeometryV1 {
  contractVersion: typeof CCF_LINEUP_SLOT_GEOMETRY_VERSION;
  slots: CCFLineupSlot[];
  fingerprint: string;
}

export class CCFLineupSlotGeometryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFLineupSlotGeometryError";
  }
}

function canonicalSlots(slots: readonly CCFLineupSlot[]): CCFLineupSlot[] {
  if (slots.length === 0) {
    throw new CCFLineupSlotGeometryError("at least one lineup slot is required");
  }

  const slotIds = new Set<string>();
  const lockedPlayerIds = new Set<string>();
  const normalized = slots.map((slot): CCFLineupSlot => {
    if (!slot.slotId.trim()) {
      throw new CCFLineupSlotGeometryError("slotId is required");
    }
    if (!slot.slotType.trim()) {
      throw new CCFLineupSlotGeometryError(
        `slotType is required for ${slot.slotId}`,
      );
    }
    if (slotIds.has(slot.slotId)) {
      throw new CCFLineupSlotGeometryError(
        `duplicate lineup slot ${slot.slotId}`,
      );
    }
    slotIds.add(slot.slotId);

    if (slot.eligiblePositions.length === 0) {
      throw new CCFLineupSlotGeometryError(
        `slot ${slot.slotId} requires at least one eligible position`,
      );
    }
    if (
      new Set(slot.eligiblePositions).size !== slot.eligiblePositions.length
    ) {
      throw new CCFLineupSlotGeometryError(
        `slot ${slot.slotId} contains duplicate eligible positions`,
      );
    }

    if (slot.lockedPlayerId != null) {
      if (!slot.lockedPlayerId.trim()) {
        throw new CCFLineupSlotGeometryError(
          `slot ${slot.slotId} has a blank lockedPlayerId`,
        );
      }
      if (lockedPlayerIds.has(slot.lockedPlayerId)) {
        throw new CCFLineupSlotGeometryError(
          `locked player ${slot.lockedPlayerId} appears in multiple slots`,
        );
      }
      lockedPlayerIds.add(slot.lockedPlayerId);
    }

    return {
      slotId: slot.slotId,
      slotType: slot.slotType,
      eligiblePositions: [...slot.eligiblePositions].sort(),
      lockedPlayerId: slot.lockedPlayerId,
    };
  });

  return normalized.sort((left, right) =>
    left.slotId.localeCompare(right.slotId),
  );
}

export function fingerprintCCFLineupSlots(
  slots: readonly CCFLineupSlot[],
): string {
  const canonical = {
    contractVersion: CCF_LINEUP_SLOT_GEOMETRY_VERSION,
    slots: canonicalSlots(slots),
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

export function createCCFLineupSlotGeometry(
  slots: readonly CCFLineupSlot[],
): CCFLineupSlotGeometryV1 {
  const canonical = canonicalSlots(slots);
  return {
    contractVersion: CCF_LINEUP_SLOT_GEOMETRY_VERSION,
    slots: canonical,
    fingerprint: fingerprintCCFLineupSlots(canonical),
  };
}

export function verifyCCFLineupSlotGeometry(
  geometry: CCFLineupSlotGeometryV1,
): boolean {
  if (geometry.contractVersion !== CCF_LINEUP_SLOT_GEOMETRY_VERSION) {
    return false;
  }
  if (!/^[a-f0-9]{64}$/.test(geometry.fingerprint)) return false;
  try {
    return geometry.fingerprint === fingerprintCCFLineupSlots(geometry.slots);
  } catch {
    return false;
  }
}
