import { describe, expect, it, vi } from "vitest";
import { ToolRegistry, UnknownToolError, type RegisteredTool } from "../../src/tools/tool";

function makeTool(name: string): RegisteredTool {
  return {
    policy: { access: "read", requiresApproval: false },
    definition: { name, description: `${name} description`, inputSchema: { type: "object" } },
    run: vi.fn(async () => [{ type: "text" as const, text: `${name} result` }]),
  };
}

describe("ToolRegistry", () => {
  it("lists registered definitions", () => {
    const registry = new ToolRegistry([makeTool("first"), makeTool("second")]);
    expect(registry.list().map((tool) => tool.name)).toEqual(["first", "second"]);
  });

  it("dispatches execution by tool name", async () => {
    const tool = makeTool("sample");
    const registry = new ToolRegistry([tool]);
    await expect(registry.execute("sample", { value: 1 })).resolves.toEqual([
      { type: "text", text: "sample result" },
    ]);
    expect(tool.run).toHaveBeenCalledWith({ value: 1 });
  });

  it("audits successful execution without input or output values", async () => {
    const audit = vi.fn();
    const registry = new ToolRegistry([makeTool("sample")], audit);

    await registry.execute("sample", { secret: "do-not-log" });

    expect(audit).toHaveBeenCalledOnce();
    expect(audit.mock.calls[0][0]).toMatchObject({
      eventType: "tool_execution",
      outcome: "success",
      toolName: "sample",
      access: "read",
    });
    expect(JSON.stringify(audit.mock.calls[0][0])).not.toContain("do-not-log");
    expect(JSON.stringify(audit.mock.calls[0][0])).not.toContain("sample result");
  });

  it("rejects unknown tools", async () => {
    const registry = new ToolRegistry([]);
    await expect(registry.execute("missing", {})).rejects.toBeInstanceOf(UnknownToolError);
  });

  it("rejects duplicate names at startup", () => {
    expect(() => new ToolRegistry([makeTool("same"), makeTool("same")])).toThrow("Duplicate tool: same");
  });

  it("rejects write tools that do not require approval", () => {
    const tool = makeTool("unsafe-write");
    tool.policy = { access: "write", requiresApproval: false };
    expect(() => new ToolRegistry([tool])).toThrow("Write tools must require approval");
  });

  it("denies approval-gated tools without approval", async () => {
    const tool = makeTool("write-file");
    tool.policy = { access: "write", requiresApproval: true };
    tool.authorize = vi.fn(() => {
      throw new Error("Tool execution requires approval");
    });
    const audit = vi.fn();
    const registry = new ToolRegistry([tool], audit);

    await expect(registry.execute("write-file", {})).rejects.toThrow(
      "Tool execution requires approval",
    );
    expect(tool.run).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "tool_execution",
      outcome: "error",
      errorName: "Error",
    }));
  });

  it("rejects approval-gated tools without a trusted authorizer", () => {
    const tool = makeTool("write-file");
    tool.policy = { access: "write", requiresApproval: true };

    expect(() => new ToolRegistry([tool])).toThrow(
      "Approval-gated tools must use a trusted authorizer",
    );
  });

  it("allows an approved write tool to execute", async () => {
    const tool = makeTool("write-file");
    tool.policy = { access: "write", requiresApproval: true };
    tool.authorize = vi.fn();
    const registry = new ToolRegistry([tool]);

    await expect(registry.execute("write-file", {})).resolves.toEqual([
      { type: "text", text: "write-file result" },
    ]);
    expect(tool.authorize).toHaveBeenCalledWith({});
  });
});
