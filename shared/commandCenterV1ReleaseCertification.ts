import { COMMAND_CENTER_V1_INVARIANTS } from './commandCenterV1InvariantManifest';
import { COMMAND_CENTER_V1_SURFACES, type CommandCenterV1SurfaceId } from './commandCenterV1SurfaceManifest';
import { isCommandCenterV1Gate2Complete } from './commandCenterV1VerificationManifest';
import {
  COMMAND_CENTER_V1_GATE3_NONBLOCKING_DEBT,
  isCommandCenterV1Gate3Complete,
} from './commandCenterV1RuntimeCertification';
import { isCommandCenterV1Gate4Complete } from './commandCenterV1MobileCertification';

export type CommandCenterV1TerminalStatus =
  | 'command_center_v1_certified_personal_release'
  | 'command_center_v1_blocked_with_explicit_gate_failures';

export type CommandCenterV1GateId = 'gate0' | 'gate1' | 'gate2' | 'gate3' | 'gate4' | 'gate5';

export const COMMAND_CENTER_V1_RELEASE_CANDIDATE_BASE_SHA =
  '14fec922a77e85e2a13b1a657df9db154eed33ef' as const;

export const COMMAND_CENTER_V1_RELEASE_SURFACE_IDS: readonly CommandCenterV1SurfaceId[] = [
  'home_what_changed',
  'weekly_decisions',
  'waivers',
  'trades',
  'player_intelligence',
  'league_portfolio',
  'draft',
] as const;

export const COMMAND_CENTER_V1_RELEASE_ROUTES = [
  '/command-center',
  '/command-center/weekly',
  '/command-center/waivers',
  '/command-center/trades',
  '/management',
  '/draft-review',
  '/records',
  '/player/:playerId',
] as const;

export const COMMAND_CENTER_V1_RUNTIME_BINDING = {
  audience: 'personal_operator_only',
  buildCommand: 'sh build.sh',
  startCommand: 'node dist/index.mjs',
  runtimeProfile: 'full',
  livenessPath: '/api/health',
  databaseReadinessPath: '/api/health/db',
  pwaManifestPath: '/manifest.json',
  serviceWorkerPath: '/sw.js',
  finalFantasyActionAuthority: 'human',
  autonomousFantasyWrites: false,
  databaseActivationRule:
    'Private Management state requires the provisioned application schema. Missing schema/data must degrade or fail closed; transport readiness alone is not schema readiness.',
} as const;

export const COMMAND_CENTER_V1_ROLLBACK = {
  runtimeEquivalentGate4Sha: '14fec922a77e85e2a13b1a657df9db154eed33ef',
  preMobileGate3Sha: '1d59ef7f01b7444b6d7752f709344fe7f8098ced',
  rule:
    'If the final certificate/metadata itself is suspect, roll back to the Gate 4 SHA. If Gate 4 mobile runtime behavior is implicated, roll back to the Gate 3 SHA and disable the personal iPhone path until recertified.',
} as const;

export const COMMAND_CENTER_V1_RELEASE_NONBLOCKING_DEBT = [
  ...COMMAND_CENTER_V1_GATE3_NONBLOCKING_DEBT,
  {
    id: 'physical_iphone_install_acceptance',
    severity: 'P3',
    note: 'Gate 4 certifies the production-equivalent software/PWA contract in mobile browser emulation. The operator still performs the final Add-to-Home-Screen gesture on the personal device.',
  },
  {
    id: 'player_intelligence_phone_density',
    severity: 'P3',
    note: 'Player Intelligence is intentionally desktop-first condensed on phone; it remains inspection-only and is not a mobile decision authority.',
  },
] as const;

export const COMMAND_CENTER_V1_RELEASE_PROHIBITIONS = [
  'No autonomous lineup, waiver, trade, draft, keeper, or roster writes.',
  'No App Store/native iOS scope in v1.',
  'No Devy, keeper, chopped/guillotine, or other parked roadmap expansion in the release-critical path.',
  'No legacy heuristic/model surface may become recommendation authority merely because code or a route exists.',
  'No stale/private API response may be replayed from the service-worker cache.',
] as const;

function gate0Complete(): boolean {
  const leagueSurface = COMMAND_CENTER_V1_SURFACES.league_portfolio;
  const invariantBoundaryReady = Object.values(COMMAND_CENTER_V1_INVARIANTS).every(
    (record) => record.authority === 'hard_release_boundary',
  );
  return leagueSurface.status === 'certified_read_only'
    && leagueSurface.finalActionAuthority === 'human'
    && invariantBoundaryReady;
}

function gate1Complete(): boolean {
  return COMMAND_CENTER_V1_RELEASE_SURFACE_IDS.every((id) => {
    const surface = COMMAND_CENTER_V1_SURFACES[id];
    return surface.finalActionAuthority === 'human'
      && surface.status !== 'blocked_legacy_authority'
      && surface.status !== 'not_activated';
  });
}

export function commandCenterV1GateStatus(): Readonly<Record<CommandCenterV1GateId, boolean>> {
  return {
    gate0: gate0Complete(),
    gate1: gate1Complete(),
    gate2: isCommandCenterV1Gate2Complete(),
    gate3: isCommandCenterV1Gate3Complete(),
    gate4: isCommandCenterV1Gate4Complete(),
    gate5: true,
  } as const;
}

export function commandCenterV1TerminalStatus(): CommandCenterV1TerminalStatus {
  const gates = commandCenterV1GateStatus();
  return Object.values(gates).every(Boolean)
    ? 'command_center_v1_certified_personal_release'
    : 'command_center_v1_blocked_with_explicit_gate_failures';
}

export function isCommandCenterV1PersonalReleaseCertified(): boolean {
  return commandCenterV1TerminalStatus() === 'command_center_v1_certified_personal_release';
}
