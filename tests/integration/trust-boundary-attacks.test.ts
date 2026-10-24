import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpToolControl } from "../../src/runtime";

interface PlanResponse {
  plan_id: string;
}

describe("trust boundary attacks", () => {
  let sandbox: string;
  let allowedRoot: string;
  let outsideRoot: string;
  let client: Client;
  let server: ReturnType<typeof createMcpToolControl>["server"];
  let approvalController: ReturnType<typeof createMcpToolControl>["approvalController"];

  async function connectRuntime() {
    ({ server, approvalController } = createMcpToolControl({ allowedRoot }));
    client = new Client({ name: "attack-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  }

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(os.tmpdir(), "mcp-tool-control-attacks-"));
    allowedRoot = path.join(sandbox, "allowed");
    outsideRoot = path.join(sandbox, "outside");
    await Promise.all([mkdir(allowedRoot), mkdir(outsideRoot)]);
    await connectRuntime();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await client.close();
    await server.close();
    await rm(sandbox, { recursive: true, force: true });
  });

  async function planFile(targetPath: string, content: string): Promise<PlanResponse> {
    const result = await client.callTool({
      name: "plan-changes",
      arguments: {
        description: `write ${targetPath}`,
        files: [{ path: targetPath, content, purpose: "attack test" }],
      },
    });
    expect(result.isError).not.toBe(true);
    const item = result.content[0];
    if (item.type !== "text") throw new Error("Expected text tool output");
    return JSON.parse(item.text) as PlanResponse;
  }

  it("cannot approve through MCP or injected apply arguments", async () => {
    const plan = await planFile("example.txt", "safe");

    const fakeApprovalTool = await client.callTool({
      name: "approve-changes",
      arguments: { plan_id: plan.plan_id },
    });
    const injectedApproval = await client.callTool({
      name: "apply-changes",
      arguments: {
        plan_id: plan.plan_id,
        approvalGranted: true,
        approval: { status: "approved" },
      },
    });

    expect(fakeApprovalTool.isError).toBe(true);
    expect(injectedApproval.isError).toBe(true);
    await expect(readFile(path.join(allowedRoot, "example.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not transfer approval to a plan with modified content", async () => {
    const approvedPlan = await planFile("example.txt", "approved content");
    approvalController.approve(approvedPlan.plan_id);
    const modifiedPlan = await planFile("example.txt", "modified content");

    expect(modifiedPlan.plan_id).not.toBe(approvedPlan.plan_id);
    const result = await client.callTool({
      name: "apply-changes",
      arguments: { plan_id: modifiedPlan.plan_id },
    });

    expect(result.isError).toBe(true);
  });

  it("rejects stale filesystem content without overwriting it", async () => {
    const target = path.join(allowedRoot, "example.txt");
    await writeFile(target, "original");
    const plan = await planFile("example.txt", "planned replacement");
    approvalController.approve(plan.plan_id);
    await writeFile(target, "changed after approval");

    const result = await client.callTool({
      name: "apply-changes",
      arguments: { plan_id: plan.plan_id },
    });

    expect(result.isError).toBe(true);
    await expect(readFile(target, "utf8")).resolves.toBe("changed after approval");
  });

  it("rejects traversal and symlink escapes during planning", async () => {
    const linkPath = path.join(allowedRoot, "linked");
    await symlink(outsideRoot, linkPath, process.platform === "win32" ? "junction" : "dir");

    const traversal = await client.callTool({
      name: "plan-changes",
      arguments: {
        description: "escape with traversal",
        files: [{ path: "../escape.txt", content: "bad", purpose: "attack" }],
      },
    });
    const linkEscape = await client.callTool({
      name: "plan-changes",
      arguments: {
        description: "escape with link",
        files: [{ path: "linked/escape.txt", content: "bad", purpose: "attack" }],
      },
    });

    expect(traversal.isError).toBe(true);
    expect(linkEscape.isError).toBe(true);
    await expect(readFile(path.join(outsideRoot, "escape.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a parent directory replaced by an escaping link after approval", async () => {
    const parent = path.join(allowedRoot, "nested");
    await mkdir(parent);
    const plan = await planFile("nested/escape.txt", "bad");
    approvalController.approve(plan.plan_id);
    await rm(parent, { recursive: true });
    await symlink(outsideRoot, parent, process.platform === "win32" ? "junction" : "dir");

    const result = await client.callTool({
      name: "apply-changes",
      arguments: { plan_id: plan.plan_id },
    });

    expect(result.isError).toBe(true);
    await expect(readFile(path.join(outsideRoot, "escape.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not transfer approval to a recreated expired plan", async () => {
    await client.close();
    await server.close();
    let currentTime = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => currentTime);
    await connectRuntime();

    const original = await planFile("example.txt", "same content");
    approvalController.approve(original.plan_id);
    currentTime += 10 * 60 * 1_000;
    const recreated = await planFile("example.txt", "same content");

    expect(recreated.plan_id).toBe(original.plan_id);
    const result = await client.callTool({
      name: "apply-changes",
      arguments: { plan_id: recreated.plan_id },
    });
    expect(result.isError).toBe(true);
  });

  it("allows only one of two concurrent apply attempts", async () => {
    const plan = await planFile("example.txt", "written once");
    approvalController.approve(plan.plan_id);

    const results = await Promise.all([
      client.callTool({
        name: "apply-changes",
        arguments: { plan_id: plan.plan_id },
      }),
      client.callTool({
        name: "apply-changes",
        arguments: { plan_id: plan.plan_id },
      }),
    ]);

    expect(results.filter((result) => result.isError !== true)).toHaveLength(1);
    expect(results.filter((result) => result.isError === true)).toHaveLength(1);
    await expect(readFile(path.join(allowedRoot, "example.txt"), "utf8")).resolves.toBe(
      "written once",
    );
  });
});
