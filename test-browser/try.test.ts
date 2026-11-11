import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type Browser,
  chromium,
  type Locator,
  type Page,
  type Route,
  type Worker as PageWorker,
} from "playwright";
import {
  connect,
  DEMO_PLAN,
  type Imported,
  openPod,
  type Pod,
  pull,
  pullFiles,
  type Row,
} from "cascade-runtime";
import {
  demoFetch,
  hospitalId,
  recordsAt,
} from "@the-cascade-protocol/sandbox";
import {
  loadHospital,
  loadHospitals,
  loadStories,
} from "@the-cascade-protocol/sandbox/node";
import * as oxigraph from "oxigraph";
import { installedParts } from "cascade-runtime/fixtures";
import { codeStems, terms } from "cascade-runtime/terms";
import { openPodWith } from "cascade-runtime/published";
import { type Served, servePages } from "../try/build/serve.js";
import {
  allowAs,
  bringIn,
  called,
  inPlace,
  inputOf,
  listed,
  newPod,
  offered,
  recordTools,
  type Registered,
  setWorldDate,
  settled,
  signInAt,
  tiles,
  watched,
} from "./shown.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PAGES = join(ROOT, "build", "pages");
/** The components the page serves, as the package carries them. */
const SERVED = join(PAGES, "try", "cascade-runtime", "components");
/** The hub, the front page of the runtime's site, which try/ is a row of. */
const HUB = "https://jayostis.github.io/cascade-runtime-js/";

/** The page's addresses: paths under its base, try/. */
const AT = {
  home: "try/",
  pod: (pod: string) => `try/pods/${pod}/`,
  entryLink: (pod: string, id: string) =>
    `/try/pods/${pod}/entries/${encodeURIComponent(id)}`,
  code: (code: string) => `/try/tables/?code=${code}`,
  podOf: (url: string) =>
    /\/pods\/([^/]+)\//.exec(new URL(url).pathname)?.[1] ?? null,
  entryOf: (url: string) => {
    const id = /\/entries\/([^/]+)$/.exec(new URL(url).pathname)?.[1];
    return id === undefined ? null : decodeURIComponent(id);
  },
  table: (id: string, q: string) => `try/tables/${id}/?q=${q}`,
  tableOf: (url: string) =>
    /\/tables\/([^/]+)\//.exec(new URL(url).pathname)?.[1] ?? null,
  codeOf: (url: string) => new URL(url).searchParams.get("code"),
  classes: (pod: string) => `try/pods/${pod}/classes`,
  trend: (pod: string, test: string) => `try/pods/${pod}/trend?test=${test}`,
  trendOf: (url: string) => {
    const at = new URL(url);
    const pod = /\/pods\/([^/]+)\/trend$/.exec(at.pathname)?.[1];
    return pod === undefined
      ? null
      : {
          pod,
          test: at.searchParams.get("test"),
          medication: at.searchParams.get("medication"),
        };
  },
  links: 'a[href^="/try/"]',
  entry: (pod: string, id: string) =>
    `try/pods/${pod}/entries/${encodeURIComponent(id)}`,
  worker: /\/try\/demo-hospital-worker\.js$/,
  shapeOf: (href: string) => {
    const at = new URL(href, "http://x/");
    return [
      at.pathname
        .replace(/^\/try\/pods\/[^/]+/, "pods/*")
        .replace(/^\/try\/tables\/[^/]+/, "tables/*")
        .replace(/\/entries\/.+$/, "/entries/*")
        .replace(/^\/try\//, ""),
      ...[...at.searchParams.keys()].sort(),
    ].join("?");
  },
};

interface Followed {
  readonly repository: string;
}

interface Config {
  readonly vocabulary: Followed;
  readonly adapters: readonly Followed[];
  readonly tables: { readonly feeds: readonly string[] };
}

/** The cascade-runtime.json try/ serves. */
const servedConfig = async (): Promise<Config> =>
  JSON.parse(
    await readFile(join(SERVED, "cascade-runtime.json"), "utf8"),
  ) as Config;

type Triple = readonly [
  oxigraph.Quad_Subject,
  oxigraph.Quad_Predicate,
  oxigraph.Quad_Object,
];

/** A Turtle document's triples, each as its subject, predicate and object. */
const turtle = (bytes: Uint8Array, base: string): Triple[] =>
  oxigraph
    .parse(bytes, { format: "text/turtle", base_iri: base })
    .map(
      ({ subject, predicate, object }) => [subject, predicate, object] as const,
    );

/** The triples as N-Triples. */
const ntriples = (triples: readonly Triple[]): string =>
  new oxigraph.Store(
    triples.map(([subject, predicate, object]) =>
      oxigraph.quad(subject, predicate, object),
    ),
  ).dump({
    format: "application/n-triples",
    from_graph_name: oxigraph.defaultGraph(),
  });
const ALEX = "alex-rivera";
const DCAT = "http://www.w3.org/ns/dcat#";
const PROV = "http://www.w3.org/ns/prov#";
/** Oxigraph's module, the engine a pod computes with. */
const ENGINE = /\/web_bg\.wasm$/;

/** The files a table's rows are read from, which the engine reads once it is ready. */
const TABLE_ROWS = /\/components\/tables\/[^/]+\.(nq\.gz|codes\.json)$/;

type Answers = Record<string, Row[]>;
interface Person {
  readonly name: string;
  readonly family: string;
  readonly given: string;
  readonly at: readonly { readonly name: string; readonly fhirBase: string }[];
}
interface Section {
  readonly title: string;
  readonly question?: string;
}
/** What the test reads of what the pages say, `said.ts`, which both pages draw with. */
interface View {
  readonly QUESTIONS: readonly string[];
  readonly SECTIONS: readonly Section[];
  sectionRows(section: Section, answers: Answers): Row[];
  worthALook(
    answers: Answers,
    about?: Map<string, unknown>,
    said?: unknown,
  ): { sentence: string; entry: string; tag?: string }[];
  seenAt(answers: Answers): Map<string, { places: string[]; across: number }>;
  entryId(entry: string): string;
  placeOf(row: Row): string;
  counted(records: Readonly<Record<string, number>>): string;
  hospitalName(name: string): string;
  day(text: string): string;
  dayInWords(asOf: string): string;
  demoPeople(demo: unknown): Person[];
  familyFirst(person: Person): string;
  patientName(bundle: unknown): string | undefined;
  slug(person: string): string;
}

const view = (await import(
  pathToFileURL(join(ROOT, "app", "said.ts")).href
)) as View;
const TOOLS = await listed();

let served: Served;
let browser: Browser;
let alex: Answers;
/** A demo person, what Node's look says of each hospital's pull, and what the pulls bring in. */
interface Joined {
  person: Person;
  patients: Map<string, string>;
  has: Map<string, string[]>;
  worth: string[];
  worthLinks: string[];
  /** How many records of each type the person's hospitals hold, before the pod joins any. */
  held: Map<string, number>;
  /** The entry both hospitals recorded; its IRI comes from the records, so Node and the browser name it alike. */
  seenAtBoth: string | undefined;
}
/** Rowan Marsh, whom both hospitals hold, and Tobias Fenn, whom only North does. */
let joined: Joined;
let tobias: Joined;

/** A Worth a look line as the page's text reads it: its sentence, then its tag. */
const worthText = ({ sentence, tag }: { sentence: string; tag?: string }) =>
  tag === undefined ? sentence : `${sentence} ${tag}`;

async function answersOf(pod: Pod): Promise<Answers> {
  const answers: Answers = {};
  for (const question of view.QUESTIONS)
    answers[question] = await pod.ask(question);
  return answers;
}

/** The sentences the connection's box says of what each source of a pull holds. */
const hasLines = (
  hospital: string,
  sources: readonly { records: Readonly<Record<string, number>> }[],
): string[] =>
  sources.map(
    (source) =>
      `What ${view.hospitalName(hospital)} has: ${view.counted(source.records) || "nothing"}.`,
  );

/** The demo person with this name, the hospital that holds them (alone, unless `alone` is false), and their patient id there. */
async function demoPatient(
  name: string,
  alone = true,
): Promise<{
  person: Person;
  hospital: Person["at"][number];
  patient: string;
}> {
  const demo = await loadHospitals();
  const person = view.demoPeople(demo).find((each) => each.name === name);
  assert.ok(person, `no demo person is ${name}`);
  const [hospital] = person.at;
  assert.ok(hospital, `${name} is at no hospital`);
  assert.ok(
    !alone || person.at.length === 1,
    `${name} is not at one hospital alone`,
  );
  const loaded = demo.find(
    (each) => each.hospital.fhirBase === hospital.fhirBase,
  );
  const patient = Object.entries(loaded?.patients ?? {}).find(
    ([, bundle]) => view.patientName(bundle) === person.name,
  )?.[0];
  assert.ok(patient, `${hospital.name} holds no patient ${name}`);
  return { person, hospital, patient };
}

/** A Node pod in memory, opened by the installed package over the starter tables it carries, which the page ships. */
async function pageTablesPod(): Promise<Pod> {
  return openPodWith(await installedParts());
}

/** What Node pulls of the demo person with this family name at each of their hospitals, and the pod the pulls make. */
async function nodeJoin(family: string): Promise<Joined> {
  const demo = await loadHospitals();
  const person = view.demoPeople(demo).find((each) => each.family === family);
  assert.ok(person, `no demo person is named ${family}`);
  const patients = new Map<string, string>();
  const has = new Map<string, string[]>();
  const held = new Map<string, number>();
  const pod = await pageTablesPod();
  try {
    for (const hospital of person.at) {
      const loaded = demo.find(
        (each) => each.hospital.fhirBase === hospital.fhirBase,
      );
      assert.ok(loaded);
      const id = Object.entries(loaded.patients).find(
        ([, bundle]) => view.patientName(bundle) === person.name,
      )?.[0];
      assert.ok(id);
      patients.set(hospital.name, id);
      for (const resource of recordsAt(loaded.patients[id]!))
        held.set(
          resource.resourceType,
          (held.get(resource.resourceType) ?? 0) + 1,
        );
      const fetch = demoFetch([{ ...loaded, autoApprove: id }]);
      const connection = await connect(
        { name: hospital.name, vendor: "demo", fhirBase: hospital.fhirBase },
        {
          clientId: "cascade-runtime-demo",
          redirectUri: "http://127.0.0.1/try/signed-in.html",
          scopes: ["launch/patient", "patient/*.read"],
        },
        {
          fetch,
          signIn: async (authorize) =>
            new URL(
              (await fetch(authorize, { redirect: "manual" })).headers.get(
                "Location",
              ) ?? "",
            ),
        },
      );
      const files = pullFiles(
        await pull(connection, DEMO_PLAN),
        hospitalId(loaded),
      );
      has.set(hospital.name, hasLines(hospital.name, await pod.look(files)));
      const imported = await pod.import(files, { claimProfiles: true });
      assert.equal(imported.refused, undefined);
    }
    const answers = await answersOf(pod);
    const both = person.at.map(({ name }) => view.hospitalName(name));
    const seenAtBoth = [...view.seenAt(answers)].find(([, { places }]) =>
      both.every((name) => places.includes(name)),
    )?.[0];
    return {
      seenAtBoth,
      person,
      patients,
      has,
      held,
      worth: view.worthALook(answers).map(worthText),
      worthLinks: view
        .worthALook(answers)
        .map(({ entry }) =>
          AT.entryLink(view.slug(person.name), view.entryId(entry)),
        ),
    };
  } finally {
    await pod.close();
  }
}

before(async () => {
  if (!existsSync(join(PAGES, "try", "index.html")))
    throw new Error(`${PAGES} holds no try/; run npm run build:try first`);
  const copy = await mkdtemp(join(tmpdir(), "try-"));
  try {
    await cp(join(PAGES, ALEX, "pod"), copy, { recursive: true });
    await rm(join(copy, "files.json"));
    const pod = await openPod(copy);
    try {
      alex = await answersOf(pod);
    } finally {
      await pod.close();
    }
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
  joined = await nodeJoin("Marsh");
  tobias = await nodeJoin("Fenn");
  served = await servePages(PAGES);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await served?.close();
});

const texts = (page: Page, selector: string): Promise<string[]> =>
  page.$$eval(selector, (found) => found.map((each) => each.textContent ?? ""));

/**
 * What a person waits for on Martin's pages, in ms with the tables kept and the HTTP cache warm, each median at most
 * twice its budget. CI's runners vary by more than a budget's margin; twice still fails a regression of the size that
 * matters.
 */
const BUDGET_MS = {
  "Martin's pod page, a new load, until the MLH1 Differs line": 1250,
  "Martin's pod page, a reload, until the MLH1 Differs line": 610,
  "the MLH1 entry, a new load, until the ClinVar sentence": 1250,
  "the MLH1 entry, a reload, until the ClinVar sentence": 610,
  "a click on a Genetic variants row, until the ClinVar sentence": 610,
};
const SAMPLES = 3;

/**
 * A fresh browser's first visit to try/, in ms from its navigation until the tables' names are drawn on Alex's page,
 * its median at most twice the budget, as Martin's are.
 */
const FIRST_VISIT_NAMES_BUDGET_MS = 650;

/** Prints each sample and the median, and fails a median over twice the budget. */
function withinBudget(
  what: string,
  samples: readonly number[],
  budget: number,
): void {
  for (const [at, ms] of samples.entries())
    console.log(`# ${what} ${at + 1} ${Math.round(ms)} ms`);
  console.log(
    `# ${what}: median ${Math.round(median(samples))} ms, budget ${budget} ms`,
  );
  assert.ok(
    median(samples) <= 2 * budget,
    `${what}: median ${Math.round(median(samples))} ms is over twice its budget of ${budget} ms (${samples.map(Math.round).join(", ")})`,
  );
}

interface Drawn {
  drawn: Record<string, number>;
  clicked?: number;
}

/**
 * Records, in every page of the context, `performance.now()` when the line Worth a look has for MLH1's report, tagged
 * Differs (`differs`), the entry's ClinVar sentence (`clinvar`) and Alex's influenza vaccine named by CVX (`names`)
 * are first drawn; a click starts the count again.
 * Playwright's waits and the test's round trips are not in the number.
 */
function recordDraws(): void {
  const here = globalThis as unknown as Drawn;
  here.drawn = {};
  const sees: Record<string, () => boolean> = {
    differs: () =>
      [...document.querySelectorAll(".worth li")].some((line) => {
        const text = line.textContent ?? "";
        return (
          text.includes("your 2022 report from Harbourline Genetics") &&
          text.includes("Differs")
        );
      }),
    clinvar: () =>
      /ClinVar today (says|gives no classification)|ClinVar, as this app holds it|This app holds no ClinVar table/.test(
        document.querySelector("main")?.textContent ?? "",
      ),
    names: () =>
      (document.querySelector("main")?.textContent ?? "").includes(
        "split virus",
      ),
  };
  new MutationObserver(() => {
    for (const [what, seen] of Object.entries(sees))
      if (here.drawn[what] === undefined && seen())
        here.drawn[what] = performance.now();
  }).observe(document, { childList: true, subtree: true, characterData: true });
  document.addEventListener(
    "click",
    () => {
      here.clicked = performance.now();
      here.drawn = {};
    },
    true,
  );
}

interface Leaving {
  leaving?: { count: number; from: string | null; still?: number };
}

/**
 * Looks, in every page of the context, at the tools of the pod left at the first change of the page that follows from
 * `globalThis.leaving = { count, from }` being set: the title bar marking another pod than `from`. A mutation observer
 * calls back in the microtask after the commit that made the change, before the macrotask in which a passive effect
 * (React's scheduler) runs, so a tool taken away from one is still on. It
 * sets `leaving.still` to how many of the first `count` tools registered are still on. No timer and no machine's speed
 * decides it.
 */
function watchLeaving(): void {
  const here = globalThis as unknown as Leaving & Registered;
  const marked = (): string | null =>
    document.querySelector("aside nav a[aria-current]")?.textContent ?? null;
  new MutationObserver(() => {
    const watch = here.leaving;
    if (watch === undefined || watch.still !== undefined) return;
    if (marked() === watch.from) return;
    watch.still = here.registered
      .slice(0, watch.count)
      .filter(({ signal }) => !signal.aborted).length;
  }).observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-current"],
  });
}

/** When `what` was first drawn in the page, ms since its navigation started or, after a click, since the click. */
async function drawnAt(page: Page, what: string): Promise<number> {
  try {
    await page.waitForFunction(
      (what) => (globalThis as unknown as Drawn).drawn[what] !== undefined,
      what,
      { timeout: 20_000 },
    );
  } catch (error) {
    throw new Error(`"${what}" was never drawn on ${page.url()} in 20 s`, {
      cause: error,
    });
  }
  return page.evaluate((what) => {
    const here = globalThis as unknown as Drawn;
    return (here.drawn[what] ?? 0) - (here.clicked ?? 0);
  }, what);
}

