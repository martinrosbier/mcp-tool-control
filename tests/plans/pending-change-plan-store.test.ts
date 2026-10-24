import { describe, expect, it } from "vitest";
import {
  PendingChangePlanStore,
  PlanStoreCapacityError,
} from "../../src/plans/pending-change-plan-store";

const files = [{ path: "notes/example.txt", content: "hello", purpose: "add a note" }];

describe("PendingChangePlanStore", () => {
  it("stores an immutable pending plan", () => {
    const store = new PendingChangePlanStore({ now: () => 1_000 });
    const plan = store.store(files);

    expect(plan.id).toMatch(/^plan_[a-f0-9]{64}$/);
    expect(plan.createdAt).toBe("1970-01-01T00:00:01.000Z");
    expect(plan.expiresAt).toBe("1970-01-01T00:10:01.000Z");
    expect(store.get(plan.id)).toBe(plan);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.files)).toBe(true);
    expect(Object.isFrozen(plan.files[0])).toBe(true);
  });

  it("copies writes before storing them", () => {
    const store = new PendingChangePlanStore();
    const input = files.map((file) => ({ ...file }));
    const plan = store.store(input);

    input[0].content = "changed later";

    expect(plan.files[0].content).toBe("hello");
  });

  it("does not extend the expiry of an active duplicate plan", () => {
    let now = 1_000;
    const store = new PendingChangePlanStore({ ttlMs: 500, now: () => now });
    const first = store.store(files);

    now = 1_200;
    const duplicate = store.store(files);

    expect(duplicate).toBe(first);
    expect(duplicate.expiresAt).toBe("1970-01-01T00:00:01.500Z");
  });

  it("includes expected filesystem state in plan identity", () => {
    const store = new PendingChangePlanStore();
    const missing = store.store(files, [{ path: files[0].path, kind: "missing" }]);
    const existing = store.store(files, [
      { path: files[0].path, kind: "file", contentHash: "abc123" },
    ]);

    expect(existing.id).not.toBe(missing.id);
  });

  it("removes expired plans", () => {
    let now = 1_000;
    const store = new PendingChangePlanStore({ ttlMs: 500, now: () => now });
    const plan = store.store(files);

    now = 1_500;

    expect(store.get(plan.id)).toBeUndefined();
  });

  it("rejects invalid expiry configuration", () => {
    expect(() => new PendingChangePlanStore({ ttlMs: 0 })).toThrow(
      "Change plan TTL must be a positive number",
    );
  });

  it("rejects repeated distinct plans at capacity without evicting active entries", () => {
    const store = new PendingChangePlanStore({ maxPlans: 3 });
    const active = [0, 1, 2].map((index) =>
      store.store([{ ...files[0], content: `plan ${index}` }]),
    );

    for (let index = 3; index < 100; index++) {
      expect(() => store.store([{ ...files[0], content: `plan ${index}` }])).toThrow(
        PlanStoreCapacityError,
      );
    }
    for (const plan of active) expect(store.get(plan.id)).toBe(plan);
    expect(store.store([{ ...files[0], content: "plan 0" }])).toBe(active[0]);
  });

  it("cleans expired entries on insertion and preserves active entries", () => {
    let now = 0;
    const store = new PendingChangePlanStore({ maxPlans: 2, ttlMs: 100, now: () => now });
    const expired = store.store(files);
    now = 50;
    const active = store.store([{ ...files[0], content: "active" }]);
    now = 100;

    const next = store.store([{ ...files[0], content: "new" }]);

    expect(store.get(expired.id)).toBeUndefined();
    expect(store.get(active.id)).toBe(active);
    expect(store.get(next.id)).toBe(next);
    expect(() => store.store(files)).toThrow(PlanStoreCapacityError);
  });

  it("enforces the combined UTF-8 payload budget and permits duplicates at the limit", () => {
    const unicodeFiles = [{ ...files[0], content: "é🔒" }];
    const bytes = Buffer.byteLength(JSON.stringify({ files: unicodeFiles, expectedFiles: [] }));
    const store = new PendingChangePlanStore({ maxPlans: 10, maxBytes: bytes });
    const plan = store.store(unicodeFiles);

    expect(store.store(unicodeFiles)).toBe(plan);
    expect(() => store.store(files)).toThrow(PlanStoreCapacityError);
    expect(store.get(plan.id)).toBe(plan);
    expect(() => new PendingChangePlanStore({ maxBytes: bytes - 1 }).store(unicodeFiles)).toThrow(
      PlanStoreCapacityError,
    );
  });

  it("counts file metadata and expected state in the payload budget", () => {
    const expectedFiles = [{ path: files[0].path, kind: "missing" as const }];
    const bytes = Buffer.byteLength(JSON.stringify({ files, expectedFiles }));
    expect(() =>
      new PendingChangePlanStore({ maxBytes: bytes - 1 }).store(files, expectedFiles),
    ).toThrow(PlanStoreCapacityError);
    const store = new PendingChangePlanStore({ maxBytes: bytes });
    const plan = store.store(files, expectedFiles);
    expect(store.get(plan.id)).toBe(plan);
  });

  it.each(["insertion", "lookup"])("reclaims expired payload bytes during %s", (cleanup) => {
    let now = 0;
    const bytes = Buffer.byteLength(JSON.stringify({ files, expectedFiles: [] }));
    const store = new PendingChangePlanStore({ maxBytes: bytes, ttlMs: 100, now: () => now });
    const original = store.store(files);
    now = 100;
    if (cleanup === "lookup") {
      expect(store.get(original.id)).toBeUndefined();
      expect(store.get(original.id)).toBeUndefined();
    }

    const replacement = store.store([{ ...files[0], content: "other" }]);
    expect(store.get(replacement.id)).toBe(replacement);
    expect(() => store.store(files)).toThrow(PlanStoreCapacityError);
  });

  it.each([0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid resource limits: %s",
    (limit) => {
      expect(() => new PendingChangePlanStore({ maxPlans: limit })).toThrow();
      expect(() => new PendingChangePlanStore({ maxBytes: limit })).toThrow();
    },
  );
});
