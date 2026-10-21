// The starter's chat in Chromium, against a copy of the starter and a stub model on loopback: no real model, key or
// network. The copy makes its own pods, so nothing under the repository is written.
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
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
import { after, before, test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright";
import { inPlace } from "./shown.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const KEY = "sk-test-key-that-must-not-leave";
const ASKS = "open Ines Calloway's pod";

/** `STARTER=next` runs the app ported to React (`server/main.ts`), else `npm start`'s (`server.mjs`). */
const NEXT = process.env.STARTER === "next";
/**
 * Skips the test unless the app it is of runs: the chat window's tests run on the React app only, as the old strip is
 * frozen until it goes; the old app's own, on it until the React app runs them.
 */
const skipped = (t: TestContext, of: "chat" | "old") => {
  const skip = (of === "chat") !== NEXT;
  if (skip)
    t.skip(
      of === "chat"
        ? "the chat window is the React app's"
        : "not yet run on the React app",
    );
  return skip;
};

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

/** The React app built once, as `npm run next` builds it, into a folder of its own that each copy is given. */
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
      { cwd: join(ROOT, "app"), stdio: ["ignore", "inherit", "inherit"] },
    );
    const code = await new Promise((done) => vite.on("exit", done));
    assert.equal(code, 0, "the React app did not build");
    return out;
  })();
  return built;
}

type Started = {
  origin: string;
  folder: string;
  stop: (keep?: boolean) => Promise<void>;
};

/**
 * A copy of the starter in a folder of its own, listening on a port the system picks; `env` is the model's settings.
 * Given the `folder` of an earlier copy that `stop(true)` kept, it starts again in it, with its pods.
 */
