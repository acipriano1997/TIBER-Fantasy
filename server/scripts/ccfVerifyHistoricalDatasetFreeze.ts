#!/usr/bin/env tsx
/**
 * Validate a real CCF historical dataset freeze and optionally its frozen
 * predictive-validation protocol. This command does not assemble historical
 * rows, open the final holdout, run a backtest, or authorize promotion.
 *
 * Required environment:
 *   CCF_HISTORICAL_DATASET_MANIFEST_PATH
 *
 * Optional environment:
 *   CCF_PREDICTIVE_PROTOCOL_PATH
 */

import fs from "fs/promises";
import {
  buildCCFHistoricalDatasetFreezeReceipt,
  type CCFHistoricalDatasetFreezeReceipt,
} from "../modules/ccf/certification/historicalDatasetFreezeReceipt";
import type { CCFHistoricalDatasetManifest } from "../modules/ccf/certification/historicalDatasetManifest";
import type { CCFPredictiveValidationProtocol } from "../modules/ccf/certification/predictiveValidationProtocol";

export interface RunCCFHistoricalDatasetFreezeVerificationInput {
  manifest: CCFHistoricalDatasetManifest;
  protocol?: CCFPredictiveValidationProtocol | null;
  now?: () => string;
}

export interface CCFHistoricalDatasetFreezeVerificationOutcome {
  exitCode: 0 | 1;
  output:
    | {
        receipt_kind: "ccf_historical_dataset_freeze_verification_v1";
        ok: true;
        receipt: CCFHistoricalDatasetFreezeReceipt;
        productionCertificationAuthorized: false;
      }
    | {
        receipt_kind: "ccf_historical_dataset_freeze_verification_v1";
        ok: false;
        generatedAt: string;
        error: string;
        productionCertificationAuthorized: false;
      };
}

export function runCCFHistoricalDatasetFreezeVerification(
  input: RunCCFHistoricalDatasetFreezeVerificationInput,
): CCFHistoricalDatasetFreezeVerificationOutcome {
  const now = input.now ?? (() => new Date().toISOString());
  try {
    const verifiedAt = now();
    const receipt = buildCCFHistoricalDatasetFreezeReceipt({
      manifest: input.manifest,
      protocol: input.protocol ?? null,
      verifiedAt,
    });
    return {
      exitCode: 0,
      output: {
        receipt_kind: "ccf_historical_dataset_freeze_verification_v1",
        ok: true,
        receipt,
        productionCertificationAuthorized: false,
      },
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: {
        receipt_kind: "ccf_historical_dataset_freeze_verification_v1",
        ok: false,
        generatedAt: now(),
        error: error instanceof Error ? error.message : String(error),
        productionCertificationAuthorized: false,
      },
    };
  }
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await fs.readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

async function main(): Promise<void> {
  const manifestPath = process.env.CCF_HISTORICAL_DATASET_MANIFEST_PATH?.trim();
  if (!manifestPath) {
    process.stderr.write(
      "CCF_HISTORICAL_DATASET_MANIFEST_PATH is required. Refusing to infer or fabricate a production historical dataset.\n",
    );
    process.exit(1);
  }
  const protocolPath = process.env.CCF_PREDICTIVE_PROTOCOL_PATH?.trim();

  try {
    const manifest = await readJson<CCFHistoricalDatasetManifest>(manifestPath);
    const protocol = protocolPath
      ? await readJson<CCFPredictiveValidationProtocol>(protocolPath)
      : null;
    const outcome = runCCFHistoricalDatasetFreezeVerification({
      manifest,
      protocol,
    });
    process.stdout.write(`${JSON.stringify(outcome.output, null, 2)}\n`);
    process.exit(outcome.exitCode);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify(
        {
          receipt_kind: "ccf_historical_dataset_freeze_verification_v1",
          ok: false,
          generatedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
          productionCertificationAuthorized: false,
        },
        null,
        2,
      )}\n`,
    );
    process.exit(1);
  }
}

if (process.env.JEST_WORKER_ID === undefined) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `[ccf-historical-freeze] fatal: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exit(1);
  });
}
