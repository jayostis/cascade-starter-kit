import assert from "node:assert/strict";
import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const { buildStalePages } = (await import(
  new URL("../../app/server/built.ts", import.meta.url).href
)) as {
  buildStalePages(
    app: string,
    build: () => Promise<void>,
    env: Record<string, string>,
  ): Promise<boolean>;
};

/** An app with a `package.json` written a minute ago, and a stub build that counts its runs and writes `dist/`. */
async function appWithStubBuild() {
  const app = await mkdtemp(join(tmpdir(), "built-pages-"));
  await writeFile(join(app, "package.json"), "{}");
  const long = new Date(Date.now() - 60_000);
  await utimes(join(app, "package.json"), long, long);
  const runs = { count: 0 };
  const build = async () => {
    runs.count += 1;
    await mkdir(join(app, "dist"), { recursive: true });
    await writeFile(join(app, "dist", "index.html"), "<html></html>");
  };
  return { app, build, runs };
}

/** The app of `appWithStubBuild`, its pages built once under `env`. */
async function builtOnce(env: Record<string, string> = {}) {
  const made = await appWithStubBuild();
  await buildStalePages(made.app, made.build, env);
  return made;
}

/**
 * `npm start` serves the app's pages from `dist/`, and builds them first when they are missing or stale. A developer who
 * edits a source file or changes a setting sees it at the next start, with no build step to remember.
 */
describe("Serving pages built from the app as it stands · npm start, buildStalePages()", () => {
  describe("buildStalePages(app, build, env)", () => {
    it("runs the build for an app with no `dist/`, and returns true", async () => {
      const { app, build, runs } = await appWithStubBuild();
      assert.equal(await buildStalePages(app, build, {}), true);
      assert.equal(runs.count, 1);
    });

    it("returns false, running no build, for pages built since every source was written", async () => {
      const { app, build, runs } = await builtOnce();
      assert.equal(await buildStalePages(app, build, {}), false);
      assert.equal(runs.count, 1);
    });

    it("runs the build again when `package.json` was written after the pages", async () => {
      const { app, build, runs } = await builtOnce();
      const later = new Date(Date.now() + 60_000);
      await utimes(join(app, "package.json"), later, later);
      assert.equal(await buildStalePages(app, build, {}), true);
      assert.equal(runs.count, 2);
    });

    it("runs the build again when a setting the pages are built with (`CASCADE_NAME`) differs from the last build's", async () => {
      const { app, build, runs } = await builtOnce({ CASCADE_NAME: "One" });
      assert.equal(
        await buildStalePages(app, build, { CASCADE_NAME: "Two" }),
        true,
      );
      assert.equal(runs.count, 2);
    });

    it("returns false for that setting given a second time", async () => {
      const { app, build, runs } = await builtOnce({ CASCADE_NAME: "One" });
      await buildStalePages(app, build, { CASCADE_NAME: "Two" });
      assert.equal(
        await buildStalePages(app, build, { CASCADE_NAME: "Two" }),
        false,
      );
      assert.equal(runs.count, 2);
    });
  });
});
