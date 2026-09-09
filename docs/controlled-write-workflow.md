# Controlled write workflow

`mcp-tool-control` separates proposing a side effect, authorizing it, and
executing it. The model-facing MCP connection can propose and request changes,
but it cannot create approval.

```text
MCP/model                     Trusted embedding host
    |                                  |
    | plan-changes                     |
    v                                  |
immutable pending plan                |
    |                                  |
    | plan_id + review details --------> human review
    |                                  |
    |                         approve(plan_id) or deny(plan_id)
    |                                  |
    | apply-changes(plan_id)            |
    v                                  |
verify pending plan and server-owned decision
    |
verify filesystem state
    |
consume approval
    |
stage, revalidate, and replace files
    |
audit outcome
```

For host composition and capability ownership, see
[Trusted host integration](trusted-host-integration.md).

## 1. Planning

The model calls `plan-changes` with a description and proposed files. Each file
contains a workspace-relative path, complete intended contents, and a human-readable
purpose.

Planning does not write files. It:

1. Validates the input schema.
2. Detects display-level conflicts using any `existing_files` supplied by the caller.
3. Resolves every target beneath the trusted `allowedRoot`.
4. Rejects absolute paths, parent traversal, escaping symlinks or junctions,
   duplicate normalized targets, and overlapping targets.
5. Reads the authoritative filesystem state directly from the workspace.
6. Stores the resulting plan in server-owned memory.

Caller-supplied `existing_files` support review output only. They are not trusted as
the security snapshot used during application.

## 2. Plan identity

Every pending plan receives a deterministic SHA-256 identifier:

```text
plan_<64 lowercase hexadecimal characters>
```

The digest covers the ordered normalized writes and their expected filesystem
states. A change to a target path, intended content, or expected pre-write state
therefore produces a different identity.

Descriptions and explanatory purposes do not affect execution identity.

A plan ID is safe to return through MCP because it is only a lookup key. It does
not grant permission to approve or execute the plan.

## 3. Pending state and expiry

The server stores an immutable copy of each plan. The plan includes:

- Normalized target paths.
- Exact intended file contents.
- Expected target state: missing, or an existing regular file's content hash.
- Creation and expiration timestamps.

The default lifetime is ten minutes. Resubmitting an identical active plan returns
the same object without extending its expiration. Expired plans disappear on
lookup.

Pending plans currently live in process memory. Restarting the process invalidates
all pending plans and decisions, which is a fail-closed behavior.

## 4. Trusted approval

Only the separately returned `approvalController` can call:

```ts
approvalController.approve(planId);
approvalController.deny(planId);
```

Neither operation is available through MCP. Additional fields such as
`approvalGranted: true` in an MCP request have no effect.

Approval is bound to the exact immutable pending-plan instance, not merely its
deterministic ID. If an expired plan is recreated with the same ID, the new instance
requires a new decision.

Approval and denial are terminal decisions. Repeating the same decision is
idempotent; attempting to reverse it is rejected.

## 5. Apply request

The model requests execution with only:

```json
{
  "plan_id": "plan_..."
}
```

`apply-changes` independently verifies that:

- The pending plan exists and has not expired.
- The trusted host approved it.
- The decision references the exact current plan instance.
- The approval has not already been consumed.

Model possession of the plan ID is never considered approval.

## 6. Stale-state protection

At planning time, each target is recorded as either:

- Missing; or
- An existing regular file with a SHA-256 hash of its bytes.

Before writing, the server resolves every path beneath `allowedRoot` again and
compares current state with the stored snapshot. Application is rejected if a file
was created, deleted, changed to a non-file target, or has different contents.

All targets are checked again after temporary files have been staged. Immediately
before each individual replacement, the server rechecks that target's containment
and expected state. A change to a later target during an earlier replacement is
therefore checked before that later write proceeds. These stale-state and TOCTOU
mitigations narrow the check-to-use window; a race between the last check and rename
remains possible.

## 7. Approval consumption

After initial validation and before filesystem side effects, execution atomically
changes approval from `approved` to `consumed`.

Only one concurrent application attempt can claim approval. Replay attempts fail,
including retries after successful execution.

Consumption is deliberately fail-closed: if staging or replacement fails after the
claim, approval remains consumed. The host must create and approve a new plan rather
than retrying an operation whose partial effects may be uncertain.

## 8. Safe file replacement

The server stages every planned file, then begins replacement:

1. Resolves the target beneath `allowedRoot`.
2. Creates missing parent directories.
3. Resolves containment again after directory creation.
4. Creates an exclusive temporary file in the destination directory.
5. Writes the intended UTF-8 content and flushes the file.
6. Revalidates all planned target states.
7. For each staged file, rechecks target containment and expected state immediately
   before renaming it onto the target.
8. Removes remaining temporary files on success or failure.

Placing a temporary file in the destination directory allows rename-based
replacement without exposing partially written target contents.

## 9. Errors and audit events

MCP-visible failures use stable codes and generic messages. They do not expose raw
exception messages, rejected paths, submitted contents, or internal tool names.

The embedding host can opt into raw internal errors with `onInternalError`; that
sink is trusted and must protect its output.

Audit events record tool access class, outcome, timing, error class, and approval
transitions. Inputs and outputs are represented by structural dimensions rather
than values. The bundled logger writes to stderr so MCP stdio stdout remains valid.

## Explicit limitations

### Multi-file plans are not transactions

Each individual target uses staged rename replacement, but a plan containing
multiple files is not an all-or-nothing filesystem transaction. If a later target
check or rename fails, earlier files may already have been replaced. Approval
remains consumed.

### Filesystem races cannot be eliminated by path checks alone

Containment and repeated state validation substantially reduce traversal, link, and
stale-write risk. Node's path-based filesystem APIs do not provide a portable
directory-handle transaction spanning multiple targets, so a privileged local actor
that races directory changes may still create a check-to-use risk. Do not treat this
library as an operating-system sandbox against hostile local users.

### Host authorization is outside this package

The embedding host decides how humans authenticate, how plans are displayed, and
how approval access is controlled. This package supplies the capability boundary;
it does not expose a generic network approval API.

### Durability is intentionally absent

Plans, decisions, and consumed state are in memory. Deployments requiring restart
survival, distributed coordination, or crash recovery need a trusted durable store
with equivalent immutability, expiry, and single-consumer semantics.
