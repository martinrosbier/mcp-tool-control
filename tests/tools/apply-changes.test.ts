import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTrustedApprovalBoundary } from "../../src/approval/trusted-approval-boundary";
import { PolicyDeniedError } from "../../src/policy/tool-policy";
import { PendingChangePlanStore } from "../../src/plans/pending-change-plan-store";
import { ApplyChangesInputSchema, createApplyChangesTool } from "../../src/tools/apply-changes";
import { ToolRegistry } from "../../src/tools/tool";

const files = [{ path: "notes/example.txt", content: "hello", purpose: "add a note" }];

let allowedRoot: string;

function setup() {
  const plans = new PendingChangePlanStore();
  const plan = plans.store(files, [{ path: "notes/example.txt", kind: "missing" }]);
  const boundary = createTrustedApprovalBoundary(plans);
  const registry = new ToolRegistry([
    createApplyChangesTool(plans, boundary.execution, allowedRoot),
  ]);
  return { plan, boundary, registry };
}

describe("apply-changes tool", () => {
  beforeEach(async () => {
    allowedRoot = await mkdtemp(path.join(os.tmpdir(), "mcp-tool-control-apply-"));
  });

  afterEach(async () => {
    await rm(allowedRoot, { recursive: true, force: true });
  });

  it("is registered as an approval-gated write tool", () => {
    const { registry } = setup();
    const definition = registry.list()[0];

    expect(definition.name).toBe("apply-changes");
    expect(definition.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it("rejects malformed plan identifiers", async () => {
    const { registry } = setup();

    await expect(registry.execute("apply-changes", { plan_id: "invalid" })).rejects.toThrow();
    expect(() => ApplyChangesInputSchema.parse({ plan_id: "invalid" })).toThrow();
  });

  it("denies an undecided plan", async () => {
    const { plan, registry } = setup();

    await expect(registry.execute("apply-changes", { plan_id: plan.id })).rejects.toBeInstanceOf(
      PolicyDeniedError,
    );
  });

  it("denies a rejected plan", async () => {
    const { plan, boundary, registry } = setup();
    boundary.host.deny(plan.id);

    await expect(registry.execute("apply-changes", { plan_id: plan.id })).rejects.toBeInstanceOf(
      PolicyDeniedError,
    );
  });

  it("applies an exactly approved pending plan", async () => {
    const { plan, boundary, registry } = setup();
    boundary.host.approve(plan.id);

    const result = await registry.execute("apply-changes", { plan_id: plan.id });
    const response = JSON.parse(result[0].text);

    expect(response).toEqual({
      plan_id: plan.id,
      status: "applied",
      file_count: 1,
      applied_paths: [path.join("notes", "example.txt")],
      message: "Approved plan was applied and its approval was consumed.",
    });
    await expect(readFile(path.join(allowedRoot, "notes", "example.txt"), "utf8")).resolves.toBe(
      "hello",
    );
    expect(boundary.state.get(plan.id)?.status).toBe("consumed");
  });

  it("does not allow an applied plan to be replayed", async () => {
    const { plan, boundary, registry } = setup();
    boundary.host.approve(plan.id);
    await registry.execute("apply-changes", { plan_id: plan.id });

    await expect(registry.execute("apply-changes", { plan_id: plan.id })).rejects.toBeInstanceOf(
      PolicyDeniedError,
    );
  });
});
