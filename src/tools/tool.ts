export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
  };
}

export interface RegisteredTool {
  definition: ToolDefinition;
  policy: ToolPolicy;
  approvalPlanId?(input: unknown): string | undefined;
  run(input: unknown): Promise<TextContent[]>;
}

export class UnknownToolError extends Error {
  constructor(toolName: string) {
    super(`Unknown tool: ${toolName}`);
    this.name = "UnknownToolError";
  }
}

export class ToolRegistry {
  private readonly toolsByName: Map<string, RegisteredTool>;

  constructor(tools: RegisteredTool[]) {
    this.toolsByName = new Map();

    for (const tool of tools) {
      if (this.toolsByName.has(tool.definition.name)) {
        throw new Error(`Duplicate tool: ${tool.definition.name}`);
      }
      validateToolPolicy(tool.policy, tool.approvalPlanId !== undefined);
      this.toolsByName.set(tool.definition.name, tool);
    }
  }

  list(): ToolDefinition[] {
    return [...this.toolsByName.values()].map((tool) => tool.definition);
  }

  async execute(
    name: string,
    input: unknown,
    context: ToolExecutionContext = {},
  ): Promise<TextContent[]> {
    const tool = this.toolsByName.get(name);
    if (!tool) throw new UnknownToolError(name);
    const planId = tool.approvalPlanId?.(input);
    enforceToolPolicy(tool.policy, context, name, planId);
    return tool.run(input);
  }
}
import {
  enforceToolPolicy,
  validateToolPolicy,
  type ToolExecutionContext,
  type ToolPolicy,
} from "../policy/tool-policy.js";
