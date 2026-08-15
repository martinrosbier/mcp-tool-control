export type ToolAccess = "read" | "plan" | "write";

export interface ToolPolicy {
  access: ToolAccess;
  requiresApproval: boolean;
}

export interface ToolExecutionContext {
  approvalGranted?: boolean;
}

export class PolicyDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyDeniedError";
  }
}

export function validateToolPolicy(policy: ToolPolicy): void {
  if (policy.access === "write" && !policy.requiresApproval) {
    throw new Error("Write tools must require approval");
  }
}

export function enforceToolPolicy(
  policy: ToolPolicy,
  context: ToolExecutionContext,
): void {
  if (policy.requiresApproval && !context.approvalGranted) {
    throw new PolicyDeniedError("Tool execution requires approval");
  }
}
