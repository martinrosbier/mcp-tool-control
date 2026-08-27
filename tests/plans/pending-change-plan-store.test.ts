import { describe, expect, it } from "vitest";
import { PendingChangePlanStore } from "../../src/plans/pending-change-plan-store";

const files = [
  { path: "notes/example.txt", content: "hello", purpose: "add a note" },
];

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
});
