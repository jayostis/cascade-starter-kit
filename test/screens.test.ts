import assert from "node:assert/strict";
import process from "node:process";
import { after, test } from "node:test";
import {
  codeStems,
  type FailureKind,
  type Finding,
  labSeriesIn,
  type Row,
  type Terms,
  terms,
  timelineIn,
} from "cascade-runtime";
import {
  ALLERGIES,
  CLINVAR,
  closeStoryPods,
  COLUMBA,
  CONDITIONS,
  DIFFERS,
  GROUPS,
  HARBOURLINE,
  HISTORY,
  LABS,
  MEDICATIONS,
  NAME,
  REVIEW,
  said,
  SEEN,
  SOURCES,
  type Story,
  storyPods,
  VARIANT_ANSWERS,
  VARIANTS,
  VARIANTS_SAID,
} from "./fixtures.js";
import {
  currentIn,
  links,
  linksOf,
  pages,
  rowsIn,
  screens,
  textAt,
  textOf,
} from "./render.js";

after(closeStoryPods);

const { addresses } = await import(
  new URL("../../app/addresses.ts", import.meta.url).href
);
const paths = addresses("/");
const draw = await pages();

/** The screens, drawn to markup inside the shell's providers and a router, with nothing for PodApi to answer. */
interface Drawn {
  tablesNav(props: object): string;
  tablePage(props: object): string;
  sourcePage(props: object): string;
  codePage(props: object): string;
  newPod(props: object): string;
  sixWords(props: object): string;
  unlock(props: object): string;
  podPage(props: object): string;
  connectionBox(props: object): string;
  hospitalsPage(props: object): string;
  worldDate(props: object): string;
}

