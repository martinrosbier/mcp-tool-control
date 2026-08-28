import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpToolControl } from "../../src/runtime";

interface PlanResponse {
  plan_id: string;
  expires_at: string;
}

describe("plan, approve, and apply workflow", () => {
  let allowedRoot: string;
  let client: Client;
  let server: ReturnType<typeof createMcpToolControl>["server"];
  let approvalController: ReturnType<
    typeof createMcpToolControl
  >["approvalController"];

  beforeEach(async () => {
    allowedRoot = await mkdtemp(path.join(os.tmpdir(), "mcp-tool-control-e2e-"));
    ({ server, approvalController } = createMcpToolControl({ allowedRoot }));
    client = new Client({ name: "workflow-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await client.close();
    await server.close();
    await rm(allowedRoot, { recursive: true, force: true });
  });

  async function planFile(
    targetPath: string,
    content: string,
  ): Promise<PlanResponse> {
    const result = await client.callTool({
      name: "plan-changes",
      arguments: {
        description: `write ${targetPath}`,
        files: [{ path: targetPath, content, purpose: "integration test" }],
      },
    });
    expect(result.isError).not.toBe(true);
    const item = result.content[0];
    if (item.type !== "text") throw new Error("Expected text tool output");
    return JSON.parse(item.text) as PlanResponse;
  }

  it("requires trusted approval, applies the plan, and consumes approval", async () => {
    const plan = await planFile("notes/example.txt", "hello");

    const beforeApproval = await client.callTool({
      name: "apply-changes",
      arguments: { plan_id: plan.plan_id },
    });
    expect(beforeApproval.isError).toBe(true);

    approvalController.approve(plan.plan_id);
    const applied = await client.callTool({
      name: "apply-changes",
      arguments: { plan_id: plan.plan_id },
    });

    expect(applied.isError).not.toBe(true);
    await expect(readFile(
      path.join(allowedRoot, "notes", "example.txt"),
      "utf8",
    )).resolves.toBe("hello");

    const replay = await client.callTool({
      name: "apply-changes",
      arguments: { plan_id: plan.plan_id },
    });
    expect(replay.isError).toBe(true);
  });

  it("does not apply a plan denied by the trusted host", async () => {
    const plan = await planFile("denied.txt", "not written");
    approvalController.deny(plan.plan_id);

    const result = await client.callTool({
      name: "apply-changes",
      arguments: { plan_id: plan.plan_id },
    });

    expect(result.isError).toBe(true);
    await expect(readFile(path.join(allowedRoot, "denied.txt"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not approve or apply an expired pending plan", async () => {
    await client.close();
    await server.close();
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    ({ server, approvalController } = createMcpToolControl({ allowedRoot }));
    client = new Client({ name: "expiry-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const plan = await planFile("expired.txt", "not written");
    now.mockReturnValue(10 * 60 * 1_000 + 1_000);

    expect(() => approvalController.approve(plan.plan_id)).toThrow(
      "Pending plan is unavailable",
    );
    const result = await client.callTool({
      name: "apply-changes",
      arguments: { plan_id: plan.plan_id },
    });

    expect(result.isError).toBe(true);
    await expect(readFile(path.join(allowedRoot, "expired.txt"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });
});
