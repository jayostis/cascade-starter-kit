// The Node target's host: PodApi at the server's `/api/`, beside the app. The bundle carries the typed client only:
// no server code and no runtime.
import type { Person } from "../../said.ts";
import type { Host, PodApi } from "../api.tsx";
import { remoteApi } from "./remote.ts";

const remote = remoteApi(new URL(import.meta.env.BASE_URL, location.href).href);

/**
 * The output as the screens read it: the server's routes answer `Output`, since `pod-api.mjs` is untyped until it is
 * TypeScript. Each operation passes its input through unchanged, so the route's schemas still check it.
 */
const as = <K extends keyof PodApi>(sent: Promise<unknown>) =>
  sent as ReturnType<PodApi[K]>;

const api: PodApi = {
  pods: (input) => as<"pods">(remote.pods(input)),
  held: (input) => as<"held">(remote.held(input)),
  pod: (input) => as<"pod">(remote.pod(input)),
  answers: (input) => as<"answers">(remote.answers(input)),
  said: (input) => as<"said">(remote.said(input)),
  trend: (input) => as<"trend">(remote.trend(input)),
  classes: (input) => as<"classes">(remote.classes(input)),
  panel: (input) => as<"panel">(remote.panel(input)),
  makePod: (input) => as<"makePod">(remote.makePod(input)),
  table: (input) => as<"table">(remote.table(input)),
  checkTables: (input) => as<"checkTables">(remote.checkTables(input)),
  waitingWords: (input) => as<"waitingWords">(remote.waitingWords(input)),
  confirmWords: (input) => as<"confirmWords">(remote.confirmWords(input)),
  unlock: (input) => as<"unlock">(remote.unlock(input)),
  deleteAll: (input) => as<"deleteAll">(remote.deleteAll(input)),
  resetAll: (input) => as<"resetAll">(remote.resetAll(input)),
  hospitals: (input) => as<"hospitals">(remote.hospitals(input)),
  connect: (input) => as<"connect">(remote.connect(input)),
  connection: (input) => as<"connection">(remote.connection(input)),
  bring: (input) => as<"bring">(remote.bring(input)),
  setWorldDate: (input) => as<"setWorldDate">(remote.setWorldDate(input)),
};

/** The demo people the server's hospitals hold; none when they cannot be read. */
async function people(): Promise<Person[]> {
  try {
    const answer = await fetch(
      new URL(
        "demo-people.json",
        new URL(import.meta.env.BASE_URL, location.href),
      ),
    );
    return answer.ok ? ((await answer.json()) as Person[]) : [];
  } catch {
    return [];
  }
}

const { dataset } = document.body;

export const host: Host = {
  api,
  about: {
    name: dataset.name ?? "",
    version: dataset.version ?? "",
    runtime: dataset.runtime ?? "",
    ...(dataset.code && { code: dataset.code }),
  },
  people,
  samples: [],
  firstVisit: async () => undefined,
  engine: async () => undefined,
  tables: async () => undefined,
};
