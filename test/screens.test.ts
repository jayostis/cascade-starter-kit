import assert from "node:assert/strict";
import { test } from "node:test";
import type { FailureKind } from "cascade-runtime";
import { linksOf, screens, textOf } from "./render.js";

/** What the test reads of what the pages say, `said.ts`, which the screens draw with. */
interface Said {
  readonly REC: string;
  tableId(series: string): string;
  sourcesOf(
    held: object[],
  ): { iri: string; series: { iri: string; label: string }[] }[];
  demoPeople(demo: never): object[];
  slug(person: string): string;
}

const said = (await import(
  new URL("../../app/said.ts", import.meta.url).href
)) as Said;

/** The screens, drawn to markup inside the shell's providers, with nothing for PodApi to answer. */
interface Drawn {
  tablesNav(props: object): string;
  tablePage(props: object): string;
  sourcePage(props: object): string;
  codePage(props: object): string;
  newPod(props: object): string;
  sixWords(props: object): string;
  unlock(props: object): string;
  locking(api: Calls, locked: (pod: string, outcome: string) => void): Calls;
  podPage(props: object): string;
  connectionBox(props: object): string;
  hospitalsPage(props: object): string;
  worldDate(props: object): string;
}

/** The calls of PodApi the test makes. */
interface Calls {
  answers(input?: object): Promise<unknown>;
  unlock(input?: object): Promise<unknown>;
  pods(input?: object): Promise<unknown>;
  said(input?: object): Promise<unknown>;
}

const drawn = await screens<Drawn>(`
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ActionsProvider } from "./actions.tsx";
import { locking } from "./App.tsx";
import { HostProvider } from "./api.tsx";
import { ConnectionBox, HospitalsPage, WorldDate } from "./hospitals.tsx";
import { NewPod, SixWords, Unlock } from "./newpod.tsx";
import { PodPage } from "./pod.tsx";
import { TablesNav } from "./shell.tsx";
import { CodePage, SourcePage, TablePage } from "./tables.tsx";

const host = { api: {}, about: {}, samples: [] };
const actions = { act() {}, refreshPods: async () => [], heldNow() {} };
const within = (screen) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <HostProvider value={host}>
        <ActionsProvider value={actions}>{screen}</ActionsProvider>
      </HostProvider>
    </MemoryRouter>,
  );
export const tablesNav = (props) => within(<TablesNav {...props} />);
export const tablePage = (props) => within(<TablePage {...props} />);
export const sourcePage = (props) => within(<SourcePage {...props} />);
export const codePage = (props) => within(<CodePage {...props} />);
export const newPod = (props) => within(<NewPod {...props} />);
export const sixWords = (props) => within(<SixWords {...props} />);
export const unlock = (props) => within(<Unlock {...props} />);
export { locking };
export const podPage = (props) => within(<PodPage {...props} />);
export const connectionBox = (props) =>
  within(<ConnectionBox signInAgain={(label) => <button>{label}</button>} onBring={() => {}} {...props} />);
export const hospitalsPage = (props) => within(<HospitalsPage {...props} />);
export const worldDate = (props) => within(<WorldDate {...props} />);
`);

const GROUPS = {
  iri: "urn:uuid:c1a6678c-2b4d-4287-b852-9039e6a71afd",
  label: "Example vaccine groups",
  licence: "http://creativecommons.org/publicdomain/zero/1.0/",
  publisher: "https://publisher.example/",
  credit: "Source: an example publisher",
  current: { iri: "ni:///v2", label: "2", issued: "2026-10-08T19:22:23Z" },
  versions: [
    { iri: "ni:///v2", label: "2", issued: "2026-10-08T19:22:23Z" },
    { iri: "ni:///v1", label: "1", issued: "2026-10-01T00:00:00Z" },
  ],
  checked: "2026-10-08T21:55:00Z",
  watched: { at: "2026-10-08T20:00:00Z", found: "nothing new" },
};
const NOW = Date.parse("2026-10-08T22:00:00Z");

const coded = (notation: string, label: string) => ({
  code: `http://hl7.org/fhir/sid/cvx/${notation}`,
  notation,
  about: { name: { label, altLabels: [], origin: "n" } },
});

