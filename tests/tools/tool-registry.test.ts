import { describe, expect, it, vi } from "vitest";
import { ToolRegistry, UnknownToolError, type RegisteredTool } from "../../src/tools/tool";

function makeTool(name: string): RegisteredTool {
  return {
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
});