const drawn = await screens<Drawn>(`
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { HostProvider } from "./api.tsx";
import { ConnectionBox, HospitalsPage, WorldDate } from "./hospitals.tsx";
import { NewPod, SixWords, Unlock } from "./newpod.tsx";
import { PodPage } from "./pod.tsx";
import { TablesNav } from "./shell.tsx";
import { CodePage, SourcePage, TablePage } from "./tables.tsx";

const host = { api: {}, about: {}, samples: [] };
const within = (screen) =>
  renderToStaticMarkup(
    <HostProvider value={host}>
      <RouterProvider
        router={createMemoryRouter([{ path: "*", element: screen }])}
      />
    </HostProvider>,
  );
export const tablesNav = (props) => within(<TablesNav {...props} />);
export const tablePage = (props) => within(<TablePage {...props} />);
export const sourcePage = (props) => within(<SourcePage {...props} />);
export const codePage = (props) => within(<CodePage {...props} />);
export const newPod = (props) => within(<NewPod {...props} />);
export const sixWords = (props) => within(<SixWords {...props} />);
export const unlock = (props) => within(<Unlock {...props} />);
export const podPage = (props) => within(<PodPage {...props} />);
export const connectionBox = (props) =>
  within(<ConnectionBox signInAgain={(label) => <button>{label}</button>} {...props} />);
export const hospitalsPage = (props) => within(<HospitalsPage {...props} />);
export const worldDate = (props) => within(<WorldDate {...props} />);
`);

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
                relation: terms.establishedPharmacologicClass,
                class: coded("N0000175562", "ACE inhibitor [EPC]"),
                through: coded("1546022", "lisinopril anhydrous"),
              },
              {
                relation: terms.chemicalStructureClass,
                class: coded("M0014310", "Lisinopril"),
              },
            ],
            withheld: [
              {
                relation: terms.mechanismOfActionClass,
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
  const VARIATION = `${codeStems.ClinVar}90011`;
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
            iri: terms.UncertainSignificance,
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
    [...markup.matchAll(/<button[^>]*>([^<]*)<span/g)].map(
      ([, label]) => label,
    );
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
  assert.equal(shown.match(/<li[ >]/g)?.length, 6);
  assert.deepEqual(
    [...shown.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map(([, word]) => word),
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
/** A pod's page as `PodPage` draws it from `shown`, with no demo person and no series held unless given. */
const podPage = (shown: object, person?: object, held: object[] = []) =>
  drawn.podPage({
    shown: { pod: "alex-rivera", answers: {}, ...shown },
    titles: new Map(),
    person,
    held,
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
      buttonClass: /<button class="([^"]*)"/.exec(markup)?.[1]?.split(" ")[0],
      note: /<p class="(note[^"]*)"/
        .exec(markup)?.[1]
        ?.split(" ")
        .filter((each) => each === "note" || each === "warm")
        .join(" "),
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
      /<p class="muted detail[^"]*">https:\/\/cascade-north\.demo\.invalid refused Patient with 401/,
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
  assert.equal((page.match(/<a class="tile[ "]/g) ?? []).length, 2);
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
  const boxes = page.split(/<div class="dialog[^"]*"/).slice(1);
  assert.equal(boxes.length, 5);
  const connection = boxes.find((box) => box.startsWith(' id="connection"'));
  assert.ok(connection?.includes("3 requests answered so far"));
  for (const box of boxes) {
    const first = /<a [^>]*>/.exec(box)?.[0] ?? "";
    const closes = box === connection ? back : "#";
    assert.ok(first.includes(` href="${closes}"`), box.slice(0, 80));
    assert.match(first, / class="backdrop[^"]*"/, box.slice(0, 80));
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
  const LOINC = codeStems.LOINC;
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
    .split(/<div class="card(?: [^"]*)?">/)
    .slice(1)
    .map((card) => ({
      heading: textOf(/<h2[^>]*>(.*?)<\/h2>/.exec(card)?.[1] ?? ""),
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
    /<input type="hidden" name="date" value=""\/><button class="quiet[^"]*">Today<\/button>/,
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
  assert.match(pod, /<details[^>]* id="world-date">[\s\S]*name="date"/);
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

test("an entry's page waits for what the tables say of it while the engine warms or reads, and settles once the engine has failed", () => {
  const entry = {
    entry: "urn:cascade:entry:e1",
    name: "Asthma",
    kind: "condition",
    tags: [],
    what: [],
    codes: [],
    where: [],
    known: [],
    credits: [],
  };
  const shown = (engine: string) =>
    draw("EntryPage", {
      pod: "alex-rivera",
      titles: new Map(),
      read: { entry, panels: [], coming: true },
      held: [],
      engine,
    });
  for (const engine of ["waiting", "ready"])
    assert.equal(shown(engine).split('aria-busy="true"').length - 1, 1, engine);
  assert.doesNotMatch(shown("failed"), /aria-busy/);
});

test("a pod's page credits the table whose names it shows, once, and no other", () => {
  const code = `${codeStems.LOINC}2823-3`;
  const answers = {
    [LABS]: [
      { entry: "l1", test: "K+", code },
      { entry: "l2", test: "K again", code },
    ],
  };
  const about = new Map<string, object>([
    [
      code,
      {
        name: {
          label: "Potassium [Moles/volume] in Serum or Plasma",
          altLabels: [],
          origin: "urn:x:loinc-1",
        },
      },
    ],
  ]);
  const held = [
    {
      iri: "urn:x:loinc",
      versions: [{ iri: "urn:x:loinc-1" }],
      credit: "This material contains content from LOINC.",
    },
    {
      iri: "urn:x:other",
      versions: [{ iri: "urn:x:other-1" }],
      credit: "Another table's credit.",
    },
  ];
  const shown = (named: Map<string, object>) =>
    textOf(podPage({ answers, about: named }, undefined, held));
  const credited = shown(about);
  assert.equal(
    credited.split("This material contains content from LOINC.").length,
    2,
  );
  assert.ok(!credited.includes("Another table's credit."));
  assert.ok(
    !shown(new Map()).includes("content from LOINC"),
    "a name the tables did not give has no credit",
  );
});

test("the medicines by class page groups the pod's active medicines under each class, one class alone when picked, with the table and version each came from and its credit, and says which medicines are in none and why", () => {
  const MEDRT = codeStems.MEDRT;
  const ORIGIN = "urn:x:classes-1";
  const series = {
    ...GROUPS,
    iri: "urn:x:classes",
    label: "Example drug classes",
    credit: "Classes are FDA's.",
    versions: [{ iri: ORIGIN, label: "1", issued: "2026-10-08" }],
  };
  const row = (
    entry: string,
    medication: string,
    cls: string,
    relation: string = terms.establishedPharmacologicClass,
    on = "3827",
    stated = "false",
  ) => ({
    entry,
    medication,
    class: `${MEDRT}${cls}`,
    relation,
    origin: ORIGIN,
    through: `http://www.nlm.nih.gov/research/umls/rxnorm/${on}`,
    stated,
  });
  const rows = [
    row("e4", "Estradiol 1 MG Oral Tablet", "N0000175825", undefined, "4083"),
    row(
      "e5",
      "Fluoroestradiol F-18",
      "N0000177914",
      undefined,
      "2372221",
      "true",
    ),
    row("e2", "Enalapril", "N0000175562"),
    row("e2", "Enalapril", "N0000000174", terms.mechanismOfActionClass),
  ];
  const LISINOPRIL_TABLET =
    "http://www.nlm.nih.gov/research/umls/rxnorm/314076";
  const medications = [
    {
      entry: "e1",
      medication: "Lisinopril 10 MG Oral Tablet",
      code: LISINOPRIL_TABLET,
    },
    { entry: "e2", medication: "Enalapril" },
    { entry: "e3", medication: "Lisinopril with hydrochlorothiazide" },
    { entry: "e4", medication: "Estradiol 1 MG Oral Tablet" },
    { entry: "e5", medication: "Fluoroestradiol F-18" },
  ];
  const about = new Map<string, object>([
    [
      `${MEDRT}N0000175562`,
      {
        notation: "N0000175562",
        name: {
          label: "Angiotensin Converting Enzyme Inhibitor [EPC]",
          altLabels: [],
          origin: ORIGIN,
        },
      },
    ],
    [
      `${MEDRT}N0000000174`,
      {
        notation: "N0000000174",
        name: {
          label: "Angiotensin-converting Enzyme Inhibitors",
          altLabels: [],
          origin: ORIGIN,
        },
      },
    ],
    [
      `${MEDRT}N0000175825`,
      {
        notation: "N0000175825",
        name: { label: "Estrogen [EPC]", altLabels: [], origin: ORIGIN },
      },
    ],
    [
      "http://www.nlm.nih.gov/research/umls/rxnorm/3827",
      {
        notation: "3827",
        name: { label: "enalapril", altLabels: [], origin: ORIGIN },
      },
    ],
    [
      "http://www.nlm.nih.gov/research/umls/rxnorm/4083",
      {
        notation: "4083",
        name: { label: "estradiol", altLabels: [], origin: ORIGIN },
      },
    ],
  ]);
  const read = {
    rows,
    medications,
    classes: about,
    elsewhere: new Map([[LISINOPRIL_TABLET, ["lisinopril"]]]),
    held: [series],
  };
  const page = (picked?: string, shown: object = read) =>
    textOf(
      draw("ClassesPage", {
        pod: "priya-natarajan",
        titles: new Map(),
        read: shown,
        picked,
      }),
    );
  const all = page();
  for (const said of [
    "Angiotensin Converting Enzyme Inhibitor [EPC] Established pharmacologic class",
    "Enalapril through enalapril",
    "Estrogen [EPC]",
    "Estradiol 1 MG Oral Tablet through estradiol",
    "Mechanism of action",
    "From Example drug classes, version 1, Oct 8, 2026.",
    "Classes are FDA's.",
    "Not in a class here",
    "Lisinopril 10 MG Oral Tablet: FDA classes a different form of lisinopril; RxNorm does not tie this product to it.",
    "Lisinopril with hydrochlorothiazide. MED-RT classes single ingredients",
  ])
    assert.ok(all.includes(said), `${said} in ${all}`);
  assert.ok(
    all.includes("Fluoroestradiol F-18") &&
      !all.includes("Fluoroestradiol F-18 through"),
    "a class on a code the entry states is not through anything",
  );
  assert.ok(
    !all.includes("Lisinopril 10 MG Oral Tablet, ") &&
      !all.includes("Lisinopril 10 MG Oral Tablet and"),
    "a medicine with its own reason is not in the general one",
  );
  assert.ok(
    all.indexOf("Established pharmacologic class") <
      all.indexOf("Mechanism of action"),
    "the relations come in MED-RT's order",
  );
  const picked = page(`${MEDRT}N0000000174`);
  assert.ok(picked.includes("Enalapril through"));
  assert.ok(
    !picked.includes("Estradiol 1 MG Oral Tablet through"),
    "only the class picked",
  );
  const none = page(undefined, { ...read, rows: [] });
  assert.ok(none.includes("None of this pod's active medicines is in a class"));
});

test("a panel's page lists the pod's results in LOINC's order with each test's requirement, newest first, the required tests with no result, a nested panel's tests under it, and the version and credit; it never says a result was drawn in the panel", () => {
  const LOINC = codeStems.LOINC;
  const ORIGIN = "urn:x:panels-1";
  const NAMES = "urn:x:names-1";
  const series = {
    ...GROUPS,
    iri: "urn:x:panels",
    label: "Example panel members",
    credit: "Panels: LOINC's credit.",
    versions: [{ iri: ORIGIN, label: "2.83", issued: "2026-10-05" }],
  };
  const names = {
    ...GROUPS,
    iri: "urn:x:names",
    label: "Example LOINC names",
    credit: "Names: LOINC's credit.",
    versions: [{ iri: NAMES, label: "2.84", issued: "2026-10-06" }],
  };
  const panel = `${LOINC}24326-1`;
  const nested = `${LOINC}99999-2`;
  const row = (
    member: string,
    sequence: number,
    required: string,
    entry?: string,
    via = panel,
  ) => ({
    panel,
    member: `${LOINC}${member}`,
    sequence: String(sequence),
    required,
    via,
    origin: ORIGIN,
    ...(entry !== undefined && { entry }),
  });
  const rows = [
    row("2951-2", 1, "R"),
    row("2823-3", 2, "R", "k1"),
    row("2823-3", 2, "R", "k2"),
    row("2075-0", 3, "R"),
    row("2028-9", 4, "O", "c1"),
    row("6298-4", 1, "R", "n1", nested),
    row("2823-3", 1, "R", "k1", nested),
  ];
  const name = (code: string, label: string): [string, object] => [
    `${LOINC}${code}`,
    { notation: code, name: { label, altLabels: [], origin: NAMES } },
  ];
  const read = {
    panel,
    rows,
    labs: [
      { entry: "k1", value: "4.1", unit: "mmol/L", performed: "2025-03-01" },
      { entry: "k2", value: "4.6", unit: "mmol/L", performed: "2025-06-01" },
      { entry: "c1", value: "24", unit: "mmol/L", performed: "2025-06-01" },
      { entry: "n1", value: "3.9", unit: "mmol/L", performed: "2025-06-01" },
    ],
    panelAbout: new Map([
      name("24326-1", "Electrolytes panel"),
      name("2951-2", "Sodium"),
      name("2823-3", "Potassium"),
      name("2075-0", "Chloride"),
      name("2028-9", "Carbon dioxide"),
      name("6298-4", "Potassium in blood"),
      name("99999-2", "Nested panel"),
    ]),
    held: [series, names],
  };
  const page = (shown: object = read) =>
    textOf(
      draw("PanelPage", { pod: "rowan-marsh", titles: new Map(), read: shown }),
    );
  const words = page();
  assert.ok(
    words.includes(
      "Your results in Electrolytes panel You have 1 of 3 required tests; missing: Sodium and Chloride.",
    ),
    words,
  );
  const order = ["Sodium", "Potassium", "Chloride", "Carbon dioxide"].map(
    (each) => words.indexOf(each, words.indexOf("Tests in the panel")),
  );
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
    "LOINC's order",
  );
  for (const said of [
    "Sodium required No result",
    "Potassium required 4.6 mmol/L Jun 1, 2025 4.1 mmol/L Mar 1, 2025",
    "Carbon dioxide optional 24 mmol/L",
    "Within Nested panel Potassium in blood required 3.9 mmol/L",
    "From Example panel members, version 2.83, Oct 5, 2026 and Example LOINC names, version 2.84, Oct 6, 2026.",
    "Panels: LOINC's credit.",
    "Names: LOINC's credit.",
    "that does not say your results were drawn as part of it",
  ])
    assert.ok(words.includes(said), `${said} in ${words}`);
  assert.equal(
    words.split("Potassium required").length,
    2,
    "a test the panel lists itself is not repeated under a nested panel",
  );
  const withMissingNested = page({
    ...read,
    rows: [...rows, row("6299-2", 2, "R", undefined, nested)],
    panelAbout: new Map([...read.panelAbout, name("6299-2", "Another test")]),
  });
  assert.ok(
    withMissingNested.includes(
      "You have 2 of 5 required tests; missing: Sodium, Chloride and Another test.",
    ),
    "a nested panel the query requires counts its held tests too",
  );
  assert.ok(
    page({ ...read, rows: [] }).includes("You have no results in this panel."),
  );
});

test("a lab result's page links the panels LOINC lists its test in, and a result whose test is in none has no such part", () => {
  const series = {
    ...GROUPS,
    iri: "urn:x:panels",
    label: "Example panel members",
    credit: "Panels: LOINC's credit.",
    versions: [{ iri: "urn:x:panels-1", label: "2.83", issued: "2026-10-05" }],
  };
  const labs = {
    [said.SOURCES]: [
      {
        entry: "urn:e:k",
        entryLabel: "Lab result entry · Potassium",
        record: "r-k",
        arrived: "2026-09-12T10:00:00Z",
      },
    ],
    "pod/My lab results": [
      {
        entry: "urn:e:k",
        entryLabel: "Lab result entry · Potassium",
        test: "Potassium",
        code: `${codeStems.LOINC}2823-3`,
        value: "4.1",
      },
    ],
  };
  const entry = said.entryOf(labs, said.entryId("urn:e:k"), {
    held: [series],
  });
  assert.deepEqual(entry.testCodes, [`${codeStems.LOINC}2823-3`]);
  const panels = [
    {
      series,
      version: series.versions[0],
      total: 3,
      panels: [
        {
          code: `${codeStems.LOINC}24326-1`,
          notation: "24326-1",
          required: "R",
          about: { notation: "24326-1", name: { label: "Electrolytes panel" } },
        },
      ],
    },
  ];
  const shown = (read: object) =>
    draw("EntryPage", {
      pod: "rowan-marsh",
      titles: new Map(),
      read,
      held: [series],
    });
  const page = shown({ entry, panels });
  const words = textOf(page);
  assert.ok(words.includes("In LOINC panels"));
  assert.ok(words.includes("Electrolytes panel required"));
  assert.ok(words.includes("and 2 more."));
  assert.ok(
    linksOf(page).some(
      ({ href }) =>
        href ===
        `/pods/rowan-marsh/panel?panel=${encodeURIComponent(`${codeStems.LOINC}24326-1`)}`,
    ),
    "a link opens the panel",
  );
  assert.ok(!textOf(shown({ entry, panels: [] })).includes("In LOINC panels"));
});

const SCT = "urn:test:sct/";
const AT_MERIDIAN = "Meridian Health System";
const AT_LARKSPUR = "Larkspur Valley Health";
const ASTHMA =
  "pod://0b5e7c1a-6d2f-4c8e-9a41-3f2d1e0c9b8a/clinical/conditions.ttl#aa11";
const LATEX = "urn:cascade:entry:bb22";
const record = (entry: string, at: string, extra: object) => ({
  entry,
  entryLabel: "Condition entry · Asthma",
  record: `${entry}-${at}`,
  document: `${entry}-${at}-document`,
  ...extra,
});

/** Asthma at two hospitals, its SNOMED code named and retired by two series; and a latex allergy only a review line names. */
const ENTRY_ANSWERS = {
  [SOURCES]: [
    record(ASTHMA, "meridian", {
      arrived: "2026-09-10T10:00:00Z",
      importLabel: "Apple Health export",
      hospital: AT_MERIDIAN,
      retrieved: "2026-09-01",
    }),
    record(ASTHMA, "larkspur", {
      arrived: "2026-08-01T10:00:00Z",
      importLabel: "FHIR pull",
      hospital: AT_LARKSPUR,
      retrieved: "2026-07-30",
    }),
    {
      entry: LATEX,
      entryLabel: "Allergy entry · Latex",
      record: "r-latex",
      arrived: "2026-09-12T10:00:00Z",
      importLabel: "entered by Alex in the Cascade app",
    },
  ],
  [CONDITIONS]: [
    {
      entry: ASTHMA,
      entryLabel: "Condition entry · Asthma",
      condition: "Asthma",
      onset: "2019-03-02",
      snomed: `${SCT}195967001`,
    },
  ],
  [SEEN]: [AT_MERIDIAN, AT_LARKSPUR].map((place) => ({
    entry: ASTHMA,
    place,
    records: "1",
    places: "2",
  })),
  [REVIEW]: [
    {
      entry: LATEX,
      entryLabel: "Allergy entry · Latex",
      needs: "judged different, still joined",
    },
  ],
};
const NAMES = {
  iri: "urn:test:names",
  label: "Example names",
  credit: "Names: an example publisher",
  versions: [{ iri: "urn:test:names-2", label: "2", issued: "2026-10-01" }],
};
const STATUS = {
  iri: "urn:test:status",
  label: "Example status",
  credit: "Status: another publisher",
  versions: [{ iri: "urn:test:status-1", label: "1", issued: "2026-09-01" }],
};

test("an entry's page, at the end of its IRI whatever pod holds it, says what it is, where each document it came from put it, and what Cascade and the tables say of it, each claim from a table naming the table and version, the version a link, and each credit once", () => {
  assert.equal(said.entryId(ASTHMA), "aa11");
  const about = new Map([
    [
      `${SCT}195967001`,
      {
        notation: "195967001",
        name: {
          label: "Asthma (disorder)",
          altLabels: [],
          origin: "urn:test:names-2",
        },
        status: {
          deprecated: true,
          replacedBy: [`${SCT}195967002`],
          origin: "urn:test:status-1",
        },
      },
    ],
  ]);
  const held = [NAMES, STATUS];
  const entry = said.entryOf(ENTRY_ANSWERS, "aa11", { about, held });
  assert.equal(entry.name, "Asthma (disorder)");
  assert.equal(entry.recorded, "Asthma");
  assert.equal(entry.kind, "condition");
  assert.deepEqual(entry.tags, ["Retired code"]);
  assert.deepEqual(entry.codes, [{ notation: "195967001", series: NAMES }]);
  assert.deepEqual(
    entry.where.map(({ place }: { place: string }) => place),
    [AT_LARKSPUR, AT_MERIDIAN],
    "oldest arrival first",
  );
  assert.deepEqual(
    entry.known.map(({ sentence }: { sentence: string }) => sentence),
    [
      `Cascade recorded it at ${AT_MERIDIAN} and ${AT_LARKSPUR} and keeps it as one condition.`,
      '195967001 is named "Asthma (disorder)".',
      "195967001 is retired, replaced by 195967002.",
    ],
  );
  assert.deepEqual(entry.credits, [NAMES.credit, STATUS.credit]);

  const page = draw("EntryPage", {
    pod: "alex-rivera",
    titles: new Map(),
    read: { entry, panels: [] },
    held,
  });
  const words = textOf(page).replace(/ \./g, ".");
  for (const shown of [
    "Asthma (disorder) Retired code",
    "Recorded as Asthma",
    "Since Mar 2, 2019",
    "Code 195967001",
    `${AT_LARKSPUR} retrieved Jul 30, 2026; arrived Aug 1, 2026 through FHIR pull`,
    `${AT_MERIDIAN} retrieved Sep 1, 2026; arrived Sep 10, 2026 through Apple Health export`,
    "195967001 is retired, replaced by 195967002. From Example status, version 1, Sep 1, 2026.",
    "From Example names, version 2, Oct 1, 2026.",
    "Back to Alex Rivera",
  ])
    assert.ok(words.includes(shown), `${shown} is not in ${words}`);
  for (const [href, text] of [
    [paths.table(said.tableId(NAMES.iri), { code: "195967001" }), "195967001"],
    [paths.table(said.tableId(STATUS.iri)), "version 1, Sep 1, 2026"],
    ["/pods/alex-rivera/", "Back to Alex Rivera"],
  ] as const)
    assert.ok(links(page, href, text), `${text} links to ${href}`);
  for (const credit of [NAMES.credit, STATUS.credit])
    assert.equal(words.split(credit).length, 2, `${credit} is said once`);
});

test("before the tables can say, an entry shows the record's own name and each code as written, unlinked, with no claim from a table, and where it came from and what Cascade did unchanged", () => {
  const entry = said.entryOf(ENTRY_ANSWERS, "aa11");
  assert.equal(entry.name, "Asthma");
  assert.equal(entry.recorded, undefined);
  assert.deepEqual(entry.tags, []);
  assert.deepEqual(entry.codes, [{ notation: "195967001" }]);
  assert.equal(entry.where.length, 2);
  assert.equal(entry.known.length, 1);
  assert.deepEqual(entry.credits, []);
  const page = draw("EntryPage", {
    pod: "alex-rivera",
    titles: new Map(),
    read: { entry, panels: [] },
    held: [],
  });
  assert.ok(textOf(page).includes("Code 195967001"));
  assert.ok(!page.includes('href="/tables/'));
});

test("an entry kept as one names the held table version whose rows joined it, and says nothing of a version the app does not hold; another table that joined it has a line of its own", () => {
  const joined = (...used: string[]) => new Map([[ASTHMA, used]]);
  const held = [NAMES, STATUS];
  const only = said.entryOf(ENTRY_ANSWERS, "aa11", {
    held,
    joined: joined("urn:test:names-2", "urn:test:rules", "urn:test:names-2"),
  });
  assert.equal(only.known.length, 1);
  assert.equal(only.known[0].from.series, NAMES);
  const shown = (entry: object) =>
    draw("EntryPage", {
      pod: "alex-rivera",
      titles: new Map(),
      read: { entry, panels: [] },
      held,
    });
  const page = textOf(shown(only)).replace(/ \./g, ".");
  assert.ok(
    page.includes(
      "and keeps it as one condition. Matched using Example names, version 2, Oct 1, 2026.",
    ),
    page,
  );

  assert.ok(
    links(
      shown(only),
      paths.table(said.tableId(NAMES.iri)),
      "version 2, Oct 1, 2026",
    ),
    "the version is a link to its table",
  );

  const twice = said.entryOf(ENTRY_ANSWERS, "aa11", {
    held,
    joined: joined("urn:test:names-2", "urn:test:status-1"),
  });
  assert.deepEqual(
    twice.known.map(({ from }: { from?: { series: object } }) => from?.series),
    [NAMES, STATUS],
  );
  const twicePage = textOf(shown(twice)).replace(/ \./g, ".");
  assert.ok(
    twicePage.includes("Also matched using Example status, version 1,"),
    twicePage,
  );
  assert.ok(!twicePage.includes("Another reference table"), twicePage);

  const none = said.entryOf(ENTRY_ANSWERS, "aa11", {
    held,
    joined: joined("urn:test:rules"),
  });
  assert.equal(none.known.length, 1);
  assert.equal(none.known[0].from, undefined);
});

test("the Medications tile holds a By class link to the class view, and no other tile does; with no medication there is none", () => {
  const answers = {
    [ALLERGIES]: [{ entry: "e1", allergen: "Penicillin" }],
    [MEDICATIONS]: [
      { entry: "e8", medication: "Lisinopril 10 MG Oral Tablet" },
    ],
  };
  const page = podPage({ answers });
  const boxes = [...page.matchAll(/<div class="tile-box[^"]*">(.*?)<\/div>/g)];
  assert.equal(boxes.length, 1);
  const [, box = ""] = boxes[0] ?? [];
  assert.match(textOf(box), /^Medications 1 /);
  assert.deepEqual(
    linksOf(page)
      .filter(({ text }) => text === "By class")
      .map(({ href }) => href),
    [paths.classes("alex-rivera")],
  );
  assert.ok(linksOf(box).some(({ text }) => text === "By class"));
  assert.equal((page.match(/<a class="tile[ "]/g) ?? []).length, 2);

  const noMedicines = podPage({ answers: { [ALLERGIES]: answers[ALLERGIES] } });
  assert.ok(!noMedicines.includes("By class"));
});

test("the Medications tile says each medication's L1 lifecycle, current ones first and counted, then how many stopped, and leaves out one entered in error", () => {
  const table: [string, Record<string, string>, string | undefined][] = [
    ["MedicationStopped", { medication: "Warfarin" }, "Stopped"],
    [
      "MedicationStopped",
      { medication: "Metformin", ended: "2024-04-15" },
      "Stopped Apr 15, 2024",
    ],
    ["MedicationEnteredInError", { medication: "Mistaken" }, undefined],
    ["MedicationUnknown", { medication: "Aspirin" }, "Unknown"],
    ["MedicationPaused", { medication: "Atorvastatin" }, "Paused"],
    ["MedicationActive", { medication: "Lisinopril" }, "Active"],
    [
      "MedicationActive",
      { medication: "Amlodipine", ended: "2027-01-31" },
      "Active, until Jan 31, 2027",
    ],
  ];
  const page = podPage({
    answers: {
      [MEDICATIONS]: table.map(([lifecycle, row], at) => ({
        entry: `e${at}`,
        lifecycle: terms[lifecycle as keyof Terms] as string,
        ...row,
      })),
    },
  });
  const [dialog = ""] = page
    .slice(page.indexOf('id="see-medications"'))
    .split(/class="dialog[^"]*"/);
  const cells = [...dialog.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)]
    .map(([, row = ""]) =>
      [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(([, cell = ""]) =>
        textOf(cell),
      ),
    )
    .filter((row) => row.length > 0)
    .map(([name, said]) => [name, said]);
  assert.deepEqual(
    cells,
    [
      "Amlodipine",
      "Lisinopril",
      "Atorvastatin",
      "Aspirin",
      "Warfarin",
      "Metformin",
    ].map((name) => [
      name,
      table.find(([, { medication }]) => medication === name)?.[2],
    ]),
  );
  assert.equal(
    linksOf(page).find(({ href }) => href === "#see-medications")?.text,
    "Medications 4 Amlodipine, Lisinopril, Atorvastatin, Aspirin, and 2 stopped",
  );
});

test("an entry no section shows is named and kinded from its label and says what a review line says; an address of no entry says so and links back", () => {
  const entry = said.entryOf(ENTRY_ANSWERS, "bb22");
  assert.equal(entry.name, "Latex");
  assert.equal(entry.kind, "allergy");
  assert.deepEqual(entry.what, []);
  assert.deepEqual(entry.codes, []);
  assert.deepEqual(entry.where, [
    {
      place: "Alex's own entries",
      arrived: "2026-09-12T10:00:00Z",
      records: 1,
    },
  ]);
  assert.deepEqual(entry.tags, ["Needs review"]);
  assert.deepEqual(entry.known, [
    {
      sentence:
        "Latex was marked as different, but is still shown as one allergy.",
      tag: "Needs review",
    },
  ]);

  assert.equal(said.entryOf(ENTRY_ANSWERS, "0"), undefined);
  const gone = textOf(
    draw("EntryPage", {
      pod: "alex-rivera",
      titles: new Map(),
      read: { entry: undefined, panels: [] },
      held: [],
    }),
  );
  assert.ok(gone.includes("This entry is no longer in this pod."));
  assert.ok(gone.includes("Back to Alex Rivera"));
});

const COUNSELLOR =
  "Your clinician or a genetic counsellor can explain what this means for you.";

test("a pod's page has a Genetic variants tile beside the others, a row for each variant entry that opens it, naming its gene and expression, counting its reports and tagged only once the tables say a report differs; the page has no variants card and no column of its own for ClinVar today, and Worth a look says which report differs and links to the variant's entry, and with nothing worth a look draws no such card", () => {
  const page = (shown: object = {}) =>
    podPage({ pod: "martin", answers: VARIANT_ANSWERS, ...shown });
  const rowsOf = (html: string) =>
    [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((found) => ({
      text: textOf((found[1] ?? "").replace(/ data-key="[^"]*"/g, "")),
      href: /<a href="([^"]*)"/.exec(found[1] ?? "")?.[1],
    }));
  const before = page();
  assert.ok(textOf(before).includes("Allergies 1"));
  assert.ok(textOf(before).includes("Genetic variants 2"));
  const [v1, orphan] = ["v1", "orphan"].map((entry) =>
    paths.entry("martin", entry),
  );
  const ofVariants = ({ href }: { href?: string }) =>
    [v1, orphan].includes(href ?? "");
  assert.deepEqual(rowsOf(before).filter(ofVariants), [
    { text: `MLH1 ${NAME} 2`, href: v1 },
    { text: "NM_000500.1:c.1A>G 1", href: orphan },
  ]);
  assert.deepEqual(
    rowsOf(page({ said: VARIANTS_SAID }))
      .filter(ofVariants)
      .map(({ text }) => text),
    [`MLH1 ${NAME} Differs 2`, "NM_000500.1:c.1A>G 1"],
  );
  assert.ok(!textOf(before).includes("ClinVar today"), "no column of its own");
  assert.ok(!/class="card [^"]*\bvariants\b/.test(before));
  assert.ok(!textOf(before).includes("counsellor"));
  assert.ok(
    !textOf(before).includes("differs from ClinVar"),
    "nothing needs a look yet",
  );
  assert.ok(!textOf(before).includes("Cascade keeps it as one variant"));
  const differing = `MLH1 ${NAME}: your 2022 report from ${HARBOURLINE} differs from ClinVar today.`;
  assert.deepEqual(said.worthALook(VARIANT_ANSWERS), []);
  assert.deepEqual(said.worthALook(VARIANT_ANSWERS, new Map(), VARIANTS_SAID), [
    { sentence: differing, entry: "v1", tag: DIFFERS },
  ]);
  const worth = /<div class="card worth[^"]*">([\s\S]*?)<\/div>/.exec(
    page({ said: VARIANTS_SAID }),
  )?.[1];
  assert.equal(textOf(worth ?? ""), `Worth a look ${differing} ${DIFFERS}`);
  assert.deepEqual(
    linksOf(worth ?? "").map(({ href }) => href),
    [v1],
    "it opens the entry",
  );
  assert.ok(
    !/class="card worth/.test(page({ about: new Map() })),
    "with nothing worth a look there is no such card",
  );
  assert.deepEqual(
    said.named(VARIANT_ANSWERS, new Map())[VARIANTS],
    VARIANT_ANSWERS[VARIANTS],
  );
  const bare = podPage({
    pod: "martin",
    answers: { [ALLERGIES]: VARIANT_ANSWERS[ALLERGIES] },
  });
  assert.ok(!bare.includes("Genetic variants"));
});

