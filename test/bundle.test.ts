import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build, type Rolldown } from "vite";

const APP = fileURLToPath(new URL("../../app/", import.meta.url));

test("the Node target's bundle is the app over its typed client: no cascade-runtime, no server code and no wasm", async () => {
  const built = await build({
    root: APP,
    configFile: join(APP, "vite.config.ts"),
    logLevel: "silent",
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
  assert.ok(
    modules.some((id) => id.includes("/node_modules/hono/dist/client/")),
    "the bundle has no typed client",
  );
  assert.deepEqual(
    modules.filter(
      (id) =>
        id.includes("/node_modules/cascade-runtime/") ||
        id.includes("/app/server/") ||
        id.endsWith("/app/pod-api.mjs") ||
        /\/node_modules\/(@hono|zod)\//.test(id) ||
        /\/node_modules\/hono\/dist\/(?!client\/|utils\/)/.test(id),
    ),
    [],
  );
  assert.deepEqual(
    chunks
      .filter(({ code }) => /\.wasm\b/.test(code))
      .map(({ fileName }) => fileName),
    [],
  );
});
