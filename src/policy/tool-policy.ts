export type ToolAccess = "read" | "plan" | "write";

export interface ToolPolicy {
  access: ToolAccess;
  requiresApproval: boolean;
}

export interface ToolApproval {
  toolName: string;
  planId: string;
}

export interface ToolExecutionContext {
  approval?: ToolApproval;
}

export class PolicyDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyDeniedError";
  }
}

export function validateToolPolicy(
  policy: ToolPolicy,
  hasApprovalBinding: boolean,
): void {
  if (policy.access === "write" && !policy.requiresApproval) {
    throw new Error("Write tools must require approval");
  }
  if (policy.requiresApproval && !hasApprovalBinding) {
    throw new Error("Approval-gated tools must bind execution to a plan identifier");
  }
}

export function enforceToolPolicy(
  policy: ToolPolicy,
  context: ToolExecutionContext,
  toolName: string,
  planId?: string,
): void {
  if (!policy.requiresApproval) return;

  if (!planId) {
    throw new PolicyDeniedError("Tool execution requires a plan identifier");
  }

  const approval = context.approval;
  if (
    !approval
    || approval.toolName !== toolName
    || approval.planId !== planId
  ) {
    throw new PolicyDeniedError("Tool execution requires approval for this plan");
  }
}
