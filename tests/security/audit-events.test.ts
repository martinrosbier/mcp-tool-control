import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateRequestId,
  createBestEffortAuditSink,
  logAuditEvent,
  summarizeInputForLog,
  summarizeOutputForLog,
} from "../../src/utils/audit";

describe("audit events", () => {
  afterEach(() => vi.restoreAllMocks());

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
    const summary = summarizeOutputForLog([{ type: "text", text: "sensitive response" }]);

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

  const event = {
    timestamp: "2026-09-08T00:00:00.000Z",
    requestId: "req_test",
    eventType: "tool_execution" as const,
    outcome: "success" as const,
  };

  it("reports a thrown sink error without exposing its message or event values", () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    const audit = createBestEffortAuditSink(() => {
      throw new Error("secret sink credentials");
    });

    expect(() => audit!({ ...event, toolName: "private-tool" })).not.toThrow();
    expect(stderr.mock.calls).toEqual([["[AUDIT] Audit delivery failed"]]);
    expect(stdout).not.toHaveBeenCalled();
  });

  it("handles a late rejection without waiting for audit delivery", async () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    let rejectDelivery!: (error: Error) => void;
    const delivery = new Promise<void>((_resolve, reject) => {
      rejectDelivery = reject;
    });
    const audit = createBestEffortAuditSink(() => delivery);

    expect(audit!(event)).toBeUndefined();
    expect(stderr).not.toHaveBeenCalled();
    rejectDelivery(new Error("secret remote response"));
    await Promise.resolve();
    expect(stderr.mock.calls).toEqual([["[AUDIT] Audit delivery failed"]]);
  });

  it.each(["throw", "reject"])(
    "isolates fallback logging failure after a sink %s",
    async (mode) => {
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {
        throw new Error("stderr failed");
      });
      const audit = createBestEffortAuditSink(() => {
        if (mode === "reject") return Promise.reject(new Error("audit failed"));
        throw new Error("audit failed");
      });

      expect(() => audit!(event)).not.toThrow();
      await Promise.resolve();
      expect(stderr).toHaveBeenCalledOnce();
    },
  );
});
