import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pod, Tables } from "cascade-runtime/published";

const { looks } = (await import(
  new URL("../../app/server/samples.ts", import.meta.url).href
)) as { looks(pod: Pod, tables: Tables): Promise<void> };

describe("Building try/, when the tables cannot be read · looks()", () => {
  describe("given a table lookup that throws", () => {
    it("rejects with an AggregateError holding each lookup's failure", async () => {
      const down = new Error("the tables are down");
      const pod = {
        ask: async () => [],
        unheldTableVersions: async () => [],
      } as unknown as Pod;
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
  });
});
