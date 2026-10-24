import { describe, expect, it, vi, type Mock } from "vitest";
import { createTrustedApprovalBoundary } from "../../src/approval/trusted-approval-boundary";
import {
  PendingChangePlanStore,
  type PendingChangePlanStoreOptions,
} from "../../src/plans/pending-change-plan-store";
import {
  formatPlanForReview,
  reviewPlan,
  startApprovalWatcher,
  type ReviewIo,
} from "../../src/host/review";

const files = [{ path: "notes/example.txt", content: "hello", purpose: "add a note" }];

function setup(options: PendingChangePlanStoreOptions = {}) {
  const plans = new PendingChangePlanStore(options);
  const boundary = createTrustedApprovalBoundary(plans);
  return { plans, controller: boundary.host, state: boundary.state };
}

function scriptedIo(answers: string[]) {
  const writes: string[] = [];
  const io: ReviewIo = {
    write: (text) => {
      writes.push(text);
    },
    ask: vi.fn(async () => {
      const next = answers.shift();
      if (next === undefined) throw new Error("unexpected prompt");
      return next;
    }),
  };
  return { io, writes, ask: io.ask as Mock };
}

describe("trusted host plan review", () => {
  it("lists and reviews only undecided active plans", () => {
    const { plans, controller } = setup();
    const plan = plans.store(files);

    expect(controller.listPending()).toEqual([plan]);
    expect(controller.review(plan.id)).toBe(plan);
    expect(controller.review("plan_".concat("0".repeat(64)))).toBeUndefined();

    controller.deny(plan.id);
    expect(controller.listPending()).toEqual([]);
  });

  it("sweeps expired plans out of the pending list", () => {
    let now = 0;
    const { plans, controller } = setup({ ttlMs: 100, now: () => now });
    plans.store(files);

    now = 1_000;
    expect(controller.listPending()).toEqual([]);
  });

  it("formats the complete plan for human review", () => {
    const { plans } = setup();
    const plan = plans.store(files);
    const text = formatPlanForReview(plan);

    expect(text).toContain(plan.id);
    expect(text).toContain("notes/example.txt");
    expect(text).toContain("add a note");
    expect(text).toContain("hello");
    expect(text).toContain(plan.expiresAt);
  });

  it("approves a plan on 'a' and records the decision", async () => {
    const { plans, controller, state } = setup();
    const plan = plans.store(files);
    const { io } = scriptedIo(["a"]);

    await expect(reviewPlan(controller, plan, io)).resolves.toBe("approved");
    expect(state.get(plan.id)?.status).toBe("approved");
  });

  it("denies a plan on 'deny'", async () => {
    const { plans, controller, state } = setup();
    const plan = plans.store(files);
    const { io } = scriptedIo(["deny"]);

    await expect(reviewPlan(controller, plan, io)).resolves.toBe("denied");
    expect(state.get(plan.id)?.status).toBe("denied");
  });

  it("skips without deciding", async () => {
    const { plans, controller, state } = setup();
    const plan = plans.store(files);
    const { io } = scriptedIo(["s"]);

    await expect(reviewPlan(controller, plan, io)).resolves.toBe("skipped");
    expect(state.get(plan.id)).toBeUndefined();
  });

  it("re-prompts on unrecognized answers", async () => {
    const { plans, controller, state } = setup();
    const plan = plans.store(files);
    const { io, ask } = scriptedIo(["maybe", "a"]);

    await expect(reviewPlan(controller, plan, io)).resolves.toBe("approved");
    expect(ask).toHaveBeenCalledTimes(2);
    expect(state.get(plan.id)?.status).toBe("approved");
  });

  it("reports an approval error when the plan expired before the decision", async () => {
    let now = 0;
    const { plans, controller } = setup({ ttlMs: 100, now: () => now });
    const plan = plans.store(files);
    now = 1_000;

    const { io, writes } = scriptedIo(["a"]);
    await expect(reviewPlan(controller, plan, io)).resolves.toBe("error");
    expect(writes.join("")).toContain("Approval failed");
  });

  it("prompts once per pending plan and not again after a decision", async () => {
    const { plans, controller } = setup();
    plans.store(files);
    const { io, ask } = scriptedIo(["a"]);

    const watcher = startApprovalWatcher({ controller, io, intervalMs: 5 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    watcher.stop();

    expect(ask).toHaveBeenCalledTimes(1);
    expect(controller.listPending()).toEqual([]);
  });
});
