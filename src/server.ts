#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpToolControl } from "./runtime.js";
import { logAuditEvent } from "./utils/audit.js";

const { server } = createMcpToolControl({
  allowedRoot: process.cwd(),
  audit: logAuditEvent,
});

await server.connect(new StdioServerTransport());
