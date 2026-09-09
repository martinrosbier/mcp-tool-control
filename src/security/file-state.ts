import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { FileToWrite } from "../lib/conflicts.js";
import type {
  ExpectedFileState,
  PendingChangePlan,
} from "../plans/pending-change-plan-store.js";
import { resolveContainedPath } from "./contained-path.js";

export class InvalidPlanTargetError extends Error {
  constructor(targetPath: string) {
    super(`Plan target is not a regular file: ${targetPath}`);
    this.name = "InvalidPlanTargetError";
  }
}

export class DuplicatePlanTargetError extends Error {
  constructor(targetPath: string) {
    super(`Plan contains a duplicate target: ${targetPath}`);
    this.name = "DuplicatePlanTargetError";
  }
}

export class NestedPlanTargetError extends Error {
  constructor(targetPath: string) {
    super(`Plan target overlaps another target: ${targetPath}`);
    this.name = "NestedPlanTargetError";
  }
}

export class StaleChangePlanError extends Error {
  constructor(targetPath: string) {
    super(`File state changed after planning: ${targetPath}`);
    this.name = "StaleChangePlanError";
  }
}

function hashContent(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function readExpectedState(
  absolutePath: string,
  relativePath: string,
): Promise<ExpectedFileState> {
  try {
    const stats = await stat(absolutePath);
    if (!stats.isFile()) {
      throw new InvalidPlanTargetError(relativePath);
    }
    const content = await readFile(absolutePath);
    return Object.freeze({
      path: relativePath,
      kind: "file" as const,
      contentHash: hashContent(content),
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Object.freeze({ path: relativePath, kind: "missing" as const });
    }
    throw error;
  }
}

export async function captureFileStates(
  allowedRoot: string,
  files: FileToWrite[],
): Promise<{ files: FileToWrite[]; expectedFiles: ExpectedFileState[] }> {
  const rootPath = await realpath(allowedRoot);
  const seen = new Set<string>();
  const normalizedFiles: FileToWrite[] = [];
  const expectedFiles: ExpectedFileState[] = [];

  for (const file of files) {
    const absolutePath = await resolveContainedPath(rootPath, file.path);
    const relativePath = path.relative(rootPath, absolutePath);
    const comparisonPath = process.platform === "win32"
      ? relativePath.toLowerCase()
      : relativePath;
    if (seen.has(comparisonPath)) throw new DuplicatePlanTargetError(relativePath);
    seen.add(comparisonPath);

    normalizedFiles.push({ ...file, path: relativePath });
    expectedFiles.push(await readExpectedState(absolutePath, relativePath));
  }

  for (const candidate of normalizedFiles) {
    for (const other of normalizedFiles) {
      if (candidate === other) continue;
      const relative = path.relative(candidate.path, other.path);
      if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        throw new NestedPlanTargetError(other.path);
      }
    }
  }

  return { files: normalizedFiles, expectedFiles };
}

export async function assertPlanFileStatesUnchanged(
  allowedRoot: string,
  plan: PendingChangePlan,
): Promise<void> {
  for (const expected of plan.expectedFiles) {
    await assertFileStateUnchanged(allowedRoot, expected);
  }
}

export async function assertFileStateUnchanged(
  allowedRoot: string,
  expected: ExpectedFileState,
): Promise<string> {
  const absolutePath = await resolveContainedPath(allowedRoot, expected.path);
  const current = await readExpectedState(absolutePath, expected.path);
  if (
    current.kind !== expected.kind
    || (current.kind === "file"
      && expected.kind === "file"
      && current.contentHash !== expected.contentHash)
  ) {
    throw new StaleChangePlanError(expected.path);
  }
  return absolutePath;
}
