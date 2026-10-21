import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { replayKit } from "cascade-runtime/fixtures";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Model } from "../models.ts";
import { nodeHost } from "../node-host.ts";
import { podApi } from "../pod-api.ts";
import { appServer } from "../server/app.ts";
import { chatRoutes } from "../server/chat.ts";

const ORIGIN = "http://app.test";
const ANSWER = "Alex's first two imports brought in her records.";
let folder: string;
let api: ReturnType<typeof podApi>;
let app: ReturnType<typeof appServer>;

/** A model that answers every question with `ANSWER`: the AI SDK's mock in place of a provider, so no key or network. */
const model: Model = {
  provider: "mock",
  name: "mock-1",
  local: true,
  language: () =>
    new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "t" },
              { type: "text-delta", id: "t", delta: ANSWER },
              { type: "text-end", id: "t" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                usage: {
                  inputTokens: {
                    total: 1,
                    noCache: 1,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: { total: 1, text: 1, reasoning: undefined },
                },
              },
            ] satisfies LanguageModelV4StreamPart[])
              controller.enqueue(part);
            controller.close();
          },
        }),
      }),
    }),
  failure: () => undefined,
};

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "chat-test-"));
  await replayKit("alex-rivera", join(folder, "alex-rivera"), {
    through: "E2",
  });
  api = podApi(nodeHost({ folder }));
  app = appServer({
    api,
    own: () => ({ hosts: new Set(["app.test"]), origins: new Set([ORIGIN]) }),
    chat: chatRoutes({ api, model }),
    back: () => undefined,
    pages: folder,
  });
}, 60_000);

afterAll(async () => {
  await api?.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 5 });
});

test("GET /chat names the model the app was set up with, never its address or key", async () => {
  const response = await app.request(`${ORIGIN}/chat`);
  expect(await response.json()).toEqual({
    provider: "mock",
    name: "mock-1",
    local: true,
  });
});

test("a question about a pod is answered in the model's words, as the AI SDK's UI message stream", async () => {
  const response = await app.request(`${ORIGIN}/chat`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({
      pod: "alex-rivera",
      page: "/pods/alex-rivera/",
      messages: [
        {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "What did my imports bring in?" }],
        },
      ],
    }),
  });
  expect(response.status).toBe(200);
  const deltas = (await response.text())
    .split("\n\n")
    .filter((event) => event.startsWith("data: {"))
    .map((event) => JSON.parse(event.slice("data: ".length)))
    .filter(({ type }) => type === "text-delta")
    .map(({ delta }) => delta);
  expect(deltas.join("")).toBe(ANSWER);
});