test("the sidebar says the reference tables are loading until the app has read what it holds, says None yet only after a read that found none, says they could not be read after one that failed, and lists what it holds with the one shown marked, above Check now", () => {
  const nav = (held: object[], read?: string, current?: string) =>
    drawn.tablesNav({ tables: { held, read }, current });
  const busy = (markup: string) => markup.split('aria-busy="true"').length - 1;
  const loading = nav([]);
  assert.match(textOf(loading), /Loading the reference tables/);
  assert.equal(busy(loading), 1);
  assert.doesNotMatch(textOf(loading), /None yet/);
  const none = nav([], "read");
  assert.match(textOf(none), /None yet/);
  assert.doesNotMatch(textOf(none), /Loading/);
  assert.equal(busy(none), 0);
  const failed = textOf(nav([], "failed"));
  assert.match(failed, /The reference tables could not be read\./);
  assert.doesNotMatch(failed, /None yet|Loading/);
  const lists = nav([GROUPS], undefined, GROUPS.iri);
  assert.doesNotMatch(textOf(lists), /Loading/);
  assert.deepEqual(
    linksOf(lists).map(({ href, current, text }) => [href, current, text]),
    [[`/tables/${said.tableId(GROUPS.iri)}/`, true, "Example vaccine groups"]],
  );
  for (const markup of [loading, none, lists, nav([], "failed")])
    assert.match(textOf(markup), /Check now$/);
});

test("a table's page gives its source, licence, version and freshness, the codes a search found, and the pods using each version, and pages through what was found", () => {
  const [source] = said.sourcesOf([GROUPS]);
  const table = (props: object) =>
    drawn.tablePage({
      series: GROUPS,
      source,
      titles: new Map(),
      now: NOW,
      ...props,
    });
  const shown = table({
    searched: {
      total: 1201,
      offset: 50,
      size: 50,
      found: [
        {
          ...coded("141", "flu, split"),
          about: {
            name: { label: "flu, split", altLabels: [], origin: "n" },
            status: { deprecated: true, replacedBy: [], origin: "s" },
          },
          mapsTo: [coded("88", "flu, NOS")],
        },
      ],
    },
    text: "141",
    page: 2,
    uses: { "ni:///v1": ["alex-rivera", "gone"], "ni:///v2": [] },
    pods: ["alex-rivera"],
  });
  const text = textOf(shown);
  for (const sentence of [
    "Using version 2, Oct 8, 2026",
    "publisher.example Source: an example publisher",
    "CC0 1.0",
    "The watcher checked the publisher 2 hours ago: nothing new. This app last read the feed 5 minutes ago.",
    "141 flu, split Retired 88 flu, NOS",
    "51–51 of 1,201 codes.",
    "version 2, Oct 8, 2026 current : no pod",
    "version 1, Oct 1, 2026 : Alex Rivera",
  ])
    assert.ok(text.includes(sentence), sentence);
  assert.ok(!text.includes("Gone"));
  const id = said.tableId(GROUPS.iri);
  const links = linksOf(shown);
  const asks = (rel: string) =>
    new URL(links.find((each) => each.rel === rel)?.href ?? "", "http://x")
      .searchParams;
  assert.deepEqual(
    [asks("prev").get("q"), asks("prev").get("page")],
    ["141", "1"],
  );
  assert.deepEqual(
    [asks("next").get("q"), asks("next").get("page")],
    ["141", "3"],
  );
  assert.ok(
    links.some(
      ({ href, text }) =>
        href === "/pods/alex-rivera/" && text === "Alex Rivera",
    ),
  );
  assert.ok(
    links.some(
      ({ href, text }) =>
        href === `/tables/${said.tableId(source!.iri)}/?code=141` &&
        text === "141",
    ),
    "a code links to its page",
  );
  assert.match(shown, new RegExp(`<form[^>]* action="/tables/${id}/"`));

  const past = table({
    searched: { total: 103, offset: 450, size: 50, found: [] },
    text: "",
    page: 10,
    uses: {},
    pods: [],
  });
  assert.ok(textOf(past).includes("None on page 10 of 103 codes."));
  assert.equal(
    new URL(
      linksOf(past).find((each) => each.rel === "prev")?.href ?? "",
      "http://x",
    ).searchParams.get("page"),
    "3",
    "a page past the last steps back to the last",
  );
  assert.ok(!linksOf(past).some((each) => each.rel === "next"));
});

