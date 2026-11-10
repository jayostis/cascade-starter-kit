import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
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

/** What a tool call gave through `client`: its text, and whether it was a tool error. */
async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content as { type: string; text: string }[];
  assert.equal(first!.type, "text");
  return { error: result.isError === true, text: first!.text };
}

/** How each tool is run in the table below: its input, the PodApi operations it is for, and its tier. */
const POD = "p";
const RUNS: Record<string, [Input, string[], string]> = {
  list_pods: [{}, ["pods"], "free"],
  find_changes: [{ pod: POD }, ["tool"], "free"],
  finding_rows: [{ pod: POD, key: "k" }, ["tool"], "free"],
  lab_series: [{ pod: POD, test: "t" }, ["tool"], "free"],
  timeline: [{ pod: POD }, ["tool"], "free"],
  worth_a_look: [{ pod: POD }, ["tool"], "free"],
  ask: [{ pod: POD, question: QUESTIONS[0] }, ["ask"], "free"],
  reference_table_checks: [{ pod: POD }, ["tables"], "free"],
  open_pod: [{ pod: POD }, ["pod"], "free"],
  open_trend: [{ pod: POD, test: "t", medication: "m" }, ["trend"], "free"],
  open_entry: [{ pod: POD, entry: "e" }, ["ask"], "free"],
  open_classes: [{ pod: POD }, ["pod"], "free"],
  open_panel: [{ pod: POD, panel: "24326-1" }, ["pod"], "free"],
  open_table: [{ table: "t" }, ["table"], "free"],
  make_pod: [{ person: "Ann", encrypt: true }, ["makePod"], "ask"],
  check_tables: [{}, ["checkTables"], "ask"],
  set_world_date: [{ date: "2026-01-01" }, ["setWorldDate"], "ask"],
};

/** What the recording PodApi answers each operation with. */
const ANSWERS: Record<string, unknown> = {
  pods: { pods: [{ name: POD }] },
  tool: { value: [], found: [] },
  ask: { rows: [{ entry: "e" }] },
  tables: undefined,
  trend: {
    series: { test: { notation: "t" } },
    timeline: [{ notation: "m", name: "M" }],
  },
};

/**
 * The app keeps one list of the tools a model reaches, whichever way it comes in: the chat, WebMCP or the MCP server.
 * Each tool calls PodApi only and has a tier: `free` tools read, `ask` tools write once the person confirms, and the
 * never list names what no tool may call.
 */
