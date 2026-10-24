// The starter, made by the command from create-cascade-app's tarball and used as a person would, in a new folder under
// the current one. `node starter.ts <tarball> [--runtime <cascade-runtime tarball>]` before a merge, the made app on
// the template's pinned runtime unless another is given; `node starter.ts --release <commit>` once that commit's
// release exists. Run from the repository after `npm ci` and `npm run build`. `--with chat,mcp` makes the app with
// those add-ons and checks only what an add-on can change. `--only <behaviour>` runs only the behaviours whose name
// holds that text, after making the app.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { argv, cwd, env, execPath, kill, platform, stdout } from "node:process";
import { pathToFileURL, URL } from "node:url";
import { setTimeout } from "node:timers";
import { parseArgs } from "node:util";
import * as oxigraph from "oxigraph";
import { chromium } from "playwright";
import { codeStems, terms } from "cascade-runtime/terms";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { answerSignIn } from "@the-cascade-protocol/sandbox/testing";
import {
  agentPrompt,
  KITS,
  releaseAddress,
  startLine,
} from "../dist/create/src/create.js";
import {
  drawn,
  readable,
  settled,
  tiles,
  watched,
} from "../dist/test-browser/shown.js";

/** What the tables the app holds now name each code, set once the app is installed. */
let heldNames: (
  codes: readonly string[],
) => Promise<
  Map<string, { name?: { label: string; origin: string } } | undefined>
> = async () => new Map();
/** The series of the tables the app holds, each with its versions. */
let heldSeries: () => Promise<
  {
    label: string;
    versions: { iri: string; label?: string }[];
  }[]
> = async () => [];

/** A Turtle file's triples, each as its subject, predicate and object. */
const turtle = (bytes, base) =>
  oxigraph
    .parse(bytes, { format: "text/turtle", base_iri: base })
    .map(({ subject, predicate, object }) => [subject, predicate, object]);

const KIT = "conformance/alex-rivera";
const PRIYA = "conformance/priya-natarajan";
const MARTIN = "conformance/martin-okafor";
const MY_VARIANTS = "pod/My genetic variants";
const REPORTS = "pod/What each report says of a variant";
const PREF_LABEL = "http://www.w3.org/2004/02/skos/core#prefLabel";
const COUNSELLOR =
  "Your clinician or a genetic counsellor can explain what this means for you.";
const DIFFERS = "Differs";
const ACMG = [
  terms.Pathogenic,
  terms.LikelyPathogenic,
  terms.UncertainSignificance,
  terms.LikelyBenign,
  terms.Benign,
];
const DIGITS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];
const MEDICATIONS = "pod/My active medications";
const ALLERGIES = "pod/My active allergies";
const REVIEW = "entry/What needs review";
const SOURCES = "entry/Where it came from";
const ROWAN = "Rowan Ellery Marsh";
const INES = "Ines Calloway";
const idOf = (entry) => entry.split(":").at(-1);
/** The question each tile of a pod's page counts, by the tile's title. */
const TILES = {
  Allergies: ALLERGIES,
  Medications: MEDICATIONS,
  Conditions: "pod/My active conditions",
  "Lab results": "pod/My lab results",
  Immunizations: "pod/My immunizations",
  Procedures: "pod/My procedures",
};
const JUDGMENTS = "pod/How many judgments count";
const IMPORTS = "pod/What each import brought in";
const C_CDA = "kestrel-harbor-health-summary.xml";
const MINUTES = 60 * 1000;
/** How long a click that submits waits for what it starts, a reset of every pod the longest. */
const SUBMIT = { timeout: 5 * MINUTES };
const { fetch } = globalThis;

const { values, positionals } = parseArgs({
  args: argv.slice(2),
  options: {
    release: { type: "string" },
    runtime: { type: "string" },
    only: { type: "string" },
    with: { type: "string" },
  },
  allowPositionals: true,
});
const release = values.release;
const only = values.only;
/** The add-ons the app is made with, as `--with` names them to the command. */
const added = (values.with ?? "").split(",").filter(Boolean);
const withAdded = added.length === 0 ? [] : ["--with", added.join(",")];
const tarball =
  positionals[0] === undefined ? undefined : resolve(positionals[0]);
const runtime =
  values.runtime === undefined ? undefined : resolve(values.runtime);
if (
  (release === undefined) === (tarball === undefined) ||
  (release !== undefined && runtime !== undefined)
)
  throw new Error(
    "usage: node starter.ts <tarball> [--runtime <tarball>] [--with <add-on>,…] [--only <behaviour>] | node starter.ts --release <commit> [--with <add-on>,…] [--only <behaviour>]",
  );
const PIN = JSON.parse(
  await readFile(new URL("../app/package.json", import.meta.url), "utf8"),
).dependencies["cascade-runtime"];

const work = await mkdtemp(join(cwd(), "starter-"));
const app = join(work, "my-app");

function npmScript(name) {
  const found = [
    join(dirname(execPath), "node_modules", "npm", "bin", name),
    join(dirname(execPath), "..", "lib", "node_modules", "npm", "bin", name),
  ].find((path) => existsSync(path));
  if (found === undefined) throw new Error(`no ${name} beside ${execPath}`);
  return found;
}
const NPM = npmScript("npm-cli.js");
const NPX = npmScript("npx-cli.js");

/** How a command ended, and all it wrote. */
interface Ran {
  code: number | null;
  out: string;
  err: string;
}

/** A command run to its end, its standard input a pipe never written, its output logged. */
function run(
  command: string,
  args: readonly string[],
  options: object = {},
): Promise<Ran> {
  stdout.write(`\n$ ${[command, ...args].join(" ")}\n`);
  return new Promise((done, failed) => {
    const child = spawn(command, args, {
      cwd: app,
      timeout: 10 * MINUTES,
      ...options,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", failed);
    child.on("close", (code) => {
      stdout.write(
        `${out}${err === "" ? "" : `[stderr]\n${err}`}[exit ${code}]\n`,
      );
      done({ code, out, err });
    });
  });
}

const npm = (...args: string[]) => run(execPath, [NPM, ...args]);

/** The question's rows as `npm run ask` prints them. */
async function asked(question, pod) {
  const { code, out } = await npm(
    "run",
    "--silent",
    "ask",
    "--",
    ...(pod === undefined ? [] : ["--pod", pod]),
    question,
  );
  assert.equal(code, 0, `npm run ask "${question}" failed`);
  return out
    .split(/\r?\n/)
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line));
}

/** The pods' folders, without `.answers`, which keeps their answers. */
async function podsOf() {
  return (await readdir(join(app, "pods")))
    .filter((name) => !name.startsWith("."))
    .sort();
}

function multiset(rows) {
  return rows.map((row) => JSON.stringify(Object.entries(row).sort())).sort();
}

/** `npm start` with `settings` added to its environment, which is expected to stop; gives its exit code and all it wrote. */
async function stoppedAtStart(settings) {
  stdout.write("\n$ npm start (expected to stop)\n");
  const child = spawn(execPath, [NPM, "start"], {
    cwd: app,
    env: { ...env, ...settings, PORT: "0" },
  });
  let wrote = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => (wrote += chunk));
  const code = await new Promise((done) => child.on("close", done));
  return { code, wrote };
}

/**
 * `npm start`, or with `script` `npm run <script>`, on a port the system gives, with `settings` added to its
 * environment, and its address once it serves; `npm start`'s once its demo hospitals listen too.
 */
async function started(settings = {}, script = "start") {
  const args = script === "start" ? ["start"] : ["run", script];
  stdout.write(`\n$ npm ${args.join(" ")} (PORT=0)\n`);
  const child = spawn(execPath, [NPM, ...args], {
    cwd: app,
    env: { ...env, ...settings, PORT: "0" },
    detached: platform !== "win32",
  });
  let out = "";
  child.stderr.on("data", (chunk) => stdout.write(`[server] ${chunk}`));
  const { app: address, demo: listenerAddress } = await new Promise<{
    app: string;
    demo?: string;
  }>((done, failed) => {
    child.stdout.on("data", (chunk) => {
      out += chunk;
      const app = /^(http:\/\/127\.0\.0\.1:\d+\/)$/m.exec(out);
      const demo =
        /^The demo hospitals are listening at (http:\/\/127\.0\.0\.1:\d+\/)$/m.exec(
          out,
        );
      if (app !== null && (demo !== null || script !== "start"))
        done({ app: app[1], demo: demo?.[1] });
    });
    child.on("close", (code) =>
      failed(new Error(`npm ${args.join(" ")} exited ${code}: ${out}`)),
    );
  });
  stdout.write(`serving at ${address}\n`);
  const closed = new Promise((done) => child.on("close", done));
  return {
    address,
    listenerAddress,
    stop: async () => {
      if (platform === "win32")
        execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
      else kill(-child.pid, "SIGTERM");
      await closed;
    },
  };
}

/**
 * The pod API's `operation` at `server`, called as the app's own pages call it, from `from`, its own origin unless
 * another is given: the status it answered and the JSON it gave.
 */
