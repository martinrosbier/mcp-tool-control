import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { planChangesDefinition, runPlanChanges } from "./tools/plan-changes.js";
import { SERVER_VERSION } from "./version.js";

const InspectTextInputSchema = z.object({ text: z.string().max(100_000) });
const inspectTextDefinition = {
  name: "inspect-text",
  description: "Inspect text without changing external state. Returns bounded structural metadata and never returns the submitted text.",
  inputSchema: {
    type: "object" as const,
    properties: { text: { type: "string", maxLength: 100_000, description: "Text to inspect (maximum 100,000 characters)" } },
    required: ["text"],
  },
};

const server = new Server({ name: "mcp-tool-control", version: SERVER_VERSION }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [inspectTextDefinition, planChangesDefinition] }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (request.params.name === "inspect-text") {
      const { text } = InspectTextInputSchema.parse(request.params.arguments);
      return { content: [{ type: "text", text: JSON.stringify({ character_count: text.length, line_count: text.length === 0 ? 0 : text.split(/\r?\n/).length, empty: text.length === 0 }) }] };
    }
    if (request.params.name === "plan-changes") {
      return { content: await runPlanChanges(undefined, request.params.arguments) };
    }
    return { content: [{ type: "text", text: "Unknown tool" }], isError: true };
  } catch (error) {
    const message = error instanceof z.ZodError ? "Invalid tool arguments" : "Tool execution failed";
    console.error(error);
    return { content: [{ type: "text", text: message }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