describe("Tools a model may call, by consent tier · TOOLS, NEVER", () => {
  describe("TOOLS", () => {
    it("gives each tool its tier, and calls only the PodApi operations the tool is for", async () => {
      assert.deepEqual(
        TOOLS.map(({ name }) => name).sort(),
        Object.keys(RUNS).sort(),
      );
      for (const tool of TOOLS) {
        const [input, ops, tier] = RUNS[tool.name]!;
        assert.equal(tool.tier, tier, tool.name);
        const called: string[] = [];
        const recording = new Proxy(
          {},
          {
            get:
              (_, op: string) =>
              async (_input: Input = {}) => {
                called.push(op);
                return op in ANSWERS ? ANSWERS[op] : {};
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
        assert.deepEqual(called, ops, tool.name);
      }
    });
  });

  describe("NEVER", () => {
    it("lists what no tool calls: an encrypted pod's making, its words (`waitingWords`, `confirmWords`, `unlock`), `connect`, `bring`, `deleteAll` and `resetAll`", () => {
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
    });
  });

  describe("`open_entry`", () => {
    it("throws Refusal for an entry the pod lacks, saying that `ask`'s rows give each entry's ID", async () => {
      const opening = TOOLS.find(({ name }) => name === "open_entry")!;
      await assert.rejects(
        opening.run(
          { ask: async () => ANSWERS.ask },
          { pod: POD, entry: "x" },
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
  });
});

/**
 * The `mcp` add-on is an MCP server on standard input and output over the app's pods, for a client such as Claude Desktop.
 * It offers only the free reads, so a model outside the app can read a pod and can change nothing.
 */
describe("Serving the pods to an MCP client · npm run mcp, podServer()", () => {
  const pods = new Map<string, Pod>();
  let api: Api;
  let client: Client;

  before(async () => {
    const north = await loadHospital("cascade-north");
    const story = (await loadStories()).find(
      ({ patient }) => patient === STATIN,
    )!;
    const { pull } = await pulled(north, story.patient);
    const statin = await openPod();
    const imported = await statin.import(pullFiles(pull, "north"), {
      claimProfiles: true,
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

  describe("given a client connected to `podServer(api)`", () => {
    let tools: Awaited<ReturnType<Client["listTools"]>>["tools"];

    before(async () => {
      ({ tools } = await client.listTools());
    });

    it("offers the `free` tools that open no screen, and no other", () => {
      assert.deepEqual(
        tools.map(({ name }) => name).sort(),
        TOOLS.filter(
          ({ tier, opens }) => tier === "free" && opens === undefined,
        )
          .map(({ name }) => name)
          .sort(),
      );
      assert.ok(tools.length > 0, "the server offers no tool");
    });

    it("requires `pod` of every tool but `list_pods`", () => {
      for (const { name, inputSchema } of tools)
        assert.equal(
          (inputSchema.required as string[] | undefined)?.includes("pod") ??
            false,
          name !== "list_pods",
          name,
        );
    });

    it("offers `ask` the named questions (`QUESTIONS`) and no query of the client's own", () => {
      const ask = tools.find(({ name }) => name === "ask")!;
      assert.deepEqual(
        (ask.inputSchema.properties as Record<string, { enum?: string[] }>)
          .question!.enum,
        QUESTIONS,
      );
    });

    it("warns in its instructions that a hosted client sends the answers to its provider, and names `worth_a_look` as a first call", () => {
      assert.ok(client.getInstructions()?.includes(WARNING));
      assert.match(
        client.getInstructions() ?? "",
        /worth_a_look is a good first call/,
      );
    });

    it("returns the pods' names from `list_pods`", async () => {
      assert.deepEqual(JSON.parse((await call(client, "list_pods", {})).text), [
        STATIN,
      ]);
    });

    it("returns with each finding of `find_changes` the address of the app's trend screen for it", async () => {
      const found = await call(client, "find_changes", { pod: STATIN });
      assert.equal(found.error, false);
      const [finding] = JSON.parse(found.text) as {
        key: string;
        view: string;
      }[];
      assert.equal(finding!.key, "start:617310:18262-6");
      const view = new URL(finding!.view);
      assert.match(view.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
      assert.equal(
        view.pathname + view.search,
        "/pods/story-statin/trend?test=18262-6&medication=617310",
      );
    });
  });

  describe("given input a tool's schema refuses", () => {
    const REFUSED: [string, string, Record<string, unknown>, RegExp][] = [
      [
        "returns a tool error for an `ask` question that is a named question the list leaves out",
        "ask",
        { pod: STATIN, question: "pod/Which files are out of place" },
        /data\/question must be equal to one of the allowed values/,
      ],
      [
        "returns a tool error for an `ask` question that is SPARQL",
        "ask",
        { pod: STATIN, question: "SELECT * WHERE { ?s ?p ?o }" },
        /data\/question must be equal to one of the allowed values/,
      ],
      [
        "returns a tool error for `find_changes` with no `pod`",
        "find_changes",
        {},
        /required property 'pod'/,
      ],
      [
        "returns a tool error for `timeline` with a property it does not take",
        "timeline",
        { pod: STATIN, extra: true },
        /additional properties/,
      ],
    ];

    for (const [title, name, args, reason] of REFUSED)
      it(title, async () => {
        const { error, text } = await call(client, name, args);
        assert.ok(error, `${name} ${JSON.stringify(args)}`);
        assert.match(text, reason, `${name} ${JSON.stringify(args)}`);
      });
  });

  describe("given a pod that fails to open for a reason that is no refusal", () => {
    it("returns a fixed message as the tool error, never the error's own, and logs the error once", async (t) => {
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
      assert.equal(first!.text, "the server failed; its log says why");
      assert.equal(logged.mock.callCount(), 1);
      const [error] = logged.mock.calls[0]!.arguments as [Error];
      assert.match(error.message, /ENOENT/);
      await other.close();
      await broken.close();
    });
  });

  describe("given an encrypted pod", () => {
    const words = "abacus abdomen abide abnormal abrasion abrupt";
    let folder: string;
    let elsewhere: Api;
    let sealed: Client;

    before(async () => {
      folder = await mkdtemp(join(tmpdir(), "t351-mcp-"));
      await (await openPod(join(folder, "sealed"), { secret: words })).close();
      elsewhere = podApi(nodeHost({ folder, opensEncrypted: false }));
      sealed = await clientOf(elsewhere);
    });

    after(async () => {
      await sealed.close();
      await elsewhere.close();
      await removed(folder);
    });

    it("lists the pod", async () => {
      const listed = await call(sealed, "list_pods", {});
      assert.deepEqual(JSON.parse(listed.text), ["sealed"]);
    });

    it("returns a one-line tool error saying this server does not open it, without its words", async () => {
      const asked = await call(sealed, "ask", {
        pod: "sealed",
        question: QUESTIONS[0],
      });
      assert.equal(asked.error, true);
      assert.match(asked.text, /^sealed is encrypted: open it in the app/);
      assert.equal(asked.text.includes(words), false);
    });
  });
});
