import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PendingChangePlanStore } from "../../src/plans/pending-change-plan-store";
import { applyFileChangesSafely } from "../../src/security/apply-file-changes";
import { captureFileStates } from "../../src/security/file-state";

describe("applyFileChangesSafely", () => {
  let allowedRoot: string;

  beforeEach(async () => {
    allowedRoot = await mkdtemp(path.join(os.tmpdir(), "mcp-tool-control-write-"));
  });

  afterEach(async () => {
    await rm(allowedRoot, { recursive: true, force: true });
  });

  async function createPlan(targetPath: string, content: string) {
    const captured = await captureFileStates(allowedRoot, [
      { path: targetPath, content, purpose: "test" },
    ]);
    return new PendingChangePlanStore().store(captured.files, captured.expectedFiles);
  }

  it("safely replaces an existing file", async () => {
    const target = path.join(allowedRoot, "example.txt");
    await writeFile(target, "before");
    const plan = await createPlan("example.txt", "after");
    let consumed = false;

    await expect(
      applyFileChangesSafely(allowedRoot, plan, () => {
        consumed = true;
      }),
    ).resolves.toEqual(["example.txt"]);

    expect(consumed).toBe(true);
    await expect(readFile(target, "utf8")).resolves.toBe("after");
  });

  it("claims approval before starting filesystem side effects", async () => {
    const plan = await createPlan("example.txt", "after");
    let consumed = false;

    await expect(
      applyFileChangesSafely(allowedRoot, plan, () => {
        consumed = true;
        rmSync(allowedRoot, { recursive: true, force: true });
      }),
    ).rejects.toThrow();

    expect(consumed).toBe(true);
  });
});
