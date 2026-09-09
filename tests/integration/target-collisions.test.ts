import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpToolControl } from "../../src/runtime";

describe("target collisions through MCP", () => {
  let allowedRoot: string;
  let client: Client;
  let runtime: ReturnType<typeof createMcpToolControl>;

  beforeEach(async () => {
    allowedRoot = await mkdtemp(path.join(os.tmpdir(), "mcp-tool-control-collisions-"));
    runtime = createMcpToolControl({ allowedRoot, maxPendingPlans: 1 });
    client = new Client({ name: "collision-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await runtime.server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await runtime.server.close();
    await rm(allowedRoot, { recursive: true, force: true });
  });

  async function planFiles(paths: string[]) {
    const result = await client.callTool({
      name: "plan-changes",
      arguments: {
        description: "collision test",
        files: paths.map((target) => ({ path: target, content: "planned content", purpose: "test" })),
      },
    });
    const item = result.content[0];
    if (item.type !== "text") throw new Error("Expected text tool output");
    return { isError: result.isError, raw: item.text, data: JSON.parse(item.text) };
  }

  it.each([
    ["Private.txt", "private.txt"],
    ["Private", "private/child.txt"],
    ["private/child.txt", "Private"],
  ])("rejects %s and %s without storing a plan or exposing paths", async (first, second) => {
    const rejected = await planFiles([first, second]);
    expect(rejected.isError).toBe(true);
    expect(rejected.data.code).toBe("INVALID_PLAN_TARGET");
    expect(rejected.data.plan_id).toBeUndefined();
    expect(rejected.raw).not.toContain(first);
    expect(rejected.raw).not.toContain(second);
    expect(rejected.raw).not.toContain(allowedRoot);
    await expect(readdir(allowedRoot)).resolves.toEqual([]);

    // Rejection must leave the single available plan slot free.
    const valid = await planFiles(["Docs/Readme.md"]);
    expect(valid.isError).not.toBe(true);
    expect(valid.data.files_to_write[0].path).toBe(path.join("Docs", "Readme.md"));
    runtime.approvalController.approve(valid.data.plan_id);
    const applied = await client.callTool({
      name: "apply-changes", arguments: { plan_id: valid.data.plan_id },
    });
    expect(applied.isError).not.toBe(true);
    await expect(readdir(allowedRoot)).resolves.toEqual(["Docs"]);
    await expect(readdir(path.join(allowedRoot, "Docs"))).resolves.toEqual(["Readme.md"]);
    await expect(readFile(path.join(allowedRoot, "Docs", "Readme.md"), "utf8"))
      .resolves.toBe("planned content");
  });
});
