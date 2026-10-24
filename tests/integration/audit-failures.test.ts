import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpToolControl } from "../../src/runtime";

describe.each(["throw", "reject"])("MCP workflow with audit sink %s", (mode) => {
  let allowedRoot: string;
  let client: Client;
  let runtime: ReturnType<typeof createMcpToolControl>;
  const internalErrors = vi.fn();

  beforeEach(async () => {
    internalErrors.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    allowedRoot = await mkdtemp(path.join(os.tmpdir(), "mcp-tool-control-audit-"));
    runtime = createMcpToolControl({
      allowedRoot,
      audit: () => {
        if (mode === "reject") return Promise.reject(new Error("secret audit credentials"));
        throw new Error("secret audit credentials");
      },
      onInternalError: internalErrors,
    });
    client = new Client({ name: "audit-failure-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await runtime.server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await runtime.server.close();
    await rm(allowedRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function call(name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    const item = result.content[0];
    if (item.type !== "text") throw new Error("Expected text tool output");
    return { isError: result.isError, data: JSON.parse(item.text) };
  }

  async function planFile() {
    const result = await call("plan-changes", {
      description: "audit failure test",
      files: [{ path: "target.txt", content: "private file contents", purpose: "test" }],
    });
    expect(result.isError).not.toBe(true);
    return result.data.plan_id as string;
  }

  it("reports successful writes accurately and still rejects unapproved and replayed requests", async () => {
    const planId = await planFile();
    const args = { plan_id: planId };
    expect((await call("apply-changes", args)).data.code).toBe("APPROVAL_REQUIRED");
    internalErrors.mockClear();

    expect(runtime.approvalController.approve(planId).status).toBe("approved");
    const applied = await call("apply-changes", args);
    expect(applied.isError).not.toBe(true);
    expect(applied.data.status).toBe("applied");
    await expect(readFile(path.join(allowedRoot, "target.txt"), "utf8")).resolves.toBe(
      "private file contents",
    );
    expect(internalErrors).not.toHaveBeenCalled();
    const replay = await call("apply-changes", args);
    expect(replay.isError).toBe(true);
    expect(replay.data.code).toBe("APPROVAL_REQUIRED");
    expect(
      vi
        .mocked(console.error)
        .mock.calls.every(
          (args) => args.length === 1 && args[0] === "[AUDIT] Audit delivery failed",
        ),
    ).toBe(true);
  });

  it("preserves stale-state errors and concurrent content", async () => {
    const target = path.join(allowedRoot, "target.txt");
    await writeFile(target, "original");
    const planId = await planFile();
    runtime.approvalController.approve(planId);
    await writeFile(target, "concurrent content");

    const result = await call("apply-changes", { plan_id: planId });
    expect(result.isError).toBe(true);
    expect(result.data.code).toBe("PLAN_STALE");
    await expect(readFile(target, "utf8")).resolves.toBe("concurrent content");
    expect(internalErrors).toHaveBeenCalledOnce();
    expect(internalErrors.mock.calls[0][0].name).toBe("StaleChangePlanError");
  });
});
