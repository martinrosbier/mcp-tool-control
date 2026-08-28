import { describe, expect, it, vi } from "vitest";
import {
  generateRequestId,
  logAuditEvent,
  summarizeInputForLog,
  summarizeOutputForLog,
} from "../../src/utils/audit";

describe("audit events", () => {
  it("generates opaque request identifiers", () => {
    const first = generateRequestId();
    const second = generateRequestId();

    expect(first).toMatch(/^req_[a-f0-9-]{36}$/);
    expect(second).not.toBe(first);
  });

  it("summarizes inputs without recording values", () => {
    const summary = summarizeInputForLog({
      plan_id: "plan_secret_identifier",
      files: ["secret contents"],
    });

    expect(JSON.parse(summary)).toEqual({
      type: "object",
      fieldCount: 2,
      stringFieldCount: 1,
      arrayItemCount: 1,
    });
    expect(summary).not.toContain("plan_secret_identifier");
    expect(summary).not.toContain("secret contents");
  });

  it("summarizes output dimensions without recording response text", () => {
    const summary = summarizeOutputForLog([
      { type: "text", text: "sensitive response" },
    ]);

    expect(JSON.parse(summary)).toEqual({
      contentItemCount: 1,
      textCharacterCount: 18,
    });
    expect(summary).not.toContain("sensitive response");
  });

  it("writes structured audit records to stderr", () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

    logAuditEvent({
      timestamp: "2026-05-11T10:00:00.000Z",
      requestId: "req_example",
      eventType: "tool_execution",
      outcome: "success",
      toolName: "inspect-text",
    });

    expect(stderr).toHaveBeenCalledOnce();
    const record = JSON.parse(stderr.mock.calls[0][0].replace("[AUDIT] ", ""));
    expect(record).toMatchObject({
      level: "audit",
      service: "mcp-tool-control",
      eventType: "tool_execution",
      outcome: "success",
      toolName: "inspect-text",
    });
    stderr.mockRestore();
  });
});