test("tables are browsed by source: a source's page searches all its tables and lists them, and a code's page says what each table says of it and where from", () => {
  const SOURCE = "urn:uuid:17cec5a9-071a-4179-9403-5c1e3886fb7d";
  const NAMES = {
    ...GROUPS,
    iri: "urn:uuid:f71f6797-48ec-4875-9b87-4cb1be1d9be0",
    label: "Example CVX names",
    licence: "http://creativecommons.org/publicdomain/mark/1.0/",
    source: SOURCE,
  };
  const groups = {
    ...GROUPS,
    label: "Example CVX vaccine groups",
    source: SOURCE,
  };
  const alone = { ...GROUPS, iri: "urn:uuid:0e2b", label: "Lone table" };
  const sources = said.sourcesOf([NAMES, groups, alone]);
  const [source] = sources;
  assert.ok(source);
  const page = drawn.sourcePage({
    source,
    searched: {
      total: 1,
      offset: 0,
      size: 50,
      found: [{ ...coded("141", "flu, split"), mapsTo: [] }],
    },
    text: "",
    page: 1,
    now: NOW,
  });
  const sourceId = said.tableId(SOURCE);
  const links = linksOf(page);
  assert.ok(
    links.some(
      ({ href, text }) =>
        href === `/tables/${sourceId}/?code=141` && text === "141",
    ),
  );
  for (const sentence of [
    "What this source publishes",
    "Public domain",
    "CC0 1.0",
  ])
    assert.ok(textOf(page).includes(sentence), sentence);
  for (const series of source.series)
    assert.ok(
      links.some(({ href }) => href === `/tables/${said.tableId(series.iri)}/`),
      series.label,
    );

  const fact = { series: groups.iri, version: "ni:///v2" };
  const panelTable = {
    ...GROUPS,
    iri: "urn:uuid:7a1b",
    label: "Example panel members",
    credit: "Panels are LOINC's.",
  };
  const classTable = {
    ...GROUPS,
    iri: "urn:uuid:8c2d",
    label: "Example drug classes",
  };
  const placed = (notation: string, label: string, place: object) => ({
    ...coded(notation, label),
    ...place,
  });
  const panelsAndClasses = textOf(
    drawn.codePage({
      source,
      held: [NAMES, groups, alone, panelTable, classTable],
      facts: {
        ...coded("24323-8", "Comprehensive metabolic panel"),
        names: [],
        status: [],
        mappings: [],
        panels: [
          {
            series: panelTable.iri,
            version: "ni:///v2",
            members: [
              placed("2823-3", "Potassium", { sequence: 1, required: "R-a" }),
              placed("2951-2", "Sodium", { sequence: 2, required: "R" }),
              placed("17861-6", "Calcium", { sequence: 3, required: "Rflx" }),
            ],
            heldBy: {
              total: 3,
              panels: [placed("34567-8", "A larger panel", { sequence: 9 })],
            },
          },
        ],
        classes: [
          {
            series: classTable.iri,
            version: "ni:///v2",
            in: [
              {
                relation: `${said.REC}establishedPharmacologicClass`,
                class: coded("N0000175562", "ACE inhibitor [EPC]"),
                through: coded("1546022", "lisinopril anhydrous"),
              },
              {
                relation: `${said.REC}chemicalStructure`,
                class: coded("M0014310", "Lisinopril"),
              },
            ],
            withheld: [
              {
                relation: `${said.REC}mechanismOfAction`,
                ingredient: coded("29046", "lisinopril"),
              },
            ],
          },
        ],
      },
    }),
  );
  for (const sentence of [
    "A panel of 3 members, in order:",
    "2823-3 Potassium R-a",
    "2951-2 Sodium required",
    "No mechanism of action is given: FDA classes a different form of 29046 lisinopril; RxNorm does not tie this drug to it.",
    "17861-6 Calcium Rflx",
    "Itself a member of 3 panels:",
    "34567-8 A larger panel",
    "and 2 more.",
    "Panels are LOINC's.",
    "From Example panel members, version 2, Oct 8, 2026.",
    "Established pharmacologic class: N0000175562 ACE inhibitor [EPC] through 1546022 lisinopril anhydrous",
    "Chemical structure: M0014310 Lisinopril",
    "From Example drug classes, version 2, Oct 8, 2026.",
  ])
    assert.ok(
      panelsAndClasses.includes(sentence),
      `${sentence} in ${panelsAndClasses}`,
    );
  assert.ok(
    panelsAndClasses.indexOf("2823-3") < panelsAndClasses.indexOf("2951-2") &&
      panelsAndClasses.indexOf("2951-2") < panelsAndClasses.indexOf("17861-6"),
    "members come in the order they were given",
  );

  const code = textOf(
    drawn.codePage({
      source,
      held: [NAMES, groups, alone],
      facts: {
        ...coded("141", "flu, split"),
        names: [
          {
            ...fact,
            series: NAMES.iri,
            label: "flu, split",
            altLabels: ["influenza, split"],
          },
        ],
        status: [],
        mappings: [
          {
            ...fact,
            series: alone.iri,
            mapsTo: [
              {
                ...coded("88", "flu, NOS"),
                alongside: { total: 2, codes: [coded("15", "flu, whole")] },
              },
            ],
            mappedFrom: { total: 0, codes: [] },
          },
        ],
      },
    }),
  );
  for (const sentence of [
    "141 flu, split",
    "influenza, split",
    "From Example CVX names, version 2, Oct 8, 2026.",
    "Maps to 88 flu, NOS, as do 15 flu, whole and 1 more.",
    "From Lone table, version 2, Oct 8, 2026.",
  ])
    assert.ok(code.includes(sentence), `${sentence} in ${code}`);
});

