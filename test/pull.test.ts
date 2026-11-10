import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { loadHospital, serveDemo } from "@the-cascade-protocol/sandbox/node";
import { openPod } from "cascade-runtime";
import { rowOf } from "./hospitals.js";
import { gone } from "./settled.js";

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

/**
 * On Node the app serves its demo hospitals from a listener of its own, and `nodeHospitals` gives PodApi the directory, the
 * sign-in and the way back that reach it. With it a made app signs a demo person in and pulls their records with no
 * hospital on the internet.
 */
describe("Reaching the demo hospitals from the Node server · nodeHospitals()", () => {
  describe("given a pod's `connect` to a demo hospital, approved at the listener", () => {
    let folder: string;
    let listener: Awaited<ReturnType<typeof serveDemo>> | undefined;
    let api: ReturnType<typeof podApi> | undefined;
    let fhirBase: string;
    let authorize: string;
    let returned: unknown;
    let pulledThere: Connected;

    before(async () => {
      folder = await mkdtemp(join(tmpdir(), "cascade-pull-"));
      const data = await loadHospital("cascade-north");
      fhirBase = rowOf(data).fhirBase;
      listener = await serveDemo([{ ...data, autoApprove: "pt-1001" }]);
      const at = join(folder, "pods");
      await (await openPod(join(at, "pod"))).close();
      const reached = nodeHospitals(
        "http://127.0.0.1:3000",
        [{ ...data, autoApprove: "pt-1001" }],
        { listener },
      );
      api = podApi({ ...nodeHost({ folder: at }), ...reached });
      const { connection: n, authorize: toSignIn } = await api.connect({
        pod: "pod",
        fhirBase,
      });
      authorize = toSignIn;
      const approved = await globalThis.fetch(authorize, {
        redirect: "manual",
      });
      returned = reached.back(new URL(approved.headers.get("location")!));
      pulledThere = await api.connection({
        pod: "pod",
        connection: n,
        wait: true,
      });
    });

    after(async () => {
      await api?.close();
      await listener?.close();
      await gone(folder);
    });

    it("sends the person to the listener to sign in", () => {
      assert.ok(
        authorize?.startsWith(listener!.origin),
        `sent to ${authorize}`,
      );
    });

    it("returns from `back(url)` the pod and the connection the hospital's redirect is for", () => {
      assert.deepEqual(returned, { pod: "pod", connection: 1 });
    });

    it("pulls from the hospital's FHIR base", () => {
      assert.equal(pulledThere.step, "pulled");
      assert.deepEqual(
        pulledThere.sources.map(({ server }: Connected) => server),
        [fhirBase],
      );
    });
  });
});
