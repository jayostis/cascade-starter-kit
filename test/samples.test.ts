import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pod, Tables } from "cascade-runtime/published";

const { looks } = (await import(
  new URL("../../app/server/samples.ts", import.meta.url).href
)) as { looks(pod: Pod, tables: Tables): Promise<void> };

test("a first-paint lookup that fails at the site build fails the build, naming each failure", async () => {
  const down = new Error("the tables are down");
  const pod = { ask: async () => [] } as unknown as Pod;
  const tables = {
    about: async () => {
      throw down;
    },
    held: async () => [],
  } as unknown as Tables;
  await assert.rejects(looks(pod, tables), (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [down]);
    return true;
  });
});