test("a code's page gives a variation's classification as ClinVar's sentence with the table's credit, links ClinVar's own page when it has one, and no outside link when it has none", () => {
  const VERSION = "ni:///clinvar-1";
  const VARIATION = "http://www.ncbi.nlm.nih.gov/clinvar/90011";
  const clinvar = {
    ...GROUPS,
    iri: "urn:test:clinvar",
    label: "ClinVar variant classifications",
    credit: "ClinVar, NCBI.",
    source: "urn:test:ncbi",
    versions: [{ iri: VERSION, label: "1", issued: "2026-10-01T00:00:00Z" }],
  };
  const [source] = said.sourcesOf([clinvar]);
  assert.ok(source);
  const facts = {
    code: VARIATION,
    notation: "90011",
    names: [],
    status: [],
    mappings: [],
    classifications: [
      {
        series: clinvar.iri,
        version: VERSION,
        variation: VARIATION,
        classification: [
          {
            iri: "https://ns.cascadeprotocol.org/genomics/v1#VUS",
            label: "Uncertain significance",
          },
        ],
      },
    ],
  };
  const shown = (extra: object) =>
    drawn.codePage({ source, held: [clinvar], facts: { ...facts, ...extra } });
  const bare = shown({});
  const text = textOf(bare);
  assert.ok(text.includes("ClinVar today says uncertain significance."));
  assert.ok(text.includes("ClinVar, NCBI."), "the table's credit");
  assert.ok(
    !linksOf(bare).some(({ rel }) => rel === "external"),
    "no page, no outside link",
  );
  const outside = "https://example.org/variation/90011/";
  const linked = linksOf(
    shown({ page: { href: outside, system: "ClinVar" } }),
  ).filter(({ rel }) => rel === "external");
  assert.deepEqual(
    linked.map(({ href, text }) => [href, textOf(text)]),
    [[outside, "ClinVar's page for 90011"]],
  );
});

test("the new-pod box offers to encrypt and lists the demo people with no pod yet family name first, sorted, and each sample not yet loaded", () => {
  const north = { name: "Cascade North Demo Hospital", fhirBase: "https://n" };
  const south = { name: "Cascade South Demo Hospital", fhirBase: "https://s" };
  const patient = (family: string, given: string[], birthDate: string) => ({
    entry: [
      {
        resource: {
          resourceType: "Patient",
          name: [{ family, given }],
          birthDate,
        },
      },
    ],
  });
  const people = said.demoPeople([
    {
      hospital: north,
      patients: {
        a: patient("Thorne", ["Moss", "Avery"], "1979-04-12"),
        b: patient("Abbot", ["Wren"], "1980-01-01"),
        c: patient("Thorne", ["Lark"], "1990-02-02"),
      },
    },
    {
      hospital: south,
      patients: { a: patient("Thorne", ["Moss", "Avery"], "1979-04-12") },
    },
  ] as never);
  const box = (pods: string[], samples: string[] = []) =>
    drawn.newPod({ people, pods, samples });
  const buttons = (markup: string) =>
    [...markup.matchAll(/<button>([^<]*)<span/g)].map(([, label]) => label);
  assert.match(box([]), /Encrypt this pod with six words/);
  assert.deepEqual(buttons(box([])), [
    "Abbot, Wren",
    "Thorne, Lark",
    "Thorne, Moss Avery",
  ]);
  assert.deepEqual(
    buttons(box([said.slug("Wren Abbot"), said.slug("Lark Thorne")])),
    ["Thorne, Moss Avery"],
  );
  const samples = ["alex-rivera", "priya-natarajan"];
  assert.deepEqual(
    buttons(box(["alex-rivera"], samples)).filter((label) =>
      label?.startsWith("Load "),
    ),
    ["Load Priya Natarajan"],
  );
  assert.deepEqual(
    [...box([], samples).matchAll(/name="pod" value="([^"]*)"/g)].map(
      ([, sample]) => sample,
    ),
    samples,
  );
});

