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

    expect(Object.keys(runtime).sort()).toEqual(["approvalController", "server"]);
    expect(runtime.server).toBeDefined();
    expect(runtime.approvalController).toMatchObject({
      approve: expect.any(Function),
      deny: expect.any(Function),
    });
    expect("approvalController" in runtime.server).toBe(false);
    expect(Object.isFrozen(runtime)).toBe(true);
  });
});
