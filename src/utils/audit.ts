import { randomUUID } from "node:crypto";

export type AuditOutcome = "success" | "denied" | "error";
export type AuditEventType = "tool_execution" | "approval_decision";

export interface AuditLogEntry {
  timestamp: string;
  requestId: string;
  eventType: AuditEventType;
  outcome: AuditOutcome;
  toolName?: string;
  access?: string;
  planId?: string;
  decision?: string;
  inputSummary?: string;
  outputSummary?: string;
  durationMs?: number;
  errorName?: string;
}

export type AuditSink = (entry: AuditLogEntry) => void | Promise<void>;

function reportAuditFailure(): void {
  try {
    // Never include sink errors or event payloads in the fallback diagnostic.
    console.error("[AUDIT] Audit delivery failed");
  } catch {
    // A failing fallback must not change the operation result either.
  }
}

/** Best-effort delivery: isolate throws and rejections without awaiting the sink. */
export function createBestEffortAuditSink(
  sink?: AuditSink,
): ((entry: AuditLogEntry) => void) | undefined {
  if (!sink) return undefined;
  return (entry) => {
    try {
      void Promise.resolve(sink(entry)).catch(reportAuditFailure);
    } catch {
      reportAuditFailure();
    }
  };
}

export const logAuditEvent: AuditSink = (entry) => {
  const logLine = JSON.stringify({
    ...entry,
    level: "audit",
    service: "mcp-tool-control",
  });

  // MCP stdio reserves stdout for protocol messages.
  console.error(`[AUDIT] ${logLine}`);
};

export function generateRequestId(): string {
  return `req_${randomUUID()}`;
}

/** Returns dimensions only; input values never enter the audit record. */
export function summarizeInputForLog(input: unknown): string {
  if (typeof input === "string") {
    return JSON.stringify({ type: "string", characterCount: input.length });
  }

  if (typeof input === "object" && input !== null) {
    const values = Object.values(input as Record<string, unknown>);
    return JSON.stringify({
      type: "object",
      fieldCount: values.length,
      stringFieldCount: values.filter((value) => typeof value === "string").length,
      arrayItemCount: values.reduce<number>(
        (total, value) => total + (Array.isArray(value) ? value.length : 0),
        0,
      ),
    });
  }

  return JSON.stringify({ type: input === null ? "null" : typeof input });
}

/** Returns output dimensions only; tool response text never enters the audit record. */
export function summarizeOutputForLog(output: readonly { type: "text"; text: string }[]): string {
  return JSON.stringify({
    contentItemCount: output.length,
    textCharacterCount: output.reduce((total, item) => total + item.text.length, 0),
  });
}
