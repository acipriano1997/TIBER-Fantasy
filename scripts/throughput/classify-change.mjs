#!/usr/bin/env node
import fs from 'node:fs';

const normalize = (value) => value.replaceAll('\\', '/').replace(/^\.\//, '').trim();

export function isDocumentation(path) {
  return /(^|\/)(docs?|reports)\//.test(path) || /(^|\/)\.claude\//.test(path) || /\.md$/i.test(path);
}

export function isTestOrFixture(path) {
  return /(^|\/)__tests__\//.test(path) || /(^|\/)fixtures?\//.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
}

export function isHeldPrework(path) {
  return /(^|\/)prework(?:_|\/)/.test(path) && /\.[cm]?[jt]sx?$/.test(path);
}

export function isCritical(path) {
  return (
    /^\.github\/workflows\//.test(path) ||
    /^(package|package-lock)\.json$/.test(path) ||
    /^(build\.sh|tsconfig(?:\.[^.]+)?\.json|jest\.config\.[cm]?js)$/.test(path) ||
    /^migrations\//.test(path) ||
    /^shared\//.test(path) ||
    /^server\/(index\.ts|routes\.ts)$/.test(path) ||
    /^server\/(routes|middleware|platformSync|cron|infra|leagueContext)\//.test(path) ||
    /^server\/services\/(identity|projections?|prediction|ecr)/i.test(path) ||
    /^server\/services\/(weeklyDecision|commandCenter|leagueDashboardTruthBoundary)/.test(path) ||
    /^server\/modules\/externalModels\//.test(path) ||
    /(^|\/)(optimizer|calibration|recommendation|scoring)(\/|\.)/i.test(path)
  );
}

export function classifyChanges(rawFiles, { promotion = false } = {}) {
  const files = [...new Set(rawFiles.map(normalize).filter(Boolean))].sort();
  if (files.length === 0) {
    return {
      tier: 'CRITICAL',
      reason: 'No changed-file evidence was available; fail closed.',
      files,
      runFocused: false,
      runFull: true,
      heldPrework: false,
      docsOnly: false,
    };
  }

  if (promotion) {
    return {
      tier: 'CRITICAL',
      reason: 'Promotion boundary: broad validation remains mandatory.',
      files,
      runFocused: false,
      runFull: true,
      heldPrework: files.some(isHeldPrework),
      docsOnly: false,
    };
  }

  const docsOnly = files.every(isDocumentation);
  if (docsOnly) {
    return {
      tier: 'DOCS_ONLY',
      reason: 'Only documentation/operator notes changed.',
      files,
      runFocused: false,
      runFull: false,
      heldPrework: false,
      docsOnly: true,
    };
  }

  const heldPrework = files.some(isHeldPrework);
  const preworkSafeCompanion = (path) => isHeldPrework(path) || isTestOrFixture(path) || isDocumentation(path);
  if (heldPrework && files.every(preworkSafeCompanion)) {
    return {
      tier: 'HELD_PREWORK',
      reason: 'Only inert prework plus tests/fixtures/docs changed; activation guard is required.',
      files,
      runFocused: files.some(isTestOrFixture),
      runFull: false,
      heldPrework: true,
      docsOnly: false,
    };
  }

  if (files.every((path) => isTestOrFixture(path) || isDocumentation(path))) {
    return {
      tier: 'TEST_ONLY',
      reason: 'Only tests/fixtures plus documentation changed.',
      files,
      runFocused: true,
      runFull: false,
      heldPrework: false,
      docsOnly: false,
    };
  }

  const criticalFiles = files.filter(isCritical);
  if (criticalFiles.length > 0) {
    return {
      tier: 'CRITICAL',
      reason: `Critical contract/runtime/verification paths changed: ${criticalFiles.join(', ')}`,
      files,
      runFocused: false,
      runFull: true,
      heldPrework,
      docsOnly: false,
    };
  }

  const knownScoped = (path) =>
    isDocumentation(path) ||
    isTestOrFixture(path) ||
    /^client\//.test(path) ||
    /^server\//.test(path) ||
    /^scripts\//.test(path) ||
    /^config\//.test(path) ||
    /^knowledge\//.test(path) ||
    /^data\//.test(path) ||
    /^\.github\/(?!workflows\/)/.test(path);

  if (files.every(knownScoped)) {
    return {
      tier: 'SCOPED',
      reason: 'Known non-critical implementation surface; run focused validation and preserve dedicated gates.',
      files,
      runFocused: true,
      runFull: false,
      heldPrework,
      docsOnly: false,
    };
  }

  return {
    tier: 'CRITICAL',
    reason: 'At least one changed path is not classified; fail closed to broad validation.',
    files,
    runFocused: false,
    runFull: true,
    heldPrework,
    docsOnly: false,
  };
}

function writeGithubOutputs(outputPath, result) {
  const lines = [
    `tier=${result.tier}`,
    `run_focused=${String(result.runFocused)}`,
    `run_full=${String(result.runFull)}`,
    `held_prework=${String(result.heldPrework)}`,
    `docs_only=${String(result.docsOnly)}`,
    `changed_count=${result.files.length}`,
  ];
  fs.appendFileSync(outputPath, `${lines.join('\n')}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const outputFlag = args.indexOf('--github-output');
  const outputPath = outputFlag >= 0 ? args[outputFlag + 1] : process.env.GITHUB_OUTPUT;
  const promotion = args.includes('--promotion');
  const positional = args.filter((arg, index) => {
    if (arg === '--promotion') return false;
    if (arg === '--github-output') return false;
    if (outputFlag >= 0 && index === outputFlag + 1) return false;
    return true;
  });

  let files = positional;
  if (files.length === 0 && !process.stdin.isTTY) {
    const input = await new Promise((resolve, reject) => {
      let body = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => (body += chunk));
      process.stdin.on('end', () => resolve(body));
      process.stdin.on('error', reject);
    });
    files = input.split(/\r?\n/);
  }

  const result = classifyChanges(files, { promotion });
  if (outputPath) writeGithubOutputs(outputPath, result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
