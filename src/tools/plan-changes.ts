import { z } from "zod";
import { buildAnnouncement } from "../lib/announcement.js";
import { detectConflicts, type FileToWrite } from "../lib/conflicts.js";
import { SERVER_VERSION } from "../version.js";

/**
 * Input schema for the `plan-changes` tool.
 *
 * `plan-changes` is a pure planner: it accepts a set of proposed file
 * writes plus the relevant subset of existing files from the target repo,
 * detects conflicts, and returns a human-readable announcement alongside
 * the structured plan. It does NOT call an AI provider and it does NOT
 * write to disk. The host application is responsible
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
};

/**
 * Execute the plan-changes tool. Pure planner: no AI calls, no disk I/O.
 */
export async function runPlanChanges(
  _gatewayUnused: unknown,
  rawInput: unknown
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

  const response = {
    announcement,
    files_to_write: kept,
    conflicts,
    summary: `Planned ${kept.length} file write(s) for "${input.description}". ${conflicts.length} conflict(s) flagged.`,
    follow_up_suggestions: [
      "Show the announcement and conflicts to the user before applying.",
      "Apply files only after the user approves the plan.",
      "Use the suggested_commit (or override) when creating the checkpoint commit.",
    ],
    server_version: SERVER_VERSION,
  };

  return [{ type: "text", text: JSON.stringify(response, null, 2) }];
}
