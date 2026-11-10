import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it, mock } from "node:test";
import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import { getRequestListener } from "@hono/node-server";
import { loadHospital, loadStories } from "@the-cascade-protocol/sandbox/node";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { openPod, type Pod, pullFiles, timelineIn } from "cascade-runtime";
import { withPod } from "cascade-runtime/tools";
import { pulled } from "./hospitals.js";

type Chunk = { type: string; [key: string]: unknown };
type Model = {
  provider: string;
  name: string;
  local: boolean;
  language(): unknown;
  failure(error: unknown): string | undefined;
};
type Routes = {
  request(path: string, init?: RequestInit): Promise<Response>;
  fetch(request: Request): Promise<Response>;
};
type Offered = Record<
  string,
  { execute?: unknown; inputSchema: { jsonSchema: unknown } }
>;

const { chatRoutes, chatTools, EXPLAIN_THE_THING, MAX_ROUNDS } = (await import(
  new URL("../../build/app/server/chat.ts", import.meta.url).href
)) as {
  chatRoutes: (options: { api: unknown; model: Model | undefined }) => Routes;
  chatTools: (api: unknown) => Offered;
  EXPLAIN_THE_THING: string;
  MAX_ROUNDS: number;
};
const { modelOf } = (await import(
  new URL("../../build/app/models.ts", import.meta.url).href
)) as {
  modelOf: (settings: {
    provider: string;
    url: string;
    name: string;
    key: string;
  }) => Model;
};
type Sent = { id: string; role: string; parts: Chunk[] };
const { sent } = (await import(
  new URL("../../build/app/src/chat/chats.ts", import.meta.url).href
)) as { sent: (messages: Sent[], budget: number) => Sent[] };
type Api = {
  said(input: object): Promise<Record<string, unknown>>;
  tool(input: object): Promise<{ found: { key: string }[] }>;
  close(): Promise<void>;
};
const { maps, podApi } = (await import(
  new URL("../../build/app/pod-api.ts", import.meta.url).href
)) as {
  maps: (output: object) => { about: Map<string, unknown> };
  podApi: (host: object) => Api;
};
type Schema = { properties?: Record<string, unknown> };
const { NEVER, TOOLS } = (await import(
  new URL("../../build/app/tools.ts", import.meta.url).href
)) as {
  NEVER: { op: string; with?: string }[];
  TOOLS: {
    name: string;
    tier: string;
    ofPod?: true;
    opens?: true;
    inputSchema: Schema;
  }[];
};
const { changeSaid, entryId, HISTORY } = (await import(
  new URL("../../build/app/said.ts", import.meta.url).href
)) as {
  changeSaid: (finding: unknown, about: Map<string, unknown>) => string;
  entryId: (entry: string) => string;
  HISTORY: string;
};

const STATIN = "story-statin";
/** What the tables call atorvastatin, which no record of the pod calls it. */
const TABLES_NAME = "the tables' atorvastatin";
const KEY = "sk-test-key-that-must-not-leave";
const pods = new Map<string, Pod>();
let api: Api;
let made: Promise<Api> | undefined;

/** A PodApi over the statin story's pod, built once for the file by whichever capability asks first. */
function apiOverStatin(): Promise<Api> {
  made ??= (async () => {
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
    const atorvastatin = timelineIn(await statin.ask(HISTORY)).find(
      ({ notation }) => notation === "617310",
    )!.code;
    return podApi({
      pods: {
        names: async () => [...pods.keys()],
        title: async () => undefined,
        open: async (name: string) => pods.get(name)!,
      },
      tables: async () => ({
        held: async () => [],
        about: async (codes: string[]) =>
          new Map(
            codes
              .filter((code) => code === atorvastatin)
              .map((code) => [
                code,
                { name: { label: TABLES_NAME, altLabels: [] } },
              ]),
          ),
      }),
      opensEncrypted: true,
      unsaid() {},
    });
  })();
  return made;
}

after(async () => {
  await (await made)?.close();
});

const USAGE = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const finish = (
  unified: "stop" | "tool-calls" | "content-filter",
): LanguageModelV4StreamPart => ({
  type: "finish",
  usage: USAGE,
  finishReason: { unified, raw: undefined },
});
const call = (
  id: string,
  name: string,
  input: unknown,
  providerMetadata?: Record<string, Record<string, string>>,
): LanguageModelV4StreamPart => ({
  type: "tool-call",
  toolCallId: id,
  toolName: name,
  input: typeof input === "string" ? input : JSON.stringify(input),
  ...(providerMetadata === undefined ? {} : { providerMetadata }),
});
const calling = (...calls: LanguageModelV4StreamPart[]) => [
  ...calls,
  finish("tool-calls"),
];
const reply = (text: string): LanguageModelV4StreamPart[] => [
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: text },
  { type: "text-end", id: "t" },
  finish("stop"),
];

