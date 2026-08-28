# MCP Tool Control

A small TypeScript MCP foundation for exploring controlled tool execution.

The project is evolving toward an opinionated TypeScript MCP reference implementation with explicit policy, approval, filesystem-containment, safe-error, and audit boundaries around privileged side effects.

The repository currently demonstrates two deliberately limited tools:

- `inspect-text`: a read-only tool that returns bounded metadata without echoing input.
- `plan-changes`: a planner that returns proposed file changes and conflicts without writing to disk.

The project does not claim to be production-ready or sandboxed. The host remains responsible for presenting proposed changes, obtaining approval, and applying them.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run build
npm test
npm start
```

The server uses MCP over stdio. Configure an MCP-compatible host to launch `node` with the absolute path to `dist/server.js`.

## Embedding in a trusted host

Applications that need controlled writes should use `createMcpToolControl()` to
receive the model-facing MCP server and the trusted approval controller as separate
capabilities. See [Trusted host integration](docs/trusted-host-integration.md) for
the complete example and security requirements.

## Security scope

The included tools do not execute commands or call external APIs. `inspect-text` is
read-only, `plan-changes` captures and stores a proposed write set, and
`apply-changes` writes only an unexpired plan approved through the trusted host
controller.

The server currently includes foundational controls for:

- Declaring each tool's access level and approval requirement.
- Rejecting write-tool registrations that do not require approval.
- Denying approval-gated execution when approval is absent.
- Resolving relative filesystem paths beneath an allowed root, including protection against parent traversal and symlink or junction escapes.

These controls are connected into an end-to-end write workflow with immutable
pending plans, exact approval binding, stale-state detection, single-use approval,
contained writes, and structural audit events. Authentication of the approving
human or system remains the embedding host's responsibility.

Do not expose this server remotely without adding authentication, authorization, rate limits, and transport-specific protections.
