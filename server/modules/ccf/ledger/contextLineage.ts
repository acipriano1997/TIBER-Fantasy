import { fingerprintCCFLedgerPayload } from "./appendOnlyLedger";

export type CCFContextReadStatus = "available" | "absent" | "store_unavailable";

export interface CCFContextModelVersion<T> {
  versionId: string;
  workspaceId: string;
  canonicalSubjectId: string;
  operatorId: string;
  createdAt: string;
  payload: T;
  payloadSha256: string;
  supersedesVersionId: string | null;
}

export interface CCFContextObservation<T> {
  observationId: string;
  workspaceId: string;
  canonicalSubjectId: string;
  operatorId: string;
  observedAt: string;
  recordedAt: string;
  payload: T;
  payloadSha256: string;
}

export interface CCFContextReadResult<TModel, TObservation> {
  status: CCFContextReadStatus;
  latestModel: CCFContextModelVersion<TModel> | null;
  modelHistory: CCFContextModelVersion<TModel>[];
  observations: CCFContextObservation<TObservation>[];
  detail: string;
}

export class CCFContextLineageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFContextLineageError";
  }
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new CCFContextLineageError(`${label} must be a valid timestamp`);
  return parsed;
}

function assertIdentity(workspaceId: string, canonicalSubjectId: string, operatorId: string): void {
  if (!workspaceId.trim()) throw new CCFContextLineageError("workspaceId is required");
  if (!canonicalSubjectId.trim()) throw new CCFContextLineageError("canonicalSubjectId is required; display names are not durable identity");
  if (!operatorId.trim()) throw new CCFContextLineageError("operatorId is required");
}

export function createCCFContextModelVersion<T>(input: {
  versionId: string;
  workspaceId: string;
  canonicalSubjectId: string;
  operatorId: string;
  createdAt: string;
  payload: T;
  previous?: CCFContextModelVersion<T>;
}): CCFContextModelVersion<T> {
  if (!input.versionId.trim()) throw new CCFContextLineageError("versionId is required");
  assertIdentity(input.workspaceId, input.canonicalSubjectId, input.operatorId);
  const createdAt = parseTimestamp("createdAt", input.createdAt);

  if (input.previous) {
    if (
      input.previous.workspaceId !== input.workspaceId ||
      input.previous.canonicalSubjectId !== input.canonicalSubjectId
    ) {
      throw new CCFContextLineageError("new context version must remain bound to the same workspace and canonical subject");
    }
    if (input.previous.versionId === input.versionId) {
      throw new CCFContextLineageError("new context version requires a new immutable versionId");
    }
    if (createdAt < parseTimestamp("previous.createdAt", input.previous.createdAt)) {
      throw new CCFContextLineageError("new context version cannot predate the prior version");
    }
  }

  return {
    versionId: input.versionId,
    workspaceId: input.workspaceId,
    canonicalSubjectId: input.canonicalSubjectId,
    operatorId: input.operatorId,
    createdAt: input.createdAt,
    payload: input.payload,
    payloadSha256: fingerprintCCFLedgerPayload(input.payload),
    supersedesVersionId: input.previous?.versionId ?? null,
  };
}

export function createCCFContextObservation<T>(input: {
  observationId: string;
  workspaceId: string;
  canonicalSubjectId: string;
  operatorId: string;
  observedAt: string;
  recordedAt: string;
  payload: T;
}): CCFContextObservation<T> {
  if (!input.observationId.trim()) throw new CCFContextLineageError("observationId is required");
  assertIdentity(input.workspaceId, input.canonicalSubjectId, input.operatorId);
  const observedAt = parseTimestamp("observedAt", input.observedAt);
  const recordedAt = parseTimestamp("recordedAt", input.recordedAt);
  if (observedAt > recordedAt) {
    throw new CCFContextLineageError("observedAt cannot be in the future relative to recordedAt");
  }

  return {
    ...input,
    payloadSha256: fingerprintCCFLedgerPayload(input.payload),
  };
}

export function resolveCCFContextRead<TModel, TObservation>(input: {
  storeAvailable: boolean;
  models: readonly CCFContextModelVersion<TModel>[];
  observations: readonly CCFContextObservation<TObservation>[];
}): CCFContextReadResult<TModel, TObservation> {
  if (!input.storeAvailable) {
    return {
      status: "store_unavailable",
      latestModel: null,
      modelHistory: [],
      observations: [],
      detail: "context store unavailable; this must not be interpreted as no saved context",
    };
  }

  const models = [...input.models].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const observations = [...input.observations].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  if (models.length === 0 && observations.length === 0) {
    return {
      status: "absent",
      latestModel: null,
      modelHistory: [],
      observations: [],
      detail: "store available and no context lineage exists",
    };
  }

  return {
    status: "available",
    latestModel: models[models.length - 1] ?? null,
    modelHistory: models,
    observations,
    detail: "immutable context lineage available",
  };
}
