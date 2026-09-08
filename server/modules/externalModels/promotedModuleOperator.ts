type PromotedModuleErrorCode =
  | 'config_error'
  | 'not_found'
  | 'not_promoted'
  | 'invalid_payload'
  | 'malformed_export'
  | 'upstream_unavailable'
  | 'upstream_timeout'
  | 'ambiguous';

interface PromotedModuleStatusSnapshot {
  readiness?: string;
  configured?: boolean;
  enabled?: boolean;
  baseUrl?: string;
  endpointPath?: string;
  labEndpointPath?: string;
  exportsPath?: string;
  exportsDir?: string;
  timeoutMs?: number;
}

export interface PromotedModuleOperatorDetails {
  state: 'misconfigured' | 'no_data' | 'contract_error' | 'dependency_unavailable';
  dependencySummary: string;
  configuredSource: string | null;
  recommendedAction: string;
  readOnlyMessage: string;
}

function pickConfiguredSource(status: PromotedModuleStatusSnapshot): string | null {
  const pathCandidate = status.exportsDir ?? status.exportsPath ?? null;

  if (status.baseUrl && status.labEndpointPath) {
    return `${status.baseUrl}${status.labEndpointPath}`;
  }

  if (status.baseUrl && status.endpointPath) {
    return `${status.baseUrl}${status.endpointPath}`;
  }

  return status.baseUrl ?? pathCandidate;
}

export function buildPromotedModuleOperatorDetails(options: {
  moduleLabel: string;
  dependencySummary: string;
  errorCode: PromotedModuleErrorCode;
  status: PromotedModuleStatusSnapshot;
}): PromotedModuleOperatorDetails {
  const configuredSource = pickConfiguredSource(options.status);
  const readOnlyMessage = `${options.moduleLabel} remains a read-only promoted model surface inside TIBER-Fantasy.`;

  switch (options.errorCode) {
    case 'config_error':
      return {
        state: 'misconfigured',
        dependencySummary: options.dependencySummary,
        configuredSource,
        recommendedAction: configuredSource
          ? `Verify that the configured upstream location is correct and readable before reopening this module.`
          : `Set the required upstream API base URL or promoted export path before reopening this module.`,
        readOnlyMessage,
      };
    case 'not_found':
      return {
        state: 'no_data',
        dependencySummary: options.dependencySummary,
        configuredSource,
        recommendedAction: 'This is a no-data state, not a local recomputation state. Confirm the selected player/season exists upstream.',
        readOnlyMessage,
      };
    case 'not_promoted':
      return {
        state: 'no_data',
        dependencySummary: options.dependencySummary,
        configuredSource,
        recommendedAction: 'Wait for an explicit upstream promotion after backtest and prescriptive validation pass. Do not fabricate or locally promote the signal.',
        readOnlyMessage,
      };
    case 'invalid_payload':
    case 'malformed_export':
    case 'ambiguous':
      return {
        state: 'contract_error',
        dependencySummary: options.dependencySummary,
        configuredSource,
        recommendedAction: 'Inspect the promoted payload contract upstream and correct malformed or ambiguous fields before trusting this surface again.',
        readOnlyMessage,
      };
    default:
      return {
        state: 'dependency_unavailable',
        dependencySummary: options.dependencySummary,
        configuredSource,
        recommendedAction: 'Retry after the upstream dependency is healthy again; TIBER-Fantasy will not fabricate fallback data for this promoted module.',
        readOnlyMessage,
      };
  }
}
