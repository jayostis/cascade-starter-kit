## The starter

- `npm run mcp` is an MCP server on stdio over every pod, for a client such as
  Claude Desktop to start (the README says how). A hosted client sends what
  the tools return to its provider.

## The MCP server

The MCP add-on is `mcp.ts`, `mcp-server.ts` and `test/mcp.test.ts`. `npm run mcp` runs `mcp.ts`, an MCP server on
stdio over the pods, for Claude Desktop, VS Code or any MCP client (the README says how to add it). It is a door to
the one list: `mcp-server.ts` offers the free reads of `tools.ts`, never a move or a write; all but `worth_a_look` are
`cascade-runtime/tools`' own, run over PodApi. Its host is
`nodeHost({ opensEncrypted: false })`, so it refuses an encrypted pod in one line. `test/mcp.test.ts` connects a client
to it in memory: copy it to test a read you add.
