import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build, type Rolldown } from "vite";

/** The template with every add-on added, so the chat's chunk is there to be kept out of the browser's bundle. */
const APP = fileURLToPath(new URL("../../build/app/", import.meta.url));

/** The chunks of the app's bundle for `mode`'s target, as Vite builds it, and the modules in them. */
async function bundled(mode?: string) {
  const built = await build({
    root: APP,
    configFile: join(APP, "vite.config.ts"),
    logLevel: "silent",
    ...(mode === undefined ? {} : { mode }),
    build: { write: false },
  });
  const chunks = (Array.isArray(built) ? built : [built])
    .flatMap((each) => ("output" in each ? each.output : []))
    .filter((each): each is Rolldown.OutputChunk => each.type === "chunk");
  const modules = chunks
    .flatMap(({ moduleIds }) => moduleIds)
    .map((id) => id.replaceAll("\\", "/"));
  assert.ok(
    modules.some((id) => id.endsWith("/app/src/main.tsx")),
    "the bundle is not the app's",
  );
  return { chunks, modules };
}

/** A module of the chat window: the AI SDK, assistant-ui, or the window's own code. */
const ofChat = (id: string) =>
  /\/node_modules\/(ai|@ai-sdk|@assistant-ui)\//.test(id) ||
  id.includes("/app/src/chat/");

test("the Node target's bundle is the app over its typed client, with the chat window in a chunk of its own: no cascade-runtime but its check, no server code and no wasm", async () => {
  const { chunks, modules } = await bundled();
  assert.ok(
    modules.some((id) => id.includes("/node_modules/hono/dist/client/")),
    "the bundle has no typed client",
  );
  assert.ok(
    modules.some((id) => id.endsWith("/app/src/chat/window.tsx")) &&
      modules.some((id) => id.includes("/node_modules/@assistant-ui/react/")),
    "the bundle has no chat window",
  );
  assert.ok(
    modules.some((id) =>
      id.endsWith("/node_modules/cascade-runtime/dist/browser/check.js"),
    ),
    "the bundle has no check of a tool's input",
  );
  assert.deepEqual(
    modules.filter(
      (id) =>
        (id.includes("/node_modules/cascade-runtime/") &&
          !id.endsWith("/dist/browser/check.js")) ||
        id.includes("/app/server/") ||
        id.endsWith("/app/pod-api.ts") ||
        id.includes("/node_modules/@hono/") ||
        /\/node_modules\/hono\/dist\/(?!client\/|utils\/)/.test(id),
    ),
    [],
  );
  assert.deepEqual(
    chunks
      .filter(({ isEntry }) => isEntry)
      .flatMap(({ moduleIds }) => moduleIds)
      .filter(
        (id) =>
          /[\\/]node_modules[\\/]zod[\\/]/.test(id) ||
          ofChat(id.replaceAll("\\", "/")),
      ),
    [],
    "the screens carry the routes' validation or the chat, which only the chat window loads",
  );
  assert.ok(
    chunks
      .filter(({ isEntry }) => isEntry)
      .every(({ code }) => code.length < 500_000),
    "the first visit's chunk passed 500 kB: the chat window is lazy so that it stays under Vite's warning",
  );
  assert.deepEqual(
    chunks
      .filter(({ code }) => /\.wasm\b/.test(code))
      .map(({ fileName }) => fileName),
    [],
  );
});

test("the browser target's bundle draws no chat: it carries no AI SDK, no assistant-ui and no chat window", async () => {
  const { modules } = await bundled("browser");
  assert.deepEqual(modules.filter(ofChat), []);
});
