import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  describe("node scripts/pin.mjs <commit>, in a copy of the repository's two files", () => {
    /** Runs the script over a template pinned at OLD, a local server answering for every release with `status`; `lockReadOnly` makes the lock refuse its write. */
    async function run(status: number, lockReadOnly: boolean) {
      const root = await mkdtemp(join(tmpdir(), "pin-"));
      const server = createServer((_, response) => {
        response.statusCode = status;
        response.end();
      }).listen(0, "127.0.0.1");
      try {
        await once(server, "listening");
        const { port } = server.address() as AddressInfo;
        const address = (sha: string) =>
          `http://127.0.0.1:${port}/build-${sha}/cascade-runtime-0.0.0-commit-${sha}.tgz`;
        await mkdir(join(root, "scripts"));
        await mkdir(join(root, "app"));
        for (const file of ["pin.mjs", "pin-lib.mjs"])
          await copyFile(
            new URL(`../../scripts/${file}`, import.meta.url),
            join(root, "scripts", file),
          );
        const manifest = `${JSON.stringify({ dependencies: { "cascade-runtime": address(OLD) } }, null, 2)}\n`;
        const lock = `${JSON.stringify({ packages: { "": {} } }, null, 2)}\n`;
        await writeFile(join(root, "app", "package.json"), manifest);
        await writeFile(join(root, "package-lock.json"), lock);
        if (lockReadOnly) await chmod(join(root, "package-lock.json"), 0o444);
        // Asynchronously: this process's server must answer the script's request.
        const child = spawn(
          process.execPath,
          [join(root, "scripts", "pin.mjs"), NEW],
          { cwd: root, stdio: "ignore" },
        );
        const [status] = (await once(child, "close")) as [number | null];
        if (lockReadOnly) await chmod(join(root, "package-lock.json"), 0o644);
        return {
          status,
          manifest: await readFile(join(root, "app", "package.json"), "utf8"),
          lock: await readFile(join(root, "package-lock.json"), "utf8"),
          wasManifest: manifest,
          wasLock: lock,
        };
      } finally {
        server.close();
        await rm(root, { recursive: true, force: true });
      }
    }

    it("exits 2 and writes nothing for a commit with no release", async () => {
      const after = await run(404, false);
      assert.equal(after.status, 2);
      assert.equal(after.manifest, after.wasManifest);
      assert.equal(after.lock, after.wasLock);
    });

    it("puts the manifest back, and exits non-zero, when the lock's write fails after the manifest's", async () => {
      const after = await run(200, true);
      assert.notEqual(after.status, 0);
      assert.equal(after.manifest, after.wasManifest);
      assert.equal(after.lock, after.wasLock);
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
