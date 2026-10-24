import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  createTrustedApprovalBoundary,
  type TrustedApprovalController,
} from "./approval/trusted-approval-boundary.js";
import { toSafeToolError } from "./errors/safe-tool-error.js";
import { PendingChangePlanStore } from "./plans/pending-change-plan-store.js";
import { createApplyChangesTool } from "./tools/apply-changes.js";
import { inspectTextTool } from "./tools/inspect-text.js";
import { createPlanChangesTool } from "./tools/plan-changes.js";
import { ToolRegistry, type RegisteredToolInfo, type TextContent } from "./tools/tool.js";
import type { AuditSink } from "./utils/audit.js";
import { SERVER_VERSION } from "./version.js";

export type { RegisteredToolInfo, TextContent } from "./tools/tool.js";
export type { ToolPolicy } from "./policy/tool-policy.js";

export interface McpToolControlOptions {
  allowedRoot: string;
  maxPendingPlans?: number;
  maxPendingPlanBytes?: number;
  audit?: AuditSink;
  onInternalError?: (error: unknown) => void;
}

/**
 * Host-side tool catalog and execution for control-plane style embeddings.
 * Execution goes through the same validation, authorization, and audit path
 * as MCP calls; approval still comes only from the approval controller.
 */
export interface ToolControlHostTools {
  list(): readonly RegisteredToolInfo[];
  execute(name: string, input: unknown): Promise<TextContent[]>;
}

export interface McpToolControlRuntime {
  readonly server: Server;
  readonly approvalController: TrustedApprovalController;
  readonly hostTools: ToolControlHostTools;
}

export function createMcpToolControl(options: McpToolControlOptions): McpToolControlRuntime {
  const planStore = new PendingChangePlanStore({
    maxPlans: options.maxPendingPlans,
    maxBytes: options.maxPendingPlanBytes,
  });
  const approvalBoundary = createTrustedApprovalBoundary(planStore, {
    audit: options.audit,
  });
  const registry = new ToolRegistry(
    [
      inspectTextTool,
      createPlanChangesTool(planStore, options.allowedRoot),
      createApplyChangesTool(planStore, approvalBoundary.execution, options.allowedRoot),
    ],
    options.audit,
  );

  const server = new Server(
    { name: "mcp-tool-control", version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.list(),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return {
        content: await registry.execute(request.params.name, request.params.arguments),
      };
    } catch (error) {
      options.onInternalError?.(error);
      const safeError = toSafeToolError(error);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(safeError) }],
        isError: true,
      };
    }
  });

  const hostTools: ToolControlHostTools = Object.freeze({
    list: () => registry.describe(),
    execute: (name: string, input: unknown) => registry.execute(name, input),
  });

  return Object.freeze({
    server,
    approvalController: approvalBoundary.host,
    hostTools,
  });
}