async function called(server, operation, input = {}, from = undefined) {
  const origin = from ?? new URL(server.address).origin;
  const answer = await fetch(new URL(`/api/${operation}`, server.address), {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return { status: answer.status, body: await answer.json().catch(() => ({})) };
}

/** What the pod API's `operation` at `server` gives for `input`, which it must not refuse. */
async function api(server, operation, input = {}) {
  const { status, body } = await called(server, operation, input);
  assert.equal(
    status,
    200,
    `${operation} ${JSON.stringify(input)} answered ${status}: ${JSON.stringify(body)}`,
  );
  return body;
}

/** The browser the app's pages are read in, launched for the first page. */
/** @type {import("playwright").Browser | undefined} */
let browser;

/** A new tab of the browser, what goes wrong in it kept for a failure's message. */
async function tab() {
  browser ??= await chromium.launch();
  const page = watched(await browser.newPage());
  page.setDefaultTimeout(2 * MINUTES);
  return page;
}

/** `page` gone to `path` of the app at `server`, once it is drawn. */
async function opened(page, server, path) {
  await page.goto(new URL(path, server.address).href);
  await drawn(page);
  return page;
}

/** The page's heading, as its text. */
async function heading(page) {
  return ((await page.locator("h1").first().textContent()) ?? "").trim();
}

/** Each item of the page's lists, as its text. */
function items(page) {
  return page.$$eval("li", (found) =>
    found.map((item) => (item.textContent ?? "").trim()),
  );
}

/** The `href` of each link of the page that `selector` finds, as written. */
function hrefsOf(page, selector = "a[href]") {
  return page.$$eval(selector, (found) =>
    found.map((link) => link.getAttribute("href")),
  );
}

/** The text of the first row of the page's tables that links to `href`, or "" when none does. */
async function rowLinking(page, href) {
  const row = page
    .locator("tr", { has: page.locator(`a[href="${href}"]`) })
    .first();
  return (await row.count()) === 0 ? "" : ((await row.textContent()) ?? "");
}

/** The address of an entry of the pod: its page. */
const entryAt = (pod, id) => `/pods/${pod}/entries/${encodeURIComponent(id)}`;

/** Each line `worth_a_look` gives for the pod, as the address of its entry's page, its sentence and its tag. */
async function worthOf(server, pod) {
  const { value } = await api(server, "tool", { pod, tool: "worth_a_look" });
  return value.map(({ entry, sentence, tag }) => ({
    href: entryAt(pod, entry),
    sentence,
    tag: tag ?? "",
  }));
}

/** Whether the pod's page, open in `page`, shows Worth a look as `lines`: each line linking to its entry, in order. */
async function showsWorth(page, lines) {
  assert.deepEqual(
    await hrefsOf(page, ".worth li a[href]"),
    lines.map(({ href }) => href),
    "the page's Worth a look is not worth_a_look's lines",
  );
}

/** Reports oldest first, an undated one after the dated, as the page orders them. */
const undatedLast = (a, b) =>
  a.date === undefined || b.date === undefined
    ? Number(a.date === undefined) - Number(b.date === undefined)
    : a.date.localeCompare(b.date);

/** Whether `text` names the hospital: by its whole name, or by its first words, two at least. */
function names(text, hospital) {
  const words = hospital.split(" ");
  return words.some(
    (_, at) => at > 0 && text.includes(words.slice(0, at + 1).join(" ")),
  );
}

/**
 * The pod's page reads as a record: the person's name as a heading, a tile per kind with rows counting that question's
 * rows, each allergen, and no IRI or address in what a person reads. Resolves the page and the rows by question.
 */
async function pageShows(page, server, pod, person) {
  await opened(page, server, `/pods/${pod}/`);
  assert.equal(await heading(page), person, `the heading of ${pod}`);
  const text = await readable(page);
  for (const scheme of ["urn:", "ni:", "http://", "https://"])
    assert.ok(!text.includes(scheme), `the page of ${pod} shows ${scheme}`);
  const shown = await tiles(page);
  const rows = {};
  for (const [kind, question] of Object.entries(TILES)) {
    rows[question] = await asked(question, pod);
    assert.equal(
      shown.get(kind),
      rows[question].length === 0 ? undefined : rows[question].length,
      `the ${kind} tile of ${pod}`,
    );
  }
  const named = await heldNames(
    rows[ALLERGIES].flatMap(({ code }) => (code === undefined ? [] : [code])),
  );
  for (const { allergen, code } of rows[ALLERGIES]) {
    const shown = named.get(code)?.name?.label ?? allergen;
    assert.ok(text.includes(shown), `no ${shown} on ${pod}`);
  }
  return { rows };
}

/** How long the crawl gives a page to draw; one that does not fails the crawl at once, not after the rest. */
const DRAW_WITHIN = 30_000;

/**
 * The page at `address` in `page`, once drawn: the status it answered, the address it ended at, each `<a href>` of it
 * as written and each `id` an element of it has (forms are not links), what it reads, and what its error says.
 */
async function rendered(page, address) {
  try {
    const answer = await page.goto(address);
    await drawn(page, DRAW_WITHIN);
    const { hrefs, ids, said, found } = await page.evaluate(() => {
      const { document } = globalThis;
      return {
        hrefs: [...document.querySelectorAll("a[href]")].map((link) =>
          link.getAttribute("href"),
        ),
        ids: [...document.querySelectorAll("[id]")].map(({ id }) => id),
        said: document.querySelector("main pre")?.textContent ?? undefined,
        found:
          document.querySelector("h1")?.textContent?.trim() !== "Not found",
      };
    });
    return {
      status: found ? answer?.status() : "a page saying Not found",
      final: new URL(page.url()),
      hrefs,
      ids: new Set(ids),
      text: await readable(page),
      said,
    };
  } catch (error) {
    if (String(error?.message).includes("was never drawn")) throw error;
    return { status: String(error), hrefs: [], ids: new Set(), text: "" };
  }
}

/** `work` on each of `items`, at most `limit` at once, in the order of `items`. */
async function eachAtOnce(items, limit, work) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const at = next++;
        results[at] = await work(items[at]);
      }
    }),
  );
  return results;
}

const MOST_PAGES = 2000;

/**
 * Every same-origin link reached from the pages at `roots`, each page drawn once in the browser by its address without
 * the fragment, four at a time. A page under a root's path has its own links followed; any other page is drawn and its
 * links not followed. A link is dead when it does not answer 200 after its redirects, or its page says Not found, or it
 * names a fragment no element of its page has as an id.
 */
async function crawled(server, roots) {
  const origin = new URL(server.address).origin;
  const under = roots.map((root) => new URL(root, origin).pathname);
  const pages = new Map();
  const links = [];
  let lastToAdd = roots[0];
  let frontier = roots.map((root) => new URL(root, origin).href);
  const idle = await Promise.all(Array.from({ length: 4 }, () => tab()));
  const all = [...idle];
  try {
    while (frontier.length > 0) {
      const fetchedNow = frontier;
      await eachAtOnce(fetchedNow, idle.length, async (address) => {
        const page = idle.pop();
        try {
          pages.set(address, await rendered(page, address));
        } finally {
          idle.push(page);
        }
      });
      frontier = [];
      for (const address of fetchedNow) {
        const page = pages.get(address);
        const answered = page.final?.pathname;
        if (
          answered === undefined ||
          !under.some((root) => answered.startsWith(root))
        )
          continue;
        for (const href of page.hrefs) {
          if (href === "#") continue;
          const to = new URL(href, page.final);
          if (to.origin !== origin) continue;
          const fragment = decodeURIComponent(to.hash.slice(1));
          to.hash = "";
          links.push({ on: address, href, target: to.href, fragment });
          if (!pages.has(to.href) && !frontier.includes(to.href)) {
            frontier.push(to.href);
            lastToAdd = address;
          }
        }
      }
      if (pages.size + frontier.length > MOST_PAGES)
        throw new Error(
          `The crawl passed ${MOST_PAGES} pages and is not ending; the last page to add a new address was ${lastToAdd}`,
        );
    }
  } finally {
    await Promise.all(all.map((page) => page.close()));
  }
  const dead = links.flatMap(({ on, href, target, fragment }) => {
    const reached = pages.get(target);
    if (reached.status !== 200)
      return [
        `${on} links ${href}, which answered ${reached.status}${reached.said === undefined ? "" : `: ${reached.said}`}`,
      ];
    return fragment === "" || reached.ids.has(fragment)
      ? []
      : [`${on} links ${href}, whose page has no element #${fragment}`];
  });
  return { pages, dead, links: links.length };
}

/** Each box the pod's page open in `page` holds for a tile, by its id, and whether it opens an entry. */
function tileBoxes(page) {
  return page.$$eval('.dialog[id^="see-"]', (boxes) =>
    boxes.map((box) => ({
      id: box.id,
      opensEntry: [...box.querySelectorAll("a[href]")].some((link) =>
        (link.getAttribute("href") ?? "").includes("/entries/"),
      ),
    })),
  );
}

/** The steps `pod:load` printed, by name, in order. */
function loadedSteps(out) {
  return out
    .split(/\r?\n/)
    .map((line) => /^(\S+) \(\w+\) wrote /.exec(line)?.[1])
    .filter((step) => step !== undefined);
}

/**
 * What the app should show of patient A at Cascade North, worked out in the app with the packages it installed:
 * North's row, its patients, `look` over A's pull made with no person, and the allergens that pull brings into a new
 * pod.
 */
async function expectedPull() {
  const script = `
import { brandsBundle, demoHospital, recordsAt } from "@the-cascade-protocol/sandbox";
import { loadHospital } from "@the-cascade-protocol/sandbox/node";
import { answerSignIn } from "@the-cascade-protocol/sandbox/testing";
import { connect, DEMO_PLAN, directoryOf, openPod, pull, pullFiles } from "cascade-runtime";
const patient = "pt-1001";
const north = await loadHospital("cascade-north");
const hospital = demoHospital(north);
const fetch = (input, init) => hospital(new Request(input, init));
const [row] = directoryOf(brandsBundle([north.hospital], new Date().toISOString()), "demo");
const connection = await connect(
  row,
  { clientId: "check", redirectUri: "http://127.0.0.1:1/callback", scopes: ["launch/patient", "patient/*.read"] },
  { fetch, signIn: (authorize) => answerSignIn(fetch, authorize, patient) },
);
const pod = await openPod();
const files = pullFiles(await pull(connection, DEMO_PLAN), "expected");
const look = await pod.look(files);
await pod.import(files, { aboutSubject: true });
const allergens = (await pod.ask(${JSON.stringify(ALLERGIES)})).map(({ allergen }) => allergen).sort();
await pod.close();
const south = await loadHospital("cascade-south");
const named = (data, person) =>
  Object.keys(data.patients).find((id) => {
    const { name } = recordsAt(data.patients[id]).find(({ resourceType }) => resourceType === "Patient");
    return [...name[0].given, name[0].family].join(" ") === person;
  });
const rowan = [north, south].map((data) => ({
  hospital: data.hospital.name,
  fhirBase: data.hospital.fhirBase,
  patient: named(data, ${JSON.stringify(ROWAN)}),
}));
const ines = { fhirBase: north.hospital.fhirBase, patient: named(north, ${JSON.stringify(INES)}) };
const familyFirst = (data, id) => {
  const { name } = recordsAt(data.patients[id]).find(({ resourceType }) => resourceType === "Patient");
  return [name[0].family, name[0].given.join(" ")].filter(Boolean).join(", ");
};
const choices = { rowan: familyFirst(north, rowan[0].patient), ines: familyFirst(north, ines.patient) };
console.log(JSON.stringify({ row, patient, patients: Object.keys(north.patients), look, allergens, rowan, ines, choices }));
`;
  // A file, not `--eval`: the import's Bridge runs in a worker, which inherits node's flags, and `--input-type` there
  // refuses its file.
  const file = join(app, "expected-pull.mjs");
  await writeFile(file, script);
  const { code, out } = await run(execPath, [file]);
  assert.equal(code, 0, "the expected pull failed");
  return JSON.parse(out.trim().split(/\r?\n/).at(-1));
}

/**
 * Checks the behaviour `name`; with `--only`, only when its name holds `--only`'s text. With `--with` and no `--only`,
 * only a behaviour an add-on can change, which `addOnBehaviour` checks: an add-on adds files, and reaches the base only
 * through its packages and scripts, the server's `/chat` and the page's chat window, so the run without `--with`
 * checks every other behaviour on the same code. The window sits on every page, so a behaviour that presses a page
 * control with a real click (the File menu's, Check now, a hospital's Sign in) runs with the add-ons too.
 */
async function behaviour(
  name: string,
  check: () => Promise<void>,
  addOnsChangeIt = false,
) {
  stdout.write(`\n# ${name}\n`);
  if (only !== undefined && !name.includes(only)) {
    stdout.write(`skip - not ${only}\n`);
    return;
  }
  if (only === undefined && added.length > 0 && !addOnsChangeIt) {
    stdout.write("skip - no add-on changes it\n");
    return;
  }
  await check();
  stdout.write(`ok - ${name}\n`);
}

/** Checks the behaviour `name`, which an add-on can change, with `--with` too. */
async function addOnBehaviour(name: string, check: () => Promise<void>) {
  await behaviour(name, check, true);
}

/** Checks the behaviour `name`, which sets up what the behaviours after it need: with `--only` too. */
async function setUp(name: string, check: () => Promise<void>) {
  stdout.write(`\n# ${name}\n`);
  await check();
  stdout.write(`ok - ${name}\n`);
}

let story;
let alex;
let fresh;