test("the six-words screen shows the words numbered, with the fields a password manager reads and a check of words 2 and 5; the open screen says each outcome in its own sentence, with a field for the words only where words could open the pod", () => {
  const words = "abacus abdomen abide abnormal abrasion abrupt";
  const shown = drawn.sixWords({
    pod: "grace-hopper",
    person: "Grace Hopper",
    words,
  });
  assert.equal(shown.match(/<li>/g)?.length, 6);
  assert.deepEqual(
    [...shown.matchAll(/<li>([^<]*)<\/li>/g)].map(([, word]) => word),
    words.split(" "),
  );
  assert.match(shown, /name="username"[^>]*value="grace-hopper"/);
  assert.match(shown, /autocomplete="new-password"/i);
  assert.match(shown, /name="password"[^>]*value="abacus abdomen/);
  assert.match(shown, /type="button"[^>]*data-copy-words/);
  assert.match(textOf(shown), /Grace Hopper's pod/);
  assert.match(textOf(shown), /Word 2/);
  assert.match(textOf(shown), /Word 5/);
  assert.match(shown, /does not hide that this pod exists/);

  const outcomes: [string, RegExp, boolean][] = [
    ["secret needed", /six words to open it/, true],
    ["incorrect secret", /don't open this pod/, true],
    ["malformed", /header is damaged or was changed/, false],
    ["unsupported version", /newer version of Cascade/, false],
    ["cannot open", /another way, not with six words/, false],
  ];
  for (const [outcome, sentence, field] of outcomes) {
    const open = drawn.unlock({
      pod: "grace-hopper",
      titles: new Map(),
      outcome,
    });
    assert.match(textOf(open), sentence, outcome);
    assert.equal(open.includes("current-password"), field, outcome);
  }
});

test("any call about an encrypted pod that finds it locked says so, for its unlock screen to be drawn where it was asked for, and is still refused; the call that opens it and a call about no pod say nothing", async () => {
  const unopened = Object.assign(new Error("a secret is needed"), {
    name: "Unopened",
    outcome: "secret needed",
  });
  const fails = async () => {
    throw unopened;
  };
  const told: string[][] = [];
  const api = drawn.locking(
    { answers: fails, unlock: fails, pods: fails, said: async () => "said" },
    (pod, outcome) => told.push([pod, outcome]),
  );
  await assert.rejects(api.answers({ pod: "alan-turing" }), unopened);
  await assert.rejects(api.unlock({ pod: "alan-turing" }), unopened);
  await assert.rejects(api.pods(), unopened);
  assert.equal(await api.said({ pod: "alan-turing" }), "said");
  assert.deepEqual(told, [["alan-turing", "secret needed"]]);
});

const NORTH = {
  name: "Cascade North Demo Hospital",
  vendor: "demo",
  fhirBase: "https://n",
};
const SOUTH = {
  name: "Cascade South Demo Hospital",
  vendor: "demo",
  fhirBase: "https://s",
};
/** A connection to North as `connection` gives it, at `step`, with what is given. */
const at = (step: string, more: object = {}) => ({
  n: 1,
  row: NORTH,
  step,
  settled: !["signing in", "pulling", "bringing in"].includes(step),
  requests: 3,
  ...more,
});
const PULLED = { sources: [], pulled: { missing: [], denied: [] } };
/** A pod's page as `PodPage` draws it from `shown`, with no demo person unless given. */
const podPage = (shown: object, person?: object) =>
  drawn.podPage({
    shown: { pod: "alex-rivera", answers: {}, ...shown },
    titles: new Map(),
    person,
    held: [],
  });

test("a pod's page makes no claim about what a hospital holds, and still signs in at each hospital of its demo person", () => {
  const words = textOf(
    podPage(
      { pod: "rowan-ellery-marsh" },
      { name: "Rowan Ellery Marsh", at: [NORTH, SOUTH] },
    ),
  );
  assert.ok(
    words.includes(
      "Sign in at a hospital, see what it has, and bring it into this pod.",
    ),
  );
  assert.ok(!/waiting/.test(words), words);
  for (const name of ["Cascade North", "Cascade South"])
    assert.ok(words.includes(`Sign in at ${name}`), name);
  assert.ok(words.includes("Find a hospital"));
});

test("a record's person against the pod's: the box's words and button by grade", () => {
  const named = (given: string, family: string) => [
    { name: `${given} ${family}`, family },
  ];
  const rowan = "Rowan Ellery Marsh";
  const box = (given: string, family: string, withTitle = true) => {
    const markup = drawn.connectionBox({
      pod: "rowan-ellery-marsh",
      titles: withTitle ? new Map([["rowan-ellery-marsh", rowan]]) : undefined,
      back: "#",
      now: at("pulled", {
        ...PULLED,
        patient: `${given} ${family}`,
        patientNames: named(given, family),
      }),
    });
    return {
      said: textOf(markup),
      button: textOf(/<button[^>]*>([^<]*)<\/button>/.exec(markup)?.[1] ?? ""),
      buttonClass: /<button class="([^"]*)"/.exec(markup)?.[1],
      note: /<p class="(note[^"]*)"/.exec(markup)?.[1],
    };
  };
  const same = box("Rowan Ellery", "Marsh");
  assert.ok(!same.said.includes("This record is"));
  assert.equal(same.button, "Bring it into Rowan Ellery Marsh's pod");
  const maybe = box("Moss Avery", "Marsh");
  assert.ok(maybe.said.includes("This record is Moss Avery Marsh's."));
  assert.ok(maybe.note === undefined && !maybe.said.includes("not Rowan"));
  assert.equal(maybe.buttonClass, undefined);
  assert.equal(
    maybe.button,
    "Bring Moss Avery Marsh's records into Rowan Ellery Marsh's pod",
  );
  const other = box("Odalys", "Brandt");
  assert.ok(
    other.said.includes(
      "This record is Odalys Brandt's, not Rowan Ellery Marsh's.",
    ),
  );
  assert.equal(other.note, "note warm", "the warning is the warm kind");
  assert.equal(
    other.buttonClass,
    "quiet",
    "the anyway button is the quiet kind",
  );
  assert.equal(
    other.button,
    "Bring Odalys Brandt's records into Rowan Ellery Marsh's pod anyway",
  );
  const untitled = box("Odalys", "Brandt", false);
  assert.ok(
    untitled.said.includes(
      "This record is Odalys Brandt's. Bringing it in makes this Odalys Brandt's pod.",
    ),
  );
  assert.equal(untitled.button, "Bring it into Rowan Ellery Marsh's pod");
  assert.equal(untitled.note, "note", "an unknown pod's note stays plain");
});

