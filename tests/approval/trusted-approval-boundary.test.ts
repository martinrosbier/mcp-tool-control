import { describe, expect, it, vi } from "vitest";
import {
  ApprovalAlreadyDecidedError,
  PendingPlanUnavailableError,
  createTrustedApprovalBoundary,
} from "../../src/approval/trusted-approval-boundary";
import { PendingChangePlanStore } from "../../src/plans/pending-change-plan-store";

const files = [
  { path: "notes/example.txt", content: "hello", purpose: "add a note" },
];

describe("createTrustedApprovalBoundary", () => {
  it("separates trusted mutation from read-only approval state", () => {
    const plans = new PendingChangePlanStore();
    const plan = plans.store(files);
    const boundary = createTrustedApprovalBoundary(plans, { now: () => 2_000 });

    expect(boundary.state.get(plan.id)).toBeUndefined();
    expect("approve" in boundary.state).toBe(false);

    const decision = boundary.host.approve(plan.id);

    expect(decision).toEqual({
      planId: plan.id,
      plan,
      status: "approved",
      decidedAt: "1970-01-01T00:00:02.000Z",
    });
    expect(boundary.state.get(plan.id)).toBe(decision);
    expect(Object.isFrozen(decision)).toBe(true);
  });

  it("audits trusted decisions and approval consumption", () => {
    const plans = new PendingChangePlanStore();
    const plan = plans.store(files);
    const audit = vi.fn();
    const boundary = createTrustedApprovalBoundary(plans, { audit });

    boundary.host.approve(plan.id);
    boundary.execution.consume(plan);

    expect(audit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      eventType: "approval_decision",
      outcome: "success",
      planId: plan.id,
      decision: "approved",
    }));
    expect(audit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      eventType: "approval_decision",
      outcome: "success",
      planId: plan.id,
      decision: "consume",
    }));
  });

  it("audits rejected approval attempts", () => {
    const plans = new PendingChangePlanStore();
    const audit = vi.fn();
    const boundary = createTrustedApprovalBoundary(plans, { audit });

    expect(() => boundary.host.approve("plan_missing")).toThrow();

    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "approval_decision",
      outcome: "denied",
      planId: "plan_missing",
      decision: "approved",
      errorName: "PendingPlanUnavailableError",
    }));
  });

  it("rejects decisions for unknown plans", () => {
    const plans = new PendingChangePlanStore();
    const boundary = createTrustedApprovalBoundary(plans);

    expect(() => boundary.host.approve("plan_missing")).toThrow(
      PendingPlanUnavailableError,
    );
  });

  it("makes repeated identical decisions idempotent", () => {
    const plans = new PendingChangePlanStore();
    const plan = plans.store(files);
    const boundary = createTrustedApprovalBoundary(plans);

    const first = boundary.host.deny(plan.id);

    expect(boundary.host.deny(plan.id)).toBe(first);
  });

  it("does not allow a decision to be changed", () => {
    const plans = new PendingChangePlanStore();
    const plan = plans.store(files);
    const boundary = createTrustedApprovalBoundary(plans);
    boundary.host.approve(plan.id);

    expect(() => boundary.host.deny(plan.id)).toThrow(
      ApprovalAlreadyDecidedError,
    );
  });

  it("consumes approval exactly once through the execution capability", () => {
    const plans = new PendingChangePlanStore();
    const plan = plans.store(files);
    const boundary = createTrustedApprovalBoundary(plans, { now: () => 2_000 });
    boundary.host.approve(plan.id);

    const consumed = boundary.execution.consume(plan);

    expect(consumed.status).toBe("consumed");
    expect(consumed.consumedAt).toBe("1970-01-01T00:00:02.000Z");
    expect(boundary.state.get(plan.id)).toBe(consumed);
    expect(() => boundary.execution.consume(plan)).toThrow(
      "Plan does not have executable approval",
    );
    expect(() => boundary.host.approve(plan.id)).toThrow(
      ApprovalAlreadyDecidedError,
    );
  });

  it("invalidates approval state when the pending plan expires", () => {
    let now = 1_000;
    const plans = new PendingChangePlanStore({ ttlMs: 500, now: () => now });
    const plan = plans.store(files);
    const boundary = createTrustedApprovalBoundary(plans, { now: () => now });
    boundary.host.approve(plan.id);

    now = 1_500;

    expect(boundary.state.get(plan.id)).toBeUndefined();
    expect(() => boundary.host.approve(plan.id)).toThrow(
      PendingPlanUnavailableError,
    );
  });

  it("does not transfer approval to a recreated plan with the same identifier", () => {
    let now = 1_000;
    const plans = new PendingChangePlanStore({ ttlMs: 500, now: () => now });
    const originalPlan = plans.store(files);
    const boundary = createTrustedApprovalBoundary(plans, { now: () => now });
    const originalDecision = boundary.host.approve(originalPlan.id);

    now = 1_500;
    const recreatedPlan = plans.store(files);

    expect(recreatedPlan.id).toBe(originalPlan.id);
    expect(recreatedPlan).not.toBe(originalPlan);
    expect(boundary.state.get(recreatedPlan.id)).toBeUndefined();

    const recreatedDecision = boundary.host.approve(recreatedPlan.id);
    expect(recreatedDecision).not.toBe(originalDecision);
    expect(recreatedDecision.plan).toBe(recreatedPlan);
  });
});
