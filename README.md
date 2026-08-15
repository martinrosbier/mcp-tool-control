# MCP Tool Control

A small TypeScript MCP foundation for exploring controlled tool execution.

The repository currently demonstrates two deliberately limited tools:

- `inspect-text`: a read-only tool that returns bounded metadata without echoing input.
- `plan-changes`: a planner that returns proposed file changes and conflicts without writing to disk.

The project does not claim to be production-ready or sandboxed. The host remains responsible for presenting proposed changes, obtaining approval, and applying them. Server-enforced policy, approval, authorization, and filesystem containment are planned hardening work.

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

Do not expose this server remotely without adding authentication, authorization, rate limits, and transport-specific protections.