const median = (values: readonly number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** The samples the new-pod box offers to load, by folder. */
const loadable = (page: Page): Promise<string[]> =>
  page.$$eval('#new-pod input[name="pod"]', (found) =>
    found.map((each) => (each as HTMLInputElement).value),
  );

interface Late {
  late: string[];
}

/**
 * Records, in the page, each change to `main` made while the body says `ready`, from the last time it came to say so:
 * a screen drawn again after it said it was ready shows there. A record of `data-state` holds its old value, so the
 * state each change was made in is the next record's old value, or the state now.
 */
function watchLate(): void {
  const here = globalThis as unknown as Late;
  here.late = [];
  let state = document.body.dataset.state;
  new MutationObserver((records) => {
    const states = records.filter(
      ({ attributeName }) => attributeName === "data-state",
    );
    let next = 0;
    for (const record of records) {
      if (record.attributeName === "data-state") {
        next += 1;
        const was = state;
        state = states[next]?.oldValue ?? document.body.dataset.state;
        if (state === "ready" && was !== "ready") here.late = [];
      } else if (
        state === "ready" &&
        record.type !== "attributes" &&
        document.querySelector("main")?.contains(record.target)
      )
        here.late.push(
          `${record.type} in ${(record.target as Element).nodeName ?? ""}: ${(record.target.textContent ?? "").slice(0, 80)}`,
        );
    }
  }).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ["data-state"],
  });
}

/** The `data-key` of each row the lab results' table shows, in the column headed `head`. */
async function column(page: Page, head: string): Promise<string[]> {
  return page.$$eval(
    "#see-lab-results table",
    ([table], head) => {
      const heads = [...(table?.querySelectorAll("th") ?? [])].map(
        (th) => th.textContent ?? "",
      );
      const at = heads.findIndex((text) => text.startsWith(head));
      return [...(table?.querySelectorAll("tbody tr:not([hidden])") ?? [])].map(
        (row) => (row as HTMLTableRowElement).cells[at]?.dataset.key ?? "",
      );
    },
    head,
  );
}

/** What a pod shows after an import, its own address left out, so two pods compare. */
interface After {
  readonly refused?: string;
  readonly claimedProfiles: number;
  readonly unclaimedProfiles: number;
  readonly rows: string[][];
}

const QUESTIONS = ["pod/My active allergies", "pod/My active medications"];

/** The import and the rows of the questions after it; self-contained, so the page runs it from its source as Node does. */
async function shownAfter(
  pod: Pod,
  imported: Imported,
  questions: readonly string[],
): Promise<After> {
  const rows: string[][] = [];
  for (const question of questions)
    for (const row of await pod.ask(question))
      rows.push([
        question,
        ...Object.entries(row)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(
            ([column, value]) =>
              `${column}=${value.startsWith(pod.address) ? value.slice(pod.address.length) : value}`,
          ),
      ]);
  return {
    ...(imported.refused === undefined ? {} : { refused: imported.refused }),
    claimedProfiles: imported.claimedProfiles.length,
    unclaimedProfiles: imported.unclaimedProfiles.length,
    rows: rows.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)),
  };
}

/** Every value of every object store of the database `name`, as text, by key. */
async function storedIn(
  page: Page,
  name: string,
): Promise<{ key: string; text: string }[]> {
  return page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((done, failed) => {
      const opening = indexedDB.open(name);
      opening.onerror = () => failed(opening.error);
      opening.onsuccess = () => done(opening.result);
    });
    const asked = <T>(request: IDBRequest<T>) =>
      new Promise<T>((done, failed) => {
        request.onerror = () => failed(request.error);
        request.onsuccess = () => done(request.result);
      });
    const decoder = new TextDecoder("latin1");
    const texted = (value: unknown): string =>
      typeof value === "string"
        ? value
        : value instanceof ArrayBuffer || ArrayBuffer.isView(value)
          ? decoder.decode(value)
          : JSON.stringify(value);
    const stores = [...database.objectStoreNames];
    const transaction = database.transaction(stores, "readonly");
    const reads = stores.map((store) => {
      const objects = transaction.objectStore(store);
      return Promise.all([
        asked(objects.getAllKeys()),
        asked(objects.getAll()),
      ]);
    });
    const found: { key: string; text: string }[] = [];
    for (const [keys, values] of await Promise.all(reads))
      keys.forEach((key, at) =>
        found.push({ key: String(key), text: texted(values[at]) }),
      );
    database.close();
    return found;
  }, name);
}

/** The words of `words` that the page's local or session storage holds. */
async function wordsKept(page: Page, words: readonly string[]) {
  return page.evaluate((words) => {
    const kept = [localStorage, sessionStorage]
      .flatMap((store) => Object.entries(store))
      .flat()
      .join(" ");
    return words.filter((word) => new RegExp(`\\b${word}\\b`).test(kept));
  }, words);
}

/**
 * try/ is the app built to run in a browser alone, with no server: its pods are kept in the browser. A first visit
 * copies four sample pods and opens the first, drawing from answers published with the samples while the engine (the
 * part that queries a pod) loads behind.
 */
describe("Opening try/ for the first time · try/", () => {
  test("when a fresh browser opens try/ and the engine is held back", async (t) => {
    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      const held: Route[] = [];
      await page.route(ENGINE, (route) => {
        held.push(route);
      });
      const rows: Route[] = [];
      await page.route(TABLE_ROWS, (route) => {
        rows.push(route);
      });
      const wrong: string[] = [];
      page.on("pageerror", (error) => wrong.push(error.message));
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);

      await t.test("opens Alex Rivera's pod", async () => {
        assert.equal(await page.textContent("main h1"), "Alex Rivera");
        assert.equal(
          await page.textContent('nav a[aria-current="page"]'),
          "Alex Rivera",
        );
      });
      await t.test("lists the four sample pods on the left", async () => {
        assert.deepEqual(await texts(page, "nav a"), [
          "Alex Rivera",
          "Martin Okafor",
          "Priya Natarajan",
          "Tamsin Vale",
        ]);
      });
      await t.test("offers no sample to load", async () => {
        assert.deepEqual(await loadable(page), []);
      });
      await t.test(
        "says in the sidebar that the reference tables are loading",
        async () => {
          const sidebar =
            (await page.textContent("aside section.tables")) ?? "";
          assert.ok(
            sidebar.includes("Loading the reference tables"),
            `the sidebar does not say the tables are loading: ${sidebar}`,
          );
          assert.ok(!sidebar.includes("None yet"), sidebar);
        },
      );

      await inPlace(page, () =>
        page.click('nav a:has-text("Priya Natarajan")'),
      );
      await t.test(
        "draws another pod, without loading a page, before the engine loads",
        async () => {
          assert.equal(await page.textContent("main h1"), "Priya Natarajan");
          assert.equal(await page.getAttribute("body", "data-engine"), null);
        },
      );
      await inPlace(page, () => page.click('nav a[aria-current="page"]'));
      const shownAfterClick = await page.textContent("main h1");
      await inPlace(page, async () => {
        await page.goBack();
        await page.waitForFunction(
          () =>
            document.querySelector("main h1")?.textContent === "Alex Rivera",
        );
      });
      await t.test(
        "adds no history entry for a click on the pod shown",
        async () => {
          assert.equal(shownAfterClick, "Priya Natarajan");
          assert.equal(AT.podOf(page.url()), ALEX);
        },
      );
      await inPlace(page, () => page.click(".worth li a"));
      assert.ok(AT.entryOf(page.url()), page.url());
      const entryName = await page.textContent("main h1");
      await page.evaluate((code) => {
        history.pushState(null, "", code);
        dispatchEvent(new PopStateEvent("popstate"));
      }, AT.code("141"));
      await page.unroute(ENGINE);
      for (const route of held) await route.continue().catch(() => undefined);
      await page.waitForSelector('body[data-engine="ready"]', {
        timeout: 60_000,
      });
      await page.unroute(TABLE_ROWS);
      for (const route of rows) await route.continue().catch(() => undefined);
      await page.waitForFunction(
        (name) => document.querySelector("main h1")?.textContent !== name,
        entryName,
        { timeout: 120_000 },
      );
      await settled(page);
      await t.test(
        "keeps a code's page drawn when the engine lands after an entry was opened and left",
        async () => {
          assert.equal(
            await page.textContent("main h1"),
            "141 Influenza, split virus, trivalent, preservative",
            (await page.textContent("main")) ?? "",
          );
        },
      );
      await t.test("reports no error in the page", async () => {
        assert.deepEqual(wrong, []);
      });
      await page.goto(`${served.url}${AT.home}`);
      await page.waitForSelector('body[data-engine="ready"]', {
        timeout: 60_000,
      });
    } finally {
      await context.close();
    }
  });

  test("when a first visit opens a sample pod's link", async (t) => {
    const link = await browser.newContext();
    try {
      const page = watched(await link.newPage());
      await page.goto(`${served.url}${AT.pod("martin-okafor")}`);
      await settled(page);
      await t.test("opens that sample", async () => {
        assert.equal(await page.textContent("main h1"), "Martin Okafor");
      });
      await t.test("copies all four samples", async () => {
        assert.equal((await texts(page, "nav a")).length, 4);
      });
    } finally {
      await link.close();
    }
  });

  test("with an address that is no page's", async (t) => {
    const link = await browser.newContext();
    try {
      const page = watched(await link.newPage());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await page.goto(`${served.url}${AT.pod("nobody")}`);
      await settled(page);
      await t.test(
        "draws Not found for a pod the browser does not hold",
        async () => {
          assert.equal(await page.textContent("main h1"), "Not found");
        },
      );
      const nowhere: string[] = [];
      for (const address of ["try/nothing/here", "tryx/pods/alex-rivera/"]) {
        await page.goto(`${served.url}${address}`);
        await settled(page);
        nowhere.push((await page.textContent("main h1")) ?? "");
      }
      await t.test(
        "draws Not found for an address outside the app's pages",
        async () => {
          assert.deepEqual(nowhere, ["Not found", "Not found"]);
        },
      );
      const old: string[] = [];
      for (const address of [
        "try/?pod=martin-okafor#records",
        "try/index.html?pod=martin-okafor",
      ]) {
        await page.goto(`${served.url}${address}`);
        await settled(page);
        old.push((await page.textContent("main h1")) ?? "");
      }
      await t.test(
        "opens the first pod for an old try/ link that names a pod in its query",
        async () => {
          assert.deepEqual(old, ["Alex Rivera", "Alex Rivera"]);
        },
      );
    } finally {
      await link.close();
    }
  });

  test("when no sample copies on a first visit", async (t) => {
    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      const samples =
        /\/(alex-rivera|martin-okafor|priya-natarajan|tamsin-vale)\/pod[/.]/;
      await page.route(samples, (route) => route.abort());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await t.test("leaves no pod database behind", async () => {
        assert.deepEqual(
          await page.evaluate(async () =>
            (await indexedDB.databases())
              .map(({ name }) => name ?? "")
              .filter((name) => name.startsWith("cascade-pod:")),
          ),
          [],
        );
      });
      await t.test("says there are no pods yet", async () => {
        assert.equal(await page.textContent("main h1"), "No pods yet");
        assert.deepEqual(await texts(page, "nav a"), []);
      });
      await t.test(
        "offers each sample to load in the new-pod box",
        async () => {
          assert.deepEqual(await loadable(page), [
            ALEX,
            "martin-okafor",
            "priya-natarajan",
            "tamsin-vale",
          ]);
        },
      );

      await page.unroute(samples);
      await newPod(page, "Load Alex Rivera");
      await t.test("loads a sample from the new-pod box", async () => {
        assert.equal(await page.textContent("main h1"), "Alex Rivera");
        assert.deepEqual(await texts(page, "nav a"), ["Alex Rivera"]);
      });
    } finally {
      await context.close();
    }
  });

  test("when a sample's copy fails inside `openPod()`", async (t) => {
    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      await page.route(
        /\/(alex-rivera|martin-okafor|priya-natarajan|tamsin-vale)\/pod[/.]/,
        (route) => route.abort(),
      );
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      const outcome = await page.evaluate(async () => {
        const { openPod } = (await import("cascade-runtime" as string)) as {
          openPod(name: string, options: { from: string }): Promise<unknown>;
        };
        const raw = (name: string) =>
          new Promise<IDBDatabase>((resolve, reject) => {
            const opening = indexedDB.open(name, 1);
            opening.onupgradeneeded = () =>
              opening.result.createObjectStore("files");
            opening.onsuccess = () => resolve(opening.result);
            opening.onerror = () => reject(opening.error);
          });
        const failure = (opening: Promise<unknown>) =>
          Promise.race([
            opening.then(
              () => "opened",
              (error: unknown) => (error as Error).message,
            ),
            new Promise<string>((resolve) =>
              setTimeout(() => resolve("still waiting"), 5_000),
            ),
          ]);

        const holder = await raw("cascade-pod:held");
        const held = await failure(openPod("held", { from: "../nowhere/" }));
        holder.close();

        const fetched = globalThis.fetch;
        globalThis.fetch = async (input, init) => {
          const url = String(input instanceof Request ? input.url : input);
          if (!url.includes("/raced/")) return fetched(input, init);
          if (url.endsWith("/files.json")) return Response.json(["mine.ttl"]);
          const other = await raw("cascade-pod:raced");
          await new Promise<void>((resolve, reject) => {
            const writing = other.transaction("files", "readwrite");
            writing
              .objectStore("files")
              .put(new TextEncoder().encode("theirs"), "theirs.ttl");
            writing.oncomplete = () => resolve();
            writing.onerror = () => reject(writing.error);
          });
          other.close();
          throw new TypeError("this copy failed");
        };
        const raced = await failure(openPod("raced", { from: "../raced/" }));
        globalThis.fetch = fetched;
        const kept = await raw("cascade-pod:raced");
        const paths = await new Promise<IDBValidKey[]>((resolve, reject) => {
          const keys = kept
            .transaction("files")
            .objectStore("files")
            .getAllKeys();
          keys.onsuccess = () => resolve(keys.result);
          keys.onerror = () => reject(keys.error);
        });
        kept.close();
        return { held, raced, kept: paths.map(String) };
      });
      await t.test(
        "says the pod has no files.json, naming its database, when another connection holds the database open",
        async () => {
          assert.match(outcome.held, /has no files\.json.*cascade-pod:held/);
        },
      );
      await t.test("rejects with the copy's own failure", async () => {
        assert.equal(outcome.raced, "this copy failed");
      });
      await t.test(
        "keeps the files another copy put in the database meanwhile",
        async () => {
          assert.deepEqual(outcome.kept, ["theirs.ttl"]);
        },
      );
    } finally {
      await context.close();
    }
  });
});

