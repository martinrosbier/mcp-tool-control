import { createChangePlanId } from "../lib/change-plan.js";
import type { FileToWrite } from "../lib/conflicts.js";

export const DEFAULT_CHANGE_PLAN_TTL_MS = 10 * 60 * 1_000;

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
}

export class PendingChangePlanStore {
  private readonly plans = new Map<string, PendingChangePlan>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: PendingChangePlanStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_CHANGE_PLAN_TTL_MS;
    this.now = options.now ?? Date.now;

    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) {
      throw new Error("Change plan TTL must be a positive number");
    }
  }

  store(
    files: FileToWrite[],
    expectedFiles: ExpectedFileState[] = [],
  ): PendingChangePlan {
    const id = createChangePlanId(files, expectedFiles);
    const existing = this.get(id);
    if (existing) return existing;

    const createdAtMs = this.now();
    const storedFiles = Object.freeze(
      files.map((file) => Object.freeze({ ...file })),
    );
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
    return plan;
  }

  get(id: string): PendingChangePlan | undefined {
    const plan = this.plans.get(id);
    if (!plan) return undefined;

    if (Date.parse(plan.expiresAt) <= this.now()) {
      this.plans.delete(id);
      return undefined;
    }

    return plan;
  }
}
