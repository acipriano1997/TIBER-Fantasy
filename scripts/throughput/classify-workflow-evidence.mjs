#!/usr/bin/env node
import fs from 'node:fs';

const VERIFIER_STEP_RE = /(classif|verif|guard|evidence|lint workflow|contract check)/i;

export function classifyWorkflowEvidence(payload) {
  const run = payload.run ?? payload.workflow_run ?? payload;
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  const conclusion = run?.conclusion ?? null;

  if (conclusion === 'success') {
    return { state: 'PASS', class: 'PRODUCT_EVIDENCE', reason: 'Workflow completed successfully.' };
  }

  const jobsWithExecution = jobs.filter((job) => {
    const steps = Array.isArray(job.steps) ? job.steps : [];
    return steps.length > 0 || Number(job.runner_id ?? 0) > 0 || Boolean(job.started_at);
  });

  if (jobs.length > 0 && jobsWithExecution.length === 0) {
    return {
      state: 'NOT_RUN',
      class: 'INFRASTRUCTURE',
      reason: 'Jobs contain no executed steps/runner evidence; do not treat this as a product failure.',
    };
  }

  const failedSteps = jobs.flatMap((job) =>
    (job.steps ?? [])
      .filter((step) => step.conclusion === 'failure')
      .map((step) => ({ job: job.name ?? 'unknown-job', step: step.name ?? 'unknown-step' })),
  );

  if (failedSteps.length > 0 && failedSteps.every(({ step }) => VERIFIER_STEP_RE.test(step))) {
    return {
      state: 'FAIL',
      class: 'VERIFIER',
      reason: `Only verifier/guard steps failed: ${failedSteps.map(({ job, step }) => `${job} / ${step}`).join('; ')}`,
    };
  }

  if (failedSteps.length > 0) {
    return {
      state: 'FAIL',
      class: 'PRODUCT_OR_BUILD',
      reason: `Executed validation/build step failed: ${failedSteps.map(({ job, step }) => `${job} / ${step}`).join('; ')}`,
    };
  }

  if (['failure', 'cancelled', 'timed_out', 'startup_failure'].includes(conclusion)) {
    return {
      state: 'NOT_RUN',
      class: 'INFRASTRUCTURE_OR_UNRESOLVED',
      reason: 'Workflow did not succeed, but no failing executed step is available. Inspect runner/job evidence before assigning product blame.',
    };
  }

  return {
    state: 'NOT_RUN',
    class: 'UNRESOLVED',
    reason: 'Insufficient execution evidence to classify the workflow as product pass/fail.',
  };
}

async function main() {
  const file = process.argv[2];
  const body = file
    ? fs.readFileSync(file, 'utf8')
    : await new Promise((resolve, reject) => {
        let input = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => (input += chunk));
        process.stdin.on('end', () => resolve(input));
        process.stdin.on('error', reject);
      });
  const result = classifyWorkflowEvidence(JSON.parse(body));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
