import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { loadHospital, loadStories } from "@the-cascade-protocol/sandbox/node";
import { openPod, type Pod, pullFiles, Refusal } from "cascade-runtime";
import { pulled } from "./hospitals.js";
import { removed } from "./settled.js";

type Api = { close(): Promise<void> };

const { podServer, QUESTIONS, WARNING } = (await import(
  new URL("../../build/app/mcp-server.ts", import.meta.url).href
)) as {
  podServer: (
    api: Api,
    options?: { viewOf(pod: string, trend: object): string },
  ) => { build(): { connect(transport: unknown): Promise<void> } };
  QUESTIONS: string[];
  WARNING: string;
};
const { podApi } = (await import(
  new URL("../../build/app/pod-api.ts", import.meta.url).href
)) as { podApi: (host: object) => Api };
const { nodeHost } = (await import(
  new URL("../../build/app/node-host.ts", import.meta.url).href
)) as {
  nodeHost: (options: { folder: string; opensEncrypted: boolean }) => object;
};
const { trendUrl } = (await import(
  new URL("../../build/app/pods.ts", import.meta.url).href
)) as { trendUrl: (pod: string, trend: object) => string };
type Input = Record<string, unknown>;
interface Tool {
  name: string;
  tier: string;
  opens?: true;
  run(
    api: object,
    input: Input,
    door: {
      open(address: string): Promise<void>;
      address: Record<string, () => string>;
    },
  ): Promise<unknown>;
}
const { NEVER, TOOLS } = (await import(
  new URL("../../build/app/tools.ts", import.meta.url).href
)) as { NEVER: { op: string; with?: string }[]; TOOLS: Tool[] };

const STATIN = "story-statin";
const pods = new Map<string, Pod>();
let api: Api;
let client: Client;

/** A client connected to `podServer(served, options)`, in memory. */
async function clientOf(
  served: Api,
  options?: { viewOf(pod: string, trend: object): string },
) {
  const [toServer, toClient] = InMemoryTransport.createLinkedPair();
  await podServer(served, options).build().connect(toServer);
  const connected = new Client({ name: "test", version: "0.0.0" });
  await connected.connect(toClient);
  return connected;
}

/** What a tool call gave: its text read as JSON, and whether it was a tool error. */
async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content as { type: string; text: string }[];
  assert.equal(first!.type, "text");
  return { error: result.isError === true, text: first!.text };
}

before(async () => {
  const north = await loadHospital("cascade-north");
  const story = (await loadStories()).find(
    ({ patient }) => patient === STATIN,
  )!;
  const { pull } = await pulled(north, story.patient);
  const statin = await openPod();
  const imported = await statin.import(pullFiles(pull, "north"), {
    aboutSubject: true,
  });
  assert.equal(imported.refused, undefined);
  pods.set(STATIN, statin);

  api = podApi({
    pods: {
      names: async () => [...pods.keys()],
      title: async () => undefined,
      open: async (name: string) => pods.get(name)!,
    },
    tables: async () => {
      throw new Error("no tables here");
    },
    opensEncrypted: false,
    unsaid() {},
  });
  client = await clientOf(api, { viewOf: trendUrl });
});

after(async () => {
  await client.close();
  await api.close();
});

test("every tool is free or ask, and its run calls only the PodApi operations it is about, never one the never list holds; open_entry refuses an entry the pod lacks, saying where the IDs are", async () => {
  const pod = "p";
  const runs: Record<string, [Input, string[], string]> = {
    list_pods: [{}, ["pods"], "free"],
    find_changes: [{ pod }, ["tool"], "free"],
    finding_rows: [{ pod, key: "k" }, ["tool"], "free"],
    lab_series: [{ pod, test: "t" }, ["tool"], "free"],
    timeline: [{ pod }, ["tool"], "free"],
    worth_a_look: [{ pod }, ["tool"], "free"],
    ask: [{ pod, question: QUESTIONS[0] }, ["ask"], "free"],
    open_pod: [{ pod }, ["pod"], "free"],
    open_trend: [{ pod, test: "t", medication: "m" }, ["trend"], "free"],
    open_entry: [{ pod, entry: "e" }, ["ask"], "free"],
    open_classes: [{ pod }, ["pod"], "free"],
    open_panel: [{ pod, panel: "24326-1" }, ["pod"], "free"],
    open_table: [{ table: "t" }, ["table"], "free"],
    make_pod: [{ person: "Ann", encrypt: true }, ["makePod"], "ask"],
    check_tables: [{}, ["checkTables"], "ask"],
    set_world_date: [{ date: "2026-01-01" }, ["setWorldDate"], "ask"],
  };
  const answers: Record<string, unknown> = {
    pods: { pods: [{ name: pod }] },
    tool: { value: [], found: [] },
    ask: { rows: [{ entry: "e" }] },
    trend: {
      series: { test: { notation: "t" } },
      timeline: [{ notation: "m", name: "M" }],
    },
  };
  assert.deepEqual(
    NEVER.map(({ op, with: given }) => [op, given]),
    [
      ["makePod", "encrypt"],
      ["waitingWords", undefined],
      ["confirmWords", undefined],
      ["unlock", undefined],
      ["connect", undefined],
      ["bring", undefined],
      ["deleteAll", undefined],
      ["resetAll", undefined],
    ],
  );
  assert.deepEqual(
    TOOLS.map(({ name }) => name).sort(),
    Object.keys(runs).sort(),
  );
  for (const tool of TOOLS) {
    const [input, ops, tier] = runs[tool.name]!;
    assert.equal(tool.tier, tier, tool.name);
    const called: [string, Input][] = [];
    const recording = new Proxy(
      {},
      {
        get:
          (_, op: string) =>
          async (input: Input = {}) => {
            called.push([op, input]);
            return answers[op] ?? {};
          },
      },
    );
    await tool.run(recording, input, {
      open: async () => {},
      address: {
        pod: () => "/",
        trend: () => "/",
        entry: () => "/",
        classes: () => "/",
        panel: () => "/",
        table: () => "/",
      },
    });
    assert.deepEqual(
      called.map(([op]) => op),
      ops,
      tool.name,
    );
    for (const [op, given] of called)
      assert.ok(
        !NEVER.some(
          (never) =>
            never.op === op &&
            (never.with === undefined || given[never.with] !== undefined),
        ),
        `${tool.name} calls ${op} ${JSON.stringify(given)}`,
      );
  }
  const opening = TOOLS.find(({ name }) => name === "open_entry")!;
  await assert.rejects(
    opening.run(
      { ask: async () => answers.ask },
      { pod, entry: "x" },
      {
        open: async () => {},
        address: { pod: () => "/", trend: () => "/", entry: () => "/" },
      },
    ),
    (error) =>
      error instanceof Refusal &&
      /holds no entry x; ask's rows give each entry's ID in their entry column/.test(
        error.message,
      ),
  );
});

