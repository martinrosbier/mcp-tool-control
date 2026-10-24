import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpToolControl } from "../src/runtime";

describe("createMcpToolControl", () => {
  let allowedRoot: string;

  beforeEach(async () => {
    allowedRoot = await mkdtemp(path.join(os.tmpdir(), "mcp-tool-control-runtime-"));
  });

  afterEach(async () => {
    await rm(allowedRoot, { recursive: true, force: true });
  });

  it("returns separate MCP and trusted-host capabilities", () => {
    const runtime = createMcpToolControl({ allowedRoot });

    expect(Object.keys(runtime).sort()).toEqual(["approvalController", "hostTools", "server"]);
    expect(runtime.server).toBeDefined();
    expect(runtime.approvalController).toMatchObject({
      approve: expect.any(Function),
      deny: expect.any(Function),
    });
    expect(runtime.hostTools).toMatchObject({
      list: expect.any(Function),
      execute: expect.any(Function),
    });
    expect("approvalController" in runtime.server).toBe(false);
    expect(Object.isFrozen(runtime)).toBe(true);
  });

  it("lists tool metadata with policy, without executables", () => {
    const runtime = createMcpToolControl({ allowedRoot });
    const tools = runtime.hostTools.list();

    expect(tools.map((tool) => [tool.definition.name, tool.policy.access])).toEqual([
      ["inspect-text", "read"],
      ["plan-changes", "plan"],
      ["apply-changes", "write"],
    ]);
    for (const tool of tools) {
      expect("run" in tool).toBe(false);
      expect("authorize" in tool).toBe(false);
      expect(tool.policy.requiresApproval).toBe(tool.policy.access === "write");
    }
  });

  it("executes read tools in-process through the same policy path", async () => {
    const runtime = createMcpToolControl({ allowedRoot });

    const result = await runtime.hostTools.execute("inspect-text", { text: "hello" });
    expect(result[0].type).toBe("text");
    expect(result[0].text.length).toBeGreaterThan(0);
  });

  it("still requires trusted approval for host-side writes", async () => {
    const runtime = createMcpToolControl({ allowedRoot });
    const planId = "plan_".concat("0".repeat(64));

    await expect(runtime.hostTools.execute("apply-changes", { plan_id: planId })).rejects.toThrow(
      "Plan is not approved for execution",
    );
  });
});
