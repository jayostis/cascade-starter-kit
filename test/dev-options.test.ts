import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type InlineConfig, resolveConfig } from "vite";

const { devOptions, under } = (await import(
  new URL("../../app/server/dev-options.ts", import.meta.url).href
)) as {
  devOptions(root: string, pods: string): Promise<InlineConfig>;
  under(folder: string): string;
};

const APP = "C:/apps/demo/";
const PODS = "C:/apps/demo/pods/";

/** Vite's own `deny` list for `APP`, which a `deny` of the app's replaces. */
async function viteDeny() {
  const { server } = await resolveConfig(
    { root: APP, configFile: false },
    "serve",
  );
  return server.fs.deny;
}

/**
 * `npm run dev` serves the app's sources through Vite in the server's own process, and a pod is never among what Vite
 * serves or watches: a pod holds a person's record, and a write to one sent to a page's HMR socket names its path.
 */
describe("Keeping pods out of development's Vite · devOptions()", () => {
  describe("devOptions(root, pods).server.fs.deny", () => {
    it("holds every pattern of Vite's own list, which a `deny` of the app's would replace", async () => {
      const { server } = await devOptions(APP, PODS);
      const own = await viteDeny();
      assert.ok(own.length > 0);
      for (const pattern of own)
        assert.ok(server?.fs?.deny?.includes(pattern), pattern);
    });

    it("holds the pods folder and every `.answers` folder", async () => {
      const { server } = await devOptions(APP, PODS);
      assert.ok(server?.fs?.deny?.includes(under(PODS)));
      assert.ok(server?.fs?.deny?.includes("**/.answers/**"));
    });
  });

  describe("devOptions(root, pods).server.watch.ignored", () => {
    it("holds the pods folder, so a pod write sends nothing and reloads no page", async () => {
      const { server } = await devOptions(APP, PODS);
      assert.deepEqual(server?.watch?.ignored, [under(PODS)]);
    });
  });

  describe("devOptions(root, pods).server.hmr", () => {
    it("listens on loopback only", async () => {
      const { server } = await devOptions(APP, PODS);
      assert.deepEqual(server?.hmr, { host: "127.0.0.1" });
    });
  });

  describe("under(folder)", () => {
    it("reads a character a glob reads as itself", () => {
      assert.equal(under("C:\\a[b]\\pods\\"), "C:/a[[]b[]]/pods/**");
    });
  });
});