test("a failed connection's box speaks to a person by the failure's kind, naming the hospital, and offers to sign in again, with the developer's detail in a smaller line", () => {
  const detail =
    "https://cascade-north.demo.invalid refused Patient with 401: invalid_client.";
  const kinds: Record<FailureKind, [said: RegExp, button: boolean]> = {
    cancelled: [/cancelled.*Sign in again/, true],
    "state-mismatch": [/did not come back.*Sign in again/, true],
    "host-not-allowed": [/address is not one the app will talk to/, false],
    "cap-exceeded": [/larger than the app brings in at once/, false],
    unauthorized: [
      /did not accept the access token(?!.*(ran out|expired))/,
      true,
    ],
    "retries-exhausted": [
      /did not answer after several tries.*sign in again/,
      true,
    ],
    "sign-in-unavailable": [/could not be started/, false],
    "hospital-error": [/refused the sign-in.*Sign in again/, true],
  };
  const box = (failure: string | undefined, more: object = {}) =>
    drawn.connectionBox({
      pod: "rowan-ellery-marsh",
      back: "#",
      now: at("failed", { failed: detail, failure }),
      ...more,
    });
  for (const [kind, [action, button]] of Object.entries(kinds) as [
    FailureKind,
    [RegExp, boolean],
  ][]) {
    const markup = box(kind);
    const first = textOf(/<p role="alert">(.*?)<\/p>/.exec(markup)?.[1] ?? "");
    assert.match(first, /Cascade North/, kind);
    assert.match(first, action, kind);
    assert.doesNotMatch(first, /401|invalid_client|https?:|\.invalid/, kind);
    assert.equal(
      /<button[^>]*>([^<]*)<\/button>/.exec(markup)?.[1],
      button ? "Sign in again at Cascade North" : undefined,
      kind,
    );
    assert.match(
      markup,
      /<p class="muted detail">https:\/\/cascade-north\.demo\.invalid refused Patient with 401/,
      kind,
    );
  }
  const popup = box("sign-in-unavailable", {
    failures: {
      "sign-in-unavailable": {
        said: (name: string) => `Allow pop-ups for ${name}.`,
        again: true,
      },
    },
  });
  assert.match(popup, /Allow pop-ups for Cascade North/);
  assert.match(popup, /Sign in again at Cascade North/);
  const plain = drawn.connectionBox({
    pod: "rowan-ellery-marsh",
    back: "#",
    now: at("failed", { failed: "Refused: nothing to bring in" }),
  });
  assert.ok(plain.includes("Refused: nothing to bring in"));
  assert.ok(!plain.includes("Sign in again"));
});

