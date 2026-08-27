import { createHash } from "node:crypto";
import type { FileToWrite } from "./conflicts.js";

interface PlannedWrite {
  path: string;
  content: string;
}

export function createChangePlanId(files: FileToWrite[]): string {
  const writes: PlannedWrite[] = files.map(({ path, content }) => ({ path, content }));
  const digest = createHash("sha256")
    .update(JSON.stringify(writes), "utf8")
    .digest("hex");

  return `plan_${digest}`;
}
