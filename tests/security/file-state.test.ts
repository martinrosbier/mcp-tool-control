import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PendingChangePlanStore } from "../../src/plans/pending-change-plan-store";
import {
  NestedPlanTargetError,
  StaleChangePlanError,
  assertPlanFileStatesUnchanged,
  captureFileStates,
} from "../../src/security/file-state";

describe("file state validation", () => {
  let allowedRoot: string;

  beforeEach(async () => {
    allowedRoot = await mkdtemp(path.join(os.tmpdir(), "mcp-tool-control-state-"));
  });

  afterEach(async () => {
    await rm(allowedRoot, { recursive: true, force: true });
  });

  async function createPlan(targetPath: string, content = "new content") {
    const captured = await captureFileStates(allowedRoot, [
      { path: targetPath, content, purpose: "test" },
    ]);
    return new PendingChangePlanStore().store(
      captured.files,
      captured.expectedFiles,
    );
  }

  it("accepts unchanged existing file state", async () => {
    await writeFile(path.join(allowedRoot, "example.txt"), "original");
    const plan = await createPlan("example.txt");

    await expect(assertPlanFileStatesUnchanged(allowedRoot, plan)).resolves.toBeUndefined();
  });

  it("rejects a file modified after planning", async () => {
    await writeFile(path.join(allowedRoot, "example.txt"), "original");
    const plan = await createPlan("example.txt");
    await writeFile(path.join(allowedRoot, "example.txt"), "changed");

    await expect(assertPlanFileStatesUnchanged(allowedRoot, plan))
      .rejects.toBeInstanceOf(StaleChangePlanError);
  });

  it("rejects a file deleted after planning", async () => {
    const target = path.join(allowedRoot, "example.txt");
    await writeFile(target, "original");
    const plan = await createPlan("example.txt");
    await unlink(target);

    await expect(assertPlanFileStatesUnchanged(allowedRoot, plan))
      .rejects.toBeInstanceOf(StaleChangePlanError);
  });

  it("rejects a file created after planning", async () => {
    const plan = await createPlan("nested/example.txt");
    await mkdir(path.join(allowedRoot, "nested"));
    await writeFile(path.join(allowedRoot, "nested", "example.txt"), "surprise");

    await expect(assertPlanFileStatesUnchanged(allowedRoot, plan))
      .rejects.toBeInstanceOf(StaleChangePlanError);
  });

  it("rejects targets nested beneath another planned target", async () => {
    await expect(captureFileStates(allowedRoot, [
      { path: "target", content: "file", purpose: "first" },
      { path: "target/nested.txt", content: "nested", purpose: "second" },
    ])).rejects.toBeInstanceOf(NestedPlanTargetError);
  });
});
