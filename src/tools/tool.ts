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
  authorize?(input: unknown): void;
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
  private readonly audit?: AuditSink;

  constructor(tools: RegisteredTool[], audit?: AuditSink) {
    this.toolsByName = new Map();
    this.audit = createBestEffortAuditSink(audit);

    for (const tool of tools) {
      if (this.toolsByName.has(tool.definition.name)) {
        throw new Error(`Duplicate tool: ${tool.definition.name}`);
      }
      validateToolPolicy(tool.policy, tool.authorize !== undefined);
      this.toolsByName.set(tool.definition.name, tool);
    }
  }

  list(): ToolDefinition[] {
    return [...this.toolsByName.values()].map((tool) => tool.definition);
  }

  async execute(name: string, input: unknown): Promise<TextContent[]> {
    const requestId = generateRequestId();
    const startedAt = Date.now();
    const tool = this.toolsByName.get(name);

    try {
      if (!tool) throw new UnknownToolError(name);
      if (tool.policy.requiresApproval) tool.authorize!(input);
      const output = await tool.run(input);
      this.audit?.({
        timestamp: new Date().toISOString(),
        requestId,
        eventType: "tool_execution",
        outcome: "success",
        toolName: name,
        access: tool.policy.access,
        inputSummary: summarizeInputForLog(input),
        outputSummary: summarizeOutputForLog(output),
        durationMs: Date.now() - startedAt,
      });
      return output;
    } catch (error) {
      this.audit?.({
        timestamp: new Date().toISOString(),
        requestId,
        eventType: "tool_execution",
        outcome: error instanceof PolicyDeniedError ? "denied" : "error",
        toolName: name,
        access: tool?.policy.access,
        inputSummary: summarizeInputForLog(input),
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
  }
}
import { PolicyDeniedError, validateToolPolicy, type ToolPolicy } from "../policy/tool-policy.js";
import {
  createBestEffortAuditSink,
  generateRequestId,
  summarizeInputForLog,
  summarizeOutputForLog,
  type AuditSink,
} from "../utils/audit.js";
