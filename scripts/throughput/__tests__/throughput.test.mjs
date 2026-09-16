import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyChanges } from '../classify-change.mjs';
import { verifyHeldPrework } from '../verify-held-prework.mjs';
import { classifyWorkflowEvidence } from '../classify-workflow-evidence.mjs';

test('documentation-only changes avoid build/test routing', () => {
  const result = classifyChanges(['docs/dev/notes.md', 'README.md']);
  assert.equal(result.tier, 'DOCS_ONLY');
  assert.equal(result.runFull, false);
  assert.equal(result.runFocused, false);
});

test('critical contract paths fail closed to broad validation', () => {
  const result = classifyChanges(['shared/weeklyDecisionContract.ts']);
  assert.equal(result.tier, 'CRITICAL');
  assert.equal(result.runFull, true);
});

test('unknown paths fail closed', () => {
  const result = classifyChanges(['mystery.bin']);
  assert.equal(result.tier, 'CRITICAL');
  assert.equal(result.runFull, true);
});

test('held prework can move with tests without becoming runtime work', () => {
  const result = classifyChanges([
    'server/services/prework_weekSeasonComposition.ts',
    'server/services/__tests__/prework_weekSeasonComposition.test.ts',
  ]);
  assert.equal(result.tier, 'HELD_PREWORK');
  assert.equal(result.heldPrework, true);
  assert.equal(result.runFull, false);
});

test('promotion boundary forces broad validation even for docs', () => {
  const result = classifyChanges(['docs/dev/notes.md'], { promotion: true });
  assert.equal(result.tier, 'CRITICAL');
  assert.equal(result.runFull, true);
});

test('held-prework verifier rejects runtime imports', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tiber-throughput-'));
  fs.mkdirSync(path.join(root, 'server/services'), { recursive: true });
  fs.writeFileSync(path.join(root, 'server/services/prework_alpha.ts'), 'export const alpha = 1;\n');
  fs.writeFileSync(path.join(root, 'server/services/live.ts'), "import { alpha } from './prework_alpha';\n");
  const result = verifyHeldPrework({ changedFiles: ['server/services/prework_alpha.ts'], root });
  assert.equal(result.ok, false);
  assert.match(result.violations.join('\n'), /imports\/re-exports held prework/);
});

test('held-prework verifier accepts isolated inert prework', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tiber-throughput-'));
  fs.mkdirSync(path.join(root, 'server/services'), { recursive: true });
  fs.writeFileSync(path.join(root, 'server/services/prework_alpha.ts'), 'export const alpha = 1;\n');
  fs.writeFileSync(path.join(root, 'server/services/live.ts'), 'export const live = 1;\n');
  const result = verifyHeldPrework({ changedFiles: ['server/services/prework_alpha.ts'], root });
  assert.equal(result.ok, true);
});

test('workflow evidence with no runner steps is infrastructure NOT_RUN', () => {
  const result = classifyWorkflowEvidence({
    run: { conclusion: 'failure' },
    jobs: [{ name: 'verify', runner_id: 0, steps: [] }],
  });
  assert.deepEqual({ state: result.state, class: result.class }, { state: 'NOT_RUN', class: 'INFRASTRUCTURE' });
});

test('workflow verifier failures remain distinct from product failures', () => {
  const result = classifyWorkflowEvidence({
    run: { conclusion: 'failure' },
    jobs: [{ name: 'guard', steps: [{ name: 'Verify held prework', conclusion: 'failure' }] }],
  });
  assert.equal(result.class, 'VERIFIER');
});

test('executed test failures are product/build evidence', () => {
  const result = classifyWorkflowEvidence({
    run: { conclusion: 'failure' },
    jobs: [{ name: 'tests', steps: [{ name: 'Run weekly decision tests', conclusion: 'failure' }] }],
  });
  assert.equal(result.class, 'PRODUCT_OR_BUILD');
});
