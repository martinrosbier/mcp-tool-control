import type { FileToWrite } from "./conflicts.js";
import type { Conflict } from "./conflicts.js";

export interface AnnouncementArgs {
  files: FileToWrite[];
  conflicts: Conflict[];
  suggestedCommit: string;
}

/**
 * Build a human-readable markdown announcement describing what files
 * will be written and why. Follows transparency rule from server-context.md.
 */
export function buildAnnouncement(args: AnnouncementArgs): string {
  const { files, conflicts, suggestedCommit } = args;

  let announcement = `About to write ${files.length} file(s) into your repo:\n\n`;

  for (const file of files) {
    announcement += `- \`${file.path}\` — ${file.purpose}\n`;
  }

  if (conflicts.length > 0) {
    announcement += `\n⚠️  ${conflicts.length} file(s) already exist with different content — showing diff in \`conflicts\`:\n`;
    for (const conflict of conflicts) {
      announcement += `- \`${conflict.path}\`\n`;
    }
  }

  announcement += `\nSuggested commit: \`${suggestedCommit}\``;

  return announcement;
}
