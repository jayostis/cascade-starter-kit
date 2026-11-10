import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { z } from "zod";

const { INPUTS: CHECKED, inputRefusal } = (await import(
  new URL("../../app/pod-api.ts", import.meta.url).href
)) as {
  INPUTS: Record<string, Record<string, unknown>>;
  inputRefusal: (operation: string, input: unknown) => string | undefined;
};
const { INPUT_SCHEMAS: SCHEMAS, refusalOf } = (await import(
  new URL("../../app/server/inputs.ts", import.meta.url).href
)) as {
  INPUT_SCHEMAS: Record<string, z.ZodObject>;
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

/** The bodies that tell a route's schema from PodApi's own check: no object, an empty one, and each field with each kind of value. */
function bodiesFor(operation: string, schema: z.ZodObject): unknown[] {
  const fields = [
    ...new Set([
      ...Object.keys(schema.shape),
      ...Object.keys(CHECKED[operation] ?? {}),
      "other",
    ]),
  ];
  return [
    [],
    "text",
    null,
    {},
    ...fields.flatMap((field) => VALUES.map((value) => ({ [field]: value }))),
  ];
}

describe("Calling PodApi over HTTP · /api/, INPUT_SCHEMAS, refusalOf()", () => {
  describe("given a body PodApi's own check (`inputRefusal()`) would refuse", () => {
    it("has a schema for each operation PodApi checks, and for no other", () => {
      assert.deepEqual(
        Object.keys(SCHEMAS).sort(),
        Object.keys(CHECKED).sort(),
      );
    });

    for (const [operation, schema] of Object.entries(SCHEMAS))
      it(`refuses \`${operation}\`'s body with PodApi's sentence, and accepts what PodApi accepts`, () => {
        for (const input of bodiesFor(operation, schema)) {
          const parsed = schema.safeParse(input);
          assert.equal(
            parsed.success ? undefined : refusalOf(parsed.error),
            inputRefusal(operation, input),
            `${operation} ${JSON.stringify(input)}`,
          );
        }
      });
  });
});
