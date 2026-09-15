import { createHash } from 'node:crypto';
import { evaluateSourceHealth, type LeagueSourceHealth } from './sourceHealth';

export const CORE_FANTASY_SCORING_KEYS = [
  'pass_yd',
  'pass_td',
  'int',
  'rush_yd',
  'rush_td',
  'rec',
  'rec_yd',
  'rec_td',
  'fum_lost',
] as const;

export type ScoringCertificationStatus = 'certified' | 'incomplete' | 'stale' | 'unavailable';

export type ScoringCertification = {
  schemaVersion: 'scoring-certification.v1';
  status: ScoringCertificationStatus;
  platform: string;
  leagueId: string;
  asOf: string | null;
  settings: Record<string, number>;
  requiredKeys: string[];
  missingKeys: string[];
  invalidKeys: string[];
  fingerprint: string | null;
  sourceHealth: LeagueSourceHealth;
  noSilentDefaults: true;
  issues: string[];
};

export type CertifyScoringInput = {
  platform: string;
  leagueId: string;
  rawSettings?: Record<string, number> | null;
  asOf?: string | Date | null;
  checkedAt?: string | Date;
  maxAgeMs?: number | null;
  requiredKeys?: readonly string[];
};

function stableRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

function scoringFingerprint(
  platform: string,
  leagueId: string,
  settings: Record<string, number>,
): string {
  const payload = JSON.stringify({ platform, leagueId, settings: stableRecord(settings) });
  return createHash('sha256').update(payload).digest('hex');
}

export function certifyScoringSettings(input: CertifyScoringInput): ScoringCertification {
  const requiredKeys = [...(input.requiredKeys ?? CORE_FANTASY_SCORING_KEYS)];
  const settings = input.rawSettings ? { ...input.rawSettings } : {};
  const invalidKeys = Object.entries(settings)
    .filter(([, value]) => typeof value !== 'number' || !Number.isFinite(value))
    .map(([key]) => key)
    .sort();
  const missingKeys = requiredKeys.filter((key) => !(key in settings)).sort();
  const available = Object.keys(settings).length > 0;
  const sourceHealth = evaluateSourceHealth({
    asOf: input.asOf,
    checkedAt: input.checkedAt,
    maxAgeMs: input.maxAgeMs ?? null,
    available,
    unavailableReason: available
      ? 'Scoring settings have no usable as-of timestamp.'
      : 'Platform scoring settings are unavailable; generic fantasy defaults are forbidden.',
  });

  const issues: string[] = [];
  if (!available) issues.push('Platform scoring settings are unavailable.');
  if (missingKeys.length) issues.push(`Missing required scoring keys: ${missingKeys.join(', ')}.`);
  if (invalidKeys.length) issues.push(`Invalid non-finite scoring values: ${invalidKeys.join(', ')}.`);
  if (sourceHealth.status === 'stale') issues.push('Platform scoring settings are stale.');
  if (sourceHealth.status === 'unavailable' && available) issues.push('Scoring source freshness cannot be established.');

  let status: ScoringCertificationStatus;
  if (!available || sourceHealth.status === 'unavailable') status = 'unavailable';
  else if (sourceHealth.status === 'stale') status = 'stale';
  else if (missingKeys.length || invalidKeys.length) status = 'incomplete';
  else status = 'certified';

  return {
    schemaVersion: 'scoring-certification.v1',
    status,
    platform: input.platform,
    leagueId: input.leagueId,
    asOf: sourceHealth.asOf,
    settings,
    requiredKeys,
    missingKeys,
    invalidKeys,
    fingerprint: available && invalidKeys.length === 0
      ? scoringFingerprint(input.platform, input.leagueId, settings)
      : null,
    sourceHealth,
    noSilentDefaults: true,
    issues,
  };
}

export function assertScoringCertified(certification: ScoringCertification): void {
  if (certification.status !== 'certified') {
    const detail = certification.issues.length
      ? certification.issues.join(' ')
      : `status=${certification.status}`;
    throw new Error(`League scoring is not certified; abstain instead of using defaults. ${detail}`);
  }
}