test("a variant's entry says its gene and expressions, its ClinVar ID linked to the series, the document each report came with and its date, and what else is known: what Cascade did, each report with its lab, ClinVar today with its table and version, the counsellor sentence, and the series' credit once", () => {
  const entry = said.entryOf(VARIANT_ANSWERS, "v1", {
    said: VARIANTS_SAID,
    held: [CLINVAR],
  });
  assert.equal(entry.name, `MLH1 ${NAME}`);
  assert.equal(entry.kind, "variant");
  assert.deepEqual(entry.tags, [DIFFERS]);
  assert.deepEqual(entry.what, [
    { head: "Gene", text: "MLH1" },
    { head: "Expressions", text: `${NAME}, NM_000249.4:c.2042C>T` },
  ]);
  assert.deepEqual(entry.codes, [{ notation: "90011", series: CLINVAR }]);
  assert.deepEqual(
    entry.where.map(({ place, issued }: Record<string, string>) => [
      place,
      issued,
    ]),
    [
      [HARBOURLINE, "2022-05-01"],
      [COLUMBA, "2024-03-21"],
    ],
  );
  assert.deepEqual(entry.known, [
    {
      sentence: `Cascade recorded it at ${HARBOURLINE} and ${COLUMBA} and keeps it as one variant.`,
    },
    {
      sentence: `Your 2022 report from ${HARBOURLINE} said uncertain significance.`,
      tag: DIFFERS,
    },
    { sentence: `Your 2024 report from ${COLUMBA} said likely pathogenic.` },
    {
      sentence: "ClinVar today says pathogenic.",
      from: { series: CLINVAR, version: CLINVAR.versions[0] },
    },
    { sentence: COUNSELLOR },
  ]);
  assert.deepEqual(entry.credits, [CLINVAR.credit]);
  const page = draw("EntryPage", {
    pod: "martin-okafor",
    titles: new Map(),
    read: { entry, panels: [] },
    held: [CLINVAR],
  });
  const words = textOf(page).replace(/ \./g, ".");
  for (const shown of [
    `${entry.name} ${DIFFERS}`,
    `Gene MLH1`,
    `${HARBOURLINE} report of May 1, 2022;`,
    `${COLUMBA} report of Mar 21, 2024;`,
    `uncertain significance. ${DIFFERS}`,
    "ClinVar today says pathogenic. From ClinVar variant classifications, version 1, Oct 1, 2026.",
  ])
    assert.ok(words.includes(shown), `${shown} is not in ${words}`);
  assert.ok(
    links(
      page,
      paths.table(said.tableId(CLINVAR.iri), { code: "90011" }),
      "90011",
    ),
    "the ClinVar ID links to its code page",
  );
  assert.equal(
    words.split(CLINVAR.credit).length,
    2,
    "the credit is said once",
  );
});

