# Trusted host integration

`mcp-tool-control` deliberately separates the model-facing MCP server from the
capability that changes approval state.

```ts
import { createMcpToolControl } from "mcp-tool-control";

const { server, approvalController } = createMcpToolControl({
  allowedRoot: "C:\\work\\target-project",
  maxPendingPlans: 100,
  maxPendingPlanBytes: 16 * 1024 * 1024,
  audit: (event) => durableAuditSink.write(event),
});

// Connect the server to the transport used by the MCP client or model.
await server.connect(modelFacingTransport);

// Give only the trusted host interface this capability.
trustedReviewUi.onApprove((planId) => {
  approvalController.approve(planId);
});

trustedReviewUi.onDeny((planId) => {
  approvalController.deny(planId);
});
```

The returned values are intentionally separate capabilities:

- `server` exposes `inspect-text`, `plan-changes`, and `apply-changes` through MCP.
- `approvalController` exposes `approve(planId)` and `deny(planId)` to trusted host code.

The server does not expose the approval controller as an MCP tool, tool argument,
resource, prompt, or execution context. A model can receive a `plan_id`, but that
identifier grants no authority.

## Approval flow

1. The model calls `plan-changes` through MCP.
2. The server captures the target files' current state and stores an immutable,
   expiring plan.
3. The MCP response returns the plan ID, expiry, proposed writes, and conflicts.
4. The embedding host presents those details to a human through a trusted UI.
5. The host calls `approvalController.approve(planId)` or `.deny(planId)`.
6. The model may request `apply-changes` with the plan ID.
7. The server independently verifies the pending plan and its server-owned decision.
8. A successful apply consumes approval, preventing replay.

Approval is bound to the exact stored plan instance. If a plan expires and an
equivalent plan is created later with the same deterministic ID, the new instance
does not inherit the old approval.

## Choosing the trusted host boundary

The code holding `approvalController` is part of the trusted computing base. It
must authenticate the human or system making the decision and must display the
actual plan being approved.

Do not:

- Register `approve` or `deny` as MCP tools.
- Accept an `approved: true` field from MCP requests.
- Put the controller in model-accessible request context.
- Expose it through an unauthenticated HTTP, IPC, or message-queue endpoint.
- Treat possession of a plan ID as evidence of approval.

If the embedding host and MCP server run in separate processes, the host must
design a private authenticated channel for approval decisions. That transport and
its authorization model belong to the host application; this package does not
invent a generic approval network API.

## Standalone stdio behavior

The bundled `npm start` entrypoint creates the same runtime but intentionally keeps
only `server`:

```ts
const { server } = createMcpToolControl({
  allowedRoot: process.cwd(),
  audit: logAuditEvent,
});
```

Consequently, standalone stdio can inspect and propose changes, but no MCP caller
can approve them. `apply-changes` remains denied unless a trusted embedding host
owns and invokes the controller.

## Controller outcomes

`approve(planId)` and `deny(planId)` are synchronous and return the immutable
decision record. They reject unknown or expired plans. Repeating the same decision
is idempotent, while attempting to reverse a decision is rejected.

After successful application, approval becomes `consumed`. A consumed approval
cannot be reused or approved again. If execution fails after approval is consumed,
the operation remains fail-closed and requires a newly planned and approved change.
