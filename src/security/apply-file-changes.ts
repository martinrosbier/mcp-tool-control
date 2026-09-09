import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { PendingChangePlan } from "../plans/pending-change-plan-store.js";
import { resolveContainedPath } from "./contained-path.js";
import {
  assertFileStateUnchanged,
  assertPlanFileStatesUnchanged,
  InvalidPlanTargetError,
  StaleChangePlanError,
} from "./file-state.js";

interface StagedWrite {
  relativePath: string;
  targetPath: string;
  temporaryPath: string;
}

async function stageFile(
  allowedRoot: string,
  relativePath: string,
  content: string,
): Promise<StagedWrite> {
  let targetPath = await resolveContainedPath(allowedRoot, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  targetPath = await resolveContainedPath(allowedRoot, relativePath);

  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.mcp-tool-control-${randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  return { relativePath, targetPath, temporaryPath };
}

export async function applyFileChangesSafely(
  allowedRoot: string,
  plan: PendingChangePlan,
  consumeApproval: () => void,
): Promise<string[]> {
  await assertPlanFileStatesUnchanged(allowedRoot, plan);
  consumeApproval();

  const staged: StagedWrite[] = [];
  try {
    for (const file of plan.files) {
      staged.push(await stageFile(allowedRoot, file.path, file.content));
    }

    await assertPlanFileStatesUnchanged(allowedRoot, plan);

    const appliedPaths: string[] = [];
    const expectedFiles = new Map(plan.expectedFiles.map((state) => [state.path, state]));
    for (const stagedWrite of staged) {
      const expected = expectedFiles.get(stagedWrite.relativePath);
      if (!expected) throw new InvalidPlanTargetError(stagedWrite.relativePath);
      // Keep containment and state checks next to each replacement. Path-based
      // checks mitigate races but cannot eliminate changes during the rename gap.
      const targetPath = await assertFileStateUnchanged(allowedRoot, expected);
      if (targetPath !== stagedWrite.targetPath) {
        throw new StaleChangePlanError(stagedWrite.relativePath);
      }
      await rename(stagedWrite.temporaryPath, targetPath);
      appliedPaths.push(path.relative(allowedRoot, stagedWrite.targetPath));
    }
    return appliedPaths;
  } finally {
    await Promise.all(staged.map(async ({ temporaryPath }) => {
      try {
        await unlink(temporaryPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }));
  }
}
