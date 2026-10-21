import assert from "node:assert/strict";
import { test } from "node:test";
import { checkInput } from "cascade-runtime";

const { checkToolInput } = (await import(
  new URL("../../app/src/check.ts", import.meta.url).href
)) as { checkToolInput: (schema: object, input: unknown) => void };

const SCHEMA = {
  type: "object",
  properties: {
    person: { type: "string" },
    limit: { type: "integer", minimum: 1, maximum: 5 },
    kind: { type: "string", enum: ["a", "b"] },
  },
  required: ["person"],
  additionalProperties: false,
};

const refuses = (check: () => void) => {
  try {
    check();
    return false;
  } catch (error) {
    assert.equal((error as Error).name, "Refusal");
    return true;
  }
};

test("the page's check of a tool's input refuses what the runtime's checkInput refuses, and accepts what it accepts", () => {
  const inputs: unknown[] = [
    { person: "x" },
    { person: "x", limit: 3, kind: "a" },
    {},
    [],
    null,
    "text",
    { person: 1 },
    { person: "x", limit: 1.5 },
    { person: "x", limit: 0 },
    { person: "x", limit: 6 },
    { person: "x", kind: "c" },
    { person: "x", other: 1 },
    { person: "x", toString: 1 },
    { person: "x", constructor: "y" },
    { person: "x", __proto__: 1 },
  ];
  for (const input of inputs)
    assert.equal(
      refuses(() => checkToolInput(SCHEMA, input)),
      refuses(() => checkInput(SCHEMA as never, input)),
      JSON.stringify(input),
    );
});
