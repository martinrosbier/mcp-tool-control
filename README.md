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

## Security scope

The included tools do not execute commands, call external APIs, or write files. `plan-changes` produces data for review; it does not constitute an approval boundary by itself.

The server currently includes foundational controls for:

- Declaring each tool's access level and approval requirement.
- Rejecting write-tool registrations that do not require approval.
- Denying approval-gated execution when approval is absent.
- Resolving relative filesystem paths beneath an allowed root, including protection against parent traversal and symlink or junction escapes.

These controls are not yet connected into an end-to-end write workflow. In particular, the server does not currently expose a write tool, bind approval to a specific proposed change, configure caller authorization, or emit audit records from the tool execution boundary.

Do not expose this server remotely without adding authentication, authorization, rate limits, and transport-specific protections.