test("before the tables can say, a variant's entry names each report's lab and its classification in the IRI's own words, with no tag, no ClinVar sentence and its ClinVar ID unlinked; a variant only a report names is named from its label and takes the date of the document it shares", () => {
  const entry = said.entryOf(VARIANT_ANSWERS, "v1");
  assert.deepEqual(entry.tags, []);
  assert.deepEqual(entry.codes, [{ notation: "90011" }]);
  assert.deepEqual(
    entry.known.map(({ sentence }: { sentence: string }) => sentence),
    [
      `Cascade recorded it at ${HARBOURLINE} and ${COLUMBA} and keeps it as one variant.`,
      `Your 2022 report from ${HARBOURLINE} said uncertain significance.`,
      `Your 2024 report from ${COLUMBA} said likely pathogenic.`,
      COUNSELLOR,
    ],
  );
  assert.deepEqual(entry.credits, []);
  assert.ok(
    !draw("EntryPage", {
      pod: "martin-okafor",
      titles: new Map(),
      read: { entry, panels: [] },
      held: [],
    }).includes('href="/tables/'),
  );

  const orphan = said.entryOf(VARIANT_ANSWERS, "orphan");
  assert.equal(orphan.name, "NM_000500.1:c.1A>G");
  assert.equal(orphan.kind, "variant");
  assert.deepEqual(orphan.what, []);
  assert.deepEqual(orphan.codes, []);
  assert.deepEqual(
    orphan.where.map(({ issued }: Record<string, string>) => issued),
    ["2023-01-01"],
  );
  assert.deepEqual(
    orphan.known.map(({ sentence }: { sentence: string }) => sentence),
    ["Your 2023 report said benign.", COUNSELLOR],
  );
});

