import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { loadHospital, serveDemo } from "@the-cascade-protocol/sandbox/node";
import { openPod } from "cascade-runtime";
import { rowOf } from "./hospitals.js";

const { nodeHost, nodeHospitals } = (await import(
  new URL("../../app/node-host.ts", import.meta.url).href
)) as {
  nodeHost: (options: { folder: string }) => object;
  nodeHospitals: (
    origin: string,
    demo: object[],
    options: object,
  ) => { hospitals: object; world: object; back: (url: URL) => unknown };
};
type Connected = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const { podApi } = (await import(
  new URL("../../app/pod-api.ts", import.meta.url).href
)) as {
  podApi: (
    host: object,
  ) => Record<
    "connect" | "connection",
    (input: object) => Promise<Connected>
  > & { close(): Promise<void> };
};

let folder: string;

before(async () => {
  folder = await mkdtemp(join(tmpdir(), "cascade-pull-"));
});

after(async () => {
  await rm(folder, { recursive: true, force: true });
});

test("the starter's hospitals reach the listener", async () => {
  const data = await loadHospital("cascade-north");
  const { fhirBase } = rowOf(data);
  const listener = await serveDemo([{ ...data, autoApprove: "pt-1001" }]);
  try {
    const at = join(folder, "pods");
    await (await openPod(join(at, "pod"))).close();
    const reached = nodeHospitals(
      "http://127.0.0.1:3000",
      [{ ...data, autoApprove: "pt-1001" }],
      { listener },
    );
    const api = podApi({ ...nodeHost({ folder: at }), ...reached });
    try {
      const { connection: n, authorize } = await api.connect({
        pod: "pod",
        fhirBase,
      });
      assert.ok(authorize?.startsWith(listener.origin), `sent to ${authorize}`);
      const approved = await globalThis.fetch(authorize, {
        redirect: "manual",
      });
      const back = new URL(approved.headers.get("location")!);
      assert.deepEqual(reached.back(back), { pod: "pod", connection: 1 });
      const pulledThere = await api.connection({
        pod: "pod",
        connection: n,
        wait: true,
      });
      assert.equal(pulledThere.step, "pulled");
      assert.deepEqual(
        pulledThere.sources.map(({ server }: Connected) => server),
        [fhirBase],
      );
    } finally {
      await api.close();
    }
  } finally {
    await listener.close();
  }
});