describe("Reading a pod as a person's record · try/pods/<pod>/", () => {
  test("with Alex Rivera's sample pod open", async (t) => {
    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      await page.route(ENGINE, () => {});
      await page.route(TABLE_ROWS, () => {});
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      const worth = await texts(page, ".worth li");
      const lines = view.worthALook(alex);
      assert.ok(lines.length > 0, "Alex's record has nothing worth a look");

      await t.test("names each place her records came from", async () => {
        assert.deepEqual(
          (await texts(page, ".chips li")).sort(),
          [
            ...new Set(
              (alex["entry/Where it came from"] ?? []).map(view.placeOf),
            ),
          ].sort(),
        );
      });
      await t.test(
        "lists what is worth a look in the app's sentences",
        async () => {
          assert.deepEqual(worth, lines.map(worthText));
        },
      );
      await t.test(`never says where a line "was recorded at"`, async () => {
        assert.ok(
          !worth.some((sentence) => /was recorded at /.test(sentence)),
          worth.join("\n"),
        );
      });
      await t.test("links each line worth a look to its entry", async () => {
        assert.deepEqual(
          await page.$$eval(".worth li a", (found) =>
            found.map((each) => each.getAttribute("href")),
          ),
          lines.map(({ entry }) => AT.entryLink(ALEX, view.entryId(entry))),
        );
      });
      await t.test("counts each kind's rows on its tile", async () => {
        assert.deepEqual(
          await tiles(page),
          new Map(
            view.SECTIONS.map((section: Section): [string, number] => [
              section.title,
              view.sectionRows(section, alex).length,
            ]).filter(([, count]) => count > 0),
          ),
        );
      });
    } finally {
      await context.close();
    }
  });

  test("with the lab results' box of Tamsin Vale's sample pod open", async (t) => {
    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.pod("tamsin-vale")}`);
      await settled(page);
      await page.waitForSelector('body[data-tables="ready"]', {
        timeout: 120_000,
      });
      await page.click('a.tile[href="#see-lab-results"]');
      const sort = (head: string): Promise<void> =>
        page.click(`#see-lab-results th button:has-text("${head}")`);

      const opened = await column(page, "Date");
      assert.ok(opened.length > 1);
      await sort("Date");
      const reversed = await column(page, "Date");
      await sort("Date");
      const reversedBack = await column(page, "Date");
      await t.test(
        "reverses the rows' order on a click on a heading, and again on the next",
        async () => {
          assert.deepEqual(reversed, [...opened].reverse());
          assert.deepEqual(reversedBack, opened);
        },
      );

      await sort("Value");
      const [first = ""] = await column(page, "Value");
      const rows = await texts(page, "#see-lab-results tbody tr");
      await page.fill("#see-lab-results .filter", first);
      const kept = await texts(page, "#see-lab-results tbody tr:not([hidden])");
      await t.test(
        "keeps only the rows holding the filter's text",
        async () => {
          assert.deepEqual(
            kept,
            rows.filter((row) =>
              row.toLowerCase().includes(first.toLowerCase()),
            ),
          );
          assert.ok(kept.length > 0, "the filter kept nothing");
          assert.ok(kept.length < rows.length, "the filter hid nothing");
        },
      );

      const open = (): Promise<boolean> => page.isVisible("#see-lab-results");
      await page.click("#see-lab-results h2");
      await t.test("stays open on a click inside it", async () => {
        assert.ok(await open(), "a click in the box closed it");
      });
      await page.mouse.click(5, 5);
      await t.test("closes on a click outside it", async () => {
        assert.ok(!(await open()), "a click outside the box left it open");
      });
      await page.click('a.tile[href="#see-lab-results"]');
      assert.ok(await open());
      await page.keyboard.press("Escape");
      await t.test("closes on Escape", async () => {
        assert.ok(!(await open()), "Escape left the box open");
      });
    } finally {
      await context.close();
    }
  });

  test("with lab values of different lengths", async (t) => {
    // Tamsin's values (8.3, 7.9, 7.4, 6.7, 6.5, 6.6) sort alike as text and as numbers; Marsh's differ in length.
    const { person, patients } = joined;
    const context = await browser.newContext();
    try {
      const marsh = watched(await context.newPage());
      await marsh.goto(`${served.url}${AT.home}`);
      await settled(marsh);
      await newPod(marsh, view.familyFirst(person));
      const [north = ""] = person.at.map(({ name }) => name);
      await allowAs(
        marsh,
        await signInAt(marsh, view.hospitalName(north)),
        patients.get(north) ?? "",
      );
      await bringIn(marsh);
      await marsh.click('a.tile[href="#see-lab-results"]');
      await marsh.click('#see-lab-results th button:has-text("Value")');
      const values = await column(marsh, "Value");
      const isNumber = (value: string): boolean =>
        value.trim() !== "" && Number.isFinite(Number(value));
      const numbers = values.filter(isNumber).map(Number);
      assert.ok(numbers.length > 1);
      assert.ok(
        new Set(numbers.map((each) => String(Math.trunc(each)).length)).size >
          1,
        "the values are all of one length, so a sort as text would pass",
      );
      await t.test(
        "sorts values as numbers, the numbers before any value that is none",
        async () => {
          assert.deepEqual(
            numbers,
            [...numbers].sort((a, b) => a - b),
          );
          assert.ok(values.slice(0, numbers.length).every(isNumber));
        },
      );
    } finally {
      await context.close();
    }
  });
});

/**
 * Each pod and its kept answers are a database in the browser, `cascade-pod:<name>` and `cascade-answers:<name>`,
 * so they are there on the next visit. File, Delete all data removes them; File, Reset all data brings the samples
 * back.
 */
describe("Keeping pods in the browser · indexedDB", () => {
  test("with a pod made in this browser, when all data is deleted and then reset", async (t) => {
    const MADE = "Hazel Thornbury";
    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await page.click('a[href="#new-pod"]');
      await page.fill(
        '#new-pod input[name="person"]:not([type="hidden"])',
        MADE,
      );
      await page.click('#new-pod button:has-text("Make the pod")');
      await settled(page);
      assert.equal(await page.textContent("main h1"), MADE);
      await page.reload();
      await settled(page);
      await t.test(
        "lists the made pod beside the samples after a reload",
        async () => {
          assert.deepEqual(
            (await texts(page, "nav a")).sort(),
            [
              "Alex Rivera",
              "Martin Okafor",
              "Priya Natarajan",
              "Tamsin Vale",
              MADE,
            ].sort(),
          );
        },
      );

      const before = await texts(page, "nav a");
      /** Opens File, picks `item`, and presses the confirming box's one button; waits for the page it draws in place. */
      const fromFile = async (item: string): Promise<void> => {
        await page.click('.menu summary:has-text("File")');
        await page.click(`.menu a:has-text(${JSON.stringify(item)})`);
        await inPlace(page, () => page.click(".dialog:target button"));
      };
      await fromFile("Delete all data");
      await t.test("empties the pods column on Delete all data", async () => {
        assert.deepEqual(await texts(page, "nav a"), []);
      });
      await t.test(
        "leaves no pod database and no answers database",
        async () => {
          assert.deepEqual(
            await page.evaluate(async () =>
              (await indexedDB.databases())
                .map(({ name }) => name ?? "")
                .filter((name) => /^cascade-(pod|answers):/.test(name)),
            ),
            [],
          );
        },
      );
      await t.test("says how many pods were deleted", async () => {
        assert.equal(await page.textContent("main h1"), "No pods yet");
        assert.equal(
          await page.textContent("main .note"),
          `Deleted ${before.length} pods.`,
        );
      });
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await t.test("still lists no pods on a later visit", async () => {
        assert.equal(await page.textContent("main h1"), "No pods yet");
        assert.deepEqual(await texts(page, "nav a"), []);
      });
      await fromFile("Reset all data");
      await t.test(
        "lists the four samples again on Reset all data",
        async () => {
          assert.deepEqual(await texts(page, "nav a"), [
            "Alex Rivera",
            "Martin Okafor",
            "Priya Natarajan",
            "Tamsin Vale",
          ]);
        },
      );
      await t.test("says which pods are back", async () => {
        assert.equal(
          await page.textContent("main .note"),
          "Reset: Alex Rivera, Martin Okafor, Priya Natarajan and Tamsin Vale are back.",
        );
      });
    } finally {
      await context.close();
    }
  });

  test("with an encrypted pod made in this browser, when the page is loaded again and asks for its six words", async (t) => {
    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await page.click('a[href="#new-pod"]');
      await page.check('#new-pod input[type="checkbox"]');
      await page.fill(
        '#new-pod input[name="person"]:not([type="hidden"])',
        "Ada Wren",
      );
      await page.click('#new-pod button:has-text("Make the pod")');
      await settled(page);
      const words = await page.locator(".words li").allTextContents();
      await page.getByLabel("Word 2").fill(words[1]!);
      await page.getByLabel("Word 5").fill(words[4]!);
      await page.click('button:has-text("Make the encrypted pod")');
      await settled(page);
      const pod = new URL(page.url());
      await page.goto(pod.href);
      await settled(page);
      await page
        .getByLabel("Your six words")
        .fill("one two three four five six");
      await page.click('button:has-text("Open this pod")');
      await settled(page);
      await t.test("refuses six words that are not the pod's", async () => {
        assert.match(
          (await page.textContent("main")) ?? "",
          /don't open this pod/,
        );
      });
      await page.getByLabel("Your six words").fill(words.join(" "));
      await page.click('button:has-text("Open this pod")');
      await settled(page);
      await t.test("opens the pod with its six words", async () => {
        assert.equal(await page.getByLabel("Your six words").count(), 0);
        assert.equal(await page.textContent("main h1"), "Ada Wren");
      });
    } finally {
      await context.close();
    }
  });

  test("when a person names a pod Con", async (t) => {
    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await page.click('a[href="#new-pod"]');
      await page.fill(
        '#new-pod input[name="person"]:not([type="hidden"])',
        "Con",
      );
      await page.click('#new-pod button:has-text("Make the pod")');
      await settled(page);
      await t.test(
        "draws Not done, saying Windows keeps that name for itself",
        async () => {
          assert.equal(await page.textContent("main h1"), "Not done");
          assert.match(
            (await page.textContent("main")) ?? "",
            /Windows keeps for itself/,
          );
        },
      );
    } finally {
      await context.close();
    }
  });
});

/** The menus lead back to the hub, the site that lists the Cascade projects, and to this repository's code. */
describe("Menus and the About box · File, Help, #about", () => {
  test("with try/ open", async (t) => {
    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await t.test("links The code to this repository", async () => {
        assert.equal(
          await page.getAttribute('#about a:has-text("The code")', "href"),
          "https://github.com/jayostis/cascade-starter-kit",
        );
      });
      const hubLinks = (on: Page): Promise<(string | null)[]> =>
        on.$$eval(
          '.menu a:has-text("Cascade pods"), #about a:has-text("Cascade pods")',
          (found) => found.map((each) => each.getAttribute("href")),
        );
      const loaded = watched(await context.newPage());
      await loaded.goto(`${served.url}${AT.pod(ALEX)}#about`);
      await settled(loaded);
      await t.test(
        "leads back to the hub from the Help menu and from the About box",
        async () => {
          assert.deepEqual(
            await hubLinks(page),
            [HUB, HUB],
            "the Help menu and the About box lead back to the hub",
          );
          assert.deepEqual(
            await hubLinks(loaded),
            [HUB, HUB],
            "a pod's own page leads back to the hub too",
          );
        },
      );
      const openMenus = (): Promise<string[]> =>
        texts(page, "details.menu[open] > summary");
      await page.click('.menu summary:has-text("File")');
      await page.click('.menu summary:has-text("Help")');
      await t.test("closes File when Help is opened", async () => {
        assert.deepEqual(
          await openMenus(),
          ["Help"],
          "opening Help left File open",
        );
      });
      await page.keyboard.press("Escape");
      await t.test("closes an open menu on Escape", async () => {
        assert.deepEqual(await openMenus(), [], "Escape left a menu open");
      });
      await t.test(
        "shows the About box on a page loaded at its address",
        async () => {
          assert.equal(
            await loaded.isVisible("#about"),
            true,
            "a page loaded at a box's address shows the box",
          );
        },
      );
    } finally {
      await context.close();
    }
  });
});

/**
 * In a browser a person picks a folder or a file; `pod.look()` and `pod.import()` take the picked files where Node
 * takes a path. The Bridge, which converts an export by its adapter, runs in a Web Worker so the page stays live.
 */
describe("Importing files a person picks · pod.look(), pod.import()", () => {
  test("when a person picks an Apple Health export's folder, then a C-CDA file", async (t) => {
    const config = await servedConfig();
    const packed = JSON.parse(
      await readFile(join(SERVED, "packed.json"), "utf8"),
    ) as {
      readonly components: readonly {
        readonly repository: string;
        readonly commit: string;
      }[];
    };
    const carried = packed.components.map(
      ({ repository, commit }) => `${repository}/tree/${commit}/`,
    );
    const vocabulary = packed.components.find(
      ({ repository }) => repository === config.vocabulary.repository,
    );
    assert.ok(vocabulary);
    const { repository } = config.vocabulary;
    const kits = join(
      SERVED,
      repository.slice(repository.lastIndexOf("/") + 1),
      vocabulary.commit,
      "conformance",
    );
    const picked = [
      join(
        kits,
        "alex-rivera/scripted-input/alex/downloads/x-e2/apple_health_export",
      ),
      join(
        kits,
        "priya-natarajan/scripted-input/priya/downloads/kestrel-harbor-health-summary.xml",
      ),
    ];

    const node = await pageTablesPod();
    const expected: { look: unknown; after: After }[] = [];
    try {
      for (const path of picked)
        expected.push({
          look: await node.look(path),
          after: await shownAfter(
            node,
            await node.import(path, { claimProfiles: true }),
            QUESTIONS,
          ),
        });
    } finally {
      await node.close();
    }

    const page = watched(await browser.newPage());
    try {
      await page.addInitScript(() => {
        const loads: string[] = [];
        (globalThis as unknown as { bridgeLoads: string[] }).bridgeLoads =
          loads;
        const post = Worker.prototype.postMessage as (
          this: Worker,
          ...args: unknown[]
        ) => void;
        Worker.prototype.postMessage = function (
          this: Worker,
          message: unknown,
          ...rest: unknown[]
        ) {
          const request = (
            message as {
              request?: {
                op?: string;
                adapter?: { iri: string };
                vocabulary?: { iri: string };
              };
            }
          )?.request;
          if (request?.op === "load")
            loads.push(
              ...[request.adapter?.iri, request.vocabulary?.iri].flatMap(
                (iri) => iri ?? [],
              ),
            );
          return post.call(this, message, ...rest);
        };
      });
      let workers = 0;
      page.on("worker", (worker) => {
        if (worker.url().endsWith("/wasm-worker.js")) workers += 1;
      });
      const tablesWorker = page.waitForEvent("worker", {
        predicate: (worker) => worker.url().endsWith("/tables-worker.js"),
        timeout: 120_000,
      });
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await tablesWorker;
      await page.evaluate(() => {
        for (const [id, folder] of [
          ["pick-folder", true],
          ["pick-file", false],
        ] as const) {
          const input = document.createElement("input");
          input.type = "file";
          input.id = id;
          input.webkitdirectory = folder;
          document.body.append(input);
        }
      });
      const [folder = "", file = ""] = picked;
      await page.setInputFiles("#pick-folder", folder);
      await page.setInputFiles("#pick-file", file);
      await page.evaluate(async () => {
        const { openPod } = (await import(
          "cascade-runtime" as string
        )) as typeof import("cascade-runtime");
        (globalThis as unknown as { pod: Pod }).pod = await openPod();
      });

      const adapters = config.adapters.map(
        ({ repository }) =>
          carried.find((iri) => iri.startsWith(`${repository}/tree/`)) ?? "",
      );
      /** What each pick's look and import gave, the workers started once the first look was done, and the adapters loaded by the end of each import. */
      const looks: unknown[] = [];
      const imports: After[] = [];
      let workersAfterLook = -1;
      const loadedAfter: Set<string>[] = [];
      for (const [at, id] of ["pick-folder", "pick-file"].entries()) {
        looks.push(
          await page.evaluate(async (id) => {
            const input = document.getElementById(id) as HTMLInputElement;
            const files = new Map(
              [...(input.files ?? [])].map((file) => [
                file.webkitRelativePath || file.name,
                file,
              ]),
            );
            (globalThis as unknown as { picked: Map<string, File> }).picked =
              files;
            return (globalThis as unknown as { pod: Pod }).pod.look(files);
          }, id),
        );
        if (at === 0) workersAfterLook = workers;
        imports.push(
          await page.evaluate(
            async ({ questions, source }) => {
              const scope = globalThis as unknown as {
                pod: Pod;
                picked: Map<string, File>;
              };
              const run = new Function(`return ${source}`)() as (
                pod: Pod,
                imported: Imported,
                questions: readonly string[],
              ) => Promise<After>;
              return run(
                scope.pod,
                await scope.pod.import(scope.picked, { claimProfiles: true }),
                questions,
              );
            },
            { questions: QUESTIONS, source: shownAfter.toString() },
          ),
        );
        loadedAfter.push(
          new Set(
            (
              await page.evaluate(
                () =>
                  (globalThis as unknown as { bridgeLoads: string[] })
                    .bridgeLoads,
              )
            ).filter((iri) => adapters.includes(iri)),
          ),
        );
      }
      const loads = await page.evaluate(
        () => (globalThis as unknown as { bridgeLoads: string[] }).bridgeLoads,
      );

      await t.test(
        "returns from `pod.look()` what Node returns for the same path",
        async () => {
          assert.deepEqual(
            looks,
            expected.map(({ look }) => look),
          );
        },
      );
      await t.test("starts no worker for a look", async () => {
        assert.equal(workersAfterLook, 0, "a look started a worker");
      });
      await t.test(
        "answers the same questions after `pod.import()` with the rows Node's import gives",
        async () => {
          assert.deepEqual(
            imports,
            expected.map(({ after }) => after),
          );
        },
      );
      await t.test(
        "starts the Bridge's worker on the first import",
        async () => {
          assert.ok(workers > 0, "no import started a worker");
        },
      );
      const [first, both] = loadedAfter;
      await t.test("loads one adapter for the first import", async () => {
        assert.equal(
          first?.size,
          1,
          `the first import loaded ${[...(first ?? [])]}`,
        );
      });
      await t.test(
        "loads each adapter the app follows once both kinds are imported",
        async () => {
          assert.deepEqual(both, new Set(adapters));
        },
      );
      await t.test(
        "loads only adapters and a vocabulary the package carries",
        async () => {
          for (const iri of loads) assert.ok(carried.includes(iri), iri);
        },
      );
    } finally {
      await page.close();
    }
  });
});

