## The tools a model reaches

The MCP server, `npm run mcp`, offers the free reads.

## The files

- `mcp.ts`, `mcp-server.ts`: the MCP server on stdio, and the tools it
  offers; `test/mcp.test.ts` connects a client to it in memory.

## Ask the pods from Claude Desktop, VS Code or any MCP client

`npm run mcp` is an [MCP](https://modelcontextprotocol.io) server on stdio over
the app's pods. A client starts it; it prints nothing itself. It does not open
an encrypted pod. It offers:

- `list_pods`: the pods' names.
- `find_changes`: what changed in a pod's lab results after a medication
  started or stopped, strongest first, with the numbers; `finding_rows` gives
  the lab rows behind one, `lab_series` one test's results over time and
  `timeline` each medication's start and end. They state what changed, never
  why. Each finding of `find_changes` carries `view`, the address of the trend
  that draws its results; it opens while `npm start` runs, on `PORT` if the
  client has it too, else 3000.
- `worth_a_look`: what the pod's page lists under Worth a look, in its order:
  each line's sentence, its entry's ID and its tag. It states what is flagged
  (an entry that needs review, a report that differs from ClinVar today,
  medications that share an ingredient), never why.
- `ask`: a pod's records by the name of a question (allergies, conditions,
  medications, medication history, lab results, immunizations, procedures,
  genetic variants, the person, where an entry came from), a few rows of the
  many; it never takes a query of your own.

Every tool but `list_pods` takes the pod's name. Ask "find anything interesting
in this pod" or "did anything change after I stopped metformin?" and the client
calls the tools. Restart the client's server after `npm run pod:reset` of a pod
it has shown.

**A hosted client sends what the tools return to its provider.** The pods this
app is made with, and the demo hospitals' patients, are made up. A pod you made
from your own records is yours to decide about: use a model that runs on your
machine, or leave that pod out.

**Claude Desktop.** Open Settings, Developer, Edit Config, and add the server
to `claude_desktop_config.json` (on Windows `%APPDATA%\Claude\`, on macOS
`~/Library/Application Support/Claude/`), with this app's folder in the path
(`args` must use an absolute path, as Claude Desktop starts the server from
another folder; forward slashes work on Windows too), then quit Claude Desktop
and start it again:

```json
{
  "mcpServers": {
    "cascade": {
      "command": "node",
      "args": ["C:/path/to/my-app/mcp.ts"]
    }
  }
}
```

If Claude Desktop cannot find `node`, give the full path to it as `command`.

**VS Code.** In this app's folder, make `.vscode/mcp.json`, then start the
server from the file's Start link or from Chat in Agent mode:

```json
{
  "servers": {
    "cascade": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/mcp.ts"]
    }
  }
}
```
