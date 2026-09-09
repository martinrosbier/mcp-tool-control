import { describe, expect, it } from "vitest";
import { detectConflicts } from "../../src/lib/conflicts";

function compare(existing: string, proposed: string) {
  return detectConflicts(
    [{ path: "example.txt", content: proposed, purpose: "test" }],
    [{ path: "example.txt", content: existing }],
  );
}

describe("conflict previews", () => {
  it("shows changes below a shared header with their location", () => {
    const { conflicts } = compare("shared header\nmode=read", "shared header\nmode=write");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      first_difference: { line: 2, column: 6 },
      existing_excerpt: '..."mode=read"',
      proposed_excerpt: '..."mode=write"',
      preview_truncated: true,
    });
  });

  it("focuses on a change beyond the first 200 characters of a long line", () => {
    const prefix = "a".repeat(10_000);
    const suffix = "z".repeat(10_000);
    const { conflicts } = compare(`${prefix}OLD${suffix}`, `${prefix}NEW${suffix}`);
    const preview = conflicts[0];
    expect(preview.first_difference).toEqual({ line: 1, column: 10_001 });
    expect(preview.existing_excerpt).toContain("OLD");
    expect(preview.proposed_excerpt).toContain("NEW");
    expect(preview.preview_truncated).toBe(true);
    expect(preview.existing_excerpt.length).toBeLessThanOrEqual(208);
    expect(preview.proposed_excerpt.length).toBeLessThanOrEqual(208);
  });

  it("bounds escaped control-character output and remains deterministic", () => {
    const existing = `old${"\u0000".repeat(10_000)}`;
    const proposed = `new${"\u0001".repeat(10_000)}`;
    const first = compare(existing, proposed).conflicts[0];
    expect(compare(existing, proposed).conflicts[0]).toEqual(first);
    // Each of 200 source characters can escape to six characters, plus quotes
    // and omission markers. The rest of the large file never enters the preview.
    expect(first.existing_excerpt.length).toBeLessThanOrEqual(1_208);
    expect(first.proposed_excerpt.length).toBeLessThanOrEqual(1_208);
    expect(first.preview_truncated).toBe(true);
    expect(first.existing_excerpt).not.toContain("\u0000");
  });

  it.each([
    ["one\nthree", "one\ntwo\nthree", '..."three"', '..."two\\nthree"'],
    ["one\ntwo\nthree", "one\nthree", '..."two\\nthree"', '..."three"'],
  ])("shows an inserted or deleted line", (existing, proposed, before, after) => {
    const preview = compare(existing, proposed).conflicts[0];
    expect(preview.existing_excerpt).toBe(before);
    expect(preview.proposed_excerpt).toBe(after);
    expect(preview.first_difference).toEqual({ line: 2, column: 2 });
  });

  it("distinguishes an empty existing file from a missing file", () => {
    const preview = compare("", "new").conflicts[0];
    expect(preview).toMatchObject({
      existing_excerpt: "[empty file]",
      proposed_excerpt: '"new"',
      first_difference: { line: 1, column: 1 },
      preview_truncated: false,
    });
    expect(compare("", "")).toEqual({ kept: [], conflicts: [] });
    const missing = detectConflicts([{ path: "new.txt", content: "", purpose: "test" }], []);
    expect(missing.kept).toHaveLength(1);
    expect(missing.conflicts).toEqual([]);
  });

  it("shows replacement with an empty file", () => {
    const result = compare("old", "");
    expect(result.kept[0].content).toBe("");
    expect(result.conflicts[0].proposed_excerpt).toBe("[empty file]");
  });

  it("makes line-ending and trailing-newline changes visible", () => {
    const endings = compare("same\r\n", "same\n").conflicts[0];
    expect(endings.existing_excerpt).toBe('"same\\r\\n"');
    expect(endings.proposed_excerpt).toBe('"same\\n"');
    expect(endings.first_difference).toEqual({ line: 1, column: 5 });
    const trailing = compare("same", "same\n").conflicts[0];
    expect(trailing.existing_excerpt).not.toBe(trailing.proposed_excerpt);
  });

  it("marks end of file when content is appended after a newline", () => {
    const preview = compare("header\n", "header\nnew line").conflicts[0];
    expect(preview.existing_excerpt).toBe("[end of file]");
    expect(preview.proposed_excerpt).toBe('..."new line"');
    expect(preview.first_difference).toEqual({ line: 2, column: 1 });
  });

  it("leaves identical content out of the conflict list", () => {
    expect(compare("same\ncontent", "same\ncontent")).toEqual({ kept: [], conflicts: [] });
  });
});
