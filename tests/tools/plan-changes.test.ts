import { describe, it, expect, vi } from "vitest";
import fs from "fs/promises";
import { runPlanChanges, PlanChangesInputSchema } from "../../src/tools/plan-changes";
import { SERVER_VERSION } from "../../src/version";

describe("plan-changes tool", () => {
  it("returns the planner-only response shape", async () => {
    const input = {
      description: "add hello world",
      files: [
        { path: "hello.txt", content: "hi", purpose: "demo greeting" },
      ],
    };

    const result = await runPlanChanges(null, input);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("text");

    const response = JSON.parse(result[0].text);

    // Shape contract — every key the desktop POC depends on must be present
    expect(response).toHaveProperty("plan_id");
    expect(response).toHaveProperty("announcement");
    expect(response).toHaveProperty("files_to_write");
    expect(response).toHaveProperty("conflicts");
    expect(response).toHaveProperty("summary");
    expect(response).toHaveProperty("follow_up_suggestions");
    expect(response).toHaveProperty("server_version");

    expect(typeof response.announcement).toBe("string");
    expect(Array.isArray(response.files_to_write)).toBe(true);
    expect(Array.isArray(response.conflicts)).toBe(true);
    expect(Array.isArray(response.follow_up_suggestions)).toBe(true);
    expect(response.plan_id).toMatch(/^plan_[a-f0-9]{64}$/);
    expect(response.server_version).toBe(SERVER_VERSION);

    expect(response.files_to_write).toHaveLength(1);
    expect(response.files_to_write[0]).toMatchObject({
      path: "hello.txt",
      content: "hi",
      purpose: "demo greeting",
    });
    expect(response.conflicts).toHaveLength(0);
    expect(response.announcement).toContain("hello.txt");
    expect(response.announcement).toContain("chore: add hello world");
  });

  it("uses the caller-supplied suggested_commit when provided", async () => {
    const result = await runPlanChanges(null, {
      description: "add config",
      files: [{ path: "a.txt", content: "x", purpose: "p" }],
      suggested_commit: "feat: custom message",
    });
    const response = JSON.parse(result[0].text);
    expect(response.announcement).toContain("feat: custom message");
  });

  it("returns the same identifier for the same executable writes", async () => {
    const input = {
      description: "first description",
      files: [{ path: "a.txt", content: "x", purpose: "first purpose" }],
    };
    const first = JSON.parse((await runPlanChanges(null, input))[0].text);
    const second = JSON.parse((await runPlanChanges(null, {
      ...input,
      description: "different description",
      files: [{ ...input.files[0], purpose: "different purpose" }],
    }))[0].text);

    expect(first.plan_id).toBe(second.plan_id);
  });

  it("returns a different identifier when an executable write changes", async () => {
    const baseInput = {
      description: "write a file",
      files: [{ path: "a.txt", content: "first", purpose: "demo" }],
    };
    const first = JSON.parse((await runPlanChanges(null, baseInput))[0].text);
    const changed = JSON.parse((await runPlanChanges(null, {
      ...baseInput,
      files: [{ ...baseInput.files[0], content: "second" }],
    }))[0].text);

    expect(first.plan_id).not.toBe(changed.plan_id);
  });

  it("detects conflicts when an existing file has different content", async () => {
    const input = {
      description: "update README",
      files: [
        { path: "README.md", content: "new content", purpose: "refresh" },
      ],
      existing_files: [
        { path: "README.md", content: "old original content" },
      ],
    };

    const result = await runPlanChanges(null, input);
    const response = JSON.parse(result[0].text);

    expect(response.files_to_write).toHaveLength(1);
    expect(response.conflicts).toHaveLength(1);
    expect(response.conflicts[0].path).toBe("README.md");
    expect(response.conflicts[0]).toHaveProperty("existing_excerpt");
    expect(response.conflicts[0]).toHaveProperty("proposed_excerpt");
    expect(response.conflicts[0].existing_excerpt).toContain("old original content");
    expect(response.conflicts[0].proposed_excerpt).toContain("new content");
    expect(response.summary).toContain("1 conflict");
  });

  it("skips no-op writes when existing content is identical", async () => {
    const result = await runPlanChanges(null, {
      description: "noop",
      files: [{ path: "a.txt", content: "same", purpose: "p" }],
      existing_files: [{ path: "a.txt", content: "same" }],
    });
    const response = JSON.parse(result[0].text);
    expect(response.files_to_write).toHaveLength(0);
    expect(response.conflicts).toHaveLength(0);
  });

  it("does not touch the filesystem", async () => {
    const writeSpy = vi.spyOn(fs, "writeFile");
    const mkdirSpy = vi.spyOn(fs, "mkdir");

    await runPlanChanges(null, {
      description: "fs check",
      files: [{ path: "x.txt", content: "y", purpose: "p" }],
    });

    expect(writeSpy).not.toHaveBeenCalled();
    expect(mkdirSpy).not.toHaveBeenCalled();

    writeSpy.mockRestore();
    mkdirSpy.mockRestore();
  });

  it("rejects invalid input via Zod schema", () => {
    // Missing required `files`
    expect(() =>
      PlanChangesInputSchema.parse({ description: "nope" })
    ).toThrow();
    // Empty files array
    expect(() =>
      PlanChangesInputSchema.parse({ description: "nope", files: [] })
    ).toThrow();
  });
});
