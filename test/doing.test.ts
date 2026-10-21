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
  moved(mark: number, path: string): void;
  landed(mark: number | undefined, path: string): void;
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
  const run = doing.flight(
    () => gate,
    "Working…",
    () => false,
  );
  return { release, run };
}

test("while a step runs, a screen saying ready is ignored until the step's own move is drawn, even once the move is asked for", async () => {
  const { release, run } = started();
  doing.ready();
  assert.equal(state(), "busy");
  assert.equal(doing.isStepping(), true);
  doing.moved(7, "/pods/b/");
  doing.ready();
  assert.equal(state(), "busy", "the screen left, drawn before the move");
  doing.landed(undefined, "/pods/a/");
  doing.landed(6, "/pods/a/");
  doing.ready();
  assert.equal(state(), "busy", "another location drawn meanwhile");
  doing.landed(undefined, "/pods/b/");
  doing.ready();
  assert.equal(state(), "ready", "the move, its mark dropped by a redirect");
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
