export type LeagueSourceHealthStatus = 'healthy' | 'stale' | 'unavailable' | 'conflict';

export type LeagueSourceHealth = {
  status: LeagueSourceHealthStatus;
  asOf: string | null;
  checkedAt: string;
  ageMs: number | null;
  maxAgeMs: number | null;
  reason: string | null;
};

export type EvaluateSourceHealthInput = {
  asOf?: string | Date | null;
  checkedAt?: string | Date;
  maxAgeMs?: number | null;
  available?: boolean;
  conflictReason?: string | null;
  unavailableReason?: string | null;
};

function iso(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid source timestamp: ${String(value)}`);
  }
  return parsed.toISOString();
}

export function evaluateSourceHealth(input: EvaluateSourceHealthInput): LeagueSourceHealth {
  const checkedAt = iso(input.checkedAt ?? new Date());

  if (input.conflictReason) {
    return {
      status: 'conflict',
      asOf: input.asOf ? iso(input.asOf) : null,
      checkedAt,
      ageMs: null,
      maxAgeMs: input.maxAgeMs ?? null,
      reason: input.conflictReason,
    };
  }

  if (input.available === false || !input.asOf) {
    return {
      status: 'unavailable',
      asOf: input.asOf ? iso(input.asOf) : null,
      checkedAt,
      ageMs: null,
      maxAgeMs: input.maxAgeMs ?? null,
      reason: input.unavailableReason ?? 'Source has not been refreshed or no as-of timestamp is available.',
    };
  }

  const asOf = iso(input.asOf);
  const ageMs = Math.max(0, new Date(checkedAt).getTime() - new Date(asOf).getTime());
  const maxAgeMs = input.maxAgeMs ?? null;

  if (maxAgeMs !== null && ageMs > maxAgeMs) {
    return {
      status: 'stale',
      asOf,
      checkedAt,
      ageMs,
      maxAgeMs,
      reason: `Source age ${ageMs}ms exceeds maximum ${maxAgeMs}ms.`,
    };
  }

  return {
    status: 'healthy',
    asOf,
    checkedAt,
    ageMs,
    maxAgeMs,
    reason: null,
  };
}

export function isSourceUsable(health: LeagueSourceHealth): boolean {
  return health.status === 'healthy';
}
