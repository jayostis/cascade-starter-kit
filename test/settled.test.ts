import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gone } from "./settled.js";

test("a folder whose tables are still being written into by the copy is removed all the same", async () => {
  const at = await mkdtemp(join(tmpdir(), "settled-"));
  const tables = join(at, ".tables");
  await mkdir(tables);
  let writing = true;
  const writer = (async () => {
    const until = Date.now() + 300;
    for (let n = 0; writing && Date.now() < until; n += 1)
      await writeFile(join(tables, `late-${n}`), "").catch(() => {
        writing = false;
      });
  })();
  await gone(at);
  writing = false;
  await writer;
  assert.equal(existsSync(at), false);
});
