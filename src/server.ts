import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { planChangesDefinition, runPlanChanges } from "./tools/plan-changes.js";
import { inspectTextTool } from "./tools/inspect-text.js";
import { ToolRegistry, UnknownToolError } from "./tools/tool.js";
import { SERVER_VERSION } from "./version.js";

const registry = new ToolRegistry([
  inspectTextTool,
  {
    definition: planChangesDefinition,
    run: (input) => runPlanChanges(undefined, input),
  },
]);

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
        : "Tool execution failed";
    console.error(error);
    return { content: [{ type: "text", text: message }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
