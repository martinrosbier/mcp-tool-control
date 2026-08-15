import { z } from "zod";
import type { RegisteredTool } from "./tool.js";

export const InspectTextInputSchema = z.object({
  text: z.string().max(100_000),
});

export const inspectTextTool: RegisteredTool = {
  policy: { access: "read", requiresApproval: false },
  definition: {
    name: "inspect-text",
    description:
      "Inspect text without changing external state. Returns bounded structural metadata and never returns the submitted text.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          maxLength: 100_000,
          description: "Text to inspect (maximum 100,000 characters)",
        },
      },
      required: ["text"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  async run(rawInput) {
    const { text } = InspectTextInputSchema.parse(rawInput);
    return [
      {
        type: "text",
        text: JSON.stringify({
          character_count: text.length,
          line_count: text.length === 0 ? 0 : text.split(/\r?\n/).length,
          empty: text.length === 0,
        }),
      },
    ];
  },
};
