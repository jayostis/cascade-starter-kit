import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { after, before, test } from "node:test";
import { Refusal } from "cascade-runtime";
import { gone } from "./settled.js";

interface Settings {
  provider: string;
  url?: string;
  name?: string;
  key?: string;
}
interface FakeInput {
  setRawMode(on: boolean): void;
  resume(): void;
  pause(): void;
  on(name: string, listener: (chunk: Buffer) => void): void;
  off(name: string, listener: (chunk: Buffer) => void): void;
}
interface Terminal {
  out(text: string): void;
  err(text: string): void;
  ask(question: string): Promise<string>;
  secret(question: string): Promise<string>;
}

/** A model as `models.ts` makes it, on the AI SDK. */
interface Chosen {
  provider: string;
  name: string;
  local: boolean;
}

const { modelFrom, modelOf } = (await import(
  new URL("../../build/app/models.ts", import.meta.url).href
)) as {
  modelOf(settings: Settings): Chosen;
  modelFrom(env: Record<string, string>): Chosen | undefined;
};
const { check, flow, save, remove, secret } = (await import(
  new URL("../../build/app/model.ts", import.meta.url).href
)) as {
  save(folder: string, values: Record<string, string>): Promise<void>;
  remove(folder: string): Promise<boolean>;
  check(
    model: Chosen,
    options?: { seconds?: number; waiting?: number; onWaiting?: () => void },
  ): Promise<{ ok: boolean; reason?: string }>;
  flow(
    args: string[],
    terminal: Terminal,
    folder: string,
    checking?: { seconds?: number; waiting?: number },
  ): Promise<number>;
  secret(
    question: string,
    io: {
      stdin: FakeInput;
      stdout: { write(text: string): void };
      exit(code: number): void;
    },
  ): Promise<string>;
};

const KEY = "sk-TESTSECRET-1234";

/** What a stub server answers: a status and either a JSON body or the server-sent events of a stream. */
type Reply = {
  status?: number;
  json?: object;
  events?: [string, object][];
  /** Never answers: the request waits until the caller gives up. */
  hang?: true;
};

/** A loopback stub of a provider's API: answers every request with what `reply` says and keeps each request's body. */
async function stub(reply: () => Reply): Promise<{
  url: string;
  bodies: Record<string, unknown>[];
  headers: Record<string, unknown>[];
  server: Server;
}> {
  const bodies: Record<string, unknown>[] = [];
  const headers: Record<string, unknown>[] = [];
  const server = createServer((request, response) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => {
      bodies.push(JSON.parse(text) as Record<string, unknown>);
      headers.push(request.headers);
      const { status = 200, json, events, hang } = reply();
      if (hang) return;
      if (json) {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(json));
        return;
      }
      response.writeHead(status, { "content-type": "text/event-stream" });
      for (const [name, data] of events ?? [])
        response.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      response.end();
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, bodies, headers, server };
}

const delta = (
  fields: object,
  finish: string | null = null,
): [string, object] => [
  "message",
  { choices: [{ index: 0, delta: fields, finish_reason: finish }] },
];

const openai = {
  call: (withId = true): Reply => ({
    events: [
      delta({
        tool_calls: [
          {
            index: 0,
            ...(withId ? { id: "c1" } : {}),
            type: "function",
            function: { name: "note_word", arguments: "" },
          },
        ],
      }),
      delta({ tool_calls: [{ index: 0, function: { arguments: '{"wo' } }] }),
      delta({
        tool_calls: [{ index: 0, function: { arguments: 'rd":"ready"}' } }],
      }),
      delta({}, "tool_calls"),
    ],
  }),
  badCall: (): Reply => ({
    events: [
      delta({
        tool_calls: [
          {
            index: 0,
            id: "c1",
            type: "function",
            function: { name: "note_word", arguments: '{"word":3}' },
          },
        ],
      }),
      delta({}, "tool_calls"),
    ],
  }),
  text: (): Reply => ({
    events: [
      delta({ content: "Hel" }),
      delta({ content: "lo" }),
      delta({}, "stop"),
    ],
  }),
  unauthorized: (): Reply => ({
    status: 401,
    json: { error: { message: `Incorrect API key provided: ${KEY}` } },
  }),
};

const sse = (type: string, fields: object): [string, object] => [
  type,
  { type, ...fields },
];

