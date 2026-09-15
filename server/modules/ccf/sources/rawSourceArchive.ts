import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import {
  createCCFSourceSnapshotManifest,
  verifyCCFSourceSnapshotContent,
  type CCFSourceSnapshotManifest,
  type CreateCCFSourceSnapshotManifestInput,
} from "./sourceSnapshot";

export interface ArchiveCCFSourceSnapshotInput
  extends Omit<CreateCCFSourceSnapshotManifestInput, "temporalMode" | "archiveRef"> {
  rootDir: string;
}

export interface CCFArchivedSourceSnapshot {
  archiveDir: string;
  contentPath: string;
  manifestPath: string;
  manifest: CCFSourceSnapshotManifest;
}

export class CCFRawSourceArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRawSourceArchiveError";
  }
}

function toBuffer(content: string | Buffer | Uint8Array): Buffer {
  return typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
}

function safeSegment(label: string, value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!normalized || normalized === "." || normalized === "..") {
    throw new CCFRawSourceArchiveError(`${label} cannot be converted to a safe archive segment`);
  }
  return normalized;
}

function archiveIdentity(input: ArchiveCCFSourceSnapshotInput, content: Buffer): string {
  const metadata = JSON.stringify({
    provider: input.provider,
    dataset: input.dataset,
    sourceUrl: input.sourceUrl,
    license: input.license,
    parserVersion: input.parserVersion,
    retrievedAt: input.retrievedAt,
    knownAt: input.knownAt ?? null,
    knownAtBasis: input.knownAtBasis ?? "ccf_capture",
    sourceVersionKnownAt: input.sourceVersionKnownAt ?? null,
    knownAtProofRef: input.knownAtProofRef ?? null,
    sourceLastModified: input.sourceLastModified ?? null,
    etag: input.etag ?? null,
    contentSha256: crypto.createHash("sha256").update(content).digest("hex"),
    contentBytes: content.byteLength,
  });
  return crypto.createHash("sha256").update(metadata).digest("hex");
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function assertRealDirectory(target: string, label: string): Promise<void> {
  const stat = await fs.lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new CCFRawSourceArchiveError(`${label} must be a real directory: ${target}`);
  }
}

async function verifyExistingArchive(
  archiveDir: string,
  expectedManifest: CCFSourceSnapshotManifest,
  expectedContent: Buffer,
): Promise<CCFArchivedSourceSnapshot> {
  await assertRealDirectory(archiveDir, "existing archive");
  const contentPath = path.join(archiveDir, "content.raw");
  const manifestPath = path.join(archiveDir, "manifest.json");

  let storedContent: Buffer;
  let storedManifest: CCFSourceSnapshotManifest;
  try {
    storedContent = await fs.readFile(contentPath);
    storedManifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as CCFSourceSnapshotManifest;
  } catch (error) {
    throw new CCFRawSourceArchiveError(
      `existing archive is incomplete or unreadable at ${archiveDir}: ${String(error)}`,
    );
  }

  if (!verifyCCFSourceSnapshotContent(storedManifest, storedContent)) {
    throw new CCFRawSourceArchiveError(`existing archive content failed manifest verification: ${archiveDir}`);
  }
  if (!storedContent.equals(expectedContent)) {
    throw new CCFRawSourceArchiveError(`existing archive bytes differ from expected content: ${archiveDir}`);
  }
  if (JSON.stringify(storedManifest) !== JSON.stringify(expectedManifest)) {
    throw new CCFRawSourceArchiveError(`existing archive manifest differs from expected snapshot: ${archiveDir}`);
  }

  return { archiveDir, contentPath, manifestPath, manifest: storedManifest };
}

/**
 * Persist exact source bytes and their manifest as one immutable, content- and
 * metadata-addressed local archive directory.
 *
 * This function never decides whether a provider/source binding is eligible for
 * production use. Callers must perform source permission/reliability review
 * separately. It only guarantees that bytes CCF actually captured cannot be
 * silently overwritten or confused with a different retrieval event.
 */
export async function archiveCCFSourceSnapshot(
  input: ArchiveCCFSourceSnapshotInput,
): Promise<CCFArchivedSourceSnapshot> {
  const rootDir = path.resolve(input.rootDir);
  await fs.mkdir(rootDir, { recursive: true });
  await assertRealDirectory(rootDir, "archive root");

  const content = toBuffer(input.content);
  if (content.byteLength === 0) {
    throw new CCFRawSourceArchiveError("source snapshot content must not be empty");
  }

  const providerSegment = safeSegment("provider", input.provider);
  const datasetSegment = safeSegment("dataset", input.dataset);
  const identity = archiveIdentity(input, content);
  const archiveDir = path.join(rootDir, providerSegment, datasetSegment, identity);
  const archiveRef = `ccf://raw/${providerSegment}/${datasetSegment}/sha256/${identity}`;

  const manifest = createCCFSourceSnapshotManifest({
    ...input,
    content,
    temporalMode: "archived_point_in_time",
    archiveRef,
  });

  if (await exists(archiveDir)) {
    return verifyExistingArchive(archiveDir, manifest, content);
  }

  const parentDir = path.dirname(archiveDir);
  await fs.mkdir(parentDir, { recursive: true });
  const stagingDir = path.join(parentDir, `.staging-${identity}-${crypto.randomUUID()}`);
  const contentPath = path.join(stagingDir, "content.raw");
  const manifestPath = path.join(stagingDir, "manifest.json");

  try {
    await fs.mkdir(stagingDir, { recursive: false });
    await fs.writeFile(contentPath, content, { flag: "wx" });
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });

    const stagedContent = await fs.readFile(contentPath);
    if (!verifyCCFSourceSnapshotContent(manifest, stagedContent)) {
      throw new CCFRawSourceArchiveError("staged source bytes failed manifest verification");
    }

    try {
      await fs.rename(stagingDir, archiveDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST" || (await exists(archiveDir))) {
        await fs.rm(stagingDir, { recursive: true, force: true });
        return verifyExistingArchive(archiveDir, manifest, content);
      }
      throw error;
    }
  } catch (error) {
    if (await exists(stagingDir)) {
      await fs.rm(stagingDir, { recursive: true, force: true });
    }
    throw error;
  }

  return {
    archiveDir,
    contentPath: path.join(archiveDir, "content.raw"),
    manifestPath: path.join(archiveDir, "manifest.json"),
    manifest,
  };
}
