import assert from "node:assert/strict";
import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const { builtPages } = (await import(
  new URL("../../app/server/built.ts", import.meta.url).href
)) as {
  builtPages(
    app: string,
    build: () => Promise<void>,
    env: Record<string, string>,
  ): Promise<boolean>;
};

/** An app whose pages were built once, and how many times the stub build has run since. */
async function built(env: Record<string, string> = {}) {
  const app = await mkdtemp(join(tmpdir(), "built-pages-"));
  await writeFile(join(app, "package.json"), "{}");
  const runs = { count: 0 };
  const build = async () => {
    runs.count += 1;
    await mkdir(join(app, "dist"), { recursive: true });
    await writeFile(join(app, "dist", "index.html"), "<html></html>");
  };
  const long = new Date(Date.now() - 60_000);
  await utimes(join(app, "package.json"), long, long);
  assert.equal(await builtPages(app, build, env), true, "no dist/ is built");
  assert.equal(await builtPages(app, build, env), false, "a fresh one is not");
  return { app, build, runs };
}

test("the app's pages are built again when a file they are built from, package.json among them, is newer than dist/", async () => {
  const { app, build, runs } = await built();
  const later = new Date(Date.now() + 60_000);
  await utimes(join(app, "package.json"), later, later);
  assert.equal(await builtPages(app, build, {}), true);
  assert.equal(runs.count, 2);
});

test("the app's pages are built again when a setting baked into them is not the one the last build used", async () => {
  const { app, build, runs } = await built({ CASCADE_NAME: "One" });
  assert.equal(await builtPages(app, build, { CASCADE_NAME: "Two" }), true);
  assert.equal(await builtPages(app, build, { CASCADE_NAME: "Two" }), false);
  assert.equal(runs.count, 2);
});