const count = (markup: string, part: string | RegExp) =>
  typeof part === "string"
    ? markup.split(part).length - 1
    : (markup.match(part)?.length ?? 0);
/** The addresses of the links on `markup` whose text is `text`. */
const hrefsOf = (markup: string, text: string) =>
  linksOf(markup)
    .filter((link) => link.text === text)
    .map(({ href }) => href);
const capitalised = (sentence: string) =>
  sentence[0]!.toUpperCase() + sentence.slice(1);

/** A story pod's page as `PodPage` draws it once the tables have answered with no name, with `answers` in place of the pod's own. */
function podOf(name: string, story: Story, answers = story.answers) {
  return podPage({
    pod: name,
    answers,
    about: new Map(),
    changes: story.changes,
  });
}

/** A story pod's trend page for the test and medication asked, as the app draws it from what PodApi's `trend` answers. */
function trendOf(
  name: string,
  { answers, changes }: Story,
  asked: { test?: string; medication?: string },
) {
  const labs = answers[LABS]!;
  const input = said.trendInput({ changes, labs }, asked);
  return draw("TrendPage", {
    pod: name,
    titles: new Map(),
    read: {
      labs,
      series: labSeriesIn(labs, input.test),
      timeline: timelineIn(answers[HISTORY]!),
      medication: input.medication,
    },
  });
}

