#!/usr/bin/env node
import fs from "node:fs";
import readline from "node:readline";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpToolControl } from "./runtime.js";
import { startApprovalWatcher, type ReviewIo } from "./host/review.js";
import { logAuditEvent } from "./utils/audit.js";

/**
 * Reference trusted host: serves MCP over stdio exactly like server.ts, and
 * additionally prompts a human on the controlling terminal whenever a plan is
 * pending. Approval input never travels over the MCP channel.
 *
 * stdout is reserved for MCP protocol traffic; the review prompt uses the
 * controlling terminal (/dev/tty or the Windows console) instead.
 */
function openTerminalIo(): ReviewIo | undefined {
  try {
    const inputPath = process.platform === "win32" ? "\\\\.\\CONIN$" : "/dev/tty";
    const outputPath = process.platform === "win32" ? "\\\\.\\CONOUT$" : "/dev/tty";
    // openSync fails synchronously when there is no controlling terminal, so
    // the try/catch actually engages. Later async stream errors are logged to
    // stderr and never crash the MCP server.
    const input = fs.createReadStream("", { fd: fs.openSync(inputPath, "r") });
    const output = fs.createWriteStream("", { fd: fs.openSync(outputPath, "a") });
    input.on("error", (error) => console.error("[mcp-tool-control] terminal input:", error));
    output.on("error", (error) => console.error("[mcp-tool-control] terminal output:", error));
    const rl = readline.createInterface({ input, output, terminal: true });
    rl.on("error", (error) => console.error("[mcp-tool-control] terminal prompt:", error));
    return {
      write: (text) => output.write(text),
      ask: (question) => new Promise((resolve) => rl.question(question, resolve)),
    };
  } catch {
    return undefined;
  }
}

const { server, approvalController } = createMcpToolControl({
  allowedRoot: process.cwd(),
  audit: logAuditEvent,
  onInternalError: () => {
    // Internal errors are already surfaced as safe MCP errors; keep raw details
    // off stdout so protocol traffic stays clean.
  },
});

const io = openTerminalIo();
if (io) {
  startApprovalWatcher({ controller: approvalController, io });
  io.write("mcp-tool-control trusted host: watching for pending plans.\n");
} else {
  console.error(
    "[mcp-tool-control] No interactive terminal available; plans cannot be approved. " +
      "Run this host from a terminal to enable human approval.",
  );
}

await server.connect(new StdioServerTransport());