const streamOf = (parts: LanguageModelV4StreamPart[]) =>
  new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });

/** A model of `turns`, one per call, the AI SDK's mock in place of a provider; `calls` is what each call was given. */
function fakeModel(
  turns: LanguageModelV4StreamPart[][],
  doStream?: (options: LanguageModelV4CallOptions) => Promise<{
    stream: ReadableStream<LanguageModelV4StreamPart>;
  }>,
) {
  const calls: LanguageModelV4CallOptions[] = [];
  const mock = new MockLanguageModelV4({
    doStream:
      doStream ??
      (async (options) => {
        calls.push(options);
        const parts = turns[calls.length - 1];
        assert.ok(parts, `no turn ${calls.length} was scripted`);
        return { stream: streamOf(parts) };
      }),
  });
  const model: Model = {
    provider: "fake",
    name: "fake-1",
    local: true,
    language: () => mock,
    failure: (error) =>
      APICallError.isInstance(error) ? error.message : undefined,
  };
  return { model, calls };
}

const user = (text: string, id = "u1") => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});
const said = (text: string) => ({ messages: [user(text)] });

const post = (routes: Routes, body: unknown, signal?: AbortSignal) =>
  routes.request("/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...(signal === undefined ? {} : { signal }),
  });

/** The chunks of a UI message stream. */
const chunksOf = async (response: Response): Promise<Chunk[]> =>
  (await response.text())
    .split("\n\n")
    .map((event) => event.trim())
    .filter((event) => event.startsWith("data: ") && event !== "data: [DONE]")
    .map((event) => JSON.parse(event.slice("data: ".length)) as Chunk);

async function chat(model: Model, body: Record<string, unknown>) {
  const response = await post(chatRoutes({ api, model }), {
    pod: STATIN,
    page: `/pods/${STATIN}/`,
    ...body,
  });
  assert.equal(response.status, 200);
  return chunksOf(response);
}

const KINDS = new Set([
  "start",
  "tool-input-available",
  "tool-input-error",
  "tool-output-available",
  "tool-output-error",
  "text-delta",
  "data-refused",
  "error",
  "finish",
]);
const kinds = (chunks: Chunk[]) =>
  chunks.map(({ type }) => type).filter((type) => KINDS.has(type));
const ofType = (chunks: Chunk[], type: string) =>
  chunks.filter((chunk) => chunk.type === type);
const systemOf = (options: LanguageModelV4CallOptions) =>
  options.prompt
    .filter(({ role }) => role === "system")
    .map(({ content }) => content as string)
    .join("\n");

/** An OpenAI-compatible model on loopback that lists the pods, and answers "Done." once it has their names. */
async function stubModel() {
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const { messages } = JSON.parse(Buffer.concat(chunks).toString()) as {
        messages: { role: string }[];
      };
      const send = (delta: object, finished: string | null = null) =>
        response.write(
          `data: ${JSON.stringify({ id: "stub", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finished }] })}\n\n`,
        );
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (messages.at(-1)!.role === "tool") {
        send({ content: "Done." });
        send({}, "stop");
      } else {
        send({
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              type: "function",
              function: { name: "list_pods", arguments: "{}" },
            },
          ],
        });
        send({}, "tool_calls");
      }
      response.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    close: () => new Promise((done) => server.close(done)),
  };
}

/** The kinds of a stream's chunks between its start and its finish. */
const between = (chunks: Chunk[]) =>
  kinds(chunks).filter((kind) => kind !== "start" && kind !== "finish");

/**
 * The chat add-on's route takes the page's messages, lets the model read the pod through the app's tools, and streams
 * its answer as the AI SDK's UI message stream. The model's key and address stay on the server, and a failure reaches
 * the person as a plain sentence.
 */
