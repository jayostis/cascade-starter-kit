import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { replayKit } from "cascade-runtime/fixtures";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { podServer } from "../mcp-server.ts";
import { nodeHost } from "../node-host.ts";
import { podApi } from "../pod-api.ts";
import { trendUrl } from "../pods.ts";
import { TOOLS } from "../tools.ts";

let folder: string;
let api: ReturnType<typeof podApi>;
let client: Client;

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "mcp-test-"));
  await replayKit("alex-rivera", join(folder, "alex-rivera"), {
    through: "E2",
  });
  api = podApi(nodeHost({ folder, opensEncrypted: false }));
  const [toServer, toClient] = InMemoryTransport.createLinkedPair();
  await podServer(api, { viewOf: trendUrl }).build().connect(toServer);
  client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(toClient);
}, 60_000);

afterAll(async () => {
  await client?.close();
  await api?.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 5 });
});

/**
 * `npm run mcp` serves the pods to an MCP client such as Claude Desktop. The server offers only the tools that read and stay
 * where they are: none of the tier `ask`, none that opens a screen of the app.
 */
describe("Serving the pods to an MCP client · podServer()", () => {
  describe("with a client connected in memory", () => {
    it("offers `list_pods` and `find_changes`", async () => {
      const names = (await client.listTools()).tools.map(({ name }) => name);
      expect(names).toContain("list_pods");
      expect(names).toContain("find_changes");
    });

    it("never offers a tool of the tier ask or one that opens a screen", async () => {
      const names = (await client.listTools()).tools.map(({ name }) => name);
      for (const { name, tier, opens } of TOOLS)
        if (tier === "ask" || opens) expect(names).not.toContain(name);
    });

    it("answers `list_pods` with the app's pods", async () => {
      const result = await client.callTool({
        name: "list_pods",
        arguments: {},
      });
      const [first] = result.content as { type: string; text: string }[];
      expect(result.isError).not.toBe(true);
      expect(first?.text).toContain("alex-rivera");
    });
  });
});
