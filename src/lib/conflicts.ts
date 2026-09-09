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
  first_difference: { line: number; column: number };
  preview_truncated: boolean;
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

    if (existingContent === undefined) {
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
        ...previewDifference(existingContent, proposedFile.content),
      });
    }
  }

  return { kept, conflicts };
}

const EXCERPT_LENGTH = 200;
const CONTEXT_LENGTH = 40;

/** Show the first difference with bounded context, not a complete file diff. */
function previewDifference(existing: string, proposed: string): Omit<Conflict, "path"> {
  let offset = 0;
  let line = 1;
  let lineStart = 0;
  while (offset < existing.length && offset < proposed.length && existing[offset] === proposed[offset]) {
    if (existing[offset] === "\n") {
      line++;
      lineStart = offset + 1;
    }
    offset++;
  }

  const start = Math.max(lineStart, offset - CONTEXT_LENGTH);
  function excerpt(content: string): string {
    if (content.length === 0) return "[empty file]";
    if (start === content.length) return "[end of file]";
    // Quoting makes whitespace and line-ending changes visible. Ellipses outside
    // the quotes indicate omitted content rather than literal file text.
    return `${start > 0 ? "..." : ""}${JSON.stringify(content.slice(start, start + EXCERPT_LENGTH))}${
      start + EXCERPT_LENGTH < content.length ? "..." : ""
    }`;
  }

  return {
    existing_excerpt: excerpt(existing),
    proposed_excerpt: excerpt(proposed),
    first_difference: { line, column: offset - lineStart + 1 },
    preview_truncated: start > 0
      || start + EXCERPT_LENGTH < existing.length
      || start + EXCERPT_LENGTH < proposed.length,
  };
}