/**
 * A demo hospital is a pretend hospital the app serves itself; in try/ a service worker serves it. A person signs in
 * in a popup, picks a patient and allows; the connection's box says what the hospital holds and brings it into the pod.
 */
describe("Connecting to a demo hospital · Sign in at", () => {
  test("when a demo person's new pod signs in at both of their hospitals in try/", async (t) => {
    const { person, patients, has } = joined;
    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      const said: string[] = [];
      page.on("console", (message) => said.push(message.text()));
      const secrets = new Set<string>();
      page.on("request", (request) => {
        const bearer = /^Bearer (.+)$/.exec(
          request.headers().authorization ?? "",
        );
        if (bearer?.[1]) secrets.add(bearer[1]);
      });
      /** The scope each sign-in popup asked for. */
      const scopes: string[] = [];
      const signIn = async (hospital: string, again = false): Promise<Page> => {
        const popup = await signInAt(page, view.hospitalName(hospital), again);
        popup.on("framenavigated", (frame) => {
          const code = new URL(frame.url()).searchParams.get("code");
          if (code) secrets.add(code);
        });
        scopes.push(new URL(popup.url()).searchParams.get("scope") ?? "");
        return popup;
      };
      /** Waits for the connection's box over the pod's page, open, with the pod's page behind it. */
      const boxed = async (): Promise<void> => {
        await settled(page);
        assert.ok(await page.isVisible("#connection"), "the box is not open");
        assert.equal(await page.textContent("main h1"), person.name);
      };
      const failed = async (): Promise<string> => {
        await boxed();
        const text =
          (await page.textContent("#connection .card .detail")) ?? "";
        await page.goto(page.url().split("#")[0] ?? "");
        await settled(page);
        return text;
      };

      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await newPod(page, view.familyFirst(person));
      assert.equal(await page.textContent("main h1"), person.name);
      await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
      );
      await t.test(
        "serves the hospitals from try/'s own service worker",
        async () => {
          assert.match(
            (await page.evaluate(
              () => navigator.serviceWorker.controller?.scriptURL,
            )) ?? "",
            AT.worker,
          );
        },
      );

      const [north = "", south = ""] = person.at.map(({ name }) => name);
      const cancelled = await signIn(north);
      const cancelledCloses = cancelled.waitForEvent("close");
      await cancelled.click('button[value="cancel"]');
      await cancelledCloses;
      await boxed();
      const cancelledSaid =
        (await page.textContent("#connection [role=alert]")) ?? "";
      const again = await signIn(north, true);
      const againCloses = again.waitForEvent("close");
      await again.click('button[value="cancel"]');
      const againSaid = await failed();
      await againCloses;
      await t.test(
        "says the sign-in was cancelled, naming the hospital, when the person cancels",
        async () => {
          assert.match(cancelledSaid, /Cascade North.*cancelled/);
          assert.match(againSaid, /cancel/);
        },
      );

      const closed = await signIn(north);
      await closed.close();
      const closedSaid = await failed();
      await t.test(
        "says the popup was closed when the person closes it",
        async () => {
          assert.match(closedSaid, /closed/);
        },
      );

      /** A box over the pod's page, by its address, and the text typed into its filter after the first record came in. */
      let box = "";
      let filter = "";
      /** What the connection's box said of each hospital, and how many alerts it showed for the first. */
      const holds: string[][] = [];
      let alerts = -1;
      const doings: (string | null)[] = [];
      const bringings: string[][] = [];
      const brought: (string | null)[] = [];
      const boxLeft: boolean[] = [];
      for (const hospital of [north, south]) {
        const allowed = await signIn(hospital);
        await page.evaluate(() => {
          const frame = document.createElement("iframe");
          frame.src = `data:text/html,<script>parent.postMessage({ type: "cascade-runtime:signed-in", url: "${location.origin}/try/signed-in.html?code=forged&state=forged" }, "*")</script>`;
          document.body.append(frame);
        });
        await allowAs(page, allowed, patients.get(hospital) ?? "");
        await boxed();
        if (hospital === north)
          alerts = await page.locator("#connection [role=alert]").count();
        holds.push(
          (await texts(page, "#connection .card p")).filter((line) =>
            line.startsWith("What "),
          ),
        );
        await page.evaluate(() => {
          const seen: string[] = [];
          Object.assign(globalThis, { bringing: seen });
          new MutationObserver(() => {
            const now = document.querySelector("#connection .steps li.now");
            const text = now?.textContent ?? "";
            if (text.startsWith("Bringing it in") && seen.at(-1) !== text)
              seen.push(text);
          }).observe(document.body, {
            childList: true,
            characterData: true,
            subtree: true,
          });
        });
        await page.click("#connection button:has-text('Bring it into')");
        doings.push(await page.textContent(".doing:not([hidden])"));
        // A bring takes 70 s and more in Chromium on CI (#131, step 6 measures it): the second one passed 120 s.
        await settled(page, 300_000);
        brought.push(await page.textContent("main .note"));
        bringings.push(
          await page.evaluate(
            () => (globalThis as unknown as { bringing: string[] }).bringing,
          ),
        );
        boxLeft.push((await page.$("#connection")) === null);
        if (hospital === north) {
          box = (await page.getAttribute(".tiles .tile", "href")) ?? "";
          await page.click(`.tiles .tile[href="${box}"]`);
          filter = (await page.textContent(`${box} tbody td`)) ?? "";
          await page.fill(`${box} .filter`, filter);
          await page.mouse.click(5, 5);
        }
      }

      await t.test("asks for the scope `patient/*.rs`", async () => {
        assert.equal(scopes.length, 5, "the test saw every sign-in");
        for (const scope of scopes)
          assert.ok(
            scope.split(" ").includes("patient/*.rs"),
            `the sign-in asks for ${scope}`,
          );
      });
      await t.test(
        "ignores a signed-in message another frame forges",
        async () => {
          assert.equal(alerts, 0, "the box shows a failure");
          assert.deepEqual(holds[0], has.get(north));
        },
      );
      await t.test(
        "says what each hospital holds as Node's `pod.look()` says it",
        async () => {
          assert.deepEqual(holds, [has.get(north), has.get(south)]);
        },
      );
      await t.test(
        `says "Bringing the record in…" while it brings`,
        async () => {
          assert.deepEqual(doings, [
            "Bringing the record in…",
            "Bringing the record in…",
          ]);
        },
      );
      await t.test(
        "reports the bring's steps in order: loading the adapter, converting, saving, judging",
        async () => {
          // The page follows the connection by asking for its latest state, so a step the bring leaves before the
          // page asks again is never drawn: the steps it drew are held to the order, not to all four.
          const steps = [
            "loading the adapter",
            "converting",
            "saving",
            "judging",
          ];
          for (const bringing of bringings) {
            const drawn = [
              ...new Set(
                bringing.flatMap(
                  (line) => /^Bringing it in: ([a-z ]+)/.exec(line)?.[1] ?? [],
                ),
              ),
            ];
            assert.ok(drawn.length > 0, bringing.join("\n"));
            assert.deepEqual(
              drawn,
              steps.filter((step) => drawn.includes(step)),
              bringing.join("\n"),
            );
          }
        },
      );
      await t.test(
        `says "Brought in the record from" the hospital`,
        async () => {
          assert.deepEqual(
            brought,
            [north, south].map(
              (hospital) =>
                `Brought in the record from ${view.hospitalName(hospital)}.`,
            ),
          );
        },
      );
      await t.test("closes the connection's box", async () => {
        assert.deepEqual(boxLeft, [true, true], "the box is still there");
      });
      await t.test(
        "keeps an open box's filter as the second record comes in",
        async () => {
          assert.equal(await page.inputValue(`${box} .filter`), filter);
          const rows = await page.$$eval(`${box} tbody tr`, (shown) =>
            shown.map((row) => [
              (row as HTMLElement).hidden,
              row.textContent ?? "",
            ]),
          );
          for (const [hidden, text] of rows)
            assert.equal(
              hidden,
              !String(text).toLowerCase().includes(filter.toLowerCase()),
              `the filter did not survive the import: ${String(text)}`,
            );
        },
      );

      await page.waitForSelector('body[data-tables="ready"]', {
        timeout: 120_000,
      });
      // Node's look gives the lines that need no table; the tables add the one lisinopril line.
      const lines = await page.$$eval(".worth li", (found) =>
        found.map((each) => ({
          text: each.textContent ?? "",
          href: each.querySelector("a")?.getAttribute("href") ?? "",
        })),
      );
      const lisinopril =
        /lisinopril 10 .* and lisinopril 20 .* share an ingredient, lisinopril/i;
      const own = lines.filter(({ text }) => !lisinopril.test(text));
      await t.test(
        "lists what is worth a look as Node does, each line linked to its entry",
        async () => {
          assert.deepEqual(
            own.map(({ text }) => text),
            joined.worth,
          );
          assert.deepEqual(
            own.map(({ href }) => href),
            joined.worthLinks,
          );
        },
      );
      await t.test(
        "says once, from the reference tables, that two doses share an ingredient",
        async () => {
          assert.equal(
            lines.filter(({ text }) => lisinopril.test(text)).length,
            1,
            "Worth a look has no line, or two, for the two lisinopril doses",
          );
        },
      );
      const rowsIn = (box: string): Promise<string[]> =>
        texts(page, `#see-${box} tbody tr`);
      const medicines = await rowsIn("medications");
      await t.test(
        "joins a brand and its generic into one medication",
        async () => {
          assert.equal(
            medicines.filter((row) => /loratadine/i.test(row)).length,
            1,
            `Claritin and loratadine are one medicine, among ${medicines.join("; ")}`,
          );
          assert.ok(
            !medicines.some((row) => /claritin/i.test(row)),
            "a brand row",
          );
        },
      );
      const allergies = await rowsIn("allergies");
      await t.test(
        "joins the two amoxicillin allergies and leaves penicillin apart",
        async () => {
          assert.equal(
            allergies.filter((row) => /amoxicillin/i.test(row)).length,
            1,
            `the two amoxicillin allergies are one, among ${allergies.join("; ")}`,
          );
          assert.equal(
            allergies.length,
            (joined.held.get("AllergyIntolerance") ?? 0) - 1,
            `exactly the two amoxicillin allergies join, among ${allergies.join("; ")}`,
          );
          assert.ok(
            allergies.some((row) => /penicillin/i.test(row)) &&
              !allergies.some(
                (row) => /penicillin/i.test(row) && /amoxicillin/i.test(row),
              ),
            `penicillin stays apart from amoxicillin, among ${allergies.join("; ")}`,
          );
        },
      );
      await t.test(
        "never shows a token or an authorization code in the page or the console",
        async () => {
          assert.ok(secrets.size >= 2, "the test saw no token or no code");
          const shown = await page.content();
          for (const secret of secrets) {
            assert.ok(
              !shown.includes(secret),
              "the page shows a token or a code",
            );
            assert.ok(
              !said.some((line) => line.includes(secret)),
              "the console shows a token or a code",
            );
          }
        },
      );

      const both = [north, south].map(view.hospitalName);
      const pod = view.slug(person.name);
      const atBoth = joined.seenAtBoth;
      assert.ok(atBoth, `no entry was seen at both ${both.join(" and ")}`);
      await page.goto(`${served.url}${AT.entry(pod, view.entryId(atBoth))}`);
      await settled(page);
      const recorded = await page
        .locator("main li", { hasText: "Cascade recorded it at" })
        .innerText({ timeout: 60_000 });
      await t.test(
        "names both hospitals on an entry both recorded",
        async () => {
          for (const name of both)
            assert.ok(
              recorded.includes(name),
              `${name} is not in: ${recorded}`,
            );
        },
      );

      await page.goto(`${served.url}${AT.pod(pod)}`);
      await settled(page);
      await page.waitForSelector('body[data-tables="ready"]', {
        timeout: 120_000,
      });
      await page.click('a.tile[href="#see-medications"]');
      await inPlace(page, () =>
        page
          .locator("#see-medications tbody td:first-child a", {
            hasText: "oratadine",
          })
          .first()
          .click(),
      );
      const matched = await page
        .locator("main li .from", { hasText: "Matched using" })
        .first()
        .innerText({ timeout: 60_000 });
      await t.test(
        "names the table and version a joined medication was matched using",
        async () => {
          assert.match(
            matched,
            /^Matched using .+, version \S+/,
            `the joined medication does not name the table and version: ${matched}`,
          );
        },
      );
    } finally {
      await context.close();
    }
  });

  test("with a browser where the demo hospitals' service worker cannot run", async (t) => {
    const { person: ines, hospital: north } =
      await demoPatient("Ines Calloway");

    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await newPod(page, view.familyFirst(ines));
      await page.click(
        `button:has-text("Sign in at ${view.hospitalName(north.name)}")`,
      );
      const box = page.locator("#connection");
      await box.waitFor();
      await settled(page);
      const said = (await box.textContent()) ?? "";
      await t.test("says why in the connection's box", async () => {
        assert.ok(said.trim().length > 0, "the box says nothing");
      });
      await t.test("never blames the hospital", async () => {
        assert.ok(!said.includes("refused the sign-in"), said);
      });
      await t.test("offers no Sign in again", async () => {
        assert.ok(!said.includes("Sign in again"), said);
        assert.equal(await box.locator("button").count(), 0, said);
      });
    } finally {
      await context.close();
    }
  });

  test("when the patient signed in as is not the pod's person", async (t) => {
    const { person: rowan } = await demoPatient("Rowan Ellery Marsh", false);
    const { hospital: north, patient } = await demoPatient(
      "Odalys Brandt",
      false,
    );

    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await newPod(page, view.familyFirst(rowan));
      await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
      );
      await allowAs(
        page,
        await signInAt(page, view.hospitalName(north.name)),
        patient,
      );
      await t.test(
        "warns that the record is the patient's, not the pod's person's",
        async () => {
          assert.equal(
            (await page.textContent("#connection .note.warm"))?.trim(),
            "This record is Odalys Brandt's, not Rowan Ellery Marsh's.",
          );
        },
      );
      await t.test("offers only a button that names both", async () => {
        assert.deepEqual(
          await page.$$eval("#connection button", (found) =>
            found.map((each) => each.textContent?.trim()),
          ),
          [
            "Bring Odalys Brandt's records into Rowan Ellery Marsh's pod anyway",
          ],
        );
      });
      await page.click("#connection button.quiet:has-text('anyway')");
      await settled(page, 300_000);
      await t.test("brings the record in from that button", async () => {
        assert.ok(
          (await tiles(page)).size > 0,
          "the pod's page shows no record",
        );
      });
    } finally {
      await context.close();
    }
  });
});

/**
 * The world's date makes the demo hospitals answer with their records as they stood at the end of that day, so a developer can pull the same patient at two points of a story. Today takes it away.
 */
