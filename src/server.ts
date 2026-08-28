import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createPlanChangesTool } from "./tools/plan-changes.js";
import { inspectTextTool } from "./tools/inspect-text.js";
import { ToolRegistry, UnknownToolError } from "./tools/tool.js";
import { PolicyDeniedError } from "./policy/tool-policy.js";
import { SERVER_VERSION } from "./version.js";
import { PendingChangePlanStore } from "./plans/pending-change-plan-store.js";
import { createTrustedApprovalBoundary } from "./approval/trusted-approval-boundary.js";
import { createApplyChangesTool } from "./tools/apply-changes.js";
import { logAuditEvent } from "./utils/audit.js";

const planStore = new PendingChangePlanStore();
const approvalBoundary = createTrustedApprovalBoundary(planStore, { audit: logAuditEvent });
const allowedRoot = process.cwd();
const registry = new ToolRegistry([
  inspectTextTool,
  createPlanChangesTool(planStore, allowedRoot),
  createApplyChangesTool(planStore, approvalBoundary.execution, allowedRoot),
], logAuditEvent);

const server = new Server({ name: "mcp-tool-control", version: SERVER_VERSION }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: registry.list() }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return { content: await registry.execute(request.params.name, request.params.arguments) };
  } catch (error) {
    const message = error instanceof z.ZodError
      ? "Invalid tool arguments"
      : error instanceof UnknownToolError
        ? "Unknown tool"
        : error instanceof PolicyDeniedError
          ? "Tool execution denied by policy"
        : "Tool execution failed";
    console.error(error);
    return { content: [{ type: "text", text: message }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
