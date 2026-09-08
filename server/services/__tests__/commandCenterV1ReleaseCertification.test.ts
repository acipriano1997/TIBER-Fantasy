import fs from 'node:fs';
import path from 'node:path';
import {
  COMMAND_CENTER_V1_RELEASE_CANDIDATE_BASE_SHA,
  COMMAND_CENTER_V1_RELEASE_NONBLOCKING_DEBT,
  COMMAND_CENTER_V1_RELEASE_PROHIBITIONS,
  COMMAND_CENTER_V1_RELEASE_ROUTES,
  COMMAND_CENTER_V1_RELEASE_SURFACE_IDS,
  COMMAND_CENTER_V1_ROLLBACK,
  COMMAND_CENTER_V1_RUNTIME_BINDING,
  commandCenterV1GateStatus,
  commandCenterV1TerminalStatus,
  isCommandCenterV1Gate5Complete,
  isCommandCenterV1PersonalReleaseCertified,
} from '../../../shared/commandCenterV1ReleaseCertification';
import {
  COMMAND_CENTER_V1_REQUIRED_SURFACE_IDS,
  COMMAND_CENTER_V1_SURFACES,
} from '../../../shared/commandCenterV1SurfaceManifest';
import { COMMAND_CENTER_V1_GATE4_CAPABILITIES } from '../../../shared/commandCenterV1MobileCertification';

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('Command Center v1 Gate 5 final personal release certification', () => {
  test('all six release gates resolve certified and emit only the success terminal state', () => {
    const gates = commandCenterV1GateStatus();
    expect(Object.keys(gates).sort()).toEqual(['gate0', 'gate1', 'gate2', 'gate3', 'gate4', 'gate5']);
    expect(gates.gate5).toBe(isCommandCenterV1Gate5Complete());
    expect(isCommandCenterV1Gate5Complete()).toBe(true);
    expect(Object.values(gates).every(Boolean)).toBe(true);
    expect(isCommandCenterV1PersonalReleaseCertified()).toBe(true);
    expect(commandCenterV1TerminalStatus()).toBe('command_center_v1_certified_personal_release');
  });

  test('pins the frozen Gate 4 candidate base and explicit rollback points', () => {
    expect(COMMAND_CENTER_V1_RELEASE_CANDIDATE_BASE_SHA).toMatch(/^[0-9a-f]{40}$/);
    expect(COMMAND_CENTER_V1_RELEASE_CANDIDATE_BASE_SHA).toBe(COMMAND_CENTER_V1_ROLLBACK.runtimeEquivalentGate4Sha);
    expect(COMMAND_CENTER_V1_ROLLBACK.preMobileGate3Sha).toMatch(/^[0-9a-f]{40}$/);
    expect(COMMAND_CENTER_V1_ROLLBACK.preMobileGate3Sha).not.toBe(COMMAND_CENTER_V1_RELEASE_CANDIDATE_BASE_SHA);
    expect(COMMAND_CENTER_V1_ROLLBACK.rule).toContain('roll back');
  });

  test('keeps every release surface human-authority and closes the route/surface inventory exactly', () => {
    expect(new Set(COMMAND_CENTER_V1_RELEASE_SURFACE_IDS)).toEqual(new Set(COMMAND_CENTER_V1_REQUIRED_SURFACE_IDS));
    for (const id of COMMAND_CENTER_V1_RELEASE_SURFACE_IDS) {
      const surface = COMMAND_CENTER_V1_SURFACES[id];
      expect(surface.finalActionAuthority).toBe('human');
      expect(surface.status).not.toBe('blocked_legacy_authority');
      expect(surface.status).not.toBe('not_activated');
      expect(surface.canonicalRoute).not.toBeNull();
      expect(COMMAND_CENTER_V1_RELEASE_ROUTES).toContain(surface.canonicalRoute as typeof COMMAND_CENTER_V1_RELEASE_ROUTES[number]);
    }
    expect(new Set(COMMAND_CENTER_V1_RELEASE_ROUTES).size).toBe(COMMAND_CENTER_V1_RELEASE_ROUTES.length);
    expect(COMMAND_CENTER_V1_RELEASE_ROUTES).toContain('/management');
    expect(COMMAND_CENTER_V1_RELEASE_ROUTES).toContain('/records');
    expect(COMMAND_CENTER_V1_SURFACES.records.status).toBe('certified_read_only');
  });

  test('admits no P0/P1 release debt and keeps all retained debt explicit and unique', () => {
    const ids = COMMAND_CENTER_V1_RELEASE_NONBLOCKING_DEBT.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(COMMAND_CENTER_V1_RELEASE_NONBLOCKING_DEBT.length).toBeGreaterThan(0);
    for (const debt of COMMAND_CENTER_V1_RELEASE_NONBLOCKING_DEBT) {
      expect(['P2', 'P3']).toContain(debt.severity);
      expect(debt.note.length).toBeGreaterThan(20);
    }
  });

  test('binds one personal runtime, explicit readiness, PWA paths, and human-only writes', () => {
    expect(COMMAND_CENTER_V1_RUNTIME_BINDING.audience).toBe('personal_operator_only');
    expect(COMMAND_CENTER_V1_RUNTIME_BINDING.buildCommand).toBe('sh build.sh');
    expect(COMMAND_CENTER_V1_RUNTIME_BINDING.startCommand).toBe('node dist/index.mjs');
    expect(COMMAND_CENTER_V1_RUNTIME_BINDING.runtimeProfile).toBe('full');
    expect(COMMAND_CENTER_V1_RUNTIME_BINDING.livenessPath).toBe('/api/health');
    expect(COMMAND_CENTER_V1_RUNTIME_BINDING.databaseReadinessPath).toBe('/api/health/db');
    expect(COMMAND_CENTER_V1_RUNTIME_BINDING.pwaManifestPath).toBe('/manifest.json');
    expect(COMMAND_CENTER_V1_RUNTIME_BINDING.serviceWorkerPath).toBe('/sw.js');
    expect(COMMAND_CENTER_V1_RUNTIME_BINDING.finalFantasyActionAuthority).toBe('human');
    expect(COMMAND_CENTER_V1_RUNTIME_BINDING.autonomousFantasyWrites).toBe(false);
    expect(COMMAND_CENTER_V1_RUNTIME_BINDING.databaseActivationRule).toContain('transport readiness alone is not schema readiness');
  });

  test('Gate 4 release provenance matches the final service-worker API bypass implementation', () => {
    const privateApi = COMMAND_CENTER_V1_GATE4_CAPABILITIES.private_api_network_only;
    expect(privateApi.reason).toContain('bypass the service-worker response pipeline');
    expect(privateApi.evidence).toContain('scripts/command-center-mobile-pwa-certify.mjs');
    expect(privateApi.evidence).not.toContain('scripts/command-center-mobile-pwa-smoke.mjs');

    const sw = read('client/public/sw.js');
    const marker = "url.pathname.toLowerCase().startsWith('/api/')";
    const apiStart = sw.indexOf(marker);
    const documentStart = sw.indexOf("if (request.destination === 'document')", apiStart);
    expect(apiStart).toBeGreaterThanOrEqual(0);
    expect(documentStart).toBeGreaterThan(apiStart);
    const branch = sw.slice(apiStart, documentStart);
    expect(branch).toContain('return;');
    expect(branch).not.toContain('respondWith');
  });

  test('final workflow reruns security, scope freeze, release contracts, exact build, desktop browser, and mobile browser certification', () => {
    const workflow = read('.github/workflows/command-center-gate5-release.yml');
    expect(workflow).toContain('npm audit --omit=dev --audit-level=high');
    expect(workflow).toContain('git merge-base --is-ancestor');
    expect(workflow).toContain('commandCenterV1ReleaseCertification.test.ts');
    expect(workflow).toContain('commandCenterV1InvariantReplay.test.ts');
    expect(workflow).toContain('sh build.sh');
    expect(workflow).toContain('node scripts/command-center-browser-smoke.mjs');
    expect(workflow).toContain('node scripts/command-center-mobile-pwa-certify.mjs');
    expect(workflow).toContain('node scripts/command-center-mobile-list-smoke.mjs');
    expect(workflow).toContain('/api/health/db');
  });

  test('release document contains the terminal states, runtime binding, debt policy, and rollback SHAs', () => {
    const doc = read('docs/command-center-v1/release-certification.md');
    expect(doc).toContain('command_center_v1_certified_personal_release');
    expect(doc).toContain('command_center_v1_blocked_with_explicit_gate_failures');
    expect(doc).toContain(COMMAND_CENTER_V1_RELEASE_CANDIDATE_BASE_SHA);
    expect(doc).toContain(COMMAND_CENTER_V1_ROLLBACK.preMobileGate3Sha);
    expect(doc).toContain('No P0 or P1 debt is accepted');
    expect(doc).toContain('The exact Gate 5 merge commit becomes the pinned v1 personal-release commit');
  });

  test('release prohibitions explicitly preserve the frozen scope and human authority', () => {
    expect(COMMAND_CENTER_V1_RELEASE_PROHIBITIONS.length).toBeGreaterThanOrEqual(5);
    expect(COMMAND_CENTER_V1_RELEASE_PROHIBITIONS.join(' ')).toContain('No autonomous');
    expect(COMMAND_CENTER_V1_RELEASE_PROHIBITIONS.join(' ')).toContain('No App Store');
    expect(COMMAND_CENTER_V1_RELEASE_PROHIBITIONS.join(' ')).toContain('No Devy');
    expect(COMMAND_CENTER_V1_RELEASE_PROHIBITIONS.join(' ')).toContain('No stale/private API response');
  });
});
