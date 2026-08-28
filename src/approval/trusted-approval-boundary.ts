import type {
  PendingChangePlan,
  PendingChangePlanStore,
} from "../plans/pending-change-plan-store.js";

export type ApprovalStatus = "approved" | "denied" | "consumed";

export interface ApprovalDecision {
  readonly planId: string;
  readonly plan: PendingChangePlan;
  readonly status: ApprovalStatus;
  readonly decidedAt: string;
  readonly consumedAt?: string;
}

export interface ApprovalState {
  get(planId: string): ApprovalDecision | undefined;
}

export interface ApprovalExecution extends ApprovalState {
  consume(plan: PendingChangePlan): ApprovalDecision;
}

export interface TrustedApprovalController {
  approve(planId: string): ApprovalDecision;
  deny(planId: string): ApprovalDecision;
}

export interface TrustedApprovalBoundary {
  readonly state: ApprovalState;
  readonly execution: ApprovalExecution;
  readonly host: TrustedApprovalController;
}

export interface TrustedApprovalBoundaryOptions {
  now?: () => number;
}

export class PendingPlanUnavailableError extends Error {
  constructor(planId: string) {
    super(`Pending plan is unavailable: ${planId}`);
    this.name = "PendingPlanUnavailableError";
  }
}

export class ApprovalAlreadyDecidedError extends Error {
  constructor(planId: string) {
    super(`Approval is already decided for plan: ${planId}`);
    this.name = "ApprovalAlreadyDecidedError";
  }
}

export class ApprovalNotExecutableError extends Error {
  constructor(planId: string) {
    super(`Plan does not have executable approval: ${planId}`);
    this.name = "ApprovalNotExecutableError";
  }
}

/**
 * Creates separate capabilities for trusted decision-making and approval reads.
 * The host capability must never be registered as an MCP tool or derived from
 * model-facing request data.
 */
export function createTrustedApprovalBoundary(
  plans: PendingChangePlanStore,
  options: TrustedApprovalBoundaryOptions = {},
): TrustedApprovalBoundary {
  const decisions = new Map<string, ApprovalDecision>();
  const now = options.now ?? Date.now;

  function activePlan(planId: string): PendingChangePlan | undefined {
    const plan = plans.get(planId);
    if (!plan) decisions.delete(planId);
    return plan;
  }

  function decide(planId: string, status: ApprovalStatus): ApprovalDecision {
    const plan = activePlan(planId);
    if (!plan) throw new PendingPlanUnavailableError(planId);

    const existing = decisions.get(planId);
    if (existing) {
      if (existing.plan === plan) {
        if (existing.status === status) return existing;
        throw new ApprovalAlreadyDecidedError(planId);
      }
      decisions.delete(planId);
    }

    const decision = Object.freeze({
      planId,
      plan,
      status,
      decidedAt: new Date(now()).toISOString(),
    });
    decisions.set(planId, decision);
    return decision;
  }

  const state: ApprovalState = Object.freeze({
    get(planId: string): ApprovalDecision | undefined {
      const plan = activePlan(planId);
      if (!plan) return undefined;

      const decision = decisions.get(planId);
      if (decision?.plan !== plan) {
        decisions.delete(planId);
        return undefined;
      }
      return decision;
    },
  });

  const execution: ApprovalExecution = Object.freeze({
    get: state.get,
    consume(plan: PendingChangePlan): ApprovalDecision {
      const active = activePlan(plan.id);
      const decision = decisions.get(plan.id);
      if (
        active !== plan
        || decision?.plan !== plan
        || decision.status !== "approved"
      ) {
        throw new ApprovalNotExecutableError(plan.id);
      }

      const consumed = Object.freeze({
        ...decision,
        status: "consumed" as const,
        consumedAt: new Date(now()).toISOString(),
      });
      decisions.set(plan.id, consumed);
      return consumed;
    },
  });

  const host: TrustedApprovalController = Object.freeze({
    approve: (planId: string) => decide(planId, "approved"),
    deny: (planId: string) => decide(planId, "denied"),
  });

  return Object.freeze({ state, execution, host });
}
