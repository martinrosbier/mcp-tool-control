import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export class PathOutsideRootError extends Error {
  constructor() {
    super("Path is outside the allowed root");
    this.name = "PathOutsideRootError";
  }
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function nearestExistingPath(candidate: string): Promise<string> {
  let current = candidate;

  while (true) {
    try {
      await lstat(current);
      return current;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

export async function resolveContainedPath(
  allowedRoot: string,
  requestedPath: string,
): Promise<string> {
  if (!requestedPath || path.isAbsolute(requestedPath)) {
    throw new PathOutsideRootError();
  }

  const rootPath = await realpath(path.resolve(allowedRoot));
  const candidate = path.resolve(rootPath, requestedPath);

  if (!isWithinRoot(rootPath, candidate)) {
    throw new PathOutsideRootError();
  }

  const existingPath = await nearestExistingPath(candidate);
  const resolvedExistingPath = await realpath(existingPath);

  if (!isWithinRoot(rootPath, resolvedExistingPath)) {
    throw new PathOutsideRootError();
  }

  return candidate;
}
