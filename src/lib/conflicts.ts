export interface FileToWrite {
  path: string;
  content: string;
  purpose: string;
}

export interface ExistingFile {
  path: string;
  content: string;
}

export interface Conflict {
  path: string;
  existing_excerpt: string;
  proposed_excerpt: string;
}

/**
 * Detect conflicts between proposed files and existing files.
 * Returns files to keep and any conflicts found.
 */
export function detectConflicts(
  proposed: FileToWrite[],
  existing: ExistingFile[]
): { kept: FileToWrite[]; conflicts: Conflict[] } {
  const kept: FileToWrite[] = [];
  const conflicts: Conflict[] = [];

  // Build lookup map for existing files
  const existingMap = new Map<string, string>();
  for (const file of existing) {
    existingMap.set(file.path, file.content);
  }

  for (const proposedFile of proposed) {
    const existingContent = existingMap.get(proposedFile.path);

    if (!existingContent) {
      // No existing file - keep as-is
      kept.push(proposedFile);
    } else if (existingContent === proposedFile.content) {
      // Identical content - skip (no-op)
      continue;
    } else {
      // Different content - keep AND flag conflict
      kept.push(proposedFile);
      conflicts.push({
        path: proposedFile.path,
        existing_excerpt: excerptContent(existingContent),
        proposed_excerpt: excerptContent(proposedFile.content),
      });
    }
  }

  return { kept, conflicts };
}

/**
 * Extract first 200 chars for conflict preview
 */
function excerptContent(content: string): string {
  const firstLine = content.split("\n")[0] || "";
  return firstLine.length > 200
    ? firstLine.substring(0, 200) + "..."
    : firstLine;
}
