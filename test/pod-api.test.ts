import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it, mock } from "node:test";
import { getRequestListener } from "@hono/node-server";
import { loadHospital, loadStories } from "@the-cascade-protocol/sandbox/node";
import { Hono } from "hono";
import {
  ConnectionFailure,
  openPod,
  pullFiles,
  Refusal,
  sixWords,
  timelineIn,
  Unopened,
} from "cascade-runtime";
import { replayKit } from "cascade-runtime/fixtures";
import { trendOf } from "cascade-runtime/tools";
import { answering, type Loaded, pulled, routed, rowOf } from "./hospitals.js";
import { removed } from "./settled.js";

type Input = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output = Record<string, any>;
type Operation = (input: Input) => Promise<Output>;
type Api = Record<
  | "pods"
  | "held"
  | "pod"
  | "answers"
  | "said"
  | "trend"
  | "classes"
  | "panel"
  | "table"
  | "ask"
  | "tool"
  | "makePod"
  | "waitingWords"
  | "confirmWords"
  | "unlock"
  | "deleteAll"
  | "resetAll"
  | "checkTables"
  | "setWorldDate"
  | "hospitals"
  | "connect"
  | "connection"
  | "bring",
  Operation
> & { close(): Promise<void> };
type Host = Record<string, unknown> & { tables: unknown };

