/**
 * Minimal structured event helpers for tool execution records.
 */

export interface AuditLogEntry {
  timestamp: string;
  requestId: string;
  toolName: string;
  callerId?: string;
  inputSummary: string;
  outputSummary: string;
  provider: string;
  model: string;
  durationMs: number;
  suspiciousInputDetected: boolean;
  outputValidated: boolean;
}

/**
 * Emits one serialized execution record.
 * 
 * @param record - Execution data to serialize
 */
export function logAuditEvent(entry: AuditLogEntry): void {
  const logLine = JSON.stringify({
    ...entry,
    level: "audit",
    service: "mcp-tool-control",
  });

  console.log(`[AUDIT] ${logLine}`);

  // Applications can replace this console sink with durable storage.
}

/**
 * Creates an operation identifier suitable for log correlation.
 * 
 * @returns A locally generated correlation identifier
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Produces a bounded structural description without recording object values.
 * 
 * @param input - Value crossing the tool boundary
 * @returns Bounded text or object dimensions
 */
export function summarizeInputForLog(input: unknown): string {
  if (typeof input === "string") {
    return input.length > 200 ? `${input.substring(0, 200)}...` : input;
  }

  if (typeof input === "object" && input !== null) {
    const values = Object.values(input as Record<string, unknown>);
    const dimensions = {
      fieldCount: values.length,
      stringFieldCount: values.filter((value) => typeof value === "string").length,
      arrayItemCount: values.reduce<number>(
        (total, value) => total + (Array.isArray(value) ? value.length : 0),
        0,
      ),
    };

    return JSON.stringify(dimensions);
  }

  return String(input).substring(0, 200);
}

/**
 * Redacts common credential assignments and caps the recorded output length.
 * 
 * @param output - Text produced by a tool or downstream service
 * @returns Filtered, bounded text
 */
export function summarizeOutputForLog(output: string): string {
  if (!output) return "";

  const filteredOutput = output
    .replace(/sk-[a-zA-Z0-9-]{40,}/g, "[KEY_REDACTED]")
    .replace(/api[_-]?key\s*[:=]\s*["'][^"']+["']/gi, "apikey=[REDACTED]");

  return filteredOutput.length > 500
    ? `${filteredOutput.substring(0, 500)}...`
    : filteredOutput;
}
