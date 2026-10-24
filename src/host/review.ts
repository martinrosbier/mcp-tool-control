import type { TrustedApprovalController } from "../approval/trusted-approval-boundary.js";
import type { PendingChangePlan } from "../plans/pending-change-plan-store.js";

/** I/O surface for the terminal approver, injectable for tests. */
export interface ReviewIo {
  write(text: string): void;
  ask(question: string): Promise<string>;
}

export type PlanReviewOutcome = "approved" | "denied" | "skipped" | "error";

/**
 * Renders the complete plan for human review. Reviewing the full intended
 * writes is the host's responsibility; nothing is truncated here because the
 * plan store and input schemas already bound plan size.
 */
export function formatPlanForReview(plan: PendingChangePlan): string {
  const lines = [
    "",
    "=== Pending change plan ===",
    `plan_id:   ${plan.id}`,
    `created:   ${plan.createdAt}`,
    `expires:   ${plan.expiresAt}`,
    `files:     ${plan.files.length}`,
    "",
  ];
  for (const file of plan.files) {
    lines.push(`--- ${file.path}`);
    lines.push(`purpose: ${file.purpose}`);
    lines.push("content:");
    lines.push(file.content);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Shows the exact plan and asks the human to approve, deny, or skip it.
 * Approval errors (for example an expired plan) are reported to the host and
 * leave the plan undecided.
 */
export async function reviewPlan(
  controller: TrustedApprovalController,
  plan: PendingChangePlan,
  io: ReviewIo,
): Promise<PlanReviewOutcome> {
  io.write(formatPlanForReview(plan));

  for (;;) {
    const answer = (await io.ask("Approve this plan? [a]pprove / [d]eny / [s]kip: "))
      .trim()
      .toLowerCase();

    if (answer === "a" || answer === "approve") {
      try {
        controller.approve(plan.id);
        io.write("Plan approved. The model can now request apply-changes.\n");
        return "approved";
      } catch (error) {
        io.write(`Approval failed: ${error instanceof Error ? error.message : String(error)}\n`);
        return "error";
      }
    }
    if (answer === "d" || answer === "deny") {
      try {
        controller.deny(plan.id);
        io.write("Plan denied.\n");
        return "denied";
      } catch (error) {
        io.write(`Denial failed: ${error instanceof Error ? error.message : String(error)}\n`);
        return "error";
      }
    }
    if (answer === "s" || answer === "skip") {
      io.write("Skipped; this plan stays pending but will not be prompted again this session.\n");
      return "skipped";
    }
    io.write("Please answer a, d, or s.\n");
  }
}

export interface ApprovalWatcherOptions {
  readonly controller: TrustedApprovalController;
  readonly io: ReviewIo;
  readonly intervalMs?: number;
}

export interface ApprovalWatcher {
  stop(): void;
}

/**
 * Polls for undecided plans and prompts the human once per plan. Plans are
 * handled one at a time so prompts never interleave. This runs in trusted host
 * code only; nothing here is reachable through MCP.
 */
export function startApprovalWatcher(options: ApprovalWatcherOptions): ApprovalWatcher {
  const seen = new Set<string>();
  let busy = false;

  const timer = setInterval(() => {
    void tick();
  }, options.intervalMs ?? 500);

  async function tick(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      for (const plan of options.controller.listPending()) {
        if (seen.has(plan.id)) continue;
        seen.add(plan.id);
        await reviewPlan(options.controller, plan, options.io);
      }
    } catch (error) {
      options.io.write(
        `Approval watcher error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    } finally {
      busy = false;
    }
  }

  return { stop: () => clearInterval(timer) };
}