describe("Setting the world's date · .world-date", () => {
  test("when the world's date is set before a sign-in", async (t) => {
    const {
      person: ines,
      hospital: north,
      patient,
    } = await demoPatient("Ines Calloway");

    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      const box = page.locator("#connection");
      /** The sign-in page in a popup, and the date its line says records stood on, if it has one. */
      const signInPage = async (
        allow: boolean,
      ): Promise<string | null | undefined> => {
        const popup = await signInAt(page, view.hospitalName(north.name));
        const line = popup.locator("p.as-of time");
        const stood =
          (await line.count()) === 0
            ? undefined
            : await line.getAttribute("datetime");
        if (allow) {
          await popup.check(`input[name="patient"][value="${patient}"]`);
          await popup.click('button[value="allow"]');
        } else await popup.close();
        return stood;
      };
      const world = page.locator(".world-date");
      const worldSays = (what: string) =>
        page.waitForFunction(
          (text) =>
            document
              .querySelector(".world-date")
              ?.textContent?.includes(text) ?? false,
          what,
        );
      const boxSays = async () => (await box.textContent()) ?? "";
      /** Closes the connection's box, and sets the world's date to a day, or with undefined takes it away. */
      const setDate = async (day: string | undefined) => {
        if ((await box.count()) > 0) await box.locator("a.close").click();
        await settled(page);
        await setWorldDate(page, day);
      };
      const everything = /Hospitals answer with everything they hold\./;
      const asOfFeb = /Hospitals answer as of 1 February 2024\./;

      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await newPod(page, view.familyFirst(ines));
      await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
      );
      await worldSays("Hospitals answer with everything they hold.");
      await t.test(
        "says the hospitals answer with everything they hold, with no date set",
        async () => {
          assert.match((await world.textContent()) ?? "", everything);
        },
      );
      const unset = await signInPage(true);
      await t.test(
        "shows no date on the hospital's sign-in page with none set",
        async () => {
          assert.equal(unset, undefined);
        },
      );
      await settled(page);
      await t.test(
        "says no date in the connection's box with none set",
        async () => {
          assert.ok(!(await boxSays()).includes("Pulled as of"));
        },
      );

      await setDate("2024-02-01");
      await worldSays("Hospitals answer as of 1 February 2024.");
      await t.test(
        "says the date the hospitals answer as of, once one is set",
        async () => {
          assert.match((await world.textContent()) ?? "", asOfFeb);
        },
      );

      const cdp = await context.newCDPSession(page);
      await cdp.send("ServiceWorker.enable");
      await cdp.send("ServiceWorker.stopAllWorkers");
      await page.goto(`${served.url}${AT.pod("ines-calloway")}`);
      await settled(page);
      await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
      );
      await worldSays("Hospitals answer as of 1 February 2024.");
      await t.test(
        "keeps the date when the service worker is stopped",
        async () => {
          assert.match((await world.textContent()) ?? "", asOfFeb);
        },
      );
      const dated = await signInPage(true);
      await t.test(
        "shows the date on the hospital's sign-in page",
        async () => {
          assert.equal(dated, "2024-02-01T23:59:59Z");
        },
      );
      await settled(page);
      await t.test(
        "says in the connection's box the date the pull was made under",
        async () => {
          assert.ok(
            (await boxSays()).includes("Pulled as of 1 February 2024."),
          );
        },
      );

      await setDate(undefined);
      await worldSays("Hospitals answer with everything they hold.");
      const cleared = await signInPage(false);
      await t.test("clears the date from Today", async () => {
        assert.match((await world.textContent()) ?? "", everything);
        assert.equal(cleared, undefined);
      });

      /** What try/ says once it has drawn a page it called "Not done", as a page it drew ready, not as something gone wrong. */
      const notDone = async () => {
        await settled(page);
        return {
          heading: await page.textContent("main h1"),
          text: (await page.textContent("main")) ?? "",
        };
      };
      await settled(page);
      await inPlace(page, () => box.locator("a.close").click());
      await world.locator("details").evaluate((details: HTMLDetailsElement) => {
        details.open = true;
      });
      await world
        .locator('input[type="date"]')
        .evaluate((input: HTMLInputElement) => {
          input.type = "text";
          input.value = "soon";
        });
      await world.getByRole("button", { name: "Set", exact: true }).click();
      const soon = await notDone();
      await t.test(
        "draws Not done, saying why, for a typed date that is no date",
        async () => {
          assert.equal(soon.heading, "Not done");
          assert.match(soon.text, /"soon" is not a date/);
        },
      );

      await page.goto(`${served.url}${AT.pod("ines-calloway")}`);
      await settled(page);
      await setDate("2024-02-01");
      await worldSays("Hospitals answer as of 1 February 2024.");
      await page.reload();
      await settled(page);
      await setDate(undefined);
      await settled(page);
      await t.test(
        "clears the date from Today as the first step after a reload at the address a Set left",
        async () => {
          assert.match((await world.textContent()) ?? "", everything);
        },
      );
    } finally {
      await context.close();
    }
  });

  test("when Tamsin Vale's record is brought in at her story's first pull, then again today", async (t) => {
    const story = (await loadStories()).find(({ pulls }) => pulls?.length);
    assert.ok(story?.pulls, "no story names its pulls");
    const [finding] = story.findings;
    assert.ok(finding?.kind === "after stop", "the story's finding is no stop");
    const [first] = story.pulls;
    assert.ok(
      first && Date.parse(first.asOf) < Date.parse(finding.date),
      "the story's first pull is not before the stop",
    );
    const north = await loadHospital(story.hospital);

    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      /** Sets the date the demo hospitals answer as of to the day of `asOf`, or with none to today, by the pod's page's own form. */
      const world = async (asOf: string | undefined) => {
        await setWorldDate(page, asOf?.slice(0, 10));
        await settled(page);
      };
      /** Signs the pod in at North as the story's patient, from Find a hospital, and brings the record in. */
      const signInAndBringIn = async () => {
        await page.click('a:has-text("Find a hospital")');
        await settled(page);
        const [popup] = await Promise.all([
          page.waitForEvent("popup"),
          page.click(
            `.card:has(h2:text-is(${JSON.stringify(view.hospitalName(north.hospital.name))})) button`,
          ),
        ]);
        await popup.waitForSelector('button[value="allow"]');
        await allowAs(page, popup, story.patient);
        await page.click("#connection button:has-text('Bring')");
        await settled(page, 300_000);
      };
      const metformin = async () =>
        (await texts(page, "#see-medications tbody tr")).filter((row) =>
          /metformin/i.test(row),
        );

      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await page.click('a[href="#new-pod"]');
      await page.fill(
        '#new-pod input[name="person"]:not([type="hidden"])',
        "Tamsin at North",
      );
      await page.click('#new-pod button:has-text("Make the pod")');
      await settled(page);
      await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
      );

      assert.equal(
        await page.locator("h1").first().innerText(),
        "Tamsin at North",
      );

      await world(first.asOf);
      await signInAndBringIn();
      const [taken, ...more] = await metformin();
      await t.test(
        "lists metformin as active at the first pull's date",
        async () => {
          assert.deepEqual(more, []);
          assert.match(taken ?? "", /Active/, "metformin is not taken");
        },
      );
      await page
        .locator(".changes", { hasText: "Nothing stands out yet." })
        .waitFor({ timeout: 60_000 });
      await t.test(
        "draws no change card at the first pull's date",
        async () => {
          assert.equal(await page.locator(".change").count(), 0);
        },
      );

      await world(undefined);
      await signInAndBringIn();
      const [stopped, ...others] = await metformin();
      await t.test(
        "lists metformin as stopped once brought in again today",
        async () => {
          assert.deepEqual(others, []);
          assert.match(stopped ?? "", /Stopped/, "metformin is still taken");
        },
      );
      const card = page.locator(".change");
      await card.first().waitFor({ timeout: 60_000 });
      await t.test("says what changed after it stopped", async () => {
        assert.equal(await card.count(), 1);
        assert.match(
          (await card.innerText()).replace(/\s+/g, " "),
          /was higher after .+ stopped\./,
        );
      });
    } finally {
      await context.close();
    }
  });
});

/**
 * Once the reference tables are loaded the app names each record by what its code's table says, joins codes a table
 * ties, tags a retired code, and opens a code's panel and class pages.
 */
describe("Naming records by the reference tables · try/tables/", () => {
  test("with Tobias Fenn's record brought in from North", async (t) => {
    const { person, patients, held } = tobias;
    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await newPod(page, view.familyFirst(person));
      const [north = ""] = person.at.map(({ name }) => name);
      await allowAs(
        page,
        await signInAt(page, view.hospitalName(north)),
        patients.get(north) ?? "",
      );
      await bringIn(page);
      await page.waitForSelector('body[data-tables="ready"]', {
        timeout: 120_000,
      });
      const rowsIn = (box: string): Promise<string[]> =>
        texts(page, `#see-${box} tbody tr`);
      const retired = (row: string): boolean => row.includes("Retired code");

      const conditions = await rowsIn("conditions");
      await t.test(
        "names his hip condition once, by ICD-10-CM, for the retired code and the one that replaced it",
        async () => {
          const hip = conditions.filter((row) =>
            row.includes("Periprosthetic"),
          );
          assert.equal(hip.length, 1, conditions.join("; "));
          assert.ok(
            !conditions.some((row) => row.includes("hip replacement")),
            "a row keeps the record's own text, not ICD-10-CM's name",
          );
          assert.ok(
            conditions.length < (held.get("Condition") ?? 0),
            "the two codes of the hip condition were not joined into one entry",
          );
        },
      );

      const vaccines = await rowsIn("immunizations");
      await t.test(
        "tags the retired CVX code of his hepatitis A vaccine",
        async () => {
          const hepA = vaccines.filter((row) => row.includes("Hep A"));
          assert.equal(hepA.length, 1, vaccines.join("; "));
          assert.ok(retired(hepA[0] ?? ""), hepA.join("; "));
        },
      );
      const hdl = (await rowsIn("lab-results")).filter((row) =>
        /Cholesterol.in HDL/.test(row),
      );
      await t.test(
        "lists a retired LOINC code and its replacement as two rows",
        async () => {
          assert.equal(hdl.length, 2, hdl.join("; "));
        },
      );
      await t.test("tags only the retired one of the two", async () => {
        const [old, current] = [
          hdl.filter((row) => /Deprecated/.test(row)),
          hdl.filter((row) => !/Deprecated/.test(row)),
        ];
        assert.equal(old?.length, 1, hdl.join("; "));
        assert.ok(old?.every(retired), `the Deprecated row is tagged: ${hdl}`);
        assert.ok(
          current?.every((row) => !retired(row)),
          `the current row is untagged: ${hdl}`,
        );
      });

      const engine: Route[] = [];
      await page.route(ENGINE, (route) => {
        engine.push(route);
      });
      await page.goto(`${served.url}${AT.pod(view.slug(person.name))}`);
      await settled(page);
      await page.evaluate(watchLate);
      const world = page.locator(".world-date");
      await world.locator("details").evaluate((details: HTMLDetailsElement) => {
        details.open = true;
      });
      await world.locator('input[type="date"]').fill("2024-02-01");
      await world.getByRole("button", { name: "Set", exact: true }).click();
      await page.waitForFunction(() =>
        document
          .querySelector(".world-date")
          ?.textContent?.includes("Hospitals answer as of 1 February 2024."),
      );
      await page.unroute(ENGINE);
      for (const route of engine) await route.continue().catch(() => undefined);
      await settled(page);
      await page.waitForSelector('body[data-tables="ready"]', {
        timeout: 120_000,
      });
      await page.waitForFunction(
        () => document.querySelector('main [aria-busy="true"]') === null,
      );
      const late = await page.evaluate(
        () => (globalThis as unknown as Late).late,
      );
      await t.test(
        "draws nothing again after the page says it is ready, when the world's date is set while the engine loads",
        async () => {
          assert.deepEqual(
            late,
            [],
            "the pod's page was drawn again after it said it was ready",
          );
        },
      );
    } finally {
      await context.close();
    }
  });

  test("with Priya Natarajan's sample pod, once the tables are ready", async (t) => {
    const context = await browser.newContext();
    await context.addInitScript(recordDraws);
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await page.waitForSelector('body[data-tables="ready"]', {
        timeout: 60_000,
      });
      await page.goto(
        `${served.url}${AT.pod("priya-natarajan")}#see-lab-results`,
      );
      await settled(page);
      await page.waitForSelector('body[data-tables="ready"]', {
        timeout: 120_000,
      });
      const tests = (
        await page
          .locator("#see-lab-results tbody td:first-child")
          .allInnerTexts()
      ).map((text) => text.trim());
      await t.test(
        "names her potassium result by LOINC, not by the record's own name",
        async () => {
          assert.ok(
            tests.includes("Potassium [Moles/volume] in Serum or Plasma"),
            `no potassium result is named by LOINC among ${tests.join("; ")}`,
          );
          assert.ok(
            !tests.includes("Potassium"),
            "a result keeps the record's own name",
          );
        },
      );
      await inPlace(page, () =>
        page
          .locator("#see-lab-results tbody td:first-child a", {
            hasText: "Potassium",
          })
          .first()
          .click(),
      );
      await page.waitForSelector("text=In LOINC panels", { timeout: 60_000 });
      await inPlace(page, () =>
        page.locator('main a[href$="24326-1"]').click(),
      );
      await page.waitForFunction(
        () =>
          document
            .querySelector("main h1")
            ?.textContent?.startsWith("Your results in"),
        undefined,
        { timeout: 120_000 },
      );
      await t.test(
        "opens the electrolytes panel from her potassium result",
        async () => {
          const { pathname, searchParams } = new URL(page.url());
          assert.equal(pathname, "/try/pods/priya-natarajan/panel");
          assert.match(searchParams.get("panel") ?? "", /24326-1$/);
          assert.match(
            (await page.textContent("main h1")) ?? "",
            /^Your results in/,
          );
        },
      );
      const panel = ((await page.locator("main").innerText()) ?? "").replace(
        /\s+/g,
        " ",
      );
      const at = (word: string): number => panel.lastIndexOf(word);
      await t.test("lists her tests in LOINC's order", async () => {
        assert.ok(
          at("Sodium") > -1 &&
            at("Sodium") < at("Potassium") &&
            at("Potassium") < at("Chloride"),
          `her tests are not in LOINC's order in ${panel}`,
        );
      });
      await t.test(
        "lists the panel's required tests she has no result for",
        async () => {
          for (const said of ["required", "No result", "missing: "])
            assert.ok(panel.includes(said), `${said} is not in ${panel}`);
          assert.match(panel, /missing: [^.\s]/, "no missing test is named");
        },
      );
      await t.test(
        "stops saying in the sidebar that the tables are loading",
        async () => {
          assert.ok(
            !((await page.textContent("aside section.tables")) ?? "").includes(
              "Loading",
            ),
            "the sidebar still says the tables are loading",
          );
        },
      );
      await page.goto(`${served.url}${AT.pod("priya-natarajan")}`);
      await settled(page);
      await inPlace(page, () =>
        page.click(".tiles .tile-box:has(.kind:text-is('Medications')) a.by"),
      );
      await page.waitForFunction(
        () =>
          document.querySelector("main h1")?.textContent ===
          "Medicines by class",
        undefined,
        { timeout: 120_000 },
      );
      await page.waitForSelector("main .card h2", { timeout: 120_000 });
      await t.test(
        "opens Medicines by class from the Medications tile, without loading a page",
        async () => {
          assert.equal(await page.textContent("main h1"), "Medicines by class");
        },
      );
      const body = ((await page.locator("main").innerText()) ?? "").replace(
        /\s+/g,
        " ",
      );
      await t.test(
        "puts her amlodipine in its ingredient's class",
        async () => {
          for (const said of [
            "Calcium Channel Blocker [EPC]",
            "amlodipine 5 MG Oral Tablet through amlodipine",
          ])
            assert.ok(body.includes(said), `${said} is not in ${body}`);
        },
      );
      await t.test(
        "says FDA classes a different form of her lisinopril",
        async () => {
          const said =
            "lisinopril 10 MG Oral Tablet: FDA classes a different form of lisinopril; RxNorm does not tie this product to it.";
          assert.ok(body.includes(said), `${said} is not in ${body}`);
        },
      );
      await t.test("gives her lisinopril no class", async () => {
        assert.ok(
          !body.includes("Angiotensin Converting Enzyme Inhibitor [EPC]"),
          "lisinopril is given the class FDA gives lisinopril anhydrous",
        );
      });
    } finally {
      await context.close();
    }
  });

  test("with Martin Okafor's sample pod, once the engine is ready", async (t) => {
    const context = await browser.newContext();
    await context.addInitScript(recordDraws);
    try {
      const page = watched(await context.newPage());
      let tablesWorkers = 0;
      const counted = (worker: PageWorker): void => {
        if (worker.url().endsWith("/tables-worker.js")) tablesWorkers += 1;
      };
      page.on("worker", counted);
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await page.waitForSelector('body[data-tables="ready"]', {
        timeout: 60_000,
      });
      page.off("worker", counted);
      await t.test("copies the starter tables in one worker", async () => {
        assert.equal(tablesWorkers, 1, "the starter is copied in one worker");
      });
      await page.goto(
        `${served.url}${AT.pod("martin-okafor")}#see-genetic-variants`,
      );
      await settled(page);
      assert.equal(await page.textContent("main h1"), "Martin Okafor");
      await page.waitForSelector('body[data-tables="ready"]', {
        timeout: 120_000,
      });
      const rows = page.locator("#see-genetic-variants tbody tr");
      await t.test("counts its rows on the Genetic variants tile", async () => {
        assert.equal(
          (await tiles(page)).get("Genetic variants"),
          await rows.count(),
          "the tile counts its rows",
        );
      });
      await t.test(
        "draws the variants nowhere on the pod's page but the tile's box",
        async () => {
          assert.equal(
            await page.locator("main .variants, main .variant").count(),
            0,
          );
        },
      );
      const mlh1 = rows.filter({ hasText: "p.Ala681Val" });
      await t.test("names the MLH1 row by ClinVar", async () => {
        assert.match(
          await mlh1.innerText(),
          /NM_000249\.4\(MLH1\):c\.2042C>T \(p\.Ala681Val\)/,
          "the MLH1 row is not named by ClinVar",
        );
      });
      await t.test("tags the MLH1 row Differs", async () => {
        assert.match(
          await mlh1.innerText(),
          /Differs/,
          "the MLH1 row is not tagged",
        );
      });
      const mlh1Href = await mlh1
        .locator("td:first-child a")
        .getAttribute("href");
      const worth = page
        .locator(".worth li")
        .filter({ hasText: "your 2022 report from Harbourline Genetics" });
      await t.test(
        "lists one line worth a look for MLH1, linked to the entry the row opens",
        async () => {
          assert.equal(
            await worth.count(),
            1,
            "Worth a look has no line for MLH1",
          );
          assert.equal(
            await worth.locator("a").getAttribute("href"),
            mlh1Href,
            "the line does not link to the entry the MLH1 row opens",
          );
        },
      );
      await t.test(
        "says in that line that the report differs from ClinVar today",
        async () => {
          assert.match(
            await worth.innerText(),
            /differs from ClinVar today\.\s*Differs$/,
          );
        },
      );
      const body = async (): Promise<string> =>
        ((await page.locator("main").innerText()) ?? "").replace(/\s+/g, " ");
      const clicks: number[] = [];
      /** What each click from a row to its entry did, and what each Back left. */
      const opening: { url: string; requested: string[] }[] = [];
      const returns: { hash: string; visible: boolean }[] = [];
      const requested: string[] = [];
      const feedHome = new URL(".", (await servedConfig()).tables.feeds[0])
        .href;
      page.on("request", (request) => {
        const url = request.url();
        if (/^https?:/.test(url) && !url.startsWith(feedHome))
          requested.push(url);
      });
      const opens = async (row: Locator): Promise<void> => {
        requested.length = 0;
        await inPlace(page, () => row.locator("td:first-child a").click());
        opening.push({ url: page.url(), requested: [...requested] });
        clicks.push(await drawnAt(page, "clinvar"));
      };
      const back = async (): Promise<void> => {
        await inPlace(page, () => page.goBack());
        returns.push({
          hash: new URL(page.url()).hash,
          visible: await page.locator("#see-genetic-variants").isVisible(),
        });
      };

      await opens(mlh1);
      const entryUrl = page.url();
      const entry = await body();
      await t.test(
        "says each report's year, lab and classification, then what ClinVar says today",
        async () => {
          for (const sentence of [
            "Your 2022 report from Harbourline Genetics said uncertain significance.",
            "Your 2024 report from St Columba's Hospital said likely pathogenic.",
            "ClinVar today says pathogenic/likely pathogenic: criteria provided, multiple submitters, no conflicts, five contributing submitters.",
          ])
            assert.ok(
              entry.includes(sentence),
              `${sentence} is not in ${entry}`,
            );
        },
      );
      await t.test(
        "tags the report that differs from ClinVar today",
        async () => {
          assert.match(
            await page
              .locator("main li")
              .filter({ hasText: "Your 2022 report" })
              .innerText(),
            /Differs/,
          );
        },
      );
      await t.test(
        "says the counsellor sentence and ClinVar's disclaimer",
        async () => {
          const counsellor =
            "Your clinician or a genetic counsellor can explain what this means for you.";
          assert.ok(
            entry.includes(counsellor),
            `${counsellor} is not in ${entry}`,
          );
          assert.match(
            entry,
            /not intended for direct diagnostic use or medical decision-making without review by a genetics professional/i,
          );
        },
      );
      await back();

      await opens(rows.filter({ hasText: "BRCA2" }));
      await t.test("says the series does not cover a gene", async () => {
        assert.match(
          await body(),
          /ClinVar, as this app holds it, covers .*, not BRCA2\./,
        );
      });
      await back();

      await opens(rows.filter({ hasText: "NM_001258271" }));
      await t.test(
        "says ClinVar, as the app holds it, has no row for a variant",
        async () => {
          assert.ok(
            (await body()).includes(
              "ClinVar, as this app holds it, has no row for this variant.",
            ),
          );
        },
      );
      await t.test("opens a row's entry with no request", async () => {
        assert.equal(opening.length, 3);
        for (const { url, requested: asked } of opening) {
          assert.ok(AT.entryOf(url) !== null, url);
          assert.deepEqual(
            asked,
            [],
            "a click from a row to its entry asked for something",
          );
        }
      });
      await t.test("reopens the box the row was in on Back", async () => {
        assert.equal(returns.length, 2);
        for (const { hash, visible } of returns) {
          assert.equal(hash, "#see-genetic-variants");
          assert.ok(visible, "Back does not open the box the row was in");
        }
      });

      const podUrl = `${served.url}${AT.pod("martin-okafor")}`;
      const opened = async (fresh: Page, address: string): Promise<void> => {
        await fresh.goto(address);
        await settled(fresh);
        await fresh.waitForSelector('body[data-tables="ready"]', {
          timeout: 120_000,
        });
      };
      const times: Record<keyof typeof BUDGET_MS, number[]> = {
        "Martin's pod page, a new load, until the MLH1 Differs line": [],
        "Martin's pod page, a reload, until the MLH1 Differs line": [],
        "the MLH1 entry, a new load, until the ClinVar sentence": [],
        "the MLH1 entry, a reload, until the ClinVar sentence": [],
        "a click on a Genetic variants row, until the ClinVar sentence": clicks,
      };
      for (const [loads, reloads, address, what] of [
        [
          "Martin's pod page, a new load, until the MLH1 Differs line",
          "Martin's pod page, a reload, until the MLH1 Differs line",
          podUrl,
          "differs",
        ],
        [
          "the MLH1 entry, a new load, until the ClinVar sentence",
          "the MLH1 entry, a reload, until the ClinVar sentence",
          entryUrl,
          "clinvar",
        ],
      ] as const) {
        for (let at = 0; at < SAMPLES; at += 1) {
          const fresh = watched(await context.newPage());
          await opened(fresh, address);
          times[loads].push(await drawnAt(fresh, what));
          await fresh.close();
        }
        const fresh = watched(await context.newPage());
        await opened(fresh, address);
        for (let at = 0; at < SAMPLES; at += 1) {
          await fresh.reload();
          await settled(fresh);
          times[reloads].push(await drawnAt(fresh, what));
        }
        await fresh.close();
      }
      await t.test(
        "reaches each table-dependent line within twice its budget",
        async () => {
          for (const [what, budget] of Object.entries(BUDGET_MS))
            withinBudget(what, times[what as keyof typeof BUDGET_MS], budget);
        },
      );

      const shapes = async (
        fresh: Page,
      ): Promise<{ shape: string; href: string }[]> => {
        const found = new Map<string, string>();
        for (const href of await fresh.$$eval(AT.links, (links) =>
          links.map((link) => link.getAttribute("href") ?? ""),
        ))
          if (!found.has(AT.shapeOf(href))) found.set(AT.shapeOf(href), href);
        return [...found].map(([shape, href]) => ({ shape, href }));
      };
      const drawnFor: {
        address: string;
        href: string;
        shape: string;
        title: string;
      }[] = [];
      for (const address of [podUrl, entryUrl]) {
        const fresh = watched(await context.newPage());
        await opened(fresh, address);
        const found = await shapes(fresh);
        assert.ok(found.length > 1, `${address} links one shape of address`);
        for (const { shape, href } of found) {
          await opened(fresh, address);
          await inPlace(fresh, () =>
            fresh
              .locator(`a[href="${href}"]`)
              .first()
              .evaluate((link) => (link as HTMLElement).click()),
          );
          drawnFor.push({
            address,
            href,
            shape,
            title: (await fresh.textContent("main h1")) ?? "",
          });
        }
        await fresh.close();
      }
      await t.test(
        "opens a page from each shape of address the pod's page and the entry link",
        async () => {
          for (const { address, href, shape, title } of drawnFor)
            assert.ok(
              !["Not found", "Something went wrong", "Not ported yet"].includes(
                title,
              ),
              `${address} links ${href} (${shape}), which draws a page that is not found`,
            );
        },
      );
    } finally {
      await context.close();
    }
  });
});

