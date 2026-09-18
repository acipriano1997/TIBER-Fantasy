import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export interface CCFArtifactFileSnapshot {
  relativePath: string;
  sha256: string;
  bytes: number;
}

export interface CCFArtifactDirectorySnapshot {
  root: string;
  files: CCFArtifactFileSnapshot[];
  fingerprint: string;
}

export interface CCFArtifactPromotionResult {
  destinationDir: string;
  installedFingerprint: string;
  replacedPriorDestination: boolean;
  cleanupWarning: string | null;
}

export class CCFArtifactPromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFArtifactPromotionError";
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return false;
    throw error;
  }
}

async function walkFiles(root: string, current = root): Promise<CCFArtifactFileSnapshot[]> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files: CCFArtifactFileSnapshot[] = [];

  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw new CCFArtifactPromotionError(`symbolic links are not allowed in artifact trees: ${absolute}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, absolute)));
      continue;
    }
    if (!entry.isFile()) {
      throw new CCFArtifactPromotionError(`unsupported artifact entry type: ${absolute}`);
    }
    const content = await fs.readFile(absolute);
    files.push({
      relativePath: path.relative(root, absolute).split(path.sep).join("/"),
      sha256: crypto.createHash("sha256").update(content).digest("hex"),
      bytes: content.byteLength,
    });
  }

  return files;
}

export async function snapshotCCFArtifactDirectory(
  root: string,
): Promise<CCFArtifactDirectorySnapshot> {
  if (!(await exists(root))) {
    throw new CCFArtifactPromotionError(`artifact directory does not exist: ${root}`);
  }
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new CCFArtifactPromotionError(`artifact root must be a real directory: ${root}`);
  }

  const files = (await walkFiles(root)).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  if (files.length === 0) {
    throw new CCFArtifactPromotionError(`artifact directory must not be empty: ${root}`);
  }

  const canonical = JSON.stringify(files);
  return {
    root,
    files,
    fingerprint: crypto.createHash("sha256").update(canonical).digest("hex"),
  };
}

export function sameCCFArtifactSnapshot(
  left: CCFArtifactDirectorySnapshot,
  right: CCFArtifactDirectorySnapshot,
): boolean {
  return left.fingerprint === right.fingerprint && JSON.stringify(left.files) === JSON.stringify(right.files);
}

async function snapshotIfPresent(root: string): Promise<CCFArtifactDirectorySnapshot | null> {
  return (await exists(root)) ? snapshotCCFArtifactDirectory(root) : null;
}

async function assertSnapshotUnchanged(
  label: string,
  authorized: CCFArtifactDirectorySnapshot | null,
  root: string,
): Promise<void> {
  const current = await snapshotIfPresent(root);
  if (authorized == null && current == null) return;
  if (authorized == null || current == null || !sameCCFArtifactSnapshot(authorized, current)) {
    throw new CCFArtifactPromotionError(`${label} changed after authorization; refusing promotion`);
  }
}

function siblingPath(target: string, suffix: string): string {
  return path.join(path.dirname(target), `${path.basename(target)}.${suffix}.${crypto.randomUUID()}`);
}

/**
 * Atomically promotes an already-generated staging directory into a destination.
 *
 * Safety contract:
 * - staging is snapshotted before validation and must remain byte-identical after it;
 * - the current destination is snapshotted before validation and re-proven before mutation;
 * - validation failures/drift leave both staging and destination untouched;
 * - install failure restores the prior destination;
 * - post-install identity is re-proven before prior bytes are discarded;
 * - a post-install mismatch restores the prior destination and preserves the rejected candidate.
 */
export async function promoteCCFArtifactDirectory(input: {
  stagingDir: string;
  destinationDir: string;
  validate: (stagingDir: string) => Promise<void>;
}): Promise<CCFArtifactPromotionResult> {
  const stagingDir = path.resolve(input.stagingDir);
  const destinationDir = path.resolve(input.destinationDir);
  if (stagingDir === destinationDir) {
    throw new CCFArtifactPromotionError("stagingDir and destinationDir must be different");
  }
  if (!(await exists(stagingDir))) {
    throw new CCFArtifactPromotionError(`staging directory does not exist: ${stagingDir}`);
  }

  const candidateAuthorized = await snapshotCCFArtifactDirectory(stagingDir);
  const destinationAuthorized = await snapshotIfPresent(destinationDir);

  await input.validate(stagingDir);

  await assertSnapshotUnchanged("staging candidate", candidateAuthorized, stagingDir);
  await assertSnapshotUnchanged("destination", destinationAuthorized, destinationDir);

  const previousDir = siblingPath(destinationDir, "previous");
  const rejectedDir = siblingPath(destinationDir, "rejected");
  let destinationMoved = false;
  let candidateInstalled = false;

  try {
    if (destinationAuthorized) {
      await fs.rename(destinationDir, previousDir);
      destinationMoved = true;
    }

    await fs.rename(stagingDir, destinationDir);
    candidateInstalled = true;

    const installed = await snapshotCCFArtifactDirectory(destinationDir);
    if (!sameCCFArtifactSnapshot(candidateAuthorized, installed)) {
      try {
        await fs.rename(destinationDir, rejectedDir);
        candidateInstalled = false;
        if (destinationMoved) {
          await fs.rename(previousDir, destinationDir);
          destinationMoved = false;
        }
      } catch (rollbackError) {
        throw new CCFArtifactPromotionError(
          `installed bytes differed from validated candidate and rollback failed; prior=${previousDir}, rejected=${rejectedDir}: ${String(rollbackError)}`,
        );
      }
      throw new CCFArtifactPromotionError(
        `installed bytes differed from validated candidate; prior destination restored and rejected candidate preserved at ${rejectedDir}`,
      );
    }

    let cleanupWarning: string | null = null;
    if (destinationMoved) {
      try {
        await fs.rm(previousDir, { recursive: true, force: false });
        destinationMoved = false;
      } catch (error) {
        cleanupWarning = `promotion succeeded but prior-destination cleanup failed at ${previousDir}: ${String(error)}`;
      }
    }

    return {
      destinationDir,
      installedFingerprint: installed.fingerprint,
      replacedPriorDestination: destinationAuthorized != null,
      cleanupWarning,
    };
  } catch (error) {
    if (error instanceof CCFArtifactPromotionError && !candidateInstalled && !destinationMoved) {
      throw error;
    }

    if (candidateInstalled) {
      // A failure after install but before successful identity proof should preserve
      // the candidate rather than delete it, then restore the previous destination.
      try {
        if (await exists(destinationDir)) {
          await fs.rename(destinationDir, rejectedDir);
        }
        candidateInstalled = false;
      } catch (preserveError) {
        throw new CCFArtifactPromotionError(
          `promotion failed and installed candidate could not be preserved at ${rejectedDir}: ${String(preserveError)}; original error: ${String(error)}`,
        );
      }
    }

    if (destinationMoved) {
      try {
        await fs.rename(previousDir, destinationDir);
        destinationMoved = false;
      } catch (rollbackError) {
        throw new CCFArtifactPromotionError(
          `promotion failed and prior destination rollback failed; prior remains at ${previousDir}: ${String(rollbackError)}; original error: ${String(error)}`,
        );
      }
    }

    throw error;
  }
}
