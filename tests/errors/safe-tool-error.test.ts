import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PolicyDeniedError } from "../../src/policy/tool-policy";
import { PlanStoreCapacityError } from "../../src/plans/pending-change-plan-store";
import { PathOutsideRootError } from "../../src/security/contained-path";
import { StaleChangePlanError } from "../../src/security/file-state";
import { UnknownToolError } from "../../src/tools/tool";
import { toSafeToolError } from "../../src/errors/safe-tool-error";

describe("toSafeToolError", () => {
  it.each([
    [new z.ZodError([]), "INVALID_ARGUMENTS"],
    [new UnknownToolError("secret-tool-name"), "UNKNOWN_TOOL"],
    [new PolicyDeniedError("sensitive policy detail"), "APPROVAL_REQUIRED"],
    [new PathOutsideRootError(), "PATH_NOT_ALLOWED"],
    [new StaleChangePlanError("private/path.txt"), "PLAN_STALE"],
    [new PlanStoreCapacityError(), "PLAN_STORE_FULL"],
    [new Error("secret internal failure"), "TOOL_EXECUTION_FAILED"],
  ])("maps internal errors to safe code %s", (error, expectedCode) => {
    const safe = toSafeToolError(error);

    expect(safe.code).toBe(expectedCode);
    expect(JSON.stringify(safe)).not.toContain(error.message);
    expect(JSON.stringify(safe)).not.toContain("private/path.txt");
    expect(JSON.stringify(safe)).not.toContain("secret");
  });
});
