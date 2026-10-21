import assert from "node:assert/strict";
import { test } from "node:test";
import type { z } from "zod";

const { INPUTS: CHECKED, inputRefusal } = (await import(
  new URL("../../app/pod-api.mjs", import.meta.url).href
)) as {
  INPUTS: Record<string, Record<string, unknown>>;
  inputRefusal: (operation: string, input: unknown) => string | undefined;
};
const { INPUTS: SCHEMAS, refusalOf } = (await import(
  new URL("../../app/server/inputs.ts", import.meta.url).href
)) as {
  INPUTS: Record<string, z.ZodObject>;
  refusalOf: (error: z.ZodError) => string;
};

/** A value of every kind a JSON body can carry a field as, and the edges of the kinds PodApi checks. */
const VALUES = [
  "text",
  "",
  "change",
  true,
  false,
  0,
  1,
  2,
  1.5,
  -1,
  Number.MAX_SAFE_INTEGER + 2,
  null,
  {},
  { a: 1 },
  [],
];

test("each operation's route schema accepts what PodApi's own check accepts, and refuses the rest with PodApi's sentence", () => {
  assert.deepEqual(Object.keys(SCHEMAS).sort(), Object.keys(CHECKED).sort());
  for (const [operation, schema] of Object.entries(SCHEMAS)) {
    const fields = [
      ...new Set([
        ...Object.keys(schema.shape),
        ...Object.keys(CHECKED[operation] ?? {}),
        "other",
      ]),
    ];
    const inputs = [
      [],
      "text",
      null,
      {},
      ...fields.flatMap((field) => VALUES.map((value) => ({ [field]: value }))),
    ];
    for (const input of inputs) {
      const parsed = schema.safeParse(input);
      assert.equal(
        parsed.success ? undefined : refusalOf(parsed.error),
        inputRefusal(operation, input),
        `${operation} ${JSON.stringify(input)}`,
      );
    }
  }
});
