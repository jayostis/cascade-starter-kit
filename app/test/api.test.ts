import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replayKit } from "cascade-runtime/fixtures";
import { afterAll, beforeAll, expect, test } from "vitest";
import { nodeHost } from "../node-host.ts";
import { podApi } from "../pod-api.ts";
import { appServer } from "../server/app.ts";

const ORIGIN = "http://app.test";
let folder: string;
let api: ReturnType<typeof podApi>;
let app: ReturnType<typeof appServer>;

/** The server answers `POST /api/<operation>` as the app's own pages ask it. */
const post = (operation: string, input: unknown) =>
  app.request(`${ORIGIN}/api/${operation}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(input),
  });

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "app-test-"));
  await replayKit("alex-rivera", join(folder, "alex-rivera"), {
    through: "E2",
  });
  api = podApi(nodeHost({ folder }));
  app = appServer({
    api,
    own: () => ({ hosts: new Set(["app.test"]), origins: new Set([ORIGIN]) }),
    back: () => undefined,
    pages: folder,
  });
}, 60_000);

afterAll(async () => {
  await api?.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 5 });
});

test("the pods are listed", async () => {
  const response = await post("pods", {});
  expect(response.status).toBe(200);
  const { pods } = (await response.json()) as { pods: { name: string }[] };
  expect(pods.map(({ name }) => name)).toEqual(["alex-rivera"]);
});

test("Alex's answers come back: what the first two imports brought in", async () => {
  const response = await post("answers", { pod: "alex-rivera" });
  expect(response.status).toBe(200);
  const { answers } = (await response.json()) as {
    answers: Record<string, unknown[]>;
  };
  expect(answers["pod/What each import brought in"].length).toBeGreaterThan(0);
});

test("with no chat added, /chat is no page of the app: a 404", async () => {
  const response = await app.request(`${ORIGIN}/chat`, {
    headers: { accept: "text/html" },
  });
  expect(response.status).toBe(404);
});

test("an input the rules refuse is a 400 that says why, never a 500", async () => {
  const response = await post("answers", { pod: "nobody" });
  expect(response.status).toBe(400);
  const { refused } = (await response.json()) as { refused: string };
  expect(refused).toMatch(/no pod nobody/);
});