test("a pod's page with a connection holds its tiles and the connection's box, which closes to the pod's page; every box's first link, outside the box, closes it; a sentence keeps the space beside a value put in it", () => {
  const back = "/pods/alex-rivera/";
  const page = [
    podPage({
      answers: {
        "pod/My active allergies": [
          { entry: "urn:cascade:entry:e1", allergen: "Penicillin" },
        ],
        "pod/My lab results": [
          { entry: "urn:cascade:entry:e2", test: "Glucose" },
        ],
      },
      connection: at("pulling"),
    }),
    drawn.newPod({ people: [], pods: [], samples: [] }),
    drawn.connectionBox({
      pod: "alex-rivera",
      back: "#",
      now: at("pulled", {
        sources: [{ records: { Condition: 2 }, claimed: false }],
        pulled: { missing: [], denied: [] },
      }),
    }),
    drawn.hospitalsPage({
      pod: "alex-rivera",
      titles: new Map(),
      q: "",
      read: { rows: [] },
      people: [],
    }),
  ].join("\n");
  const words = textOf(page);
  for (const sentence of [
    "What Cascade North has: 2 conditions.",
    "and bring it into Alex Rivera's pod.",
    "Back to Alex Rivera",
  ])
    assert.ok(words.includes(sentence), sentence);
  assert.equal((page.match(/<a class="tile"/g) ?? []).length, 2);
  for (const [entry, shown] of [
    ["e1", "Penicillin"],
    ["e2", "Glucose"],
  ])
    assert.ok(
      linksOf(page).some(
        (link) =>
          link.href === `/pods/alex-rivera/entries/${entry}` &&
          link.text === shown,
      ),
      `${shown}'s row does not open its entry`,
    );
  const boxes = page.split('<div class="dialog"').slice(1);
  assert.equal(boxes.length, 5);
  const connection = boxes.find((box) => box.startsWith(' id="connection"'));
  assert.ok(connection?.includes("3 requests answered so far"));
  for (const box of boxes) {
    const first = /<a [^>]*>/.exec(box)?.[0] ?? "";
    const closes = box === connection ? back : "#";
    assert.ok(first.includes(` href="${closes}"`), box.slice(0, 80));
    assert.match(first, / class="backdrop"/, box.slice(0, 80));
    assert.match(first, / aria-label="Close the box"/, box.slice(0, 80));
    assert.ok(
      box.indexOf(first) < box.indexOf('<div class="box'),
      box.slice(0, 80),
    );
  }
});

test("a pod's page names a row by the first of its codes the tables name, else by the record's own text, and tags a retired code and an entry that needs review", () => {
  const CVX = "urn:test:cvx/";
  const ICD = "urn:test:icd/";
  const SCT = "urn:test:sct/";
  const LOINC = "http://loinc.org/rdf/";
  const name = (label: string) => ({
    name: { label, altLabels: [], origin: "urn:x:names" },
  });
  const retired = (...replacedBy: string[]) => ({
    status: { deprecated: true, replacedBy, origin: "urn:x:status" },
  });
  const answers = {
    "pod/My immunizations": [
      { entry: "i1", vaccine: "Fluarix", code: `${CVX}141` },
      { entry: "i2", vaccine: "Hantavax", code: `${CVX}57` },
      { entry: "i3", vaccine: "Old flu", code: `${CVX}15` },
      { entry: "i4", vaccine: "Unlisted", code: `${CVX}999` },
    ],
    "pod/My lab results": [
      { entry: "l1", test: "K+", code: `${LOINC}2823-3` },
      { entry: "l2", test: "Chloride", code: `${LOINC}2075-0` },
    ],
    "pod/My active conditions": [
      {
        entry: "c1",
        condition: "Asthma",
        snomed: `${SCT}195967001`,
        icd10: `${ICD}J45.909`,
      },
    ],
    "entry/What needs review": [
      { entry: "i3", needs: "judged different, still joined" },
    ],
  };
  const about = new Map<string, object>([
    [`${CVX}141`, name("flu, split")],
    [`${CVX}57`, { ...name("hantavirus"), ...retired() }],
    [`${CVX}15`, retired(`${CVX}141`, `${CVX}150`)],
    [`${SCT}195967001`, { ...name("Asthma (disorder)"), ...retired() }],
    [`${ICD}J45.909`, name("Unspecified asthma, uncomplicated")],
    [`${LOINC}2823-3`, name("Potassium [Moles/volume] in Serum or Plasma")],
  ]);
  const words = (named?: Map<string, object>) =>
    podPage({ answers, about: named })
      .replace(/<[^>]*>/g, "\n")
      .split("\n")
      .map((line) => textOf(line))
      .filter(Boolean);
  const named = words(about);
  for (const shown of [
    "flu, split, hantavirus, Old flu, Unlisted",
    "hantavirus",
    "Retired code",
    "Old flu",
    "Unlisted",
    "Unspecified asthma, uncomplicated",
    "Potassium [Moles/volume] in Serum or Plasma",
    "Chloride",
  ])
    assert.ok(named.includes(shown), shown);
  assert.ok(
    !named.some((line) => line.includes("replaced by")),
    "what replaces a retired code is said on its entry, not in the tag",
  );
  assert.equal(
    named.filter((line) => line === "Needs review").length,
    2,
    "the row of an entry that needs review carries the tag, and so does its line in Worth a look",
  );
  assert.ok(
    named.some((line) => line.startsWith("Old flu was marked as different")),
  );
  for (const hidden of ["Fluarix", "Hantavax", "Asthma (disorder)", "K+"])
    assert.ok(!named.includes(hidden), hidden);
  assert.equal(
    named.filter((line) => line.startsWith("Retired code")).length,
    2,
    "only the codes that named a row, or with none the first with a status, mark it",
  );
  const unnamed = words();
  for (const shown of ["Fluarix", "Hantavax", "Asthma", "K+"])
    assert.ok(unnamed.includes(shown), shown);
  assert.ok(!unnamed.some((line) => line.startsWith("Retired")));
});

