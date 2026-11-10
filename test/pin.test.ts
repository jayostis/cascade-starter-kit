import assert from "node:assert/strict";
import { describe, it } from "node:test";

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

describe("Moving the runtime pin · scripts/pin.mjs", () => {
  describe("lockWithoutRuntime(lock)", () => {
    it("removes cascade-runtime's entries wherever npm put them, and keeps every other", () => {
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
        packages: Object.fromEntries(
          [...kept, ...forgotten].map((p) => [p, {}]),
        ),
      };
      assert.deepEqual(Object.keys(lockWithoutRuntime(lock).packages), kept);
    });
  });

  describe("pinnedTo(pin, commit, releaseExists)", () => {
    it("rejects for a commit with no release, having asked for that release's address and no other", async () => {
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
    });

    it("returns the pin's address moved onto a commit that has a release", async () => {
      assert.equal(await pinnedTo(pin(OLD), NEW, async () => true), pin(NEW));
    });
  });
});
