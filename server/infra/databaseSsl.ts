export type DatabaseSslConfig = false | { rejectUnauthorized: false };

export type DatabaseSslPolicyInput = {
  nodeEnv?: string | null;
  databaseSsl?: string | null;
};

const DISABLED_VALUES = new Set(['disable', 'disabled', 'false', '0', 'off', 'no']);
const REQUIRED_VALUES = new Set(['require', 'required', 'true', '1', 'on', 'yes']);

/**
 * Resolve the PostgreSQL TLS contract independently from the process that uses it.
 *
 * Historical TIBER behavior enabled TLS for every `NODE_ENV=production` process and
 * disabled it everywhere else. Keep that production-safe default, but allow an
 * operator/deployment to explicitly declare a non-TLS PostgreSQL endpoint (for
 * example a localhost/ephemeral CI database) without pretending that DB readiness
 * passed under a different runtime environment.
 *
 * Supported explicit values:
 * - DATABASE_SSL=disable  -> no TLS
 * - DATABASE_SSL=require  -> TLS with the repository's existing managed-DB policy
 *
 * Boolean-like aliases are accepted for deployment ergonomics. Unknown values fail
 * fast so a typo cannot silently weaken or unexpectedly require transport security.
 */
export function resolveDatabaseSslConfig({
  nodeEnv,
  databaseSsl,
}: DatabaseSslPolicyInput): DatabaseSslConfig {
  const explicit = databaseSsl?.trim().toLowerCase();

  if (explicit) {
    if (DISABLED_VALUES.has(explicit)) return false;
    if (REQUIRED_VALUES.has(explicit)) return { rejectUnauthorized: false };
    throw new Error(
      `Unsupported DATABASE_SSL value ${JSON.stringify(databaseSsl)}; expected disable or require`,
    );
  }

  return nodeEnv === 'production' ? { rejectUnauthorized: false } : false;
}
