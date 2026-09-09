# Development Roadmap

This roadmap tracks development of `mcp-tool-control`, from the initial TypeScript
foundation through the first release and optional support for external MCP servers.
Completed milestones and remaining release work are based on the implementation
review at commit `05d539b`. Future phases describe proposed work, not implemented
capabilities or requirements for the first release.

Phases group related work by purpose. Commit references provide evidence for
completed steps; the numbering does not represent release versions or an exact
commit chronology.

The project is a small, reusable reference implementation of controlled MCP side
effects. Its central workflow is:

```text
model proposes changes
    -> server stores immutable, expiring intent
    -> trusted host approves the exact plan instance
    -> model requests execution
    -> server validates and consumes approval
    -> server stages, revalidates, and applies writes
    -> server audits the outcome
```

## Phase 1 — Project Setup and Scope

**Status: complete.**

1. **Initialize the TypeScript project.**
   - Establish package configuration, compilation, and development tooling.
   - Commits: `7616fc2`.
2. **Build the initial MCP foundation.**
   - Introduce tool behavior and baseline planning/security tests.
   - Commits: `312fb41`, `b2a9c9f`.
3. **Define the project direction.**
   - Focus on controlled tool execution and explicit side-effect boundaries.
   - Commits: `e15d33c`, `0263f22`.
4. **Configure version control and ignore rules.**
   - Integrate GitLab history and ignore the npm cache.
   - Commits: `f5b2882`, `1ce477b`.

## Phase 2 — Tool Architecture and Path Validation

**Status: complete for the core implementation; further hardening is in Phase 7.**

1. **Centralize tool execution.**
   - Route tool definitions and execution through the shared registry.
   - Commits: `95031f3`.
2. **Introduce explicit tool policies.**
   - Classify tools as `read`, `plan`, or `write`.
   - Require an authorization function for approval-gated tools.
   - Commits: `2234189`.
3. **Contain filesystem paths.**
   - Resolve targets against a trusted root and reject escaping paths.
   - Commits: `3d8e3b1`.
4. **Align the documented security scope with implementation.**
   - Record what the controls actually provide.
   - Commits: `c43f800`.
5. **Integrate planning into the tool contract.**
   - Register `plan-changes` as a complete tool.
   - Commits: `e70f780`.

## Phase 3 — Change Planning and Authorization

**Status: complete.**

1. **Introduce deterministic plan identifiers.**
   - Generate deterministic identifiers for proposed changes.
   - Commits: `51e0d2d`.
2. **Establish the trusted approval boundary.**
   - Remove request-scoped approval assertions so model input cannot grant approval.
   - Establish a host-owned approval capability outside the MCP-facing surface.
   - Commits: `eb4f386`, `48029cf`, `b5b76e7`.
3. **Store pending plans with expiry.**
   - Retain immutable intent in server-owned memory.
   - Commits: `3cd8aed`.
4. **Bind approval to the exact stored instance.**
   - Prevent a recreated plan from inheriting an earlier instance's approval.
   - Treat `plan_id` as identity and lookup, never authority.
   - Commits: `f7ec6a0`.
5. **Add approval-gated application.**
   - Require server-owned approval for `apply-changes`.
   - Commits: `c6f1084`.

## Phase 4 — File Execution and Audit Logging

**Status: core implementation complete; remaining correctness work is in Phase 7.**

1. **Capture and verify expected filesystem state.**
   - Detect changes made after planning before applying the proposal.
   - Commits: `214a339`.
2. **Stage and replace files.**
   - Consume approval before filesystem side effects.
   - Stage writes, flush them, revalidate state, and rename staged files into place.
   - Commits: `10560f5`.
3. **Record execution and policy events.**
   - Emit structural audit metadata for tool execution and approval transitions.
   - Keep submitted file contents out of audit summaries.
   - Commits: `444ea76`.

Multi-file application is not transactionally atomic. A later failure can leave
earlier replacements applied. Repeated checks mitigate stale state and filesystem
races; they do not eliminate every check/use window.

## Phase 5 — Host Integration and Security Testing

**Status: implemented, with additional adversarial coverage remaining in Phase 7.**

1. **Expose the embeddable runtime.**
   - Return separate `server` and `approvalController` capabilities.
   - Keep the standalone stdio launcher without a built-in approval interface.
   - Commits: `841f1bd`.
2. **Verify the complete approval workflow.**
   - Test planning, host approval or denial, expiry, application, and consumption.
   - Commits: `f30a2e0`.
3. **Test attacks on the trust boundary.**
   - Cover MCP self-approval attempts, changed content, stale files, symlink escapes,
     parent substitution, recreated expired plans, and concurrent application.
   - Commits: `69928d2`.
4. **Explain trusted-host integration.**
   - Show the actual runtime API and identify the host's responsibilities.
   - Commits: `60eb5b1`.
5. **Standardize safe tool errors.**
   - Return structured categories without raw internal exception messages.
   - Add unit and MCP integration coverage.
   - Commits: `ece8450`.

## Phase 6 — CI and Developer Documentation

**Status: implementation and documentation complete; remote CI success remains to be verified.**