/**
 * try/ ships starter copies of the reference tables and checks the feeds its `cascade-runtime.json` names; a newer version is kept in a database of the app's own and adopted by the next pod opened. A pod opened after a check adopts it by `runtime/opening.feature`.
 */
describe("Keeping the reference tables current in a browser · cascade-runtime.json", () => {
  test("when a check finds a newer version in a feed", async (t) => {
    const [feedUrl] = (await servedConfig()).tables.feeds;
    assert.ok(feedUrl);
    const valid = join(
      ROOT,
      "node_modules",
      "cascade-reference-tables",
      "fixtures",
      "feeds",
      "valid",
    );
    const catalog = turtle(await readFile(join(valid, "feed.ttl")), feedUrl);
    const of = (subject: string, predicate: string): string | undefined =>
      catalog.find(
        ([s, p]) => s.value === subject && p.value === predicate,
      )?.[2].value;
    const series =
      catalog.find(([, , o]) => o.value.endsWith("#VaccineGroups"))?.[0]
        .value ?? "";
    const second = of(series, `${DCAT}hasCurrentVersion`) ?? "";
    const first = of(second, `${PROV}wasRevisionOf`) ?? "";
    assert.ok(first);
    const bodies = new Map<string, Buffer>();
    for (const [, predicate, url] of catalog)
      if (predicate.value === `${DCAT}downloadURL`)
        bodies.set(
          url.value,
          await readFile(
            join(valid, ...new URL(url.value).pathname.split("/").slice(-2)),
          ),
        );
    const feedOf = (current: (version: string) => string): string =>
      ntriples(
        catalog.map(([s, p, o]) =>
          p.value === `${DCAT}hasCurrentVersion`
            ? [s, p, oxigraph.namedNode(current(o.value))]
            : [s, p, o],
        ),
      );
    let feed = feedOf(
      (version) => of(version, `${PROV}wasRevisionOf`) ?? version,
    );
    const context = await browser.newContext();
    try {
      await context.route(
        (url) => url.href === feedUrl || bodies.has(url.href),
        (route) => {
          const url = route.request().url();
          return route.fulfill(
            url === feedUrl
              ? { body: feed, contentType: "text/turtle" }
              : { body: bodies.get(url) ?? "" },
          );
        },
      );
      await context.route(new URL("checked.json", feedUrl).href, (route) =>
        route.fulfill({ status: 404 }),
      );
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      interface Runtime {
        checkTables(): Promise<{ kept: string[]; refused: unknown[] }[]>;
        openPod(name: string): Promise<{
          subject: string;
          owner: string;
          opened?: { refused?: string; unheld: string[] };
          enter(turtle: string): Promise<{ refused?: string }>;
          ask(
            question: string | { query: string },
          ): Promise<Record<string, string>[]>;
          close(): Promise<void>;
        }>;
      }
      const entered = await page.evaluate(
        async ({ terms, cvx }) => {
          const runtime = (await import(
            "cascade-runtime" as string
          )) as Runtime;
          await runtime.checkTables();
          const pod = await runtime.openPod("tables-proof");
          const shots = [
            ["141", "2025-10-01"],
            ["150", "2025-10-01"],
            ["140", "2024-10-01"],
            ["141", "2024-10-01"],
          ].map(
            (
              [code, date],
              index,
            ) => `<urn:cascade:output-${index}> a <${terms.Vaccination}> .
<urn:cascade:output-${index}-version> <http://www.w3.org/ns/prov#specializationOf> <urn:cascade:output-${index}> ;
  <${terms.vaccineCode}> <${cvx}${code}> ;
  <${terms.vaccinationOccurrenceTime}> "${date}"^^<http://www.w3.org/2001/XMLSchema#date> ;
  <${terms.patient}> <${pod.subject}> .`,
          );
          const session = `urn:uuid:${crypto.randomUUID()}`;
          const done =
            await pod.enter(`<${session}> a <http://www.w3.org/ns/prov#Activity> ;
  <http://www.w3.org/ns/prov#qualifiedAssociation> [ <http://www.w3.org/ns/prov#agent> <${pod.owner}> ;
    <http://www.w3.org/ns/prov#hadRole> <${terms.PatientRole}> ] .
${shots.join("\n")}`);
          await pod.close();
          return done;
        },
        { terms, cvx: codeStems.CVX },
      );
      assert.equal(entered.refused, undefined);

      feed = feedOf((version) => version);
      const after = await page.evaluate(
        async ({ series, first, second, terms }) => {
          const runtime = (await import(
            "cascade-runtime" as string
          )) as Runtime;
          const checked = await runtime.checkTables();
          const pod = await runtime.openPod("tables-proof");
          try {
            const current = await pod.ask({
              query: `SELECT ?version WHERE { <${series}> <http://purl.org/pav/hasCurrentVersion> ?version }`,
            });
            const sames = await pod.ask({
              query: `SELECT ?used ?counts (GROUP_CONCAT(STR(?code); separator=" ") AS ?codes) WHERE {
              ?judgment <${terms.justification}> <${terms.SameMappedCodeAndDate}> ;
                <http://www.w3.org/ns/prov#wasDerivedFrom> ?used ; <http://www.w3.org/ns/prov#hadMember> ?record .
              VALUES ?used { <${first}> <${second}> }
              ?record <http://purl.org/pav/hasCurrentVersion>/<${terms.vaccineCode}> ?code
              BIND (EXISTS { ?judgment <https://ns.cascadeprotocol.org/cascade#countsUnderLens> true } AS ?counts)
            } GROUP BY ?judgment ?used ?counts`,
            });
            return {
              kept: checked.flatMap(({ kept }) => kept),
              opened: pod.opened,
              current,
              sames,
              databases: (await indexedDB.databases()).map(
                ({ name }) => name ?? "",
              ),
            };
          } finally {
            await pod.close();
          }
        },
        { series, first, second, terms },
      );
      const filed = after.sames
        .map(
          ({ used = "", codes = "" }) =>
            `${used === first ? "first" : "second"}: ${codes
              .split(" ")
              .map((code) => code.replace(codeStems.CVX, ""))
              .sort()
              .join(" ")}`,
        )
        .sort();
      await t.test(
        "keeps the newer version in the app's own database",
        async () => {
          assert.ok(after.kept.includes(second));
          assert.ok(
            after.databases.some((name) => name.endsWith(":cascade-tables")),
            `no tables database among ${after.databases.join(", ")}`,
          );
        },
      );
      await t.test(
        "records the version in a pod opened after the check",
        async () => {
          assert.equal(after.opened?.refused, undefined);
          assert.deepEqual(after.opened?.unheld, []);
          assert.deepEqual(after.current, [{ version: second }]);
        },
      );
      await t.test(
        "files the Same judgment the newer version newly joins",
        async () => {
          assert.ok(filed.includes("second: 140 141"), filed.join("; "));
        },
      );
      await t.test(
        "files nothing again for a pair the replaced version joined already",
        async () => {
          assert.deepEqual(filed, ["first: 141 150", "second: 140 141"]);
        },
      );
      await t.test(
        "still counts the Same judgment the replaced version filed",
        async () => {
          assert.deepEqual(
            after.sames
              .filter(({ used }) => used === first)
              .map(({ counts }) => counts),
            ["true"],
          );
        },
      );

      await page.goto(
        `${served.url}${AT.table(series.replace(/^urn:uuid:/, ""), "141")}`,
      );
      await settled(page);
      const label = of(series, "http://www.w3.org/2000/01/rdf-schema#label");
      assert.ok(label);
      await t.test("names the table's page by its series' label", async () => {
        assert.equal(await page.locator("main h1").innerText(), label);
      });
      await t.test("marks the table's source in the sidebar", async () => {
        assert.equal(
          await page.locator("aside section.tables a[aria-current]").count(),
          1,
        );
      });
      const shown = await page.locator("main").innerText();
      await t.test(
        'says "Using version" and the version on the table\'s page',
        async () => {
          assert.ok(
            shown.includes(
              `Using version ${of(second, "http://purl.org/pav/version") ?? ""}`,
            ),
            shown,
          );
        },
      );
      await t.test(
        "lists only the code searched for on the table's page",
        async () => {
          assert.deepEqual(
            await page
              .locator("table.codes tbody td:first-child")
              .allInnerTexts(),
            ["141"],
          );
        },
      );
      await t.test(
        "names on the table's page the pod that holds the code",
        async () => {
          assert.ok(shown.includes("Tables Proof"), shown);
        },
      );
      await inPlace(page, () => page.click("section.tables button"));
      await t.test(
        'says "Checked the feeds: nothing new." after a check from the sidebar',
        async () => {
          assert.match(
            await page.locator("p.note").innerText(),
            /^Checked the feeds: nothing new\.$/,
          );
        },
      );

      const said = await page.evaluate(
        async ({ terms, cvx }) => {
          const runtime = (await import(
            "cascade-runtime" as string
          )) as Runtime & {
            appTables(): Promise<{
              about(codes: string[]): Promise<
                Map<
                  string,
                  {
                    name?: { label: string };
                    status?: { deprecated: boolean; replacedBy: string[] };
                  }
                >
              >;
            }>;
          };
          const pod = await runtime.openPod("tables-proof");
          try {
            const shots = ["57", "03"].map(
              (code) => `<urn:cascade:output-${code}> a <${terms.Vaccination}> .
<urn:cascade:output-${code}-version> <http://www.w3.org/ns/prov#specializationOf> <urn:cascade:output-${code}> ;
  <${terms.vaccineCode}> <${cvx}${code}> ;
  <${terms.vaccinationOccurrenceTime}> "2020-01-01"^^<http://www.w3.org/2001/XMLSchema#date> ;
  <${terms.patient}> <${pod.subject}> .`,
            );
            const session = `urn:uuid:${crypto.randomUUID()}`;
            await pod.enter(`<${session}> a <http://www.w3.org/ns/prov#Activity> ;
  <http://www.w3.org/ns/prov#qualifiedAssociation> [ <http://www.w3.org/ns/prov#agent> <${pod.owner}> ;
    <http://www.w3.org/ns/prov#hadRole> <${terms.PatientRole}> ] .
${shots.join("\n")}`);
            const given = await pod.ask("pod/My immunizations");
            const reviewed = new Set(
              (await pod.ask("entry/What needs review")).map(
                ({ entry }) => entry,
              ),
            );
            const about = await (
              await runtime.appTables()
            ).about(given.map(({ code = "" }) => code));
            return given.map(({ code = "", entry = "" }) => ({
              label: about.get(code)?.name?.label ?? "",
              retired: about.get(code)?.status?.deprecated === true,
              review: reviewed.has(entry),
            }));
          } finally {
            await pod.close();
          }
        },
        { terms, cvx: codeStems.CVX },
      );
      assert.ok(
        said.some(({ label }) => label !== ""),
        "the names series names no shot",
      );
      assert.ok(
        said.some(({ retired }) => retired),
        "the status series retires no shot",
      );
      await page.goto(
        `${served.url}${AT.pod("tables-proof")}#see-immunizations`,
      );
      await settled(page);
      await page.waitForSelector('body[data-tables="ready"]');
      await t.test(
        "labels each code with Needs review and Retired code as the series say",
        async () => {
          assert.deepEqual(
            (
              await page
                .locator("#see-immunizations tbody td:first-child")
                .allTextContents()
            ).sort(),
            said
              .map(
                ({ label, retired, review }) =>
                  `${label}${review ? " Needs review" : ""}${retired ? " Retired code" : ""}`,
              )
              .sort(),
          );
        },
      );

      const retired = said.find((each) => each.retired);
      assert.ok(retired);
      const opened = (title: string): Promise<boolean> =>
        page
          .waitForFunction(
            (expected) =>
              document
                .querySelector("main h1")
                ?.textContent?.startsWith(expected),
            title,
          )
          .then(() => true);
      await inPlace(page, async () => {
        await page
          .locator("#see-immunizations tbody tr")
          .filter({ hasText: retired.label })
          .locator("td:first-child a")
          .click();
        await opened(retired.label);
      });
      await t.test("tags a retired code in its entry's heading", async () => {
        assert.ok(AT.entryOf(page.url()) !== null);
        assert.ok(
          (await page.locator("main h1 .tag").allInnerTexts()).includes(
            "Retired code",
          ),
          "the entry's heading does not tag the retired code",
        );
      });
      const code = page.locator('main a[href*="code="]').first();
      const notation = (await code.innerText()).trim();
      await inPlace(page, async () => {
        await code.click();
        await opened(notation);
      });
      await t.test(
        "opens the code's table from the entry, at that code",
        async () => {
          assert.ok(AT.tableOf(page.url()) !== null);
          assert.equal(AT.codeOf(page.url()), notation);
        },
      );
      for (const expected of [retired.label, "Tables Proof"])
        await inPlace(page, async () => {
          await page.goBack();
          await opened(expected);
        });
      await t.test("reopens the box a row was in on Back", async () => {
        assert.equal(new URL(page.url()).hash, "#see-immunizations");
        assert.ok(
          await page.locator("#see-immunizations").isVisible(),
          "Back does not open the box the row was in",
        );
      });
    } finally {
      await context.close();
    }
  });

  test("with the starter tables try/ ships, after a check that finds nothing new", async (t) => {
    const [feedUrl] = (await servedConfig()).tables.feeds;
    assert.ok(feedUrl);
    const shipped = turtle(
      await readFile(join(SERVED, "tables", "references.ttl")),
      "urn:test:starter/",
    ).filter(([, predicate]) => predicate.value === terms.defaultTableVersion);
    assert.ok(shipped.length > 0, "try/ ships no starter tables");
    const feed = ntriples(
      shipped.flatMap(([series, , version]): Triple[] => [
        [
          series,
          oxigraph.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
          oxigraph.namedNode(terms.ReferenceSeries),
        ],
        [series, oxigraph.namedNode(`${DCAT}hasCurrentVersion`), version],
      ]),
    );
    const context = await browser.newContext();
    try {
      await context.route(feedUrl, (route) =>
        route.fulfill({ body: feed, contentType: "text/turtle" }),
      );
      await context.route(new URL("checked.json", feedUrl).href, (route) =>
        route.fulfill({ status: 404 }),
      );
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await page.waitForSelector('body[data-tables="ready"]', {
        timeout: 60_000,
      });
      const checked = await page.evaluate(async () => {
        const runtime = (await import("cascade-runtime" as string)) as {
          checkTables(): Promise<
            { kept: string[]; later?: string; refused: unknown[] }[]
          >;
        };
        return runtime.checkTables();
      });
      await t.test(
        "keeps nothing from a feed that names the versions try/ ships",
        async () => {
          assert.deepEqual(
            checked.map(({ kept, later, refused }) => ({
              kept,
              later,
              refused,
            })),
            [{ kept: [], later: undefined, refused: [] }],
          );
        },
      );

      await page.route(ENGINE, (route) => route.abort());
      await page.goto(`${served.url}${AT.pod(ALEX)}`);
      await settled(page, 30_000);
      await t.test("draws a copied pod from its kept answers", async () => {
        assert.equal(await page.textContent("main h1"), "Alex Rivera");
        assert.ok((await tiles(page)).size > 0);
      });
      await t.test("draws it with no engine loaded", async () => {
        assert.equal(await page.getAttribute("body", "data-engine"), null);
      });
      await page.waitForFunction(
        () =>
          document
            .querySelector("aside section.tables")
            ?.textContent?.includes("The reference tables could not be read."),
        undefined,
        { timeout: 30_000 },
      );
      const nav = (await page.textContent("aside section.tables")) ?? "";
      await t.test(
        "says in the sidebar that the reference tables could not be read, with the engine's file refused",
        async () => {
          assert.ok(
            nav.includes("The reference tables could not be read."),
            nav,
          );
          assert.ok(!nav.includes("Loading") && !nav.includes("None yet"), nav);
        },
      );
      const tablesKept = await page.evaluate(async () =>
        (await indexedDB.databases())
          .map(({ name }) => name ?? "")
          .filter((name) => name.endsWith(":cascade-tables")),
      );
      await t.test("keeps one set of tables for every address", async () => {
        assert.equal(tablesKept.length, 1, tablesKept.join(", "));
      });

      const sources = alex["entry/Where it came from"] ?? [];
      const penicillin = sources.filter(
        ({ entryLabel }) => entryLabel === "Allergy entry · Penicillin",
      );
      assert.ok(penicillin.length > 1, "Alex's penicillin is from one place");
      const row = (alex["pod/My active allergies"] ?? []).find(
        ({ entry }) => entry === penicillin[0]?.entry,
      );
      assert.ok(row);
      await page.click('a.tile[href="#see-allergies"]');
      await inPlace(page, async () => {
        await page
          .locator("#see-allergies tbody tr")
          .filter({ hasText: String(row.allergen) })
          .locator("td:first-child a")
          .first()
          .click();
        await page.waitForURL((url) => AT.entryOf(url.href) !== null);
      });
      await t.test(
        "opens a row's entry from the kept answers, without loading a page",
        async () => {
          assert.equal(AT.entryOf(page.url()), view.entryId(String(row.entry)));
          assert.equal(await page.textContent("main h1"), row.allergen);
          assert.equal(await page.getAttribute("body", "data-engine"), null);
        },
      );
      const came = await page
        .locator("main .card", { hasText: "Where it came from" })
        .innerText();
      await t.test("names each place the entry came from", async () => {
        for (const place of new Set(penicillin.map(view.placeOf)))
          assert.ok(came.includes(place), `${place} is not in ${came}`);
      });
      await page.close();
    } finally {
      await context.close();
    }
  });
});

