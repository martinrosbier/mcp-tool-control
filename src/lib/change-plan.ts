import { createHash } from "node:crypto";
import type { FileToWrite } from "./conflicts.js";
import type { ExpectedFileState } from "../plans/pending-change-plan-store.js";

interface PlannedWrite {
  path: string;
  content: string;
}

export function createChangePlanId(
  files: FileToWrite[],
  expectedFiles: ExpectedFileState[] = [],
): string {
  const writes: PlannedWrite[] = files.map(({ path, content }) => ({ path, content }));
  const digest = createHash("sha256")
    .update(JSON.stringify({ writes, expectedFiles }), "utf8")
    .digest("hex");

  return `plan_${digest}`;
}
