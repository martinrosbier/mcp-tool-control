# MCP Tool Control

An opinionated TypeScript MCP reference implementation for controlled tool
execution.

`mcp-tool-control` demonstrates a strict separation between proposing a privileged
side effect, authorizing it outside the model-facing boundary, and executing it
under server-enforced controls.

> The model can obtain a plan ID and request execution. Only the embedding host can
> obtain the authority that changes approval state.

The repository is a foundation and security reference, not an operating-system
sandbox or a production-ready remote service.

## What it includes

| Tool | Access | Behavior |
| --- | --- | --- |
| `inspect-text` | `read` | Returns bounded structural metadata without echoing submitted text. |
| `plan-changes` | `plan` | Validates contained paths, captures filesystem state, and stores an immutable expiring write plan. |
| `apply-changes` | `write` | Applies only the exact pending plan approved through the trusted host capability. |

The controlled-write path includes:

- Deterministic plan identity that is never treated as authority.
- Immutable in-memory pending plans with a ten-minute default expiry, a 100-plan
  limit, and a 16 MiB retained payload budget.
- A trusted approval controller that is not exposed through MCP.
- Approval binding to the exact stored plan instance.
- Absolute-path, traversal, symlink, junction, duplicate, and overlapping-target checks.
- Case-insensitive comparison of planned targets on every platform, with original
  path spelling preserved for writes.
- Expected-state hashes and stale-write rejection.
- Single-use approval consumption and concurrent replay protection.
- Exclusive temporary-file staging, flushing, and target revalidation immediately
  before each rename replacement.
- Structured safe errors and privacy-preserving audit events with best-effort delivery.

## Requirements

- Node.js 20 or newer
- npm

## Quick start

```sh
git clone <repository-url> mcp-tool-control
cd mcp-tool-control
npm ci
npm run check
```

`npm run check` runs TypeScript typechecking, all tests, and the production build.

Start the bundled MCP stdio server with:

```sh
npm start
```

Configure an MCP-compatible client to execute `node` with the absolute path to
`dist/server.js`. The launcher's current working directory becomes the allowed
workspace root.

The standalone stdio entrypoint intentionally keeps only the MCP server capability.
It can inspect and plan, but it provides no path for an MCP caller to approve a
write plan.

## Embed in a trusted host

Applications that need controlled writes should use the public composition API:

```ts
import { createMcpToolControl } from "mcp-tool-control";

const { server, approvalController } = createMcpToolControl({
  allowedRoot: "/absolute/path/to/workspace",
  maxPendingPlans: 100,
  maxPendingPlanBytes: 16 * 1024 * 1024,
  audit: (event) => auditStore.write(event),
  onInternalError: (error) => protectedErrorSink.write(error),
});

await server.connect(modelFacingTransport);

trustedReviewUi.onApprove((planId) => {
  approvalController.approve(planId);
});

trustedReviewUi.onDeny((planId) => {
  approvalController.deny(planId);
});
```

The two returned values are deliberately separate capabilities:

- Give `server` to the MCP/model-facing transport.
- Keep `approvalController` inside authenticated trusted host code.

Do not register the controller as an MCP tool or expose it through an
unauthenticated HTTP, IPC, queue, or callback endpoint.

See [Trusted host integration](docs/trusted-host-integration.md) for the complete
embedding model.

Plan limits are trusted host configuration. Before each insertion, expired plans
are removed. New plans that exceed either limit return `PLAN_STORE_FULL`; active
plans are not evicted. The byte budget counts serialized UTF-8 files and expected
state, not total process memory or transient request allocations.

Audit sinks may return `void` or `Promise<void>`. A thrown error or rejected promise
does not change tool results or approval state. Delivery is not awaited or retried;
failures produce a generic stderr diagnostic without event contents or sink errors.

## Controlled write lifecycle

```text
model calls plan-changes
        |
        v
server snapshots contained targets and stores an expiring plan
        |
        v
host displays exact plan and approves through approvalController
        |
        v
model calls apply-changes with plan_id
        |
        v
server verifies plan + approval + filesystem state
        |
        v
server consumes approval, stages files, revalidates, and replaces targets
```

The `plan_id` is a deterministic lookup identifier. Possessing it does not approve
the operation. Recreating an expired plan with the same ID does not transfer the old
approval because decisions bind to the exact server-owned plan instance.

See [Controlled write workflow](docs/controlled-write-workflow.md) for identity,
expiry, stale-state handling, consumption, write semantics, and limitations.

