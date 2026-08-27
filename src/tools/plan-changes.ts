import { z } from "zod";
import { buildAnnouncement } from "../lib/announcement.js";
import { detectConflicts, type FileToWrite } from "../lib/conflicts.js";
import type { PendingChangePlanStore } from "../plans/pending-change-plan-store.js";
import { captureFileStates } from "../security/file-state.js";
import { SERVER_VERSION } from "../version.js";
import type { RegisteredTool } from "./tool.js";

/**
 * Input schema for the `plan-changes` tool.
 *
 * `plan-changes` is a stateful planner: it accepts a set of proposed file
 * writes plus the relevant subset of existing files from the target repo,
 * detects conflicts, and returns a human-readable announcement alongside
 * the structured plan. It does NOT call an AI provider and it does NOT
 * write to disk. It stores the resulting plan in memory with an expiry.
 * The host application is responsible
 * for surfacing the announcement to the user, obtaining approval, and
 * applying the changes.
 */
export const PlanChangesInputSchema = z.object({
  description: z
    .string()
    .min(1)
    .describe("Short, human-readable description of what this plan accomplishes."),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        content: z.string(),
        purpose: z.string().min(1),
      })
    )
    .min(1)
    .describe("Files to write. Paths are interpreted relative to the target repo root."),
  existing_files: z
    .array(z.object({ path: z.string(), content: z.string() }))
    .optional()
    .default([])
    .describe("Current contents of any files in `files` that already exist in the target repo. Used for conflict detection."),
  suggested_commit: z
    .string()
    .optional()
    .describe("Suggested commit message the host can show alongside the diff."),
});

export type PlanChangesInput = z.infer<typeof PlanChangesInputSchema>;

/** MCP tool definition for `plan-changes`. */
export const planChangesDefinition = {
  name: "plan-changes" as const,
  description:
    "Build a reviewable file-change plan without writing to disk. Returns proposed writes, conflicts, and an announcement so a host can request approval before applying changes.",
  inputSchema: {
    type: "object" as const,
    properties: {
      description: {
        type: "string",
        description: "Short, human-readable description of what this plan accomplishes.",
      },
      files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "Target path relative to repo root" },
            content: { type: "string", description: "Full proposed file contents" },
            purpose: { type: "string", description: "One-line reason this file is being written" },
          },
          required: ["path", "content", "purpose"],
        },
        description: "Files to write. Paths are interpreted relative to the target repo root.",
      },
      existing_files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
        description: "Current contents of any files in `files` that already exist in the target repo.",
      },
      suggested_commit: {
        type: "string",
        description: "Suggested commit message the host can show alongside the diff.",
      },
    },
    required: ["description", "files"],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
};

/**
 * Execute the plan-changes tool. Reads target state and stores a pending plan,
 * but performs no AI calls or filesystem writes.
 */
export async function runPlanChanges(
  planStore: PendingChangePlanStore,
  rawInput: unknown,
  allowedRoot: string = process.cwd(),
): Promise<{ type: "text"; text: string }[]> {
  const input = PlanChangesInputSchema.parse(rawInput);

  const proposed: FileToWrite[] = input.files.map((f) => ({
    path: f.path,
    content: f.content,
    purpose: f.purpose,
  }));

  const { kept, conflicts } = detectConflicts(proposed, input.existing_files);

  const suggestedCommit =
    input.suggested_commit ?? `chore: ${input.description}`;

  const announcement = buildAnnouncement({
    files: kept,
    conflicts,
    suggestedCommit,
  });
  const capturedPlan = await captureFileStates(allowedRoot, kept);
  const pendingPlan = planStore.store(
    capturedPlan.files,
    capturedPlan.expectedFiles,
  );

  const response = {
    plan_id: pendingPlan.id,
    expires_at: pendingPlan.expiresAt,
    announcement,
    files_to_write: pendingPlan.files,
    conflicts,
    summary: `Planned ${kept.length} file write(s) for "${input.description}". ${conflicts.length} conflict(s) flagged.`,
    follow_up_suggestions: [
      "Show the announcement and conflicts to the user before applying.",
      `Apply files only after the user approves plan ${pendingPlan.id}.`,
      "Use the suggested_commit (or override) when creating the checkpoint commit.",
    ],
    server_version: SERVER_VERSION,
  };

  return [{ type: "text", text: JSON.stringify(response, null, 2) }];
}

export function createPlanChangesTool(
  planStore: PendingChangePlanStore,
  allowedRoot: string = process.cwd(),
): RegisteredTool {
  return {
    definition: planChangesDefinition,
    policy: { access: "plan", requiresApproval: false },
    run: (input) => runPlanChanges(planStore, input, allowedRoot),
  };
}
