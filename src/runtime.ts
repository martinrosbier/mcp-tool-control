import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  createTrustedApprovalBoundary,
  type TrustedApprovalController,
} from "./approval/trusted-approval-boundary.js";
import { PolicyDeniedError } from "./policy/tool-policy.js";
import { PendingChangePlanStore } from "./plans/pending-change-plan-store.js";
import { createApplyChangesTool } from "./tools/apply-changes.js";
import { inspectTextTool } from "./tools/inspect-text.js";
import { createPlanChangesTool } from "./tools/plan-changes.js";
import { ToolRegistry, UnknownToolError } from "./tools/tool.js";
import type { AuditSink } from "./utils/audit.js";
import { SERVER_VERSION } from "./version.js";

export interface McpToolControlOptions {
  allowedRoot: string;
  audit?: AuditSink;
}

export interface McpToolControlRuntime {
  readonly server: Server;
  readonly approvalController: TrustedApprovalController;
}

export function createMcpToolControl(
  options: McpToolControlOptions,
): McpToolControlRuntime {
  const planStore = new PendingChangePlanStore();
  const approvalBoundary = createTrustedApprovalBoundary(planStore, {
    audit: options.audit,
  });
  const registry = new ToolRegistry([
    inspectTextTool,
    createPlanChangesTool(planStore, options.allowedRoot),
    createApplyChangesTool(
      planStore,
      approvalBoundary.execution,
      options.allowedRoot,
    ),
  ], options.audit);

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
        content: await registry.execute(
          request.params.name,
          request.params.arguments,
        ),
      };
    } catch (error) {
      const message = error instanceof z.ZodError
        ? "Invalid tool arguments"
        : error instanceof UnknownToolError
          ? "Unknown tool"
          : error instanceof PolicyDeniedError
            ? "Tool execution denied by policy"
            : "Tool execution failed";
      console.error(error);
      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  });

  return Object.freeze({
    server,
    approvalController: approvalBoundary.host,
  });
}
