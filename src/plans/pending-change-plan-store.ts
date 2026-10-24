import { createChangePlanId } from "../lib/change-plan.js";
import type { FileToWrite } from "../lib/conflicts.js";

export const DEFAULT_CHANGE_PLAN_TTL_MS = 10 * 60 * 1_000;
export const DEFAULT_MAX_PENDING_PLANS = 100;
export const DEFAULT_MAX_PENDING_PLAN_BYTES = 16 * 1024 * 1024;

export class PlanStoreCapacityError extends Error {
  constructor() {
    super("Pending change plan storage is full");
    this.name = "PlanStoreCapacityError";
  }
}

export type ExpectedFileState =
  | Readonly<{ path: string; kind: "missing" }>
  | Readonly<{ path: string; kind: "file"; contentHash: string }>;

export interface PendingChangePlan {
  readonly id: string;
  readonly files: readonly Readonly<FileToWrite>[];
  readonly expectedFiles: readonly ExpectedFileState[];
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface PendingChangePlanStoreOptions {
  ttlMs?: number;
  now?: () => number;
  maxPlans?: number;
  maxBytes?: number;
}

export class PendingChangePlanStore {
  private readonly plans = new Map<string, PendingChangePlan>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly maxPlans: number;
  private readonly maxBytes: number;
  private readonly planBytes = new Map<string, number>();
  private retainedBytes = 0;

  constructor(options: PendingChangePlanStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_CHANGE_PLAN_TTL_MS;
    this.now = options.now ?? Date.now;
    this.maxPlans = options.maxPlans ?? DEFAULT_MAX_PENDING_PLANS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_PENDING_PLAN_BYTES;

    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) {
      throw new Error("Change plan TTL must be a positive number");
    }
    if (!Number.isSafeInteger(this.maxPlans) || this.maxPlans <= 0) {
      throw new Error("Maximum pending plans must be a positive safe integer");
    }
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes <= 0) {
      throw new Error("Maximum pending plan bytes must be a positive safe integer");
    }
  }

  store(files: FileToWrite[], expectedFiles: ExpectedFileState[] = []): PendingChangePlan {
    const createdAtMs = this.now();
    for (const [planId, plan] of this.plans) {
      if (Date.parse(plan.expiresAt) <= createdAtMs) this.remove(planId);
    }

    const id = createChangePlanId(files, expectedFiles);
    const existing = this.plans.get(id);
    if (existing) return existing;

    if (this.plans.size >= this.maxPlans) throw new PlanStoreCapacityError();
    // Bound retained payload independently of entry count. This is a storage
    // budget, not a measurement of total JS heap or transient request memory.
    const bytes = Buffer.byteLength(JSON.stringify({ files, expectedFiles }), "utf8");
    if (bytes > this.maxBytes - this.retainedBytes) throw new PlanStoreCapacityError();

    const storedFiles = Object.freeze(files.map((file) => Object.freeze({ ...file })));
    const storedExpectedFiles = Object.freeze(
      expectedFiles.map((state) => Object.freeze({ ...state })),
    );
    const plan = Object.freeze({
      id,
      files: storedFiles,
      expectedFiles: storedExpectedFiles,
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + this.ttlMs).toISOString(),
    });

    this.plans.set(id, plan);
    this.planBytes.set(id, bytes);
    this.retainedBytes += bytes;
    return plan;
  }

  private remove(id: string): void {
    this.retainedBytes -= this.planBytes.get(id) ?? 0;
    this.planBytes.delete(id);
    this.plans.delete(id);
  }

  get(id: string): PendingChangePlan | undefined {
    const plan = this.plans.get(id);
    if (!plan) return undefined;

    if (Date.parse(plan.expiresAt) <= this.now()) {
      this.remove(id);
      return undefined;
    }

    return plan;
  }
}
