# Third-Party Notices

`mcp-tool-control` is an independent implementation of controlled MCP tool
execution. It is not affiliated with, endorsed by, or sponsored by Anthropic,
the Linux Foundation, or the Model Context Protocol project.

This file distinguishes independently implemented work from third-party
components and preserves the notices required by upstream licenses.

## Independently implemented

All source code and documentation in this repository were written for this
project. Protocol concepts (tools, transports, JSON-RPC message shapes) are
implemented against the public Model Context Protocol specification. No MCP
specification text or SDK source code is copied or closely adapted in this
repository.

## Runtime dependencies

Distributed as npm dependencies; each remains governed by its own license.

| Package                   | Locked version | License | Copyright                          |
| ------------------------- | -------------- | ------- | ---------------------------------- |
| @modelcontextprotocol/sdk | 1.32.2         | MIT     | Copyright (c) 2024 Anthropic, PBC  |
| zod                       | 4.6.7          | MIT     | Copyright (c) 2025 Colin McDonnell |

Transitive dependencies installed by npm are likewise governed by their own
licenses; see each package's LICENSE file under `node_modules` or on the npm
registry.

Development-only dependencies (TypeScript, Vitest, ESLint, Prettier, tsx) are
used to build and test this project, are not distributed as part of it, and
remain governed by their respective licenses.

## References

- Model Context Protocol specification: <https://modelcontextprotocol.io>
- MCP TypeScript SDK repository:
  <https://github.com/modelcontextprotocol/typescript-sdk>
- MCP TypeScript SDK license (MIT):
  <https://github.com/modelcontextprotocol/typescript-sdk/blob/main/LICENSE.md>
- Zod repository: <https://github.com/colinhacks/zod>
- Zod license (MIT): <https://github.com/colinhacks/zod/blob/main/LICENSE>

## MIT license texts

### @modelcontextprotocol/sdk

MIT License

Copyright (c) 2024 Anthropic, PBC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### zod

MIT License

Copyright (c) 2025 Colin McDonnell

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
