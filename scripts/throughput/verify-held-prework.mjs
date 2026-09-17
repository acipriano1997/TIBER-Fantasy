#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { isHeldPrework } from './classify-change.mjs';

const SOURCE_RE = /\.[cm]?[jt]sx?$/;
const IMPORT_PREWORK_RE = /(?:from\s*|import\s*\(|require\s*\(|export\s+[^;]*?from\s*)["'][^"']*prework(?:_|\/)[^"']*["']/m;
const ACTIVATION_SURFACE_RE = /^(?:server\/(?:index\.ts|routes\.ts|routes\/|cron\/|platformSync\/|middleware\/)|client\/src\/App\.tsx|package\.json)$/;

function normalize(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').trim();
}

function isIgnoredDir(name) {
  return ['.git', 'node_modules', 'dist', 'docs', 'reports', 'coverage'].includes(name);
}

function isNonRuntimePath(file) {
  return /(^|\/)__tests__\//.test(file) || /(^|\/)fixtures?\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /^scripts\/throughput\//.test(file);
}

function walk(dir, root, output) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (isIgnoredDir(entry.name)) continue;
      walk(path.join(dir, entry.name), root, output);
      continue;
    }
    const absolute = path.join(dir, entry.name);
    const relative = normalize(path.relative(root, absolute));
    if (SOURCE_RE.test(relative)) output.push(relative);
  }
}

export function verifyHeldPrework({ changedFiles, root = process.cwd() }) {
  const files = [...new Set(changedFiles.map(normalize).filter(Boolean))];
  const prework = files.filter(isHeldPrework);
  if (prework.length === 0) return { ok: true, prework: [], violations: [] };

  const violations = [];
  const activationChanges = files.filter((file) => ACTIVATION_SURFACE_RE.test(file));
  if (activationChanges.length > 0) {
    violations.push(`held prework changed with activation surfaces: ${activationChanges.join(', ')}`);
  }

  const sourceFiles = [];
  walk(root, root, sourceFiles);
  for (const relative of sourceFiles) {
    if (isHeldPrework(relative) || isNonRuntimePath(relative)) continue;
    let content;
    try {
      content = fs.readFileSync(path.join(root, relative), 'utf8');
    } catch {
      continue;
    }
    if (IMPORT_PREWORK_RE.test(content)) {
      violations.push(`runtime source imports/re-exports held prework: ${relative}`);
    }
  }

  return { ok: violations.length === 0, prework, violations };
}

async function readChangedFiles(args) {
  if (args.length > 0) return args;
  if (process.stdin.isTTY) return [];
  return await new Promise((resolve, reject) => {
    let body = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (body += chunk));
    process.stdin.on('end', () => resolve(body.split(/\r?\n/)));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const changedFiles = await readChangedFiles(process.argv.slice(2));
  const result = verifyHeldPrework({ changedFiles });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    for (const violation of result.violations) console.error(`::error::${violation}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
