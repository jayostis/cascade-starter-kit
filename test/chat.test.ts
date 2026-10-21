import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import { getRequestListener } from "@hono/node-server";
import { loadHospital, loadStories } from "@the-cascade-protocol/sandbox/node";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { openPod, type Pod, pullFiles, timelineIn } from "cascade-runtime";
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
  new URL("../../app/server/chat.ts", import.meta.url).href
)) as {
  chatRoutes: (options: { api: unknown; model: Model | undefined }) => Routes;
  chatTools: (api: unknown) => Offered;
  EXPLAIN_THE_THING: string;
  MAX_ROUNDS: number;
};
const { modelOf } = (await import(
  new URL("../../app/models.ts", import.meta.url).href
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
  new URL("../../app/src/chat/chats.ts", import.meta.url).href
)) as { sent: (messages: Sent[], budget: number) => Sent[] };
type Api = {
  said(input: object): Promise<Record<string, unknown>>;
  tool(input: object): Promise<{ found: { key: string }[] }>;
  close(): Promise<void>;
};
const { maps, podApi } = (await import(
  new URL("../../app/pod-api.ts", import.meta.url).href
)) as {
  maps: (output: object) => { about: Map<string, unknown> };
  podApi: (host: object) => Api;
};
type Schema = { properties?: Record<string, unknown> };
const { NEVER, TOOLS, withPod } = (await import(
  new URL("../../app/tools.ts", import.meta.url).href
)) as {
  NEVER: { op: string; with?: string }[];
  TOOLS: {
    name: string;
    tier: string;
    ofPod?: true;
    opens?: true;
    inputSchema: Schema;
  }[];
  withPod: (schema: Schema) => Schema;
};
const { changeSaid, entryId, HISTORY } = (await import(
  new URL("../../app/said.ts", import.meta.url).href
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
  const atorvastatin = timelineIn(await statin.ask(HISTORY)).find(
    ({ notation }) => notation === "617310",
  )!.code;
  api = podApi({
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
});

after(async () => {
  await api.close();
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

test("a question that calls find_changes runs it: the model sees the compact finding, the page the finding with the keys of its rows, the page goes in the system prompt, each finding says itself in the app's own sentence, and the call goes back with what the provider attached to it", async () => {
  const signed = { google: { thoughtSignature: "sig" } };
  const { model, calls } = fakeModel([
    calling(call("c1", "find_changes", { pod: STATIN }, signed)),
    reply("LDL was lower after the statin started."),
  ]);
  const chunks = await chat(model, said("find anything interesting"));
  assert.deepEqual(kinds(chunks), [
    "start",
    "tool-input-available",
    "tool-output-available",
    "text-delta",
    "finish",
  ]);

  const [found] = ofType(chunks, "tool-output-available");
  const [finding] = found!.output as {
    key: string;
    said: string;
    view: string;
    before: { count: number };
    after: { count: number };
    rows: { entry: string; value: string; side: string }[];
  }[];
  assert.equal(finding!.key, "start:617310:18262-6");
  assert.match(finding!.said, /^LDL.* was lower after .* started\.$/);
  assert.equal(
    finding!.view,
    `/pods/${STATIN}/trend?test=18262-6&medication=617310`,
  );
  assert.equal(
    finding!.rows.length,
    finding!.before.count + finding!.after.count,
  );
  const lab = await pods.get(STATIN)!.ask("pod/My lab results");
  const entries = new Set(lab.map((row) => entryId(row.entry!)));
  for (const row of finding!.rows) assert.ok(entries.has(row.entry), row.entry);

  const [first, second] = calls;
  assert.ok(systemOf(first!).includes(STATIN));
  assert.deepEqual(
    first!.prompt
      .filter(({ role }) => role !== "system")
      .map((message) => [
        message.role,
        JSON.stringify(message.content).includes("find anything interesting"),
      ]),
    [["user", true]],
  );
  const toolMessage = second!.prompt.at(-1)!;
  assert.equal(toolMessage.role, "tool");
  const toModel = JSON.stringify(toolMessage.content);
  assert.ok(toModel.includes(finding!.key));
  assert.ok(!toModel.includes('"rows"'));
  const asked = second!.prompt.at(-2)!;
  assert.equal(asked.role, "assistant");
  const [asking] = asked.content as { providerOptions?: unknown }[];
  assert.deepEqual(asking!.providerOptions, signed);
});

test("a finding says itself as the page does: named by what the tables say of its codes", async () => {
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
  const chunks = await chat(model, said("find anything"));
  const [found] = ofType(chunks, "tool-output-available");
  const finding = (found!.output as { said: string; key: string }[]).find(
    ({ key }) => key === whole!.key,
  );
  assert.ok(
    finding!.said.endsWith(`after ${TABLES_NAME} started.`),
    finding!.said,
  );
  assert.equal(finding!.said, changeSaid(whole, names));
});

test("every tool /chat offers is a free read the server runs, or a navigation or ask tool it leaves to the page; none takes what the never list keeps from tools", () => {
  const offered = chatTools(api);
  assert.deepEqual(
    Object.keys(offered),
    TOOLS.map(({ name }) => name),
  );
  for (const { name, tier, opens } of TOOLS)
    assert.equal(
      typeof offered[name]!.execute === "function",
      tier === "free" && opens !== true,
      name,
    );
  const kept = NEVER.flatMap(({ with: given }) =>
    given === undefined ? [] : [given],
  );
  assert.ok(kept.length > 0);
  for (const [name, { inputSchema }] of Object.entries(offered))
    for (const property of kept)
      assert.ok(
        !Object.hasOwn(
          (inputSchema.jsonSchema as Schema).properties ?? {},
          property,
        ),
        `${name} takes ${property}`,
      );
});

test("the tools that move the app are offered to the model with their schemas as tools the page runs: a call to one ends the server's turn with the call for the page, unrun", async () => {
  const { model, calls } = fakeModel([
    calling(call("c1", "open_pod", { pod: STATIN })),
  ]);
  const chunks = await chat(model, said("show me"));
  const offered = new Map(
    (calls[0]!.tools ?? []).map((each) => [
      each.name,
      "inputSchema" in each ? each.inputSchema : undefined,
    ]),
  );
  const opening = TOOLS.filter(({ opens }) => opens);
  assert.deepEqual(
    opening.map(({ name }) => name),
    [
      "open_pod",
      "open_trend",
      "open_entry",
      "open_classes",
      "open_panel",
      "open_table",
    ],
  );
  for (const { name, inputSchema, ofPod } of opening)
    assert.deepEqual(
      offered.get(name),
      ofPod ? withPod(inputSchema) : inputSchema,
      name,
    );
  assert.deepEqual(kinds(chunks), ["start", "tool-input-available", "finish"]);
  const [asked] = ofType(chunks, "tool-input-available");
  assert.equal(asked!.toolName, "open_pod");
  assert.deepEqual(asked!.input, { pod: STATIN });
  assert.equal(calls.length, 1);
});

test("a tool call that cannot be run is reported to the model as a tool error, and the loop goes on: arguments that are not JSON, an unknown tool, input the schema refuses, input the pod refuses", async () => {
  const table: [string, string | Record<string, unknown>, RegExp][] = [
    ["list_pods", "{not json", /JSON/],
    ["list_pods", "[]", /must be an object/],
    ["delete_pod", { pod: STATIN }, /delete_pod/],
    ["find_changes", {}, /pod is required/],
    ["ask", { pod: STATIN, question: "SELECT * WHERE {}" }, /must be one of/],
    ["lab_series", { pod: STATIN, test: "0000-0" }, /no test 0000-0/],
  ];
  const { model, calls } = fakeModel([
    calling(...table.map(([name, input], at) => call(`c${at}`, name, input))),
    reply("Sorry."),
  ]);
  const chunks = await chat(model, said("break"));
  const errors = ofType(chunks, "tool-output-error");
  table.forEach(([name, , reason], at) => {
    const failed = errors.filter(({ toolCallId }) => toolCallId === `c${at}`);
    assert.equal(failed.length, 1, name);
    assert.match(String(failed[0]!.errorText), reason, name);
  });
  assert.equal(ofType(chunks, "tool-output-available").length, 0);
  assert.equal(kinds(chunks).at(-1), "finish");
  const fed = calls[1]!.prompt.flatMap((message) =>
    message.role === "tool" ? message.content : [],
  );
  assert.equal(fed.length, table.length);
});

test("a round of tool calls past the sixth ends the chat with an error, and no tool of the page runs past it, in one request or across the page's automatic re-sends", async () => {
  const rounds = Array.from({ length: MAX_ROUNDS + 1 }, (_, at) =>
    calling(
      at < MAX_ROUNDS
        ? call(`c${at}`, "list_pods", {})
        : call(`c${at}`, "open_pod", { pod: STATIN }),
    ),
  );
  const { model, calls } = fakeModel(rounds);
  const chunks = await chat(model, said("again"));
  assert.equal(calls.length, MAX_ROUNDS + 1);
  const rounding = new RegExp(`after ${MAX_ROUNDS} rounds`);
  const [error] = ofType(chunks, "error");
  assert.match(String(error!.errorText), rounding);
  assert.deepEqual(
    ofType(chunks, "tool-input-available").filter(
      ({ toolName }) => toolName === "open_pod",
    ),
    [],
  );

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
  const last = fakeModel([calling(call("n", "open_pod", { pod: STATIN }))]);
  const lastOne = await chunksOf(
    await post(chatRoutes({ api, model: last.model }), resent(MAX_ROUNDS)),
  );
  assert.equal(last.calls.length, 1);
  assert.deepEqual(ofType(lastOne, "tool-input-available"), []);
  assert.match(String(ofType(lastOne, "error")[0]!.errorText), rounding);

  const spent = fakeModel([]);
  const none = await chunksOf(
    await post(chatRoutes({ api, model: spent.model }), resent(MAX_ROUNDS + 1)),
  );
  assert.equal(spent.calls.length, 0);
  assert.match(String(ofType(none, "error")[0]!.errorText), rounding);
});

test("the model's refusal and its error each end the chat as a part of its own, apart from an answer", async () => {
  const refused = await chat(
    fakeModel([[finish("content-filter")]]).model,
    said("hello"),
  );
  assert.deepEqual(
    kinds(refused).filter((kind) => kind !== "start" && kind !== "finish"),
    ["data-refused"],
  );
  const [part] = ofType(refused, "data-refused");
  assert.match(String((part!.data as { text: string }).text), /declined/);

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
  assert.deepEqual(
    kinds(failed).filter((kind) => kind !== "start" && kind !== "finish"),
    ["text-delta", "error"],
  );
  assert.equal(ofType(failed, "error")[0]!.errorText, "rate limited");

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
  assert.match(String(busy!.errorText), /^m is busy at Google Gemini \(429\)/);
  assert.doesNotMatch(JSON.stringify(plain), new RegExp(KEY));
});

test("a body the rules refuse is 400 with the reason, and so is a pod there is none of; the model is not called and nothing is streamed", async () => {
  const good = {
    pod: STATIN,
    page: "/",
    messages: [user("hello")],
  };
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
  const refused: [unknown, RegExp][] = [
    ["{not json", /JSON/],
    [`{"x":"${"x".repeat(1024 * 1024)}"}`, /at most 1048576 bytes/],
    [null, /JSON object/],
    [[], /JSON object/],
    [{ ...good, extra: 1 }, /extra is not a property/],
    [{ ...good, pod: 3 }, /pod must be/],
    [{ ...good, page: "https://elsewhere.test/" }, /page must be an address/],
    [{ ...good, messages: [] }, /at least one message/],
    [{ ...good, messages: "hi" }, /at least one message/],
    [
      {
        ...good,
        messages: [
          { id: "s", role: "system", parts: [{ type: "text", text: "x" }] },
        ],
      },
      /messages\[0\]/,
    ],
    [{ ...good, messages: [user("")] }, /messages\[0\]/],
    [
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
      {
        ...good,
        messages: [
          { id: "a", role: "assistant", parts: [{ type: "text", text: "x" }] },
        ],
      },
      /the last message must be the person's/,
    ],
    [
      {
        ...good,
        messages: [
          {
            ...answered,
            parts: [{ ...answered.parts[0], input: { pod: 3 } }],
          },
        ],
      },
      /messages/,
    ],
    [
      {
        ...good,
        messages: [
          {
            ...answered,
            parts: [{ ...answered.parts[0], output: { opened: 3 } }],
          },
        ],
      },
      /messages/,
    ],
    [
      {
        ...good,
        messages: [
          {
            ...answered,
            parts: [
              {
                ...answered.parts[0],
                output: { opened: "x".repeat(100_001) },
              },
            ],
          },
        ],
      },
      /characters in all/,
    ],
    [
      {
        ...good,
        messages: [
          {
            ...answered,
            parts: [
              {
                type: "tool-open_pod",
                toolCallId: "c1",
                state: "output-error",
                input: { pod: STATIN },
                errorText: "x".repeat(100_001),
              },
            ],
          },
        ],
      },
      /characters in all/,
    ],
    [{ ...good, messages: [user("x".repeat(100_001))] }, /characters in all/],
    [{ ...good, context: "text" }, /context must be/],
    [{ ...good, context: { about: "x" } }, /context must be/],
    [{ ...good, context: { kind: "person", id: "x" } }, /context must be/],
    [
      { ...good, context: { kind: "finding", key: "x", id: "y" } },
      /context must be/,
    ],
    [{ ...good, context: { kind: "finding" } }, /context must be/],
    [{ ...good, context: { kind: "entry", id: 7 } }, /context must be/],
    [{ ...good, context: { kind: "worth" } }, /context must be/],
    [
      { ...good, context: { kind: "worth", entry: "e1", sentence: "x" } },
      /context must be/,
    ],
    [
      { ...good, context: { kind: "trend", test: "t", medication: 7 } },
      /context must be/,
    ],
    [
      { ...good, context: { kind: "finding", key: "x".repeat(201) } },
      /context must be/,
    ],
    [{ ...good, pod: "x".repeat(201) }, /pod must be/],
    [{ ...good, page: `/${"x".repeat(2000)}` }, /page must be an address/],
    [
      {
        ...good,
        messages: Array.from({ length: 101 }, (_, at) => user("x", `u${at}`)),
      },
      /at most 100 messages/,
    ],
    [{ ...good, pod: "nobody" }, /there is no pod nobody/],
  ];
  const { model, calls } = fakeModel([]);
  const routes = chatRoutes({ api, model });
  for (const [body, reason] of refused) {
    const label = JSON.stringify(body).slice(0, 200);
    const response = await post(routes, body);
    assert.equal(response.status, 400, label);
    assert.match(response.headers.get("content-type")!, /json/, label);
    assert.match(
      ((await response.json()) as { error: string }).error,
      reason,
      label,
    );
  }
  assert.equal(calls.length, 0);

  const accepted = [
    good,
    { ...good, id: "chat-1", trigger: "submit-message", messageId: "m1" },
    { ...good, context: { kind: "worth", entry: "e1" } },
    { ...good, messages: [user("open it"), answered] },
  ];
  const answering = fakeModel(accepted.map(() => reply("Done.")));
  for (const body of accepted) {
    const response = await post(
      chatRoutes({ api, model: answering.model }),
      body,
    );
    assert.equal(response.status, 200, JSON.stringify(body));
    await response.text();
  }
});

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

test("POST /chat answers with the UI message stream, holding the tool's part and the answer and neither the model's key nor its address; GET /chat names the model and nothing more; no model set is 503; and an error of the server's own is a fixed message", async (t) => {
  const stub = await stubModel();
  const model = modelOf({
    provider: "other",
    url: stub.url,
    name: "stub-1",
    key: KEY,
  });
  const routes = chatRoutes({ api, model });
  const answered = await post(routes, {
    pod: "",
    page: "/",
    ...said("which pods are there?"),
  });
  assert.equal(answered.status, 200);
  assert.match(answered.headers.get("content-type")!, /^text\/event-stream/);
  assert.equal(answered.headers.get("x-vercel-ai-ui-message-stream"), "v1");
  const text = await answered.text();
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
  const named = await (await routes.request("/chat")).text();
  assert.deepEqual(JSON.parse(named), {
    provider: "other",
    name: "stub-1",
    local: true,
  });
  for (const shown of [text, named]) {
    assert.equal(shown.includes(KEY), false);
    assert.equal(shown.includes(new URL(stub.url).host), false);
  }
  await stub.close();

  const none = chatRoutes({ api, model: undefined });
  assert.deepEqual(await (await none.request("/chat")).json(), {});
  const unset = await post(none, {});
  assert.equal(unset.status, 503);
  assert.deepEqual(await unset.json(), {
    error: "No model is set. Run `npm run model`.",
  });

  const logged = t.mock.method(console, "error", () => {});
  const broken = fakeModel([], async () => {
    throw new Error("ENOENT: open 'C:/private/path'");
  });
  const failed = await chunksOf(
    await post(chatRoutes({ api, model: broken.model }), {
      pod: STATIN,
      page: "/",
      ...said("hello"),
    }),
  );
  const [error] = ofType(failed, "error");
  assert.match(String(error!.errorText), /the server's log says why/);
  assert.doesNotMatch(JSON.stringify(failed), /private/);
  assert.ok(logged.mock.callCount() > 0);
});

test(
  "a request that closes before the answer ends aborts the call to the model",
  { timeout: 15_000 },
  async () => {
    let aborted!: () => void;
    const sawAbort = new Promise<void>((resolve) => (aborted = resolve));
    const waiting = fakeModel([], async ({ abortSignal }) => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "t" });
          controller.enqueue({ type: "text-delta", id: "t", delta: "Let me" });
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
  },
);

test("a chat that began with Ask about this tells the model the thing it asked about and to explain the thing, never the person; a chat with no context is told neither", async () => {
  const context = { kind: "finding", key: "start:617310:18262-6" };
  const { model, calls } = fakeModel([reply("Done."), reply("Done.")]);
  await chat(model, { ...said("tell me about this"), context });
  await chat(model, said("tell me about this"));
  const [asked, plain] = calls.map(systemOf);
  assert.ok(asked!.includes(JSON.stringify(context)));
  assert.ok(asked!.includes(EXPLAIN_THE_THING));
  assert.ok(!plain!.includes(EXPLAIN_THE_THING));
  assert.doesNotMatch(plain!, /asked about this/);
});

test("the window sends a question after the newest earlier messages within 24,000 characters, the first the person's, the model's turns without its refusals or calls left unanswered; a turn the page answered a tool of goes with its question", () => {
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
  const shown = sent(messages, 24_000);
  assert.deepEqual(
    shown.map(({ id }) => id),
    ["asked", "refused", "again", "went", "now"],
  );
  assert.deepEqual(
    shown[1]!.parts.map(({ type }) => type),
    ["step-start", "text"],
  );
  const going = { ...messages[5]!, id: "going" };
  assert.deepEqual(
    sent([messages[0]!, messages[1]!, going], 24_000).map(({ id }) => id),
    ["asked", "going"],
  );
});
