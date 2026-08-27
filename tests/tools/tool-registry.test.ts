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
    tool.approvalPlanId = (input) => (input as { plan_id?: string }).plan_id;
    const registry = new ToolRegistry([tool]);

    await expect(registry.execute("write-file", { plan_id: "plan_first" })).rejects.toThrow(
      "Tool execution requires approval for this plan",
    );
    expect(tool.run).not.toHaveBeenCalled();
  });

  it("rejects approval-gated tools without a plan binding", () => {
    const tool = makeTool("write-file");
    tool.policy = { access: "write", requiresApproval: true };

    expect(() => new ToolRegistry([tool])).toThrow(
      "Approval-gated tools must bind execution to a plan identifier",
    );
  });

  it("denies approval issued for another tool or plan", async () => {
    const tool = makeTool("write-file");
    tool.policy = { access: "write", requiresApproval: true };
    tool.approvalPlanId = (input) => (input as { plan_id?: string }).plan_id;
    const registry = new ToolRegistry([tool]);

    await expect(registry.execute(
      "write-file",
      { plan_id: "plan_first" },
      { approval: { toolName: "other-tool", planId: "plan_first" } },
    )).rejects.toThrow("Tool execution requires approval for this plan");

    await expect(registry.execute(
      "write-file",
      { plan_id: "plan_first" },
      { approval: { toolName: "write-file", planId: "plan_other" } },
    )).rejects.toThrow("Tool execution requires approval for this plan");
    expect(tool.run).not.toHaveBeenCalled();
  });

  it("allows an approved write tool to execute", async () => {
    const tool = makeTool("write-file");
    tool.policy = { access: "write", requiresApproval: true };
    tool.approvalPlanId = (input) => (input as { plan_id?: string }).plan_id;
    const registry = new ToolRegistry([tool]);

    await expect(
      registry.execute(
        "write-file",
        { plan_id: "plan_first" },
        { approval: { toolName: "write-file", planId: "plan_first" } },
      ),
    ).resolves.toEqual([{ type: "text", text: "write-file result" }]);
  });
});