const { podApi, maps, notOpenedHere, WAIT_MS } = (await import(
  new URL("../../app/pod-api.ts", import.meta.url).href
)) as {
  WAIT_MS: number;
  podApi: (host: Host) => Api;
  maps: (output: Output) => Output;
  notOpenedHere: (name: string) => string;
};
/** The Node target's server, as far as this test serves it, and what it answers as. */
interface Own {
  hosts: Set<string>;
  origins: Set<string>;
}
interface App {
  fetch(request: Request): Response | Promise<Response>;
  request(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
const { appServer } = (await import(
  new URL("../../app/server/app.ts", import.meta.url).href
)) as {
  appServer: (served: {
    api: Api;
    own: () => Own;
    chat: Hono;
    back: () => undefined;
    pages: string;
  }) => App;
};
/** PodApi at a server, through the app's own typed client. */
const { remoteApi } = (await import(
  new URL("../../app/src/hosts/remote.ts", import.meta.url).href
)) as {
  remoteApi: (
    base: string,
    options: {
      fetch: (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => Promise<Response>;
      headers: Record<string, string>;
    },
  ) => Api;
};
const { nodeHost } = (await import(
  new URL("../../app/node-host.ts", import.meta.url).href
)) as {
  nodeHost: (options: { folder: string; opensEncrypted?: boolean }) => Host & {
    pods: {
      remove(names: string[], options: { all: boolean }): Promise<void>;
    };
  };
};
const { entryId, testsIn, PAGE_TOOLS } = (await import(
  new URL("../../app/said.ts", import.meta.url).href
)) as {
  entryId: (entry: string) => string;
  testsIn: (labs: unknown[]) => { code: string; notation?: string }[];
  PAGE_TOOLS: { name: string }[];
};
const { TOOLS } = (await import(
  new URL("../../app/tools.ts", import.meta.url).href
)) as { TOOLS: { name: string; tier: string; opens?: true }[] };

const STATIN = "story-statin";
const EMPTY = "empty";
const SEALED = "sealed";
const LDL = "18262-6";
const ATORVASTATIN = "617310";
const SECOND_ATORVASTATIN = "617314";
const LABS = "pod/My lab results";

let folder: string;
/** The words that open the encrypted pod. */
const SEALED_WORDS = sixWords();
/** The IRIs of the LDL test and of atorvastatin, found in the statin pod by their notation. */
const iris = { ldl: "", atorvastatin: "" };
const named = (label: string) => ({ name: { label, altLabels: [] } });

/** A `Tables` holding one LOINC series, naming the LDL test and atorvastatin and nothing else. */
const FAKE = {
  held: async () => [
    {
      iri: "urn:uuid:loinc-terms",
      label: "LOINC terms",
      source: "urn:uuid:loinc",
      versions: [],
    },
  ],
  about: async (codes: string[]) =>
    new Map(
      codes.flatMap((code) =>
        code === iris.ldl
          ? [[code, named("LDL cholesterol")]]
          : code === iris.atorvastatin
            ? [[code, named("atorvastatin")]]
            : [],
      ),
    ),
  codeNamed: async (_: unknown, written: string) =>
    written === LDL ? iris.ldl : undefined,
  facts: async () => ({ notation: LDL, about: named("LDL cholesterol") }),
  search: async () => ({ found: [], total: 0, size: 50 }),
  uses: async () => [],
  inPanels: async () => [],
  classedElsewhere: async () => new Map(),
  labels: async () => new Map(),
  current: async () => [],
  check: async () => [{ feed: "f", kept: ["v"], refused: [] }],
};

function counted<T>(give: () => Promise<T>) {
  const wrapped = Object.assign(
    () => {
      wrapped.calls += 1;
      return give();
    },
    { calls: 0 },
  );
  return wrapped;
}

/** Whether `value` is plain JSON: no Map, Set, Date, function, class instance or non-finite number; undefined allowed. */
function plainJson(value: unknown, at = "output"): void {
  if (value === null || value === undefined) return;
  if (typeof value === "number")
    return assert.ok(Number.isFinite(value), `${at} is ${value}`);
  if (typeof value === "string" || typeof value === "boolean") return;
  assert.equal(typeof value, "object", `${at} is a ${typeof value}`);
  if (Array.isArray(value))
    return value.forEach((each, n) => plainJson(each, `${at}[${n}]`));
  assert.equal(
    Object.getPrototypeOf(value),
    Object.prototype,
    `${at} is a ${value.constructor?.name}`,
  );
  for (const [key, each] of Object.entries(value))
    plainJson(each, `${at}.${key}`);
}

let north: Loaded;
/** The world's date the test hosts' hospitals answer as of. */
const world = {
  asOf: undefined as string | undefined,
  get() {
    return this.asOf;
  },
  set(asOf: string | undefined) {
    this.asOf = asOf;
  },
};

/**
 * Cascade North, in the process, as a host's hospitals: its sign-in page answered as the statin pod's patient, who
 * cancels it when the pod is the empty one. `seen` gets each authorize URL the sign-in is given.
 */
function northHospitals(seen: URL[] = []) {
  const fetch = routed([{ ...north, autoApprove: undefined }], {
    requests: [],
    secrets: new Set(),
  });
  return {
    directory: async () => [rowOf(north)],
    registration: {
      clientId: "cascade-app",
      redirectUri: "https://app.test.invalid/callback",
    },
    fetch,
    ready: async () => undefined,
    signIn:
      (_: unknown, { pod }: { pod: string }, report: (href: string) => void) =>
      async (authorize: URL, signal?: AbortSignal) => {
        seen.push(new URL(authorize));
        report(authorize.href);
        return answering(STATIN, pod === EMPTY ? "cancel" : "allow")(fetch)(
          authorize,
          signal,
        );
      },
    pullName: () => "north",
  };
}

const host = (at = folder) => ({
  ...nodeHost({ folder: at }),
  tables: counted(async () => FAKE),
  checkTables: async () => FAKE.check(),
  hospitals: northHospitals(),
  world,
});
type Closable = { close(): Promise<void> };

/**
 * `given` with every `pods.open` call counted, every pod it opened counted, and every such pod counted when closed. With `held`, an opening with a
 * secret waits for `release()`; `started(n)` resolves once `n` such openings have begun.
 */
function opening(given: ReturnType<typeof host>, held = false) {
  const pods = given.pods as unknown as {
    open(name: string, options?: { secret?: string }): Promise<Closable>;
  };
  const seen = { calls: 0, opens: 0, closes: 0 };
  const waiters: { n: number; done: () => void }[] = [];
  let begun = 0;
  let release!: () => void;
  const gate = new Promise<void>((done) => (release = done));
  const counting = {
    ...given,
    pods: {
      ...given.pods,
      open: async (name: string, options?: { secret?: string }) => {
        seen.calls += 1;
        if (options?.secret !== undefined) {
          begun += 1;
          for (const { n, done } of waiters) if (n <= begun) done();
          if (held) await gate;
        }
        const pod = await pods.open(name, options);
        seen.opens += 1;
        const close = pod.close.bind(pod);
        pod.close = async () => {
          seen.closes += 1;
          return close();
        };
        return pod;
      },
    },
  };
  return {
    host: counting,
    seen,
    release,
    started: (n: number) =>
      new Promise<void>((done) => {
        if (begun >= n) done();
        else waiters.push({ n, done });
      }),
  };
}
const made: Api[] = [];
const servers: Server[] = [];

/** What each call that reached the server's instance came back with, in order, for `both()` to compare. */
type Call = PromiseSettledResult<Output>;

/** The Node target's server over `built`, answering as `own()` names it, and what `built` answered each call. */
function served(built: Api, own: () => Own): [App, Call[]] {
  const calls: Call[] = [];
  const recording = { ...built } as Api;
  for (const name of Object.keys(built) as (keyof Api)[]) {
    if (name === "close") continue;
    recording[name] = async (input: Input) => {
      try {
        const value = await built[name](input);
        calls.push({ status: "fulfilled", value });
        return value;
      } catch (reason) {
        calls.push({ status: "rejected", reason });
        throw reason;
      }
    };
  }
  const app = appServer({
    api: recording,
    own,
    chat: new Hono(),
    back: () => undefined,
    pages: folder,
  });
  return [app, calls];
}

/** Serves `built` on an ephemeral port, as `npm start` does, and gives the address and what `built` answered each call. */
async function serve(built: Api): Promise<[string, Call[]]> {
  let origin = "";
  const [app, calls] = served(built, () => ({
    hosts: new Set([new URL(origin).host]),
    origins: new Set([origin]),
  }));
  const server = createServer(getRequestListener(app.fetch));
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  origin = `http://127.0.0.1:${port}`;
  return [origin, calls];
}

/** A refusal as the app tells it, by its name; an `Unopened` carries its `outcome`. */
const isRefusal = (error: unknown): error is Error & { outcome?: string } =>
  error instanceof Error &&
  (error.name === "Refusal" || error.name === "Unopened");
const unopened = (error: unknown, outcome: string) =>
  isRefusal(error) && error.outcome === outcome;

/**
 * `built` over HTTP: through the Node target's server, by `app.request()`, with the app's own client.
 * A call over HTTP runs once, on `built`, unless its route refuses the input first, as PodApi would refuse it; what
 * comes back must be what `built` answered that call, after a JSON round trip, and what is thrown a refusal of the
 * same name with the same message. What `built` threw other than a `Refusal` crosses as a 500 naming the operation.
 */
function crossing(built: Api): Api {
  const origin = "http://app.test";
  const [app, calls] = served(built, () => ({
    hosts: new Set(["app.test"]),
    origins: new Set([origin]),
  }));
  const remote = remoteApi(`${origin}/`, {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      app.request(input, init),
    headers: { origin },
  });
  const over = {} as Api;
  for (const name of Object.keys(remote) as (keyof Api)[]) {
    if (name === "close") continue;
    over[name] = async (input: Input) => {
      const [crossed] = await Promise.allSettled([remote[name](input)]);
      const direct = calls.pop();
      assert.equal(calls.length, 0, `${name} ran once`);
      if (direct === undefined) {
        if (crossed.status === "fulfilled")
          assert.fail(`${name} answered, never reaching PodApi`);
        const [own] = await Promise.allSettled([built[name](input)]);
        if (own.status === "fulfilled")
          assert.fail(`${name} refused over HTTP only`);
        assert.equal(crossed.reason.name, "Refusal");
        assert.equal(crossed.reason.message, own.reason.message);
        throw crossed.reason;
      }
      if (crossed.status === "fulfilled") {
        assert.equal(direct.status, "fulfilled", `${name} over HTTP`);
        assert.deepStrictEqual(
          crossed.value,
          JSON.parse(JSON.stringify(direct.value)),
          `${name} over HTTP`,
        );
        return crossed.value;
      }
      assert.equal(direct.status, "rejected", `${name} over HTTP`);
      const [was, is] = [direct.reason, crossed.reason];
      if (was instanceof Refusal) {
        assert.equal(is.name, was instanceof Unopened ? "Unopened" : "Refusal");
        assert.equal(is.message, was.message);
        if (was instanceof Unopened) assert.equal(is.outcome, was.outcome);
      } else assert.equal(is.message, `${name}: the server answered 500`);
      throw is;
    };
  }
  over.close = async () => undefined;
  return over;
}
function api(given: Host = host()) {
  const built = podApi(given);
  made.push(built);
  const checked = {} as Api;
  for (const [name, operation] of Object.entries(built))
    (checked as Record<string, unknown>)[name] =
      name === "close" || name === "tables"
        ? operation
        : async (input: Input) => {
            const output = await (operation as Operation)(input);
            plainJson(output, name);
            return output;
          };
  return checked;
}

before(async () => {
  folder = await mkdtemp(join(tmpdir(), "pod-api-"));
  north = await loadHospital("cascade-north");
  const story = (await loadStories()).find(
    ({ patient }) => patient === STATIN,
  )!;
  const { pull } = await pulled(north, story.patient);
  const statin = await openPod(join(folder, STATIN));
  const imported = await statin.import(pullFiles(pull, "north"), {
    claimProfiles: true,
  });
  assert.equal(imported.refused, undefined);
  const labs = await statin.ask(LABS);
  iris.ldl = testsIn(labs).find(({ notation }) => notation === LDL)!.code;
  iris.atorvastatin = timelineIn(
    await statin.ask("pod/My medication history"),
  ).find(({ notation }) => notation === ATORVASTATIN)!.code!;
  const empty = await openPod(join(folder, EMPTY));
  const sealed = await openPod(join(folder, SEALED), { secret: SEALED_WORDS });
  await Promise.all([statin, empty, sealed].map((pod) => pod.close()));
  inProcess = api();
  overHttp = crossing(inProcess);
});

/** The folders of the tests that write, each its own, so the shared pods stay as they were made. */
const folders: string[] = [];

/** A folder of its own, the host over it with `extra` given the folder, and its instance in the process and over HTTP. */
async function fresh(extra: (at: string) => Input = () => ({})) {
  const at = await mkdtemp(join(tmpdir(), "pod-api-writes-"));
  folders.push(at);
  const given = { ...host(at), ...extra(at) };
  const built = api(given);
  return { built, host: given, over: crossing(built) };
}

after(async () => {
  await Promise.all(made.map((each) => each.close()));
  await Promise.all(
    servers.map((each) => new Promise((done) => each.close(done))),
  );
  for (const each of [folder, ...folders]) await removed(each);
});

/** The instance the shared pods are read through, made once the pods are: in the process, and over HTTP. */
let inProcess: Api;
let overHttp: Api;
const labs = async (): Promise<Output[]> =>
  (await overHttp.ask({ pod: STATIN, question: LABS })).rows;

/** Runs `make` the first time it is asked for, and gives every later ask what it made. */
function once<T>(make: () => Promise<T>): () => Promise<T> {
  let made: Promise<T> | undefined;
  return () => (made ??= make());
}
/** What `call` rejected with, and a failure when it did not reject. */
const caught = (call: Promise<unknown>) =>
  call.then(
    () => assert.fail("it did not reject"),
    (error: Error & { outcome?: string }) => error,
  );
const FHIR_BASE = () => rowOf(north).fhirBase;
/** A connection of `pod` to Cascade North, waited for until it has settled. */
async function connected(local: Api, pod: string) {
  const { connection } = await local.connect({ pod, fhirBase: FHIR_BASE() });
  return {
    connection,
    shown: await local.connection({ pod, connection, wait: true }),
  };
}
/** `name` as a model runs it through `POST /tools/<name>` on the Node server over `built`. */
function toolsOf(built: Api) {
  const origin = "http://app.test";
  const [app] = served(built, () => ({
    hosts: new Set(["app.test"]),
    origins: new Set([origin]),
  }));
  return {
    app,
    origin,
    run: (name: string, input: object) =>
      app.request(`${origin}/tools/${name}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
  };
}
/** An instance whose host cannot read the reference tables. */
const brokenApi = () =>
  api({
    ...host(),
    tables: async () => {
      throw new Error("tables are broken");
    },
  });

/** A stub pod `reviewed`: one thing that needs review, and one table version the app does not hold. */
const reviewing = () => {
  const answered: Record<string, unknown[]> = {
    "entry/What needs review": [
      {
        entry: "urn:uuid:0e1f",
        entryLabel: "Allergy entry · Latex",
        needs: "judged different, still joined",
      },
    ],
  };
  return crossing(
    api({
      ...host(),
      pods: {
        names: async () => ["reviewed"],
        title: async () => undefined,
        open: async () => ({
          ask: async (question: string) => answered[question] ?? [],
          unheldTableVersions: async () => ["urn:x:ingredient-map-2"],
          close: async () => {},
        }),
      },
    }),
  );
};

/**
 * PodApi's reads give each screen of a pod what it shows, as plain JSON: first the pod's own rows, which need no
 * reference tables, then what the tables say of them. A screen can so be drawn before the tables have loaded.
 */
describe("Reading a pod for its screens · api.pods(), api.pod(), api.answers(), api.said(), api.trend(), api.classes(), api.panel()", () => {
  let counting: ReturnType<typeof host>;
  let listed: Output;
  let read: Output;
  before(async () => {
    counting = host();
    const counted = crossing(api(counting));
    listed = await counted.pods({});
    read = await counted.answers({ pod: STATIN });
  });

  describe("api.pods()", () => {
    it("returns every pod's name and title, in the order of their names", () => {
      assert.deepEqual(
        listed.pods,
        [EMPTY, SEALED, STATIN].map((name) => ({ name, title: name })),
      );
    });
  });

  describe("api.answers({ pod })", () => {
    it("returns the pod's rows by named question, and its lab changes, in `answers` and `changes`", () => {
      assert.ok(read.answers[LABS].length > 0);
      assert.ok(
        read.changes.some(
          ({ key }: { key: string }) => key === `start:${ATORVASTATIN}:${LDL}`,
        ),
      );
    });

    it("reads no reference table", () => {
      assert.equal((counting.tables as { calls: number }).calls, 0);
    });

    it("returns in `unheld` the versions of the tables the pod was written under that the app does not hold", async () => {
      assert.deepEqual(read.unheld, []);
      assert.deepEqual(
        (await reviewing().answers({ pod: "reviewed" })).unheld,
        ["urn:x:ingredient-map-2"],
      );
    });
  });

  describe("api.said({ pod, entry })", () => {
    it("returns what the reference tables say of the pod's codes, in `about`", async () => {
      assert.equal(
        maps(await overHttp.said({ pod: STATIN })).about.get(iris.ldl).name
          .label,
        "LDL cholesterol",
      );
    });

    it("returns one view entry as its screen reads it, with the panels its test is in, when `entry` names it", async () => {
      const row = (await labs()).find((each) => each.code === iris.ldl)!;
      const out = await overHttp.said({
        pod: STATIN,
        entry: entryId(row.entry),
      });
      assert.equal(out.entry.entry, row.entry);
      assert.deepEqual(out.panels, []);
    });
  });

  describe("api.trend({ pod, test, medication })", () => {
    it("returns the test and medication of the pod's strongest lab change when neither is named", async () => {
      const out = await overHttp.trend({ pod: STATIN });
      assert.equal(out.series.test.notation, LDL);
      assert.equal(out.medication, ATORVASTATIN);
    });

    it("returns a trend for every lab change `find_changes` gives", async () => {
      const { value } = await overHttp.tool({
        pod: STATIN,
        tool: "find_changes",
      });
      assert.ok(value.length > 0);
      for (const finding of value)
        await overHttp.trend({ pod: STATIN, ...trendOf(finding) });
    });
  });

  describe("api.classes({ pod })", () => {
    it("returns the pod's medications, and the drug classes other tables give them, in `elsewhere`", async () => {
      const out = await overHttp.classes({ pod: STATIN });
      assert.ok(
        out.medications.some(({ code }: Output) => code === iris.atorvastatin),
      );
      assert.ok(maps(out).elsewhere instanceof Map);
    });

    it("rejects with the host's own error, as `api.panel()` does, when the reference tables cannot be read", async () => {
      const quiet = mock.method(console, "error", () => undefined);
      try {
        const broken = brokenApi();
        await assert.rejects(
          broken.classes({ pod: STATIN }),
          /tables are broken/,
        );
        await assert.rejects(
          broken.panel({ pod: STATIN, panel: LDL }),
          /tables are broken/,
        );
      } finally {
        quiet.mock.restore();
      }
    });
  });

  describe("api.panel({ pod, panel })", () => {
    it("returns the panel's rows and the pod's lab results", async () => {
      const out = await overHttp.panel({ pod: STATIN, panel: "24331-1" });
      assert.deepEqual(out.rows, []);
      assert.ok(out.labs.some(({ code }: Output) => code === iris.ldl));
    });
  });
});

const checkedOnce = once(async () => {
  const given = host();
  const pods = given.pods as unknown as {
    open(...a: unknown[]): Promise<unknown>;
  };
  const opens: unknown[] = [];
  const counting = {
    ...pods,
    open: (...args: unknown[]) => {
      opens.push(args[0]);
      return pods.open(...args);
    },
  };
  const each = crossing(api({ ...given, pods: counting }));
  await each.unlock({ pod: SEALED, secret: SEALED_WORDS });
  await each.pod({ pod: STATIN });
  const { checked } = await each.checkTables({});
  await each.pod({ pod: STATIN });
  return {
    checked,
    opened: opens.filter((name) => name === STATIN),
    sealed: await each.pod({ pod: SEALED }),
  };
});

/**
 * The reference tables screen lists the series the app holds, and a check reads the feeds for newer versions.
 * After a check that kept a version, PodApi opens each pod again so its rows are read under the new tables, without
 * asking for an encrypted pod's six words a second time.
 */
describe("Reading the reference tables for their screens · api.held(), api.table(), api.checkTables()", () => {
  describe("api.held()", () => {
    it("returns the series the reference tables hold", async () => {
      assert.deepEqual(
        (await overHttp.held({})).held.map(({ source }: Output) => source),
        ["urn:uuid:loinc"],
      );
    });

    it("returns none, with `failed: true`, when the reference tables cannot be read", async () => {
      const quiet = mock.method(console, "error", () => undefined);
      try {
        const broken = brokenApi();
        for (const each of [broken, crossing(broken)])
          assert.deepEqual(await each.held({}), { held: [], failed: true });
      } finally {
        quiet.mock.restore();
      }
    });
  });

  describe("api.table({ id, code })", () => {
    it("returns the first publisher's series when no `id` is given", async () => {
      assert.equal((await overHttp.table({})).source.iri, "urn:uuid:loinc");
    });

    it("returns what the reference tables say of one code, in `facts`, when `code` is given", async () => {
      assert.equal(
        (await overHttp.table({ id: "loinc", code: LDL })).facts.notation,
        LDL,
      );
    });
  });

  describe("api.checkTables()", () => {
    it("returns what the host's check did, in `checked`", async () => {
      assert.deepEqual((await checkedOnce()).checked, await FAKE.check());
    });

    it("opens a pod that is not encrypted again at its next read, when the check kept a version", async () => {
      assert.deepEqual((await checkedOnce()).opened, [STATIN, STATIN]);
    });

    it("keeps an unlocked encrypted pod open", async () => {
      assert.equal((await checkedOnce()).sealed.locked, undefined);
    });
  });
});

/**
 * `api.ask()` returns a named question's rows a slice at a time, or the pod's compact read a page at a time, and
 * `api.tool()` runs one of cascade-runtime's lab-change tools, or the app's own `worth_a_look`, on a pod. The tools
 * a model uses from the chat, a web page or an MCP client are built on these two.
 */
describe("Asking a pod a named question, and running a tool on it · api.ask(), api.tool()", () => {
  describe("api.ask({ pod, question, limit, offset })", () => {
    it("returns `limit` rows, and in `total` how many the question has", async () => {
      const out = await overHttp.ask({ pod: STATIN, question: LABS, limit: 2 });
      assert.equal(out.total, (await labs()).length);
      assert.equal(out.rows.length, 2);
    });

    it("returns the rows from `offset` on", async () => {
      const later = await overHttp.ask({
        pod: STATIN,
        question: LABS,
        limit: 2,
        offset: 1,
      });
      assert.deepEqual(later.rows, (await labs()).slice(1, 3));
    });

    it("returns `offset` only when it is not 0", async () => {
      const later = await overHttp.ask({
        pod: STATIN,
        question: LABS,
        limit: 2,
        offset: 1,
      });
      assert.equal(later.offset, 1);
      for (const given of [{}, { offset: 0 }]) {
        const first = await overHttp.ask({
          pod: STATIN,
          question: LABS,
          limit: 2,
          ...given,
        });
        assert.equal(first.offset, undefined, JSON.stringify(given));
      }
    });
  });

  describe('api.ask({ pod, format: "compact" })', () => {
    it("returns a small pod's compact read whole, with no `next`", async () => {
      const small = await overHttp.ask({ pod: STATIN, format: "compact" });
      assert.equal(small.format, "compact");
      assert.equal(small.next, undefined);
      assert.ok(small.views.some(({ total }: Output) => total > 0));
    });

    it("refuses on a host that gives no `compact`", async () => {
      const without = crossing(api({ ...host(), compact: undefined }));
      await assert.rejects(
        without.ask({ pod: STATIN, format: "compact" }),
        /does not offer the compact read/,
      );
    });
  });

  describe('api.tool({ pod, tool: "find_changes" })', () => {
    it("returns the pod's lab changes in `value`, each with its medication's view entry", async () => {
      const { value } = await overHttp.tool({
        pod: STATIN,
        tool: "find_changes",
      });
      assert.ok(
        value.some(({ key }: Output) => key === `start:${ATORVASTATIN}:${LDL}`),
      );
      assert.ok(
        value.every(
          ({ medication }: Output) => typeof medication.entry === "string",
        ),
      );
    });
  });

  describe('api.tool({ pod, tool: "worth_a_look" })', () => {
    const lines = once(async () =>
      reviewing().tool({ pod: "reviewed", tool: "worth_a_look" }),
    );

    it("returns each Worth a look line's sentence and tag", async () => {
      const { value } = await lines();
      assert.equal(value.length, 1);
      assert.match(value[0].sentence, /Latex/);
      assert.equal(value[0].tag, "Needs review");
    });

    it("names each line's view entry by its short id, as `entryId()` gives it", async () => {
      assert.equal((await lines()).value[0].entry, entryId("urn:uuid:0e1f"));
    });

    it("returns none for a pod with nothing worth a look", async () => {
      assert.deepEqual(
        (await overHttp.tool({ pod: STATIN, tool: "worth_a_look" })).value,
        [],
      );
    });
  });
});

const madeOnce = once(async () => {
  const { over } = await fresh((at) => ({
    samples: ["sample"],
    copySample: (name: string) => openPod(join(at, name)),
  }));
  const person = { person: "Rowan Ellery Marsh" };
  return {
    first: await over.makePod(person),
    again: await over.makePod(person),
    sample: await over.makePod({ person: "Sample" }),
    sampleAgain: await over.makePod({ person: "Sample" }),
    pods: (await over.pods({})).pods.map(({ name }: Output) => name),
  };
});

/** An encrypted pod made through the wait, read after the host was closed and opened again. */
const inesOnce = once(async () => {
  const { built, host: given, over } = await fresh();
  const confirm = async (pod: string) => {
    const { words } = await over.waitingWords({ pod });
    const [, word2, , , word5] = words.split(" ");
    const typed = { pod, word2, word5, password: words, username: pod };
    return { words, made: over.confirmWords(typed) };
  };
  const waiting = await over.makePod({ person: "Ines", encrypt: true });
  const listed = (await over.pods({})).pods.map(({ name }: Output) => name);
  const asked = await over.waitingWords({ pod: "ines" });
  const { words, made } = await confirm("ines");
  const confirmed = await made;
  const encrypted = (await over.pod({ pod: "ines" })).encrypted;
  const afterwards = await caught(over.waitingWords({ pod: "ines" }));
  await built.close();
  const later = crossing(api(given));
  const locked = await caught(later.answers({ pod: "ines" }));
  const unlocked = await later.unlock({ pod: "ines", secret: words });
  const opened = (await later.answers({ pod: "ines" })).answers;
  const again = await later.unlock({ pod: "ines", secret: words });
  const againEmpty = await later
    .unlock({ pod: "ines", secret: "" })
    .catch((error: unknown) => error);
  const againWrong = await later
    .unlock({ pod: "ines", secret: "not the words" })
    .catch((error: unknown) => error);
  return {
    againEmpty,
    againWrong,
    waiting,
    listed,
    asked,
    confirmed,
    encrypted,
    afterwards,
    locked,
    unlocked,
    opened,
    again,
  };
});

/** Three pods, one of them waiting and one connected, deleted, then the host's own restored. */
const clearedOnce = once(async () => {
  const { over } = await fresh((at) => ({
    restore: async () => {
      await (await openPod(join(at, "restored"))).close();
      return ["restored"];
    },
  }));
  for (const person of ["One", "Two"]) await over.makePod({ person });
  await over.makePod({ person: "Three", encrypt: true });
  const { connection } = await connected(over, "one");
  const one = { pod: "one", connection };
  const deleted = await over.deleteAll({});
  const left = (await over.pods({})).pods;
  const waiting = await caught(over.waitingWords({ pod: "three" }));
  await over.makePod({ person: "One" });
  const brought = await caught(over.bring(one));
  await over.deleteAll({});
  const restored = await over.resetAll({});
  return {
    deleted,
    left,
    waiting,
    brought,
    restored,
    pods: (await over.pods({})).pods,
  };
});

const removedOnce = once(async () => {
  const at = await mkdtemp(join(tmpdir(), "pod-api-remove-"));
  folders.push(at);
  for (const name of ["a", "b"]) await (await openPod(join(at, name))).close();
  await mkdir(join(at, ".answers", "no-pod"), { recursive: true });
  await mkdir(join(at, ".tables"), { recursive: true });
  await writeFile(join(at, ".tables", "marker"), "");
  await nodeHost({ folder: at }).pods.remove(["a", "b"], { all: true });
  return {
    left: await readdir(at),
    marker: existsSync(join(at, ".tables", "marker")),
  };
});

/**
 * A pod is made under a name made from a person's name. An encrypted pod is made only once the person has typed
 * back words 2 and 5 of its six words, which shows they kept them; until then the pod is waiting, and nothing is
 * written.
 */
describe("Making, unlocking and deleting pods · api.makePod(), api.waitingWords(), api.confirmWords(), api.unlock(), api.deleteAll(), api.resetAll(), nodeHost()", () => {
  describe("api.makePod({ person })", () => {
    it("makes a pod named from the person's name, and returns `made: true`", async () => {
      const { first, pods } = await madeOnce();
      assert.deepEqual(first, { pod: "rowan-ellery-marsh", made: true });
      assert.ok(pods.includes("rowan-ellery-marsh"));
    });

    it("returns `made: false`, and makes nothing, for a pod there already is", async () => {
      assert.deepEqual((await madeOnce()).again, {
        pod: "rowan-ellery-marsh",
        made: false,
      });
    });

    it("loads the host's sample of that name in place of an empty pod, and returns `loaded: true`", async () => {
      const { sample, sampleAgain, pods } = await madeOnce();
      assert.deepEqual(sample, { pod: "sample", loaded: true });
      assert.deepEqual(sampleAgain, { pod: "sample", made: false });
      assert.deepEqual(pods, ["rowan-ellery-marsh", "sample"]);
    });

    it("refuses `encrypt: true` for a sample's name with a sentence that says samples are not encrypted, and loads nothing", async () => {
      const { over } = await fresh((at) => ({
        samples: ["sample"],
        copySample: (name: string) => openPod(join(at, name)),
      }));
      await assert.rejects(
        over.makePod({ person: "Sample", encrypt: true }),
        (error: Error) =>
          error.name === "Refusal" &&
          /sample/i.test(error.message) &&
          /encrypt/i.test(error.message),
      );
      assert.deepEqual(
        (await over.pods({})).pods.map(({ name }: Output) => name),
        [],
      );
    });

    it("refuses `encrypt: true` for a sample that is already loaded, and leaves the pod as it was", async () => {
      const { over } = await fresh((at) => ({
        samples: ["sample"],
        copySample: (name: string) => openPod(join(at, name)),
      }));
      await over.makePod({ person: "Sample" });
      await assert.rejects(
        over.makePod({ person: "Sample", encrypt: true }),
        (error: Error) =>
          error.name === "Refusal" &&
          /sample/i.test(error.message) &&
          /encrypt/i.test(error.message),
      );
      assert.equal((await over.pod({ pod: "sample" })).encrypted, false);
    });

    it("refuses `encrypt: true` for a pod that exists unencrypted, with a sentence that says so", async () => {
      const { over } = await fresh();
      await over.makePod({ person: "Plain" });
      await assert.rejects(
        over.makePod({ person: "Plain", encrypt: true }),
        (error: Error) =>
          error.name === "Refusal" &&
          /exists already/.test(error.message) &&
          /not encrypted/.test(error.message),
      );
    });

    it("copies a sample once when two calls ask for it at the same moment", async () => {
      let copies = 0;
      const { built } = await fresh((at) => ({
        samples: ["sample"],
        copySample: async (name: string) => {
          copies += 1;
          return openPod(join(at, name));
        },
      }));
      await Promise.all([
        built.makePod({ person: "Sample" }),
        built.makePod({ person: "Sample" }),
      ]);
      assert.equal(copies, 1);
    });
  });

  describe("api.makePod({ person, encrypt: true })", () => {
    it("returns `waiting: true`, and makes no pod yet", async () => {
      const { waiting, listed } = await inesOnce();
      assert.deepEqual(waiting, { pod: "ines", waiting: true });
      assert.equal(listed.includes("ines"), false);
    });
  });

  describe("api.waitingWords({ pod })", () => {
    it("returns the six words of a pod that is waiting, with the person's name as typed", async () => {
      const { asked } = await inesOnce();
      assert.equal(asked.person, "Ines");
      assert.equal(asked.words.split(" ").length, 6);
    });

    it("refuses once the pod is made", async () => {
      assert.match((await inesOnce()).afterwards.message, /not waiting/);
    });
  });

  describe("api.confirmWords({ pod, word2, word5, password, username })", () => {
    it("makes the encrypted pod when words 2 and 5 are typed back", async () => {
      const { confirmed, encrypted } = await inesOnce();
      assert.deepEqual(confirmed, { pod: "ines", made: true });
      assert.equal(encrypted, true);
    });

    it("refuses when a pod of that name was made in the meantime, and stops waiting", async () => {
      const { over } = await fresh();
      await over.makePod({ person: "Taken", encrypt: true });
      const { words } = await over.waitingWords({ pod: "taken" });
      const [, word2, , , word5] = words.split(" ");
      await over.makePod({ person: "Taken" });
      await assert.rejects(
        over.confirmWords({
          pod: "taken",
          word2,
          word5,
          password: words,
          username: "taken",
        }),
        /exists already/,
      );
      await assert.rejects(over.waitingWords({ pod: "taken" }), /not waiting/);
    });
  });

  describe("api.unlock({ pod, secret })", () => {
    it("opens an encrypted pod with its six words, and returns `opened: true`", async () => {
      const { locked, unlocked, opened } = await inesOnce();
      assert.equal(locked.outcome, "secret needed");
      assert.deepEqual(unlocked, { pod: "ines", opened: true });
      assert.ok(opened);
    });

    it("returns `opened: true` for an encrypted pod that is already open, given its own six words", async () => {
      assert.deepEqual((await inesOnce()).again, { pod: "ines", opened: true });
    });

    it("throws `Unopened` with `incorrect secret` for an encrypted pod that is already open, given other words", async () => {
      const { againWrong } = await inesOnce();
      assert.ok(unopened(againWrong, "incorrect secret"), String(againWrong));
    });

    it("throws `Unopened` with `incorrect secret` for an encrypted pod that is already open, given no words", async () => {
      const { againEmpty } = await inesOnce();
      assert.ok(unopened(againEmpty, "incorrect secret"), String(againEmpty));
    });

    it("answers each of two calls at the same moment by its own secret: the right words open the pod, other words throw `Unopened`", async () => {
      const holding = opening(host(), true);
      const each = crossing(api(holding.host));
      const calls = Promise.allSettled([
        each.unlock({ pod: SEALED, secret: SEALED_WORDS }),
        each.unlock({ pod: SEALED, secret: "not the words at all" }),
      ]);
      await holding.started(2);
      holding.release();
      const [right, wrong] = await calls;
      assert.deepEqual(
        right.status === "fulfilled" && right.value,
        { pod: SEALED, opened: true },
        String(right.status === "rejected" && right.reason),
      );
      assert.ok(
        wrong.status === "rejected" &&
          unopened(wrong.reason, "incorrect secret"),
        wrong.status === "fulfilled" ? "opened with the wrong words" : "",
      );
      assert.equal((await each.pod({ pod: SEALED })).locked, undefined);
    });

    it("keeps one opening and closes the other of two calls at the same moment with the right words", async () => {
      const holding = opening(host(), true);
      const each = crossing(api(holding.host));
      const calls = Promise.all([
        each.unlock({ pod: SEALED, secret: SEALED_WORDS }),
        each.unlock({ pod: SEALED, secret: SEALED_WORDS }),
      ]);
      await holding.started(2);
      holding.release();
      assert.deepEqual(await calls, [
        { pod: SEALED, opened: true },
        { pod: SEALED, opened: true },
      ]);
      const { opens, closes } = holding.seen;
      assert.equal(opens - closes, 1, `${opens} openings, ${closes} closed`);
    });

    it("opens no pod to check the words of an encrypted pod that is already open", async () => {
      const counting = opening(host());
      const each = crossing(api(counting.host));
      await each.unlock({ pod: SEALED, secret: SEALED_WORDS });
      const calls = counting.seen.calls;
      assert.deepEqual(
        await each.unlock({ pod: SEALED, secret: SEALED_WORDS }),
        { pod: SEALED, opened: true },
      );
      await assert.rejects(
        each.unlock({ pod: SEALED, secret: "not the words at all" }),
        (error) => unopened(error, "incorrect secret"),
      );
      assert.equal(counting.seen.calls, calls);
    });

    it("returns `opened: true` for a pod that is open and not encrypted, whatever `secret` holds", async () => {
      assert.deepEqual(
        await overHttp.unlock({ pod: STATIN, secret: "any words" }),
        { pod: STATIN, opened: true },
      );
    });

    it("throws `Unopened` with `incorrect secret` when `secret` holds no word", async () => {
      await assert.rejects(
        overHttp.unlock({ pod: SEALED, secret: "  " }),
        (error) => unopened(error, "incorrect secret"),
      );
    });
  });

  describe("given an encrypted pod that is not open", () => {
    it('returns `locked: "secret needed"` from `api.pod()`', async () => {
      assert.equal(
        (await overHttp.pod({ pod: SEALED })).locked,
        "secret needed",
      );
    });

    it("throws `Unopened` with `secret needed` from `api.answers()`", async () => {
      await assert.rejects(overHttp.answers({ pod: SEALED }), (error) =>
        unopened(error, "secret needed"),
      );
    });

    it("refuses with a sentence that says where to open it, on a host that opens no encrypted pod", async () => {
      const elsewhere = crossing(api({ ...host(), opensEncrypted: false }));
      assert.equal(
        (await elsewhere.pod({ pod: SEALED })).locked,
        "secret needed",
      );
      await assert.rejects(
        elsewhere.answers({ pod: SEALED }),
        (error) =>
          isRefusal(error) &&
          error.outcome === undefined &&
          error.message === notOpenedHere(SEALED),
      );
    });
  });

  describe("api.deleteAll()", () => {
    it("removes every pod, and returns their names in `deleted`", async () => {
      const { deleted, left } = await clearedOnce();
      assert.deepEqual(deleted, { deleted: ["one", "two"] });
      assert.deepEqual(left, []);
    });

    it("forgets the six words of a pod that was waiting", async () => {
      assert.match((await clearedOnce()).waiting.message, /not waiting/);
    });

    it("forgets every connection", async () => {
      assert.match((await clearedOnce()).brought.message, /no connection/);
    });
  });

  describe("api.resetAll()", () => {
    it("deletes every pod, then returns the pods the host puts back", async () => {
      const { restored, pods } = await clearedOnce();
      assert.deepEqual(restored, { pods: ["restored"] });
      assert.deepEqual(pods, [{ name: "restored", title: "restored" }]);
    });
  });

  describe("when the pods of `nodeHost({ folder })` are removed with `{ all: true }`", () => {
    it("removes the pods' folders and every kept answer", async () => {
      assert.deepEqual((await removedOnce()).left, [".tables"]);
    });

    it("keeps the folder of the reference tables", async () => {
      assert.equal((await removedOnce()).marker, true);
    });
  });
});

const state = ({ step, requests, bringing }: Output) =>
  JSON.stringify([step, requests, bringing]);
const keys = (value: unknown): string[] =>
  value !== null && typeof value === "object"
    ? Object.entries(value).flatMap(([key, each]) => [key, ...keys(each)])
    : [];

/** A connection of Ada's pod, pulled and then brought in, as a page watches it. */
const pulledOnce = once(async () => {
  const authorized: URL[] = [];
  const at = await mkdtemp(join(tmpdir(), "pod-api-connect-"));
  folders.push(at);
  const built = api({ ...host(at), hospitals: northHospitals(authorized) });
  const over = crossing(built);
  await built.makePod({ person: "Ada" });
  const { connection: n, authorize } = await built.connect({
    pod: "ada",
    fhirBase: FHIR_BASE(),
  });
  const connection = { pod: "ada", connection: n };
  let shown = await built.connection(connection);
  const states = [state(shown)];
  const held = [0];
  while (!shown.settled) {
    const asked = performance.now();
    shown = await built.connection({ ...connection, wait: "change" });
    held.push(performance.now() - asked);
    states.push(state(shown));
  }
  const bringing = await built.bring(connection);
  const brought = await built.connection({ ...connection, wait: true });
  const answers = await built.answers({ pod: "ada" });
  const again = await over.bring(connection);
  const after = await over.connection(connection);
  return {
    n,
    authorize,
    authorized: authorized[0]!,
    states,
    held,
    shown,
    bringing,
    brought,
    answers,
    again,
    after,
  };
});

const CONNECT_ROWS = `PREFIX cascade: <https://ns.cascadeprotocol.org/cascade#>
SELECT ?act (COUNT(DISTINCT ?version) AS ?versions) (SAMPLE(?client) AS ?client) WHERE {
  { SELECT (COUNT(*) AS ?act) WHERE { ?a a cascade:ConnectToServer } }
  ?version cascade:connectClientId ?client .
} GROUP BY ?act`;

/** North, with the answer to `/metadata` changed to `answer`, and Ada's pod connected twice. */
async function signedInUnder(answer: (() => Response) | undefined, times = 1) {
  const at = await mkdtemp(join(tmpdir(), "pod-api-recorded-"));
  folders.push(at);
  const files = async () =>
    (await readdir(join(at, "ada"), { recursive: true })).sort();
  const north_ = northHospitals();
  const atFirstRecord: string[][] = [];
  const watching = {
    ...north_,
    fetch: (async (input, init) => {
      const request = new Request(input, init);
      const { pathname } = new URL(request.url);
      if (pathname.includes("/Patient")) atFirstRecord.push(await files());
      return answer !== undefined && pathname.endsWith("/metadata")
        ? answer()
        : north_.fetch(request);
    }) as typeof globalThis.fetch,
  };
  const local = api({ ...host(at), hospitals: watching });
  await local.makePod({ person: "Ada" });
  const listings: string[][] = [];
  const settled: Output[] = [];
  for (let signIn = 0; signIn < times; signIn += 1) {
    settled.push((await connected(local, "ada")).shown);
    listings.push(await files());
  }
  await local.close();
  const pod = await openPod(join(at, "ada"));
  const rows = await pod.ask({ query: CONNECT_ROWS });
  await pod.close();
  return { atFirstRecord, listings, settled, rows };
}
const recordedOnce = once(() => signedInUnder(undefined, 2));
const silentOnce = once(() =>
  signedInUnder(() => new Response("{}", { status: 404 })),
);
const oddOnce = once(() =>
  signedInUnder(() => Response.json({ resourceType: "Basic" })),
);

/** A sign-in that waits for the person, so a connection stays `signing in`, and what stops it. */
const parkedOnce = once(async () => {
  const signals: AbortSignal[] = [];
  const parked = {
    ...northHospitals(),
    signIn:
      (_: unknown, __: unknown, report: (href: string) => void) =>
      (authorize: URL, signal: AbortSignal) =>
        new Promise<URL>((_, reject) => {
          signals.push(signal);
          report(authorize.href);
          signal.addEventListener(
            "abort",
            () => reject(new ConnectionFailure("cancelled", "stopped")),
            { once: true },
          );
        }),
  };
  const { built } = await fresh(() => ({ hospitals: parked }));
  const start = async () => {
    await built.makePod({ person: "Ada" });
    return (await built.connect({ pod: "ada", fhirBase: FHIR_BASE() }))
      .connection;
  };
  const first = await start();
  mock.timers.enable({ apis: ["setTimeout"] });
  let held: Output | undefined;
  void built
    .connection({ pod: "ada", connection: first, wait: true })
    .then((shown) => (held = shown));
  while (held === undefined) {
    mock.timers.tick(WAIT_MS);
    await new Promise((done) => setImmediate(done));
  }
  mock.timers.reset();
  await built.deleteAll({});
  const deleted = signals[0]!.aborted;
  await start();
  await built.close();
  return { held, deleted, closed: signals[1]!.aborted };
});

/** A bring-in whose import throws an error of the app's own, and what was logged. */
const failedOnce = once(async () => {
  const logged = mock.method(console, "error", () => undefined);
  try {
    const breaking = (pod: object) =>
      new Proxy(pod, {
        get(target, key) {
          if (key === "import")
            return async () => {
              throw new Error("the pod at C:\\secret\\ada is closed");
            };
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    const { built } = await fresh((at) => ({
      pods: new Proxy(
        host(at).pods as unknown as { open(...a: unknown[]): Promise<object> },
        {
          get: (target, key) =>
            key === "open"
              ? async (...args: unknown[]) =>
                  breaking(await target.open(...args))
              : Reflect.get(target, key, target),
        },
      ),
    }));
    await built.makePod({ person: "Ada" });
    const at = { pod: "ada", connection: 0 };
    at.connection = (await connected(built, "ada")).connection;
    await built.bring(at);
    const failed = await built.connection({ ...at, wait: true });
    return { failed, logged: logged.mock.callCount() };
  } finally {
    logged.mock.restore();
  }
});

/** A bring-in over a pod whose `import` records the parts `onProgress` is told, as each begins. */
const partsOnce = once(async () => {
  const parts: string[] = [];
  const recording = (pod: object) =>
    new Proxy(pod, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (key !== "import") {
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (
          files: unknown,
          options: { onProgress?: (told: { part: string }) => unknown },
        ) =>
          (value as (...a: unknown[]) => unknown).call(target, files, {
            ...options,
            onProgress: (told: { part: string }) => {
              parts.push(told.part);
              return options.onProgress?.(told);
            },
          });
      },
    });
  const { built } = await fresh((at) => ({
    pods: new Proxy(
      host(at).pods as unknown as { open(...a: unknown[]): Promise<object> },
      {
        get: (target, key) =>
          key === "open"
            ? async (...args: unknown[]) =>
                recording(await target.open(...args))
            : Reflect.get(target, key, target),
      },
    ),
  }));
  await built.makePod({ person: "Ada" });
  const at = { pod: "ada", connection: 0 };
  at.connection = (await connected(built, "ada")).connection;
  await built.bring(at);
  await built.connection({ ...at, wait: true });
  return { parts };
});

/**
 * A connection is one sign-in at one hospital and the pull that follows: `api.connection()` says how far it has
 * got and can wait for it to change, and `api.bring()` imports what was pulled into the pod. What goes wrong at the
 * hospital is said on the connection, and an error of the app's own is logged and said in one fixed sentence.
 *
 * @rule runtime/arrivals.feature A16
 */
describe("Connecting a pod to a hospital and bringing its records in · api.hospitals(), api.connect(), api.connection(), api.bring()", () => {
  describe("api.hospitals({ q })", () => {
    it("returns the hospitals of the host's directory whose name matches `q`", async () => {
      const { rows } = await overHttp.hospitals({ q: "north" });
      assert.deepEqual(
        rows.map(({ name }: Output) => name),
        [rowOf(north).name],
      );
    });
  });

  describe("api.connect({ pod, fhirBase })", () => {
    it("returns the connection's number, and in `authorize` where the person signs in", async () => {
      const { n, authorize, authorized } = await pulledOnce();
      assert.ok(Number.isInteger(n) && n > 0);
      assert.equal(authorize, authorized.href);
    });

    it("asks the hospital for the scopes `launch/patient`, `patient/*.read` and `patient/*.rs`", async () => {
      assert.deepEqual(
        (await pulledOnce()).authorized.searchParams.get("scope")!.split(" "),
        ["launch/patient", "patient/*.read", "patient/*.rs"],
      );
    });

    it("writes the hospital server's record to the pod before the first request for the patient", async () => {
      const { atFirstRecord, listings } = await recordedOnce();
      assert.ok(atFirstRecord.length > 0);
      assert.ok(listings[0]!.length > 0);
      assert.deepEqual(atFirstRecord[0], listings[0]);
    });

    it("writes into that record the client id the host registered", async () => {
      const [row] = (await recordedOnce()).rows;
      assert.deepEqual(
        [row?.act, row?.versions, row?.client],
        ["1", "1", "cascade-app"],
      );
    });

    it("writes no file at a second sign-in when the server says the same of itself", async () => {
      const { listings, settled } = await recordedOnce();
      assert.deepEqual(listings[1], listings[0]);
      for (const each of settled) {
        assert.equal(each.step, "pulled");
        assert.equal(each.notRecorded, undefined);
      }
    });

    it("says in `notRecorded` that a server answered 404 to `metadata`, and pulls all the same", async () => {
      const [settled] = (await silentOnce()).settled;
      assert.equal(settled!.step, "pulled");
      assert.match(settled!.notRecorded, /answered 404 to metadata/);
    });

    it("says in `notRecorded` that a server's report was refused as no CapabilityStatement, and pulls all the same", async () => {
      const [settled] = (await oddOnce()).settled;
      assert.equal(settled!.step, "pulled");
      assert.match(settled!.notRecorded, /^Refused: .*CapabilityStatement/);
    });

    it("writes no server record to the pod for a report that was refused", async () => {
      assert.deepEqual((await oddOnce()).rows, []);
    });
  });

  describe("api.connection({ pod, connection, wait })", () => {
    it('returns with `wait: "change"` only when the step, the count of requests or the bring-in\'s part has changed', async () => {
      const { states, held } = await pulledOnce();
      assert.ok(states.length > 1);
      // A call the change did not end returns after `wait` 25 seconds, as it is: a loaded machine can stall that long.
      states.forEach((each, at) => {
        if (at > 0 && each === states[at - 1])
          assert.ok(held[at]! >= WAIT_MS, `${each} again after ${held[at]} ms`);
      });
    });

    it("returns the count of requests, the patient's name and the sources of the pull once it has pulled", async () => {
      const { shown } = await pulledOnce();
      assert.equal(shown.step, "pulled");
      assert.ok(shown.requests > 0);
      assert.ok(
        shown.sources.some(({ server }: Output) =>
          FHIR_BASE().startsWith(server),
        ),
        JSON.stringify(shown.sources),
      );
      assert.equal(shown.patient, "Ines Calloway");
    });

    it("returns nothing of the pulled bundle itself", async () => {
      assert.ok(
        !keys((await pulledOnce()).shown).includes("bundle"),
        "the connection carries its bundle",
      );
    });

    it('returns `step: "failed"` and `failure: "cancelled"` when the person cancels the sign-in', async () => {
      const { shown } = await connected(overHttp, EMPTY);
      assert.equal(shown.step, "failed");
      assert.equal(shown.failure, "cancelled");
    });

    it("returns the connection as it is, still `signing in`, after 25 seconds of `wait: true`", async () => {
      assert.equal((await parkedOnce()).held.step, "signing in");
    });
  });

  describe("api.bring({ pod, connection })", () => {
    it('returns `step: "bringing in"`, and imports the pull into the pod', async () => {
      const { bringing, brought, answers } = await pulledOnce();
      assert.deepEqual(bringing, { step: "bringing in" });
      assert.equal(brought.broughtIn, true);
      assert.ok(
        answers.changes.some(
          ({ key }: Output) => key === `start:${ATORVASTATIN}:${LDL}`,
        ),
      );
    });

    it("reports loading the adapter, converting, saving and judging, in that order, through `onProgress`", async () => {
      const { parts } = await partsOnce();
      const each = parts.filter((part, at) => part !== parts[at - 1]);
      assert.deepEqual(each, [
        "loading the adapter",
        "converting",
        "saving",
        "judging",
      ]);
    });

    it('imports a pull once: a second call returns `step: "pulled"`, and the connection has `broughtIn: true`', async () => {
      const { again, after } = await pulledOnce();
      assert.deepEqual(again, { step: "pulled" });
      assert.equal(after.step, "pulled");
      assert.equal(after.broughtIn, true);
      assert.equal(after.failed, undefined);
      assert.ok(after.sources.length > 0);
    });

    it("says `Not brought in: …` in `failed`, with `retry: true`, when the import throws an error of the app's own", async () => {
      const { failed } = await failedOnce();
      assert.equal(failed.step, "pulled");
      assert.equal(failed.retry, true);
      assert.match(failed.failed, /^Not brought in: /);
    });

    it("keeps that error's text out of `failed`, and logs it once", async () => {
      const { failed, logged } = await failedOnce();
      assert.ok(!failed.failed.includes("secret"), failed.failed);
      assert.equal(logged, 1);
    });
  });

  describe("when the pods are deleted or PodApi is closed with a sign-in under way", () => {
    it("stops the sign-in on `api.deleteAll()`", async () => {
      assert.equal((await parkedOnce()).deleted, true);
    });

    it("stops the sign-in on `api.close()`", async () => {
      assert.equal((await parkedOnce()).closed, true);
    });
  });
});

/**
 * The world's date is a day the app can set so that the demo hospitals answer as they would have then, which lets
 * a person watch a sandbox story's later records arrive. It is kept as an instant, travels with each connection
 * started under it, and is said in words on the screens.
 */
describe("Setting the day the demo hospitals answer as of · api.setWorldDate(), worldInstant(), utcInstant(), worldDateSaid(), pulledAsOfSaid(), GET /world-date", () => {
  const dated = once(async () => {
    let asOf: string | undefined;
    const world = {
      get: () => asOf,
      set: (to: string | undefined) => {
        asOf = to;
      },
    };
    const { over } = await fresh(() => ({ world }));
    const set = await over.setWorldDate({ date: "2024-02-01" });
    const held = asOf;
    await over.makePod({ person: "Ada" });
    const { shown } = await connected(over, "ada");
    const cleared = await over.setWorldDate({ date: "" });
    return { set, held, shown, cleared, clearedTo: asOf };
  });

  describe("api.setWorldDate({ date })", () => {
    it("sets the host's world date to the last second of the day given, and returns it in `asOf`", async () => {
      const { set, held } = await dated();
      assert.deepEqual(set, { asOf: "2024-02-01T23:59:59Z" });
      assert.equal(held, "2024-02-01T23:59:59Z");
    });

    it("clears it when `date` is empty", async () => {
      const { cleared, clearedTo } = await dated();
      assert.deepEqual(cleared, {});
      assert.equal(clearedTo, undefined);
    });
  });

  describe("given a world's date set before a sign-in at a demo hospital starts", () => {
    it("returns that date on the connection, in `asOf`", async () => {
      assert.equal((await dated()).shown.asOf, "2024-02-01T23:59:59Z");
    });
  });

  describe("when a page asks `GET /world-date?back=<path>`", () => {
    const app = () =>
      appServer({
        api: inProcess,
        own: () => ({ hosts: new Set(["localhost"]), origins: new Set() }),
        chat: new Hono(),
        back: () => undefined,
        pages: tmpdir(),
      });
    for (const [back, to, title] of [
      [
        "/pods/a/",
        "/pods/a/#world-date",
        "redirects to `/pods/a/#world-date` for `/pods/a/`",
      ],
      [
        "/pods/a/hospitals?q=north",
        "/pods/a/hospitals?q=north#world-date",
        "redirects to `/pods/a/hospitals?q=north#world-date` for `/pods/a/hospitals?q=north`",
      ],
      [undefined, "/", "redirects home when no `back` is given"],
      ["//evil.test/", "/", "redirects home for `//evil.test/`"],
      ["https://evil.test/", "/", "redirects home for `https://evil.test/`"],
      ["/\\evil.test/", "/", "redirects home for `/\\evil.test/`"],
      ["/..//evil.test/", "/", "redirects home for `/..//evil.test/`"],
      ["/.//evil.test/", "/", "redirects home for `/.//evil.test/`"],
      ["/%2e%2e//evil.test/", "/", "redirects home for `/%2e%2e//evil.test/`"],
      ["/a/..//evil.test", "/", "redirects home for `/a/..//evil.test`"],
      ["pods/a/", "/", "redirects home for `pods/a/`"],
    ] as const)
      it(title, async () => {
        const response = await app().request(
          `http://localhost/world-date${back === undefined ? "" : `?back=${encodeURIComponent(back)}`}`,
          { redirect: "manual" },
        );
        assert.ok(response.status >= 300 && response.status < 400);
        assert.equal(response.headers.get("location"), to);
      });
  });
});

/** What each call is, the way it is given, and what it is refused for: one row for each sentence a person can be given. */
const REFUSED: [keyof Api, string, () => Input, RegExp][] = [
  [
    "connect",
    "refuses a hospital that is not in the directory",
    () => ({ pod: STATIN, fhirBase: "https://nowhere.invalid/fhir" }),
    /not in the directory/,
  ],
  [
    "connection",
    "refuses a number that is no connection of the pod",
    () => ({ pod: STATIN, connection: 999 }),
    /no connection 999/,
  ],
  [
    "connection",
    'refuses a `wait` that is neither true nor "change"',
    () => ({ pod: STATIN, connection: 1, wait: "soon" }),
    /wait must be true or "change"/,
  ],
  [
    "bring",
    "refuses a connection that pulled nothing",
    () => ({ pod: EMPTY, connection: cancelled }),
    /nothing pulled to bring in/,
  ],
  [
    "makePod",
    "refuses a name with no letter from a to z and no digit",
    () => ({ person: "!!!" }),
    /at least one letter/,
  ],
  [
    "makePod",
    "refuses `Con`, a name Windows keeps for a device",
    () => ({ person: "Con" }),
    /Windows keeps for itself/,
  ],
  [
    "makePod",
    "refuses `COM1`, a name Windows keeps for a device",
    () => ({ person: "COM1" }),
    /Windows keeps for itself/,
  ],
  [
    "makePod",
    "refuses `lpt9`, a name Windows keeps for a device",
    () => ({ person: "lpt9" }),
    /Windows keeps for itself/,
  ],
  [
    "makePod",
    "refuses an `encrypt` that is neither true nor false",
    () => ({ person: "Ada", encrypt: "on" }),
    /encrypt must be true/,
  ],
  [
    "waitingWords",
    "refuses a pod that is not waiting",
    () => ({ pod: "nobody" }),
    /not waiting any more/,
  ],
  [
    "confirmWords",
    "refuses a word 2 that is not the one given",
    () => ({ ...typed, word2: "x" }),
    /aren't words 2 and 5/,
  ],
  [
    "confirmWords",
    "refuses a `password` that is not the six words",
    () => ({ ...typed, password: "x" }),
    /Password field/,
  ],
  [
    "confirmWords",
    "refuses a `username` that is not the pod's name",
    () => ({ ...typed, username: "x" }),
    /Pod field/,
  ],
  [
    "setWorldDate",
    "refuses text that is no date, saying the two forms a date takes",
    () => ({ date: "soon" }),
    /"soon" is not a date: give a day as YYYY-MM-DD, or an instant with its timezone\./,
  ],
  [
    "answers",
    "refuses a pod there is not, naming the pods there are",
    () => ({ pod: "nobody" }),
    /no pod nobody; the pods are/,
  ],
  [
    "pod",
    "refuses a `pod` that is no string",
    () => ({ pod: 5 }),
    /pod must be a string/,
  ],
  [
    "said",
    "refuses an entry the pod does not hold",
    () => ({ pod: STATIN, entry: "0" }),
    /holds no entry 0/,
  ],
  [
    "trend",
    "refuses a test the pod has no results of, naming the tests it has",
    () => ({ pod: STATIN, test: "0000-0" }),
    /the tests it holds are .*18262-6/,
  ],
  [
    "trend",
    "refuses a medication the pod does not hold, naming those it holds",
    () => ({ pod: STATIN, test: LDL, medication: "0" }),
    /no medication 0 in the pod; the medications it holds are .*617310/,
  ],
  [
    "trend",
    "refuses a pod with no test results",
    () => ({ pod: EMPTY }),
    /holds no test results/,
  ],
  [
    "panel",
    "refuses a call that names no panel",
    () => ({ pod: STATIN }),
    /a panel is a LOINC code/,
  ],
  [
    "panel",
    "refuses an empty panel",
    () => ({ pod: STATIN, panel: "" }),
    /a panel is a LOINC code/,
  ],
  [
    "table",
    "refuses a reference table that is not held",
    () => ({ id: "nothing" }),
    /no reference table nothing/,
  ],
  [
    "table",
    "refuses a code the table does not hold",
    () => ({ id: "loinc", code: "0000-0" }),
    /holds no code 0000-0/,
  ],
  [
    "table",
    "refuses a `page` given as text",
    () => ({ page: "2" }),
    /page must be a whole number from 1/,
  ],
  [
    "table",
    "refuses a `page` that is a fraction",
    () => ({ page: 1.5 }),
    /page must be a whole number from 1/,
  ],
  [
    "ask",
    "refuses a question that is no named question",
    () => ({ pod: STATIN, question: "pod/No such question" }),
    /no question/,
  ],
  [
    "ask",
    "refuses a `limit` of 0",
    () => ({ pod: STATIN, question: LABS, limit: 0 }),
    /limit/,
  ],
  [
    "ask",
    "refuses an `offset` below 0",
    () => ({ pod: STATIN, question: LABS, offset: -1 }),
    /offset must be/,
  ],
  [
    "ask",
    "refuses a `format` other than `rows` or `compact`",
    () => ({ pod: STATIN, question: LABS, format: "csv" }),
    /format must be rows or compact/,
  ],
  [
    "ask",
    "refuses `entries` that are not strings",
    () => ({ pod: STATIN, format: "compact", entries: [1] }),
    /entries must be a list of strings/,
  ],
  [
    "ask",
    'refuses `entries` without `format: "compact"`',
    () => ({ pod: STATIN, question: LABS, entries: ["x"] }),
    /entries need format compact/,
  ],
  [
    "tool",
    "refuses an `input` that is no object",
    () => ({ pod: STATIN, tool: "find_changes", input: "x" }),
    /input must be an object/,
  ],
  [
    "tool",
    "refuses a tool there is not",
    () => ({ pod: STATIN, tool: "nothing" }),
    /no tool nothing/,
  ],
  [
    "tool",
    "refuses a test the pod lacks, from `find_changes`",
    () => ({ pod: STATIN, tool: "find_changes", input: { test: "0000-0" } }),
    /no test/,
  ],
  [
    "tool",
    "refuses a test the pod lacks, from `lab_series`",
    () => ({ pod: STATIN, tool: "lab_series", input: { test: "0000-0" } }),
    /no test/,
  ],
  [
    "tool",
    "refuses a property `worth_a_look` does not take",
    () => ({ pod: STATIN, tool: "worth_a_look", input: { extra: true } }),
    /extra is not a property/,
  ],
];
/** The connection the `EMPTY` pod's cancelled sign-in made, and the words of a pod that is waiting. */
let cancelled: number;
let typed: Input;

/**
 * PodApi throws a `Refusal` for input it cannot act on, with a sentence that says what to give in its place and,
 * where it helps, what there is to choose from. Each leaf is one such input; none of them changes a pod.
 */
describe("Input PodApi refuses, and the sentence it gives · podApi(), Refusal", () => {
  before(async () => {
    await overHttp.makePod({ person: "Waiting", encrypt: true });
    const { words } = await overHttp.waitingWords({ pod: "waiting" });
    const [, word2, , , word5] = words.split(" ");
    typed = {
      pod: "waiting",
      word2,
      word5,
      password: words,
      username: "waiting",
    };
    cancelled = (await connected(overHttp, EMPTY)).connection;
  });

  for (const operation of new Set(REFUSED.map(([each]) => each)))
    describe(`api.${operation}()`, () => {
      for (const [, title, input, reason] of REFUSED.filter(
        ([each]) => each === operation,
      ))
        it(title, async () => {
          await assert.rejects(
            overHttp[operation](input()),
            (error) =>
              isRefusal(error) &&
              error.outcome === undefined &&
              reason.test(error.message),
          );
        });
    });
});

const post = (
  base: string,
  path: string,
  headers: Record<string, string>,
  body = "{}",
) => fetch(`${base}${path}`, { method: "POST", headers, body });
const json = (base: string) => ({
  "content-type": "application/json",
  origin: base,
});

/**
 * The Node server offers each PodApi operation at `POST /api/<operation>`, taking and returning JSON, and the app's
 * own client, `remoteApi()`, calls them for the pages. A refusal crosses with its sentence, and the server turns
 * away a request that does not come from one of its own pages.
 */
describe("Calling PodApi over HTTP · /api/, INPUT_SCHEMAS, refusalOf()", () => {
  describe("given the app's own client, `remoteApi()`, over the server", () => {
    it("returns what PodApi returned, after a round trip through JSON", async () => {
      assert.deepStrictEqual(
        await overHttp.pods({}),
        JSON.parse(JSON.stringify(await inProcess.pods({}))),
      );
    });

    it("throws a `Refusal` carrying the sentence PodApi refused with, such as `there is no pod nobody; the pods are ...`, when PodApi refuses", async () => {
      const own = await caught(inProcess.answers({ pod: "nobody" }));
      const crossed = await caught(overHttp.answers({ pod: "nobody" }));
      assert.equal(crossed.name, "Refusal");
      assert.equal(crossed.message, own.message);
    });

    it("throws `Unopened` with PodApi's `outcome` when a pod does not open", async () => {
      const crossed = await caught(overHttp.answers({ pod: SEALED }));
      assert.equal(crossed.name, "Unopened");
      assert.equal(crossed.outcome, "secret needed");
    });

    it("throws an error that names the operation and the status 500 when PodApi throws anything else", async () => {
      const quiet = mock.method(console, "error", () => undefined);
      try {
        await assert.rejects(
          crossing(brokenApi()).classes({ pod: STATIN }),
          /classes: the server answered 500/,
        );
      } finally {
        quiet.mock.restore();
      }
    });
  });

  describe("when a page asks `POST /api/<operation>`", () => {
    let origin: string;
    let broken: string;
    let quiet: ReturnType<typeof mock.method>;
    before(async () => {
      [origin] = await serve(inProcess);
      quiet = mock.method(console, "error", () => undefined);
      const real = host();
      [broken] = await serve(
        api({
          ...real,
          pods: {
            ...((real as Record<string, unknown>).pods as object),
            names: async () => {
              throw new Error("/secret/path");
            },
          },
        }),
      );
    });
    after(() => quiet.mock.restore());

    for (const [title, request, status] of [
      [
        "responds 404 for an operation there is not",
        (at: string) => post(at, "/api/nothing", json(at)),
        404,
      ],
      [
        "responds 404 for `close`, which stays in the process",
        (at: string) => post(at, "/api/close", json(at)),
        404,
      ],
      [
        "responds 415 for a body that is not sent as JSON",
        (at: string) =>
          post(at, "/api/pods", { ...json(at), "content-type": "text/plain" }),
        415,
      ],
      [
        "responds 403 for a request whose `Origin` is another site",
        (at: string) =>
          post(at, "/api/pods", { ...json(at), origin: "http://evil.example" }),
        403,
      ],
      [
        "responds 400 for a body that is no object",
        (at: string) => post(at, "/api/pods", json(at), "[]"),
        400,
      ],
    ] as const)
      it(title, async () => {
        assert.equal((await request(origin)).status, status);
      });

    it("responds 400 for a body over 1 MiB", async () => {
      const [alone] = await serve(inProcess);
      const response = await post(
        alone,
        "/api/pods",
        json(alone),
        " ".repeat(1024 * 1024 + 1),
      );
      assert.equal(response.status, 400);
    });

    it("responds 500 with one fixed sentence when PodApi throws an error that is no refusal", async () => {
      const response = await post(broken, "/api/pods", json(broken));
      assert.equal(response.status, 500);
      assert.equal(
        await response.text(),
        JSON.stringify({ error: "the server failed; its log says why" }),
      );
    });

    it("keeps that error's text out of the response", async () => {
      const response = await post(broken, "/api/pods", json(broken));
      assert.ok(!(await response.text()).includes("/secret/path"));
    });
  });
});

/**
 * The app is one page that draws every screen, so the server returns that page for any address a person opens, and
 * a file only at the file's own address. A view entry's id may hold a dot, so the server tells a screen's address
 * from a file's by what the browser says it wants.
 */
describe("Answering an address a person opens with the app's page · appServer()", () => {
  describe("appServer({ pages })", () => {
    let get: (
      path: string,
      headers?: Record<string, string>,
    ) => Promise<readonly [number, string]>;
    before(async () => {
      const pages = await mkdtemp(join(tmpdir(), "pages-"));
      folders.push(pages);
      await writeFile(join(pages, "index.html"), "<h1>the app</h1>");
      await writeFile(join(pages, "app.js"), "1");
      const app = appServer({
        api: inProcess,
        own: () => ({ hosts: new Set(["localhost"]), origins: new Set() }),
        chat: new Hono(),
        back: () => undefined,
        pages,
      });
      get = async (path, headers = {}) => {
        const response = await app.request(`http://localhost${path}`, {
          headers,
        });
        return [response.status, await response.text()] as const;
      };
    });

    it("returns the app's page for a screen's address with a dot in it, when the browser is navigating", async () => {
      assert.deepEqual(
        await get("/pods/a/entries/x.1", { "sec-fetch-mode": "navigate" }),
        [200, "<h1>the app</h1>"],
      );
    });

    it("returns the app's page for that address when the request accepts HTML", async () => {
      assert.deepEqual(
        await get("/pods/a/entries/x.1", { accept: "text/html" }),
        [200, "<h1>the app</h1>"],
      );
    });

    it("returns a file of the built app at the file's own address", async () => {
      assert.deepEqual(await get("/app.js"), [200, "1"]);
    });

    it("responds 404 for a file there is not", async () => {
      assert.equal((await get("/nope.json"))[0], 404);
    });

    it("responds 404 for an address with a dot in it that asks for no page", async () => {
      assert.equal((await get("/pods/a/entries/x.1"))[0], 404);
    });
  });
});

/** The statin story's pod with its lab results repeated on other days, so that the compact read of it is two pages. */
const paged = once(async () => {
  const at = await mkdtemp(join(tmpdir(), "pod-api-paged-"));
  folders.push(at);
  const { pull } = await pulled(north, STATIN);
  const files = pullFiles(pull, "north");
  const bundle = JSON.parse(
    new TextDecoder().decode(files.get("north/bundle.json")),
  );
  const labs = bundle.entry.filter(
    ({ resource }: Output) => resource.resourceType === "Observation",
  );
  for (let day = 0; day < 12; day += 1)
    for (const lab of labs)
      bundle.entry.push({
        ...lab,
        fullUrl: `${lab.fullUrl}-${day}`,
        resource: {
          ...lab.resource,
          id: `${lab.resource.id}-${day}`,
          effectiveDateTime: new Date(Date.UTC(2020, 0, 1 + day)).toISOString(),
        },
      });
  const pod = await openPod(join(at, "paged"));
  const imported = await pod.import(
    new Map([
      ...files,
      ["north/bundle.json", new TextEncoder().encode(JSON.stringify(bundle))],
    ]),
    { claimProfiles: true },
  );
  assert.equal(imported.refused, undefined);
  await pod.close();
  return crossing(api(host(at)));
});

/** The pages of the paged pod's compact read, each asked for with the `next` of the page before. */
const pagesOnce = once(async () => {
  const { run } = toolsOf(await paged());
  const pages: Output[] = [];
  let input: Input | undefined = { pod: "paged", format: "compact" };
  while (input !== undefined && pages.length < 10) {
    const response = await run("ask", input);
    assert.equal(response.status, 200);
    const page: Output = await response.json();
    pages.push(page);
    input = page.next;
  }
  return pages;
});

/** The pods the table checks run over: Martin's kit pod, and the statin story's with a second atorvastatin. */
const checks = once(async () => {
  const at = await mkdtemp(join(tmpdir(), "pod-api-checks-"));
  folders.push(at);
  await replayKit("martin-okafor", join(at, "martin-okafor"));
  const { pull } = await pulled(north, STATIN);
  const files = pullFiles(pull, "north");
  const bundle = JSON.parse(
    new TextDecoder().decode(files.get("north/bundle.json")),
  );
  const [first] = bundle.entry.filter(
    ({ resource }: Output) =>
      resource.resourceType === "MedicationRequest" &&
      resource.medicationCodeableConcept.coding[0].code === ATORVASTATIN,
  );
  const [coding] = first.resource.medicationCodeableConcept.coding;
  bundle.entry.push({
    ...first,
    fullUrl: first.fullUrl.replace("med-1", "med-3"),
    resource: {
      ...first.resource,
      id: "story-statin-med-3",
      medicationCodeableConcept: {
        coding: [
          {
            ...coding,
            code: SECOND_ATORVASTATIN,
            display: "atorvastatin 40 MG Oral Tablet",
          },
        ],
        text: "Atorvastatin 40 mg tablet",
      },
    },
  });
  const pod = await openPod(join(at, "two-atorvastatins"));
  const imported = await pod.import(
    new Map([
      ...files,
      ["north/bundle.json", new TextEncoder().encode(JSON.stringify(bundle))],
    ]),
    { claimProfiles: true },
  );
  assert.equal(imported.refused, undefined);
  await pod.close();
  const { run } = toolsOf(api(nodeHost({ folder: at })));
  return async (name: string, pod: string) => {
    const response = await run(name, { pod });
    assert.equal(response.status, 200, name);
    return (await response.json()) as Output;
  };
});

/** What the server refuses before it answers: a request that names another host, and a method it does not serve. */
describe("Guarding the server · guard()", () => {
  let app: ReturnType<typeof toolsOf>["app"];
  let origin: string;
  before(() => ({ app, origin } = toolsOf(inProcess)));

  it("responds 403 to a request whose `Host` is not the server's own address, on `/api/` in JSON and elsewhere as a page", async () => {
    const api = await app.request("http://rebound.example/api/pods", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(api.status, 403);
    assert.deepEqual(await api.json(), {
      refused: "not this server's address",
    });
    const page = await app.request("http://rebound.example/tools");
    assert.equal(page.status, 403);
    assert.match(await page.text(), /<h1>Refused: not this server's address/);
  });

  it("responds 405 to a method that is neither GET nor POST", async () => {
    for (const method of ["PUT", "DELETE", "PATCH"]) {
      const refused = await app.request(`${origin}/api/pods`, { method });
      assert.equal(refused.status, 405, method);
    }
  });

  it("answers a GET on the server's own address", async () => {
    assert.equal((await app.request(`${origin}/tools`)).status, 200);
  });
});

/**
 * A page that carries no runtime of its own offers a model the app's read tools by calling the server: `GET /tools`
 * lists them, and `POST /tools/<name>` runs one on a JSON input. Only `free` tools that open no screen are here; a
 * tool that writes or moves the app is the page's own.
 */
describe("Running the read tools over HTTP · GET /tools, POST /tools/<name>", () => {
  const server = () => toolsOf(inProcess);

  describe("when a page asks `GET /tools`", () => {
    it("lists each `free` tool that opens no screen and is not the page's own, with its description and input schema", async () => {
      const { app, origin } = server();
      const listed = (await (await app.request(`${origin}/tools`)).json()) as {
        name: string;
        description: unknown;
        inputSchema: unknown;
      }[];
      const own = new Set(PAGE_TOOLS.map(({ name }) => name));
      assert.deepEqual(
        listed.map(({ name }) => name).sort(),
        TOOLS.filter(
          ({ tier, opens, name }) =>
            tier === "free" && opens === undefined && !own.has(name),
        )
          .map(({ name }) => name)
          .sort(),
      );
      assert.ok(listed.length > 0, "the server lists no tool");
      for (const { name, description, inputSchema } of listed) {
        assert.equal(typeof description, "string", name);
        assert.equal(typeof inputSchema, "object", name);
      }
    });
  });

  describe("when a page asks `POST /tools/<name>`", () => {
    it("runs `list_pods`, and returns the pods", async () => {
      const pods = await server().run("list_pods", {});
      assert.equal(pods.status, 200);
      assert.ok(Array.isArray(await pods.json()));
    });

    it("runs `reference_table_checks` on a pod with the host's reference tables", async () => {
      const checked = await server().run("reference_table_checks", {
        pod: STATIN,
      });
      assert.equal(checked.status, 200);
      assert.equal(((await checked.json()) as { tables: string }).tables, "on");
    });

    it("runs `ask` for a pod's compact read", async () => {
      const compact = await server().run("ask", {
        pod: STATIN,
        format: "compact",
      });
      assert.equal(compact.status, 200);
      assert.equal(
        ((await compact.json()) as { format: string }).format,
        "compact",
      );
    });

    it("responds 400, with the tool's refusal in `refused`, for input the tool's schema refuses", async () => {
      const wrong = await server().run("ask", {
        pod: "x",
        question: "SELECT * WHERE {}",
      });
      assert.equal(wrong.status, 400);
      assert.match(
        ((await wrong.json()) as { refused: string }).refused,
        /must be one of/,
      );
    });

    it("responds 423 with `{ unopened, refused }`, as `/api/` does, for an encrypted pod that is not open", async () => {
      const locked = await server().run("ask", {
        pod: SEALED,
        format: "compact",
      });
      assert.equal(locked.status, 423);
      const body = (await locked.json()) as {
        unopened: string;
        refused: string;
      };
      assert.equal(body.unopened, "secret needed");
      assert.equal(typeof body.refused, "string");
    });

    it("responds 404 for a tool that writes or moves the app, and for a name that is no tool", async () => {
      for (const name of ["make_pod", "open_pod", "nothing"])
        assert.equal((await server().run(name, {})).status, 404, name);
    });

    it("returns a larger pod's compact read in two pages or more, each page's `next` being the input of the one after", async () => {
      const pages = await pagesOnce();
      assert.ok(pages.length >= 2, "the pod is read in more than one page");
      assert.equal(pages.at(-1)!.next, undefined);
    });

    it("returns every row of every view once across those pages", async () => {
      const shown = new Map<string, number>();
      const total = new Map<string, number>();
      for (const { views } of await pagesOnce())
        for (const view of views) {
          shown.set(
            view.question,
            (shown.get(view.question) ?? 0) + view.shown,
          );
          total.set(view.question, view.total);
        }
      assert.deepEqual(shown, total);
    });
  });

  describe("given the reference tables cascade-runtime carries, in place of a stub", () => {
    it("says from `worth_a_look` two medications that share an ingredient, with the ingredient's name", async () => {
      const model = await checks();
      const lines = (await model(
        "worth_a_look",
        "two-atorvastatins",
      )) as unknown as Output[];
      assert.ok(
        lines.some(({ sentence }) =>
          /share an ingredient, atorvastatin/.test(sentence),
        ),
        JSON.stringify(lines),
      );
    });

    it("says from `worth_a_look` a report that differs from ClinVar today", async () => {
      const lines = (await (
        await checks()
      )("worth_a_look", "martin-okafor")) as unknown as Output[];
      const differing = lines.filter(({ tag }) => tag === "Differs");
      assert.ok(differing.length > 0, JSON.stringify(lines));
      assert.match(
        differing[0]!.sentence,
        /2022 report.* differs from ClinVar today\.$/,
      );
    });
  });
});