describe("Answering a person's question with a model · POST /chat, GET /chat, chatRoutes()", () => {
  before(async () => {
    api = await apiOverStatin();
  });

  describe("given a question the model answers by calling `find_changes`", () => {
    const signed = { google: { thoughtSignature: "sig" } };
    const PAGE = `/pods/${STATIN}/trend`;
    let chunks: Chunk[];
    let calls: LanguageModelV4CallOptions[];
    let finding: {
      key: string;
      said: string;
      view: string;
      before: { count: number };
      after: { count: number };
      rows: { entry: string; value: string; side: string }[];
    };

    before(async () => {
      const fake = fakeModel([
        calling(call("c1", "find_changes", { pod: STATIN }, signed)),
        reply("LDL was lower after the statin started."),
      ]);
      calls = fake.calls;
      chunks = await chat(fake.model, {
        ...said("find anything interesting"),
        page: PAGE,
      });
      finding = (
        ofType(chunks, "tool-output-available")[0]!.output as (typeof finding)[]
      )[0]!;
    });

    it("streams the tool's call, its result and the answer, in that order", () => {
      assert.deepEqual(kinds(chunks), [
        "start",
        "tool-input-available",
        "tool-output-available",
        "text-delta",
        "finish",
      ]);
    });

    it("returns to the page each finding with its sentence, the address of its trend screen and the rows behind it", async () => {
      assert.equal(finding.key, "start:617310:18262-6");
      assert.match(finding.said, /^LDL.* was lower after .* was prescribed\.$/);
      assert.equal(
        finding.view,
        `/pods/${STATIN}/trend?test=18262-6&medication=617310`,
      );
      assert.equal(
        finding.rows.length,
        finding.before.count + finding.after.count,
      );
      const lab = await pods.get(STATIN)!.ask("pod/My lab results");
      const entries = new Set(lab.map((row) => entryId(row.entry!)));
      for (const row of finding.rows)
        assert.ok(entries.has(row.entry), row.entry);
    });

    it("returns to the model the finding without its rows", () => {
      const toolMessage = calls[1]!.prompt.at(-1)!;
      assert.equal(toolMessage.role, "tool");
      const toModel = JSON.stringify(toolMessage.content);
      assert.ok(toModel.includes(finding.key));
      assert.ok(!toModel.includes('"rows"'));
    });

    it("says each finding in the sentence the app's own screen says, naming the medication as the reference tables do", async () => {
      const { found: pageFindings } = await api.tool({
        pod: STATIN,
        tool: "find_changes",
        input: {},
      });
      const [whole] = pageFindings;
      const names = maps(await api.said({ pod: STATIN })).about;
      const { model } = fakeModel([
        calling(call("c1", "find_changes", { pod: STATIN })),
        reply("Done."),
      ]);
      const [found] = ofType(
        await chat(model, said("find anything")),
        "tool-output-available",
      );
      const same = (found!.output as { said: string; key: string }[]).find(
        ({ key }) => key === whole!.key,
      );
      assert.ok(
        same!.said.endsWith(`after ${TABLES_NAME} was prescribed.`),
        same!.said,
      );
      assert.equal(same!.said, changeSaid(whole, names));
    });

    it("names the pod and the address on screen in the model's instructions", () => {
      const system = systemOf(calls[0]!);
      assert.ok(system.includes(STATIN));
      assert.ok(system.includes(`The page on screen is ${PAGE}.`));
    });

    it("sends the person's question as the only other message", () => {
      assert.deepEqual(
        calls[0]!.prompt
          .filter(({ role }) => role !== "system")
          .map((message) => [
            message.role,
            JSON.stringify(message.content).includes(
              "find anything interesting",
            ),
          ]),
        [["user", true]],
      );
    });

    it("sends the model's tool call back with what the provider attached to it", () => {
      const asked = calls[1]!.prompt.at(-2)!;
      assert.equal(asked.role, "assistant");
      const [asking] = asked.content as { providerOptions?: unknown }[];
      assert.deepEqual(asking!.providerOptions, signed);
    });
  });

  describe('given a chat begun from an "Ask about this" button (`context`)', () => {
    const context = { kind: "finding", key: "start:617310:18262-6" };
    let asked: string;
    let plain: string;

    before(async () => {
      const { model, calls } = fakeModel([reply("Done."), reply("Done.")]);
      await chat(model, { ...said("tell me about this"), context });
      await chat(model, said("tell me about this"));
      [asked, plain] = calls.map(systemOf) as [string, string];
    });

    it("tells the model what was asked about, and to explain the thing and never the person", () => {
      assert.ok(asked.includes(JSON.stringify(context)));
      assert.ok(asked.includes(EXPLAIN_THE_THING));
    });

    it("tells a chat with no `context` neither", () => {
      assert.ok(!plain.includes(EXPLAIN_THE_THING));
      assert.doesNotMatch(plain, /asked about this/);
    });
  });

  describe("given a model reached over HTTP", () => {
    let stub: Awaited<ReturnType<typeof stubModel>>;
    let answered: Response;
    let text: string;

    before(async () => {
      stub = await stubModel();
      const routes = chatRoutes({
        api,
        model: modelOf({
          provider: "other",
          url: stub.url,
          name: "stub-1",
          key: KEY,
        }),
      });
      answered = await post(routes, {
        pod: "",
        page: "/",
        ...said("which pods are there?"),
      });
      text = await answered.text();
    });

    after(async () => {
      await stub.close();
    });

    it("answers with the UI message stream: `text/event-stream`, marked `v1`", () => {
      assert.equal(answered.status, 200);
      assert.match(
        answered.headers.get("content-type")!,
        /^text\/event-stream/,
      );
      assert.equal(answered.headers.get("x-vercel-ai-ui-message-stream"), "v1");
    });

    it("streams `list_pods`' result and then the answer", async () => {
      const chunks = await chunksOf(new Response(text));
      assert.deepEqual(kinds(chunks), [
        "start",
        "tool-input-available",
        "tool-output-available",
        "text-delta",
        "finish",
      ]);
      assert.deepEqual(ofType(chunks, "tool-output-available")[0]!.output, [
        STATIN,
      ]);
    });

    it("shows neither the model's key nor its address in the stream", () => {
      assert.equal(text.includes(KEY), false);
      assert.equal(text.includes(new URL(stub.url).host), false);
    });
  });

  describe("when a page asks `GET /chat`", () => {
    it("returns the model's provider, its name and whether it is on this computer, and neither its key nor its address", async () => {
      const address = "127.0.0.1:4321";
      const routes = chatRoutes({
        api,
        model: modelOf({
          provider: "other",
          url: `http://${address}/v1`,
          name: "stub-1",
          key: KEY,
        }),
      });
      const named = await (await routes.request("/chat")).text();
      assert.deepEqual(JSON.parse(named), {
        provider: "other",
        name: "stub-1",
        local: true,
      });
      assert.equal(named.includes(KEY), false);
      assert.equal(named.includes(address), false);
    });

    it("returns `{}` when no model is set", async () => {
      const none = chatRoutes({ api, model: undefined });
      assert.deepEqual(await (await none.request("/chat")).json(), {});
    });
  });

  describe("given no model set", () => {
    it("returns 503 saying to run `npm run model`", async () => {
      const unset = await post(chatRoutes({ api, model: undefined }), {});
      assert.equal(unset.status, 503);
      assert.deepEqual(await unset.json(), {
        error: "No model is set. Run `npm run model`.",
      });
    });
  });

  describe("given a model that declines or fails", () => {
    it("streams a model's refusal as a part of its own, saying that the model declined", async () => {
      const refused = await chat(
        fakeModel([[finish("content-filter")]]).model,
        said("hello"),
      );
      assert.deepEqual(between(refused), ["data-refused"]);
      const [part] = ofType(refused, "data-refused");
      assert.match(String((part!.data as { text: string }).text), /declined/);
    });

    it("streams a model's error after the text it had sent, in the provider's words", async () => {
      const failed = await chat(
        fakeModel([
          [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "Well" },
            {
              type: "error",
              error: new APICallError({
                message: "rate limited",
                url: "http://127.0.0.1:1/v1/chat/completions",
                requestBodyValues: {},
                statusCode: 429,
              }),
            },
          ],
        ]).model,
        said("hello"),
      );
      assert.deepEqual(between(failed), ["text-delta", "error"]);
      assert.equal(ofType(failed, "error")[0]!.errorText, "rate limited");
    });

    it("says a busy provider as `checkCallsTools()` does, without the key", async () => {
      const midStream = fakeModel([
        [
          {
            type: "error",
            error: { message: `Quota ${KEY}`, type: "rate_limit", code: 429 },
          },
        ],
      ]);
      const plain = await chat(
        {
          ...modelOf({
            provider: "gemini",
            url: "http://127.0.0.1:1/v1",
            name: "m",
            key: KEY,
          }),
          language: midStream.model.language,
        },
        said("hello"),
      );
      const [busy] = ofType(plain, "error");
      assert.match(
        String(busy!.errorText),
        /^m is busy at Google Gemini \(429\)/,
      );
      assert.doesNotMatch(JSON.stringify(plain), new RegExp(KEY));
    });
  });

  describe("given an error of the server's own", () => {
    let failed: Chunk[];
    let logged: ReturnType<typeof mock.method>;

    before(async () => {
      logged = mock.method(console, "error", () => {});
      const broken = fakeModel([], async () => {
        throw new Error("ENOENT: open 'C:/private/path'");
      });
      failed = await chat(broken.model, said("hello"));
    });

    after(() => {
      logged.mock.restore();
    });

    it("streams a fixed sentence pointing at the server's log, never the error's own words", () => {
      const [error] = ofType(failed, "error");
      assert.match(String(error!.errorText), /the server's log says why/);
      assert.doesNotMatch(JSON.stringify(failed), /private/);
    });

    it("logs the error", () => {
      assert.ok(logged.mock.callCount() > 0);
    });
  });

  describe("when the request closes before the answer ends", () => {
    it("aborts the call to the model", { timeout: 15_000 }, async () => {
      let aborted!: () => void;
      const sawAbort = new Promise<void>((resolve) => (aborted = resolve));
      const waiting = fakeModel([], async ({ abortSignal }) => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "text-start", id: "t" });
            controller.enqueue({
              type: "text-delta",
              id: "t",
              delta: "Let me",
            });
            abortSignal!.addEventListener("abort", () => aborted(), {
              once: true,
            });
          },
        }),
      }));
      const routes = chatRoutes({ api, model: waiting.model });
      const server = createServer(getRequestListener(routes.fetch));
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const { port } = server.address() as AddressInfo;
      const stop = new AbortController();
      const response = await fetch(`http://127.0.0.1:${port}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pod: STATIN, page: "/", ...said("hello") }),
        signal: stop.signal,
      });
      const reader = response.body!.getReader();
      await reader.read();
      stop.abort();
      await sawAbort;
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    });
  });
});

/**
 * The chat offers the model the app's one list of tools. A free read runs on the server; a tool that opens a screen or
 * needs the person's consent is handed to the page, which runs it or asks first; and a chat stops after `MAX_ROUNDS`
 * rounds of calls, so a model that loops cannot run on.
 */
describe("Letting a model use the app's tools from the chat · chatTools(), MAX_ROUNDS", () => {
  before(async () => {
    api = await apiOverStatin();
  });

  describe("chatTools(api)", () => {
    it("offers every tool of `TOOLS`, in its order", () => {
      assert.deepEqual(
        Object.keys(chatTools(api)),
        TOOLS.map(({ name }) => name),
      );
    });

    it("runs on the server only the `free` tools that open no screen", () => {
      const offered = chatTools(api);
      for (const { name, tier, opens } of TOOLS)
        assert.equal(
          typeof offered[name]!.execute === "function",
          tier === "free" && opens !== true,
          name,
        );
    });

    it("offers no tool an input the never list keeps from tools", () => {
      const kept = NEVER.flatMap(({ with: given }) =>
        given === undefined ? [] : [given],
      );
      assert.ok(kept.length > 0);
      for (const [name, { inputSchema }] of Object.entries(chatTools(api)))
        for (const property of kept)
          assert.ok(
            !Object.hasOwn(
              (inputSchema.jsonSchema as Schema).properties ?? {},
              property,
            ),
            `${name} takes ${property}`,
          );
    });

    it("offers each tool that opens a screen with the schema `TOOLS` gives it, `pod` added for a tool of one pod", async () => {
      const { model, calls } = fakeModel([
        calling(call("c1", "open_pod", { pod: STATIN })),
      ]);
      await chat(model, said("show me"));
      const offered = new Map(
        (calls[0]!.tools ?? []).map((each) => [
          each.name,
          "inputSchema" in each ? each.inputSchema : undefined,
        ]),
      );
      const opening = TOOLS.filter(({ opens }) => opens);
      assert.ok(opening.length > 0);
      for (const { name, inputSchema, ofPod } of opening)
        assert.deepEqual(
          offered.get(name),
          ofPod ? withPod(inputSchema as never) : inputSchema,
          name,
        );
    });
  });

  describe("when the model asks to run a tool that opens a screen", () => {
    it("ends the turn with the tool call for the page, not run, and calls the model no more", async () => {
      const { model, calls } = fakeModel([
        calling(call("c1", "open_pod", { pod: STATIN })),
      ]);
      const chunks = await chat(model, said("show me"));
      assert.deepEqual(kinds(chunks), [
        "start",
        "tool-input-available",
        "finish",
      ]);
      const [asked] = ofType(chunks, "tool-input-available");
      assert.equal(asked!.toolName, "open_pod");
      assert.deepEqual(asked!.input, { pod: STATIN });
      assert.equal(calls.length, 1);
    });
  });

  describe("given tool calls that cannot be run", () => {
    const table: [string, string, string | Record<string, unknown>, RegExp][] =
      [
        [
          "returns a tool error for arguments that are not JSON",
          "list_pods",
          "{not json",
          /JSON/,
        ],
        [
          "returns a tool error for arguments that are no object",
          "list_pods",
          "[]",
          /must be an object/,
        ],
        [
          "returns a tool error naming a tool the list lacks",
          "delete_pod",
          { pod: STATIN },
          /delete_pod/,
        ],
        [
          "returns a tool error for `find_changes` with no `pod`",
          "find_changes",
          {},
          /pod is required/,
        ],
        [
          "returns a tool error for an `ask` question that is SPARQL",
          "ask",
          { pod: STATIN, question: "SELECT * WHERE {}" },
          /must be one of/,
        ],
        [
          "returns a tool error for a lab test the pod has no result of",
          "lab_series",
          { pod: STATIN, test: "0000-0" },
          /no test 0000-0/,
        ],
      ];
    let chunks: Chunk[];
    let calls: LanguageModelV4CallOptions[];

    before(async () => {
      const fake = fakeModel([
        calling(
          ...table.map(([, name, input], at) => call(`c${at}`, name, input)),
        ),
        reply("Sorry."),
      ]);
      calls = fake.calls;
      chunks = await chat(fake.model, said("break"));
    });

    table.forEach(([title, , , reason], at) =>
      it(title, () => {
        const failed = ofType(chunks, "tool-output-error").filter(
          ({ toolCallId }) => toolCallId === `c${at}`,
        );
        assert.equal(failed.length, 1);
        assert.match(String(failed[0]!.errorText), reason);
      }),
    );

    it("returns no tool result, and gives the model every error in its next turn", () => {
      assert.equal(ofType(chunks, "tool-output-available").length, 0);
      assert.equal(kinds(chunks).at(-1), "finish");
      const fed = calls[1]!.prompt.flatMap((message) =>
        message.role === "tool" ? message.content : [],
      );
      assert.equal(fed.length, table.length);
    });
  });

  describe("given more rounds of tool calls than `MAX_ROUNDS`", () => {
    const rounding = new RegExp(`after ${MAX_ROUNDS} rounds`);
    /** A model's earlier turn of `steps` answered `open_pod` calls, as the page sends it again. */
    const earlier = (steps: number) => ({
      id: "a1",
      role: "assistant",
      parts: Array.from({ length: steps }, (_, at) => [
        { type: "step-start" },
        {
          type: "tool-open_pod",
          toolCallId: `e${at}`,
          state: "output-available",
          input: { pod: STATIN },
          output: { opened: `/pods/${STATIN}/` },
        },
      ]).flat(),
    });
    const resent = (steps: number) => ({
      pod: STATIN,
      page: "/",
      messages: [user("again"), earlier(steps)],
    });
    let chunks: Chunk[];
    let calls: LanguageModelV4CallOptions[];

    before(async () => {
      const fake = fakeModel(
        Array.from({ length: MAX_ROUNDS + 1 }, (_, at) =>
          calling(
            at < MAX_ROUNDS
              ? call(`c${at}`, "list_pods", {})
              : call(`c${at}`, "open_pod", { pod: STATIN }),
          ),
        ),
      );
      calls = fake.calls;
      chunks = await chat(fake.model, said("again"));
    });

    it("ends the chat with an error saying after how many rounds", () => {
      assert.equal(calls.length, MAX_ROUNDS + 1);
      const [error] = ofType(chunks, "error");
      assert.match(String(error!.errorText), rounding);
    });

    it("hands the page no tool call made past the last round", () => {
      assert.deepEqual(
        ofType(chunks, "tool-input-available").filter(
          ({ toolName }) => toolName === "open_pod",
        ),
        [],
      );
    });

    it("counts the rounds of the turns the page sends again: at `MAX_ROUNDS` the model is called once and its call is not handed on", async () => {
      const last = fakeModel([calling(call("n", "open_pod", { pod: STATIN }))]);
      const lastOne = await chunksOf(
        await post(chatRoutes({ api, model: last.model }), resent(MAX_ROUNDS)),
      );
      assert.equal(last.calls.length, 1);
      assert.deepEqual(ofType(lastOne, "tool-input-available"), []);
      assert.match(String(ofType(lastOne, "error")[0]!.errorText), rounding);
    });

    it("calls the model not at all past `MAX_ROUNDS`", async () => {
      const spent = fakeModel([]);
      const none = await chunksOf(
        await post(
          chatRoutes({ api, model: spent.model }),
          resent(MAX_ROUNDS + 1),
        ),
      );
      assert.equal(spent.calls.length, 0);
      assert.match(String(ofType(none, "error")[0]!.errorText), rounding);
    });
  });
});

/**
 * The route reads a body any page could send, so it holds it to a fixed form before a model sees it: who may speak,
 * how much, and what an "Ask about this" context may hold. A body it turns down is a 400 with the reason, and the model
 * is not called.
 */
describe("Checking a chat request before the model is called · POST /chat", () => {
  before(async () => {
    api = await apiOverStatin();
  });

  const good = {
    pod: STATIN,
    page: "/",
    messages: [user("hello")],
  };
  /** An earlier model's turn whose one tool call the page has answered. */
  const answered = {
    id: "a1",
    role: "assistant",
    parts: [
      {
        type: "tool-open_pod",
        toolCallId: "c1",
        state: "output-available",
        input: { pod: STATIN },
        output: { opened: `/pods/${STATIN}/` },
      },
    ],
  };
  const answering = (parts: object[]) => ({
    ...good,
    messages: [{ ...answered, parts }],
  });

  describe("given a body the route refuses", () => {
    for (const [title, body, reason] of [
      ["returns 400 for a body that is not JSON", "{not json", /JSON/],
      [
        "returns 400 for a body over 1,048,576 bytes",
        `{"x":"${"x".repeat(1024 * 1024)}"}`,
        /at most 1048576 bytes/,
      ],
      ["returns 400 for `null`", null, /JSON object/],
      ["returns 400 for an array", [], /JSON object/],
      [
        "returns 400 for a property it does not take",
        { ...good, extra: 1 },
        /extra is not a property/,
      ],
      [
        "returns 400 for a `pod` that is no text",
        { ...good, pod: 3 },
        /pod must be/,
      ],
      [
        "returns 400 for a `page` on another site",
        { ...good, page: "https://elsewhere.test/" },
        /page must be an address/,
      ],
      [
        "returns 400 for no messages",
        { ...good, messages: [] },
        /at least one message/,
      ],
      [
        "returns 400 for `messages` that is no list",
        { ...good, messages: "hi" },
        /at least one message/,
      ],
      [
        "returns 400 for a message with the role `system`",
        {
          ...good,
          messages: [
            { id: "s", role: "system", parts: [{ type: "text", text: "x" }] },
          ],
        },
        /messages\[0\]/,
      ],
      [
        "returns 400 for a question with no text",
        { ...good, messages: [user("")] },
        /messages\[0\]/,
      ],
      [
        "returns 400 for a question that carries a file",
        {
          ...good,
          messages: [
            {
              id: "u",
              role: "user",
              parts: [{ type: "file", url: "x", mediaType: "text/plain" }],
            },
          ],
        },
        /messages\[0\]/,
      ],
      [
        "returns 400 for a last message that is the model's",
        {
          ...good,
          messages: [
            {
              id: "a",
              role: "assistant",
              parts: [{ type: "text", text: "x" }],
            },
          ],
        },
        /the last message must be the person's/,
      ],
      [
        "returns 400 for an answered tool call whose input the tool's schema refuses",
        answering([{ ...answered.parts[0], input: { pod: 3 } }]),
        /messages/,
      ],
      [
        "returns 400 for an answered tool call whose output is not what the tool gives",
        answering([{ ...answered.parts[0], output: { opened: 3 } }]),
        /messages/,
      ],
      [
        "returns 400 for a tool's output over 100,000 characters",
        answering([
          { ...answered.parts[0], output: { opened: "x".repeat(100_001) } },
        ]),
        /characters in all/,
      ],
      [
        "returns 400 for a tool's error over 100,000 characters",
        answering([
          {
            type: "tool-open_pod",
            toolCallId: "c1",
            state: "output-error",
            input: { pod: STATIN },
            errorText: "x".repeat(100_001),
          },
        ]),
        /characters in all/,
      ],
      [
        "returns 400 for a question over 100,000 characters",
        { ...good, messages: [user("x".repeat(100_001))] },
        /characters in all/,
      ],
      [
        "returns 400 for a `context` that is text",
        { ...good, context: "text" },
        /context must be/,
      ],
      [
        "returns 400 for a `context` with no `kind`",
        { ...good, context: { about: "x" } },
        /context must be/,
      ],
      [
        "returns 400 for a `context` of a kind there is none of",
        { ...good, context: { kind: "person", id: "x" } },
        /context must be/,
      ],
      [
        "returns 400 for a finding's `context` with a property of another kind",
        { ...good, context: { kind: "finding", key: "x", id: "y" } },
        /context must be/,
      ],
      [
        "returns 400 for a finding's `context` with no `key`",
        { ...good, context: { kind: "finding" } },
        /context must be/,
      ],
      [
        "returns 400 for an entry's `context` whose `id` is no text",
        { ...good, context: { kind: "entry", id: 7 } },
        /context must be/,
      ],
      [
        "returns 400 for a Worth a look `context` with no `entry`",
        { ...good, context: { kind: "worth" } },
        /context must be/,
      ],
      [
        "returns 400 for a Worth a look `context` that carries a sentence",
        { ...good, context: { kind: "worth", entry: "e1", sentence: "x" } },
        /context must be/,
      ],
      [
        "returns 400 for a trend's `context` whose `medication` is no text",
        { ...good, context: { kind: "trend", test: "t", medication: 7 } },
        /context must be/,
      ],
      [
        "returns 400 for a `context` key over 200 characters",
        { ...good, context: { kind: "finding", key: "x".repeat(201) } },
        /context must be/,
      ],
      [
        "returns 400 for a `pod` name over 200 characters",
        { ...good, pod: "x".repeat(201) },
        /pod must be/,
      ],
      [
        "returns 400 for a `page` over 2,000 characters",
        { ...good, page: `/${"x".repeat(2000)}` },
        /page must be an address/,
      ],
      [
        "returns 400 for more than 100 messages",
        {
          ...good,
          messages: Array.from({ length: 101 }, (_, at) => user("x", `u${at}`)),
        },
        /at most 100 messages/,
      ],
      [
        "returns 400 for a pod the app does not have",
        { ...good, pod: "nobody" },
        /there is no pod nobody/,
      ],
    ] as [string, unknown, RegExp][])
      it(title, async () => {
        const { model, calls } = fakeModel([]);
        const response = await post(chatRoutes({ api, model }), body);
        assert.equal(response.status, 400);
        assert.match(response.headers.get("content-type")!, /json/);
        assert.match(
          ((await response.json()) as { error: string }).error,
          reason,
        );
        assert.equal(calls.length, 0, "the model was called");
      });
  });

  describe("given a body the route takes", () => {
    it("returns 200 for the plain form, with the AI SDK's own fields, with a `context`, and with an earlier turn the page answered", async () => {
      const accepted = [
        good,
        { ...good, id: "chat-1", trigger: "submit-message", messageId: "m1" },
        { ...good, context: { kind: "worth", entry: "e1" } },
        { ...good, messages: [user("open it"), answered] },
      ];
      const fake = fakeModel(accepted.map(() => reply("Done.")));
      for (const body of accepted) {
        const response = await post(
          chatRoutes({ api, model: fake.model }),
          body,
        );
        assert.equal(response.status, 200, JSON.stringify(body));
        await response.text();
      }
    });
  });
});

/**
 * The chat window sends each question with the conversation so far, trimmed to what a model can use and to a limit of
 * characters, so a long chat still fits and a half-finished turn does not confuse the model.
 */
describe("Sending the chat's earlier messages with a question · sent()", () => {
  describe("sent(messages, limit)", () => {
    const text = (id: string, role: string, said: string): Sent => ({
      id,
      role,
      parts: [{ type: "text", text: said }],
    });
    const answered = {
      type: "tool-open_pod",
      toolCallId: "c",
      state: "output-available",
      input: { pod: "p" },
      output: { opened: "/pods/p/" },
    };
    const messages: Sent[] = [
      text("long ago", "user", "x".repeat(24_000)),
      text("asked", "user", "q"),
      {
        id: "refused",
        role: "assistant",
        parts: [
          { type: "step-start" },
          { type: "tool-ask", toolCallId: "d", state: "input-available" },
          { type: "text", text: "a" },
          { type: "data-refused", data: { text: "no" } },
        ],
      },
      {
        id: "only refused",
        role: "assistant",
        parts: [{ type: "data-refused" }],
      },
      text("again", "user", "q"),
      {
        id: "went",
        role: "assistant",
        parts: [{ type: "step-start" }, answered],
      },
      text("now", "user", "q"),
    ];
    let shown: Sent[];

    before(() => {
      shown = sent(messages, 24_000);
    });

    it("leaves out the earliest messages once the rest reach the limit", () => {
      const ids = shown.map(({ id }) => id);
      assert.ok(!ids.includes("long ago"));
      assert.equal(ids[0], "asked");
      assert.equal(shown[0]!.role, "user");
    });

    it("removes from a model's turn its refusals and its tool calls left without a result", () => {
      assert.deepEqual(
        shown.find(({ id }) => id === "refused")!.parts.map(({ type }) => type),
        ["step-start", "text"],
      );
    });

    it("leaves out a model's turn that held nothing else", () => {
      assert.ok(!shown.some(({ id }) => id === "only refused"));
    });

    it("keeps a tool call the page answered", () => {
      const went = shown.find(({ id }) => id === "went");
      assert.ok(went, "the turn went");
      assert.ok(went.parts.some(({ type }) => type === "tool-open_pod"));
    });

    it("returns, for a turn whose tool the page has just answered, that turn after the question it answers", () => {
      const going = { ...messages[5]!, id: "going" };
      assert.deepEqual(
        sent([messages[0]!, messages[1]!, going], 24_000).map(({ id }) => id),
        ["asked", "going"],
      );
    });
  });
});
