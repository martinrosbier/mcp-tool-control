import { z } from "zod";
import { ApprovalNotExecutableError } from "../approval/trusted-approval-boundary.js";
import { PolicyDeniedError } from "../policy/tool-policy.js";
import { PlanStoreCapacityError } from "../plans/pending-change-plan-store.js";
import { PathOutsideRootError } from "../security/contained-path.js";
import {
  DuplicatePlanTargetError,
  InvalidPlanTargetError,
  NestedPlanTargetError,
  StaleChangePlanError,
} from "../security/file-state.js";
import { UnknownToolError } from "../tools/tool.js";

export type SafeToolErrorCode =
  | "INVALID_ARGUMENTS"
  | "UNKNOWN_TOOL"
  | "APPROVAL_REQUIRED"
  | "PATH_NOT_ALLOWED"
  | "INVALID_PLAN_TARGET"
  | "PLAN_STALE"
  | "PLAN_STORE_FULL"
  | "TOOL_EXECUTION_FAILED";

export interface SafeToolError {
  code: SafeToolErrorCode;
  message: string;
}

export function toSafeToolError(error: unknown): SafeToolError {
  if (error instanceof PlanStoreCapacityError) {
    return {
      code: "PLAN_STORE_FULL",
      message: "Pending plan capacity exceeded; submit a smaller plan or wait for plans to expire",
    };
  }
  if (error instanceof z.ZodError) {
    return { code: "INVALID_ARGUMENTS", message: "Invalid tool arguments" };
  }
  if (error instanceof UnknownToolError) {
    return { code: "UNKNOWN_TOOL", message: "Unknown tool" };
  }
  if (error instanceof PolicyDeniedError || error instanceof ApprovalNotExecutableError) {
    return {
      code: "APPROVAL_REQUIRED",
      message: "Tool execution is not authorized",
    };
  }
  if (error instanceof PathOutsideRootError) {
    return {
      code: "PATH_NOT_ALLOWED",
      message: "A requested path is not allowed",
    };
  }
  if (
    error instanceof InvalidPlanTargetError ||
    error instanceof DuplicatePlanTargetError ||
    error instanceof NestedPlanTargetError
  ) {
    return {
      code: "INVALID_PLAN_TARGET",
      message: "The change plan contains an invalid target",
    };
  }
  if (error instanceof StaleChangePlanError) {
    return {
      code: "PLAN_STALE",
      message: "The filesystem changed after this plan was created",
    };
  }
  return {
    code: "TOOL_EXECUTION_FAILED",
    message: "Tool execution failed",
  };
}
