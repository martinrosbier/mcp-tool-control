import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpToolControl } from "../../src/runtime";

describe("safe MCP errors", () => {
  let allowedRoot: string;
  let client: Client;
  let server: ReturnType<typeof createMcpToolControl>["server"];
  const internalErrors = vi.fn();

  beforeEach(async () => {
    internalErrors.mockClear();
    allowedRoot = await mkdtemp(path.join(os.tmpdir(), "mcp-tool-control-errors-"));
    ({ server } = createMcpToolControl({
      allowedRoot,
      onInternalError: internalErrors,
    }));
    client = new Client({ name: "safe-error-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    await rm(allowedRoot, { recursive: true, force: true });
  });

  async function callError(name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).toBe(true);
    const item = result.content[0];
    if (item.type !== "text") throw new Error("Expected text tool output");
    return { raw: item.text, parsed: JSON.parse(item.text) };
  }

  it("returns a structured code for unknown tools", async () => {
    const error = await callError("private-secret-tool", {});

    expect(error.parsed).toEqual({
      code: "UNKNOWN_TOOL",
      message: "Unknown tool",
    });
    expect(error.raw).not.toContain("private-secret-tool");
    expect(internalErrors).toHaveBeenCalledOnce();
  });

  it("returns a structured code for invalid arguments", async () => {
    const error = await callError("inspect-text", { text: 123 });

    expect(error.parsed).toEqual({
      code: "INVALID_ARGUMENTS",
      message: "Invalid tool arguments",
    });
  });

  it("does not reveal a rejected filesystem path", async () => {
    const privatePath = "../private-secret.txt";
    const error = await callError("plan-changes", {
      description: "escape",
      files: [{ path: privatePath, content: "secret", purpose: "attack" }],
    });

    expect(error.parsed).toEqual({
      code: "PATH_NOT_ALLOWED",
      message: "A requested path is not allowed",
    });
    expect(error.raw).not.toContain(privatePath);
    expect(error.raw).not.toContain("secret");
  });
});
