import { z } from "zod";
import type { ApprovalExecution } from "../approval/trusted-approval-boundary.js";
import { PolicyDeniedError } from "../policy/tool-policy.js";
import type { PendingChangePlanStore } from "../plans/pending-change-plan-store.js";
import { applyFileChangesSafely } from "../security/apply-file-changes.js";
import type { RegisteredTool } from "./tool.js";

export const ApplyChangesInputSchema = z.object({
  plan_id: z.string().regex(/^plan_[a-f0-9]{64}$/),
});

export function createApplyChangesTool(
  plans: PendingChangePlanStore,
  approvals: ApprovalExecution,
  allowedRoot: string = process.cwd(),
): RegisteredTool {
  function requireApprovedPlan(rawInput: unknown) {
    const { plan_id: planId } = ApplyChangesInputSchema.parse(rawInput);
    const plan = plans.get(planId);
    const decision = approvals.get(planId);

    if (!plan || !decision || decision.status !== "approved" || decision.plan !== plan) {
      throw new PolicyDeniedError("Plan is not approved for execution");
    }

    return plan;
  }

  return {
    definition: {
      name: "apply-changes",
      description:
        "Request execution of a pending change plan. The server independently verifies trusted approval before accepting the request.",
      inputSchema: {
        type: "object",
        properties: {
          plan_id: {
            type: "string",
            pattern: "^plan_[a-f0-9]{64}$",
            description: "Identifier returned by plan-changes",
          },
        },
        required: ["plan_id"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    policy: { access: "write", requiresApproval: true },
    authorize(rawInput) {
      requireApprovedPlan(rawInput);
    },
    async run(rawInput) {
      const plan = requireApprovedPlan(rawInput);
      const appliedPaths = await applyFileChangesSafely(allowedRoot, plan, () => {
        approvals.consume(plan);
      });
      return [
        {
          type: "text",
          text: JSON.stringify({
            plan_id: plan.id,
            status: "applied",
            file_count: plan.files.length,
            applied_paths: appliedPaths,
            message: "Approved plan was applied and its approval was consumed.",
          }),
        },
      ];
    },
  };
}
