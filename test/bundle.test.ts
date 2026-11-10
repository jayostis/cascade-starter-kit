import assert from "node:assert/strict";
import { join } from "node:path";
import { before, describe, it } from "node:test";
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

/** The modules `cascade-runtime/tools` is made of: plain functions that read through what they are given, with no wasm. */
const TOOLS_MODULES =
  /\/node_modules\/cascade-runtime\/dist\/src\/(pod-tools|changes|table-checks|check)\.js$|\/@cascade-runtime\/runtime\/dist\/src\/refusal\.js$/;

/** A module of the chat window: the AI SDK, assistant-ui, or the window's own code. */
const ofChat = (id: string) =>
  /\/node_modules\/(ai|@ai-sdk|@assistant-ui)\//.test(id) ||
  id.includes("/app/src/chat/");

/**
 * What the app is built into for each target, read from a build kept in memory. The Node target's pages call the server
 * through its typed client and load the chat window in a chunk of their own; the browser target runs PodApi in the page
 * and draws no chat.
 */
describe("The app's bundle for each target · vite build", () => {
  describe("given the Node target's bundle", () => {
    let chunks: Awaited<ReturnType<typeof bundled>>["chunks"];
    let modules: string[];

    before(async () => {
      ({ chunks, modules } = await bundled());
    });

    it("holds the typed client of the server's routes", () => {
      assert.ok(
        modules.some((id) => id.includes("/node_modules/hono/dist/client/")),
        "the bundle has no typed client",
      );
    });

    it("holds the chat window and assistant-ui", () => {
      assert.ok(
        modules.some((id) => id.endsWith("/app/src/chat/window.tsx")) &&
          modules.some((id) =>
            id.includes("/node_modules/@assistant-ui/react/"),
          ),
        "the bundle has no chat window",
      );
    });

    it("holds cascade-runtime's check of a tool's input", () => {
      assert.ok(
        modules.some((id) =>
          id.endsWith("/node_modules/cascade-runtime/dist/browser/check.js"),
        ),
        "the bundle has no check of a tool's input",
      );
    });

    it("holds no other module of cascade-runtime than its check, its terms and its tools, no server code and no PodApi", () => {
      assert.deepEqual(
        modules.filter(
          (id) =>
            (id.includes("/node_modules/cascade-runtime/") &&
              !id.endsWith("/dist/browser/check.js") &&
              !id.endsWith("/dist/src/terms.js") &&
              !TOOLS_MODULES.test(id)) ||
            id.includes("/app/server/") ||
            id.endsWith("/app/pod-api.ts") ||
            id.includes("/node_modules/@hono/") ||
            /\/node_modules\/hono\/dist\/(?!client\/|utils\/)/.test(id),
        ),
        [],
      );
    });

    it("keeps zod and the chat window out of the chunk a first visit loads", () => {
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
    });

    it("keeps the chunk a first visit loads under 500 kB", () => {
      assert.ok(
        chunks
          .filter(({ isEntry }) => isEntry)
          .every(({ code }) => code.length < 500_000),
        "the first visit's chunk passed 500 kB: the chat window is lazy so that it stays under Vite's warning",
      );
    });

    it("names no `.wasm` file in any chunk", () => {
      assert.deepEqual(
        chunks
          .filter(({ code }) => /\.wasm\b/.test(code))
          .map(({ fileName }) => fileName),
        [],
      );
    });
  });

  describe("given the browser target's bundle (`--mode browser`)", () => {
    let modules: string[];

    before(async () => {
      ({ modules } = await bundled("browser"));
    });

    it("holds no AI SDK, no assistant-ui and no chat window", () => {
      assert.deepEqual(modules.filter(ofChat), []);
    });
  });
});