Conflict previews show the first difference with bounded before/after text, line
and column, and an omission flag. They use caller-supplied existing content and
support review; they do not replace reviewing the full intended writes.

## Use this repository as a base

Clone or fork the repository and keep tool behavior behind the shared
`RegisteredTool` contract in `src/tools/tool.ts`.

### Add a read tool

A read tool declares that it does not require approval, validates untrusted input,
and returns bounded output:

```ts
export const exampleReadTool: RegisteredTool = {
  definition: {
    name: "example-read",
    description: "Return bounded read-only metadata.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  policy: { access: "read", requiresApproval: false },
  async run(rawInput) {
    const input = ExampleInputSchema.parse(rawInput);
    return [{ type: "text", text: JSON.stringify(boundedMetadata(input)) }];
  },
};
```

Register it in the private registry assembled by `createMcpToolControl()` and add
schema, behavior, safe-error, and audit tests.

### Add a planning tool

A planning tool uses:

```ts
policy: { access: "plan", requiresApproval: false }
```

It may inspect trusted state and produce a reviewable proposal, but it must not
perform the proposed privileged side effect. If the proposal will later authorize
execution, store an immutable server-owned representation with expiry rather than
trusting data returned by the caller.

### Add a write tool

Do not implement a write tool by adding a no-op `authorize()` function merely to
satisfy registration. The repository assumes its source code and composition root
are trusted; policy metadata cannot defend against a malicious tool implementation.

Extend the controlled workflow instead:

1. Represent every intended side effect in the immutable plan.
2. Include normalized arguments, intended values or hashes, and expected previous
   state in plan identity.
3. Keep approval mutation outside MCP.
4. Inject only the server-owned approval read/consume capability into execution.
5. Revalidate containment and expected state immediately before side effects.
6. Consume approval once before beginning effects.
7. Return safe errors and emit structural audit events.
8. Add end-to-end and adversarial tests.

The existing `plan-changes` and `apply-changes` pair is the reference pattern. A new
kind of write operation should extend that plan representation and composition,
not create a parallel approval shortcut.

## Security invariants

- MCP input can identify a plan but cannot approve it.
- Write tools cannot be registered without an approval requirement and an
  authorizer; the trusted composition root must supply the real server-owned
  authorization check.
- The allowed root comes from trusted runtime configuration, never tool arguments.
- Caller-provided existing-file data is review metadata, not the authoritative
  stale-state snapshot.
- Approval is tied to an immutable plan instance, expires with it, and is consumed
  once.
- MCP-visible errors never contain raw exception messages, paths, submitted
  contents, or private tool names.
- Audit summaries contain dimensions rather than input or output values.
- MCP stdio stdout is reserved for protocol traffic; bundled audit logs use stderr.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

GitLab CI performs clean installs, typechecking, tests, production builds,
high-severity dependency auditing, and pipeline secret detection.

## Explicit limitations

- Multi-file application is not transactionally atomic. A later rename failure can
  leave earlier files applied.
- Plans, decisions, and consumed state are in memory and disappear on restart.
- Path containment and repeated validation are not an OS sandbox against a hostile
  local actor racing filesystem changes.
- Target collision checks conservatively reject case-only duplicates even on
  case-sensitive filesystems. They use JavaScript lowercase comparison, not a full
  model of filesystem-specific Unicode equivalence.
- The embedding host is responsible for authenticating approvers and protecting
  the approval controller and raw internal-error sink.
- Remote exposure requires transport authentication, authorization, rate limits,
  and deployment-specific protections not supplied here.
- The included tools write UTF-8 full-file contents; they do not execute commands or
  call external APIs.

## Project structure

```text
src/
  approval/   trusted decision and consumption capabilities
  errors/     MCP-safe error classification
  plans/      immutable pending-plan storage
  policy/     tool access and registration rules
  security/   containment, state capture, and safe file replacement
  tools/      MCP tool definitions and implementations
  runtime.ts  embeddable composition API
  server.ts   standalone stdio adapter
tests/
  integration/  workflow and adversarial MCP tests
```

## Documentation

- [Trusted host integration](docs/trusted-host-integration.md)
- [Controlled write workflow](docs/controlled-write-workflow.md)

## Status

The core architecture is implemented and covered by unit, integration, and
trust-boundary attack tests. Release preparation still includes public metadata,
license review, clean-clone verification, and the first intentional release tag.