async function startStarter(
  env: Record<string, string>,
  again?: string,
): Promise<Started> {
  const folder = again ?? (await mkdtemp(join(tmpdir(), "t273-")));
  if (again === undefined) {
    await cp(join(ROOT, "app"), folder, {
      recursive: true,
      filter: (from) => !/[\\/](node_modules|pods|dist|\.env)$/.test(from),
    });
    await symlink(
      join(ROOT, "node_modules"),
      join(folder, "node_modules"),
      "junction",
    );
    if (NEXT)
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
  const child: ChildProcess = spawn(
    "node",
    [NEXT ? "server/main.ts" : "server.mjs"],
    { cwd: folder, env: settings, stdio: ["ignore", "pipe", "pipe"] },
  );
  let said = "";
  child.stderr!.on("data", (chunk: Buffer) => (said += chunk));
  const origin = await new Promise<string>((found, failed) => {
    child.stdout!.on("data", (chunk: Buffer) => {
      const at = /http:\/\/127\.0\.0\.1:\d+/.exec(chunk.toString());
      if (at) found(at[0]);
    });
    child.on("exit", () => failed(new Error(`the starter stopped: ${said}`)));
  });
  return {
    origin,
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

const post = (origin: string, path: string, body: object) =>
  fetch(origin + path, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
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

test("asking to open another pod moves the app there in place, and the question, the answer and Recent chats stay, the chat open", async (t) => {
  if (skipped(t, "chat")) return;
  const page = await browser.newPage();
  await page.goto(`${modelled.origin}/pods/ada-lovelace/`);
  await inPlace(page, async () => {
    await ask(page, ASKS);
    await page.waitForURL(`${modelled.origin}/pods/ines-calloway/`);
    await page.locator(".chat-log .model", { hasText: "Done." }).waitFor();
  });
  assert.equal(await page.locator("h1").first().textContent(), "Ines Calloway");
  assert.equal(await page.locator(".chat-log .you").textContent(), ASKS);
  assert.equal(await page.locator(".chat-log .model").textContent(), "Done.");
  assert.equal(
    await page.locator(".chat-recent li button").textContent(),
    ASKS,
  );
  const { chats, open } = await storage(page);
  assert.deepEqual(
    chats.filter(({ title }) => title === ASKS).map(({ id, pod }) => [id, pod]),
    [[open, "ines-calloway"]],
  );
  await page.close();
});

test("a move within the pod shown does not make the chat follow the next click to another pod", async (t) => {
  if (skipped(t, "chat")) return;
  const page = await browser.newPage();
  await page.goto(`${modelled.origin}/pods/ines-calloway/`);
  await ask(page, ASKS);
  await page.locator(".chat-log .model", { hasText: "Done." }).waitFor();
  await page.locator("aside nav a", { hasText: "Ada Lovelace" }).click();
  await page.locator("h1", { hasText: /^Ada Lovelace$/ }).first().waitFor();
  assert.equal(await page.locator(".chat-log .you").count(), 0);
  assert.equal(await page.locator(".chat-recent li button").count(), 0);
  await page.close();
});

test("Stop ends the call to the model, not just the spinner", async (t) => {
  if (skipped(t, "chat")) return;
  const page = await browser.newPage();
  await page.goto(`${modelled.origin}/pods/ada-lovelace/`);
  await ask(page, "tell me a long story");
  await page.locator(".chat-log .model", { hasText: "Once upon" }).waitFor();
  await page.getByRole("button", { name: "Stop" }).click();
  await page.locator(".chat-log .stopped").waitFor();
  for (let waited = 0; stub.stopped() === 0 && waited < 5000; waited += 50)
    await new Promise((done) => setTimeout(done, 50));
  assert.equal(stub.stopped(), 1);
  await page.close();
});

test("with no model set the window says to run npm run model and has no form; with one, its bar names the model and where it runs, and no page, request, stream or storage holds its key or address", async (t) => {
  if (skipped(t, "chat")) return;
  const page = await browser.newPage();
  await page.goto(`${bare.origin}/`);
  await page.locator(".chat-off").waitFor();
  assert.match(
    (await page.locator(".chat").textContent()) ?? "",
    /npm run model/,
  );
  assert.equal(await page.locator(".chat-form").count(), 0);
  await page.close();

  const seen: Promise<string>[] = [];
  const watched = await browser.newPage();
  watched.on("request", (request) =>
    seen.push(Promise.resolve(`${request.url()} ${request.postData() ?? ""}`)),
  );
  watched.on("response", (response) =>
    seen.push(response.text().catch(() => "")),
  );
  await watched.goto(`${modelled.origin}/pods/ada-lovelace/`);
  assert.equal(
    await watched.locator(".chat-bar .muted").textContent(),
    "stub-1, on this computer",
  );
  await ask(watched, ASKS);
  await watched.locator(".chat-log .model", { hasText: "Done." }).waitFor();
  seen.push(storage(watched).then(({ all }) => all));
  seen.push(watched.content());
  const shown = (await Promise.all(seen)).join("\n");
  await watched.close();
  assert.match(shown, /"type":"tool-input-available"/);
  assert.match(shown, /"name":"stub-1"/);
  assert.equal(shown.includes(KEY), false);
  assert.equal(shown.includes(stub.url), false);
});

test("a write the model asks for waits on the page's confirm: Cancel makes no pod and tells the model no, and Allow makes it", async (t) => {
  if (skipped(t, "chat")) return;
  const page = await browser.newPage();
  await page.goto(`${modelled.origin}/pods/ada-lovelace/`);
  const asking = page.getByRole("alertdialog");
  const pods = async () =>
    (
      (await (await post(modelled.origin, "/api/pods", {})).json()) as {
        pods: { name: string }[];
      }
    ).pods.map(({ name }) => name);

  await ask(page, "make a pod for Cora Diaz");
  await asking.waitFor();
  assert.match((await asking.textContent()) ?? "", /Make a pod.*Cora Diaz/);
  await asking.getByRole("button", { name: "Cancel" }).click();
  await page.locator(".chat-log .model", { hasText: "Done." }).waitFor();
  assert.ok(stub.told().includes("The person said no"), stub.told().join());
  assert.equal((await pods()).includes("cora-diaz"), false);

  await page.getByRole("button", { name: "New chat" }).click();
  await ask(page, "make a pod for Cora Diaz");
  await asking.getByRole("button", { name: "Allow" }).click();
  await page.locator("aside nav a", { hasText: "Cora Diaz" }).waitFor();
  assert.equal((await pods()).includes("cora-diaz"), true);
  await page.close();
});

test("after Allow at a demo hospital the connection's box moves on by itself, to Bring it in, and from bringing it in to the pod's page", async (t) => {
  if (skipped(t, "old")) return;
  const made = await post(bare.origin, "/api/makePod", {
    person: "Ines Calloway",
  });
  assert.equal(made.status, 200);
  const page = await browser.newPage();
  await page.goto(`${bare.origin}/pods/ines-calloway/`);
  await page
    .getByRole("button", { name: /^Sign in at / })
    .first()
    .click();
  await page.getByRole("button", { name: "Allow" }).click();
  const bring = page.getByRole("button", { name: /^Bring it into / });
  await bring.waitFor({ timeout: 30_000 });
  assert.equal(new URL(page.url()).origin, bare.origin);
  await bring.click();
  await page
    .locator("main .note", { hasText: /^Brought in the record from / })
    .waitFor({ timeout: 60_000 });

  await page.goto(`${bare.origin}/pods/ines-calloway/connections/999`);
  await page.locator("h1", { hasText: /^Ines Calloway$/ }).waitFor();
  assert.equal(
    await page.locator("#connection").count(),
    0,
    "a connection the pod has not opens a box",
  );
  await page.goto(`${bare.origin}/pods/nobody-here/connections/1`);
  await page.locator("h1", { hasText: /^Not found$/ }).waitFor();
  await page.close();
});

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

const isPost = (request: { url(): string; method(): string }) =>
  request.url().endsWith("/chat") && request.method() === "POST";

test("a finding the model's tool found is drawn as a card with the app's sentence, its numbers and row links, and Open the trend goes to the trend", async (t) => {
  if (skipped(t, "chat")) return;
  const view = "/pods/ines-calloway/trend?test=18262-6&medication=617310";
  const finding = {
    key: "start:617310:18262-6",
    kind: "after start",
    direction: "down",
    said: "LDL was lower after atorvastatin started.",
    unit: "mg/dL",
    test: { code: "18262-6", notation: "18262-6", name: "LDL" },
    medication: { name: "atorvastatin", date: "2024-03-01" },
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
  const page = await browser.newPage();
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
  const said = (await card.textContent()) ?? "";
  assert.match(said, /LDL was lower after atorvastatin started\./);
  assert.match(said, /mean 160 mg\/dL over 2 results/);
  assert.match(said, /mean 95 mg\/dL over 1 result\b/);
  assert.deepEqual(
    await card
      .locator("li a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
    ["/pods/ines-calloway/entries/lab-1", "/pods/ines-calloway/entries/lab-2"],
  );
  await inPlace(page, async () => {
    await card.getByRole("button", { name: "Open the trend" }).click();
    await page.waitForURL(`${modelled.origin}${view}`);
  });

  await page.goto(`${modelled.origin}/pods/ines-calloway/`);
  await page.getByLabel("Ask a question").waitFor();
  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<button id="asker" data-ask='{"kind":"entry","id":"x"}' data-ask-label="Lisinopril">Ask about this</button>`,
    );
  });
  const sent = page.waitForRequest(isPost);
  await page.locator("#asker").click();
  const body = (await sent).postDataJSON();
  assert.deepEqual(body.context, { kind: "entry", id: "x" });
  assert.deepEqual(
    body.messages.map(({ role, parts }: { role: string; parts: unknown }) => ({
      role,
      parts,
    })),
    [
      {
        role: "user",
        parts: [
          { type: "text", text: "What is this, and where did it come from?" },
        ],
      },
    ],
  );
  assert.equal(
    await page.locator(".chat-about").textContent(),
    "About: Lisinopril",
  );
  assert.equal(await page.locator(".chat-chips").isHidden(), true);
  assert.equal(
    await page.locator(".chat-log .you").textContent(),
    "What is this, and where did it come from?",
  );
  await page.locator(".chat-log .model").waitFor();
  assert.match(
    (await page.locator(".chat-log .model").textContent()) ?? "",
    /^Here it is\./,
  );

  await page.goto(`${modelled.origin}/pods/ines-calloway/`);
  await page.getByLabel("Ask a question").waitFor();
  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<button id="asker" data-ask='{"kind":"entry","id":"y"}' data-ask-label="Aspirin">Ask about this</button>`,
    );
  });
  let requests = 0;
  page.on("request", (request) => {
    if (isPost(request)) requests += 1;
  });
  await page.locator("#asker").dblclick();
  await page.locator(".chat-about", { hasText: "Aspirin" }).waitFor();
  await page.locator(".chat-log .model").waitFor();
  await page.locator(".chat-send:not([hidden])").waitFor();
  assert.equal(requests, 1);
  await page.close();
});

/** A page with the chat window open on a long answer about a long label, in a window of this size. */
const openOnLongAnswer = async (width: number, height: number) => {
  const page = await browser.newPage({ viewport: { width, height } });
  await answering(page, saying("A long answer. ".repeat(400)));
  await page.goto(`${modelled.origin}/pods/ines-calloway/`);
  const label = "A long label about one finding of the pod. ".repeat(6);
  await page.getByLabel("Ask a question").waitFor();
  await page.evaluate((text) => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<button id="asker" data-ask='{"kind":"finding","key":"x"}' data-ask-label="${text}">Ask about this</button>`,
    );
  }, label);
  await page.locator("#asker").click();
  await page
    .locator(".chat-log .model", { hasText: "A long answer" })
    .waitFor();
  await page.locator(".chat-send:not([hidden])").waitFor();
  return { page, label };
};

test("the question box stays in view with the page at its top, in a short window and a phone-sized one", async (t) => {
  if (skipped(t, "chat")) return;
  for (const [width, height] of [
    [375, 667],
    [844, 390],
  ] as const) {
    const { page } = await openOnLongAnswer(width, height);
    await page.evaluate(() => window.scrollTo(0, 0));
    const input = (await page.locator(".chat-form input").boundingBox())!;
    assert.ok(
      input.y >= 0 && input.y + input.height <= height,
      `at ${width}x${height} the question box is ${input.y}+${input.height}`,
    );
    await page.close();
  }
});

test("on a phone the About line is clamped to one line, the page scrolls its end above the open window, and a long answer opens at its question", async (t) => {
  if (skipped(t, "chat")) return;
  const { page, label } = await openOnLongAnswer(390, 600);

  const box = async (selector: string) =>
    (await page.locator(selector).boundingBox())!;
  const log = await box(".chat-log");
  const lines = await page
    .locator(".chat-about")
    .evaluate(
      (element) =>
        element.getBoundingClientRect().height /
        parseFloat(getComputedStyle(element).lineHeight),
    );
  assert.ok(lines <= 1.05, `the About line is ${lines} lines`);
  assert.equal(
    await page.locator(".chat-about").getAttribute("title"),
    `About: ${label}`,
  );
  const question = await box(".chat-log .you");
  assert.ok(
    question.y >= log.y - 1 &&
      question.y + question.height <= log.y + log.height,
    `question ${question.y}+${question.height}, log ${log.y}+${log.height}`,
  );

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const strip = await box(".chat");
  const last = await page.evaluate(
    () => document.querySelector("main")!.getBoundingClientRect().bottom,
  );
  assert.ok(
    last <= strip.y + 1,
    `the page ends at ${last}, the strip starts at ${strip.y}`,
  );

  await page.reload();
  const reopened = await box(".chat-log .you");
  const room = await box(".chat-log");
  assert.ok(
    reopened.y >= room.y - 1 &&
      reopened.y + reopened.height <= room.y + room.height,
    `after a reload the question is ${reopened.y}+${reopened.height}, the log ${room.y}+${room.height}`,
  );
  await page.close();
});

test("an open chat leaves the page's own content in view, and the window folds to its bar and stays folded in the tab", async (t) => {
  if (skipped(t, "chat")) return;
  const page = await browser.newPage({
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
  assert.ok((await height()) < 850 / 2, `the strip is ${await height()} px`);
  assert.ok(
    await page
      .locator(".chat-log")
      .evaluate((log) => log.scrollHeight > log.clientHeight),
    "the log scrolls inside the strip",
  );

  await page.getByRole("button", { name: "Hide chat" }).click();
  assert.equal(await page.locator(".chat-form").isVisible(), false);
  const bar = await height();
  assert.ok(bar < 100, `the bar is ${bar} px`);
  await page.reload();
  assert.equal(await page.locator(".chat-form").isVisible(), false);
  await page.getByRole("button", { name: "Show chat" }).click();
  assert.equal(await page.locator(".chat-form").isVisible(), true);
  await page.getByRole("button", { name: "Hide chat" }).click();
  await page.locator(".chat-recent summary").click();
  await page.locator(".chat-recent li button").first().click();
  assert.equal(await page.locator(".chat-form").isVisible(), true);
  await page.close();
});

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

test("an encrypted pod's chat is kept in neither localStorage nor sessionStorage", async (t) => {
  if (skipped(t, "chat")) return;
  const made = (await (
    await post(modelled.origin, "/api/makePod", {
      person: "Grace Hopper",
      encrypt: true,
    })
  ).json()) as { pod: string };
  const { words } = (await (
    await post(modelled.origin, "/api/waitingWords", { pod: made.pod })
  ).json()) as { words: string };
  const six = words.split(" ");
  const opened = await post(modelled.origin, "/api/confirmWords", {
    pod: made.pod,
    word2: six[1],
    word5: six[4],
    password: words,
    username: made.pod,
  });
  assert.equal(opened.status, 200);
  const page = await browser.newPage();
  await page.goto(`${modelled.origin}/pods/${made.pod}/`);
  await ask(page, "tell me a long story about Grace");
  await page.locator(".chat-log .model", { hasText: "Once upon" }).waitFor();
  await page.getByRole("button", { name: "Stop" }).click();
  await page.locator(".chat-log .stopped").waitFor();
  const { all } = await storage(page);
  assert.equal(all.includes("long story about Grace"), false, all);

  // A question sent before the app has said the pod is encrypted, whose answer moves the chat to another pod: the
  // lookup is held until the chat has moved, so the follow happens with the encryption unknown.
  let release = () => {};
  const held = new Promise<void>((done) => (release = done));
  await page.route("**/api/pod", async (route) => {
    if (route.request().postData()?.includes(made.pod) === true) await held;
    await route.continue();
  });
  await page.goto(`${modelled.origin}/pods/${made.pod}/`);
  await page.getByLabel("Ask a question").waitFor();
  await ask(page, ASKS);
  await page.waitForURL(`${modelled.origin}/pods/ines-calloway/`);
  await page.locator(".chat-log .model", { hasText: "Done." }).waitFor();
  release();
  await page.locator(".chat-recent li button", { hasText: ASKS }).waitFor({
    state: "attached",
  });
  const followed = await storage(page);
  assert.equal(followed.all.includes(ASKS), false, followed.all);
  await page.close();
});

test("an encrypted pod: six words checked, nothing plaintext on disk, and after a restart only the words open it", async (t) => {
  if (skipped(t, "old")) return;
  let sealed = await startStarter({
    CASCADE_MODEL_PROVIDER: "other",
    CASCADE_MODEL_URL: stub.url,
    CASCADE_MODEL_NAME: "stub-1",
    CASCADE_MODEL_KEY: KEY,
  });
  const folder = sealed.folder;
  try {
    const page = await browser.newPage();
    await page.goto(`${sealed.origin}/#new-pod`);
    await page.getByLabel("Encrypt this pod with six words").check();
    await page.getByLabel("A person's name").fill("Grace Hopper");
    await page.getByRole("button", { name: "Make the pod" }).click();
    await page.locator(".words li").nth(5).waitFor();
    const words = await page.locator(".words li").allTextContents();
    assert.equal(words.length, 6);

    const confirm = page.locator("form", {
      has: page.locator('input[name="word2"]'),
    });
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
    assert.equal(
      page.url().includes(words[0]!),
      false,
      "the words are never in the address",
    );

    assert.equal(
      await page
        .getByRole("button", { name: "Copy words" })
        .getAttribute("type"),
      "button",
    );

    await page.getByLabel("Password").fill("a suggested password");
    await page.getByLabel("Word 2").fill(words[1]!);
    await page.getByLabel("Word 5").fill(words[4]!);
    await page.getByRole("button", { name: "Make the encrypted pod" }).click();
    await page
      .locator("main", { hasText: /must hold the six words above/ })
      .waitFor();
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
      (await readdir(join(folder, "pods"))).includes("grace-hopper"),
      false,
      "a changed password field makes nothing",
    );
    await page.getByLabel("Pod", { exact: true }).fill("someone-else");
    await page.getByLabel("Word 2").fill(words[1]!);
    await page.getByLabel("Word 5").fill(words[4]!);
    await page.getByRole("button", { name: "Make the encrypted pod" }).click();
    await page
      .locator("main", { hasText: /Pod field must keep the pod's name/ })
      .waitFor();
    assert.match(
      (await page.locator("main").textContent()) ?? "",
      /Pod field must keep the pod's name/,
    );
    assert.equal(
      (await readdir(join(folder, "pods"))).includes("grace-hopper"),
      false,
      "a changed name makes nothing",
    );

    await page.getByLabel("Word 2").fill("not-a-word");
    await page.getByLabel("Word 5").fill(words[4]!);
    await page.getByRole("button", { name: "Make the encrypted pod" }).click();
    await page
      .locator("main", { hasText: /Those aren't words 2 and 5/ })
      .waitFor();
    assert.match(
      (await page.locator("main").textContent()) ?? "",
      /Those aren't words 2 and 5/,
    );
    assert.equal(
      (await readdir(join(folder, "pods"))).includes("grace-hopper"),
      false,
      "a wrong check makes nothing",
    );

    await page.getByLabel("Word 2").fill(` ${words[1]!.toUpperCase()} `);
    await page.getByLabel("Word 5").fill(words[4]!);
    await page.getByRole("button", { name: "Make the encrypted pod" }).click();
    await page.waitForURL(`${sealed.origin}/pods/grace-hopper/`);
    await page.close();

    const racing = await browser.newPage();
    await racing.goto(`${sealed.origin}/#new-pod`);
    await racing.getByLabel("Encrypt this pod with six words").check();
    await racing.getByLabel("A person's name").fill("Alan Turing");
    await racing.getByRole("button", { name: "Make the pod" }).click();
    await racing.locator(".words li").nth(5).waitFor();
    const racingWords = await racing.locator(".words li").allTextContents();
    const plain = await browser.newPage();
    await plain.goto(`${sealed.origin}/#new-pod`);
    await plain.getByLabel("A person's name").fill("Alan Turing");
    await plain.getByRole("button", { name: "Make the pod" }).click();
    await plain.waitForURL(`${sealed.origin}/pods/alan-turing/`);
    await racing.getByLabel("Word 2").fill(racingWords[1]!);
    await racing.getByLabel("Word 5").fill(racingWords[4]!);
    await racing
      .getByRole("button", { name: "Make the encrypted pod" })
      .click();
    await racing
      .locator("main", { hasText: /A pod named alan-turing exists already/ })
      .waitFor();
    assert.match(
      (await racing.locator("main").textContent()) ?? "",
      /A pod named alan-turing exists already/,
    );
    assert.equal(
      (await racing.locator("h1").allTextContents()).some(
        (text) => text.trim() === "Alan Turing",
      ),
      false,
      "the refused encrypted pod goes to the plain one",
    );
    await racing.close();
    await plain.close();

    await sealed.stop(true);
    const answersFolder = join(folder, "pods", ".answers", "grace-hopper");
    const sealedFolders = [join(folder, "pods", "grace-hopper")];
    if (existsSync(answersFolder)) sealedFolders.push(answersFolder);
    for (const sealedFolder of sealedFolders) {
      const files = await filesUnder(sealedFolder);
      assert.ok(files.length > 0, `${sealedFolder} holds files`);
      for (const file of files) {
        if (file.replaceAll("\\", "/") === "settings/encryption.json") continue;
        const text = await readFile(join(sealedFolder, file), "latin1");
        assert.ok(text.length > 0, file);
        for (const readable of ["@prefix", "Grace", '"title"', '"rows"'])
          assert.equal(text.includes(readable), false, `${file}: ${readable}`);
        assert.throws(() => JSON.parse(text), `${file} parses as JSON`);
      }
    }

    sealed = await startStarter({}, folder);
    const again = await browser.newPage();
    await again.goto(`${sealed.origin}/pods/grace-hopper/`);
    await again
      .getByLabel("Your six words")
      .fill("one two three four five six");
    await again.getByRole("button", { name: "Open this pod" }).click();
    await again.locator("main", { hasText: /don't open this pod/ }).waitFor();
    assert.match(
      (await again.locator("main").textContent()) ?? "",
      /don't open this pod/,
    );
    await again.getByLabel("Your six words").fill(words.join(" "));
    await again.getByRole("button", { name: "Open this pod" }).click();
    await again.getByLabel("Your six words").waitFor({ state: "detached" });
    await again.locator("main", { hasText: /Grace Hopper/ }).waitFor();
    assert.equal(await again.getByLabel("Your six words").count(), 0);
    assert.match(
      (await again.locator("main").textContent()) ?? "",
      /Grace Hopper/,
    );
    await again.close();
  } finally {
    await sealed.stop();
  }
});