test("What changed on the statin story patient's page: one card saying the change came after the day the prescription was written, that day marked, with both means and counts, the six results behind it each linking to its entry, and the trend's address", async () => {
  const story = (await storyPods()).get("story-statin")!;
  const [finding] = story.changes;
  const page = podOf("ines-calloway", story);
  assert.equal(count(page, /class="change[ "]/g), 1);
  assert.equal(finding!.medication.dateIs, "prescription written");
  const sentence = `${capitalised(finding!.test.name!)} was lower after ${finding!.medication.name} was prescribed.`;
  assert.ok(textOf(page).includes(sentence), sentence);
  assert.equal(count(page, /class="mark written[ "]/g), 1);
  assert.match(
    textOf(page),
    /162 → 98\.3 mg\/dL, the mean of 3 results before and 3 after/,
  );

  const behind = page.slice(page.indexOf('id="change-start-617310-18262-6"'));
  const [box = ""] = behind.split(/class="dialog[^"]*"/);
  assert.deepEqual(
    linksOf(box)
      .map(({ href }) => href)
      .filter((href) => href?.includes("/entries/"))
      .sort(),
    [...finding!.rows.before, ...finding!.rows.after]
      .map(({ entry }) => paths.entry("ines-calloway", entry!))
      .sort(),
  );
  assert.deepEqual(hrefsOf(page, "Open the trend"), [
    paths.trend("ines-calloway", { test: "18262-6", medication: "617310" }),
  ]);
  assert.deepEqual(hrefsOf(page, "Show the 6 results"), [
    "#change-start-617310-18262-6",
  ]);
});

test("a card is drawn once, by the tables' names: with the tables not yet asked What changed has no card and says it is naming what changed, and with their answer the card says the same as changeSaid does", async () => {
  const story = (await storyPods()).get("story-statin")!;
  const [finding] = story.changes;
  const shown = {
    pod: "ines-calloway",
    answers: story.answers,
    changes: story.changes,
  };
  const before = podPage(shown);
  assert.equal(count(before, /class="change[ "]/g), 0);
  assert.match(textOf(before), /What changed\s*Naming what changed…/);
  assert.equal(
    count(before, 'aria-busy="true"'),
    3,
    "it, the tiles and the credits wait",
  );

  const about = new Map([
    [
      finding!.medication.code,
      { name: { label: "Atorvastatin, per the tables", altLabels: [] } },
    ],
  ]);
  const landed = podPage({ ...shown, about });
  assert.equal(count(landed, "aria-busy"), 0);
  const sentence = said.changeSaid(finding, about);
  assert.ok(sentence.includes("Atorvastatin, per the tables"), sentence);
  assert.ok(textOf(landed).includes(sentence), sentence);
});

test("What changed says nothing stands out when no pair does, counts a pair with too few results without a card, and is absent when the pod holds no lab row or no medication-history row", async () => {
  const stories = await storyPods();
  const herring = podOf("pell-hargrove", stories.get("story-red-herring")!);
  assert.match(textOf(herring), /Nothing stands out yet\./);
  assert.equal(count(herring, /class="change[ "]/g), 0);

  const little = stories.get("story-too-little")!;
  const thin = podOf("rafferty-moon", little);
  assert.equal(count(thin, /class="change[ "]/g), 0);
  assert.match(
    textOf(thin),
    /1 pair of a medication and a test had too few results to say anything\./,
  );
  assert.match(
    textOf(thin),
    /[A-Z][^.:]*: [^.]+ was prescribed May 6, 2024, with 3 results before and 1 after\./,
  );
  assert.deepEqual(hrefsOf(thin, "Open the trend"), [
    paths.trend("rafferty-moon", { test: "2823-3", medication: "979492" }),
  ]);

  for (const question of [LABS, HISTORY])
    assert.equal(
      count(
        podOf("pell-hargrove", little, { ...little.answers, [question]: [] }),
        /class="card [^"]*\bchanges\b/g,
      ),
      0,
      question,
    );
});

test("no sentence CHANGED gives, and none said of any of the five stories' findings, says why a result changed", async () => {
  const causes =
    /because|caus|due to|effect|led to|improv|worsen|thanks to|\bworks?\b/i;
  const changed = said.CHANGED as Record<
    string,
    (test: string, medication: string, day: string) => string
  >;
  const days = said.MEDICATION_DAY as Record<string, { said: string }>;
  const sentences = Object.values(changed).flatMap((say) =>
    Object.values(days).map((day) => say("Test", "Medication", day.said)),
  );
  assert.equal(sentences.length, 6);
  for (const sentence of sentences) assert.doesNotMatch(sentence, causes);

  for (const [patient, story] of await storyPods()) {
    for (const finding of story.changes.filter(
      ({ direction }: Finding) => direction !== "not enough results",
    ))
      assert.doesNotMatch(
        said.sentenceOf(finding, said.changeNames(finding, new Map())),
        causes,
        patient,
      );
    assert.doesNotMatch(textOf(trendOf("a-pod", story, {})), causes, patient);
  }
});

