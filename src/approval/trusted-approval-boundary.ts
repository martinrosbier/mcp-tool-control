import type {
  PendingChangePlan,
  PendingChangePlanStore,
} from "../plans/pending-change-plan-store.js";
import { createBestEffortAuditSink, generateRequestId, type AuditSink } from "../utils/audit.js";

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
  audit?: AuditSink;
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
  // Decisions must not keep expired plans alive after the store releases them.
  // Object keys also bind approval to the exact stored plan instance.
  const decisions = new WeakMap<PendingChangePlan, ApprovalDecision>();
  const now = options.now ?? Date.now;
  const audit = createBestEffortAuditSink(options.audit);

  function auditDecision(
    planId: string,
    decision: string,
    outcome: "success" | "denied",
    error?: unknown,
  ): void {
    audit?.({
      timestamp: new Date(now()).toISOString(),
      requestId: generateRequestId(),
      eventType: "approval_decision",
      outcome,
      planId,
      decision,
      errorName: error instanceof Error ? error.name : undefined,
    });
  }

  function activePlan(planId: string): PendingChangePlan | undefined {
    return plans.get(planId);
  }

  function decide(planId: string, status: ApprovalStatus): ApprovalDecision {
    try {
      const plan = activePlan(planId);
      if (!plan) throw new PendingPlanUnavailableError(planId);

      const existing = decisions.get(plan);
      if (existing) {
        if (existing.status === status) return existing;
        throw new ApprovalAlreadyDecidedError(planId);
      }

      const decision = Object.freeze({
        planId,
        plan,
        status,
        decidedAt: new Date(now()).toISOString(),
      });
      decisions.set(plan, decision);
      auditDecision(planId, status, "success");
      return decision;
    } catch (error) {
      auditDecision(planId, status, "denied", error);
      throw error;
    }
  }

  const state: ApprovalState = Object.freeze({
    get(planId: string): ApprovalDecision | undefined {
      const plan = activePlan(planId);
      if (!plan) return undefined;

      return decisions.get(plan);
    },
  });

  const execution: ApprovalExecution = Object.freeze({
    get: state.get,
    consume(plan: PendingChangePlan): ApprovalDecision {
      try {
        const active = activePlan(plan.id);
        const decision = decisions.get(plan);
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
        decisions.set(plan, consumed);
        auditDecision(plan.id, "consume", "success");
        return consumed;
      } catch (error) {
        auditDecision(plan.id, "consume", "denied", error);
        throw error;
      }
    },
  });

  const host: TrustedApprovalController = Object.freeze({
    approve: (planId: string) => decide(planId, "approved"),
    deny: (planId: string) => decide(planId, "denied"),
  });

  return Object.freeze({ state, execution, host });
}
