import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpToolControl } from "../../src/runtime";

describe("pending plan capacity through MCP", () => {
  let allowedRoot: string;
  let client: Client;
  let runtime: ReturnType<typeof createMcpToolControl>;
  let now: number;

  beforeEach(async () => {
    allowedRoot = await mkdtemp(path.join(os.tmpdir(), "mcp-tool-control-capacity-"));
    now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    runtime = createMcpToolControl({ allowedRoot, maxPendingPlans: 1, maxPendingPlanBytes: 1_024 });
    client = new Client({ name: "capacity-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await runtime.server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await client.close();
    await runtime.server.close();
    await rm(allowedRoot, { recursive: true, force: true });
  });

  async function plan(content: string) {
    const result = await client.callTool({
      name: "plan-changes",
      arguments: {
        description: "capacity test",
        files: [{ path: "target.txt", content, purpose: "test" }],
        maxPendingPlans: 1_000,
        maxPendingPlanBytes: 1_000_000,
      },
    });
    const item = result.content[0];
    if (item.type !== "text") throw new Error("Expected text tool output");
    return { isError: result.isError, raw: item.text, data: JSON.parse(item.text) };
  }

  it("rejects excess plans without revoking approval and recovers after expiry", async () => {
    const first = await plan("approved content");
    expect(first.isError).not.toBe(true);
    const id = first.data.plan_id;
    runtime.approvalController.approve(id);

    const duplicate = await plan("approved content");
    expect(duplicate.isError).not.toBe(true);
    expect(duplicate.data.plan_id).toBe(id);
    const rejected = await plan("private rejected content");
    expect(rejected.isError).toBe(true);
    expect(rejected.data.code).toBe("PLAN_STORE_FULL");
    expect(rejected.raw).not.toContain("private rejected content");
    expect(rejected.raw).not.toContain(allowedRoot);
    expect(rejected.raw).not.toContain("maxPendingPlans");

    const applied = await client.callTool({ name: "apply-changes", arguments: { plan_id: id } });
    expect(applied.isError).not.toBe(true);
    await expect(readFile(path.join(allowedRoot, "target.txt"), "utf8")).resolves.toBe(
      "approved content",
    );
    expect((await plan("next content")).data.code).toBe("PLAN_STORE_FULL");

    now += 10 * 60 * 1_000;
    expect((await plan("next content")).isError).not.toBe(true);
    expect(() => runtime.approvalController.approve(id)).toThrow();
  });

  it("rejects oversized plans without reserving storage or exposing contents", async () => {
    const content = "private payload".repeat(100);
    const rejected = await plan(content);
    expect(rejected.isError).toBe(true);
    expect(rejected.data.code).toBe("PLAN_STORE_FULL");
    expect(rejected.raw).not.toContain("private payload");
    expect((await plan("small")).isError).not.toBe(true);
  });

  it("enforces capacity across concurrent planning requests", async () => {
    const results = await Promise.all([plan("one"), plan("two"), plan("three")]);
    expect(results.filter((result) => result.isError !== true)).toHaveLength(1);
    expect(results.filter((result) => result.data.code === "PLAN_STORE_FULL")).toHaveLength(2);
  });
});
