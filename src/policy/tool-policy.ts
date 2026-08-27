export type ToolAccess = "read" | "plan" | "write";

export interface ToolPolicy {
  access: ToolAccess;
  requiresApproval: boolean;
}

export class PolicyDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyDeniedError";
  }
}

export function validateToolPolicy(
  policy: ToolPolicy,
  hasTrustedAuthorizer: boolean,
): void {
  if (policy.access === "write" && !policy.requiresApproval) {
    throw new Error("Write tools must require approval");
  }
  if (policy.requiresApproval && !hasTrustedAuthorizer) {
    throw new Error("Approval-gated tools must use a trusted authorizer");
  }
}
