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
    const input = fs.createReadStream(process.platform === "win32" ? "\\\\.\\CONIN$" : "/dev/tty");
    const output = fs.createWriteStream(
      process.platform === "win32" ? "\\\\.\\CONOUT$" : "/dev/tty",
    );
    const rl = readline.createInterface({ input, output, terminal: true });
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
