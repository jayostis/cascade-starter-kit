import assert from "node:assert/strict";
import { test } from "node:test";

type Lock = { packages: Record<string, unknown> };
const { lockWithoutRuntime, pinnedTo } = (await import(
  new URL("../../scripts/pin-lib.mjs", import.meta.url).href
)) as {
  lockWithoutRuntime: (lock: Lock) => Lock;
  pinnedTo: (
    pin: string,
    commit: string,
    releaseExists: (address: string) => Promise<boolean>,
  ) => Promise<string>;
};

const OLD = "a".repeat(40);
const NEW = "b".repeat(40);
const pin = (sha: string) =>
  `https://github.com/jayostis/cascade-runtime-js/releases/download/build-${sha}/cascade-runtime-0.0.0-commit-${sha}.tgz`;

test("the lock forgets the runtime wherever npm put it, and nothing else", () => {
  const kept = [
    "",
    "app",
    "node_modules/cascade-runtime-other",
    "node_modules/react",
    "app/node_modules/cascade-runtime-other",
  ];
  const forgotten = [
    "node_modules/cascade-runtime",
    "node_modules/cascade-runtime/node_modules/oxigraph",
    "app/node_modules/cascade-runtime",
  ];
  const lock = {
    packages: Object.fromEntries([...kept, ...forgotten].map((p) => [p, {}])),
  };
  assert.deepEqual(Object.keys(lockWithoutRuntime(lock).packages), kept);
});

test("a pin onto a commit with no release is refused before anything is written", async () => {
  const asked: string[] = [];
  const exists = async (address: string) => {
    asked.push(address);
    return false;
  };
  await assert.rejects(
    pinnedTo(pin(OLD), NEW, exists),
    new RegExp(`no release build-${NEW}`),
  );
  assert.deepEqual(asked, [pin(NEW)]);
  assert.equal(await pinnedTo(pin(OLD), NEW, async () => true), pin(NEW));
});
