// The browser target's host: PodApi in the page, over the pods this browser keeps in IndexedDB, the tables the
// runtime keeps here, the samples published beside the app and the demo hospitals its own service worker answers,
// signed in at in a popup. Every address is the app's base's, never the screen's: a screen's address is a path.
import {
  appTables,
  checkTables,
  configureRuntime,
  configureTables,
  ConnectionFailure,
  deletePod,
  directoryOf,
  openPod,
  podTitle,
  popupSignIn,
  TEST_DIRECTORY,
  Unopened,
  warm,
} from "cascade-runtime";
import {
  hospitalId,
  setWorldDate,
  useDemoHospitals,
  worldDate,
} from "@the-cascade-protocol/sandbox/web";
import { podApi } from "../../pod-api.mjs";
import type { Person } from "../../said.ts";
import type { Host, PodApi } from "../api.tsx";
import { busy } from "../doing.ts";

const BASE = new URL(import.meta.env.BASE_URL, location.href);
configureRuntime({ base: new URL("cascade-runtime/", BASE).href });
configureTables({ name: BASE.pathname });

const DATABASE = "cascade-pod:";
const ANSWERS = "cascade-answers:";
const WORKER = new URL("demo-hospital-worker.js", BASE);
/** How long a deletion waits before it says the pods are held open in other tabs. */
const OTHER_TABS_MS = 2000;
/** In this browser's storage while Delete all data is the last thing done, so that a later visit copies no sample in. */
const DELETED_ALL = "cascade-try:deleted-all";

/** The names of the databases here whose name starts with `prefix`, without it. */
async function databases(prefix: string): Promise<string[]> {
  return (await indexedDB.databases())
    .map(({ name }) => name ?? "")
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.slice(prefix.length))
    .sort();
}

/** What the site was built with, beside the app, as JSON; `none` when it cannot be read. */
async function beside<T>(file: string, none: T): Promise<T> {
  try {
    const answer = await fetch(new URL(file, BASE));
    return answer.ok ? ((await answer.json()) as T) : none;
  } catch {
    return none;
  }
}

/** The demo hospitals' rows, from the brands bundle the site was built with, then the test directory's. */
async function demoDirectory() {
  const bundle = await beside<unknown>("demo-brands.json", undefined);
  return bundle === undefined
    ? TEST_DIRECTORY
    : [...directoryOf(bundle as never, "demo"), ...TEST_DIRECTORY];
}

/** Whether Delete all data was the last thing done; false when storage cannot be read. */
function deletedAll(): boolean {
  try {
    return globalThis.localStorage.getItem(DELETED_ALL) !== null;
  } catch {
    return false;
  }
}

interface Row {
  readonly vendor: string;
  readonly fhirBase: string;
}

const demoHospitals = useDemoHospitals(WORKER);
demoHospitals.catch(() => undefined);
const directory = demoDirectory();
let popup: Window | null | undefined;
const samples = (document.body.dataset.samples ?? "")
  .split(" ")
  .filter(Boolean);

const browser = {
  pods: {
    names: () => databases(DATABASE),
    title: (name: string) => podTitle(name),
    open: (name: string, options?: object) => openPod(name, options),
    /** Deletes the pods and their answers, with `all` every answers database; never the tables. */
    async remove(names: string[], { all = false } = {}) {
      const gone = all
        ? [...new Set([...names, ...(await databases(ANSWERS))])]
        : names;
      const slow = window.setTimeout(
        () => busy("Waiting for the pods to close in your other tabs…"),
        OTHER_TABS_MS,
      );
      const deleted = await Promise.allSettled(gone.map(deletePod));
      window.clearTimeout(slow);
      const failure = deleted.find(({ status }) => status === "rejected");
      if (failure !== undefined)
        throw (failure as PromiseRejectedResult).reason;
    },
  },
  samples,
  copySample: (name: string) =>
    openPod(name, { from: new URL(`../${name}/pod/`, BASE).href }),
  tables: (pod?: never) => appTables(pod),
  checkTables: () => checkTables(),
  opensEncrypted: true,
  unsaid() {},
  world: {
    get: () => worldDate(WORKER).catch(() => undefined),
    async set(asOf: string | undefined) {
      await demoHospitals;
      await setWorldDate(WORKER, asOf);
    },
  },
  hospitals: {
    directory: async () => directory,
    registration: {
      clientId: "cascade-runtime-demo",
      redirectUri: new URL("signed-in.html", BASE).href,
    },
    fetch: (url: RequestInfo | URL, init?: RequestInit) => fetch(url, init),
    /** Resolves once the service worker answers a demo hospital; else rejects with the worker's own sentence. */
    async ready(row: Row) {
      if (row.vendor !== "demo") return;
      try {
        await demoHospitals;
      } catch (error) {
        popup?.close();
        popup = undefined;
        throw new ConnectionFailure(
          "demo-unavailable" as ConstructorParameters<
            typeof ConnectionFailure
          >[0],
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    signIn(row: Row, { pod }: { pod: string }, report: (href: string) => void) {
      const signing = popup;
      popup = undefined;
      return (authorize: URL, signal: AbortSignal) => {
        if (row.vendor === "demo")
          authorize.searchParams.set("login_hint", pod);
        report(authorize.href);
        return popupSignIn({ popup: signing })(authorize, signal).finally(() =>
          signing?.close(),
        );
      };
    },
    pullName: (row: Row) =>
      row.vendor === "demo"
        ? hospitalId({ hospital: row } as unknown as Parameters<
            typeof hospitalId
          >[0])
        : row.vendor,
  },
};

/** PodApi in the page, an `Unopened` it throws named so, as the screens tell errors by name. */
function named(api: Record<string, (input?: object) => Promise<unknown>>) {
  return Object.fromEntries(
    Object.entries(api).map(([operation, run]) => [
      operation,
      (input?: object) =>
        run(input).catch((error: unknown) => {
          if (error instanceof Unopened)
            Object.defineProperty(error, "name", { value: "Unopened" });
          throw error;
        }),
    ]),
  ) as unknown as PodApi;
}

const api = named(podApi(browser));

/**
 * A browser with no pod starts with a copy of every sample, unless Delete all data was the last thing done; a sample
 * that fails and leaves nothing behind stays one to load. One that leaves its database behind throws.
 */
async function firstVisit() {
  if ((await api.pods()).pods.length > 0 || deletedAll()) return;
  const copies = await Promise.allSettled(
    samples.map((name) => api.makePod({ person: name })),
  );
  const pods = (await api.pods()).pods.map(({ name }) => name);
  const left = samples.findIndex(
    (name, at) => copies[at]?.status === "rejected" && pods.includes(name),
  );
  const failure = copies[left];
  if (failure?.status === "rejected") throw failure.reason;
  if (pods.length === 0) await (await openPod()).close();
}

const { dataset } = document.body;

export const host: Host = {
  api,
  about: {
    name: dataset.name ?? "",
    version: dataset.version ?? "",
    runtime: dataset.runtime ?? "",
    code: "https://github.com/jayostis/cascade-starter-kit",
  },
  people: () => beside<Person[]>("demo-people.json", []),
  firstVisit,
  async engine() {
    warm().catch(() => undefined);
    await appTables();
  },
  async tables() {
    await (await appTables()).start();
  },
};