/**
 * The app compares a lab test's results before and after a medication starts or stops, says the lab change in a sentence, and opens a trend: the results on a chart with the medication's date.
 */
describe("Seeing what changed after a medication · find_changes, trend", () => {
  test("with Ines Calloway's record brought in from North", async (t) => {
    const {
      person: ines,
      hospital: north,
      patient,
    } = await demoPatient("Ines Calloway");

    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await newPod(page, view.familyFirst(ines));
      await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
      );
      await allowAs(
        page,
        await signInAt(page, view.hospitalName(north.name)),
        patient,
      );
      await bringIn(page);

      const card = page.locator(".change");
      await card.first().waitFor({ timeout: 60_000 });
      await t.test("draws one change card", async () => {
        assert.equal(await card.count(), 1);
      });
      const said = (await card.innerText()).replace(/\s+/g, " ");
      await t.test(
        "says a result was lower after a medication was prescribed",
        async () => {
          assert.match(said, /was lower after .+ was prescribed\./);
        },
      );
      await t.test(
        "says the two means and how many results each is of",
        async () => {
          assert.ok(
            said.includes(
              "162 → 98.3 mg/dL, the mean of 3 results before and 3 after",
            ),
            said,
          );
        },
      );

      await inPlace(page, () =>
        page.click('.change a:has-text("Open the trend")'),
      );
      await t.test("opens the trend at its address", async () => {
        assert.deepEqual(AT.trendOf(page.url()), {
          pod: "ines-calloway",
          test: "18262-6",
          medication: "617310",
        });
      });
      const chart = page.locator("svg.chart.large");
      await t.test("marks each result on the trend's chart", async () => {
        assert.equal(await chart.locator("circle.marker").count(), 6);
      });
      await t.test("titles the chart as the page's heading", async () => {
        assert.equal(
          await chart.locator("title").first().textContent(),
          await page.textContent("main h1"),
        );
      });

      await page.goto(`${served.url}${AT.classes("ines-calloway")}`);
      await settled(page);
      await page.waitForFunction(
        () =>
          document.querySelector("main h1")?.textContent ===
          "Medicines by class",
        undefined,
        { timeout: 120_000 },
      );
      await page.waitForSelector("main .card h2", { timeout: 120_000 });
      const estrogen = (
        await page
          .locator("main .card", {
            has: page.locator("h2", { hasText: "Estrogen [EPC]" }),
          })
          .innerText()
      ).replace(/\s+/g, " ");
      await t.test(
        "puts her estradiol in the class estrogen on the class page",
        async () => {
          assert.match(
            estrogen,
            /stradiol 1 (mg tablet|MG Oral Tablet) through estradiol/i,
          );
        },
      );
    } finally {
      await context.close();
    }
  });

  test("with the sample pod tamsin-vale", async (t) => {
    const story = (await loadStories()).find(({ pulls }) => pulls?.length);
    assert.ok(story?.pulls, "no story names its pulls");
    const [finding] = story.findings;
    assert.ok(finding?.kind === "after stop", "the story's finding is no stop");
    const north = await loadHospital(story.hospital);

    const context = await browser.newContext();
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await page.goto(`${served.url}${AT.pod("tamsin-vale")}`);
      await page.locator(".changes .how").waitFor({ timeout: 60_000 });

      const card = page.locator(".change");
      await t.test("draws one change card", async () => {
        assert.equal(await card.count(), 1);
      });
      const said = (await card.innerText()).replace(/\s+/g, " ");
      await t.test(
        "says a result was higher after a medication stopped",
        async () => {
          assert.match(said, /was higher after .+ stopped\./);
        },
      );
      await t.test(
        "never names the medication on the card by the record's own name",
        async () => {
          assert.ok(
            !said.includes("Metformin 500 mg tablet"),
            "the card is drawn by the record's own name, not the tables'",
          );
        },
      );

      const pulls = await texts(page, ".how li");
      await t.test(
        "lists the story's pulls in order, each with its source and the date it answered as of",
        async () => {
          assert.equal(pulls.length, story.pulls!.length);
          story.pulls!.forEach(({ asOf }, at) => {
            const said = pulls[at]!;
            assert.ok(
              said.includes(`From ${view.hospitalName(north.hospital.name)}`),
              said,
            );
            assert.ok(said.includes(`as of ${view.dayInWords(asOf)}`), said);
          });
        },
      );
      const how = (await page.locator(".how").innerText()).replace(/\s+/g, " ");
      await t.test(
        "says the metformin's two versions and the import that brought the second",
        async () => {
          assert.ok(
            how.includes(
              `version 1 to version 2, in import 2, as of ${view.dayInWords(story.pulls![1]!.asOf)}`,
            ),
            how,
          );
        },
      );
      await t.test("says what changed between the two versions", async () => {
        assert.match(
          how,
          new RegExp(
            `Workflow status active → completed; medication use end date none → ${view.dayInWords(finding.date.slice(0, 10))}`,
          ),
        );
      });
      await t.test(
        "never shows an IRI in where the change comes from",
        async () => {
          assert.doesNotMatch(how, /urn:|https?:/);
        },
      );

      await inPlace(page, () =>
        page.click('.change a:has-text("Open the trend")'),
      );
      await t.test(
        "opens the trend at its address from the change card",
        async () => {
          assert.deepEqual(AT.trendOf(page.url()), {
            pod: "tamsin-vale",
            test: "4548-4",
            medication: "861007",
          });
        },
      );
      await page.goto(`${served.url}${AT.trend("tamsin-vale", "0000-0")}`);
      await settled(page);
      await t.test(
        "draws Not found, naming the test, for a trend of a test the pod lacks",
        async () => {
          assert.equal(await page.textContent("main h1"), "Not found");
          assert.match(
            (await page.textContent("main p")) ?? "",
            /no test 0000-0 in the pod/,
          );
        },
      );
    } finally {
      await context.close();
    }
  });
});

/**
 * A page registers tools with `document.modelContext` (WebMCP) so a browser's agent can call them. The app offers its one tool list on every screen, the pod filled in where a pod is shown, and never a tool that calls an operation the list `NEVER` holds.
 */