1. **Configure GitLab checks.**
   - Install from the lockfile, typecheck, test, and build.
   - Configure dependency auditing and secret detection.
   - Commits: `d708d01`.
2. **Describe the controlled-write security model.**
   - Explain plan lifecycle, instance binding, consumption, containment, and limits.
   - Commits: `f721d96`.
3. **Document setup and tool extension.**
   - Explain setup, embedding, and how to add read, plan, and write tools.
   - State that policy metadata cannot prove an arbitrary authorizer is correct.
   - Commits: `05d539b`.

## Phase 7 — Security and Reliability Hardening

**Status: in progress.** Steps 1–4 are implemented. Step 7 requires a review of
remaining adversarial coverage. Steps 5, 6, 8, and 9 require review before deciding
whether a change is necessary.

1. **Revalidate targets immediately before replacement.**
   - Implemented: recheck each target's containment and expected state before rename.
   - Regression tests cover changes after staging, changes between replacements,
     newly created targets, parent substitution, and consumed-approval replay.
   - A race between the final check and rename remains possible.
   - Commits: `cea1d1c`.
2. **Bound retained plans and approval records.**
   - Implemented: configurable count and payload limits, with expiry cleanup before
     insertion and rejection at capacity without active-plan eviction.
   - Approval decisions use weak references keyed by the exact plan instance.
   - Tests cover repeated distinct requests, byte limits, expiry cleanup, active
     approvals, recreated instances, and concurrent MCP planning.
   - Commits: `e3d93b1`.
3. **Isolate audit failures from operation results.**
   - Implemented: best-effort delivery isolates sink throws and promise rejections
     from tool results and approval transitions.
   - Tests cover successful writes, policy denials, original tool errors, approval
     consumption, replay, late rejections, and fallback logging failures.
   - Commits: `1169201`.
4. **Make target case-sensitivity semantics explicit.**
   - Implemented: compare normalized paths using lowercase keys for duplicates
     and file/child overlaps on every platform, preserving spelling for writes.
   - Tests cover case variants, normalized duplicates, reversed overlaps, distinct
     path segments, safe MCP errors, and unchanged write destinations.
   - The conservative lexical policy does not detect filesystem capabilities or
     model every filesystem-specific Unicode equivalence.
5. **Assess conflict previews.**
   - Current previews show only the first line, truncated after 200 characters
     with an ellipsis when needed.
   - Improve them only if that materially improves approval decisions.
6. **Remove unused security utilities where justified.**
   - Confirm prompt/filtering helpers have no runtime or intended public API role.
   - Remove obsolete helpers and their dedicated tests together where justified.
7. **Complete adversarial failure coverage.**
   - Verify replay after consumed-approval failures and partial multi-file execution.
   - Cover resource limits, audit failures, and replacement-time races.
   - Evaluate demonstrated properties rather than test count.
8. **Assess error categories for recovery.**
   - Keep the existing safe-error mechanism.
   - Add plan/approval distinctions only where callers need them to recover.
9. **Validate the host approval workflow.**
   - Confirm the host can review the exact plan it authorizes.
   - Add a minimal runnable example only if existing documentation and integration
     tests leave a concrete usability gap.

Each necessary change should have one coherent purpose and directly relevant
tests. Keep typechecking, tests, and build passing. Amend affected documentation
as part of the relevant change rather than as a separate development phase.

## Phase 8 — Release Preparation

**Status: pending.**

1. **Verify from a clean checkout.**
   - Run `npm ci` and `npm run check`, plus configured repository checks.
   - Distinguish clean-checkout results from checks using an existing installation.
2. **Confirm CI results and platform coverage.**
   - Verify the actual GitLab pipeline, including security jobs.
   - State tested platforms accurately; configuration alone is not passing evidence.
3. **Finalize repository metadata and licensing.**
   - Review tracked artifacts, stale references, links, and machine-specific paths.
   - Resolve the README repository URL placeholder and license choice.
   - Verify version, Node requirements, and intended distribution, including whether
     `private: true` should remain.
4. **Review the public API.**
   - Keep exports focused on runtime construction and intended host integration.
   - Avoid exposing plan-store or filesystem internals without a concrete need.
5. **Tag the first release.**
   - Tag and publish through the chosen distribution process once verification passes.
   - Do not assume npm publication is required for a reusable reference repository.

## Phase 9 — External MCP Server Discovery

**Status: future / optional.** Begins after Phase 8 if external server support is
needed. The first release does not depend on this phase.

1. **Connect to configured MCP servers.**
   - Let the trusted host configure server connections and identities.
   - Enumerate advertised tools and their relevant metadata.
2. **Normalize discovered tool metadata.**
   - Represent tools consistently within the host.
   - Preserve the source server and original tool identity.
3. **Resolve tool name collisions.**
   - Distinguish tools with the same name across servers.
   - Reject ambiguous references before invocation.
4. **Refresh discovery after reconnects.**
   - Detect added, removed, or changed tools.
   - Invalidate outdated discovery results.
5. **Keep discovery separate from authorization.**
   - Treat advertised tools and metadata as information to evaluate.
   - Discovery alone grants neither exposure to callers nor execution authority.

