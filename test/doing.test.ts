import assert from "node:assert/strict";
import { test } from "node:test";
import { screens } from "./render.js";

interface Doing {
  flight(
    step: () => Promise<boolean | void>,
    doing: string,
    refusal: (error: unknown) => boolean,
  ): Promise<unknown>;
  ready(): void;
  failed(reason: string): void;
  moved(): void;
  isStepping(): boolean;
}

const body = { dataset: {} as Record<string, string | undefined> };
Object.assign(globalThis, {
  document: { body, querySelectorAll: () => [] },
});
const doing = await screens<Doing>(`export * from "./doing.ts"`);
const state = () => body.dataset.state;

function started() {
  let release: (value: boolean) => void = () => undefined;
  const gate = new Promise<boolean>((resolve) => (release = resolve));
  const run = doing.flight(() => gate, "Working…", () => false);
  return { release, run };
}

test("while a step runs, a screen saying ready at the address it is leaving is ignored until the step's own move", async () => {
  const { release, run } = started();
  doing.ready();
  assert.equal(state(), "busy");
  assert.equal(doing.isStepping(), true);
  doing.moved();
  doing.ready();
  assert.equal(state(), "ready");
  assert.equal(doing.isStepping(), false);
  release(true);
  await run;
  assert.equal(state(), "ready");
});

test("a step that throws leaves the page busy for the screen that says what went wrong, which may say ready", async () => {
  let fail: (error: Error) => void = () => undefined;
  const run = doing.flight(
    () => new Promise<void>((_, reject) => (fail = reject)),
    "Working…",
    () => true,
  );
  fail(new Error("no"));
  await run;
  assert.equal(state(), "busy");
  doing.ready();
  assert.equal(state(), "ready");
});
