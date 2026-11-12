import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { replayKit } from "cascade-runtime/fixtures";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Model } from "../models.ts";
import { nodeHost } from "../node-host.ts";
import { podApi } from "../pod-api.ts";
import { appServer } from "../server/app.ts";
import { chatRoutes } from "../server/chat.ts";
import { launchCookie, newLaunch } from "../server/launch.ts";

const ORIGIN = "http://app.test";
const launch = newLaunch();
/** The cookie the page holds once it has opened the address the server printed. */
const COOKIE = `${launchCookie(new URL(ORIGIN))}=${launch.exchange(launch.token)}`;
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
    launch,
    chat: chatRoutes({ api, model }),
    back: () => undefined,
    pages: folder,
  });
}, 60_000);

afterAll(async () => {
  await api?.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 5 });
});

/**
 * The chat add-on's routes: `GET /chat` says which model the app was set up with, `POST /chat` sends a question to it and
 * streams the answer. These tests use the AI SDK's mock model, so they need no key and no network.
 */
describe("Chatting with a model over the server · chatRoutes(), /chat", () => {
  describe("with a mock model", () => {
    it("names the model by its provider, its name and whether it is local, and nothing more, at GET /chat", async () => {
      const response = await app.request(`${ORIGIN}/chat`, {
        headers: { cookie: COOKIE },
      });
      expect(await response.json()).toEqual({
        provider: "mock",
        name: "mock-1",
        local: true,
      });
    });

    it("streams the model's words as the AI SDK's UI message stream at POST /chat", async () => {
      const response = await app.request(`${ORIGIN}/chat`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          cookie: COOKIE,
        },
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
  });
});
