import assert from "node:assert/strict";
import { test } from "node:test";
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
import { NewPod, SixWords, Unlock } from "./newpod.tsx";
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
