import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PathOutsideRootError, resolveContainedPath } from "../../src/security/contained-path";

describe("resolveContainedPath", () => {
  let sandbox: string;
  let allowedRoot: string;
  let outsideRoot: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(os.tmpdir(), "mcp-tool-control-"));
    allowedRoot = path.join(sandbox, "allowed");
    outsideRoot = path.join(sandbox, "outside");
    await Promise.all([mkdir(allowedRoot), mkdir(outsideRoot)]);
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("resolves a relative path inside the allowed root", async () => {
    await expect(resolveContainedPath(allowedRoot, "notes/example.txt")).resolves.toBe(
      path.join(allowedRoot, "notes", "example.txt"),
    );
  });

  it("rejects parent traversal", async () => {
    await expect(resolveContainedPath(allowedRoot, "../outside.txt")).rejects.toBeInstanceOf(
      PathOutsideRootError,
    );
  });

  it("rejects absolute paths", async () => {
    await expect(resolveContainedPath(allowedRoot, outsideRoot)).rejects.toBeInstanceOf(
      PathOutsideRootError,
    );
  });

  it("rejects paths through a junction outside the root", async () => {
    const linkPath = path.join(allowedRoot, "linked");
    await symlink(outsideRoot, linkPath, process.platform === "win32" ? "junction" : "dir");

    await expect(resolveContainedPath(allowedRoot, "linked/escape.txt")).rejects.toBeInstanceOf(
      PathOutsideRootError,
    );
  });
});