test("a pod brought in twice says where What changed comes from: the imports in order, each with its source, the world's date it answered as of (else the person's day it was retrieved) and what it brought in, and the medication's new version with what differs; one import, or a medication of one version, says less", async () => {
  const story = (await storyPods()).get("story-statin")!;
  const [finding] = story.changes;
  const entry = finding!.medication.entry;
  const record = String(
    story.answers[said.SOURCES]!.find((row: Row) => row.entry === entry)!
      .record,
  );
  const IMPORTS = "pod/What each import brought in";
  const REVISIONS = "record/Its revisions, in the order they arrived";
  const VERSIONS = "record/What each version says";
  const north = "Cascade North Demo Hospital";
  const imported = (n: number, records: string[]) =>
    records.map((each) => ({
      started: `202${3 + n}-02-01T09:05:00Z`,
      import: `urn:uuid:import-${n}`,
      importLabel: "FHIR pull",
      record: each,
    }));
  const arrival = (n: number, each: string, version: string, extra = {}) => ({
    record: each,
    revision: `ni:revision-${n}-${each}`,
    version,
    arrived: `202${3 + n}-02-01T09:05:00Z`,
    import: `urn:uuid:import-${n}`,
    hospital: north,
    retrieved: `202${3 + n}-01-30T00:00:00Z`,
    ...extra,
  });
  const stated = (version: string, field: string, value: string) => ({
    version,
    field,
    value,
  });
  const twice = {
    ...story.answers,
    [IMPORTS]: [...imported(1, ["r-other", record]), ...imported(2, [record])],
    [REVISIONS]: [
      arrival(1, "r-other", "ni:other"),
      arrival(1, record, "ni:first"),
      arrival(2, record, "ni:second", {
        previous: "ni:revision-1",
        arrived: "2026-10-17T09:05:00Z",
        answeredAsOf: "2025-02-01T00:00:00Z",
      }),
    ],
    [VERSIONS]: [
      stated("ni:first", terms.drugName, "Atorvastatin"),
      stated(
        "ni:first",
        terms.statusOf.PrescribedOrReportedMedication,
        "active",
      ),
      stated("ni:second", terms.drugName, "Atorvastatin"),
      stated("ni:second", terms.medicationUseEndDate, "2024-04-15"),
      stated(
        "ni:second",
        terms.statusOf.PrescribedOrReportedMedication,
        "completed",
      ),
    ],
  };
  const zone = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  let drawn: string;
  try {
    drawn = textOf(podOf("pell-hargrove", story, twice));
  } finally {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  }
  assert.match(
    drawn,
    /Where this comes from The pod's records came in 2 imports, in this order: From Cascade North, retrieved 29 January 2024: 2 records\. From Cascade North, as of 1 February 2025: 1 record, 1 of them a new version of one the pod already held\. .+ came in a new version: version 1 to version 2, in import 2, as of 1 February 2025\. Workflow status active → completed; medication use end date none → Apr 15, 2024\./,
  );
  assert.doesNotMatch(drawn, /Oct 17, 2026/);
  const undated = textOf(
    podOf("pell-hargrove", story, {
      ...twice,
      [REVISIONS]: twice[REVISIONS]!.map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(([key]) => key !== "answeredAsOf"),
        ),
      ),
    }),
  );
  assert.ok(
    undated.includes(
      `in import 2, on ${said.localDay("2026-10-17T09:05:00Z")}.`,
    ),
    undated,
  );
  assert.doesNotMatch(drawn, /urn:|ni:|https?:/);
  assert.doesNotMatch(
    drawn.slice(drawn.indexOf("Where this comes from")),
    /because|caus|due to|effect|led to|improv|worsen|thanks to|\bworks?\b/i,
  );

  const once = textOf(podOf("pell-hargrove", story));
  assert.match(once, /What changed/);
  assert.doesNotMatch(once, /Where this comes from/);

  const unrevised = textOf(
    podOf("pell-hargrove", story, {
      ...twice,
      [REVISIONS]: twice[REVISIONS]!.slice(0, 2).concat(
        arrival(2, "r-third", "ni:third"),
      ),
    }),
  );
  assert.match(unrevised, /The pod's records came in 2 imports/);
  assert.doesNotMatch(unrevised, /came in a new version/);

  const asked: string[] = [];
  const ask = async (question: string) => {
    asked.push(question);
    return [];
  };
  const base = { ...story.answers, [IMPORTS]: twice[IMPORTS] };
  await said.withMechanism(
    { ...base, [IMPORTS]: twice[IMPORTS]!.slice(0, 2) },
    story.changes,
    ask,
  );
  await said.withMechanism(base, [], ask);
  assert.deepEqual(asked, [], "asked for a block that would not show");
  await said.withMechanism(base, story.changes, ask);
  assert.deepEqual(asked, [REVISIONS, VERSIONS]);
});

test("the trend names its first date from the earliest result, and its test and medication by the tables where they name the code, else by the record's own text, and says it is still naming them while the engine warms", () => {
  const series = {
    test: {
      code: `${codeStems.LOINC}18262-6`,
      notation: "18262-6",
      name: "LDL",
    },
    results: [{ date: "2024-03-10", value: 98, unit: "mg/dL" }],
    left: { unparsed: 0, undated: 0 },
  };
  const timeline = [
    {
      name: "Atorvastatin",
      code: "http://www.nlm.nih.gov/research/umls/rxnorm/617310",
      notation: "617310",
      started: "2024-01-05",
    },
    { name: "Aspirin", notation: "1191", started: "2020-01-01" },
  ];
  const drawn = (about?: Map<string, unknown>, naming?: boolean) =>
    draw("TrendPage", {
      pod: "a-pod",
      titles: new Map(),
      read: {
        labs: [],
        series,
        timeline,
        medication: "617310",
        ...(about ? { about } : {}),
      },
      ...(naming === undefined ? {} : { naming }),
    });

  const own = drawn();
  assert.match(
    own,
    /<desc id="trend-chart-desc">1 result from Mar 10, 2024 to Mar 10, 2024/,
  );
  assert.match(own, /Atorvastatin started Jan 5, 2024./);
  assert.match(textOf(own), /LDL/);
  assert.match(textOf(own), /Atorvastatin/);
  assert.doesNotMatch(own, /aria-busy/);

  const named = drawn(
    new Map([
      [series.test.code, { name: { label: "LDL cholesterol" } }],
      [timeline[0]!.code!, { name: { label: "Atorvastatin calcium" } }],
    ]),
  );
  assert.match(named, /<h1>LDL cholesterol[<]/);
  assert.match(named, /Atorvastatin calcium started/);
  assert.match(textOf(named), /Aspirin/);

  const naming = drawn(undefined, true);
  assert.match(naming, /<h1 aria-busy="true">LDL</);
  for (const part of ["trend", "picker"])
    assert.match(
      naming,
      new RegExp(`<div class="card [^"]*\\b${part}\\b[^"]*" aria-busy="true">`),
      part,
    );
});

test("the Medications box gives the day each prescription was written beside the day its use started, leaving Since empty where no start of use is known", async () => {
  const story = (await storyPods()).get("story-statin")!;
  assert.ok(
    textOf(podOf("ines-calloway", story)).includes(
      "Medication Status Since Prescribed Atorvastatin 20 mg tablet Active Mar 4, 2024 Estradiol 1 mg tablet Active Apr 1, 2019",
    ),
  );
});

