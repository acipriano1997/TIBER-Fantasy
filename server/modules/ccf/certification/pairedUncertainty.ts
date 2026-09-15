import crypto from "crypto";

export interface CCFPairedLossObservation {
  blockId: string;
  candidateLoss: number | null | undefined;
  comparatorLoss: number | null | undefined;
}

export interface CCFPairedBlockBootstrapConfig {
  iterations?: number;
  confidenceLevel?: number;
  seed?: string;
  minimumBlocks?: number;
}

export interface CCFPairedBlockBootstrapResult {
  pairedSampleSize: number;
  independentBlockCount: number;
  candidateMeanLoss: number | null;
  comparatorMeanLoss: number | null;
  meanImprovement: number | null;
  confidenceLevel: number;
  confidenceLower: number | null;
  confidenceUpper: number | null;
  probabilityCandidateBetter: number | null;
  iterations: number;
  seed: string;
}

interface UsableRow {
  blockId: string;
  candidateLoss: number;
  comparatorLoss: number;
}

function usableRows(rows: readonly CCFPairedLossObservation[]): UsableRow[] {
  return rows.filter(
    (row): row is UsableRow =>
      row.blockId.trim().length > 0 &&
      row.candidateLoss != null &&
      Number.isFinite(row.candidateLoss) &&
      row.comparatorLoss != null &&
      Number.isFinite(row.comparatorLoss),
  );
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(sorted: readonly number[], probability: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * probability)));
  return sorted[index];
}

function numericSeed(seed: string): number {
  const digest = crypto.createHash("sha256").update(seed).digest();
  return digest.readUInt32LE(0) || 0x9e3779b9;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function evaluateCCFPairedBlockBootstrap(
  rows: readonly CCFPairedLossObservation[],
  config: CCFPairedBlockBootstrapConfig = {},
): CCFPairedBlockBootstrapResult {
  const iterations = config.iterations ?? 2000;
  const confidenceLevel = config.confidenceLevel ?? 0.95;
  const seed = config.seed ?? "ccf-paired-block-bootstrap-v1";
  const minimumBlocks = config.minimumBlocks ?? 2;

  if (!Number.isInteger(iterations) || iterations < 100 || iterations > 100000) {
    throw new Error("iterations must be an integer from 100 through 100000");
  }
  if (!Number.isFinite(confidenceLevel) || confidenceLevel <= 0.5 || confidenceLevel >= 1) {
    throw new Error("confidenceLevel must be greater than 0.5 and less than 1");
  }
  if (!Number.isInteger(minimumBlocks) || minimumBlocks < 2) {
    throw new Error("minimumBlocks must be an integer of at least 2");
  }
  if (!seed.trim()) throw new Error("seed is required");

  const paired = usableRows(rows);
  if (paired.length === 0) {
    return {
      pairedSampleSize: 0,
      independentBlockCount: 0,
      candidateMeanLoss: null,
      comparatorMeanLoss: null,
      meanImprovement: null,
      confidenceLevel,
      confidenceLower: null,
      confidenceUpper: null,
      probabilityCandidateBetter: null,
      iterations,
      seed,
    };
  }

  const blocks = new Map<string, UsableRow[]>();
  for (const row of paired) {
    const block = blocks.get(row.blockId) ?? [];
    block.push(row);
    blocks.set(row.blockId, block);
  }

  const candidateMeanLoss = mean(paired.map((row) => row.candidateLoss));
  const comparatorMeanLoss = mean(paired.map((row) => row.comparatorLoss));
  const meanImprovement = comparatorMeanLoss - candidateMeanLoss;

  if (blocks.size < minimumBlocks) {
    return {
      pairedSampleSize: paired.length,
      independentBlockCount: blocks.size,
      candidateMeanLoss,
      comparatorMeanLoss,
      meanImprovement,
      confidenceLevel,
      confidenceLower: null,
      confidenceUpper: null,
      probabilityCandidateBetter: null,
      iterations,
      seed,
    };
  }

  const blockRows = Array.from(blocks.values());
  const random = mulberry32(numericSeed(seed));
  const improvements: number[] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let candidateLossSum = 0;
    let comparatorLossSum = 0;
    let sampledRows = 0;

    for (let draw = 0; draw < blockRows.length; draw += 1) {
      const selected = blockRows[Math.floor(random() * blockRows.length)];
      for (const row of selected) {
        candidateLossSum += row.candidateLoss;
        comparatorLossSum += row.comparatorLoss;
        sampledRows += 1;
      }
    }

    improvements.push((comparatorLossSum - candidateLossSum) / sampledRows);
  }

  improvements.sort((left, right) => left - right);
  const tail = (1 - confidenceLevel) / 2;
  const positive = improvements.filter((value) => value > 0).length;
  const ties = improvements.filter((value) => value === 0).length;

  return {
    pairedSampleSize: paired.length,
    independentBlockCount: blocks.size,
    candidateMeanLoss,
    comparatorMeanLoss,
    meanImprovement,
    confidenceLevel,
    confidenceLower: quantile(improvements, tail),
    confidenceUpper: quantile(improvements, 1 - tail),
    probabilityCandidateBetter: (positive + ties * 0.5) / improvements.length,
    iterations,
    seed,
  };
}
