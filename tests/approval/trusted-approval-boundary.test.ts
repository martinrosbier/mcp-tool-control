import { describe, expect, it } from "vitest";
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
      status: "approved",
      decidedAt: "1970-01-01T00:00:02.000Z",
    });
    expect(boundary.state.get(plan.id)).toBe(decision);
    expect(Object.isFrozen(decision)).toBe(true);
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
});
