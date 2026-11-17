import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { Page } from "playwright";
import { watched, withDiagnosis } from "../test-browser/shown.js";

/** A page that says what a diagnosis reads of it, and nothing else. */
function fakePage(): Page {
  return {
    on: () => undefined,
    innerText: () => Promise.resolve("the page's own words"),
    isClosed: () => false,
    url: () => "http://localhost/pods/a/",
  } as unknown as Page;
}

describe("Diagnosing a failed step on a watched page · shown.ts", () => {
  it("a failed assertion carries the page's text in its message and in its stack", async () => {
    const page = watched(fakePage());
    const error = await withDiagnosis(page, () => {
      assert.equal(1, 2);
      return Promise.resolve();
    }).catch((caught: unknown) => caught);
    assert.ok(error instanceof assert.AssertionError);
    assert.match(error.message, /the page's own words/);
    assert.match(error.stack ?? "", /the page's own words/);
    assert.equal(error.actual, 1);
    assert.equal(error.expected, 2);
  });

  it("a failed assertion's diagnosis is there once however many steps nest", async () => {
    const page = watched(fakePage());
    const error = (await withDiagnosis(page, () =>
      withDiagnosis(page, () => {
        assert.equal(1, 2);
        return Promise.resolve();
      }),
    ).catch((caught: unknown) => caught)) as assert.AssertionError;
    assert.equal((error.stack ?? "").split("--- the page at").length, 2);
  });

  it("a failed assertion run under node:test is printed with the diagnosis", () => {
    const folder = mkdtempSync(join(tmpdir(), "shown-"));
    try {
      const file = join(folder, "fails.test.mjs");
      writeFileSync(
        file,
        [
          'import { test } from "node:test";',
          'import assert from "node:assert/strict";',
          `import { watched, withDiagnosis } from ${JSON.stringify(new URL("../test-browser/shown.js", import.meta.url).href)};`,
          `const page = watched({ on() {}, innerText: async () => "the page's own words", isClosed: () => false, url: () => "http://localhost/" });`,
          'test("fails", () => withDiagnosis(page, async () => assert.equal(1, 2)));',
        ].join("\n"),
      );
      const outside = { ...process.env };
      delete outside.NODE_TEST_CONTEXT;
      const run = spawnSync(
        process.execPath,
        ["--test", "--test-reporter=spec", file],
        { encoding: "utf8", env: outside },
      );
      const printed = run.stdout + run.stderr;
      assert.match(printed, /the page's own words/);
      assert.match(printed, /--- the page at http:\/\/localhost\//);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
