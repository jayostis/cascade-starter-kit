import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { replayKit } from "cascade-runtime/fixtures";
import { afterAll, beforeAll, expect, test } from "vitest";
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

test("the server offers the free reads of the tool list, and nothing that moves the app or writes", async () => {
  const names = (await client.listTools()).tools.map(({ name }) => name);
  expect(names).toContain("list_pods");
  expect(names).toContain("find_changes");
  for (const { name, tier, opens } of TOOLS)
    if (tier === "ask" || opens) expect(names).not.toContain(name);
});

test("list_pods answers with the app's pods", async () => {
  const result = await client.callTool({ name: "list_pods", arguments: {} });
  const [first] = result.content as { type: string; text: string }[];
  expect(result.isError).not.toBe(true);
  expect(first?.text).toContain("alex-rivera");
});