describe("Offering the app's tools to a browser's agent · document.modelContext", () => {
  test("with a pod shown in try/", async (t) => {
    const context = await browser.newContext();
    await context.addInitScript(recordTools);
    await context.addInitScript(watchLeaving);
    try {
      const page = watched(await context.newPage());
      const live = (): Promise<string[]> => offered(page);
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await page.goto(`${served.url}${AT.pod("tamsin-vale")}`);
      await settled(page);
      await page.locator(".change").first().waitFor({ timeout: 60_000 });
      await page.waitForFunction(() =>
        (globalThis as unknown as Registered).registered.some(
          ({ name, signal }) => name === "open_trend" && !signal.aborted,
        ),
      );
      await t.test("offers every tool of the app's tool list", async () => {
        assert.deepEqual(await live(), TOOLS.names);
      });
      await t.test(
        "never offers a tool that calls an operation `NEVER` holds",
        async () => {
          assert.deepEqual(
            (await live()).filter((name) => TOOLS.never.includes(name)),
            [],
          );
        },
      );
      const total = (): Promise<number> =>
        page.evaluate(
          () => (globalThis as unknown as Registered).registered.length,
        );
      const before = await total();

      await inPlace(page, () =>
        page.click('.change a:has-text("Open the trend")'),
      );
      await t.test(
        "registers no tool again on a move between the pod's screens",
        async () => {
          assert.deepEqual(await live(), TOOLS.names);
          assert.equal(
            await total(),
            before,
            "a move between the pod's screens offered the tools again",
          );
        },
      );

      await page.evaluate(
        ([from, count]) => {
          Object.assign(globalThis, { leaving: { from, count } });
        },
        [await page.textContent("aside nav a[aria-current]"), await total()],
      );
      await inPlace(page, () => page.click('nav a:has-text("Alex Rivera")'));
      await t.test(
        "takes every tool of the pod left away as the page shows another pod, never a paint later",
        async () => {
          assert.equal(await page.textContent("main h1"), "Alex Rivera");
          assert.equal(
            await page.evaluate(
              () => (globalThis as unknown as Leaving).leaving?.still,
            ),
            0,
            "a tool of the pod left was still on when the page showed another pod",
          );
        },
      );
      await t.test(
        "offers the tool list again for the pod moved to",
        async () => {
          assert.deepEqual(await live(), TOOLS.names);
        },
      );
    } finally {
      await context.close();
    }
  });

  test("with the entry, classes, panel and table screens of try/", async (t) => {
    const context = await browser.newContext();
    await context.addInitScript(recordTools);
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.pod("alex-rivera")}`);
      await settled(page);
      const podFilled = {
        properties: ["test", "medication"],
        required: ["test"],
      };
      const named = {
        properties: ["pod", "test", "medication"],
        required: ["pod", "test"],
      };
      /** What each tool call did: its answer, where the app is after it, where it should be, and the tools then offered. */
      const calls: {
        name: string;
        answered: string;
        ok: boolean;
        at: string;
        path: string;
        offered: string[];
      }[] = [];
      /** The input each tool takes, and what it should take, where a pod is shown or not. */
      const inputs: { name: string; got: unknown; want: unknown }[] = [];
      const opens = async (
        name: string,
        input: object,
        path: string,
        takesPod?: boolean,
      ) => {
        let answer: object = {};
        await inPlace(page, async () => {
          answer = await called(page, name, input, takesPod);
        });
        const { pathname, search } = new URL(page.url());
        calls.push({
          name,
          answered: JSON.stringify(answer),
          ok: "result" in answer,
          at: pathname + search,
          path,
          offered: await offered(page),
        });
      };

      await opens("open_classes", {}, "/try/pods/alex-rivera/classes", false);
      inputs.push({
        name: "open_trend on the classes screen",
        got: await inputOf(page, "open_trend", false),
        want: podFilled,
      });

      await opens(
        "open_pod",
        { pod: "priya-natarajan" },
        "/try/pods/priya-natarajan/",
      );
      await opens(
        "open_panel",
        { panel: "24326-1" },
        "/try/pods/priya-natarajan/panel?panel=24326-1",
        false,
      );
      const panelHeading = (await page.textContent("main h1")) ?? "";

      await opens("open_table", {}, "/try/tables/");
      inputs.push(
        {
          name: "open_trend on the tables screen",
          got: await inputOf(page, "open_trend", true),
          want: named,
        },
        {
          name: "open_pod on the tables screen",
          got: await inputOf(page, "open_pod", true),
          want: { properties: ["pod"], required: ["pod"] },
        },
      );

      await opens(
        "open_pod",
        { pod: "priya-natarajan" },
        "/try/pods/priya-natarajan/",
      );
      const labs = await called(
        page,
        "ask",
        { question: "pod/My lab results", limit: 1 },
        false,
      );
      assert.ok("result" in labs, JSON.stringify(labs));
      const [lab] = (labs.result as { rows: { entry: string }[] }).rows;
      await inPlace(page, async () => {
        await called(page, "open_entry", { entry: lab!.entry }, false);
      });
      const entryOpened = AT.entryOf(page.url());
      const entryOffered = await offered(page);
      inputs.push({
        name: "open_entry on the entry screen",
        got: await inputOf(page, "open_entry", false),
        want: { properties: ["entry"], required: ["entry"] },
      });
      await t.test("offers the tool list on each screen", async () => {
        for (const { name, offered: names } of calls)
          assert.deepEqual(names, TOOLS.names, name);
        assert.deepEqual(entryOffered, TOOLS.names);
      });
      await t.test("fills the pod in only where a pod is shown", async () => {
        for (const { name, got, want } of inputs)
          assert.deepEqual(got, want, name);
      });
      await t.test(
        "moves the app, without loading a page, from `open_classes`, `open_entry`, `open_panel`, `open_table` and `open_pod`",
        async () => {
          assert.equal(calls.length, 5);
          for (const { name, answered, ok, at, path } of calls) {
            assert.ok(ok, answered);
            assert.equal(at, path, name);
          }
          assert.match(panelHeading, /^Your results in/);
          assert.equal(entryOpened, view.entryId(lab!.entry));
        },
      );
    } finally {
      await context.close();
    }
  });

  test("when two open tools are called back to back", async (t) => {
    const context = await browser.newContext();
    await context.addInitScript(recordTools);
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.pod("priya-natarajan")}`);
      await settled(page);
      await inputOf(page, "open_panel", false);
      const [first, second] = await page.evaluate(async () => {
        const run = (name: string, input: object) => {
          const { tool } = (
            globalThis as unknown as {
              registered: {
                name: string;
                signal: AbortSignal;
                tool: { execute(input: object): Promise<unknown> };
              }[];
            }
          ).registered
            .filter(({ signal }) => !signal.aborted)
            .find((each) => each.name === name)!;
          return tool.execute(input);
        };
        const first = await run("open_classes", {});
        const at = location.pathname;
        const second = await run("open_panel", { panel: "24326-1" });
        return [{ first, at }, second] as const;
      });
      const { pathname, search } = new URL(page.url());
      await t.test("resolves each once its screen is drawn", async () => {
        assert.match(first.at, /\/classes$/);
        assert.equal(
          pathname + search,
          "/try/pods/priya-natarajan/panel?panel=24326-1",
        );
      });
      await t.test("never refuses the second as busy", async () => {
        assert.ok(!("refused" in (second as object)), JSON.stringify(second));
        assert.ok(
          !("refused" in (first.first as object)),
          JSON.stringify(first),
        );
      });
    } finally {
      await context.close();
    }
  });
});

describe("Confirming a write a model asks for · make_pod", () => {
  test("when a browser's agent asks to make a pod in try/", async (t) => {
    const context = await browser.newContext();
    await context.addInitScript(recordTools);
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.pod("alex-rivera")}`);
      await settled(page);
      const asking = page.getByRole("alertdialog");
      const pods = async (): Promise<string[]> => {
        const listed = await called(page, "list_pods");
        assert.ok("result" in listed, JSON.stringify(listed));
        return listed.result as string[];
      };

      const refused = called(page, "make_pod", { person: "Wren Tolliver" });
      await asking.waitFor();
      await t.test(
        "names the write and the person in the confirm box",
        async () => {
          assert.match(
            (await asking.textContent()) ?? "",
            /Make a pod.*Wren Tolliver/,
          );
        },
      );
      await t.test("makes no pod while the confirm box waits", async () => {
        assert.equal((await pods()).includes("wren-tolliver"), false);
      });
      await asking.getByRole("button", { name: "Cancel" }).click();
      const said = await refused;
      await t.test(
        'tells the browser\'s agent "The person said no" on Cancel',
        async () => {
          assert.deepEqual(said, {
            result: { refused: "The person said no" },
          });
        },
      );
      await t.test("makes no pod on Cancel", async () => {
        assert.equal((await pods()).includes("wren-tolliver"), false);
      });

      const allowed = called(page, "make_pod", { person: "Wren Tolliver" });
      await asking.waitFor();
      await asking.getByRole("button", { name: "Allow" }).click();
      const made = await allowed;
      assert.ok("result" in made, JSON.stringify(made));
      await settled(page);
      await t.test("makes the pod on Allow", async () => {
        assert.equal((made.result as { pod: string }).pod, "wren-tolliver");
        assert.equal((await pods()).includes("wren-tolliver"), true);
      });

      const encrypted = await called(page, "make_pod", {
        person: "Cora Diaz",
        encrypt: true,
      });
      assert.ok("result" in encrypted, JSON.stringify(encrypted));
      await t.test("refuses an encrypted pod without asking", async () => {
        assert.ok(
          typeof (encrypted.result as { refused?: unknown }).refused ===
            "string",
          JSON.stringify(encrypted),
        );
        assert.equal(await asking.count(), 0);
        assert.equal((await pods()).includes("cora-diaz"), false);
      });
    } finally {
      await context.close();
    }
  });
});

/**
 * An encrypted pod is sealed with six words the app shows once; only the words open it, and nothing readable is kept on disk or in the browser. The person proves they kept the words by typing words 2 and 5.
 */
describe("Encrypting a pod with six words · Encrypt this pod with six words", () => {
  test("with an encrypted pod made in try/", async (t) => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      const offered: { id: string; password: string }[] = [];
      Object.assign(globalThis, {
        offered,
        PasswordCredential: class {
          init: { id: string; password: string };
          constructor(init: { id: string; password: string }) {
            this.init = init;
          }
        },
      });
      navigator.credentials.store = async (credential) => {
        offered.push(
          (credential as unknown as { init: (typeof offered)[0] }).init,
        );
        return undefined;
      };
    });
    try {
      const page = watched(await context.newPage());
      await page.goto(`${served.url}${AT.home}`);
      await settled(page);
      await page.click('a[href="#new-pod"]');
      await page.check("#encrypt-pod");
      await page.fill(
        '#new-pod input[aria-label="A person\'s name"]',
        "Grace Hopper",
      );
      await inPlace(page, () =>
        page.click('#new-pod button:has-text("Make the pod")'),
      );
      const words = await page.locator(".words li").allTextContents();
      await t.test("shows six words", async () => {
        assert.equal(words.length, 6);
      });

      const confirm = page.locator("form", {
        has: page.locator('input[name="word2"]'),
      });
      const signUp = await confirm.evaluate((form) => {
        const named = (field: string) =>
          form.querySelector<HTMLInputElement>(`input[name="${field}"]`)!;
        return ["username", "password"].map((field) => {
          const input = named(field);
          return {
            type: input.type,
            autocomplete: input.autocomplete,
            value: input.value,
            hidden:
              input.readOnly ||
              input.closest("[aria-hidden]") !== null ||
              input.offsetParent === null,
          };
        });
      });
      await t.test(
        "offers the pod's name and the six words to a password manager as a new sign-up",
        async () => {
          assert.deepEqual(signUp, [
            {
              type: "text",
              autocomplete: "username",
              value: "grace-hopper",
              hidden: false,
            },
            {
              type: "password",
              autocomplete: "new-password",
              value: words.join(" "),
              hidden: false,
            },
          ]);
        },
      );
      const addressBefore = page.url();
      const keptBefore = await wordsKept(page, words);

      await t.test(
        "makes Copy words a plain button, so it submits nothing",
        async () => {
          assert.equal(
            await page.getAttribute("button[data-copy-words]", "type"),
            "button",
          );
        },
      );

      await page.fill('input[name="password"]', "a suggested password");
      await page.fill('input[name="word2"]', words[1]!);
      await page.fill('input[name="word5"]', words[4]!);
      await inPlace(page, () =>
        page.click('button:has-text("Make the encrypted pod")'),
      );
      await t.test(
        "refuses a changed password field, resets it to the words and makes nothing",
        async () => {
          assert.match(
            (await page.textContent("main")) ?? "",
            /must hold the six words above/,
          );
          assert.equal(
            await page.inputValue('input[name="password"]'),
            words.join(" "),
            "the field is reset to the words",
          );
          assert.equal(
            (await page.evaluate(async () => await indexedDB.databases())).some(
              ({ name }) => name === "cascade-pod:grace-hopper",
            ),
            false,
            "a changed password field makes nothing",
          );
        },
      );
      await page.fill('input[name="username"]', "someone-else");
      await page.fill('input[name="word2"]', words[1]!);
      await page.fill('input[name="word5"]', words[4]!);
      await inPlace(page, () =>
        page.click('button:has-text("Make the encrypted pod")'),
      );
      await t.test(
        "refuses a changed pod field and makes nothing",
        async () => {
          assert.match(
            (await page.textContent("main")) ?? "",
            /Pod field must keep the pod's name/,
          );
          assert.equal(
            (await page.evaluate(async () => await indexedDB.databases())).some(
              ({ name }) => name === "cascade-pod:grace-hopper",
            ),
            false,
            "a changed pod field makes nothing",
          );
        },
      );

      await page.fill('input[name="word2"]', words[1]!);
      await page.fill('input[name="word5"]', "wrong");
      await inPlace(page, () =>
        page.click('button:has-text("Make the encrypted pod")'),
      );
      await t.test(
        "refuses wrong words 2 and 5 and makes nothing",
        async () => {
          assert.match(
            (await page.textContent("main")) ?? "",
            /Those aren't words 2 and 5/,
          );
          assert.equal(
            (await page.evaluate(async () => await indexedDB.databases())).some(
              ({ name }) => name === "cascade-pod:grace-hopper",
            ),
            false,
            "a wrong check makes nothing",
          );
        },
      );

      await page.fill('input[name="word2"]', words[1]!);
      await page.fill('input[name="word5"]', words[4]!);
      await inPlace(page, () =>
        page.click('button:has-text("Make the encrypted pod")'),
      );
      await t.test("makes the pod once words 2 and 5 are typed", async () => {
        assert.equal(AT.podOf(page.url()), "grace-hopper");
      });
      await t.test("never puts a word in the address", async () => {
        for (const address of [addressBefore, page.url()])
          for (const word of words)
            assert.equal(
              new RegExp(String.raw`\b${word}\b`, "i").test(address),
              false,
              `the word ${word} is in the address ${address}`,
            );
      });
      const keptAfter = await wordsKept(page, words);
      await t.test(
        "never puts the words in localStorage or sessionStorage",
        async () => {
          assert.deepEqual(
            keptBefore,
            [],
            "the words are never in local or session storage",
          );
          assert.deepEqual(keptAfter, []);
        },
      );
      await t.test(
        "offers the words to the browser's password manager once",
        async () => {
          assert.deepEqual(
            await page.evaluate(
              () =>
                (globalThis as unknown as { offered: unknown[] })
                  .offered as object[],
            ),
            [
              {
                id: "grace-hopper",
                name: "grace-hopper",
                password: words.join(" "),
              },
            ],
            "the browser's password manager is offered the words, once",
          );
        },
      );

      const databases: {
        database: string;
        stored: { key: string; text: string }[];
      }[] = [];
      for (const database of [
        "cascade-pod:grace-hopper",
        "cascade-answers:grace-hopper",
      ]) {
        const stored = await storedIn(page, database);
        assert.ok(stored.length > 0, `${database} holds values`);
        databases.push({ database, stored });
      }
      await t.test(
        "keeps nothing readable in the pod's database or its answers'",
        async () => {
          for (const { stored } of databases)
            for (const { key, text } of stored) {
              if (key === "settings/encryption.json") continue;
              assert.ok(text.length > 0, key);
              for (const readable of ["@prefix", "Grace", '"title"', '"rows"'])
                assert.equal(
                  text.includes(readable),
                  false,
                  `${key}: ${readable}`,
                );
              assert.throws(() => JSON.parse(text), `${key} parses as JSON`);
            }
        },
      );

      await page.goto(`${served.url}${AT.pod("grace-hopper")}`);
      await settled(page);
      await page.fill('input[name="password"]', "one two three four five six");
      await inPlace(page, () => page.click('button:has-text("Open this pod")'));
      await t.test("refuses other words after a reload", async () => {
        assert.match(
          (await page.textContent("main")) ?? "",
          /don't open this pod/,
        );
      });
      await page.fill('input[name="password"]', words.join(" "));
      await inPlace(page, () => page.click('button:has-text("Open this pod")'));
      await t.test(
        "opens the pod with its six words after a reload",
        async () => {
          assert.match((await page.textContent("main")) ?? "", /Grace Hopper/);
        },
      );
    } finally {
      await context.close();
    }
  });
});

describe("Speed of a first visit to try/ · FIRST_VISIT_NAMES_BUDGET_MS", () => {
  test("with a fresh browser, three times", async (t) => {
    const names: number[] = [];
    for (let at = 0; at < SAMPLES; at += 1) {
      const first = await browser.newContext();
      try {
        await first.addInitScript(recordDraws);
        const fresh = watched(await first.newPage());
        await fresh.goto(`${served.url}${AT.home}`);
        names.push(await drawnAt(fresh, "names"));
      } finally {
        await first.close();
      }
    }
    await t.test(
      "draws the tables' names on Alex Rivera's page within twice the budget, at the median",
      async () => {
        withinBudget(
          "a first visit, until the tables' names are drawn",
          names,
          FIRST_VISIT_NAMES_BUDGET_MS,
        );
      },
    );
  });
});
