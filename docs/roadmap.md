# Development Roadmap

This roadmap tracks development of `mcp-tool-control`, from the initial TypeScript
foundation through the first release and a deliberately narrow post-release scope.
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

**Status: implementation and documentation complete. Hosted CI was later
removed by release decision; `npm run check` is the canonical validation task.**

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

**Status: complete.** Steps 1–7 are implemented. Steps 8 and 9 were reviewed
and require no additional change at this time.

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
   - Commits: `1308d24`.
5. **Assess conflict previews.**
   - Review confirmed that shared headers and long lines could hide meaningful changes.
   - Implemented: bounded before/after excerpts around the first difference, its
     line and column, and an omission flag. Whitespace changes and empty files are explicit.
   - Tests cover multiline edits, long lines, output bounds, insertion/deletion,
     empty files, line endings, and preservation of executable plan identity.
6. **Remove unused security utilities where justified.**
   - Confirm prompt/filtering helpers have no runtime or intended public API role.
   - Remove obsolete helpers and their dedicated tests together where justified.
   - Reviewed and removed the unreferenced prompt and text-security helpers with
     their dedicated tests.
7. **Complete adversarial failure coverage.**
   - Verify replay after consumed-approval failures and partial multi-file execution.
   - Cover resource limits, audit failures, and replacement-time races.
   - Evaluate demonstrated properties rather than test count.
   - Added coverage for replacement failure after an earlier file was applied,
     temporary-file cleanup, consumed approval, and replay denial.
8. **Assess error categories for recovery.**
   - Keep the existing safe-error mechanism.
   - Add plan/approval distinctions only where callers need them to recover.
   - Reviewed the existing categories; no additional distinction is needed because
     callers already receive actionable stale, capacity, target, and authorization
     outcomes without exposing plan state.
9. **Validate the host approval workflow.**
   - Confirm the host can review the exact plan it authorizes.
   - Add a minimal runnable example only if existing documentation and integration
     tests leave a concrete usability gap.
   - Reviewed the trusted-host guide and end-to-end integration tests; they cover
     the actual runtime API and approval lifecycle, so no additional example is
     necessary.

Each necessary change should have one coherent purpose and directly relevant
tests. Keep typechecking, tests, and build passing. Amend affected documentation
as part of the relevant change rather than as a separate development phase.

## Phase 8 — Release Preparation

**Status: complete.**

1. **Verify from a clean checkout.**
   - Run `npm ci` and `npm run check`, plus configured repository checks.
   - Distinguish clean-checkout results from checks using an existing installation.
2. **Record validation evidence.**
   - Hosted CI was removed by decision; `npm run check` is the canonical,
     provider-independent validation task and is run manually.
   - State tested platforms accurately; an existing-installation run is not
     clean-checkout evidence until repeated from a fresh clone or worktree.
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

## Phase 9 — Standalone Usability (v1.1)

**Status: complete (v1.1.0).**

1. **Runnable npm binary.**
   - Ship a `bin` entry and executable shebang so MCP clients can launch the
     stdio server with `npx -y mcp-tool-control`.
2. **Client configuration examples.**
   - Document copy-paste configuration for common MCP clients.
   - The launcher's working directory remains the allowed workspace root.
3. **Preserve fail-closed writes.**
   - The standalone server still provides no path for an MCP caller to approve
     or apply a write plan.

## Phase 10 — Trusted-Host Reference Implementation

**Status: implemented (v1.2.0).** The `mcp-tool-control-host` binary is a
minimal terminal-based trusted host that:

- Receives a change plan and displays the proposed writes.
- Obtains explicit human approval through the trusted approval controller.
- Applies only the exact approved plan instance.
- Preserves every existing security invariant.

This is the preferred answer to standalone write usability. An ungated
direct-write mode remains rejected: ordinary MCP input must never bypass the
trusted approval boundary.

## Phase 11 — Integration Compatibility

**Status: implemented (v1.3.0).** The runtime returns a host-side `hostTools`
capability: a policy-aware tool catalog plus in-process execution through the
same validation, authorization, and audit path as MCP calls. Further additions
stay needs-driven.

Discovery of external MCP servers, tool routing, remote connection lifecycle,
and multi-server reliability are control-plane concerns and remain outside this
project's scope.

## Phase 12 — Maintenance

**Status: ongoing.**

- Security corrections and compatibility updates.
- Regression testing and documentation improvements.
- `npm run check` remains the canonical validation command.

Earlier roadmap drafts assigned external MCP server discovery, cross-server
policy and approval, remote transport hardening, and multi-server reliability
to this project. Those requirements were reviewed and reassigned out of this
library's scope; they belong to a separate control-plane layer. This note
preserves the record of that decision.

## Current Status

- Reviewed source baseline: `05d539b` (`docs: finalize README`).
- Phases 1–6 establish the implemented architecture and reuse foundation.
- Phase 7 security and reliability hardening is complete.
- Phase 8 release preparation is complete: dependencies were upgraded (MCP SDK
  1.32.2, Zod 4.6.7) with a zero-vulnerability audit, Apache-2.0 licensing and
  third-party attribution are in place, repository metadata points at the
  GitHub remote, hosted CI was removed in favor of canonical local validation,
  clean-checkout verification passed, and the `v1.0.0` tag, GitHub release, and
  npm package (`mcp-tool-control@1.0.0`) are published.
- Phase 9 (standalone usability) shipped in v1.1.0 and Phase 10 (terminal
  trusted-host reference) in v1.2.0; both releases are published on npm and
  GitHub.
- Post-release scope is deliberately narrow: standalone usability (Phase 9),
  a proposed trusted-host reference implementation (Phase 10), minimal
  integration compatibility (Phase 11), and ongoing maintenance (Phase 12).
  Discovery, routing, remote server lifecycle, and multi-server reliability
  are out of scope for this library.
- Clean-checkout validation on October 24, 2026 (Windows, Node 22.15.0,
  npm 10.9.2, commit `9e7b65e`, fresh `npm ci` in an isolated git worktree):
  formatting, lint, typechecking, 139 tests across 19 files, build, and a
  zero-vulnerability production dependency audit passed.

## First Release Criteria

Complete Phases 1–8 when trusted approval is usable and isolated from MCP, approvals are bound
to exact instances and cannot be replayed, filesystem checks and their limits are
tested, retained state is bounded, audit failures preserve operation semantics,
and release verification passes.

## Scope and Stopping Rule

Keep `mcp-tool-control` a small, understandable MCP control layer. Its scope covers
tool policy, trusted approval, controlled execution, filesystem checks, and audit
boundaries. Discovery, gateway routing, and remote or multi-server coordination
are out of scope for this library.

Stop adding features when the selected phases meet their requirements and tests.
Future phases are separate development decisions, not unfinished first-release work.

Chat orchestration, model-provider gateways, generic agent runtimes and memory,
PII and moderation systems, non-MCP API/database/shell orchestration, generic
capability recommendation, and UI frameworks belong in a separate project.
Custom OAuth providers, REST approval services, databases, queues, cloud
infrastructure, and generic policy languages are not part of this roadmap. MCP
server discovery, gateway routing, and multi-server reliability belong to a
separate control-plane project, not to this library.
