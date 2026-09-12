import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  promoteCCFArtifactDirectory,
  snapshotCCFArtifactDirectory,
} from "../transactionalArtifactPromotion";

async function writeDir(root: string, files: Record<string, string>): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    const filePath = path.join(root, relative);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }
}

describe("CCF transactional artifact promotion", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-artifact-promotion-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("installs a validated candidate and replaces the prior destination", async () => {
    const staging = path.join(root, "staging");
    const destination = path.join(root, "current");
    await writeDir(staging, { "model.json": "new", "nested/meta.json": "meta" });
    await writeDir(destination, { "model.json": "old" });

    const candidate = await snapshotCCFArtifactDirectory(staging);
    const result = await promoteCCFArtifactDirectory({
      stagingDir: staging,
      destinationDir: destination,
      validate: async () => undefined,
    });

    expect(result.replacedPriorDestination).toBe(true);
    expect(result.installedFingerprint).toBe(candidate.fingerprint);
    expect(await fs.readFile(path.join(destination, "model.json"), "utf8")).toBe("new");
    await expect(fs.lstat(staging)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses candidate drift during validation and leaves destination untouched", async () => {
    const staging = path.join(root, "staging");
    const destination = path.join(root, "current");
    await writeDir(staging, { "model.json": "candidate" });
    await writeDir(destination, { "model.json": "prior" });

    await expect(
      promoteCCFArtifactDirectory({
        stagingDir: staging,
        destinationDir: destination,
        validate: async (dir) => {
          await fs.writeFile(path.join(dir, "model.json"), "mutated-during-validation", "utf8");
        },
      }),
    ).rejects.toThrow(/staging candidate changed after authorization/);

    expect(await fs.readFile(path.join(destination, "model.json"), "utf8")).toBe("prior");
    expect(await fs.readFile(path.join(staging, "model.json"), "utf8")).toBe("mutated-during-validation");
  });

  it("refuses destination drift during validation instead of overwriting unauthorized bytes", async () => {
    const staging = path.join(root, "staging");
    const destination = path.join(root, "current");
    await writeDir(staging, { "model.json": "candidate" });
    await writeDir(destination, { "model.json": "prior" });

    await expect(
      promoteCCFArtifactDirectory({
        stagingDir: staging,
        destinationDir: destination,
        validate: async () => {
          await fs.writeFile(path.join(destination, "model.json"), "concurrent-update", "utf8");
        },
      }),
    ).rejects.toThrow(/destination changed after authorization/);

    expect(await fs.readFile(path.join(destination, "model.json"), "utf8")).toBe("concurrent-update");
    expect(await fs.readFile(path.join(staging, "model.json"), "utf8")).toBe("candidate");
  });

  it("rejects empty candidate directories", async () => {
    const staging = path.join(root, "staging");
    await fs.mkdir(staging);
    await expect(snapshotCCFArtifactDirectory(staging)).rejects.toThrow(/must not be empty/);
  });
});
