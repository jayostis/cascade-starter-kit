// The starter's chat in Chromium, against a copy of the starter and a stub model on loopback: no real model, key or
// network. The copy makes its own pods, so nothing under the repository is written.
import assert from "node:assert/strict";
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  unlink,
} from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Locator, type Page } from "playwright";
import {
  called,
  inPlace,
  inputOf,
  listed,
  offered,
  recordTools,
  type Registered,
} from "./shown.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** The template with every add-on added, the chat among them, as `npm run test:browser` makes it. */
const APP = join(ROOT, "build", "app");
const KEY = "sk-test-key-that-must-not-leave";
const ASKS = "open Ines Calloway's pod";

type Stub = {
  url: string;
  stopped: () => number;
  told: () => string[];
  close: () => Promise<void>;
};

/** An OpenAI-compatible model that opens the pod a question names, asks to make a pod for the person one names, answers "Done." after a tool result, and tells a long story for as long as it is listened to; `told` is what each tool result said to it. */
async function stubModel(): Promise<Stub> {
  let stopped = 0;
  const told: string[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const { messages } = JSON.parse(Buffer.concat(chunks).toString()) as {
        messages: { role: string; content?: string }[];
      };
      const last = messages.at(-1)!;
      const send = (delta: object, finish: string | null = null) =>
        response.write(
          `data: ${JSON.stringify({ id: "stub", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
        );
      const call = (name: string, input: object) => {
        send({
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              type: "function",
              function: { name, arguments: JSON.stringify(input) },
            },
          ],
        });
        send({}, "tool_calls");
        response.end("data: [DONE]\n\n");
      };
      response.writeHead(200, { "content-type": "text/event-stream" });
      const named = /open (.+?)'s pod/i.exec(last.content ?? "")?.[1];
      const person = /make a pod for (.+)/i.exec(last.content ?? "")?.[1];
      if (last.role === "tool") {
        told.push(String(last.content));
        send({ content: "Done." });
        send({}, "stop");
        response.end("data: [DONE]\n\n");
      } else if (named !== undefined)
        call("open_pod", { pod: named.toLowerCase().replace(/\s+/g, "-") });
      else if (person !== undefined) call("make_pod", { person });
      else {
        response.on("close", () => {
          if (!response.writableFinished) stopped += 1;
        });
        const talk = setInterval(
          () => send({ content: "Once upon a time. " }),
          30,
        );
        response.on("close", () => clearInterval(talk));
      }
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    stopped: () => stopped,
    told: () => [...told],
    close: () => new Promise((done) => server.close(() => done())),
  };
}

let built: Promise<string> | undefined;

/** The app built once, as `npm start` builds it, into a folder of its own that each copy is given, newer than its sources, so `npm start` serves it as it is. */
function builtOnce(): Promise<string> {
  built ??= (async () => {
    const out = await mkdtemp(join(tmpdir(), "t273-dist-"));
    const vite = spawn(
      process.execPath,
      [
        join(ROOT, "node_modules", "vite", "bin", "vite.js"),
        "build",
        "--outDir",
        out,
        "--emptyOutDir",
        "--logLevel",
        "warn",
      ],
      { cwd: APP, stdio: ["ignore", "inherit", "inherit"] },
    );
    const code = await new Promise((done) => vite.on("exit", done));
    assert.equal(code, 0, "the React app did not build");
    return out;
  })();
  return built;
}

type Started = {
  origin: string;
  /** The address the server printed, whose token is traded once for the cookie. */
  launch: string;
  folder: string;
  stop: (keep?: boolean) => Promise<void>;
};

/**
 * A copy of the starter in a folder of its own, running what its `npm start` runs, without npm between, so that a
 * stop stops the server, on a port the system picks; `env` is the model's settings.
 * Given the `folder` of an earlier copy that `stop(true)` kept, it starts again in it, with its pods.
 */
async function startStarter(
  env: Record<string, string>,
  again?: string,
  { trade = true } = {},
): Promise<Started> {
  const folder = again ?? (await mkdtemp(join(tmpdir(), "t273-")));
  if (again === undefined) {
    await cp(APP, folder, {
      recursive: true,
      filter: (from) =>
        !/[\\/](node_modules|pods|dist|dist-browser|\.env)$/.test(from),
    });
    await symlink(
      join(ROOT, "node_modules"),
      join(folder, "node_modules"),
      "junction",
    );
    await cp(await builtOnce(), join(folder, "dist"), { recursive: true });
  }
  const settings: Record<string, string | undefined> = {
    ...process.env,
    PORT: "0",
    CASCADE_MODEL_PROVIDER: undefined,
    CASCADE_MODEL_URL: undefined,
    CASCADE_MODEL_NAME: undefined,
    CASCADE_MODEL_KEY: undefined,
    ...env,
  };
  const { scripts } = JSON.parse(
    await readFile(join(folder, "package.json"), "utf8"),
  ) as { scripts: { start: string } };
  const [command, ...args] = scripts.start.split(" ");
  assert.equal(command, "node", `npm start runs ${scripts.start}`);
  const child: ChildProcess = spawn(process.execPath, args, {
    cwd: folder,
    env: settings,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let said = "";
  child.stderr!.on("data", (chunk: Buffer) => (said += chunk));
  const [origin, launch] = await new Promise<[string, string]>(
    (found, failed) => {
      child.stdout!.on("data", (chunk: Buffer) => {
        const at = /(http:\/\/127\.0\.0\.1:\d+)\/\?launch=[\w-]+/.exec(
          chunk.toString(),
        );
        if (at) found([at[1]!, at[0]]);
      });
      child.on("exit", () => failed(new Error(`the starter stopped: ${said}`)));
    },
  );
  if (trade) await tradeLaunch(origin, launch);
  return {
    origin,
    launch,
    folder,
    async stop(keep = false) {
      const exited = new Promise((done) => child.on("exit", done));
      child.kill();
      await exited;
      if (keep) return;
      await unlink(join(folder, "node_modules"));
      await rm(folder, { recursive: true, force: true });
    },
  };
}

/** The cookie of each started copy, as a request carries it, by its origin; a cookie's name has the port in it. */
const cookies = new Map<string, string>();

/** Opens the address the server printed as a page does, and keeps the cookie it is given for `post()` and the browser's pages. */
async function tradeLaunch(origin: string, launch: string) {
  const answered = await fetch(launch, { redirect: "manual" });
  assert.equal(
    answered.status,
    303,
    "the printed address is traded for a cookie",
  );
  const [pair = ""] = (answered.headers.get("set-cookie") ?? "").split(";");
  assert.match(pair, /^cascade-launch-\d+=/);
  cookies.set(origin, pair);
}

/** A page whose browser holds the cookie of every copy started so far, and closes its context with it. */
async function newPage(options: Parameters<Browser["newContext"]>[0] = {}) {
  const context = await browser.newContext(options);
  await jarred(context);
  const page = await context.newPage();
  page.on("close", () => void context.close().catch(() => undefined));
  return page;
}

/** Puts the cookie of every copy started so far into `context`. */
const jarred = (context: Awaited<ReturnType<Browser["newContext"]>>) =>
  context.addCookies(
    [...cookies].map(([origin, pair]) => {
      const [name = "", ...value] = pair.split("=");
      return { name, value: value.join("="), url: origin };
    }),
  );

const post = (origin: string, path: string, body: object) =>
  fetch(origin + path, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      cookie: cookies.get(origin) ?? "",
    },
    body: JSON.stringify(body),
  });

let stub: Stub;
let browser: Browser;
let modelled: Started;
let bare: Started;

before(async () => {
  stub = await stubModel();
  modelled = await startStarter({
    CASCADE_MODEL_PROVIDER: "other",
    CASCADE_MODEL_URL: stub.url,
    CASCADE_MODEL_NAME: "stub-1",
    CASCADE_MODEL_KEY: KEY,
  });
  bare = await startStarter({});
  for (const person of ["Ada Lovelace", "Ines Calloway"]) {
    const made = await post(modelled.origin, "/api/makePod", { person });
    assert.equal(made.status, 200, person);
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await modelled?.stop();
  await bare?.stop();
  await stub?.close();
  if (built !== undefined)
    await rm(await built, { recursive: true, force: true });
});

/** Asks `text` in the chat's form, as a person does. */
async function ask(page: Page, text: string) {
  await page.getByLabel("Ask a question").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

/** What the page keeps in `localStorage` and `sessionStorage`. */
const storage = (page: Page) =>
  page.evaluate(() => ({
    chats: JSON.parse(localStorage.getItem("cascade.chats") ?? "[]") as {
      id: string;
      pod: string;
      title: string;
    }[],
    open: sessionStorage.getItem("cascade.chat.open"),
    all: JSON.stringify([{ ...localStorage }, { ...sessionStorage }]),
  }));

/** The names of the pods the app served by Node lists. */
const podNames = async (): Promise<string[]> =>
  (
    (await (await post(modelled.origin, "/api/pods", {})).json()) as {
      pods: { name: string }[];
    }
  ).pods.map(({ name }) => name);

/** Makes an encrypted pod for `person` on the app `on` and confirms its six words, as the page does; gives the pod's name. */
async function encryptedPod(
  person: string,
  on: Started = modelled,
): Promise<string> {
  const made = (await (
    await post(on.origin, "/api/makePod", { person, encrypt: true })
  ).json()) as { pod: string };
  const { words } = (await (
    await post(on.origin, "/api/waitingWords", { pod: made.pod })
  ).json()) as { words: string };
  const six = words.split(" ");
  const opened = await post(on.origin, "/api/confirmWords", {
    pod: made.pod,
    word2: six[1],
    word5: six[4],
    password: words,
    username: made.pod,
  });
  assert.equal(opened.status, 200);
  return made.pod;
}

/** The page's `POST /chat` answered with `chunks` as the AI SDK's UI message stream, as the app's server answers; the model is still named by the app. */
const answering = (page: Page, chunks: object[]) =>
  page.route("**/chat", (route) =>
    route.request().method() !== "POST"
      ? route.continue()
      : route.fulfill({
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            "x-vercel-ai-ui-message-stream": "v1",
          },
          body: [
            { type: "start" },
            ...chunks,
            { type: "finish", finishReason: "stop" },
          ]
            .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
            .concat("data: [DONE]\n\n")
            .join(""),
        }),
  );

/** A step of the model's in which it says `text`. */
const saying = (text: string) => [
  { type: "start-step" },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: text },
  { type: "text-end", id: "t" },
  { type: "finish-step" },
];

/** Puts an "Ask about this" button for `context`, labelled `label`, on the page, as a card of the app carries one; gives its locator. */
const askAbout = async (
  page: Page,
  context: object,
  label: string,
): Promise<Locator> => {
  await page.evaluate(
    ([data, text]) => {
      document.body.insertAdjacentHTML(
        "beforeend",
        `<button id="asker" data-ask='${data}' data-ask-label="${text}">Ask about this</button>`,
      );
    },
    [JSON.stringify(context), label] as const,
  );
  return page.locator("#asker");
};

const isPost = (request: { url(): string; method(): string }) =>
  request.url().endsWith("/chat") && request.method() === "POST";

/** A page with the chat window open on a long answer about a long label, in a window of this size. */
const openOnLongAnswer = async (width: number, height: number) => {
  const page = await newPage({ viewport: { width, height } });
  await answering(page, saying("A long answer. ".repeat(400)));
  await page.goto(`${modelled.origin}/pods/ines-calloway/`);
  const label = "A long label about one finding of the pod. ".repeat(6);
  await page.getByLabel("Ask a question").waitFor();
  await (await askAbout(page, { kind: "finding", key: "x" }, label)).click();
  await page
    .locator(".chat-log .model", { hasText: "A long answer" })
    .waitFor();
  await page.locator(".chat-send:not([hidden])").waitFor();
  return { page, label };
};

/** Every file under `folder`, by path relative to it. */
async function filesUnder(folder: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(folder, {
    recursive: true,
    withFileTypes: true,
  }))
    if (entry.isFile())
      found.push(join(entry.parentPath, entry.name).slice(folder.length + 1));
  return found;
}

/**
 * The chat add-on puts a chat window on every page of the app; a question goes to the model the app was set up with
 * (`npm run model`), and the model reads the pod with the app's tools. These leaves are what only a browser shows:
 * what the window keeps, where it follows, and what never leaves the server.
 */
describe("Chatting with a model about a pod · add-ons/chat", () => {
  test("when a model answers a question with a request to open another pod", async (t) => {
    const page = await newPage();
    await page.goto(`${modelled.origin}/pods/ada-lovelace/`);
    await inPlace(page, async () => {
      await ask(page, ASKS);
      await page.waitForURL(`${modelled.origin}/pods/ines-calloway/`);
      await page.locator(".chat-log .model", { hasText: "Done." }).waitFor();
    });
    await page
      .locator("h1", { hasText: /^Ines Calloway$/ })
      .first()
      .waitFor();
    await t.test(
      "moves the app to the other pod without loading a page",
      async () => {
        assert.equal(new URL(page.url()).pathname, "/pods/ines-calloway/");
        assert.ok(
          (await page.locator("h1", { hasText: /^Ines Calloway$/ }).count()) >
            0,
        );
      },
    );
    await t.test(
      "keeps the question and the answer in the open chat",
      async () => {
        assert.equal(await page.locator(".chat-log .you").textContent(), ASKS);
        assert.equal(
          await page.locator(".chat-log .model").textContent(),
          "Done.",
        );
      },
    );
    await t.test(
      "lists the chat under Recent chats by its question",
      async () => {
        assert.equal(
          await page.locator(".chat-recent li button").textContent(),
          ASKS,
        );
      },
    );
    await page.waitForFunction(
      (title) =>
        (
          JSON.parse(localStorage.getItem("cascade.chats") ?? "[]") as {
            title: string;
            pod: string;
          }[]
        ).some((each) => each.title === title && each.pod === "ines-calloway"),
      ASKS,
    );
    await t.test(
      "stores the chat under the pod it moved to, as the tab's open chat",
      async () => {
        const { chats, open } = await storage(page);
        assert.deepEqual(
          chats
            .filter(({ title }) => title === ASKS)
            .map(({ id, pod }) => [id, pod]),
          [[open, "ines-calloway"]],
        );
      },
    );
    await page.close();
  });

  test("when a person clicks to another pod after a chat about the pod shown", async (t) => {
    const page = await newPage();
    await page.goto(`${modelled.origin}/pods/ines-calloway/`);
    await ask(page, ASKS);
    await page.locator(".chat-log .model", { hasText: "Done." }).waitFor();
    await page.locator("aside nav a", { hasText: "Ada Lovelace" }).click();
    await page
      .locator("h1", { hasText: /^Ada Lovelace$/ })
      .first()
      .waitFor();
    await t.test(
      "leaves the chat with its own pod, so the other pod's window holds no message",
      async () => {
        assert.equal(await page.locator(".chat-log .you").count(), 0);
      },
    );
    await t.test("lists no recent chat for the other pod", async () => {
      assert.equal(await page.locator(".chat-recent li button").count(), 0);
    });
    await page.close();
  });

  test("when Stop is pressed while the model is answering", async (t) => {
    const page = await newPage();
    await page.goto(`${modelled.origin}/pods/ada-lovelace/`);
    await ask(page, "tell me a long story");
    await page.locator(".chat-log .model", { hasText: "Once upon" }).waitFor();
    await page.getByRole("button", { name: "Stop" }).click();
    await page.locator(".chat-log .stopped").waitFor();
    await t.test("marks the answer as stopped", async () => {
      assert.equal(await page.locator(".chat-log .stopped").count(), 1);
    });
    for (let waited = 0; stub.stopped() === 0 && waited < 5000; waited += 50)
      await new Promise((done) => setTimeout(done, 50));
    await t.test("ends the server's call to the model", async () => {
      assert.equal(stub.stopped(), 1);
    });
    await page.close();
  });

  test("with no model set", async (t) => {
    const page = await newPage();
    await page.goto(`${bare.origin}/`);
    await page.locator(".chat-off").waitFor();
    await t.test("says to run `npm run model`", async () => {
      assert.match(
        (await page.locator(".chat").textContent()) ?? "",
        /npm run model/,
      );
    });
    await t.test("shows no question form", async () => {
      assert.equal(await page.locator(".chat-form").count(), 0);
    });
    await page.close();
  });

  test("with a model set", async (t) => {
    const seen: Promise<string>[] = [];
    const seeing = await newPage();
    seeing.on("request", (request) =>
      seen.push(
        Promise.resolve(`${request.url()} ${request.postData() ?? ""}`),
      ),
    );
    seeing.on("response", (response) =>
      seen.push(response.text().catch(() => "")),
    );
    await seeing.goto(`${modelled.origin}/pods/ada-lovelace/`);
    await t.test(
      "names the model and where it runs in the window's bar",
      async () => {
        assert.equal(
          await seeing.locator(".chat-bar .muted").textContent(),
          "stub-1, on this computer",
        );
      },
    );
    await ask(seeing, ASKS);
    await seeing.locator(".chat-log .model", { hasText: "Done." }).waitFor();
    seen.push(storage(seeing).then(({ all }) => all));
    seen.push(seeing.content());
    const shown = (await Promise.all(seen)).join("\n");
    await seeing.close();
    assert.match(shown, /"type":"tool-input-available"/);
    await t.test("names the model to the page by its name", async () => {
      assert.match(shown, /"name":"stub-1"/);
    });
    await t.test(
      "never sends the model's key or address to the page, a request, a stream or the browser's storage",
      async () => {
        assert.equal(shown.includes(KEY), false);
        assert.equal(shown.includes(stub.url), false);
      },
    );
  });

  test("when a tool the model asked for returns a finding", async (t) => {
    const view = "/pods/ines-calloway/trend?test=18262-6&medication=617310";
    const finding = {
      key: "start:617310:18262-6",
      kind: "after start",
      direction: "down",
      said: "LDL was lower after atorvastatin started.",
      unit: "mg/dL",
      test: { code: "18262-6", notation: "18262-6", name: "LDL" },
      medication: {
        name: "atorvastatin",
        date: "2024-03-01",
        dateIs: "start of use",
      },
      before: { count: 2, mean: 160, min: 150, max: 170 },
      after: { count: 1, mean: 95, min: 95, max: 95 },
      view,
      rows: [
        {
          entry: "lab-1",
          performed: "2024-01-10T00:00:00Z",
          value: "150",
          unit: "mg/dL",
          side: "before",
        },
        {
          entry: "lab-2",
          performed: "2024-06-10T00:00:00Z",
          value: "95",
          unit: "mg/dL",
          side: "after",
        },
      ],
    };
    const page = await newPage();
    await answering(page, [
      { type: "start-step" },
      {
        type: "tool-input-available",
        toolCallId: "c1",
        toolName: "find_changes",
        input: { pod: "ines-calloway" },
      },
      { type: "tool-output-available", toolCallId: "c1", output: [finding] },
      { type: "finish-step" },
      ...saying("Here it is."),
    ]);
    await page.goto(`${modelled.origin}/pods/ines-calloway/`);
    await ask(page, "find anything interesting");
    const card = page.locator(".chat-log .card");
    await card.waitFor();
    await t.test(
      "draws the finding as a card with the app's sentence",
      async () => {
        assert.match(
          (await card.textContent()) ?? "",
          /LDL was lower after atorvastatin started\./,
        );
      },
    );
    await t.test(
      "says each side's mean, unit and count of results",
      async () => {
        const said = (await card.textContent()) ?? "";
        assert.match(said, /mean 160 mg\/dL over 2 results/);
        assert.match(said, /mean 95 mg\/dL over 1 result\b/);
      },
    );
    await t.test("links each result of the finding to its entry", async () => {
      assert.deepEqual(
        await card
          .locator("li a")
          .evaluateAll((links) =>
            links.map((link) => link.getAttribute("href")),
          ),
        [
          "/pods/ines-calloway/entries/lab-1",
          "/pods/ines-calloway/entries/lab-2",
        ],
      );
    });
    await inPlace(page, async () => {
      await card.getByRole("button", { name: "Open the trend" }).click();
      await page.waitForURL(`${modelled.origin}${view}`);
    });
    await t.test(
      "opens the trend at the finding's address, without loading a page, from Open the trend",
      async () => {
        assert.equal(page.url(), modelled.origin + view);
      },
    );
    await page.close();
  });

  test("when a person clicks Ask about this on an entry", async (t) => {
    const page = await newPage();
    await answering(page, saying("Here it is."));
    await page.goto(`${modelled.origin}/pods/ines-calloway/`);
    await page.getByLabel("Ask a question").waitFor();
    const lisinopril = await askAbout(
      page,
      { kind: "entry", id: "x" },
      "Lisinopril",
    );
    const sent = page.waitForRequest(isPost);
    await lisinopril.click();
    const body = (await sent).postDataJSON();
    await t.test("sends the entry as the chat's context", async () => {
      assert.deepEqual(body.context, { kind: "entry", id: "x" });
    });
    await t.test(
      'asks "What is this, and where did it come from?" as the person\'s question',
      async () => {
        assert.deepEqual(
          body.messages.map(
            ({ role, parts }: { role: string; parts: unknown }) => ({
              role,
              parts,
            }),
          ),
          [
            {
              role: "user",
              parts: [
                {
                  type: "text",
                  text: "What is this, and where did it come from?",
                },
              ],
            },
          ],
        );
      },
    );
    await t.test(
      'shows "About:" and the entry\'s name above the chat',
      async () => {
        assert.equal(
          await page.locator(".chat-about").textContent(),
          "About: Lisinopril",
        );
      },
    );
    await t.test("hides the suggested questions", async () => {
      assert.equal(await page.locator(".chat-chips").isHidden(), true);
    });
    await page.locator(".chat-log .model").waitFor();
    await t.test("draws the model's answer under the question", async () => {
      assert.equal(
        await page.locator(".chat-log .you").textContent(),
        "What is this, and where did it come from?",
      );
      assert.match(
        (await page.locator(".chat-log .model").textContent()) ?? "",
        /^Here it is\./,
      );
    });
    await page.close();
  });

  test("when Ask about this is double-clicked", async (t) => {
    const page = await newPage();
    await answering(page, saying("Here it is."));
    await page.goto(`${modelled.origin}/pods/ines-calloway/`);
    await page.getByLabel("Ask a question").waitFor();
    const aspirin = await askAbout(page, { kind: "entry", id: "y" }, "Aspirin");
    let requests = 0;
    page.on("request", (request) => {
      if (isPost(request)) requests += 1;
    });
    await aspirin.dblclick();
    await page.locator(".chat-about", { hasText: "Aspirin" }).waitFor();
    await page.locator(".chat-log .model").waitFor();
    await page.locator(".chat-send:not([hidden])").waitFor();
    await t.test("sends one request to the model", async () => {
      assert.equal(requests, 1);
    });
    await page.close();
  });
});

/**
 * A tool of the tier `ask` changes the app, so the page asks the person before it runs. `make_pod` is the one the
 * tests use: nothing is made until the person presses Allow.
 */
describe("Confirming a write a model asks for · make_pod", () => {
  test("when the model asks to make a pod and the person presses Cancel", async (t) => {
    const page = await newPage();
    await page.goto(`${modelled.origin}/pods/ada-lovelace/`);
    const asking = page.getByRole("alertdialog");
    await ask(page, "make a pod for Cora Diaz");
    await asking.waitFor();
    await t.test(
      "names the write and the person in the confirm box",
      async () => {
        assert.match(
          (await asking.textContent()) ?? "",
          /Make a pod.*Cora Diaz/,
        );
      },
    );
    await asking.getByRole("button", { name: "Cancel" }).click();
    await page.locator(".chat-log .model", { hasText: "Done." }).waitFor();
    await t.test('tells the model "The person said no"', async () => {
      assert.ok(stub.told().includes("The person said no"), stub.told().join());
    });
    await t.test("makes no pod", async () => {
      assert.equal((await podNames()).includes("cora-diaz"), false);
    });
    await page.close();
  });

  test("when the model asks to make a pod and the person presses Allow", async (t) => {
    const page = await newPage();
    await page.goto(`${modelled.origin}/pods/ada-lovelace/`);
    await ask(page, "make a pod for Cora Diaz");
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Allow" })
      .click();
    await page.locator("aside nav a", { hasText: "Cora Diaz" }).waitFor();
    await t.test("makes the pod", async () => {
      assert.equal((await podNames()).includes("cora-diaz"), true);
    });
    await t.test("lists the new pod among the app's pods", async () => {
      assert.equal(
        await page.locator("aside nav a", { hasText: "Cora Diaz" }).count(),
        1,
      );
    });
    await page.close();
  });

  test("when the chat is closed while a write waits for its answer", async (t) => {
    const page = await newPage();
    await page.goto(`${modelled.origin}/pods/ada-lovelace/`);
    const posts: string[] = [];
    page.on("request", (request) => {
      if (isPost(request)) posts.push(request.url());
    });
    await ask(page, "make a pod for Dora Xu");
    const asking = page.getByRole("alertdialog");
    await asking.waitFor();
    const asked = posts.length;
    await page.getByRole("button", { name: "New chat" }).dispatchEvent("click");
    await asking.waitFor({ state: "detached" });
    await t.test("closes the confirm box", async () => {
      assert.equal(await asking.count(), 0);
    });
    await page.waitForTimeout(500);
    await t.test("makes no pod", async () => {
      assert.equal((await podNames()).includes("dora-xu"), false);
    });
    await t.test("sends the model nothing more", async () => {
      assert.equal(posts.length, asked);
    });
    await page.close();
  });
});

/**
 * The window is a strip at the foot of the page. On a phone it must not cover the page's own content or push its
 * question box out of view.
 */
describe("Fitting the chat window on a small screen · add-ons/chat", () => {
  test("with a long answer open in a 375 by 667 window and in an 844 by 390 one", async (t) => {
    const fits: { width: number; height: number; y: number; box: number }[] =
      [];
    for (const [width, height] of [
      [375, 667],
      [844, 390],
    ] as const) {
      const { page } = await openOnLongAnswer(width, height);
      await page.evaluate(() => window.scrollTo(0, 0));
      const input = (await page.locator(".chat-form input").boundingBox())!;
      fits.push({ width, height, y: input.y, box: input.height });
      await page.close();
    }
    await t.test(
      "keeps the question box in view with the page scrolled to its top",
      async () => {
        for (const { width, height, y, box } of fits)
          assert.ok(
            y >= 0 && y + box <= height,
            `at ${width}x${height} the question box is ${y}+${box}`,
          );
      },
    );
  });

  test("with a long answer about a long name open on a phone", async (t) => {
    const { page, label } = await openOnLongAnswer(390, 600);
    const box = async (selector: string) =>
      (await page.locator(selector).boundingBox())!;
    await t.test("clamps the About line to one line", async () => {
      const lines = await page
        .locator(".chat-about")
        .evaluate(
          (element) =>
            element.getBoundingClientRect().height /
            parseFloat(getComputedStyle(element).lineHeight),
        );
      assert.ok(lines <= 1.05, `the About line is ${lines} lines`);
    });
    await t.test("keeps the whole name as the About line's title", async () => {
      assert.equal(
        await page.locator(".chat-about").getAttribute("title"),
        `About: ${label}`,
      );
    });
    await t.test("opens the answer at its question", async () => {
      const log = await box(".chat-log");
      const question = await box(".chat-log .you");
      assert.ok(
        question.y >= log.y - 1 &&
          question.y + question.height <= log.y + log.height,
        `question ${question.y}+${question.height}, log ${log.y}+${log.height}`,
      );
    });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await t.test(
      "ends the page's own content above the window when the page is scrolled to its end",
      async () => {
        const strip = await box(".chat");
        const last = await page.evaluate(
          () => document.querySelector("main")!.getBoundingClientRect().bottom,
        );
        assert.ok(
          last <= strip.y + 1,
          `the page ends at ${last}, the strip starts at ${strip.y}`,
        );
      },
    );
    await page.reload();
    await t.test(
      "opens the answer at its question again after a reload",
      async () => {
        const reopened = await box(".chat-log .you");
        const room = await box(".chat-log");
        assert.ok(
          reopened.y >= room.y - 1 &&
            reopened.y + reopened.height <= room.y + room.height,
          `after a reload the question is ${reopened.y}+${reopened.height}, the log ${room.y}+${room.height}`,
        );
      },
    );
    await page.close();
  });

  test("with a long answer open in a desktop window", async (t) => {
    const page = await newPage({
      viewport: { width: 1100, height: 850 },
    });
    await answering(page, saying("A long answer. ".repeat(400)));
    await page.goto(`${modelled.origin}/pods/ines-calloway/`);
    await ask(page, "say a lot");
    await page
      .locator(".chat-log .model", { hasText: "A long answer" })
      .waitFor();
    const strip = page.locator(".chat");
    const height = async () => (await strip.boundingBox())!.height;
    await t.test("keeps the window under half the page's height", async () => {
      assert.ok(
        (await height()) < 850 / 2,
        `the strip is ${await height()} px`,
      );
    });
    await t.test("scrolls the answer inside the window", async () => {
      assert.ok(
        await page
          .locator(".chat-log")
          .evaluate((log) => log.scrollHeight > log.clientHeight),
        "the log scrolls inside the strip",
      );
    });
    await page.getByRole("button", { name: "Hide chat" }).click();
    await t.test("folds to its bar from Hide chat", async () => {
      assert.equal(await page.locator(".chat-form").isVisible(), false);
      const bar = await height();
      assert.ok(bar < 100, `the bar is ${bar} px`);
    });
    await page.reload();
    await t.test("stays folded after a reload", async () => {
      assert.equal(await page.locator(".chat-form").isVisible(), false);
    });
    await page.getByRole("button", { name: "Show chat" }).click();
    await t.test("unfolds from Show chat", async () => {
      assert.equal(await page.locator(".chat-form").isVisible(), true);
    });
    await page.getByRole("button", { name: "Hide chat" }).click();
    await page.locator(".chat-recent summary").click();
    await page.locator(".chat-recent li button").first().click();
    await t.test("unfolds when a recent chat is opened", async () => {
      assert.equal(await page.locator(".chat-form").isVisible(), true);
    });
    await page.close();
  });
});

/** `npm start` prints an address with a token that is traded once for the cookie the pages' reads of a pod need. */
describe("Opening the app from the address it printed · ?launch=<token>", () => {
  test("with a copy that has not been opened yet", async (t) => {
    const fresh = await startStarter({}, undefined, { trade: false });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(fresh.launch);
      await page.getByRole("heading", { name: "No pods yet" }).waitFor();
      await page.waitForFunction(() => document.body.dataset.state === "ready");
      await t.test(
        "leaves the app at its own address, with no token in it, and reads the pods: the page holds the cookie",
        async () => {
          assert.equal(page.url(), `${fresh.origin}/`);
        },
      );
      await t.test(
        "holds a cookie that the page's own script cannot read, and that other sites do not send",
        async () => {
          const [cookie, ...rest] = await context.cookies(fresh.origin);
          assert.equal(rest.length, 0);
          assert.match(cookie!.name, /^cascade-launch-\d+$/);
          assert.equal(cookie!.httpOnly, true);
          assert.equal(cookie!.sameSite, "Strict");
          assert.equal(cookie!.path, "/");
          assert.equal(await page.evaluate(() => document.cookie), "");
          assert.ok(!fresh.launch.includes(cookie!.value));
        },
      );
      const again = await browser.newContext();
      const second = await again.newPage();
      const answered = await second.goto(fresh.launch);
      await t.test(
        "refuses the same address in another browser, which says to start the app again",
        async () => {
          assert.equal(answered?.status(), 403);
          assert.match(
            (await second.locator("body").textContent()) ?? "",
            /Start the app again/,
          );
          assert.deepEqual(await again.cookies(fresh.origin), []);
        },
      );
      await context.close();
      await again.close();
    } finally {
      await fresh.stop();
    }
  });
});

describe("Offering the app's tools to a browser's agent · document.modelContext", () => {
  test("with the app served by Node", async (t) => {
    const context = await browser.newContext();
    await jarred(context);
    await context.addInitScript(recordTools);
    try {
      const page = await context.newPage();
      await page.goto(`${modelled.origin}/pods/ines-calloway/`);
      const { names } = await listed();
      await page.waitForFunction(
        (count) =>
          (globalThis as unknown as Registered).registered.length >= count,
        names.length,
      );
      await t.test("offers every tool of the app's tool list", async () => {
        assert.deepEqual(await offered(page), names);
      });
      await t.test(
        "leaves the pod out of a tool's input on a pod's page",
        async () => {
          assert.deepEqual(await inputOf(page, "open_trend", false), {
            properties: ["test", "medication"],
            required: ["test"],
          });
        },
      );
      await t.test("answers `list_pods` with the app's pods", async () => {
        const pods = await called(page, "list_pods");
        assert.ok("result" in pods, JSON.stringify(pods));
        assert.ok((pods.result as string[]).includes("ines-calloway"));
      });
      await t.test("runs `ask` over the server", async () => {
        const rows = await called(
          page,
          "ask",
          { question: "pod/My lab results" },
          false,
        );
        assert.ok("result" in rows, JSON.stringify(rows));
      });
    } finally {
      await context.close();
    }
  });
});

describe("Connecting to a demo hospital · Sign in at", () => {
  test("with the app served by Node, when a person allows the sign-in", async (t) => {
    const made = await post(bare.origin, "/api/makePod", {
      person: "Ines Calloway",
    });
    assert.equal(made.status, 200);
    const page = await newPage();
    await page.goto(`${bare.origin}/pods/ines-calloway/`);
    const signIn = page.getByRole("button", { name: /^Sign in at / }).first();
    await signIn.click();
    const allow = page.getByRole("button", { name: "Allow" });
    await allow.waitFor();
    await page.goBack();
    await page.waitForSelector('body[data-state="ready"]');
    await t.test(
      "brings back a ready page, its buttons on, after Back from the hospital's sign-in page",
      async () => {
        assert.ok(
          await signIn.isEnabled(),
          "Back after the sign-in's full page left its buttons off",
        );
      },
    );
    await signIn.click();
    await allow.click();
    const bring = page.getByRole("button", { name: /^Bring it into / });
    await bring.waitFor({ timeout: 30_000 });
    await t.test(
      "moves on by itself to Bring it in, on the app's own address",
      async () => {
        assert.equal(await bring.isVisible(), true);
        assert.equal(new URL(page.url()).origin, bare.origin);
      },
    );
    await bring.click();
    await page
      .locator("main .note", { hasText: /^Brought in the record from / })
      .waitFor({ timeout: 60_000 });
    await t.test(
      'says "Brought in the record from" the hospital on the pod\'s page',
      async () => {
        assert.match(
          (await page.locator("main .note").textContent()) ?? "",
          /^Brought in the record from /,
        );
      },
    );
    await page.close();
  });

  /** Opens the pod's page, finds Cascade North, signs in as Ines Calloway and waits for the connection's box. */
  const signedInAsInes = async (page: Page, origin: string, pod: string) => {
    await page.goto(`${origin}/pods/${pod}/`);
    await page.getByRole("link", { name: "Find a hospital" }).click();
    await page
      .getByRole("heading", { name: "Cascade North" })
      .locator("xpath=..")
      .getByRole("button", { name: "Sign in" })
      .click();
    await page.getByLabel("Calloway, Ines").check();
    await page.getByRole("button", { name: "Allow" }).click();
    const box = page.locator("#connection");
    await box.getByRole("button", { name: /^Bring / }).waitFor();
    return box;
  };

  test("with a pod made without a name, when a record is brought into it", async (t) => {
    // An app of its own: a pod titled "Ines Calloway" in the shared one (made above) would share the title.
    let own = await startStarter({});
    await promisify(execFile)(
      process.execPath,
      ["pod.ts", "new", "walker-test"],
      {
        cwd: own.folder,
      },
    );
    const page = await newPage();
    const box = await signedInAsInes(page, own.origin, "walker-test");
    await t.test(
      "says the record is Ines Calloway's and bringing it in makes this her pod",
      async () => {
        assert.match(
          (await box.textContent()) ?? "",
          /This record is Ines Calloway's\. Bringing it in makes this Ines Calloway's pod\./,
        );
        assert.equal(
          await box.getByRole("button", { name: /^Bring / }).textContent(),
          "Bring it into Ines Calloway's pod",
        );
      },
    );
    await box.getByRole("button", { name: /^Bring / }).click();
    await page
      .locator("main .note", { hasText: /^Brought in the record from / })
      .waitFor({ timeout: 60_000 });
    /** What the page names the pod: its heading, its entry in the sidebar and its tab. */
    const named = async (on: Page) => ({
      heading: (await on.locator("main h1").first().textContent())?.trim(),
      sidebar: (
        await on.locator('aside nav a[href="/pods/walker-test/"]').textContent()
      )?.trim(),
      tab: await on.title(),
    });
    await t.test(
      "names the pod for the record's person in its heading, sidebar and tab, with no reload",
      async () => {
        const { heading, sidebar, tab } = await named(page);
        assert.equal(heading, "Ines Calloway");
        assert.equal(sidebar, "Ines Calloway");
        assert.match(tab, /Ines Calloway/);
      },
    );
    await page.reload();
    await page.locator("main h1", { hasText: /\S/ }).first().waitFor();
    await t.test("names it so after a reload", async () => {
      assert.deepEqual(
        {
          ...(await named(page)),
          tab: /Ines Calloway/.test(await page.title()),
        },
        { heading: "Ines Calloway", sidebar: "Ines Calloway", tab: true },
      );
    });
    await page.close();

    await own.stop(true);
    own = await startStarter({}, own.folder);
    const again = await newPage();
    await again.goto(`${own.origin}/pods/walker-test/`);
    await again.locator("main h1", { hasText: /\S/ }).first().waitFor();
    await t.test(
      "names it so after the app is stopped and started",
      async () => {
        assert.deepEqual(
          {
            ...(await named(again)),
            tab: /Ines Calloway/.test(await again.title()),
          },
          { heading: "Ines Calloway", sidebar: "Ines Calloway", tab: true },
        );
      },
    );
    await again.close();
    await own.stop();
  });

  test("with an encrypted pod made with a name, when another person's record is brought into it", async (t) => {
    const pod = await encryptedPod("Cy Sealed", bare);
    const page = await newPage();
    const box = await signedInAsInes(page, bare.origin, pod);
    await t.test(
      "says whose record it is and that the pod keeps its name, and names no one else as the pod's owner",
      async () => {
        const said = (await box.innerText()) ?? "";
        assert.match(
          said,
          /This record is Ines Calloway's, not Cy Sealed's[.]\s+Bringing it in leaves this pod named Cy Sealed\./,
        );
        assert.doesNotMatch(said, /makes this/);
        assert.equal(
          await box.getByRole("button", { name: /^Bring / }).textContent(),
          "Bring Ines Calloway's records into Cy Sealed's pod anyway",
        );
      },
    );
    await box.getByRole("button", { name: /^Bring / }).click();
    await page
      .locator("main .note", { hasText: /^Brought in the record from / })
      .waitFor({ timeout: 60_000 });
    await t.test("keeps the name in its heading and sidebar", async () => {
      assert.equal(
        (await page.locator("main h1").first().textContent())?.trim(),
        "Cy Sealed",
      );
      assert.equal(
        (
          await page.locator(`aside nav a[href="/pods/${pod}/"]`).textContent()
        )?.trim(),
        "Cy Sealed",
      );
    });
    await page.close();
  });

  test("with an address of a connection the app does not hold", async (t) => {
    const made = await post(bare.origin, "/api/makePod", {
      person: "Ada Lovelace",
    });
    assert.equal(made.status, 200);
    const page = await newPage();
    await page.goto(`${bare.origin}/pods/ada-lovelace/connections/999`);
    await page.locator("h1", { hasText: /^Ada Lovelace$/ }).waitFor();
    await t.test("opens no box for a connection the pod lacks", async () => {
      assert.equal(await page.locator("#connection").count(), 0);
    });
    await page.goto(`${bare.origin}/pods/nobody-here/connections/1`);
    await page.locator("h1", { hasText: /^Not found$/ }).waitFor();
    await t.test("draws Not found for a pod the app lacks", async () => {
      assert.equal((await page.textContent("h1"))?.trim(), "Not found");
    });
    await page.close();
  });
});

describe("Encrypting a pod with six words · Encrypt this pod with six words", () => {
  test("with an encrypted pod's chat", async (t) => {
    const pod = await encryptedPod("Grace Hopper");
    const page = await newPage();
    await page.goto(`${modelled.origin}/pods/${pod}/`);
    await ask(page, "tell me a long story about Grace");
    await page.locator(".chat-log .model", { hasText: "Once upon" }).waitFor();
    await page.getByRole("button", { name: "Stop" }).click();
    await page.locator(".chat-log .stopped").waitFor();
    await t.test(
      "never stores the chat in localStorage or sessionStorage",
      async () => {
        const { all } = await storage(page);
        assert.equal(all.includes("long story about Grace"), false, all);
      },
    );
    await page.close();
  });

  /**
   * A question sent before the app has said the pod is encrypted, whose answer moves the chat to another pod: the
   * lookup is held until the chat has moved, so the follow happens with the encryption unknown.
   */
  test("when an answer moves the chat to another pod before the app knows the pod is encrypted", async (t) => {
    const pod = await encryptedPod("Katherine Johnson");
    const page = await newPage();
    let release = () => {};
    const held = new Promise<void>((done) => (release = done));
    await page.route("**/api/pod", async (route) => {
      if (route.request().postData()?.includes(pod) === true) await held;
      await route.continue();
    });
    await page.goto(`${modelled.origin}/pods/${pod}/`);
    await page.getByLabel("Ask a question").waitFor();
    await ask(page, ASKS);
    await page.waitForURL(`${modelled.origin}/pods/ines-calloway/`);
    await page.locator(".chat-log .model", { hasText: "Done." }).waitFor();
    release();
    await page.locator(".chat-recent li button", { hasText: ASKS }).waitFor({
      state: "attached",
    });
    await t.test("never stores the chat that moved", async () => {
      const followed = await storage(page);
      assert.equal(followed.all.includes(ASKS), false, followed.all);
    });
    await page.close();
  });

  test("with an encrypted pod made in the app served by Node", async (t) => {
    let sealed = await startStarter({
      CASCADE_MODEL_PROVIDER: "other",
      CASCADE_MODEL_URL: stub.url,
      CASCADE_MODEL_NAME: "stub-1",
      CASCADE_MODEL_KEY: KEY,
    });
    const folder = sealed.folder;
    const made = async (): Promise<string[]> =>
      await readdir(join(folder, "pods"));
    try {
      const page = await newPage();
      await page.goto(`${sealed.origin}/#new-pod`);
      await page.getByLabel("Encrypt this pod with six words").check();
      await page.getByLabel("A person's name").fill("Grace Hopper");
      await page.getByRole("button", { name: "Make the pod" }).click();
      await page.locator(".words li").nth(5).waitFor();
      const words = await page.locator(".words li").allTextContents();
      await t.test("shows six words", async () => {
        assert.equal(words.length, 6);
      });

      const confirm = page.locator("form", {
        has: page.locator('input[name="word2"]'),
      });
      await t.test(
        "offers the pod's name and the six words to a password manager as a new sign-up",
        async () => {
          const signUp = await confirm.evaluate((form) => {
            const named = (field: string) =>
              form.querySelector<HTMLInputElement>(`input[name="${field}"]`)!;
            return ["username", "password"].map((field) => {
              const input = named(field);
              return {
                type: input.type,
                autocomplete: input.autocomplete,
                value: input.value,
                hidden:
                  input.readOnly ||
                  input.closest("[aria-hidden]") !== null ||
                  input.offsetParent === null,
              };
            });
          });
          assert.deepEqual(signUp, [
            {
              type: "text",
              autocomplete: "username",
              value: "grace-hopper",
              hidden: false,
            },
            {
              type: "password",
              autocomplete: "new-password",
              value: words.join(" "),
              hidden: false,
            },
          ]);
        },
      );
      await t.test("never puts a word in the address", async () => {
        for (const word of words)
          assert.equal(
            new RegExp(String.raw`\b${word}\b`, "i").test(page.url()),
            false,
            `the word ${word} is in the address`,
          );
      });
      await t.test(
        "makes Copy words a plain button, so it submits nothing",
        async () => {
          assert.equal(
            await page
              .getByRole("button", { name: "Copy words" })
              .getAttribute("type"),
            "button",
          );
        },
      );

      await page.getByLabel("Password").fill("a suggested password");
      await page.getByLabel("Word 2").fill(words[1]!);
      await page.getByLabel("Word 5").fill(words[4]!);
      await page
        .getByRole("button", { name: "Make the encrypted pod" })
        .click();
      await page
        .locator("main", { hasText: /must hold the six words above/ })
        .waitFor();
      await t.test(
        "refuses a changed password field, resets it to the words and makes nothing",
        async () => {
          assert.match(
            (await page.locator("main").textContent()) ?? "",
            /must hold the six words above/,
          );
          assert.equal(
            await page.getByLabel("Password").inputValue(),
            words.join(" "),
            "the field is reset to the words",
          );
          assert.equal(
            (await made()).includes("grace-hopper"),
            false,
            "a changed password field makes nothing",
          );
        },
      );
      await page.getByLabel("Pod", { exact: true }).fill("someone-else");
      await page.getByLabel("Word 2").fill(words[1]!);
      await page.getByLabel("Word 5").fill(words[4]!);
      await page
        .getByRole("button", { name: "Make the encrypted pod" })
        .click();
      await page
        .locator("main", { hasText: /Pod field must keep the pod's name/ })
        .waitFor();
      await t.test(
        "refuses a changed pod field and makes nothing",
        async () => {
          assert.match(
            (await page.locator("main").textContent()) ?? "",
            /Pod field must keep the pod's name/,
          );
          assert.equal(
            (await made()).includes("grace-hopper"),
            false,
            "a changed name makes nothing",
          );
        },
      );

      await page.getByLabel("Word 2").fill("not-a-word");
      await page.getByLabel("Word 5").fill(words[4]!);
      await page
        .getByRole("button", { name: "Make the encrypted pod" })
        .click();
      await page
        .locator("main", { hasText: /Those aren't words 2 and 5/ })
        .waitFor();
      await t.test(
        "refuses wrong words 2 and 5 and makes nothing",
        async () => {
          assert.match(
            (await page.locator("main").textContent()) ?? "",
            /Those aren't words 2 and 5/,
          );
          assert.equal(
            (await made()).includes("grace-hopper"),
            false,
            "a wrong check makes nothing",
          );
        },
      );

      await page.getByLabel("Word 2").fill(` ${words[1]!.toUpperCase()} `);
      await page.getByLabel("Word 5").fill(words[4]!);
      await page
        .getByRole("button", { name: "Make the encrypted pod" })
        .click();
      await page.waitForURL(`${sealed.origin}/pods/grace-hopper/`);
      await t.test(
        "makes the pod once words 2 and 5 are typed, whatever their case and the spaces round them",
        async () => {
          assert.equal(page.url(), `${sealed.origin}/pods/grace-hopper/`);
          assert.ok((await made()).includes("grace-hopper"));
        },
      );
      await page.getByRole("button", { name: "Lock" }).click();
      await page.getByLabel("Your six words").waitFor();
      await t.test(
        "asks for the six words again once Lock is pressed, at the address it was on",
        async () => {
          assert.equal(page.url(), `${sealed.origin}/pods/grace-hopper/`);
          assert.match(
            (await page.locator("main").textContent()) ?? "",
            /Open Grace Hopper's pod/,
          );
        },
      );
      await page.getByLabel("Your six words").fill(words.join(" "));
      await page.getByRole("button", { name: "Open this pod" }).click();
      await page.locator("main", { hasText: /Grace Hopper/ }).waitFor();
      await page.close();

      await sealed.stop(true);
      await t.test(
        "leaves no readable Turtle, name, title or kept answer in the pod's files once the app is stopped",
        async () => {
          const answersFolder = join(
            folder,
            "pods",
            ".answers",
            "grace-hopper",
          );
          const sealedFolders = [join(folder, "pods", "grace-hopper")];
          if (existsSync(answersFolder)) sealedFolders.push(answersFolder);
          for (const sealedFolder of sealedFolders) {
            const files = await filesUnder(sealedFolder);
            assert.ok(files.length > 0, `${sealedFolder} holds files`);
            for (const file of files) {
              if (file.replaceAll("\\", "/") === "settings/encryption.json")
                continue;
              const text = await readFile(join(sealedFolder, file), "latin1");
              assert.ok(text.length > 0, file);
              for (const readable of ["@prefix", "Grace", '"title"', '"rows"'])
                assert.equal(
                  text.includes(readable),
                  false,
                  `${file}: ${readable}`,
                );
              assert.throws(() => JSON.parse(text), `${file} parses as JSON`);
            }
          }
        },
      );

      sealed = await startStarter({}, folder);
      const again = await newPage();
      await again.goto(`${sealed.origin}/pods/grace-hopper/`);
      await again
        .getByLabel("Your six words")
        .fill("one two three four five six");
      await again.getByRole("button", { name: "Open this pod" }).click();
      await again.locator("main", { hasText: /don't open this pod/ }).waitFor();
      await t.test(
        "refuses six words that are not the pod's after a restart",
        async () => {
          assert.match(
            (await again.locator("main").textContent()) ?? "",
            /don't open this pod/,
          );
        },
      );
      await again.getByLabel("Your six words").fill(words.join(" "));
      await again.getByRole("button", { name: "Open this pod" }).click();
      await again.getByLabel("Your six words").waitFor({ state: "detached" });
      await again.locator("main", { hasText: /Grace Hopper/ }).waitFor();
      await t.test(
        "opens the pod with its six words after a restart",
        async () => {
          assert.equal(await again.getByLabel("Your six words").count(), 0);
          assert.match(
            (await again.locator("main").textContent()) ?? "",
            /Grace Hopper/,
          );
        },
      );
      await again.close();
    } finally {
      await sealed.stop();
    }
  });

  test("when a plain pod takes the name while an encrypted one waits for its words", async (t) => {
    const racing = await newPage();
    await racing.goto(`${modelled.origin}/#new-pod`);
    await racing.getByLabel("Encrypt this pod with six words").check();
    await racing.getByLabel("A person's name").fill("Alan Turing");
    await racing.getByRole("button", { name: "Make the pod" }).click();
    await racing.locator(".words li").nth(5).waitFor();
    const racingWords = await racing.locator(".words li").allTextContents();
    const plain = await newPage();
    await plain.goto(`${modelled.origin}/#new-pod`);
    await plain.getByLabel("A person's name").fill("Alan Turing");
    await plain.getByRole("button", { name: "Make the pod" }).click();
    await plain.waitForURL(`${modelled.origin}/pods/alan-turing/`);
    await racing.getByLabel("Word 2").fill(racingWords[1]!);
    await racing.getByLabel("Word 5").fill(racingWords[4]!);
    await racing
      .getByRole("button", { name: "Make the encrypted pod" })
      .click();
    await racing
      .locator("main", { hasText: /A pod named alan-turing exists already/ })
      .waitFor();
    await t.test(
      "refuses the encrypted pod, saying a pod of that name exists already",
      async () => {
        assert.match(
          (await racing.locator("main").textContent()) ?? "",
          /A pod named alan-turing exists already/,
        );
      },
    );
    await t.test("stays off the plain pod's page", async () => {
      assert.equal(
        (await racing.locator("h1").allTextContents()).some(
          (text) => text.trim() === "Alan Turing",
        ),
        false,
        "the refused encrypted pod goes to the plain one",
      );
    });
    await racing.close();
    await plain.close();
  });

  /** Makes an encrypted pod for `person` in `page`'s box and waits for its six words; gives them. */
  const sixWordsOf = async (page: Page, on: Started, person: string) => {
    await page.goto(`${on.origin}/#new-pod`);
    await page.getByLabel("Encrypt this pod with six words").check();
    await page.getByLabel("A person's name").fill(person);
    await page.getByRole("button", { name: "Make the pod" }).click();
    await page.locator(".words li").nth(5).waitFor();
    return page.locator(".words li").allTextContents();
  };

  test("when the words screen is loaded again", async (t) => {
    const page = await newPage();
    const first = await sixWordsOf(page, modelled, "Mary Jackson");
    await page.reload();
    await page.locator("main", { hasText: /shown once/ }).waitFor();
    await t.test("shows no word, and says they were shown once", async () => {
      assert.equal(await page.locator(".words li").count(), 0);
      assert.match(
        (await page.locator("main").textContent()) ?? "",
        /These six words were shown once, and are not shown again\. Make the pod again\./,
      );
    });
    const next = await sixWordsOf(page, modelled, "Mary Jackson");
    await t.test("makes the pod again, with six new words", async () => {
      assert.equal(next.length, 6);
      assert.notDeepEqual(next, first);
    });
    await page.close();
  });

  test("when Copy words is pressed", async (t) => {
    const page = await newPage();
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.clock.install();
    const words = (await sixWordsOf(page, modelled, "Dorothy Vaughan")).join(
      " ",
    );
    const held = () => page.evaluate(() => navigator.clipboard.readText());
    await page.getByRole("button", { name: "Copy words" }).click();
    await page.locator("[data-copied]", { hasText: /^Copied/ }).waitFor();
    await t.test(
      "warns that a clipboard history may keep the words",
      async () => {
        assert.match(
          (await page.locator("main").textContent()) ?? "",
          /clipboard history or sync/,
        );
      },
    );
    await t.test("puts the words on the clipboard", async () => {
      assert.equal(await held(), words);
    });
    await page.clock.fastForward(60_000);
    await page
      .locator("[data-copied]", { hasText: /clipboard is cleared/ })
      .waitFor();
    await t.test("empties the clipboard a minute later", async () => {
      assert.equal(await held(), "");
    });
    await page.getByRole("button", { name: "Copy words" }).click();
    await page.evaluate(() => navigator.clipboard.writeText("something else"));
    await page.clock.fastForward(60_000);
    await page
      .locator("[data-copied]", { hasText: /something else now/ })
      .waitFor();
    await t.test(
      "leaves the clipboard alone when it holds something else",
      async () => {
        assert.equal(await held(), "something else");
      },
    );
    await page.close();
  });
});
