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

async function assertRealFile(target: string, label: string): Promise<void> {
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new CCFRawSourceArchiveError(`${label} must be a real file: ${target}`);
  }
}

function archiveIdentityFromStoredManifest(
  manifest: CCFSourceSnapshotManifest,
  content: Buffer,
  rootDir: string,
): string {
  return archiveIdentity(
    {
      rootDir,
      provider: manifest.provider,
      dataset: manifest.dataset,
      sourceUrl: manifest.sourceUrl,
      license: manifest.license,
      parserVersion: manifest.parserVersion,
      content,
      retrievedAt: manifest.retrievedAt,
      knownAt: manifest.knownAt,
      knownAtBasis: manifest.knownAtBasis,
      sourceVersionKnownAt: manifest.sourceVersionKnownAt,
      knownAtProofRef: manifest.knownAtProofRef,
      sourceLastModified: manifest.sourceLastModified,
      etag: manifest.etag,
    },
    content,
  );
}

/**
 * Re-read a persisted raw-source archive and prove that its on-disk bytes,
 * manifest, content/metadata address, archiveRef, and filesystem location still
 * agree with the archived snapshot object presented by the caller.
 *
 * This is deliberately stronger than verifying an in-memory manifest digest.
 * Downstream certification receipts that claim an immutable archive witness
 * should use this boundary immediately before minting the receipt.
 */
export async function verifyCCFArchivedSourceSnapshot(
  snapshot: CCFArchivedSourceSnapshot,
): Promise<CCFArchivedSourceSnapshot> {
  const archiveDir = path.resolve(snapshot.archiveDir);
  await assertRealDirectory(archiveDir, "archive");

  const expectedContentPath = path.join(archiveDir, "content.raw");
  const expectedManifestPath = path.join(archiveDir, "manifest.json");
  if (path.resolve(snapshot.contentPath) !== expectedContentPath) {
    throw new CCFRawSourceArchiveError("archive contentPath does not match archiveDir");
  }
  if (path.resolve(snapshot.manifestPath) !== expectedManifestPath) {
    throw new CCFRawSourceArchiveError("archive manifestPath does not match archiveDir");
  }

  await assertRealFile(expectedContentPath, "archive content");
  await assertRealFile(expectedManifestPath, "archive manifest");

  let storedContent: Buffer;
  let storedManifest: CCFSourceSnapshotManifest;
  try {
    storedContent = await fs.readFile(expectedContentPath);
    storedManifest = JSON.parse(
      await fs.readFile(expectedManifestPath, "utf8"),
    ) as CCFSourceSnapshotManifest;
  } catch (error) {
    throw new CCFRawSourceArchiveError(
      `archive is incomplete or unreadable at ${archiveDir}: ${String(error)}`,
    );
  }

  if (!verifyCCFSourceSnapshotContent(storedManifest, storedContent)) {
    throw new CCFRawSourceArchiveError(
      `archive content failed stored-manifest verification: ${archiveDir}`,
    );
  }
  if (JSON.stringify(storedManifest) !== JSON.stringify(snapshot.manifest)) {
    throw new CCFRawSourceArchiveError(
      `archive stored manifest differs from supplied snapshot: ${archiveDir}`,
    );
  }

  const archiveRef = storedManifest.archiveRef?.trim();
  const match = archiveRef?.match(
    /^ccf:\/\/raw\/([^/]+)\/([^/]+)\/sha256\/([a-f0-9]{64})$/,
  );
  if (!match) {
    throw new CCFRawSourceArchiveError(
      `archiveRef is not a governed raw archive reference: ${archiveRef ?? "missing"}`,
    );
  }

  const [, providerSegment, datasetSegment, refIdentity] = match;
  const expectedProviderSegment = safeSegment("provider", storedManifest.provider);
  const expectedDatasetSegment = safeSegment("dataset", storedManifest.dataset);
  const recomputedIdentity = archiveIdentityFromStoredManifest(
    storedManifest,
    storedContent,
    path.dirname(path.dirname(path.dirname(archiveDir))),
  );

  if (
    providerSegment !== expectedProviderSegment ||
    datasetSegment !== expectedDatasetSegment ||
    refIdentity !== recomputedIdentity
  ) {
    throw new CCFRawSourceArchiveError(
      "archiveRef does not match persisted archive metadata and content",
    );
  }
  if (
    path.basename(archiveDir) !== refIdentity ||
    path.basename(path.dirname(archiveDir)) !== expectedDatasetSegment ||
    path.basename(path.dirname(path.dirname(archiveDir))) !== expectedProviderSegment
  ) {
    throw new CCFRawSourceArchiveError(
      "archive filesystem location does not match archiveRef",
    );
  }

  return {
    archiveDir,
    contentPath: expectedContentPath,
    manifestPath: expectedManifestPath,
    manifest: storedManifest,
  };
}

async function verifyExistingArchive(
  archiveDir: string,
  expectedManifest: CCFSourceSnapshotManifest,
  expectedContent: Buffer,
): Promise<CCFArchivedSourceSnapshot> {
  await assertRealDirectory(archiveDir, "existing archive");
  const contentPath = path.join(archiveDir, "content.raw");
  const manifestPath = path.join(archiveDir, "manifest.json");

  await assertRealFile(contentPath, "existing archive content");
  await assertRealFile(manifestPath, "existing archive manifest");

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

  return verifyCCFArchivedSourceSnapshot({
    archiveDir,
    contentPath,
    manifestPath,
    manifest: storedManifest,
  });
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

  return verifyCCFArchivedSourceSnapshot({
    archiveDir,
    contentPath: path.join(archiveDir, "content.raw"),
    manifestPath: path.join(archiveDir, "manifest.json"),
    manifest,
  });
}