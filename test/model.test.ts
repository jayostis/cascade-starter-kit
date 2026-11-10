import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { after, before, describe, it } from "node:test";
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
const { checkCallsTools, setUpModel, save, remove, secret } = (await import(
  new URL("../../build/app/model.ts", import.meta.url).href
)) as {
  save(folder: string, values: Record<string, string>): Promise<void>;
  remove(folder: string): Promise<boolean>;
  checkCallsTools(
    model: Chosen,
    options?: { seconds?: number; waiting?: number; onWaiting?: () => void },
  ): Promise<{ ok: boolean; reason?: string }>;
  setUpModel(
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

/** A new app folder, whose `.env` holds `text` when it is given. */
async function appWith(text?: string) {
  const app = await mkdtemp(join(folder, "app-"));
  const env = join(app, ".env");
  if (text !== undefined) await writeFile(env, text);
  return { app, env };
}

/** The four settings of a model at `url`. */
const settingsAt = (url: string, key: string) => ({
  CASCADE_MODEL_PROVIDER: "other",
  CASCADE_MODEL_URL: url,
  CASCADE_MODEL_NAME: "a name # with 'both' quotes",
  CASCADE_MODEL_KEY: key,
});

/** The model of provider `other` behind a stub at `url`, with the test key. */
const otherAt = (url: string) =>
  modelOf({ provider: "other", url: `${url}/v1`, name: "m", key: KEY });

/**
 * The chat add-on reads which model to use from four settings in the app's `.env`: a provider, an address, a model's
 * name and a key. `modelFrom` makes the model the chat calls from them and refuses a set that cannot work, so a wrong
 * setting is said at the start and not at the first question.
 */
describe("Choosing the chat's model from settings · modelFrom(), modelOf(), CASCADE_MODEL_*", () => {
  describe("modelFrom(env)", () => {
    it("returns undefined for no settings", () => {
      assert.equal(modelFrom({}), undefined);
    });

    it("returns a model with its provider, its name and whether it is on this computer", () => {
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
    });

    it("shows the key in no property of the model", () => {
      const model = modelFrom({
        CASCADE_MODEL_PROVIDER: "local",
        CASCADE_MODEL_URL: "http://127.0.0.1:1234/v1",
        CASCADE_MODEL_NAME: "qwen",
        CASCADE_MODEL_KEY: KEY,
      })!;
      assert.ok(!JSON.stringify(model).includes(KEY));
      assert.ok(!Object.values(model).some((value) => value === KEY));
    });

    it("uses the provider's own default model when no name is set", () => {
      assert.equal(
        modelFrom({ CASCADE_MODEL_PROVIDER: "groq", CASCADE_MODEL_KEY: KEY })!
          .name,
        "openai/gpt-oss-120b",
      );
      assert.equal(
        modelFrom({ CASCADE_MODEL_PROVIDER: "gemini", CASCADE_MODEL_KEY: KEY })!
          .name,
        "gemini-3.5-flash",
      );
    });

    for (const [title, env, reason] of [
      [
        "throws Refusal for an unknown provider",
        { CASCADE_MODEL_PROVIDER: "gpt" },
        /unknown model provider/,
      ],
      [
        "throws Refusal for a hosted provider with no key",
        { CASCADE_MODEL_PROVIDER: "groq" },
        /KEY is not set/,
      ],
      [
        "throws Refusal for the provider `other` with no address",
        { CASCADE_MODEL_PROVIDER: "other" },
        /needs an address/,
      ],
      [
        "throws Refusal for a key with no provider",
        { CASCADE_MODEL_KEY: KEY },
        /PROVIDER is not set/,
      ],
    ] as const)
      it(title, () => {
        assert.throws(
          () => modelFrom(env),
          (error) => error instanceof Refusal && reason.test(error.message),
        );
      });
  });

  describe("modelOf(settings)", () => {
    it("marks a model at `localhost`, at a `127.` address or at `::1` as on this computer", () => {
      for (const url of [
        "http://localhost:11434/v1",
        "http://127.5.0.1:8080/v1",
        "http://[::1]:8080/v1",
      ])
        assert.equal(
          modelOf({ provider: "other", url, name: "m" }).local,
          true,
          url,
        );
    });

    it("marks a model at any other address as not on this computer", () => {
      for (const url of [
        "https://api.groq.com/openai/v1",
        "http://192.168.1.5:8080/v1",
      ])
        assert.equal(
          modelOf({ provider: "other", url, name: "m" }).local,
          false,
          url,
        );
    });
  });
});

/**
 * The chat answers from a pod only through tools, so a model that cannot call one is of no use to it. `checkCallsTools`
 * asks the model to call one small tool, sends the result back as the chat would, and returns either `ok` or a reason a
 * person can act on, which never shows the key.
 */
describe("Checking that a model can call tools · checkCallsTools()", () => {
  describe("given a model that calls the tool", () => {
    const extra = { google: { thought_signature: "sig" } };
    const calling = (): Reply => ({
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
    let answered: Awaited<ReturnType<typeof serving>>;
    let result: { ok: boolean; reason?: string };

    before(async () => {
      let round = 0;
      answered = await serving(() =>
        ++round === 1 ? calling() : openai.text(),
      );
      result = await checkCallsTools(otherAt(answered.url));
    });

    it("returns `{ ok: true }` for a call the tool's schema accepts, from an OpenAI-compatible server and from Anthropic", async () => {
      const openAi = await serving(openai.call);
      assert.deepEqual(await checkCallsTools(otherAt(openAi.url)), {
        ok: true,
      });
      const claude = await serving(anthropic.call);
      assert.deepEqual(
        await checkCallsTools(
          modelOf({
            provider: "anthropic",
            url: claude.url,
            name: "m",
            key: KEY,
          }),
        ),
        { ok: true },
      );
    });

    it("sends the call's result back in a second request, with what the provider attached to the call", () => {
      assert.equal(answered.bodies.length, 2);
      const [assistant, tool] = (
        answered.bodies[1]!.messages as Record<string, unknown>[]
      ).slice(-2);
      assert.deepEqual(
        (assistant!.tool_calls as Record<string, unknown>[])[0]!.extra_content,
        extra,
      );
      assert.equal(tool!.tool_call_id, "c1");
    });

    it("returns `{ ok: true }` when the second request is answered", () => {
      assert.deepEqual(result, { ok: true });
    });

    it("returns a reason naming the second round when that request fails", async () => {
      let round = 0;
      const failing = await serving(() =>
        ++round === 1
          ? calling()
          : {
              status: 400,
              json: {
                error: {
                  message: "Function call is missing a thought_signature",
                },
              },
            },
      );
      const failed = await checkCallsTools(otherAt(failing.url));
      assert.equal(failed.ok, false);
      assert.match(failed.reason!, /second round.*thought_signature/);
    });
  });

  describe("given a model that answers and calls no tool, or calls it wrongly", () => {
    it("returns that the model answers, but does not call tools", async () => {
      for (const [protocol, reply] of [
        ["openai", openai.text],
        ["anthropic", anthropic.text],
      ] as const) {
        const { url } = await serving(reply);
        const model =
          protocol === "openai"
            ? otherAt(url)
            : modelOf({ provider: "anthropic", url, name: "m", key: KEY });
        const result = await checkCallsTools(model);
        assert.equal(result.ok, false, protocol);
        assert.match(
          result.reason!,
          /answers, but does not call tools/,
          protocol,
        );
        assert.ok(!result.reason!.includes(KEY), `${protocol} shows the key`);
      }
    });

    it("returns that the tool does not accept the arguments, and which", async () => {
      for (const [protocol, reply] of [
        ["openai", openai.badCall],
        ["anthropic", () => anthropic.call(3)],
      ] as const) {
        const { url } = await serving(reply);
        const model =
          protocol === "openai"
            ? otherAt(url)
            : modelOf({ provider: "anthropic", url, name: "m", key: KEY });
        const result = await checkCallsTools(model);
        assert.equal(result.ok, false, protocol);
        assert.match(
          result.reason!,
          /does not accept.*must be a string/,
          protocol,
        );
        assert.ok(!result.reason!.includes(KEY), `${protocol} shows the key`);
      }
    });
  });

  describe("given a provider that turns the request down", () => {
    const rejected =
      /^Google Gemini rejected the key: check CASCADE_MODEL_KEY in \.env, or run `npm run model` again\./;
    const busy = (at: string, status: number) =>
      new RegExp(
        `^m is busy at ${at} \\(${status}\\): try again in a minute, or choose another model with \`npm run model\`$`,
      );

    /** What a provider answers with, and the model that asks it: `streamed` puts the error inside the stream. */
    const turnedDown = (
      status: number,
      message: string,
      provider = "gemini",
      streamed = false,
    ): [() => Reply, (url: string) => Chosen] => {
      const text = `${message} ${KEY}`;
      const reply = (): Reply =>
        !streamed
          ? { status, json: { error: { message: text } } }
          : provider === "anthropic"
            ? {
                events: [
                  [
                    "error",
                    {
                      type: "error",
                      error: { type: "overloaded_error", message: text },
                    },
                  ],
                ],
              }
            : {
                events: [
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
              };
      return [
        reply,
        (url) =>
          modelOf({
            provider,
            url: provider === "anthropic" ? url : `${url}/v1`,
            name: "m",
            key: KEY,
          }),
      ];
    };

    for (const [title, [reply, model], expected, plain] of [
      [
        "returns that the key was rejected, and what to do, for a 401",
        turnedDown(401, "Incorrect API key"),
        rejected,
      ],
      [
        "returns that the key was rejected for a 403",
        turnedDown(403, "Permission denied"),
        rejected,
      ],
      [
        "returns that the key was rejected for a 400 whose message names the API key",
        turnedDown(400, "API key not valid"),
        rejected,
      ],
      [
        'returns that the key was rejected for a 400 saying "Invalid Auth key"',
        turnedDown(400, "Invalid Auth key."),
        rejected,
      ],
      [
        "returns that the key was rejected, with the provider's words, from an OpenAI-compatible server",
        [openai.unauthorized, otherAt] as [
          () => Reply,
          (url: string) => Chosen,
        ],
        /rejected the key.*Incorrect API key/,
      ],
      [
        "returns that the key was rejected, with the provider's words, from Anthropic",
        [
          anthropic.unauthorized,
          (url: string) =>
            modelOf({ provider: "anthropic", url, name: "m", key: KEY }),
        ] as [() => Reply, (url: string) => Chosen],
        /rejected the key.*invalid x-api-key/,
      ],
      [
        "returns that the model is busy, and to try again or choose another, for a 429",
        turnedDown(429, "Quota"),
        busy("Google Gemini", 429),
      ],
      [
        "returns that the model is busy for a 503",
        turnedDown(503, "high demand"),
        busy("Google Gemini", 503),
      ],
      [
        "returns that the model is busy at Anthropic for a 529",
        turnedDown(529, "overloaded", "anthropic"),
        /^m is busy at Anthropic \(529\): try again/,
      ],
      [
        'returns that the model is busy at "The model server" for a 503 from a model on this computer',
        turnedDown(503, "loading", "local"),
        /^m is busy at The model server \(503\): try again/,
      ],
      [
        "returns that the model is busy for a 429 sent in the middle of a stream",
        turnedDown(429, "Quota", "gemini", true),
        /^m is busy at Google Gemini \(429\): try again/,
      ],
      [
        "returns that the model is busy for Anthropic's `overloaded_error` sent in the middle of a stream",
        turnedDown(529, "Overloaded", "anthropic", true),
        /^m is busy at Anthropic \(529\): try again/,
      ],
      [
        "returns the provider's own message for any other 400",
        turnedDown(400, "Unknown field"),
        /^Unknown field/,
        true,
      ],
      [
        'returns the provider\'s own message for a 400 that names a property called "key"',
        turnedDown(400, `Unknown name "key" at 'tools[0]'`),
        /^Unknown name "key"/,
        true,
      ],
    ] as [string, [() => Reply, (url: string) => Chosen], RegExp, true?][])
      it(title, async () => {
        const { url } = await serving(reply);
        const { ok, reason } = await checkCallsTools(model(url));
        const said = String(reason);
        assert.equal(ok, false);
        assert.match(said, expected);
        assert.ok(!said.includes(KEY), "it shows the key");
        if (plain) assert.doesNotMatch(said, /rejected the key|busy/);
      });
  });

  describe("given a model that does not answer", () => {
    const limits = { seconds: 0.5, waiting: 0.1 };
    let waiting = 0;
    let hosted: { ok: boolean; reason?: string };
    let local: { ok: boolean; reason?: string };

    before(async () => {
      const { url } = await serving(() => ({ hang: true }));
      const settings = { provider: "other", url: `${url}/v1`, name: "slow" };
      hosted = await checkCallsTools(
        { ...modelOf(settings), local: false },
        { ...limits, onWaiting: () => (waiting += 1) },
      );
      local = await checkCallsTools(modelOf(settings), limits);
    });

    it("calls `onWaiting` once, after `waiting` seconds", () => {
      assert.equal(waiting, 1);
    });

    it("returns after `seconds` that there was no answer, that the model may be busy, and to try another model name", () => {
      assert.equal(hosted.ok, false);
      assert.match(String(hosted.reason), /no answer within 0\.5 seconds/);
      assert.match(String(hosted.reason), /busy/);
      assert.match(String(hosted.reason), /npm run model/);
      assert.match(String(hosted.reason), /another model name/);
    });

    it("returns for a model on this computer that it may still be loading, with no word of busy or another name", () => {
      assert.match(String(local.reason), /still be loading/);
      assert.match(String(local.reason), /npm run model/);
      assert.doesNotMatch(String(local.reason), /busy|another model name/);
    });
  });

  describe("given the provider", () => {
    /** The first request's `chat_template_kwargs` that `checkCallsTools` sends a model of `provider`. */
    async function kwargsSentTo(provider: string) {
      const { url, bodies } = await serving(openai.text);
      await checkCallsTools(
        modelOf({ provider, url: `${url}/v1`, name: "m", key: KEY }),
      );
      return bodies[0]!.chat_template_kwargs;
    }

    it("tells a model on this computer or at another address not to think", async () => {
      for (const provider of ["local", "other"])
        assert.deepEqual(
          await kwargsSentTo(provider),
          { enable_thinking: false },
          provider,
        );
    });

    it("sends a hosted provider no such instruction", async () => {
      for (const provider of ["groq", "gemini"])
        assert.equal(await kwargsSentTo(provider), undefined, provider);
    });
  });
});

/**
 * `npm run model` asks which provider, which model and its key, checks that the model can call tools, and only then
 * writes the four settings to `.env`. The key is typed unseen, is never printed, and `--off` takes the settings out
 * again.
 */
describe("Setting up the chat's model from a terminal · npm run model, setUpModel(), save(), remove(), secret()", () => {
  describe("given a model that passes the check", () => {
    let good: Awaited<ReturnType<typeof serving>>;
    let run: ReturnType<typeof scripted>;
    let env: string;

    before(async () => {
      const made = await appWith("KEEP=1\n");
      env = made.env;
      good = await serving(openai.call);
      run = scripted(["6", `${good.url}/v1`, "stub-model"], [KEY]);
      assert.equal(await setUpModel([], run.terminal, made.app), 0);
    });

    it("writes the four settings to `.env`, keeping the lines already there", async () => {
      assert.deepEqual(await settingsIn(env), {
        CASCADE_MODEL_PROVIDER: "other",
        CASCADE_MODEL_URL: `${good.url}/v1`,
        CASCADE_MODEL_NAME: "stub-model",
        CASCADE_MODEL_KEY: KEY,
      });
      assert.match(await readFile(env, "utf8"), /^KEEP=1$/m);
    });

    it("prints what it saved, without the key", () => {
      assert.match(
        run.text(),
        /Saved to \.env: other, stub-model, and the key\. The app's chat now uses it;/,
      );
      assert.ok(!run.text().includes(KEY), "the key was shown");
    });

    it("sends the key to the provider as the request's bearer token", () => {
      assert.equal(good.headers[0]!.authorization, `Bearer ${KEY}`);
    });
  });

  describe("with `--off`", () => {
    it("removes the four settings and keeps every other line", async () => {
      const { app, env } = await appWith("KEEP=1\n");
      await save(app, settingsAt("http://h/v1", KEY));
      assert.equal(await setUpModel(["--off"], scripted([]).terminal, app), 0);
      assert.deepEqual(await envIn(env), { KEEP: "1" });
    });
  });

  describe("given a model that fails the check", () => {
    it("returns 1 and writes no `.env`, printing why without the key", async () => {
      for (const [reply, said] of [
        [openai.text, /does not call tools/],
        [openai.unauthorized, /Incorrect API key/],
      ] as const) {
        const { app, env } = await appWith();
        const { url } = await serving(reply);
        const run = scripted(["6", `${url}/v1`, "m", "n"], [KEY]);
        assert.equal(await setUpModel([], run.terminal, app), 1);
        assert.match(run.text(), said);
        assert.ok(!run.text().includes(KEY), "the key was shown");
        await assert.rejects(readFile(env), { code: "ENOENT" });
      }
    });

    it('prints "Still waiting for an answer…" for a model that does not answer', async () => {
      const { app } = await appWith();
      const { url } = await serving(() => ({ hang: true }));
      const run = scripted(["6", `${url}/v1`, "slow", "n"], [KEY]);
      assert.equal(
        await setUpModel([], run.terminal, app, { seconds: 0.5, waiting: 0.1 }),
        1,
      );
      assert.match(run.text(), /Still waiting for an answer…/);
    });
  });

  describe("given a free provider and no key typed", () => {
    let run: ReturnType<typeof scripted>;
    let returned: number;
    let env: string;

    before(async () => {
      const made = await appWith();
      env = made.env;
      run = scripted(["2"], [""]);
      returned = await setUpModel([], run.terminal, made.app);
    });

    it("prints where to make a key, that the provider keeps what it is sent for 30 days, and that it is for story pods, not a person's own", () => {
      assert.match(run.text(), /https:\/\/console\.groq\.com\/keys/);
      assert.match(run.text(), /30 days/);
      assert.match(run.text(), /story pods, not a person's own/);
    });

    it("returns 2 and writes no `.env`", async () => {
      assert.equal(returned, 2);
      await assert.rejects(readFile(env), { code: "ENOENT" });
    });
  });

  describe("save(folder, values)", () => {
    const keys = ['k"e y#1', "k'e y#1", "plain"];

    /** `save` of a model with `key` into an app whose `.env` has two Windows lines. */
    async function savedWith(key: string) {
      const { app, env } = await appWith("KEEP=1\r\nOTHER=2\r\n");
      await save(app, settingsAt("http://h/v1", key));
      return { env, text: await readFile(env, "utf8") };
    }

    it("writes values that Node's `parseEnv` gives back as given, with quotes, spaces and `#` in them", async () => {
      for (const key of keys) {
        const { env } = await savedWith(key);
        assert.deepEqual(
          await envIn(env),
          { KEEP: "1", OTHER: "2", ...settingsAt("http://h/v1", key) },
          key,
        );
      }
    });

    it("keeps the file's own line endings", async () => {
      for (const key of keys) {
        const { text } = await savedWith(key);
        assert.ok(!/(^|[^\r])\n/.test(text), `${key}: a line lost its CR`);
      }
    });

    it("throws Refusal for a value holding both kinds of quote", async () => {
      const { app } = await appWith("KEEP=1\r\nOTHER=2\r\n");
      await assert.rejects(
        save(app, settingsAt("http://h/v1", `a"b'c`)),
        (error) => error instanceof Refusal,
      );
    });
  });

  describe("remove(folder)", () => {
    it("returns true, and leaves the other lines and their line endings", async () => {
      const { app, env } = await appWith("KEEP=1\r\nOTHER=2\r\n");
      await save(app, settingsAt("http://h/v1", "plain"));
      assert.equal(await remove(app), true);
      assert.deepEqual(await envIn(env), { KEEP: "1", OTHER: "2" });
      assert.ok((await readFile(env, "utf8")).includes("\r\n"));
    });

    it("returns false when the settings are not there", async () => {
      const { app } = await appWith("KEEP=1\n");
      assert.equal(await remove(app), false);
    });
  });

  describe("secret(question, terminal)", () => {
    let value: string;
    let shown: string;
    let written: string[];
    let modes: boolean[];
    let handlers: ((chunk: Buffer) => void)[];

    before(async () => {
      handlers = [];
      written = [];
      modes = [];
      const input: FakeInput = {
        setRawMode: (on) => modes.push(on),
        resume: () => undefined,
        pause: () => undefined,
        on: (_name, listener) => handlers.push(listener),
        off: (_name, listener) =>
          handlers.splice(handlers.indexOf(listener), 1),
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
      value = await reading;
      shown = written.join("");
    });

    it("returns what was typed and pasted, without what Backspace removed", () => {
      assert.equal(value, "abde");
    });

    it("writes a bullet for each character kept, and never the character", () => {
      const typed = 2 + 1 + 1 + 1; // a, b, c, d and the pasted e
      const redrawn = 2; // the Ctrl+V hint draws "ab" again
      assert.equal([...shown].filter((c) => c === "•").length, typed + redrawn);
      assert.ok(
        !written.some((text) => /^[a-d]$/.test(text)),
        "a character showed",
      );
    });

    it("writes the Ctrl+V hint once, however often Ctrl+V is pressed", () => {
      assert.equal(shown.split("Ctrl+V does not paste here").length - 1, 1);
      assert.match(
        shown,
        /\nCtrl\+V does not paste here: right-click, or Ctrl\+Shift\+V in Windows Terminal\n/,
      );
    });

    it("erases one bullet for Backspace", () => {
      assert.equal(shown.split("\b \b").length - 1, 1);
    });

    it("ignores arrow and Delete keys", () => {
      assert.ok(!value.includes("["), "an arrow key was typed");
      assert.ok(value.includes("e"), "the bracketed paste was lost");
    });

    it("turns raw mode off and removes its listener when Enter is pressed", () => {
      assert.deepEqual(modes, [true, false]);
      assert.equal(handlers.length, 0);
    });
  });
});