await setUp("the command makes the app", async () => {
  const { code, out } =
    release === undefined
      ? await run(
          execPath,
          [
            NPX,
            "--yes",
            `--package=${tarball}`,
            "create-cascade-app",
            "my-app",
            ...withAdded,
            ...(runtime === undefined ? [] : ["--tarball", runtime]),
          ],
          { cwd: work },
        )
      : await run(
          [startLine(releaseAddress(release), "my-app"), ...withAdded].join(
            " ",
          ),
          [],
          { cwd: work, shell: true },
        );
  assert.equal(code, 0, "the command failed");
  assert.ok(out.includes(agentPrompt("my-app")), "no agent prompt");
  assert.deepEqual(await podsOf(), [...KITS].sort());
  const loads = [
    ...out.matchAll(/Loading the pod (\S+),[^\n]*? loaded in ([\d.]+) s/g),
  ];
  assert.deepEqual(
    loads.map(([, pod]) => pod),
    KITS,
  );
  stdout.write(
    `\nthe loads took ${loads.map(([, pod, seconds]) => `${pod} ${seconds} s`).join(", ")}\n`,
  );
  fresh = {
    judgments: await asked(JUDGMENTS, "alex-rivera"),
    imports: (await asked(IMPORTS, "alex-rivera")).length,
  };
  const fixtures = await import(
    pathToFileURL(
      createRequire(join(app, "package.json")).resolve(
        "cascade-runtime/fixtures",
      ),
    ).href
  );
  const held = await fixtures.heldTables(join(app, "pods", ".tables"));
  heldNames = (codes) => held.about(codes);
  heldSeries = () => held.held();
  const vocabulary = resolve(
    await fixtures.kitFolder("alex-rivera"),
    "..",
    "..",
  );
  const kit = (through?: string) =>
    fixtures.kitStory("alex-rivera", through === undefined ? {} : { through });
  const whole = await kit();
  const e15 = whole.steps.findIndex(({ name }) => name === "E15");
  assert.ok(e15 > 0, "Alex's story has no E15 after a first step");
  const through = whole.steps[e15 - 1].name;
  const triples = turtle(
    await readFile(join(vocabulary, KIT, "expected", "allergies.ttl")),
    `file:///${KIT}/expected/allergies.ttl`,
  );
  const active = new Set(
    triples
      .filter(
        ([, p, o]) =>
          p.value === terms.statusOf.AllergyOrIntolerance &&
          o.value === "active",
      )
      .map(([s]) => s.value),
  );
  story = {
    vocabulary,
    e15: whole.steps[e15].when,
    through,
    throughSteps: (await kit(through)).steps
      .filter(({ happened }) => !["reference", "open"].includes(happened.kind))
      .map(({ name }) => name),
    activeAllergens: triples
      .filter(([s, p]) => active.has(s.value) && p.value === terms.allergen)
      .map(([, , o]) => o.value)
      .sort(),
  };
});

await addOnBehaviour(
  "the app runs on the pinned runtime, or the one given, and installs with no git: each package is the runtime or bundled in it, the demo hospital beside the app, or from npm's registry",
  async () => {
    const { dependencies } = JSON.parse(
      await readFile(join(app, "package.json"), "utf8"),
    );
    assert.equal(
      dependencies["cascade-runtime"],
      runtime === undefined ? PIN : `file:${runtime.replaceAll("\\", "/")}`,
    );
    assert.equal(
      dependencies["@the-cascade-protocol/sandbox"],
      "file:demo-hospital",
    );
    const { packages } = JSON.parse(
      await readFile(join(app, "package-lock.json"), "utf8"),
    ) as {
      packages: Record<
        string,
        { inBundle?: boolean; resolved?: string; link?: boolean }
      >;
    };
    const sandbox = packages["node_modules/@the-cascade-protocol/sandbox"];
    assert.deepEqual(
      [sandbox?.link, sandbox?.resolved],
      [true, "demo-hospital"],
      "the demo hospital is not linked from beside the app",
    );
    assert.doesNotMatch(
      packages["node_modules/cascade-runtime"]?.resolved ?? "",
      /^git|^github:|^ssh:/,
    );
    const elsewhere = Object.entries(packages)
      .filter(
        ([path, entry]) =>
          ![
            "",
            "demo-hospital",
            "node_modules/cascade-runtime",
            "node_modules/@the-cascade-protocol/sandbox",
          ].includes(path) &&
          entry.inBundle !== true &&
          !entry.resolved?.startsWith("https://registry.npmjs.org/"),
      )
      .map(([path, entry]) => `${path} came from ${entry.resolved}`);
    assert.deepEqual(elsewhere, []);
  },
);

await addOnBehaviour("help lists every command", async () => {
  const { code, out } = await npm("run", "--silent", "help");
  assert.equal(code, 0, "npm run help failed");
  const { scripts } = JSON.parse(
    await readFile(join(app, "package.json"), "utf8"),
  );
  const listed = out
    .split(/\r?\n/)
    .filter((line) => line.startsWith("  npm "))
    .map((line) => {
      const [command, what] = line.trim().split(/\s{2,}/);
      const [, word, script] = command.split(" ");
      return [word === "run" ? script : word, what];
    });
  assert.deepEqual(
    listed.map(([script]) => script),
    Object.keys(scripts),
  );
  for (const [script, what] of listed)
    assert.ok(what !== undefined, `help says nothing of ${script}`);
});

await addOnBehaviour("the app's own tests pass: npm test", async () => {
  const { code, out, err } = await npm("test");
  assert.equal(code, 0, `npm test failed:\n${out}\n${err}`);
});

await addOnBehaviour(
  "the app's browser test passes: npm run test:e2e",
  async () => {
    const { code, out, err } = await npm("run", "test:e2e");
    assert.equal(code, 0, `npm run test:e2e failed:\n${out}\n${err}`);
  },
);

const server = await (async () => {
  let server: Awaited<ReturnType<typeof started>>;
  await setUp("a loaded pod is shown", async () => {
    server = await started();
    const page = await tab();
    await page.goto(new URL("/", server.address).href);
    await page.waitForURL((url) => url.pathname === "/pods/alex-rivera/");
    const shown = await pageShows(page, server, "alex-rivera", "Alex Rivera");
    alex = shown.rows;
    assert.deepEqual(
      alex[ALLERGIES].map(({ allergen }) => allergen).sort(),
      story.activeAllergens,
    );
    const sources = await asked(SOURCES, "alex-rivera");
    const said = await items(page);
    for (const hospital of new Set(
      sources.flatMap((row) => row.hospital ?? []),
    ))
      assert.ok(said.includes(hospital), `no place ${hospital}`);
    assert.ok(said.includes("Alex's own entries"), "no place for Alex's own");
    const penicillin = new Set(
      sources
        .filter(({ entryLabel }) => entryLabel === "Allergy entry · Penicillin")
        .map(({ hospital }) => hospital),
    );
    assert.ok(penicillin.size > 1, "Alex's penicillin is from one place");
    assert.ok(
      !said.some((sentence) =>
        sentence.startsWith("Penicillin was recorded at"),
      ),
      "the pod's page still says where penicillin was recorded",
    );
    const review = await asked(REVIEW, "alex-rivera");
    assert.ok(
      review.some(
        ({ entryLabel, needs }) =>
          entryLabel === "Allergy entry · Sulfamethoxazole" &&
          needs === "members disagree on criticality",
      ),
      "no entry where the hospitals disagree on Sulfamethoxazole's criticality",
    );

    const alexAt = (id) => entryAt("alex-rivera", id);
    const opens = await hrefsOf(
      page,
      'td[data-key] > a[href^="/pods/alex-rivera/entries/"]',
    );
    assert.deepEqual(
      [...new Set(opens)].sort(),
      [
        ...new Set(
          Object.values(TILES).flatMap((question) =>
            alex[question].map(({ entry }) => alexAt(idOf(entry))),
          ),
        ),
      ].sort(),
      "a tile row does not open its entry",
    );
    const sulfa = "Allergy entry · Sulfamethoxazole";
    const sulfaHref = alexAt(
      idOf(sources.find((row) => row.entryLabel === sulfa).entry),
    );
    const worth = await worthOf(server, "alex-rivera");
    assert.ok(
      worth.some(
        ({ href, sentence, tag }) =>
          href === sulfaHref &&
          /^Sources disagree on how severe the .* allergy is\.$/.test(
            sentence,
          ) &&
          tag === "Needs review",
      ),
      "Worth a look has no line for Sulfamethoxazole linking to its entry, tagged Needs review",
    );
    await showsWorth(page, worth);
    assert.ok(
      (await rowLinking(page, sulfaHref)).includes("Needs review"),
      "Sulfamethoxazole's row does not carry Needs review",
    );
    const entryOf = async (label) =>
      opened(
        page,
        server,
        alexAt(idOf(sources.find((row) => row.entryLabel === label).entry)),
      );

    const penicillinPage = await entryOf("Allergy entry · Penicillin");
    const penicillinRow = alex[ALLERGIES].find(
      ({ entry }) =>
        entry ===
        sources.find((row) => row.entryLabel === "Allergy entry · Penicillin")
          .entry,
    );
    const penicillinName =
      (
        await heldNames(
          penicillinRow.code === undefined ? [] : [penicillinRow.code],
        )
      ).get(penicillinRow.code)?.name?.label ?? penicillinRow.allergen;
    const penicillinHeading = await heading(penicillinPage);
    assert.ok(
      penicillinHeading.startsWith(penicillinName),
      `penicillin's entry is headed ${penicillinHeading}`,
    );
    const penicillinText = await readable(penicillinPage);
    for (const hospital of [...penicillin].filter(Boolean))
      assert.ok(
        penicillinText.includes(hospital),
        `penicillin's entry omits ${hospital}`,
      );
    assert.ok(
      (await items(penicillinPage)).some(
        (sentence) =>
          sentence.startsWith("Cascade recorded it at") &&
          [...penicillin]
            .filter(Boolean)
            .every((hospital) => sentence.includes(hospital)),
      ),
      "penicillin's entry does not say it was recorded at each of its places",
    );
    for (const scheme of ["urn:", "ni:", "http://", "https://"])
      assert.ok(
        !penicillinText.includes(scheme),
        `penicillin's entry shows ${scheme}`,
      );
    const sulfaPage = await entryOf(sulfa);
    assert.ok(
      (await items(sulfaPage)).some((sentence) =>
        /^Sources disagree on how severe the .* allergy is\. Needs review$/.test(
          sentence,
        ),
      ),
      "Sulfamethoxazole's entry does not say the sources disagree",
    );
    assert.ok(
      (await heading(sulfaPage)).endsWith("Needs review"),
      "Sulfamethoxazole's entry is not tagged Needs review",
    );

    const missing = await opened(page, server, alexAt("0"));
    assert.ok(
      (await missing
        .locator('main a[href="/pods/alex-rivera/"]', {
          hasText: /^Back to Alex Rivera$/,
        })
        .count()) > 0,
      "an entry that is not in the pod does not link back",
    );
    assert.ok((await readable(missing)).includes("no longer in this pod"));
    await page.close();
  });
  return server;
})();

