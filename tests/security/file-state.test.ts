import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PendingChangePlanStore } from "../../src/plans/pending-change-plan-store";
import {
  DuplicatePlanTargetError,
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

  it.each([
    ["Readme.md", "readme.md"],
    ["Docs/Readme.md", "docs/README.md"],
    ["unused/../Readme.md", "./readme.md"],
    ["same.txt", "same.txt"],
  ])("rejects duplicate targets %s and %s on every platform", async (first, second) => {
    await expect(captureFileStates(allowedRoot, [
      { path: first, content: "one", purpose: "first" },
      { path: second, content: "two", purpose: "second" },
    ])).rejects.toBeInstanceOf(DuplicatePlanTargetError);
  });

  it.each([
    ["Target", "target/nested.txt"],
    ["target/nested.txt", "Target"],
    ["Docs/Target", "docs/target/nested.txt"],
    ["Target", "target/..cache/nested.txt"],
  ])("rejects overlapping targets %s and %s on every platform", async (first, second) => {
    await expect(captureFileStates(allowedRoot, [
      { path: first, content: "one", purpose: "first" },
      { path: second, content: "two", purpose: "second" },
    ])).rejects.toBeInstanceOf(NestedPlanTargetError);
  });

  it("preserves target spelling and accepts siblings and distinct path segments", async () => {
    const paths = ["Docs/One.txt", "docs/Two.txt", "Target", "Targets/Child.txt", "Target.txt"];
    const files = paths.map((target) => ({ path: target, content: "text", purpose: "test" }));
    const captured = await captureFileStates(allowedRoot, files);

    expect(captured.files.map((file) => file.path)).toEqual(paths.map((target) => path.normalize(target)));
    expect(captured.expectedFiles).toEqual(paths.map((target) => ({
      path: path.normalize(target), kind: "missing",
    })));
  });
});
