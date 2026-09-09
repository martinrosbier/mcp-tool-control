import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTrustedApprovalBoundary } from "../../src/approval/trusted-approval-boundary";
import { PendingChangePlanStore } from "../../src/plans/pending-change-plan-store";
import { PathOutsideRootError } from "../../src/security/contained-path";
import { assertPlanFileStatesUnchanged, captureFileStates, StaleChangePlanError } from "../../src/security/file-state";
import { createApplyChangesTool } from "../../src/tools/apply-changes";
import { PolicyDeniedError } from "../../src/policy/tool-policy";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

vi.mock("../../src/security/file-state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/security/file-state")>();
  return { ...actual, assertPlanFileStatesUnchanged: vi.fn(actual.assertPlanFileStatesUnchanged) };
});

describe("replacement-time filesystem changes", () => {
  let sandbox: string;
  let allowedRoot: string;

  beforeEach(async () => {
    vi.resetAllMocks();
    sandbox = await mkdtemp(path.join(os.tmpdir(), "mcp-tool-control-races-"));
    allowedRoot = path.join(sandbox, "allowed");
    await mkdir(allowedRoot);
  });

  afterEach(async () => {
    vi.resetAllMocks();
    await rm(sandbox, { recursive: true, force: true });
  });

  async function approvedWrite(paths: string[]) {
    const plans = new PendingChangePlanStore();
    const captured = await captureFileStates(allowedRoot, paths.map((target) => ({
      path: target, content: "replacement", purpose: "race test",
    })));
    const plan = plans.store(captured.files, captured.expectedFiles);
    const approvals = createTrustedApprovalBoundary(plans);
    approvals.host.approve(plan.id);
    const tool = createApplyChangesTool(plans, approvals.execution, allowedRoot);
    return {
      run: () => tool.run({ plan_id: plan.id }),
      status: () => approvals.state.get(plan.id)?.status,
    };
  }

  async function afterBatchValidation(change: () => Promise<void>) {
    const actual = await vi.importActual<typeof import("../../src/security/file-state")>(
      "../../src/security/file-state",
    );
    vi.mocked(assertPlanFileStatesUnchanged)
      .mockImplementationOnce(actual.assertPlanFileStatesUnchanged)
      .mockImplementationOnce(async (...args) => {
        await actual.assertPlanFileStatesUnchanged(...args);
        await change();
      });
  }

  async function afterFirstReplacement(change: () => Promise<void>) {
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(rename).mockImplementationOnce(async (...args) => {
      await actual.rename(...args);
      await change();
    });
  }

  it("preserves a target changed after staging and rejects replay even after state is restored", async () => {
    const target = path.join(allowedRoot, "target.txt");
    await writeFile(target, "original");
    const write = await approvedWrite(["target.txt"]);
    await afterBatchValidation(() => writeFile(target, "concurrent edit"));

    await expect(write.run()).rejects.toBeInstanceOf(StaleChangePlanError);
    await expect(readFile(target, "utf8")).resolves.toBe("concurrent edit");
    expect(rename).not.toHaveBeenCalled();
    expect(write.status()).toBe("consumed");
    await expect(readdir(allowedRoot)).resolves.toEqual(["target.txt"]);

    await writeFile(target, "original");
    await expect(write.run()).rejects.toBeInstanceOf(PolicyDeniedError);
    await expect(readFile(target, "utf8")).resolves.toBe("original");
  });

  it("preserves a later target changed during an earlier replacement", async () => {
    const first = path.join(allowedRoot, "first.txt");
    const second = path.join(allowedRoot, "second.txt");
    await writeFile(first, "original first");
    await writeFile(second, "original second");
    const write = await approvedWrite(["first.txt", "second.txt"]);
    await afterFirstReplacement(() => writeFile(second, "concurrent edit"));

    await expect(write.run()).rejects.toBeInstanceOf(StaleChangePlanError);
    await expect(readFile(first, "utf8")).resolves.toBe("replacement");
    await expect(readFile(second, "utf8")).resolves.toBe("concurrent edit");
    expect(rename).toHaveBeenCalledTimes(1);
    expect(write.status()).toBe("consumed");
    await expect(write.run()).rejects.toBeInstanceOf(PolicyDeniedError);
    await expect(readdir(allowedRoot)).resolves.toEqual(["first.txt", "second.txt"]);
  });

  it("rejects a missing target created between replacements", async () => {
    const second = path.join(allowedRoot, "second.txt");
    const write = await approvedWrite(["first.txt", "second.txt"]);
    await afterFirstReplacement(() => writeFile(second, "created concurrently"));

    await expect(write.run()).rejects.toBeInstanceOf(StaleChangePlanError);
    await expect(readFile(second, "utf8")).resolves.toBe("created concurrently");
    expect(rename).toHaveBeenCalledTimes(1);
    expect(write.status()).toBe("consumed");
  });

  it("rejects an escaping parent substituted between replacements", async () => {
    const parent = path.join(allowedRoot, "nested");
    const outside = path.join(sandbox, "outside");
    await mkdir(parent);
    await mkdir(outside);
    await writeFile(path.join(outside, "target.txt"), "outside content");
    const write = await approvedWrite(["first.txt", "nested/target.txt"]);
    await afterFirstReplacement(async () => {
      const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      await actual.rename(parent, path.join(allowedRoot, "detached"));
      await symlink(outside, parent, process.platform === "win32" ? "junction" : "dir");
    });

    await expect(write.run()).rejects.toBeInstanceOf(PathOutsideRootError);
    await expect(readFile(path.join(outside, "target.txt"), "utf8")).resolves.toBe("outside content");
    await expect(readdir(outside)).resolves.toEqual(["target.txt"]);
    expect(rename).toHaveBeenCalledTimes(1);
    expect(write.status()).toBe("consumed");
    await expect(write.run()).rejects.toBeInstanceOf(PolicyDeniedError);
  });
});