const anthropic = {
  call: (word: string | number = "ready"): Reply => ({
    events: [
      sse("message_start", {
        message: {
          id: "m1",
          type: "message",
          role: "assistant",
          content: [],
          model: "stub",
          stop_reason: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
      sse("content_block_start", {
        index: 0,
        content_block: {
          type: "tool_use",
          id: "tu1",
          name: "note_word",
          input: {},
        },
      }),
      sse("content_block_delta", {
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: `{"word":`,
        },
      }),
      sse("content_block_delta", {
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: `${JSON.stringify(word)}}`,
        },
      }),
      sse("content_block_stop", { index: 0 }),
      sse("message_delta", {
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 5 },
      }),
      sse("message_stop", {}),
    ],
  }),
  text: (stop = "end_turn"): Reply => ({
    events: [
      sse("message_start", {
        message: {
          id: "m1",
          type: "message",
          role: "assistant",
          content: [],
          model: "stub",
          stop_reason: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
      sse("content_block_start", {
        index: 0,
        content_block: { type: "text", text: "" },
      }),
      sse("content_block_delta", {
        index: 0,
        delta: { type: "text_delta", text: "Hello" },
      }),
      sse("content_block_stop", { index: 0 }),
      sse("message_delta", {
        delta: { stop_reason: stop, stop_sequence: null },
        usage: { output_tokens: 5 },
      }),
      sse("message_stop", {}),
    ],
  }),
  unauthorized: (): Reply => ({
    status: 401,
    json: {
      type: "error",
      error: {
        type: "authentication_error",
        message: `invalid x-api-key ${KEY}`,
      },
    },
  }),
};

const stubs: Server[] = [];
let folder: string;

async function serving(reply: () => Reply) {
  const made = await stub(reply);
  stubs.push(made.server);
  return made;
}

before(async () => {
  folder = await mkdtemp(join(tmpdir(), "model-"));
});

after(async () => {
  for (const server of stubs) server.close();
  await gone(folder);
});

test("the settings make a model, none make nothing, and no property of a model shows its key", () => {
  assert.equal(modelFrom({}), undefined);
  const model = modelFrom({
    CASCADE_MODEL_PROVIDER: "local",
    CASCADE_MODEL_URL: "http://127.0.0.1:1234/v1",
    CASCADE_MODEL_NAME: "qwen",
    CASCADE_MODEL_KEY: KEY,
  })!;
  assert.deepEqual(
    { provider: model.provider, name: model.name, local: model.local },
    { provider: "local", name: "qwen", local: true },
  );
  assert.ok(!JSON.stringify(model).includes(KEY));
  assert.ok(!Object.values(model).some((value) => value === KEY));
  const hosts: [string, boolean][] = [
    ["http://localhost:11434/v1", true],
    ["http://127.5.0.1:8080/v1", true],
    ["http://[::1]:8080/v1", true],
    ["https://api.groq.com/openai/v1", false],
    ["http://192.168.1.5:8080/v1", false],
  ];
  for (const [url, local] of hosts)
    assert.equal(
      modelOf({ provider: "other", url, name: "m" }).local,
      local,
      url,
    );
  const refusals: [string, Record<string, string>, RegExp][] = [
    [
      "an unknown provider",
      { CASCADE_MODEL_PROVIDER: "gpt" },
      /unknown model provider/,
    ],
    [
      "a hosted provider with no key",
      { CASCADE_MODEL_PROVIDER: "groq" },
      /KEY is not set/,
    ],
    [
      "another address with none",
      { CASCADE_MODEL_PROVIDER: "other" },
      /needs an address/,
    ],
    [
      "a key and no provider",
      { CASCADE_MODEL_KEY: KEY },
      /PROVIDER is not set/,
    ],
  ];
  for (const [what, env, reason] of refusals)
    assert.throws(
      () => modelFrom(env),
      (error) => error instanceof Refusal && reason.test(error.message),
      what,
    );
  assert.equal(
    modelFrom({ CASCADE_MODEL_PROVIDER: "groq", CASCADE_MODEL_KEY: KEY })!.name,
    "openai/gpt-oss-120b",
  );
  assert.equal(
    modelFrom({ CASCADE_MODEL_PROVIDER: "gemini", CASCADE_MODEL_KEY: KEY })!
      .name,
    "gemini-3.5-flash",
  );
});

test("a model that does not answer is waited for in the open, then given up on with the likeliest cause and the next step, which differ for a model on this computer", async () => {
  const { url } = await serving(() => ({ hang: true }));
  const settings = { provider: "other", url: `${url}/v1`, name: "slow" };
  const limits = { seconds: 0.5, waiting: 0.1 };
  let waiting = 0;
  const onWaiting = () => (waiting += 1);
  const hosted = await check(
    { ...modelOf(settings), local: false },
    {
      ...limits,
      onWaiting,
    },
  );
  assert.equal(hosted.ok, false);
  assert.equal(waiting, 1);
  assert.match(String(hosted.reason), /no answer within 0\.5 seconds/);
  assert.match(String(hosted.reason), /busy/);
  assert.match(String(hosted.reason), /npm run model/);
  assert.match(String(hosted.reason), /another model name/);

  const local = await check(modelOf(settings), limits);
  assert.match(String(local.reason), /still be loading/);
  assert.match(String(local.reason), /npm run model/);
  assert.doesNotMatch(String(local.reason), /busy|another model name/);

  const app = await mkdtemp(join(folder, "app-"));
  const run = scripted(["6", `${url}/v1`, "slow", "n"], [KEY]);
  assert.equal(await flow([], run.terminal, app, limits), 1);
  assert.match(run.text(), /Still waiting for an answer…/);
});

test("the check passes only when the model calls the tool with arguments its schema accepts, and says why otherwise; only a model on this computer or at another address is told not to think", async () => {
  const cases: [string, "openai" | "anthropic", () => Reply, RegExp | true][] =
    [
      ["a call", "openai", openai.call, true],
      ["a call", "anthropic", anthropic.call, true],
      ["text", "openai", openai.text, /answers, but does not call tools/],
      ["text", "anthropic", anthropic.text, /answers, but does not call tools/],
      [
        "a bad key",
        "openai",
        openai.unauthorized,
        /rejected the key.*Incorrect API key/,
      ],
      [
        "a bad key",
        "anthropic",
        anthropic.unauthorized,
        /rejected the key.*invalid x-api-key/,
      ],
      [
        "arguments of the wrong type",
        "openai",
        openai.badCall,
        /does not accept.*must be a string/,
      ],
      [
        "arguments of the wrong type",
        "anthropic",
        () => anthropic.call(3),
        /does not accept.*must be a string/,
      ],
    ];
  for (const [what, protocol, reply, expected] of cases) {
    const { url } = await serving(reply);
    const model =
      protocol === "openai"
        ? modelOf({
            provider: "other",
            url: `${url}/v1`,
            name: "m",
            key: KEY,
          })
        : modelOf({ provider: "anthropic", url, name: "m", key: KEY });
    const result = await check(model);
    const label = `${what} (${protocol})`;
    if (expected === true) assert.deepEqual(result, { ok: true }, label);
    else {
      assert.equal(result.ok, false, label);
      assert.match(result.reason!, expected, label);
      assert.ok(!result.reason!.includes(KEY), `${label} shows the key`);
    }
  }
  for (const [provider, told] of [
    ["local", true],
    ["other", true],
    ["groq", false],
    ["gemini", false],
  ] as const) {
    const { url, bodies } = await serving(openai.text);
    await check(modelOf({ provider, url: `${url}/v1`, name: "m", key: KEY }));
    assert.equal(
      JSON.stringify(bodies[0]!.chat_template_kwargs) ===
        JSON.stringify({ enable_thinking: false }),
      told,
      provider,
    );
  }
});

test("a rejected key or a busy model is said plainly, with what to do, and no reply shows the key", async () => {
  const rejected =
    /^Google Gemini rejected the key: check CASCADE_MODEL_KEY in \.env, or run `npm run model` again\./;
  const cases: [string, number, string, RegExp, string?, true?][] = [
    ["401", 401, "Incorrect API key", rejected],
    ["403", 403, "Permission denied", rejected],
    ["a 400 naming the key", 400, "API key not valid", rejected],
    [
      "429",
      429,
      "Quota",
      /^m is busy at Google Gemini \(429\): try again in a minute, or choose another model with `npm run model`$/,
    ],
    [
      "503",
      503,
      "high demand",
      /^m is busy at Google Gemini \(503\): try again in a minute, or choose another model with `npm run model`$/,
    ],
    ["another 400", 400, "Unknown field", /^Unknown field/],
    [
      "a 400 naming a property key",
      400,
      `Unknown name "key" at 'tools[0]'`,
      /^Unknown name "key"/,
    ],
    ["Invalid Auth key", 400, "Invalid Auth key.", rejected],
    [
      "529 from Anthropic",
      529,
      "overloaded",
      /^m is busy at Anthropic \(529\): try again/,
      "anthropic",
    ],
    [
      "503 from a local server",
      503,
      "loading",
      /^m is busy at The model server \(503\): try again/,
      "local",
    ],
    [
      "429 sent mid-stream by an OpenAI-compatible server",
      429,
      "Quota",
      /^m is busy at Google Gemini \(429\): try again/,
      undefined,
      true,
    ],
    [
      "overloaded_error sent mid-stream by Anthropic",
      529,
      "Overloaded",
      /^m is busy at Anthropic \(529\): try again/,
      "anthropic",
      true,
    ],
  ];
  for (const [what, status, message, expected, provider, streamed] of cases) {
    const text = `${message} ${KEY}`;
    const { url } = await serving(() =>
      streamed
        ? {
            events:
              provider === "anthropic"
                ? [
                    [
                      "error",
                      {
                        type: "error",
                        error: { type: "overloaded_error", message: text },
                      },
                    ],
                  ]
                : [
                    [
                      "message",
                      {
                        error: {
                          message: text,
                          type: "rate_limit",
                          code: status,
                        },
                      },
                    ],
                  ],
          }
        : { status, json: { error: { message: text } } },
    );
    const { ok, reason } = await check(
      modelOf({
        provider: provider ?? "gemini",
        url: provider === "anthropic" ? url : `${url}/v1`,
        name: "m",
        key: KEY,
      }),
    );
    assert.equal(ok, false, what);
    const said = String(reason);
    assert.match(said, expected, what);
    assert.ok(!said.includes(KEY), `${what} shows the key`);
    if (/^(another 400|a 400 naming a property key)$/.test(what))
      assert.doesNotMatch(said, /rejected the key|busy/, what);
  }
});

test("the check sends the call's result back as the chat does, extra included, and fails when that second round fails", async () => {
  const extra = { google: { thought_signature: "sig" } };
  const call = (): Reply => ({
    events: [
      delta({
        tool_calls: [
          {
            index: 0,
            id: "c1",
            type: "function",
            function: { name: "note_word", arguments: '{"word":"ready"}' },
            extra_content: extra,
          },
        ],
      }),
      delta({}, "tool_calls"),
    ],
  });
  const settings = (url: string) => ({
    provider: "other",
    url: `${url}/v1`,
    name: "m",
    key: KEY,
  });

  let round = 0;
  const failing = await serving(() =>
    ++round === 1
      ? call()
      : {
          status: 400,
          json: {
            error: { message: "Function call is missing a thought_signature" },
          },
        },
  );
  const failed = await check(modelOf(settings(failing.url)));
  assert.equal(failed.ok, false);
  assert.match(failed.reason!, /second round.*thought_signature/);
  assert.equal(failing.bodies.length, 2);
  const [assistant, tool] = (
    failing.bodies[1]!.messages as Record<string, unknown>[]
  ).slice(-2);
  assert.deepEqual(
    (assistant!.tool_calls as Record<string, unknown>[])[0]!.extra_content,
    extra,
  );
  assert.equal(tool!.tool_call_id, "c1");

  round = 0;
  const answering = await serving(() =>
    ++round === 1 ? call() : openai.text(),
  );
  assert.deepEqual(await check(modelOf(settings(answering.url))), {
    ok: true,
  });
  assert.equal(answering.bodies.length, 2);
});

test("a secret shows a bullet for each character it keeps, drops Ctrl+V with a hint said once, and Backspace removes one bullet", async () => {
  const handlers: ((chunk: Buffer) => void)[] = [];
  const written: string[] = [];
  const modes: boolean[] = [];
  const input: FakeInput = {
    setRawMode: (on) => modes.push(on),
    resume: () => undefined,
    pause: () => undefined,
    on: (_name, listener) => handlers.push(listener),
    off: (_name, listener) => handlers.splice(handlers.indexOf(listener), 1),
  };
  const reading = secret("key: ", {
    stdin: input,
    stdout: { write: (text) => written.push(text) },
    exit: () => assert.fail("exited"),
  });
  const type = (text: string) => handlers[0]!(Buffer.from(text));
  type("ab");
  type("\x16");
  type("\x16");
  type("c\x7fd");
  type("\x1b[D\x1b[3~\x1b[200~e\x1b[201~\x1bOA");
  type("\r");
  assert.equal(await reading, "abde");
  const shown = written.join("");
  assert.equal(shown.split("Ctrl+V does not paste here").length - 1, 1);
  assert.match(
    shown,
    /\nCtrl\+V does not paste here: right-click, or Ctrl\+Shift\+V in Windows Terminal\n/,
  );
  assert.ok(shown.includes("\b \b"), "Backspace erased nothing");
  assert.equal([...shown].filter((c) => c === "•").length, 2 + 2 + 2 + 1);
  assert.ok(
    !written.some((text) => /^[a-d]$/.test(text)),
    "a character showed",
  );
  assert.deepEqual(modes, [true, false]);
  assert.equal(handlers.length, 0);
});

/** A terminal answering from a script, and keeping everything it was shown. */
function scripted(asks: string[], secrets: string[] = []) {
  const shown: string[] = [];
  const terminal: Terminal = {
    out: (text) => shown.push(text),
    err: (text) => shown.push(text),
    ask: async (question) => {
      shown.push(question);
      return asks.shift() ?? "";
    },
    secret: async (question) => {
      shown.push(question);
      return secrets.shift() ?? "";
    },
  };
  return { terminal, text: () => shown.join("") };
}

const envIn = async (path: string) => parseEnv(await readFile(path, "utf8"));

const settingsIn = async (path: string) =>
  Object.fromEntries(
    Object.entries(await envIn(path)).filter(([name]) =>
      name.startsWith("CASCADE_MODEL_"),
    ),
  );

test("the flow keeps the four settings in .env after a model that calls a tool, never shows the key, and --off removes only them", async () => {
  const app = await mkdtemp(join(folder, "app-"));
  const env = join(app, ".env");
  await writeFile(env, "KEEP=1\n");
  const good = await serving(openai.call);
  const run = scripted(["6", `${good.url}/v1`, "stub-model"], [KEY]);
  assert.equal(await flow([], run.terminal, app), 0);
  assert.deepEqual(await settingsIn(env), {
    CASCADE_MODEL_PROVIDER: "other",
    CASCADE_MODEL_URL: `${good.url}/v1`,
    CASCADE_MODEL_NAME: "stub-model",
    CASCADE_MODEL_KEY: KEY,
  });
  assert.match(await readFile(env, "utf8"), /^KEEP=1$/m);
  assert.match(
    run.text(),
    /Saved to \.env: other, stub-model, and the key\. The app's chat now uses it;/,
  );
  assert.ok(!run.text().includes(KEY), "the key was shown");
  assert.equal(good.headers[0]!.authorization, `Bearer ${KEY}`);

  assert.equal(await flow(["--off"], scripted([]).terminal, app), 0);
  assert.deepEqual(await envIn(env), { KEEP: "1" });
});

test("the settings are kept in .env as process.loadEnvFile reads them back, in the file's own line endings, and a value that cannot be is refused", async () => {
  const app = await mkdtemp(join(folder, "app-"));
  const env = join(app, ".env");
  const settings = (url: string, key: string) => ({
    CASCADE_MODEL_PROVIDER: "other",
    CASCADE_MODEL_URL: url,
    CASCADE_MODEL_NAME: "a name # with 'both' quotes",
    CASCADE_MODEL_KEY: key,
  });
  await writeFile(env, "KEEP=1\r\nOTHER=2\r\n");
  for (const key of ['k"e y#1', "k'e y#1", "plain"]) {
    await save(app, settings("http://h/v1", key));
    const text = await readFile(env, "utf8");
    assert.ok(!/(^|[^\r])\n/.test(text), "a line lost its CR");
    assert.deepEqual(await envIn(env), {
      KEEP: "1",
      OTHER: "2",
      ...settings("http://h/v1", key),
    });
  }
  await assert.rejects(
    save(app, settings("http://h/v1", `a"b'c`)),
    (error) => error instanceof Refusal,
  );
  assert.equal(await remove(app), true);
  assert.deepEqual(await envIn(env), { KEEP: "1", OTHER: "2" });
  assert.equal(await remove(app), false);
  assert.ok((await readFile(env, "utf8")).includes("\r\n"));
});

test("the flow changes nothing for a model that does not call tools or a key the provider refuses, whose message does not show the key either", async () => {
  const app = await mkdtemp(join(folder, "app-"));
  const env = join(app, ".env");
  for (const [reply, said] of [
    [openai.text, /does not call tools/],
    [openai.unauthorized, /Incorrect API key/],
  ] as const) {
    const { url } = await serving(reply);
    const run = scripted(["6", `${url}/v1`, "m", "n"], [KEY]);
    assert.equal(await flow([], run.terminal, app), 1);
    assert.match(run.text(), said);
    assert.ok(!run.text().includes(KEY), "the key was shown");
    await assert.rejects(readFile(env), { code: "ENOENT" });
  }
});

test("the flow says a free provider's terms and where to make its key, and writes nothing without one", async () => {
  const app = await mkdtemp(join(folder, "app-"));
  const run = scripted(["2"], [""]);
  assert.equal(await flow([], run.terminal, app), 2);
  assert.match(run.text(), /https:\/\/console\.groq\.com\/keys/);
  assert.match(run.text(), /30 days/);
  assert.match(run.text(), /story pods, not a person's own/);
  await assert.rejects(readFile(join(app, ".env")), { code: "ENOENT" });
});