test("the trend marks every day a medication has, the day a prescription was written, its start of use and its stop, each the earliest of its entries, and its lane says each", () => {
  const series = {
    test: { code: `${codeStems.LOINC}18262-6`, notation: "18262-6" },
    results: [{ date: "2024-03-10", value: 98, unit: "mg/dL" }],
    left: { unparsed: 0, undated: 0 },
  };
  const timeline = [
    { name: "Atorvastatin", notation: "617310", written: "2024-01-01" },
    { name: "Atorvastatin", notation: "617310", started: "2024-03-04" },
    { name: "Atorvastatin", notation: "617310", written: "2024-06-01" },
    {
      name: "Metformin",
      notation: "861007",
      written: "2023-05-01",
      started: "2023-06-01",
      ended: "2024-02-01",
    },
  ];
  const drawn = (medication: string) =>
    draw("TrendPage", {
      pod: "a-pod",
      titles: new Map(),
      read: { labs: [], series, timeline, medication },
    });
  const marked = (page: string) =>
    ["written", "start", "stop"].map((kind) =>
      count(page, new RegExp(`class="mark ${kind}[ "]`, "g")),
    );

  const mixed = drawn("617310");
  assert.deepEqual(marked(mixed), [1, 1, 0]);
  assert.match(
    textAt(mixed, "trend-chart-desc") ?? "",
    /Atorvastatin prescribed Jan 1, 2024\. Atorvastatin started Mar 4, 2024\.$/,
  );
  const lane = textAt(mixed, "trend-lane-desc") ?? "";
  assert.ok(
    lane.includes(
      "Atorvastatin: prescribed Jan 1, 2024, from Mar 4, 2024, not stopped.",
    ),
    lane,
  );
  assert.ok(
    lane.includes(
      "Metformin: prescribed May 1, 2023, from Jun 1, 2023 to Feb 1, 2024.",
    ),
    lane,
  );
  assert.deepEqual(marked(drawn("861007")), [1, 1, 1]);
});

test("the trend states that the chart leaves out a result in another unit, while its table still lists it", () => {
  const series = {
    test: { code: `${codeStems.LOINC}18262-6`, notation: "18262-6" },
    results: [
      { date: "2024-03-10", value: 98, unit: "mg/dL" },
      { date: "2024-04-10", value: 98, unit: "mg/dL" },
      { date: "2024-05-10", value: 2.5, unit: "mmol/L" },
    ],
    left: { unparsed: 0, undated: 0 },
  };
  const page = draw("TrendPage", {
    pod: "a-pod",
    titles: new Map(),
    read: { labs: [], series, timeline: [] },
  });
  assert.match(textOf(page), /The chart leaves out 1 result in another unit/);
  assert.doesNotMatch(textOf(page), /Left out/);
  assert.equal(rowsIn(page), 3);
});

test("the trend round-trips through its address: the state read from it draws the same test and medication, a marker for each result, the day the medication's prescription was written marked where no start of use is known, the test named and the results in a table", async () => {
  const story = (await storyPods()).get("story-statin")!;
  const href = paths.trend("ines-calloway", {
    test: "18262-6",
    medication: "617310",
  });
  const query = new URL(href, "http://app.test").searchParams;
  const asked = {
    test: query.get("test") ?? undefined,
    medication: query.get("medication") ?? undefined,
  };
  assert.deepEqual(asked, { test: "18262-6", medication: "617310" });
  const page = trendOf("ines-calloway", story, asked);

  assert.equal(count(page, /class="marker[ "]/g), 6);
  assert.equal(count(page, /class="mark written[ "]/g), 1);
  assert.equal(count(page, /class="mark start[ "]/g), 0);
  assert.equal(count(page, /class="mark stop[ "]/g), 0);
  const medication = story.changes[0]!.medication.name;
  assert.ok(
    textAt(page, "trend-lane-desc")?.includes(
      `${medication}: prescribed Mar 4, 2024, start of use not known, not stopped.`,
    ),
    textAt(page, "trend-lane-desc"),
  );
  const name = story.changes[0]!.test.name!;
  assert.equal(textAt(page, "trend-chart-title"), name);
  assert.match(
    textAt(page, "trend-chart-desc") ?? "",
    /^6 results from Sep 1, 2023 to Dec 2, 2024/,
  );
  assert.equal(rowsIn(page), 6);
  assert.deepEqual(currentIn(page), [name, story.changes[0]!.medication.name]);

  assert.deepEqual(
    said.trendInput({ changes: story.changes, labs: story.answers[LABS]! }, {}),
    asked,
  );
  const none = trendOf("ines-calloway", story, { test: "18262-6" });
  assert.equal(count(none, /class="mark [a-z]+[ "]/g), 0);
  assert.equal(count(none, /class="marker[ "]/g), 6);
});

/** The `data-ask` contexts a page draws, in order. */
const asksOf = (markup: string) =>
  [...markup.matchAll(/data-ask="([^"]*)"/g)].map(
    ([, context]) =>
      JSON.parse(context!.replaceAll("&quot;", '"')) as Record<string, unknown>,
  );

test("Ask about this: once the chat names a model, each What changed card, each Worth a look line, the trend and the entry draw a button naming the finding's key, the line's entry ID, the trend's test and medication or the entry's ID, and before it they draw none", async () => {
  const story = (await storyPods()).get("story-statin")!;
  const [finding] = story.changes;
  const pod =
    (answers: object, changes: readonly object[] = []) =>
    (ask: boolean) =>
      draw(
        "PodPage",
        {
          shown: { pod: "ines-calloway", answers, about: new Map(), changes },
          titles: new Map(),
          person: undefined,
          held: [],
        },
        ask,
      );
  const lines = {
    [REVIEW]: [
      { entry: "urn:uuid:e1", needs: "judged different, still joined" },
    ],
  };
  const trend = (ask: boolean) =>
    draw(
      "TrendPage",
      {
        pod: "a-pod",
        titles: new Map(),
        read: {
          labs: [],
          series: {
            test: { code: `${codeStems.LOINC}18262-6`, notation: "18262-6" },
            results: [{ date: "2024-03-10", value: 98, unit: "mg/dL" }],
            left: { unparsed: 0, undated: 0 },
          },
          timeline: [
            { name: "Atorvastatin", notation: "617310", started: "2024-01-05" },
          ],
          medication: "617310",
        },
      },
      ask,
    );
  const entry = (ask: boolean) =>
    draw(
      "EntryPage",
      {
        pod: "alex-rivera",
        titles: new Map(),
        read: { entry: said.entryOf(ENTRY_ANSWERS, "bb22"), panels: [] },
        held: [],
      },
      ask,
    );
  for (const [page, asked] of [
    [
      pod(story.answers, story.changes),
      [{ kind: "finding", key: finding!.key }],
    ],
    [pod(lines), [{ kind: "worth", entry: "e1" }]],
    [trend, [{ kind: "trend", test: "18262-6", medication: "617310" }]],
    [entry, [{ kind: "entry", id: "bb22" }]],
  ] as const) {
    assert.deepEqual(asksOf(page(false)), []);
    assert.doesNotMatch(page(false), /Ask about this/);
    const markup = page(true);
    assert.deepEqual(
      asksOf(markup).filter(({ kind }) => kind === asked[0].kind),
      asked,
    );
    assert.deepEqual(
      [...new Set(asksOf(markup).map(({ kind }) => kind))],
      [asked[0].kind],
      "the page draws no other kind of ask",
    );
    for (const [button, inside] of markup.matchAll(
      /<button [^>]*data-ask="[^>]*>(.*?)<\/button>/g,
    )) {
      assert.match(button, /title="Ask about this"/);
      assert.match(button, /aria-label="Ask about this: [^"]+"/);
      assert.equal(inside!.replace(/<svg.*<\/svg>/, ""), "");
    }
  }
});