test("Find a hospital gives each hospital a card with its places, its sign-in and the demo people it holds, family name first, sorted, each with where else they are; a hospital with none says to choose on its own page", () => {
  const patient = (family: string, given: string[], birthDate: string) => ({
    entry: [
      {
        resource: {
          resourceType: "Patient",
          name: [{ family, given }],
          birthDate,
        },
      },
    ],
  });
  const people = said.demoPeople([
    {
      hospital: NORTH,
      patients: {
        a: patient("Thorne", ["Moss", "Avery"], "1979-04-12"),
        b: patient("Abbot", ["Wren"], "1980-01-01"),
        c: patient("Thorne", ["Lark"], "1990-02-02"),
      },
    },
    {
      hospital: SOUTH,
      patients: { a: patient("Thorne", ["Moss", "Avery"], "1979-04-12") },
    },
  ] as never);
  const smart = {
    name: "SMART Health IT",
    vendor: "smart",
    fhirBase: "https://t",
  };
  const page = drawn.hospitalsPage({
    pod: "alex-rivera",
    titles: new Map(),
    q: "",
    read: { rows: [{ ...NORTH, places: ["North Town"] }, SOUTH, smart] },
    people,
  });
  const cards = page
    .split('<div class="card">')
    .slice(1)
    .map((card) => ({
      heading: textOf(/<h2>(.*?)<\/h2>/.exec(card)?.[1] ?? ""),
      people: [...card.matchAll(/<li>(.*?)<\/li>/g)].map(([, inner]) =>
        textOf(inner ?? ""),
      ),
      text: textOf(card),
    }));
  assert.deepEqual(
    cards.map(({ heading, people }) => [heading, people]),
    [
      [
        "Cascade North",
        [
          "Abbot, Wren",
          "Thorne, Lark",
          "Thorne, Moss Avery also at Cascade South",
        ],
      ],
      ["Cascade South", ["Thorne, Moss Avery also at Cascade North"]],
      ["SMART Health IT", []],
    ],
  );
  assert.ok(cards[0]?.text.includes("North Town"));
  assert.ok(cards.every(({ text }) => text.includes("Sign in")));
  assert.ok(
    cards[2]?.text.includes(
      "A test server: you choose a patient on its own sign-in page.",
    ),
  );
});

test("the world's date: the form shows the day it is set to, with Set and Today, the box says what its pull answered as of, and the pod's page and Find a hospital say what the hospitals answer as of now, with a way to change it", () => {
  const asOf = "2024-02-01T23:59:59Z";
  assert.match(
    drawn.worldDate({ asOf: "2024-02-01T00:30:00+01:00" }),
    /<input type="date"[^>]* name="date" value="2024-01-31"/,
  );
  const form = drawn.worldDate({ asOf });
  assert.match(form, /<input type="date"[^>]* name="date" value="2024-02-01"/);
  assert.match(form, /<button>Set<\/button>/);
  assert.match(
    form,
    /<input type="hidden" name="date" value=""\/><button class="quiet">Today<\/button>/,
  );
  assert.ok(textOf(form).includes("Hospitals answer as of 1 February 2024."));
  assert.ok(
    textOf(drawn.worldDate({})).includes(
      "Hospitals answer with everything they hold.",
    ),
  );

  const box = (more: object) =>
    textOf(
      drawn.connectionBox({
        pod: "alex-rivera",
        back: "#",
        now: at("pulled", { ...PULLED, ...more }),
      }),
    );
  assert.ok(box({ asOf }).includes("Pulled as of 1 February 2024."));
  assert.doesNotMatch(
    box({}),
    /Pulled as of|Hospitals answer|Change the world/,
  );

  const person = { name: "Rowan Marsh", at: [NORTH] };
  const pod = podPage({ pod: "x", asOf }, person);
  assert.match(
    textOf(pod),
    /Hospitals answer as of 1 February 2024\.\s*Change the world's date/,
  );
  assert.match(pod, /<details id="world-date">[\s\S]*name="date"/);
  assert.ok(
    textOf(
      drawn.hospitalsPage({
        pod: "x",
        titles: new Map(),
        q: "",
        read: { rows: [], asOf },
        people: [],
      }),
    ).includes("Hospitals answer as of 1 February 2024."),
  );
});
