// The Node target's host: PodApi at the server's `/api/`, beside the app. The bundle carries the typed client only:
// no server code and no runtime.
import type { Host, PodApi } from "../api.tsx";
import { remoteApi } from "./remote.ts";

const remote = remoteApi(new URL(import.meta.env.BASE_URL, location.href).href);

/**
 * An operation the screens call, its output as the screens read it: the server's routes answer `Output`, since
 * `pod-api.mjs` is untyped until it is TypeScript.
 */
const read = <K extends keyof PodApi>(operation: K) =>
  remote[operation] as unknown as PodApi[K];

const api: PodApi = {
  pods: read("pods"),
  held: read("held"),
  pod: read("pod"),
  answers: read("answers"),
  said: read("said"),
  makePod: read("makePod"),
};

const { dataset } = document.body;

export const host: Host = {
  api,
  about: {
    name: dataset.name ?? "",
    version: dataset.version ?? "",
    runtime: dataset.runtime ?? "",
  },
  people: async () => [],
  firstVisit: async () => undefined,
  engine: async () => undefined,
  tables: async () => undefined,
};