Discovery is limited to MCP tools. Model-based recommendations, provider-specific
tool routing, and catalogs of unrelated APIs, databases, or shell commands remain
outside the project scope.

## Phase 10 — Policy and Approval Across MCP Servers

**Status: future / optional.** Depends on external server discovery.

1. **Assign host-owned tool policies.**
   - Apply `read`, `plan`, and `write` classifications where appropriate.
   - Keep policy decisions under trusted host control; remote declarations alone
     do not establish trust.
2. **Control which tools callers can access.**
   - Expose only tools permitted by host policy.
   - Evaluate policy against both server identity and tool identity.
3. **Require approval for configured privileged operations.**
   - Bind trusted approval to the intended server, tool, and invocation arguments.
   - Preserve approval consumption and replay protection at the local boundary.
4. **Preserve tool origin throughout execution.**
   - Carry server and tool identity into authorization and audit events.
   - Prevent name collisions or changed discovery metadata from selecting a
     different operation under an existing authorization.
5. **Define the remote execution trust boundary.**
   - Make the host responsible for server trust, tool exposure, and policy.
   - Distinguish local permission to invoke a tool from guarantees about how the
     remote server performs its side effects.
   - Do not extend local filesystem containment or stale-state guarantees to
     arbitrary remote tools without corresponding enforcement.

## Phase 11 — MCP Transport and Remote Server Hardening

**Status: future / optional.** Covers individual remote connections and invocations.

1. **Manage connection and session lifecycle.**
   - Define connection, disconnection, and reconnect behavior.
   - Isolate sessions where applicable and make authentication requirements explicit.
2. **Handle timeouts and cancellation.**
   - Bound invocation duration and propagate cancellation where supported.
   - Treat interrupted calls as potentially unresolved; cancellation does not prove
     that a remote side effect was prevented.
3. **Validate remote responses.**
   - Handle malformed protocol messages and unexpected response data.
   - Normalize remote failures into safe, useful error categories.
4. **Handle unavailable servers and tools.**
   - Report connection failures and tools removed between discovery and invocation.
   - Preserve server and tool identity when reporting failures to trusted diagnostics.
5. **Bound remote resource use.**
   - Introduce connection, response, and concurrency limits where justified.
   - Test failure paths and resource cleanup.

Use the official MCP SDK's transport and authentication facilities where suitable.
A custom OAuth provider or a generic remote-agent protocol is outside this phase.

## Phase 12 — Multi-Server Reliability

**Status: future / optional.** Builds on connection hardening to coordinate tool
availability and execution across multiple servers.

1. **Track server health and tool availability.**
   - Refresh capabilities as servers reconnect or become unavailable.
   - Invalidate stale entries without mixing tools from different servers.
2. **Maintain tool identity across connection changes.**
   - Preserve explicit handling of duplicate names and changed capabilities.
   - Require policy reevaluation when relevant server or tool metadata changes.
3. **Coordinate invocation failures.**
   - Handle unavailable tools, timeouts, and cancellation consistently across servers.
   - Keep failures attributable to the originating server and invocation.
4. **Retry only when execution semantics permit it.**
   - Require evidence that retry is safe, such as known execution state or an
     applicable idempotency guarantee.
   - Never retry a privileged or mutating operation solely because its transport
     failed; the operation may already have completed.
5. **Correlate audit events across servers.**
   - Link discovery changes, policy decisions, and invocation outcomes using
     structural identifiers.
   - Preserve audit failure isolation and avoid recording sensitive payloads.

## Current Status

- Reviewed source baseline: `05d539b` (`docs: finalize README`).
- Phases 1–6 establish the implemented architecture and reuse foundation.
- Phase 7 is in progress: replacement checks, storage limits, audit failure
  isolation, and target collision policy are implemented. Conflict preview review
  is next; a code change is conditional on a concrete review-quality gap.
- Phase 8 completes verification and release.
- Phases 9–12 are optional future MCP integration work and do not block release.
- Local validation on September 8, 2026: 162 tests across 20 files, typechecking,
  and build passed. Remote CI and clean-checkout validation were not verified.

## First Release Criteria

Complete Phases 1–8 when trusted approval is usable and isolated from MCP, approvals are bound
to exact instances and cannot be replayed, filesystem checks and their limits are
tested, retained state is bounded, audit failures preserve operation semantics,
and release verification passes.

## Scope and Stopping Rule

Keep `mcp-tool-control` a small, understandable MCP control layer. Its scope covers
tool policy, trusted approval, controlled execution, filesystem checks, and audit
boundaries, with discovery and remote server coordination as optional extensions.

Stop adding features when the selected phases meet their requirements and tests.
Future phases are separate development decisions, not unfinished first-release work.

Chat orchestration, model-provider gateways, generic agent runtimes and memory,
PII and moderation systems, non-MCP API/database/shell orchestration, generic
capability recommendation, and UI frameworks belong in a separate project.
Custom OAuth providers, REST approval services, databases, queues, cloud
infrastructure, and generic policy languages are not part of this roadmap.