try {
  await addOnBehaviour(
    "an add-on is the app's only when added: the chat's /chat and window, the MCP server's npm run mcp and its tools",
    async () => {
      const chat = added.includes("chat");
      const answer = await fetch(new URL("/chat", server.address));
      assert.equal(answer.status, chat ? 200 : 404, "GET /chat");
      if (chat)
        assert.deepEqual(await answer.json(), {}, "a model with none set");
      const page = await tab();
      const asked: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/chat")
          asked.push(request.url());
      });
      await opened(page, server, "/pods/alex-rivera/");
      if (chat) {
        await page.locator(".chat-off").waitFor();
        await drawn(page);
        const covers = await page.evaluate(() => {
          document.scrollingElement?.scrollTo(0, document.body.scrollHeight);
          const layout = document
            .querySelector(".layout")!
            .getBoundingClientRect();
          const chat = document.querySelector(".chat")!.getBoundingClientRect();
          return layout.bottom > chat.top + 1;
        });
        assert.equal(
          covers,
          false,
          "the chat window covers the foot of the page",
        );
      } else {
        // A host with a chat asks GET /chat as it mounts and loads the window's chunk; both are done once the network idles.
        await page.waitForLoadState("networkidle");
        assert.deepEqual(asked, [], "the page asked /chat for a model");
        assert.equal(await page.locator(".chat").count(), 0, "a chat");
      }
      assert.equal(
        await page.locator("[data-ask]").count(),
        0,
        "an Ask about this with no model to ask",
      );
      await page.close();
      const { scripts } = JSON.parse(
        await readFile(join(app, "package.json"), "utf8"),
      );
      assert.equal("mcp" in scripts, added.includes("mcp"), "npm run mcp");
      if (!added.includes("mcp")) return;
      const client = new Client({ name: "check", version: "0.0.0" });
      await client.connect(
        new StdioClientTransport({
          command: execPath,
          args: [join(app, "mcp.ts")],
          cwd: app,
        }),
      );
      const { tools } = await client.listTools();
      await client.close();
      stdout.write(
        `npm run mcp lists ${tools.map(({ name }) => name).join(", ")}\n`,
      );
      assert.ok(
        tools.some(({ name }) => name === "list_pods"),
        "npm run mcp lists no list_pods",
      );
    },
  );

  await behaviour(
    "every link on each kit's pod page and its entries opens",
    async () => {
      const roots = KITS.map((kit) => `/pods/${kit}/`);
      const began = Date.now();
      const { pages, dead, links } = await crawled(server, roots);
      stdout.write(
        `followed ${links} links over ${pages.size} pages in ${Date.now() - began} ms\n`,
      );
      assert.equal(dead.length, 0, `dead links:\n${dead.join("\n")}`);
      const page = await tab();
      for (const root of roots) {
        await opened(page, server, root);
        const boxes = await tileBoxes(page);
        assert.equal(
          boxes.length,
          (await tiles(page)).size,
          `${root} holds a box for each tile`,
        );
        for (const { id, opensEntry } of boxes)
          assert.ok(opensEntry, `${root} opens no entry from its ${id} box`);
      }
      await page.close();
      const addresses = [...pages.keys()].map((address) => new URL(address));
      const codePage = addresses.find(
        ({ pathname, searchParams }) =>
          pathname.startsWith("/tables/") && searchParams.has("code"),
      );
      assert.ok(codePage !== undefined, "the crawl reached no code's page");
      assert.ok(
        pages
          .get(codePage.href)
          .text.includes(codePage.searchParams.get("code")),
        `${codePage.pathname + codePage.search} does not show its code`,
      );
      assert.ok(
        addresses.some(
          ({ pathname, searchParams }) =>
            pathname.startsWith("/tables/") && !searchParams.has("code"),
        ),
        "the crawl reached no table's page",
      );
    },
  );
  await behaviour(
    "Tamsin's page says what changed after her metformin stopped, and where that comes from: the pulls in order and the medication's two versions",
    async () => {
      const { changes } = await api(server, "answers", { pod: "tamsin-vale" });
      assert.ok(
        changes.some(
          ({ kind, direction }) => kind === "after stop" && direction === "up",
        ),
        "the pod's answers find no result higher after a medication stopped",
      );
      const tamsin = await opened(await tab(), server, "/pods/tamsin-vale/");
      const page = await readable(tamsin);
      await tamsin.close();
      assert.match(page, /was higher after .+ stopped\./);
      assert.doesNotMatch(page, /urn:/);
      const from = page.indexOf("Where this comes from");
      assert.ok(from >= 0, "the card does not say where it comes from");
      const how = page.slice(from, page.indexOf("These say what", from));
      assert.doesNotMatch(how, /urn:|https?:\/\//);
      assert.match(how, /The pod's records came in 2 imports/);
      assert.match(
        how,
        /From Cascade North, as of 1 February 2024: 5 records\..*From Cascade North, as of 1 February 2025: 4 records, 1 of them a new version of one the pod already held\./,
      );
      assert.match(
        how,
        /version 1 to version 2, in import 2, as of 1 February 2025/,
      );
      assert.match(
        how,
        /Workflow status active → completed; medication use end date none → Apr 15, 2024\./,
      );
    },
  );
  if (release === undefined)
    await behaviour("a pod loaded through a step stops there", async () => {
      const pod = `alex-rivera-${story.through.toLowerCase()}`;
      const { code, out } = await npm(
        "run",
        "pod:load",
        "--",
        "alex-rivera",
        "--through",
        story.through,
        "--as",
        pod,
      );
      assert.equal(code, 0, "pod:load --through failed");
      assert.deepEqual(loadedSteps(out), story.throughSteps);
      const at = Date.parse(story.e15);
      const startedAtE15 = (rows) =>
        rows.some(({ started }) => Date.parse(started) === at);
      assert.equal(startedAtE15(await asked(IMPORTS, pod)), false);
      assert.equal(startedAtE15(await asked(IMPORTS, "alex-rivera")), true);
      const page = await tab();
      const { rows } = await pageShows(
        page,
        server,
        pod,
        `Alex Rivera ${story.through}`,
      );
      assert.deepEqual(multiset(rows[ALLERGIES]), multiset(alex[ALLERGIES]));
      const links = await hrefsOf(page);
      await page.close();
      for (const name of ["alex-rivera", pod])
        assert.ok(links.includes(`/pods/${name}/`), `the pods omit ${name}`);
    });
  await addOnBehaviour(
    "the reference tables are listed under the pods, and Check now says what it did",
    async () => {
      const { checked, held } = await api(server, "checkTables");
      assert.ok(
        Array.isArray(checked) && checked.length > 0,
        "Check now checked no feed",
      );
      assert.ok(held.length > 0, "Check now holds no table");
      const page = await opened(await tab(), server, "/pods/alex-rivera/");
      const aside = (await page.locator("aside").textContent()) ?? "";
      assert.ok(
        aside.indexOf("Reference tables") > aside.indexOf("Alex Rivera"),
        "no reference tables under the pods",
      );
      await page
        .locator("aside")
        .getByRole("button", { name: "Check now" })
        .click(SUBMIT);
      const note = page.locator('main p.note[role="status"]');
      await note.waitFor({ timeout: 2 * MINUTES });
      assert.notEqual(
        ((await note.textContent()) ?? "").trim(),
        "",
        "Check now says nothing",
      );
      await page.close();
    },
  );
  await behaviour(
    "Priya's potassium result is named by LOINC, and the class page puts her amlodipine in its ingredient's class and says FDA classes a different form of her lisinopril, so it has none",
    async () => {
      const POTASSIUM = "Potassium [Moles/volume] in Serum or Plasma";
      const { about } = await api(server, "said", { pod: "priya-natarajan" });
      assert.ok(
        about.some(([, said]) => said.name?.label === POTASSIUM),
        "the tables do not name her potassium result by LOINC",
      );
      const known = await api(server, "classes", { pod: "priya-natarajan" });
      const labelOf = new Map(
        known.classes.map(([code, said]) => [code, said.name?.label]),
      );
      assert.ok(
        known.rows.some(
          (row) =>
            row.medication === "amlodipine 5 MG Oral Tablet" &&
            labelOf.get(row.class) === "Calcium Channel Blocker [EPC]" &&
            labelOf.get(row.through) === "amlodipine",
        ),
        "amlodipine is not in its ingredient's class",
      );
      const lisinopril = known.medications.find(({ medication }) =>
        medication.startsWith("lisinopril"),
      );
      assert.deepEqual(
        new Map(known.elsewhere).get(lisinopril.code),
        ["lisinopril"],
        "lisinopril is not said to be classed in a different form",
      );
      assert.ok(
        !known.rows.some(({ entry }) => entry === lisinopril.entry),
        "lisinopril has a class",
      );
      const page = await opened(await tab(), server, "/pods/priya-natarajan/");
      const pod = await readable(page);
      assert.ok(
        pod.includes(POTASSIUM),
        "her potassium result is not named by LOINC",
      );
      assert.ok(
        pod.includes("By class"),
        "her Medications tile does not offer the class view",
      );
      const classes = await readable(
        await opened(page, server, "/pods/priya-natarajan/classes"),
      );
      await page.close();
      for (const said of [
        "Calcium Channel Blocker [EPC]",
        "amlodipine 5 MG Oral Tablet through amlodipine",
        "lisinopril 10 MG Oral Tablet: FDA classes a different form of lisinopril; RxNorm does not tie this product to it.",
      ])
        assert.ok(classes.includes(said), `${said} is not on ${classes}`);
      assert.ok(
        !classes.includes("Angiotensin Converting Enzyme Inhibitor [EPC]"),
        "lisinopril is given the class FDA gives lisinopril anhydrous",
      );
    },
  );
  await behaviour(
    "from her potassium result a person opens the electrolytes panel and sees her potassium with its place and requirement, and the required tests she has no result for",
    async () => {
      const ELECTROLYTES = "24326-1";
      const page = await opened(await tab(), server, "/pods/priya-natarajan/");
      const entry = await page
        .locator('a[href*="/entries/"]', { hasText: "Potassium" })
        .first()
        .getAttribute("href");
      assert.ok(entry, "her page links no potassium result");
      const id = decodeURIComponent(entry.split("/").at(-1));
      const { panels } = await api(server, "said", {
        pod: "priya-natarajan",
        entry: id,
      });
      const electrolytes = panels
        .flatMap(({ panels: listed }) => listed)
        .find(({ notation }) => notation === ELECTROLYTES);
      assert.ok(
        electrolytes,
        "her potassium result is in no electrolytes panel",
      );
      const { rows } = await api(server, "panel", {
        pod: "priya-natarajan",
        panel: electrolytes.code,
      });
      assert.ok(
        rows.some(
          (row) =>
            row.entry !== undefined &&
            decodeURIComponent(idOf(row.entry)) === id &&
            row.required === "R",
        ),
        "the panel does not hold her potassium, required",
      );
      assert.ok(
        rows.some((row) => row.entry === undefined && row.required === "R"),
        "the panel misses no required test",
      );
      const result = await opened(page, server, entry);
      assert.ok(
        (await readable(result)).includes("In LOINC panels"),
        "her potassium result names no panel",
      );
      const panel = await result
        .locator(`a[href*="/panel?panel="][href$="${ELECTROLYTES}"]`)
        .first()
        .getAttribute("href");
      assert.ok(panel, "her potassium result links no electrolytes panel");
      const said = await readable(await opened(page, server, panel));
      await page.close();
      for (const expected of [
        "Your results in",
        "Potassium",
        "required",
        "missing: ",
        "No result",
      ])
        assert.ok(said.includes(expected), `${expected} is not on ${said}`);
    },
  );
} finally {
  await server.stop();
}

if (release === undefined) {
  await behaviour(
    "a new pod is empty, its answers are kept beside the pods and are no pod, and a reset removes it and them, or them alone",
    async () => {
      const answers = join(app, "pods", ".answers", "scratch");
      assert.equal((await npm("run", "pod:new", "scratch")).code, 0);
      assert.deepEqual(await asked(ALLERGIES, "scratch"), []);
      assert.ok(
        existsSync(join(answers, "answers.json")),
        "no answer was kept",
      );
      assert.equal((await npm("run", "pod:reset", "scratch")).code, 0);
      assert.equal(existsSync(join(app, "pods", "scratch")), false);
      assert.equal(existsSync(answers), false);
      await mkdir(answers, { recursive: true });
      assert.equal((await npm("run", "pod:reset", "scratch")).code, 0);
      assert.equal(existsSync(answers), false);
      const { code, err } = await npm("run", "ask", ALLERGIES);
      assert.equal(code, 2);
      assert.ok(!err.includes(".answers"), "ask names .answers as a pod");
      for (const name of [
        "alex-rivera",
        `alex-rivera-${story.through.toLowerCase()}`,
      ])
        assert.ok(err.includes(name), `ask does not name ${name}`);
    },
  );

  await behaviour("a kit's download is copied whole", async () => {
    const source = join(
      story.vocabulary,
      `${KIT}/scripted-input/alex/downloads/x-e12/apple_health_export`,
    );
    const filesIn = async (folder) =>
      (await readdir(folder, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => relative(folder, join(entry.parentPath, entry.name)))
        .sort();
    assert.equal(
      (await npm("run", "kit:export", "--", "alex-rivera", "x-e12")).code,
      0,
    );
    const copied = await filesIn(join(app, "apple_health_export"));
    assert.ok(copied.length > 0, "x-e12 holds no files");
    assert.deepEqual(copied, await filesIn(source));
    const { code, err } = await npm(
      "run",
      "kit:export",
      "--",
      "alex-rivera",
      "x-e12",
    );
    assert.equal(code, 2);
    assert.ok(err.includes("apple_health_export exists already"));
  });

  await behaviour(
    "Priya's pod is loaded, and her C-CDA download is copied as its file",
    async () => {
      const view = `${PRIYA}/expected/medications.ttl`;
      const triples = turtle(
        await readFile(join(story.vocabulary, view)),
        `file:///${view}`,
      );
      const active = new Set(
        triples
          .filter(
            ([, p, o]) =>
              p.value === terms.statusOf.PrescribedOrReportedMedication &&
              o.value === "active",
          )
          .map(([s]) => s.value),
      );
      assert.deepEqual(
        (await asked(MEDICATIONS, "priya-natarajan"))
          .map(({ medication }) => medication)
          .sort(),
        triples
          .filter(([s, p]) => active.has(s.value) && p.value === terms.drugName)
          .map(([, , o]) => o.value)
          .sort(),
      );
      assert.equal(
        (await npm("run", "kit:export", "--", "priya-natarajan", C_CDA)).code,
        0,
      );
      const copied = await readFile(join(app, C_CDA), "utf8");
      assert.ok(
        copied.includes("<ClinicalDocument") &&
          copied.includes("<name>Kestrel Harbor Hospital</name>"),
        `${C_CDA} is not Kestrel Harbor's C-CDA`,
      );
    },
  );

  await behaviour(
    "Martin's pod is loaded, its page has a Genetic variants tile whose rows open each variant's entry, and the entry puts what ClinVar says today beside what each of his reports, from its lab, said, in the four states of his variants",
    async () => {
      const triplesOf = async (path) =>
        turtle(await readFile(join(story.vocabulary, path)), `file:///${path}`);
      const objectsOf = (triples, subject, predicate) =>
        triples
          .filter(([s, p]) => s.value === subject && p.value === predicate)
          .map(([, , o]) => o.value);
      const entriesOf = (triples) =>
        [
          ...new Set(
            triples
              .filter(([, p]) => p.value === terms.mergedFrom)
              .map(([s]) => s.value),
          ),
        ].map((entry) => ({
          entry,
          hgvs: objectsOf(triples, entry, terms.hgvsCodingDnaExpression).sort(),
          variations: objectsOf(triples, entry, terms.clinvarVariationId),
          genes: objectsOf(triples, entry, terms.geneSymbol),
        }));
      const titleOf = ({ genes, hgvs, variations }) =>
        [...genes, ...hgvs, ...variations.map((id) => `ClinVar ${id}`)].join(
          " · ",
        );
      const kitVariants = entriesOf(
        await triplesOf(`${MARTIN}/expected/variants.ttl`),
      );
      assert.ok(kitVariants.length > 0, "Martin's kit expects no variant");

      const rows = await asked(MY_VARIANTS, "martin-okafor");
      assert.equal(
        new Set(rows.map(({ variant }) => variant)).size,
        kitVariants.length,
        "the pod's variants are not as many as the kit's entries",
      );
      assert.equal(
        rows.length,
        kitVariants.reduce(
          (sum, { hgvs, variations }) =>
            sum + Math.max(hgvs.length + variations.length, 1),
          0,
        ),
        "the pod's rows are not one for each code of each entry of the kit",
      );

      const tables = `${MARTIN}/scripted-input/martin/tables/clinvar-story`;
      const index = await triplesOf(`${tables}/references.ttl`);
      const version = index.find(([, p]) => p.value === terms.coversGene)[0]
        .value;
      const covered = objectsOf(index, version, terms.coversGene).sort();
      const digest = Buffer.from(
        version.replace("ni:///sha-256;", ""),
        "base64url",
      ).toString("hex");
      const held = await triplesOf(`${tables}/${digest}.ttl`);
      const rowOf = (id) =>
        objectsOf(
          held,
          `${codeStems.ClinVar}${id}`,
          terms.clinvarClassification,
        );
      const labels = await triplesOf("ontologies/cascade.ttl");
      const label = (concept) => {
        const [text] = objectsOf(labels, concept, PREF_LABEL);
        return text.slice(0, 1).toLowerCase() + text.slice(1);
      };
      // The page reads the app's copy of the published ClinVar series; this check reads the kit's subset of it. They agree
      // because the subset is the published rows, so the sentence is built here from the kit's own row.
      const saidOf = (id) => {
        const row = `${codeStems.ClinVar}${id}`;
        const classifications = rowOf(id);
        const [status] = objectsOf(held, row, terms.clinvarReviewStatus);
        const [submitters] = objectsOf(
          held,
          row,
          terms.contributingSubmitterCount,
        );
        const count = Number(submitters);
        assert.ok(
          classifications.length > 0 && status && count < 10,
          `${id}: the kit's row`,
        );
        const said = ACMG.filter((iri) => classifications.includes(iri))
          .map(label)
          .join("/");
        const counted = `${DIGITS[count]} contributing ${count === 1 ? "submitter" : "submitters"}`;
        return `ClinVar today says ${said}: ${label(status)}, ${counted}.`;
      };
      assert.deepEqual(
        kitVariants.flatMap(({ variations }) => variations).sort(),
        [
          ...new Set(
            held
              .filter(([, p]) => p.value === terms.clinvarClassification)
              .map(([row]) => row.value.split("/").at(-1)),
          ),
        ].sort(),
        "the kit's ClinVar IDs are not the rows its story's table holds",
      );
      const kitReports = await triplesOf(
        `${MARTIN}/expected/variant-interpretations.ttl`,
      );
      const signature = (reports) =>
        JSON.stringify(
          reports
            .map(({ classification, date }) => `${classification} ${date}`)
            .sort(),
        );
      const kitGroups = new Map();
      for (const entry of new Set(
        kitReports
          .filter(([, p]) => p.value === terms.mergedFrom)
          .map(([s]) => s.value),
      )) {
        const [about] = objectsOf(kitReports, entry, terms.variantInterpreted);
        kitGroups.set(about, [
          ...(kitGroups.get(about) ?? []),
          {
            classification: objectsOf(
              kitReports,
              entry,
              terms.acmgClassification,
            )[0],
            date: objectsOf(kitReports, entry, terms.interpretedDate)[0],
          },
        ]);
      }
      const podReports = Map.groupBy(
        await asked(REPORTS, "martin-okafor"),
        ({ variant }) => variant,
      );
      assert.deepEqual(
        [...podReports.values()].map(signature).sort(),
        [...kitGroups.values()].map(signature).sort(),
        "the pod's reports are not the kit's, grouped by variant",
      );

      const entryPath = (variant) =>
        `/pods/martin-okafor/entries/${encodeURIComponent(idOf(variant))}`;
      const sources = await asked(SOURCES, "martin-okafor");
      const labOf = (report) => {
        const labs = [
          ...new Set(
            sources
              .filter((row) => row.entry === report && row.hospital)
              .map(({ hospital }) => hospital.replace(/ Demo Hospital$/, "")),
          ),
        ];
        return labs.length === 0 ? "" : ` from ${labs.join(" and ")}`;
      };

      const shown = await started();
      const entries = new Map();
      const rowOfVariant = new Map();
      let martin;
      let worth;
      try {
        const page = await opened(await tab(), shown, "/pods/martin-okafor/");
        martin = {
          heading: await heading(page),
          tiles: Object.fromEntries(await tiles(page)),
          cards: await page.locator(".variant, .card.variants").count(),
          opens: new Set(
            await hrefsOf(
              page,
              'td[data-key] > a[href^="/pods/martin-okafor/entries/"]',
            ),
          ),
        };
        worth = await worthOf(shown, "martin-okafor");
        await showsWorth(page, worth);
        const variants = new Set(rows.map((row) => row.variant));
        for (const variant of variants)
          rowOfVariant.set(variant, await rowLinking(page, entryPath(variant)));
        for (const variant of variants) {
          await opened(page, shown, entryPath(variant));
          entries.set(variant, {
            heading: await heading(page),
            text: await readable(page),
            lines: await items(page),
            links: await hrefsOf(page),
          });
        }
        await page.close();
      } finally {
        await shown.stop();
      }
      assert.equal(martin.heading, "Martin Okafor");
      const counted = martin.tiles;
      let kitTiles = 0;
      for (const [kind, question] of Object.entries(TILES)) {
        const view = `${MARTIN}/expected/${kind.toLowerCase().replaceAll(" ", "-")}.ttl`;
        if (!existsSync(join(story.vocabulary, view))) continue;
        const kitRows = entriesOf(await triplesOf(view)).length;
        if (kitRows === 0) continue;
        kitTiles++;
        assert.notEqual(
          counted[kind],
          undefined,
          `Martin's page has no ${kind} tile, though his kit's ${view} holds ${kitRows} rows`,
        );
        assert.equal(
          counted[kind],
          (await asked(question, "martin-okafor")).length,
          `the ${kind} tile of Martin's page`,
        );
      }
      assert.ok(kitTiles > 0, "Martin's kit holds rows for no kind of tile");
      assert.equal(
        counted["Genetic variants"],
        kitVariants.length,
        "the Genetic variants tile of Martin's page",
      );
      assert.equal(
        martin.cards,
        0,
        "Martin's page still has a card of variants",
      );
      const opens = martin.opens;
      for (const variant of entries.keys())
        assert.ok(
          opens.has(entryPath(variant)),
          `no row opens the entry ${entryPath(variant)}`,
        );
      for (const variant of podReports.keys())
        assert.ok(entries.has(variant), "a report's variant has no row");

      for (const [variant, group] of podReports) {
        const rowsOfVariant = rows.filter((row) => row.variant === variant);
        const title = titleOf({
          genes: [...new Set(rowsOfVariant.flatMap(({ gene }) => gene ?? []))],
          hgvs: [
            ...new Set(rowsOfVariant.flatMap(({ hgvs }) => hgvs ?? [])),
          ].sort(),
          variations: [
            ...new Set(
              rowsOfVariant.flatMap(({ variation }) => variation ?? []),
            ),
          ],
        });
        const kitVariant = kitVariants.find((each) => titleOf(each) === title);
        assert.ok(kitVariant, `${title} is no variant of the kit`);
        const [id] = kitVariant.variations;
        const [gene] = kitVariant.genes;
        const page = entries.get(variant);
        const { text, lines } = page;
        for (const scheme of ["urn:", "ni:", "http://", "https://"])
          assert.ok(!text.includes(scheme), `${title}'s entry shows ${scheme}`);
        const reports = lines.filter((line) =>
          /^(Your .+|An undated) report\b/.test(line),
        );
        const sentences = [...group]
          .sort(undatedLast)
          .map(({ report, classification, date }) => ({
            sentence: `${date === undefined ? "An undated" : `Your ${date.slice(0, 4)}`} report${labOf(report)} said ${label(classification)}.`,
            differs: id !== undefined && !rowOf(id).includes(classification),
          }));
        assert.equal(reports.length, sentences.length, `${title}: ${reports}`);
        sentences.forEach(({ sentence, differs }, at) => {
          assert.ok(
            reports[at].startsWith(sentence),
            `${title}: ${reports[at]}`,
          );
          assert.equal(
            reports[at].includes(DIFFERS),
            differs,
            `${title}: ${reports[at]}`,
          );
        });
        const row = rowOfVariant.get(variant);
        assert.equal(
          row.includes(DIFFERS),
          sentences.some(({ differs }) => differs),
          `${title}: the tile's row`,
        );
        assert.deepEqual(
          worth
            .filter(
              ({ href, tag }) => href === entryPath(variant) && tag === DIFFERS,
            )
            .map(({ sentence }) =>
              sentence.replace(/^.*?: (?=(?:your|an undated) )/, ""),
            ),
          [...group]
            .sort(undatedLast)
            .filter(
              ({ classification }) =>
                id !== undefined && !rowOf(id).includes(classification),
            )
            .map(
              ({ report, date }) =>
                `${date === undefined ? "an undated" : `your ${date.slice(0, 4)}`} report${labOf(report)} differs from ClinVar today.`,
            ),
          `${title}: Worth a look on Martin's page`,
        );
        assert.equal(
          page.heading.includes(DIFFERS),
          sentences.some(({ differs }) => differs),
          `${title}: the entry's heading`,
        );
        if (gene === "MLH1" && id !== undefined) {
          const named = "NM_000249.4(MLH1):c.2042C>T (p.Ala681Val)";
          assert.ok(
            row.includes(named),
            `the MLH1 row is not named by ClinVar: ${row}`,
          );
          assert.ok(
            page.heading.includes(named),
            `the MLH1 entry is not named by ClinVar: ${page.heading}`,
          );
          const origin = (await heldNames([`${codeStems.ClinVar}${id}`])).get(
            `${codeStems.ClinVar}${id}`,
          )?.name?.origin;
          const series = (await heldSeries()).find(({ versions }) =>
            versions.some(({ iri }) => iri === origin),
          );
          assert.ok(series, "no held series names the MLH1 variation");
          const version = series.versions.find(({ iri }) => iri === origin);
          const credit = lines.find((line) =>
            line.startsWith(`ClinVar names this variation ${named}.`),
          );
          assert.ok(credit, "the entry does not say ClinVar names it");
          assert.ok(
            credit.includes(`From ${series.label}, `) &&
              (version.label === undefined ||
                credit.includes(`version ${version.label}`)),
            `the entry does not credit the names series and version: ${credit}`,
          );
          assert.ok(
            page.heading.includes(DIFFERS),
            "the MLH1 variant does not differ",
          );
          assert.ok(
            worth.some(
              ({ href, tag }) => href === entryPath(variant) && tag === DIFFERS,
            ),
            "Worth a look has no line that the MLH1 variant's report differs",
          );
        }
        const clinvar = lines.find((line) => /^ClinVar(,| today)/.test(line));
        assert.ok(clinvar, `${title}: no sentence of what ClinVar says`);
        if (id !== undefined) {
          assert.ok(clinvar.startsWith(saidOf(id)), `${title}: ${clinvar}`);
          assert.ok(
            page.links.some((href) => href.includes(`code=${id}`)),
            `${title}: the ID is no link`,
          );
        } else if (covered.includes(gene))
          assert.ok(
            clinvar.startsWith(
              "ClinVar, as this app holds it, has no row for this variant.",
            ),
            clinvar,
          );
        else {
          const [, listed] =
            /^ClinVar, as this app holds it, covers (.+), not ([^.]+)\./.exec(
              clinvar,
            ) ?? [];
          assert.ok(listed, `${title}: ${clinvar}`);
          assert.deepEqual(listed.split(/, | and /).sort(), covered);
          assert.ok(clinvar.includes(`not ${gene}.`), clinvar);
        }
        assert.ok(
          lines.indexOf(COUNSELLOR) > lines.indexOf(clinvar),
          `${title}: the counsellor sentence does not follow ClinVar's`,
        );
        assert.ok(
          text.includes(
            "not intended for direct diagnostic use or medical decision-making without review by a genetics professional",
          ),
          `${title}: the entry does not carry ClinVar's own caution`,
        );
        if (gene === "MLH1" && id !== undefined)
          assert.match(text, /report of [A-Z][a-z]{2} \d{1,2}, \d{4}/);
      }
    },
  );

  {
    assert.equal((await npm("run", "pod:new", "hospital")).code, 0);
    const expected = await expectedPull();
    const server = await started();
    const origin = new URL(server.address).origin;
    const at = (path) => new URL(path, origin).href;

    /**
     * Signs the pod's person in at `fhirBase` through the pod API, answering the hospital's own page with `decision` as
     * `patient`, and hands its answer to the app's `/callback`; gives the connection's number.
     */
    const signIn = async (pod, fhirBase, patient, decision, simulate?) => {
      const { connection, authorize: to } = await api(server, "connect", {
        pod,
        fhirBase,
      });
      assert.ok(to, "the sign-in goes to no hospital's page");
      const authorize = new URL(to);
      assert.equal(authorize.origin, new URL(server.listenerAddress).origin);
      assert.notEqual(authorize.origin, origin);
      assert.equal(authorize.hostname, "127.0.0.1");
      const picker = await (await fetch(authorize)).text();
      assert.ok(picker.includes(`value="${patient}"`), patient);
      if (simulate) {
        assert.match(
          picker,
          new RegExp(
            `<select[^>]*name="simulate_error"[\\s\\S]*value="${simulate}"`,
          ),
          `the sign-in page offers ${simulate}`,
        );
        authorize.searchParams.set("simulate_error", simulate);
      }
      const back = await answerSignIn(fetch, authorize, patient, decision);
      assert.equal(`${back.origin}${back.pathname}`, at("/callback"));
      const callback = await fetch(back, { redirect: "manual" });
      await callback.body?.cancel();
      assert.ok(callback.status < 400, `/callback answered ${callback.status}`);
      return connection;
    };

    /** The pod's connection `n` once it no longer moves by itself: signed in and pulled, brought in, or failed. */
    const settledConnection = async (pod, n) => {
      const until = Date.now() + 2 * MINUTES;
      for (;;) {
        const now = await api(server, "connection", {
          pod,
          connection: n,
          wait: true,
        });
        if (now.settled) return now;
        assert.ok(Date.now() < until, `connection ${n} is still ${now.step}`);
      }
    };

    /**
     * Brings the record of the pod's connection `n` in through the pod API, asked twice as a second click asks, which
     * brings nothing in twice; gives the connection once the record is in.
     */
    const bringIn = async (pod, n) => {
      const first = await api(server, "bring", { pod, connection: n });
      assert.equal(first.step, "bringing in", "the record is not brought in");
      const again = await api(server, "bring", { pod, connection: n });
      assert.ok(
        ["bringing in", "pulled"].includes(again.step),
        `bringing it in again answered ${again.step}`,
      );
      const done = await settledConnection(pod, n);
      assert.equal(done.failed, undefined, `not brought in: ${done.failed}`);
      assert.equal(done.broughtIn, true, "the record is not in");
      return done;
    };

    try {
      await addOnBehaviour(
        "a person signs in to a demo hospital and brings the record in",
        async () => {
          const pod = "hospital";
          const north = expected.row.fhirBase;
          const { rows } = await api(server, "hospitals", { q: "north" });
          assert.deepEqual(
            rows.map(({ fhirBase }) => fhirBase),
            [north],
          );

          const failed = await settledConnection(
            pod,
            await signIn(pod, north, expected.patient, "cancel"),
          );
          assert.ok(
            failed.failed?.includes("cancelled"),
            "Cancel is not cancelled",
          );
          assert.deepEqual(await asked(ALLERGIES, pod), []);
          const expired = await settledConnection(
            pod,
            await signIn(
              pod,
              north,
              expected.patient,
              "allow",
              "request_expired_token",
            ),
          );
          assert.ok(
            expired.failed?.includes("the access token expired"),
            "an expired token does not say so",
          );
          assert.deepEqual(await asked(ALLERGIES, pod), []);
          assert.notEqual(
            failed.broughtIn,
            true,
            "a cancelled sign-in brought a record in",
          );

          const elsewhere = await called(
            server,
            "connect",
            { pod, fhirBase: north },
            "http://elsewhere.invalid",
          );
          assert.equal(elsewhere.status, 403);
          const localhost = await called(
            server,
            "connect",
            { pod, fhirBase: north },
            origin.replace("127.0.0.1", "localhost"),
          );
          assert.equal(
            localhost.status,
            200,
            "a sign-in from localhost is refused",
          );

          const page = await opened(await tab(), server, `/pods/${pod}/`);
          await page.locator(`a[href="/pods/${pod}/hospitals"]`).click();
          await drawn(page);
          await page.getByLabel("Search by name or place").fill("north");
          await page.getByRole("button", { name: "Search" }).click(SUBMIT);
          await page.waitForURL(
            (url) => url.searchParams.get("q") === "north",
            SUBMIT,
          );
          const signIns = page.getByRole("button", { name: /^Sign in/ });
          await signIns.first().waitFor(SUBMIT);
          await signIns.nth(1).waitFor({ state: "detached", ...SUBMIT });
          await drawn(page);
          assert.equal(await signIns.count(), 1, "north finds one hospital");
          await signIns.click(SUBMIT);
          await page.waitForURL(
            (url) => url.origin === new URL(server.listenerAddress).origin,
          );
          assert.equal(new URL(page.url()).hostname, "127.0.0.1");
          await page.check(
            `input[name="patient"][value="${expected.patient}"]`,
          );
          await page.getByRole("button", { name: "Allow" }).click(SUBMIT);
          const bring = page.getByRole("button", { name: /^Bring / });
          await bring.waitFor({ timeout: 2 * MINUTES });
          assert.equal(
            new URL(page.url()).origin,
            origin,
            "the sign-in does not come back to the app in the same tab",
          );
          assert.equal(
            await heading(page),
            "Hospital",
            "the pod's page is not behind the box",
          );
          const looked =
            (await page.locator("#connection").textContent()) ?? "";
          const [source] = expected.look;
          const what = /What (.+?) has:/.exec(looked)?.[1];
          assert.ok(
            what !== undefined && names(what, expected.row.name),
            "no What it has",
          );
          for (const [kind, count] of Object.entries(source.records))
            assert.ok(
              looked.includes(
                `${count} ${kind.toLowerCase().replace(/y$/, "")}`,
              ),
              `no ${count} ${kind}`,
            );
          assert.ok(looked.includes("has nothing from here yet"));
          await bring.click(SUBMIT);
          const note = page.locator("main .note", {
            hasText: /^Brought in the record from /,
          });
          await note.waitFor({ timeout: 2 * MINUTES });
          assert.ok(
            names((await note.textContent()) ?? "", expected.row.name),
            "no note after the import",
          );
          await page.close();
          assert.ok(expected.allergens.length > 0, "A has no active allergy");
          assert.deepEqual(
            (await asked(ALLERGIES, pod))
              .map(({ allergen }) => allergen)
              .sort(),
            expected.allergens,
          );
        },
      );

      await behaviour(
        "the world's date is shown where a sign-in begins and set by post, the hospital's sign-in page says it and the connection's box the date it was pulled under, a bad date is refused, Today takes it away, the variable sets it at start, and a bad variable stops the app",
        async () => {
          const pod = "hospital";
          const north = expected.row.fhirBase;
          const INSTANT = "2024-02-01T23:59:59Z";
          const AS_OF = `<time datetime="${INSTANT}"`;
          const EVERYTHING = "Hospitals answer with everything they hold.";
          const AS_OF_SAID = "Hospitals answer as of 1 February 2024.";
          /** The hospital's sign-in page for a new sign-in, which is then cancelled. */
          const pickerNow = async () => {
            const { authorize } = await api(server, "connect", {
              pod,
              fhirBase: north,
            });
            const picker = await (await fetch(authorize)).text();
            await fetch(
              await answerSignIn(fetch, authorize, expected.patient, "cancel"),
              { redirect: "manual" },
            );
            return picker;
          };
          /** What the pod's page and the page that finds a hospital say, where a sign-in begins, and that they offer to change it. */
          const page = await tab();
          const beginsWith = async (said) => {
            for (const path of [
              "/pods/hospital/",
              "/pods/hospital/hospitals",
            ]) {
              await opened(page, server, path);
              assert.ok(
                (await readable(page)).includes(said),
                `${path} says not ${said}`,
              );
              assert.ok(
                (await page
                  .locator(".world-date", {
                    hasText: "Change the world's date",
                  })
                  .count()) > 0,
                `${path} offers no way to change the date`,
              );
            }
          };
          assert.equal((await api(server, "hospitals")).asOf, undefined);
          await beginsWith(EVERYTHING);
          assert.ok(!(await pickerNow()).includes('class="as-of"'));

          const set = await api(server, "setWorldDate", {
            date: "2024-02-01",
          });
          assert.equal(set.asOf, INSTANT);
          assert.equal((await api(server, "hospitals")).asOf, INSTANT);
          const appOrigin = new URL(server.address).origin;
          /** Where `/world-date?back=` sends a person, as its redirect names it. */
          const sentBack = async (back) => {
            const answer = await fetch(
              new URL(
                `/world-date?back=${encodeURIComponent(back)}`,
                server.address,
              ),
              { redirect: "manual" },
            );
            assert.ok(
              answer.status >= 300 && answer.status < 400,
              `${back}: /world-date answered ${answer.status}, no redirect`,
            );
            return new URL(
              answer.headers.get("location") ?? "",
              server.address,
            );
          };
          const own = await sentBack("/pods/hospital/");
          assert.equal(
            `${own.origin}${own.pathname}${own.hash}`,
            `${appOrigin}/pods/hospital/#world-date`,
            "/world-date does not go back to the pod's page with the date open",
          );
          for (const back of [
            "//evil.test/",
            "/..//evil.test/",
            "/.//evil.test/",
            "/%2e%2e//evil.test/",
            "/a/..//evil.test",
          ]) {
            assert.equal(
              (await sentBack(back)).origin,
              appOrigin,
              `${back}: /world-date sends a person off this app`,
            );
            await opened(
              page,
              server,
              `/world-date?back=${encodeURIComponent(back)}`,
            );
            assert.equal(
              new URL(page.url()).origin,
              appOrigin,
              `${back}: a back address off this app was followed`,
            );
          }
          await beginsWith(AS_OF_SAID);
          assert.ok((await pickerNow()).includes(AS_OF));

          const connection = await signIn(
            pod,
            north,
            expected.patient,
            "allow",
          );
          assert.equal(
            (await settledConnection(pod, connection)).asOf,
            INSTANT,
            "the connection does not keep the date it was pulled under",
          );
          /** The connection's box, opened on the screen, says the date it was pulled under. */
          const boxSays = async (n) => {
            await opened(
              page,
              server,
              `/pods/${pod}/?connection=${n}#connection`,
            );
            await page
              .locator("#connection", {
                hasText: "Pulled as of 1 February 2024.",
              })
              .waitFor();
          };
          await boxSays(connection);

          await api(server, "setWorldDate", {
            date: "2024-02-01T09:00:00+02:00",
          });
          await bringIn(
            pod,
            (
              await settledConnection(
                pod,
                await signIn(pod, north, expected.patient, "allow"),
              )
            ).n,
          );
          await api(server, "setWorldDate", { date: "2024-02-01" });

          const bad = await called(server, "setWorldDate", { date: "soon" });
          assert.equal(bad.status, 400);
          assert.ok(
            bad.body.refused?.includes('"soon" is not a date'),
            bad.body.refused,
          );
          assert.ok(
            (await pickerNow()).includes(AS_OF),
            "a refused date moved the world's date",
          );

          assert.deepEqual(await api(server, "setWorldDate", { date: "" }), {});
          assert.ok(!(await pickerNow()).includes('class="as-of"'));
          await beginsWith(EVERYTHING);
          await boxSays(connection);
          await page.close();
          assert.equal(
            (await settledConnection(pod, connection)).asOf,
            INSTANT,
            "the connection no longer says the date it was pulled under",
          );

          const dated = await started({ CASCADE_WORLD_DATE: "2024-02-01" });
          try {
            assert.equal(
              (await api(dated, "hospitals")).asOf,
              INSTANT,
              "the variable set at start is not the world's date",
            );
          } finally {
            await dated.stop();
          }

          const stopped = await stoppedAtStart({
            CASCADE_WORLD_DATE: "2024-02-30",
          });
          assert.notEqual(
            stopped.code,
            0,
            "a bad CASCADE_WORLD_DATE started the app",
          );
          assert.ok(
            stopped.wrote.includes("2024-02-30"),
            `the app did not name the bad date: ${stopped.wrote}`,
          );
        },
      );

      await addOnBehaviour(
        "the pod API answers its own origin, refuses another, and serves no close",
        async () => {
          const call = (operation, from) =>
            fetch(at(`/api/${operation}`), {
              method: "POST",
              headers: { origin: from, "content-type": "application/json" },
              body: "{}",
            });
          const own = await call("pods", origin);
          assert.equal(own.status, 200);
          assert.ok(Array.isArray((await own.json()).pods));
          assert.equal((await call("pods", "http://evil.example")).status, 403);
          assert.equal((await call("close", origin)).status, 404);
        },
      );

      await addOnBehaviour(
        "a request naming a host other than the app's own is refused",
        async () => {
          const status = await new Promise((done, fail) => {
            request(
              at("/"),
              { headers: { host: "rebound.example" } },
              (response) => {
                response.resume();
                done(response.statusCode);
              },
            )
              .on("error", fail)
              .end();
          });
          assert.equal(status, 403);
        },
      );

      await behaviour("a new pod is made from a person's name", async () => {
        for (const made of [true, false])
          assert.deepEqual(
            await api(server, "makePod", { person: "Ada  Lovelace" }),
            { pod: "ada-lovelace", made },
          );
        const page = await opened(await tab(), server, "/pods/ada-lovelace/");
        assert.equal(await heading(page), "Ada Lovelace");
        assert.ok(
          (await readable(page)).includes("Nothing here yet"),
          "Ada's pod is not empty",
        );
        await page.close();
        for (const [typed, folder] of [
          ["Tamsin at North", "tamsin-at-north"],
          ["O'Brien McDonald", "o-brien-mcdonald"],
        ]) {
          assert.equal(
            (await api(server, "makePod", { person: typed })).pod,
            folder,
          );
          assert.equal(
            (await api(server, "pod", { pod: folder })).title,
            typed,
          );
        }
      });

      /** Whether the new-pod box over the pod's page, open in `page`, offers the demo person listed as `choice`. */
      const offers = async (page, choice) =>
        (await page.locator("#new-pod button", { hasText: choice }).count()) >
        0;

      await behaviour(
        "a demo person's pod brings in their records from both hospitals",
        async () => {
          const page = await opened(await tab(), server, "/pods/hospital/");
          assert.ok(
            await offers(page, expected.choices.rowan),
            `the new-pod box does not offer ${ROWAN}`,
          );
          const { pod } = await api(server, "makePod", { person: ROWAN });
          await opened(page, server, `/pods/${pod}/`);
          const signIns = (
            await page
              .getByRole("button", { name: /^Sign in at / })
              .allTextContents()
          ).map((said) => said.trim());
          assert.equal(signIns.length, expected.rowan.length);
          for (const { hospital } of expected.rowan)
            assert.ok(
              signIns.some((said) => names(said, hospital)),
              `${ROWAN}'s pod offers no sign-in at ${hospital}: ${signIns}`,
            );
          for (const { hospital, fhirBase, patient } of expected.rowan) {
            const box = await settledConnection(
              pod,
              await signIn(pod, fhirBase, patient, "allow"),
            );
            assert.ok(
              box.step === "pulled" &&
                box.sources.length > 0 &&
                names(box.row.name, hospital),
              `the connection of ${ROWAN}'s pod does not say what ${hospital} has`,
            );
            const done = await bringIn(pod, box.n);
            assert.ok(
              names(done.row.name, hospital),
              `not brought in from ${hospital}`,
            );
          }
          await opened(page, server, `/pods/${pod}/`);
          assert.ok(
            !(await items(page)).some((sentence) =>
              /hypertension was recorded at/i.test(sentence),
            ),
            "the pod's page still says where hypertension was recorded",
          );
          const hypertension = await page
            .locator("tr", { hasText: /hypertension/i })
            .evaluateAll((rows) =>
              rows.flatMap(
                (row) =>
                  row
                    .querySelector('a[href*="/entries/"]')
                    ?.getAttribute("href") ?? [],
              ),
            );
          assert.ok(hypertension.length > 0, "no row for hypertension");
          assert.ok(
            !(await offers(page, expected.choices.rowan)),
            `the new-pod box still offers ${ROWAN}`,
          );
          let recorded = false;
          for (const href of hypertension)
            recorded ||= (await items(await opened(page, server, href))).some(
              (sentence) =>
                sentence.startsWith("Cascade recorded it at") &&
                expected.rowan.every(({ hospital }) =>
                  names(sentence, hospital),
                ),
            );
          await page.close();
          assert.ok(
            recorded,
            "no entry of hypertension says it was recorded at both hospitals",
          );
        },
      );

      await behaviour(
        "a story patient's pod says what changed after a medication was prescribed, opens its trend, and every link under the pod opens",
        async () => {
          const shown = await opened(await tab(), server, "/pods/hospital/");
          assert.ok(
            await offers(shown, expected.choices.ines),
            `the new-pod box does not offer ${INES}`,
          );
          const { pod } = await api(server, "makePod", { person: INES });
          const page = `/pods/${pod}/`;
          const connection = await settledConnection(
            pod,
            await signIn(
              pod,
              expected.ines.fhirBase,
              expected.ines.patient,
              "allow",
            ),
          );
          await bringIn(pod, connection.n);
          const { series } = await api(server, "trend", {
            pod,
            test: "18262-6",
            medication: "617310",
          });
          assert.equal(
            series.results.length,
            6,
            "the trend's series is not the six results",
          );
          await opened(shown, server, page);
          assert.equal(await heading(shown), INES);

          const card = await readable(shown);
          assert.match(
            card,
            /\bwas lower after [^.]+ was prescribed\./,
            "no card says a test was lower after a medication was prescribed",
          );
          assert.ok(
            card.includes(
              "162 → 98.3 mg/dL, the mean of 3 results before and 3 after",
            ),
            "the card does not give both means and their counts",
          );
          assert.equal(
            (
              await hrefsOf(
                shown,
                '#change-start-617310-18262-6 a[href*="/entries/"]',
              )
            ).length,
            6,
            "the box behind the card does not link its six results' entries",
          );

          const opens = shown
            .locator("a", { hasText: /^Open the trend$/ })
            .first();
          assert.ok(
            (await opens.count()) > 0,
            "the card does not open the trend",
          );
          const trend = new URL(
            (await opens.getAttribute("href")) ?? "",
            server.address,
          );
          assert.deepEqual(
            [
              trend.searchParams.get("test"),
              trend.searchParams.get("medication"),
            ],
            ["18262-6", "617310"],
          );
          await opened(shown, server, trend.pathname + trend.search);
          assert.equal(
            await shown.locator(".marker").count(),
            6,
            "the trend does not mark each of the six results",
          );
          assert.ok(
            (await shown.locator(".mark.start").count()) > 0,
            "no start marked",
          );

          const { dead, links, pages } = await crawled(server, [page]);
          stdout.write(`followed ${links} links over ${pages.size} pages\n`);
          assert.equal(dead.length, 0, `dead links:\n${dead.join("\n")}`);
          assert.ok(
            [...pages.keys()].some((address) =>
              new URL(address).pathname.endsWith("/trend"),
            ),
            "the crawl reached no trend",
          );

          const priya = await opened(shown, server, "/pods/priya-natarajan/");
          assert.ok(
            (await readable(priya)).includes(
              "1 pair of a medication and a test had too few results to say anything.",
            ),
            "Priya's page does not count her pair with too few results",
          );
          assert.equal(
            await priya.locator(".change").count(),
            0,
            "Priya has a card",
          );
          await shown.close();
        },
      );

      await addOnBehaviour(
        "the File menu deletes every pod and says how many, and resets to the kits' pods",
        async () => {
          const before = await podsOf();
          const page = await opened(await tab(), server, `/pods/${before[0]}/`);
          const tables = join(app, "pods", ".tables");
          const held = await readdir(tables);
          const tablesKept = async (after) => {
            assert.ok(
              (await hrefsOf(page, "aside .tables a[href]")).length > 0,
              `the page lists no reference table after ${after}`,
            );
            const now = new Set(await readdir(tables).catch(() => []));
            assert.deepEqual(
              held.filter((file) => !now.has(file)),
              [],
              `${after} removed reference tables`,
            );
          };
          /** Picks `item` from the File menu, and its box's button. */
          const fromFile = async (item) => {
            await page
              .locator("details.menu summary", { hasText: "File" })
              .click();
            await page.getByRole("link", { name: item }).click();
            await page
              .locator(".dialog:target")
              .getByRole("button", { name: item })
              .click(SUBMIT);
          };
          const podsNow = async () =>
            (await api(server, "pods")).pods.map(({ name }) => name).sort();

          await fromFile("Delete all data");
          await page.locator("h1", { hasText: /^No pods yet$/ }).waitFor();
          await drawn(page);
          assert.deepEqual(await podsOf().catch(() => []), []);
          assert.deepEqual(await podsNow(), []);
          assert.ok(
            (await readable(page)).includes(`Deleted ${before.length} pods.`),
            "the page does not say how many pods went",
          );
          await tablesKept("Delete all data");
          assert.deepEqual(
            (await api(server, "resetAll")).pods.sort(),
            [...KITS].sort(),
          );
          assert.deepEqual(await podsNow(), [...KITS].sort());
          assert.deepEqual(
            (await api(server, "deleteAll")).deleted.sort(),
            [...KITS].sort(),
          );
          await opened(page, server, "/");
          await fromFile("Reset all data");
          await page.locator("h1", { hasText: /^Alex Rivera$/ }).waitFor({
            timeout: 5 * MINUTES,
          });
          await drawn(page);
          assert.deepEqual(await podsOf(), [...KITS].sort());
          assert.ok(
            (await readable(page)).includes(
              "Reset: Alex Rivera, Priya Natarajan, Martin Okafor and Tamsin Vale are back.",
            ),
            "the page does not say which pods are back",
          );
          await tablesKept("Reset all data");
          await page.close();
          assert.equal(
            (await called(server, "deleteAll", {}, "http://elsewhere.example"))
              .status,
            403,
          );
        },
      );
    } finally {
      await server.stop();
    }
  }

  await behaviour(
    "a hospital of the app's hospitals/ gets a patient from a checked file, once, as a person of the app's people/, and signs them in",
    async () => {
      const folder = join(app, "hospitals", "mercy-test");
      await mkdir(folder, { recursive: true });
      const fhirBase = "https://mercy-test.demo.invalid/fhir";
      await writeFile(
        join(folder, "hospital.json"),
        JSON.stringify({
          name: "Mercy Test Hospital",
          fhirBase,
          places: ["Springfield, WA"],
          pageSize: 50,
          key: "mercy-test-key-public-not-a-secret",
          types: ["Patient", "MedicationStatement"],
          hiddenFromSearch: [],
        }),
      );
      const file = join(work, "hedda-shorthand.json");
      await writeFile(
        file,
        JSON.stringify({
          resourceType: "Bundle",
          type: "collection",
          entry: [
            {
              resource: {
                resourceType: "Patient",
                id: "hedda-quill",
                name: [{ family: "Quill", given: ["Hedda"] }],
                birthDate: "1971-05-02",
                gender: "female",
              },
            },
            {
              resource: {
                resourceType: "MedicationStatement",
                id: "metformin",
                status: "active",
                medicationCodeableConcept: { text: "Metformin" },
              },
              shorthand: { active: "2022-03-01", stopped: "2024-04-15" },
            },
          ],
        }),
      );
      const add = () => npm("run", "patient:add", "--", "mercy-test", file);
      assert.equal((await add()).code, 0, "the patient was not added");
      const person = join(app, "people", "hedda-quill");
      const written = JSON.parse(
        await readFile(
          join(person, "sources", "mercy-test", "fhir.json"),
          "utf8",
        ),
      );
      assert.equal(written.type, "history", "the shorthand was not compiled");
      const { name, birthDate } = JSON.parse(
        await readFile(join(person, "person.json"), "utf8"),
      );
      assert.deepEqual(
        { name, birthDate },
        {
          name: { family: "Quill", given: ["Hedda"] },
          birthDate: "1971-05-02",
        },
        "the person is not who the Patient says",
      );
      const again = await add();
      assert.notEqual(again.code, 0, "the same patient was added twice");
      assert.ok(again.err.includes("is already at this hospital"), again.err);
      assert.equal((await npm("run", "pod:new", "own-hospital")).code, 0);

      const server = await started();
      try {
        const found = async (q) =>
          (await api(server, "hospitals", { q })).rows.map(
            (row) => row.fhirBase,
          );
        assert.deepEqual(await found("mercy"), [fhirBase]);
        assert.equal((await found("north")).length, 1, "North is not listed");
        assert.equal(
          (await found("smart")).length,
          1,
          "the SMART sandbox is not listed",
        );
        const { authorize } = await api(server, "connect", {
          pod: "own-hospital",
          fhirBase,
        });
        assert.ok(authorize, "the sign-in goes to no hospital's page");
        const picker = await (await fetch(authorize)).text();
        assert.ok(picker.includes('value="hedda-quill"'), "no Hedda to pick");
      } finally {
        await server.stop();
      }
    },
  );

  await behaviour("the console evaluates await", async () => {
    const prompt = "alex-rivera> ";
    const child = spawn(
      execPath,
      [NPM, "run", "--silent", "console", "--", "--pod", "alex-rivera"],
      { cwd: app },
    );
    let out = "";
    let waiting;
    child.stdout.on("data", (chunk) => {
      out += chunk;
      waiting?.();
    });
    child.stderr.on("data", (chunk) => stdout.write(`[console] ${chunk}`));
    const exited = new Promise((done) => child.on("close", done));
    const promptAfter = (from: number) =>
      new Promise<number>((done) => {
        waiting = () => {
          const at = out.indexOf(prompt, from);
          if (at >= 0) done(at);
        };
        waiting();
      });
    const first = await promptAfter(0);
    child.stdin.write(`(await pod.ask(${JSON.stringify(ALLERGIES)})).length\n`);
    const second = await promptAfter(first + prompt.length);
    const answer = out.slice(first + prompt.length, second).trim();
    child.stdin.write(".exit\n");
    stdout.write(out);
    assert.equal(answer, String(alex[ALLERGIES].length));
    assert.equal(await exited, 0);
  });

  await behaviour("reset puts the app back", async () => {
    const script = join(app, "bring-in.mjs");
    await writeFile(
      script,
      `import { openPod } from "cascade-runtime";
const pod = await openPod("pods/alex-rivera");
const { refused } = await pod.import(${JSON.stringify(C_CDA)}, { aboutSubject: true });
await pod.close();
if (refused !== undefined) throw new Error(refused);
`,
    );
    assert.equal((await run(execPath, [script])).code, 0, "no record in");
    assert.ok((await asked(IMPORTS, "alex-rivera")).length > fresh.imports);
    assert.ok(existsSync(join(app, "pods", ".answers")), "no answer was kept");
    assert.equal((await npm("run", "pod:new", "scratch")).code, 0);
    assert.ok((await podsOf()).length > KITS.length, "no pod was made");
    assert.equal((await npm("run", "reset")).code, 0, "npm run reset failed");
    assert.deepEqual(await podsOf(), [...KITS].sort());
    assert.equal(existsSync(join(app, "pods", ".answers")), false);
    assert.equal((await asked(IMPORTS, "alex-rivera")).length, fresh.imports);
    assert.deepEqual(
      multiset(await asked(JUDGMENTS, "alex-rivera")),
      multiset(fresh.judgments),
    );
  });
}

// Last, so that a broken browser build does not hide the results above it: the check stops at its first failure.
await addOnBehaviour(
  "npm run browser builds the app to run in a browser alone, the demo hospitals' worker with it, and a first visit copies Alex's pod from its sample and draws it from its kept answers, the engine held back, with no request to /api",
  async () => {
    const served = await started({}, "browser");
    try {
      const worker = await fetch(
        new URL("demo-hospital-worker.js", served.address),
      );
      assert.equal(
        worker.status,
        200,
        "the demo hospitals' worker is not served",
      );
      const page = await tab();
      const held = [];
      const requested = Promise.withResolvers<void>();
      await page.route(/\/web_bg\.wasm$/, (route) => {
        held.push(route);
        requested.resolve();
      });
      const apiCalls = [];
      page.on("request", (sent) => {
        if (new URL(sent.url()).pathname.startsWith("/api/"))
          apiCalls.push(sent.url());
      });
      await page.goto(served.address);
      await settled(page);
      assert.equal(
        new URL(page.url()).pathname,
        "/pods/alex-rivera/",
        `the first visit opened no copy of Alex's pod: ${await heading(page)}`,
      );
      assert.equal(await heading(page), "Alex Rivera");
      // The engine warms only after the page's first ready: until it has asked for its wasm, and been held, a null
      // data-engine says nothing.
      await Promise.race([
        requested.promise,
        new Promise((_, failed) =>
          setTimeout(
            () => failed(new Error("the engine's wasm was never requested")),
            60_000,
          ).unref(),
        ),
      ]);
      assert.equal(
        await page.getAttribute("body", "data-engine"),
        null,
        "the engine was not held back",
      );
      const shown = await tiles(page);
      for (const [kind, question] of Object.entries(TILES)) {
        const rows = alex?.[question] ?? (await asked(question, "alex-rivera"));
        assert.equal(
          shown.get(kind),
          rows.length === 0 ? undefined : rows.length,
          `the ${kind} tile of the browser's copy of Alex's pod`,
        );
      }
      assert.deepEqual(apiCalls, [], "the browser's app asked a server");
      await page.unroute(/\/web_bg\.wasm$/);
      for (const route of held) await route.continue().catch(() => undefined);
      await page.close();
    } finally {
      await served.stop();
    }
  },
);

await browser?.close();
stdout.write(`\nthe starter's check passed, in ${work}\n`);