test("a client lists the pods and the free reads of the one tool list, each but the list taking the pod's name, and is warned that a hosted client sends the answers to its provider", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map(({ name }) => name).sort(),
    TOOLS.filter(({ tier, opens }) => tier === "free" && opens === undefined)
      .map(({ name }) => name)
      .sort(),
  );
  assert.equal(tools.length, 7);
  for (const { name, inputSchema } of tools)
    assert.equal(
      (inputSchema.required as string[] | undefined)?.includes("pod") ?? false,
      name !== "list_pods",
      name,
    );
  const ask = tools.find(({ name }) => name === "ask")!;
  assert.deepEqual(
    (ask.inputSchema.properties as Record<string, { enum?: string[] }>)
      .question!.enum,
    QUESTIONS,
  );
  assert.ok(client.getInstructions()?.includes(WARNING));
  assert.match(
    client.getInstructions() ?? "",
    /worth_a_look is a good first call/,
  );

  assert.deepEqual(JSON.parse((await call("list_pods", {})).text), [STATIN]);
});

test("each finding of find_changes carries the address of the app's trend page for it", async () => {
  const found = await call("find_changes", { pod: STATIN });
  assert.equal(found.error, false);
  const [finding] = JSON.parse(found.text) as { key: string; view: string }[];
  assert.equal(finding!.key, "start:617310:18262-6");
  const view = new URL(finding!.view);
  assert.match(view.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(
    view.pathname + view.search,
    "/pods/story-statin/trend?test=18262-6&medication=617310",
  );
});

test("input the tool's schema refuses is a tool error that says why, never a crash: a question outside the list, a missing pod, a property it does not take", async () => {
  const refused: [string, Record<string, unknown>, RegExp][] = [
    [
      "ask",
      { pod: STATIN, question: "pod/Which files are out of place" },
      /data\/question must be equal to one of the allowed values/,
    ],
    [
      "ask",
      { pod: STATIN, question: "SELECT * WHERE { ?s ?p ?o }" },
      /data\/question must be equal to one of the allowed values/,
    ],
    ["find_changes", {}, /required property 'pod'/],
    ["timeline", { pod: STATIN, extra: true }, /additional properties/],
  ];
  for (const [name, args, reason] of refused) {
    const { error, text } = await call(name, args);
    assert.ok(error, `${name} ${JSON.stringify(args)}`);
    assert.match(text, reason, `${name} ${JSON.stringify(args)}`);
  }
});

test("an error that is not a refusal is logged and reaches the client as a fixed message, never its own, so a path in it does not leave", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const broken = podApi({
    pods: {
      names: async () => ["broken"],
      title: async () => undefined,
      open: async () => {
        throw new Error("ENOENT: open 'C:/private/path'");
      },
    },
    opensEncrypted: false,
  });
  const other = await clientOf(broken);
  const result = await other.callTool({
    name: "find_changes",
    arguments: { pod: "broken" },
  });
  const [first] = result.content as { text: string }[];
  assert.equal(result.isError, true);
  assert.doesNotMatch(first!.text, /private/);
  assert.equal(logged.mock.callCount(), 1);
  await other.close();
});

test("an encrypted pod is listed, and a tool asked about it says in one line that this server does not open it", async () => {
  const folder = await mkdtemp(join(tmpdir(), "t351-mcp-"));
  const words = "abacus abdomen abide abnormal abrasion abrupt";
  try {
    await (await openPod(join(folder, "sealed"), { secret: words })).close();
    const elsewhere = podApi(nodeHost({ folder, opensEncrypted: false }));
    const sealed = await clientOf(elsewhere);
    try {
      const listed = await sealed.callTool({
        name: "list_pods",
        arguments: {},
      });
      assert.deepEqual(
        JSON.parse((listed.content as { text: string }[])[0]!.text),
        ["sealed"],
      );
      const asked = await sealed.callTool({
        name: "ask",
        arguments: { pod: "sealed", question: QUESTIONS[0] },
      });
      assert.equal(asked.isError, true);
      const [first] = asked.content as { text: string }[];
      assert.match(first!.text, /^sealed is encrypted: open it in the app/);
      assert.equal(first!.text.includes(words), false);
    } finally {
      await sealed.close();
      await elsewhere.close();
    }
  } finally {
    await removed(folder);
  }
});
