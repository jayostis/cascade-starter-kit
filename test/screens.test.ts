import assert from "node:assert/strict";
import process from "node:process";
import { after, before, describe, it } from "node:test";
import {
  codeStems,
  type FailureKind,
  type LabChange,
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
/** A day as the app writes it, such as `Mar 4, 2024`, and nothing for no day. */
const dayIn = (day: unknown) =>
  day === undefined || day === ""
    ? ""
    : new Date(`${String(day).slice(0, 10)}T00:00:00Z`).toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" },
      );

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

/** The rows of a pod's Medications box, each by the heading of its column. */
const medicationRows = (page: string): Record<string, string>[] => {
  const [box = ""] = page
    .slice(page.indexOf('id="see-medications"'))
    .split(/class="dialog[^"]*"/);
  const cells = (tag: string, row: string) =>
    [...row.matchAll(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "g"))].map(
      ([, cell = ""]) => textOf(cell),
    );
  const [headings = []] = [...box.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map(
    ([, row = ""]) => cells("th", row),
  );
  return [...box.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)]
    .map(([, row = ""]) => cells("td", row))
    .filter((row) => row.length > 0)
    .map((row) =>
      Object.fromEntries(
        headings.map((heading, index) => [heading, row[index] ?? ""]),
      ),
    );
};

/**
 * A pod's screen draws the record as tiles, one for each kind of record, each of which opens a box of its rows, with Worth a
 * look above them. A row is named by the reference tables once the engine has asked them, and by the record's own text
 * until then.
 */
describe("Reading a pod as a person's record · PodPage", () => {
  const CVX = "urn:test:cvx/";
  const ICD = "urn:test:icd/";
  const SNOMED = "urn:test:sct/";
  const LOINC = codeStems.LOINC;
  const answers = {
    "pod/My immunizations": [
      { entry: "i1", vaccine: "Fluarix", code: `${CVX}141` },
      { entry: "i2", vaccine: "Hantavax", code: `${CVX}57` },
      { entry: "i3", vaccine: "Old flu", code: `${CVX}15` },
      { entry: "i4", vaccine: "Unlisted", code: `${CVX}999` },
    ],
    [LABS]: [
      { entry: "l1", test: "K+", code: `${LOINC}2823-3` },
      { entry: "l2", test: "Chloride", code: `${LOINC}2075-0` },
    ],
    [CONDITIONS]: [
      {
        entry: "c1",
        condition: "Asthma",
        snomed: `${SNOMED}195967001`,
        icd10: `${ICD}J45.909`,
      },
    ],
    [REVIEW]: [{ entry: "i3", needs: "judged different, still joined" }],
  };
  describe("given a pod titled for another person than its name says, as a record's person titles a pod made without a name", () => {
    it("draws the title as the page's heading", () => {
      const page = drawn.podPage({
        shown: { pod: "walker-test", answers: {} },
        titles: new Map([["walker-test", "Ines Calloway"]]),
        held: [],
      });
      assert.match(page, /<h1>Ines Calloway[<][/]h1>/);
    });
  });

  describe("given a pod with allergies and lab results", () => {
    const page = podPage({
      answers: {
        [ALLERGIES]: [
          { entry: "urn:cascade:entry:e1", allergen: "Penicillin" },
        ],
        [LABS]: [{ entry: "urn:cascade:entry:e2", test: "Glucose" }],
      },
    });

    it("draws a tile for each kind of record the pod holds", () => {
      assert.equal((page.match(/<a class="tile[ "]/g) ?? []).length, 2);
    });

    it("links each row to its entry's screen", () => {
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
    });
  });

  describe("given a box drawn over a screen", () => {
    const BACK = "/pods/alex-rivera/";
    const page = [
      podPage({
        answers: {
          [ALLERGIES]: [{ entry: "e1", allergen: "Penicillin" }],
          [LABS]: [{ entry: "e2", test: "Glucose" }],
        },
        connection: at("pulling"),
      }),
      drawn.newPod({ people: [], pods: [], samples: [] }),
      drawn.connectionBox({
        pod: "alex-rivera",
        back: "#",
        connection: at("pulled", PULLED),
      }),
      drawn.hospitalsPage({
        pod: "alex-rivera",
        titles: new Map(),
        q: "",
        read: { rows: [] },
        people: [],
      }),
    ].join("\n");
    const boxes = page.split(/<div class="dialog[^"]*"/).slice(1);
    const connection = boxes.find((box) => box.startsWith(' id="connection"'));
    const firstLink = (box: string) => /<a [^>]*>/.exec(box)?.[0] ?? "";

    it('starts each box with a link outside it that closes it, named "Close the box"', () => {
      assert.ok(boxes.length > 0, "the boxes drawn");
      for (const box of boxes) {
        const first = firstLink(box);
        assert.match(first, / class="backdrop[^"]*"/, box.slice(0, 80));
        assert.match(first, / aria-label="Close the box"/, box.slice(0, 80));
        assert.ok(
          box.indexOf(first) < box.indexOf('<div class="box'),
          box.slice(0, 80),
        );
      }
    });

    it("closes the box of the pod's connection to the pod's address, and every other box to `#`", () => {
      assert.ok(connection, "the pod's connection box");
      for (const box of boxes)
        assert.ok(
          firstLink(box).includes(` href="${box === connection ? BACK : "#"}"`),
          box.slice(0, 80),
        );
    });
  });

  describe("given rows whose codes the reference tables name", () => {
    const name = (label: string) => ({
      name: { label, altLabels: [], origin: "urn:x:names" },
    });
    const retired = (...replacedBy: string[]) => ({
      status: { deprecated: true, replacedBy, origin: "urn:x:status" },
    });
    const about = new Map<string, object>([
      [`${CVX}141`, name("flu, split")],
      [`${CVX}57`, { ...name("hantavirus"), ...retired() }],
      [`${CVX}15`, retired(`${CVX}141`, `${CVX}150`)],
      [`${SNOMED}195967001`, { ...name("Asthma (disorder)"), ...retired() }],
      [`${ICD}J45.909`, name("Unspecified asthma, uncomplicated")],
      [`${LOINC}2823-3`, name("Potassium [Moles/volume] in Serum or Plasma")],
    ]);
    const lines = podPage({ answers, about })
      .replace(/<[^>]*>/g, "\n")
      .split("\n")
      .map((line) => textOf(line))
      .filter(Boolean);

    it("names a row by the first of its codes the tables name", () => {
      for (const shown of [
        "Unspecified asthma, uncomplicated",
        "flu, split",
        "hantavirus",
        "Potassium [Moles/volume] in Serum or Plasma",
      ])
        assert.ok(lines.includes(shown), shown);
      for (const hidden of ["Fluarix", "Hantavax", "Asthma (disorder)", "K+"])
        assert.ok(!lines.includes(hidden), hidden);
    });

    it("names a row by the record's own text where the tables name none of its codes", () => {
      for (const shown of ["Old flu", "Unlisted", "Chloride"])
        assert.ok(lines.includes(shown), shown);
    });

    it('tags a row "Retired code" when the code that named it is retired, or with no name its first code with a status', () => {
      assert.equal(
        lines.filter((line) => line.startsWith("Retired code")).length,
        2,
        "hantavirus, named and retired, and Old flu, with no name; the asthma row has none, its retired SNOMED CT code did not name it",
      );
    });

    it("leaves what replaced a retired code to the entry's screen", () => {
      assert.ok(
        !lines.some((line) => line.includes("replaced by")),
        "what replaces a retired code is said on its entry, not in the tag",
      );
    });

    it('tags "Needs review" the row of an entry that needs review, and its line in Worth a look', () => {
      assert.equal(lines.filter((line) => line === "Needs review").length, 2);
    });

    it("says in Worth a look that the entry was marked as different", () => {
      assert.ok(
        lines.some((line) =>
          line.startsWith("Old flu was marked as different"),
        ),
      );
    });

    it("lists a tile's first rows by the same names", () => {
      assert.ok(lines.includes("flu, split, hantavirus, Old flu, Unlisted"));
    });
  });

  describe("given rows the tables have not been asked about", () => {
    it('names every row by the record\'s own text, with no "Retired code"', () => {
      const lines = podPage({ answers })
        .replace(/<[^>]*>/g, "\n")
        .split("\n")
        .map((line) => textOf(line))
        .filter(Boolean);
      for (const shown of ["Fluarix", "Hantavax", "Asthma", "K+"])
        assert.ok(lines.includes(shown), shown);
      assert.ok(!lines.some((line) => line.startsWith("Retired")));
    });
  });

  describe("given names from a table that asks for a credit", () => {
    const code = `${codeStems.LOINC}2823-3`;
    const labs = {
      [LABS]: [
        { entry: "l1", test: "K+", code },
        { entry: "l2", test: "K again", code },
      ],
    };
    const named = new Map<string, object>([
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
    const shown = (about: Map<string, object>) =>
      textOf(podPage({ answers: labs, about }, undefined, held));

    it("prints once the credit of the table whose names it shows", () => {
      assert.equal(
        shown(named).split("This material contains content from LOINC.").length,
        2,
      );
    });

    it("prints no credit of a table it shows no name from", () => {
      assert.ok(!shown(named).includes("Another table's credit."));
    });

    it("prints no credit when the tables named no row", () => {
      assert.ok(
        !shown(new Map()).includes("content from LOINC"),
        "a name the tables did not give has no credit",
      );
    });
  });

  describe("given medications in every state", () => {
    const STATES: [string, Record<string, string>, string | undefined][] = [
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
        [MEDICATIONS]: STATES.map(([lifecycle, row], index) => ({
          entry: `e${index}`,
          lifecycle: terms[lifecycle as keyof Terms] as string,
          ...row,
        })),
      },
    });
    const rows = medicationRows(page);
    const statusOf = (name: string) =>
      STATES.find(([, { medication }]) => medication === name)?.[2];

    it("lists them Active, Paused, Unknown, then Stopped", () => {
      assert.deepEqual(
        rows.map((row) => row.Medication),
        [
          "Amlodipine",
          "Lisinopril",
          "Atorvastatin",
          "Aspirin",
          "Warfarin",
          "Metformin",
        ],
      );
    });

    it("says each one's state, with the day it stopped or is to stop", () => {
      assert.deepEqual(
        rows.map((row) => row.Status),
        rows.map((row) => statusOf(row.Medication!)),
      );
    });

    it("leaves out a medication entered in error", () => {
      assert.ok(!rows.some((row) => row.Medication === "Mistaken"));
    });

    it("counts on the tile those not stopped, names them, then counts the stopped", () => {
      assert.equal(
        linksOf(page).find(({ href }) => href === "#see-medications")?.text,
        "Medications 4 Amlodipine, Lisinopril, Atorvastatin, Aspirin, and 2 stopped",
      );
    });

    it('links "By class" from the Medications tile, and from no other, to the pod\'s medicines by drug class', () => {
      const withAllergy = podPage({
        answers: {
          [ALLERGIES]: [{ entry: "e1", allergen: "Penicillin" }],
          [MEDICATIONS]: [
            { entry: "e8", medication: "Lisinopril 10 MG Oral Tablet" },
          ],
        },
      });
      const boxes = [
        ...withAllergy.matchAll(/<div class="tile-box[^"]*">(.*?)<\/div>/g),
      ];
      assert.equal(boxes.length, 1);
      const [, box = ""] = boxes[0] ?? [];
      assert.match(textOf(box), /^Medications 1 /);
      assert.deepEqual(
        linksOf(withAllergy)
          .filter(({ text }) => text === "By class")
          .map(({ href }) => href),
        [paths.classes("alex-rivera")],
      );
      assert.ok(linksOf(box).some(({ text }) => text === "By class"));
      assert.equal((withAllergy.match(/<a class="tile[ "]/g) ?? []).length, 2);
    });

    it('draws no "By class" link for a pod with no medication', () => {
      const none = podPage({
        answers: { [ALLERGIES]: [{ entry: "e1", allergen: "Penicillin" }] },
      });
      assert.ok(!none.includes("By class"));
    });
  });

  describe("given the statin story's medications", () => {
    let story: Story;
    before(async () => {
      story = (await storyPods()).get("story-statin")!;
    });

    it("gives the day a prescription was written under Prescribed, and leaves Since empty where no start of use is known", () => {
      const history = story.answers[HISTORY]!;
      const shown = medicationRows(podOf("ines-calloway", story));
      assert.ok(shown.length > 0, "the story's medications");
      for (const row of shown) {
        const held = history.find((each) => each.medication === row.Medication);
        assert.ok(held, `${row.Medication} has a row in the history`);
        assert.equal(
          row.Since,
          dayIn(held.started),
          `${row.Medication}'s Since`,
        );
        assert.equal(
          row.Prescribed,
          dayIn(held.written),
          `${row.Medication}'s Prescribed`,
        );
      }
    });
  });

  describe("given a pod with genetic variants", () => {
    const page = (shown: object = {}) =>
      podPage({ pod: "martin", answers: VARIANT_ANSWERS, ...shown });
    const rowsOf = (html: string) =>
      [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((found) => ({
        text: textOf((found[1] ?? "").replace(/ data-key="[^"]*"/g, "")),
        href: /<a href="([^"]*)"/.exec(found[1] ?? "")?.[1],
      }));
    const [V1, ORPHAN] = ["v1", "orphan"].map((entry) =>
      paths.entry("martin", entry),
    );
    const ofVariants = ({ href }: { href?: string }) =>
      [V1, ORPHAN].includes(href ?? "");
    const plain = page();
    const differing = `MLH1 ${NAME}: your 2022 report from ${HARBOURLINE} differs from ClinVar today.`;
    const worth = (markup: string) =>
      /<div class="card worth[^"]*">([\s\S]*?)<\/div>/.exec(markup)?.[1];

    it("draws a Genetic variants tile beside the others, with how many it holds", () => {
      assert.ok(textOf(plain).includes("Allergies 1"));
      assert.ok(textOf(plain).includes("Genetic variants 2"));
    });

    it("draws a row for each variant that opens its entry, with its gene, its expression and how many reports", () => {
      assert.deepEqual(rowsOf(plain).filter(ofVariants), [
        { text: `MLH1 ${NAME} 2`, href: V1 },
        { text: "NM_000500.1:c.1A>G 1", href: ORPHAN },
      ]);
    });

    it("draws the same rows whatever the tables name, a name for another row's code changing none of them", () => {
      const CODE = "urn:test:penicillin";
      const [allergy] = VARIANT_ANSWERS[ALLERGIES];
      const coded = {
        ...VARIANT_ANSWERS,
        [ALLERGIES]: [{ ...allergy, code: CODE }],
      };
      const about = new Map([
        [
          CODE,
          { name: { label: "Penicillin, per the tables", altLabels: [] } },
        ],
      ]);
      const named = page({ answers: coded, about });
      assert.ok(textOf(named).includes("Penicillin, per the tables"));
      assert.deepEqual(
        rowsOf(named).filter(ofVariants),
        rowsOf(plain).filter(ofVariants),
      );
    });

    it('tags a variant "Differs" only once the tables say a report differs from ClinVar', () => {
      assert.deepEqual(
        rowsOf(page({ said: VARIANTS_SAID }))
          .filter(ofVariants)
          .map(({ text }) => text),
        [`MLH1 ${NAME} Differs 2`, "NM_000500.1:c.1A>G 1"],
      );
      assert.ok(!textOf(plain).includes(DIFFERS), "no tag before");
    });

    it("keeps what ClinVar says today, and the counsellor sentence, off the pod's screen", () => {
      assert.ok(
        !textOf(plain).includes("ClinVar today"),
        "no column of its own",
      );
      assert.ok(!/class="card [^"]*\bvariants\b/.test(plain));
      assert.ok(!textOf(plain).includes("counsellor"));
      assert.ok(!textOf(plain).includes("Cascade keeps it as one variant"));
    });

    it("says in Worth a look which report differs from ClinVar today, linking to the variant's entry", () => {
      assert.ok(
        !textOf(plain).includes("differs from ClinVar"),
        "nothing needs a look yet",
      );
      const card = worth(page({ said: VARIANTS_SAID }));
      assert.equal(textOf(card ?? ""), `Worth a look ${differing} ${DIFFERS}`);
      assert.deepEqual(
        linksOf(card ?? "").map(({ href }) => href),
        [V1],
        "it opens the entry",
      );
    });

    it("draws no Worth a look card when nothing is worth a look", () => {
      assert.ok(
        !/class="card worth/.test(page({ about: new Map() })),
        "with nothing worth a look there is no such card",
      );
    });

    it("draws no Genetic variants tile for a pod with no variant", () => {
      const bare = podPage({
        pod: "martin",
        answers: { [ALLERGIES]: VARIANT_ANSWERS[ALLERGIES] },
      });
      assert.ok(!bare.includes("Genetic variants"));
    });
  });
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
const COUNSELLOR =
  "Your clinician or a genetic counsellor can explain what this means for you.";
const CASCADE_RECORDED_ASTHMA = `Cascade recorded it at ${AT_MERIDIAN} and ${AT_LARKSPUR} and keeps it as one condition.`;
const CASCADE_RECORDED_VARIANT = `Cascade recorded it at ${HARBOURLINE} and ${COLUMBA} and keeps it as one variant.`;

type Where = { place: string };
type Known = { sentence: string; from?: { series: object } };
/** An entry's screen, drawn from the entry `read` gives and the tables the app holds. */
const entryPage = (read: object, held: object[] = [], pod = "alex-rivera") =>
  draw("EntryPage", { pod, titles: new Map(), read, held });
/** The words of a page, each space before a full stop removed, and the sentences it must hold. */
const wordsOf = (page: string) => textOf(page).replace(/ \./g, ".");
const holds = (words: string, sentence: string) =>
  assert.ok(words.includes(sentence), `${sentence} is not in ${words}`);

/**
 * An entry's screen says what one thing in the record is, which documents it came from, and what else is known of it:
 * what Cascade did with its records, then what the reference tables say of its codes, each sentence with the table and
 * version it is from. `entryOf` gives the screen its content from rows of named questions.
 */
describe("Reading one entry of a pod · EntryPage, entryOf(), entryId()", () => {
  describe("given a condition two hospitals recorded, its code named and retired by the tables", () => {
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
    const page = entryPage({ entry, panels: [] }, held);
    const words = wordsOf(page);
    const sentences = entry.known.map(({ sentence }: Known) => sentence);

    it("takes the end of an entry's IRI as its address, whatever pod holds it", () => {
      assert.equal(said.entryId(ASTHMA), "aa11");
    });

    it("names it by the tables' name, with the record's own text as \"Recorded as\"", () => {
      assert.equal(entry.name, "Asthma (disorder)");
      assert.equal(entry.recorded, "Asthma");
      holds(words, "Recorded as Asthma");
    });

    it('tags it "Retired code"', () => {
      assert.deepEqual(entry.tags, ["Retired code"]);
      holds(words, "Asthma (disorder) Retired code");
    });

    it("gives its kind, and the day it began", () => {
      assert.equal(entry.kind, "condition");
      holds(words, "Since Mar 2, 2019");
    });

    it("lists a line for each document it came from, oldest arrival first, with the day retrieved, the day arrived and the import", () => {
      assert.deepEqual(
        entry.where.map(({ place }: Where) => place),
        [AT_LARKSPUR, AT_MERIDIAN],
        "oldest arrival first",
      );
      holds(
        words,
        `${AT_LARKSPUR} retrieved on 30 July 2026; arrived on 1 August 2026 through FHIR pull`,
      );
      holds(
        words,
        `${AT_MERIDIAN} retrieved on 1 September 2026; arrived on 10 September 2026 through Apple Health export`,
      );
    });

    it("says what Cascade did: where it recorded it, and that it keeps it as one condition", () => {
      assert.equal(sentences[0], CASCADE_RECORDED_ASTHMA);
    });

    it("says what each table says of its code, each with the table and version it is from", () => {
      assert.deepEqual(sentences.slice(1), [
        '195967001 is named "Asthma (disorder)".',
        "195967001 is retired, replaced by 195967002.",
      ]);
      holds(
        words,
        "195967001 is retired, replaced by 195967002. From Example status, version 1, Sep 1, 2026.",
      );
      holds(words, "From Example names, version 2, Oct 1, 2026.");
    });

    it("links its code to that code's page in the table that names it", () => {
      assert.deepEqual(entry.codes, [{ notation: "195967001", series: NAMES }]);
      holds(words, "Code 195967001");
      assert.ok(
        links(
          page,
          paths.table(said.tableId(NAMES.iri), { code: "195967001" }),
          "195967001",
        ),
      );
    });

    it("links a version to its table", () => {
      assert.ok(
        links(
          page,
          paths.table(said.tableId(STATUS.iri)),
          "version 1, Sep 1, 2026",
        ),
      );
    });

    it("prints each table's credit once", () => {
      assert.deepEqual(entry.credits, [NAMES.credit, STATUS.credit]);
      for (const credit of [NAMES.credit, STATUS.credit])
        assert.equal(words.split(credit).length, 2, `${credit} is said once`);
    });

    it("links back to the pod", () => {
      assert.ok(links(page, "/pods/alex-rivera/", "Back to Alex Rivera"));
      holds(words, "Back to Alex Rivera");
    });
  });

  describe("given the same condition before the tables can say", () => {
    const entry = said.entryOf(ENTRY_ANSWERS, "aa11");
    const page = entryPage({ entry, panels: [] });

    it("names it by the record's own text, with no tag and no credit", () => {
      assert.equal(entry.name, "Asthma");
      assert.equal(entry.recorded, undefined);
      assert.deepEqual(entry.tags, []);
      assert.deepEqual(entry.credits, []);
    });

    it("gives its code as written, with no link to a table", () => {
      assert.deepEqual(entry.codes, [{ notation: "195967001" }]);
      assert.ok(textOf(page).includes("Code 195967001"));
      assert.ok(!page.includes('href="/tables/'));
    });

    it("keeps both places it came from, and what Cascade did", () => {
      assert.deepEqual(
        entry.where.map(({ place }: Where) => place),
        [AT_LARKSPUR, AT_MERIDIAN],
      );
      assert.deepEqual(
        entry.known.map(({ sentence }: Known) => sentence),
        [CASCADE_RECORDED_ASTHMA],
      );
    });
  });

  describe("given a condition matched by a table's rows", () => {
    const held = [NAMES, STATUS];
    const joined = (...used: string[]) => new Map([[ASTHMA, used]]);
    const only = said.entryOf(ENTRY_ANSWERS, "aa11", {
      held,
      joined: joined("urn:test:names-2", "urn:test:rules", "urn:test:names-2"),
    });
    const twice = said.entryOf(ENTRY_ANSWERS, "aa11", {
      held,
      joined: joined("urn:test:names-2", "urn:test:status-1"),
    });
    const none = said.entryOf(ENTRY_ANSWERS, "aa11", {
      held,
      joined: joined("urn:test:rules"),
    });
    const onlyPage = entryPage({ entry: only, panels: [] }, held);

    it('says "Matched using" with the held table and version, the version a link to its table', () => {
      assert.equal(only.known[0].from.series, NAMES);
      holds(
        wordsOf(onlyPage),
        "and keeps it as one condition. Matched using Example names, version 2, Oct 1, 2026.",
      );
      assert.ok(
        links(
          onlyPage,
          paths.table(said.tableId(NAMES.iri)),
          "version 2, Oct 1, 2026",
        ),
        "the version is a link to its table",
      );
    });

    it('says "Also matched using" on a line of its own for a second table', () => {
      assert.deepEqual(
        twice.known.map(({ from }: Known) => from?.series),
        [NAMES, STATUS],
      );
      const words = wordsOf(entryPage({ entry: twice, panels: [] }, held));
      holds(words, "Also matched using Example status, version 1,");
      assert.ok(!words.includes("Another reference table"), words);
    });

    it("says nothing of a version the app does not hold", () => {
      assert.equal(only.known.length, 1);
      assert.equal(none.known.length, 1);
      assert.equal(none.known[0].from, undefined);
    });
  });

  describe("given an entry no tile of the pod's screen shows", () => {
    const entry = said.entryOf(ENTRY_ANSWERS, "bb22");

    it("names it, and gives its kind, from its `entryLabel`", () => {
      assert.equal(entry.name, "Latex");
      assert.equal(entry.kind, "allergy");
    });

    it('says what its line in Worth a look says, tagged "Needs review"', () => {
      assert.deepEqual(entry.tags, ["Needs review"]);
      assert.deepEqual(entry.known, [
        {
          sentence:
            "Latex was marked as different, but is still shown as one allergy.",
          tag: "Needs review",
        },
      ]);
    });

    it("places a record the person entered under their own entries", () => {
      assert.deepEqual(entry.where, [
        {
          place: "Alex's own entries",
          arrived: "2026-09-12T10:00:00Z",
          records: 1,
        },
      ]);
    });

    it("gives no column and no code", () => {
      assert.deepEqual(entry.what, []);
      assert.deepEqual(entry.codes, []);
    });
  });

  describe("given an address of no entry", () => {
    it("returns undefined from `entryOf()`", () => {
      assert.equal(said.entryOf(ENTRY_ANSWERS, "0"), undefined);
    });

    it("says that the entry is no longer in this pod, with a link back to the pod", () => {
      const gone = textOf(entryPage({ entry: undefined, panels: [] }));
      assert.ok(gone.includes("This entry is no longer in this pod."));
      assert.ok(gone.includes("Back to Alex Rivera"));
    });
  });

  describe("given a lab result whose test LOINC lists in panels", () => {
    const series = {
      ...GROUPS,
      iri: "urn:x:panels",
      label: "Example panel members",
      credit: "Panels: LOINC's credit.",
      versions: [
        { iri: "urn:x:panels-1", label: "2.83", issued: "2026-10-05" },
      ],
    };
    const POTASSIUM = `${codeStems.LOINC}2823-3`;
    const PANEL = `${codeStems.LOINC}24326-1`;
    const entry = said.entryOf(
      {
        [SOURCES]: [
          {
            entry: "urn:e:k",
            entryLabel: "Lab result entry · Potassium",
            record: "r-k",
            arrived: "2026-09-12T10:00:00Z",
          },
        ],
        [LABS]: [
          {
            entry: "urn:e:k",
            entryLabel: "Lab result entry · Potassium",
            test: "Potassium",
            code: POTASSIUM,
            value: "4.1",
          },
        ],
      },
      said.entryId("urn:e:k"),
      { held: [series] },
    );
    const panels = [
      {
        series,
        version: series.versions[0],
        total: 3,
        panels: [
          {
            code: PANEL,
            notation: "24326-1",
            required: "R",
            about: {
              notation: "24326-1",
              name: { label: "Electrolytes panel" },
            },
          },
        ],
      },
    ];
    const shown = (given: object[]) =>
      entryPage({ entry, panels: given }, [series], "rowan-marsh");
    const page = shown(panels);

    it("gives the test's code as `testCodes`", () => {
      assert.deepEqual(entry.testCodes, [POTASSIUM]);
    });

    it("lists the panels its test is in, with the test's requirement, and counts the rest", () => {
      const words = textOf(page);
      assert.ok(words.includes("In LOINC panels"));
      assert.ok(words.includes("Electrolytes panel required"));
      assert.ok(words.includes("and 2 more."));
    });

    it("links a panel to the pod's results in that panel", () => {
      assert.ok(
        linksOf(page).some(
          ({ href }) =>
            href ===
            `/pods/rowan-marsh/panel?panel=${encodeURIComponent(PANEL)}`,
        ),
        "a link opens the panel",
      );
    });

    it('draws no "In LOINC panels" part for a test in no panel', () => {
      assert.ok(!textOf(shown([])).includes("In LOINC panels"));
    });
  });

  describe("when the engine has not yet said what the tables say", () => {
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

    it("marks one part busy while the engine warms, and while it reads", () => {
      for (const engine of ["waiting", "ready"])
        assert.equal(
          shown(engine).split('aria-busy="true"').length - 1,
          1,
          engine,
        );
    });

    it("marks nothing busy once the engine has failed", () => {
      assert.doesNotMatch(shown("failed"), /aria-busy/);
    });
  });

  describe("given a variant two labs reported, once the tables have said", () => {
    const entry = said.entryOf(VARIANT_ANSWERS, "v1", {
      said: VARIANTS_SAID,
      held: [CLINVAR],
    });
    const page = entryPage({ entry, panels: [] }, [CLINVAR], "martin-okafor");
    const words = wordsOf(page);

    it('names it by its gene and expression, tagged "Differs"', () => {
      assert.equal(entry.name, `MLH1 ${NAME}`);
      assert.equal(entry.kind, "variant");
      assert.deepEqual(entry.tags, [DIFFERS]);
      holds(words, `${entry.name} ${DIFFERS}`);
    });

    it("gives its gene and its expressions", () => {
      assert.deepEqual(entry.what, [
        { head: "Gene", text: "MLH1" },
        { head: "Expressions", text: `${NAME}, NM_000249.4:c.2042C>T` },
      ]);
      holds(words, "Gene MLH1");
    });

    it("gives its ClinVar ID, linked to that ID's page in the ClinVar table", () => {
      assert.deepEqual(entry.codes, [{ notation: "90011", series: CLINVAR }]);
      assert.ok(
        links(
          page,
          paths.table(said.tableId(CLINVAR.iri), { code: "90011" }),
          "90011",
        ),
        "the ClinVar ID links to its code page",
      );
    });

    it("lists the document each report came with, and the report's day", () => {
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
      holds(words, `${HARBOURLINE} report of 1 May 2022;`);
      holds(words, `${COLUMBA} report of 21 March 2024;`);
    });

    it("says a malformed report date as written", () => {
      const malformed = {
        ...entry,
        where: [{ place: HARBOURLINE, issued: "2024-13-45", records: 1 }],
      };
      const text = wordsOf(
        entryPage({ entry: malformed, panels: [] }, [CLINVAR], "martin-okafor"),
      );
      holds(text, `${HARBOURLINE} report of 2024-13-45`);
      assert.doesNotMatch(text, /NaN|undefined/);
    });

    it("says what Cascade did, each report with its lab and year, what ClinVar says today, then the counsellor sentence", () => {
      assert.deepEqual(
        entry.known.map(({ sentence }: Known) => sentence),
        [
          CASCADE_RECORDED_VARIANT,
          `Your 2022 report from ${HARBOURLINE} said uncertain significance.`,
          `Your 2024 report from ${COLUMBA} said likely pathogenic.`,
          "ClinVar today says pathogenic.",
          COUNSELLOR,
        ],
      );
    });

    it('tags the report that differs "Differs"', () => {
      assert.deepEqual(
        entry.known.flatMap(({ sentence, tag }: Known & { tag?: string }) =>
          tag === undefined ? [] : [[sentence, tag]],
        ),
        [
          [
            `Your 2022 report from ${HARBOURLINE} said uncertain significance.`,
            DIFFERS,
          ],
        ],
      );
      holds(words, `uncertain significance. ${DIFFERS}`);
    });

    it("says what ClinVar says today with its table and version", () => {
      assert.deepEqual(
        entry.known.find(
          ({ sentence }: Known) =>
            sentence === "ClinVar today says pathogenic.",
        )?.from,
        { series: CLINVAR, version: CLINVAR.versions[0] },
      );
      holds(
        words,
        "ClinVar today says pathogenic. From ClinVar variant classifications, version 1, Oct 1, 2026.",
      );
    });

    it("prints ClinVar's credit once", () => {
      assert.deepEqual(entry.credits, [CLINVAR.credit]);
      assert.equal(words.split(CLINVAR.credit).length, 2, "said once");
    });
  });

  describe("given the same variant before the tables can say", () => {
    const entry = said.entryOf(VARIANT_ANSWERS, "v1");
    const page = entryPage({ entry, panels: [] }, [], "martin-okafor");

    it("says each report's lab and classification, with no tag and no sentence of ClinVar today", () => {
      assert.deepEqual(entry.tags, []);
      assert.deepEqual(
        entry.known.map(({ sentence }: Known) => sentence),
        [
          CASCADE_RECORDED_VARIANT,
          `Your 2022 report from ${HARBOURLINE} said uncertain significance.`,
          `Your 2024 report from ${COLUMBA} said likely pathogenic.`,
          COUNSELLOR,
        ],
      );
    });

    it("gives its ClinVar ID with no link, and no credit", () => {
      assert.deepEqual(entry.codes, [{ notation: "90011" }]);
      assert.deepEqual(entry.credits, []);
      assert.ok(!page.includes('href="/tables/'));
    });
  });

  describe("given a variant only a report names", () => {
    const orphan = said.entryOf(VARIANT_ANSWERS, "orphan");

    it("names it from its `entryLabel`, with no gene, expression or ClinVar ID", () => {
      assert.equal(orphan.name, "NM_000500.1:c.1A>G");
      assert.equal(orphan.kind, "variant");
      assert.deepEqual(orphan.what, []);
      assert.deepEqual(orphan.codes, []);
    });

    it("takes the day of the document it shares", () => {
      assert.deepEqual(
        orphan.where.map(({ issued }: Record<string, string>) => issued),
        ["2023-01-01"],
      );
    });

    it("says its one report and the counsellor sentence", () => {
      assert.deepEqual(
        orphan.known.map(({ sentence }: Known) => sentence),
        ["Your 2023 report said benign.", COUNSELLOR],
      );
    });
  });
});
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
/** The demo people of two hospitals: Moss Avery Thorne is at both. */
const PEOPLE = said.demoPeople([
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

/**
 * The new-pod box makes a pod for a person: one of the demo people, by name, or a sample, loaded as it is. It offers
 * only what is not there yet.
 */
describe("Making a pod · NewPod", () => {
  describe("given demo people at two hospitals, and two samples", () => {
    const SAMPLES = ["alex-rivera", "priya-natarajan"];
    const box = (pods: string[], samples: string[] = []) =>
      drawn.newPod({ people: PEOPLE, pods, samples });
    const buttons = (markup: string) =>
      [...markup.matchAll(/<button[^>]*>([^<]*)<span/g)].map(
        ([, label]) => label,
      );

    it("offers to encrypt the pod with six words", () => {
      assert.match(box([]), /Encrypt this pod with six words/);
    });

    it("lists the demo people once each, family name first, sorted by family name and then given name", () => {
      assert.deepEqual(buttons(box([])), [
        "Abbot, Wren",
        "Thorne, Lark",
        "Thorne, Moss Avery",
      ]);
    });

    it("leaves out a demo person who has a pod", () => {
      assert.deepEqual(
        buttons(box([said.slug("Wren Abbot"), said.slug("Lark Thorne")])),
        ["Thorne, Moss Avery"],
      );
    });

    it('offers each sample not yet loaded, as "Load" and its person\'s name', () => {
      assert.deepEqual(
        buttons(box(["alex-rivera"], SAMPLES)).filter((label) =>
          label?.startsWith("Load "),
        ),
        ["Load Priya Natarajan"],
      );
    });

    it("posts a sample's pod name in the field `pod`", () => {
      assert.deepEqual(
        [...box([], SAMPLES).matchAll(/name="pod" value="([^"]*)"/g)].map(
          ([, sample]) => sample,
        ),
        SAMPLES,
      );
    });
  });
});
/**
 * An encrypted pod is sealed with six words, shown once when the pod is made, in fields a password manager can save.
 * The open screen asks for them again, and says why when the pod did not open.
 */
describe("Encrypting a pod with six words · SixWords, Unlock", () => {
  describe("given a new encrypted pod's six words", () => {
    const WORDS = "abacus abdomen abide abnormal abrasion abrupt";
    const shown = drawn.sixWords({
      pod: "grace-hopper",
      person: "Grace Hopper",
      words: WORDS,
    });

    it("shows the six words numbered, in order", () => {
      assert.equal(shown.match(/<li[ >]/g)?.length, 6);
      assert.deepEqual(
        [...shown.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map(([, word]) => word),
        WORDS.split(" "),
      );
    });

    it("holds the pod's name as `username` and the words as a `new-password`, for a password manager", () => {
      assert.match(shown, /name="username"[^>]*value="grace-hopper"/);
      assert.match(shown, /autocomplete="new-password"/i);
      assert.match(shown, /name="password"[^>]*value="abacus abdomen/);
    });

    it("offers a button that copies the words", () => {
      assert.match(shown, /type="button"[^>]*data-copy-words/);
    });

    it("asks for words 2 and 5", () => {
      assert.match(textOf(shown), /Word 2/);
      assert.match(textOf(shown), /Word 5/);
    });

    it("says whose pod it is", () => {
      assert.match(textOf(shown), /Grace Hopper's pod/);
    });

    it("warns that the words do not hide that the pod exists", () => {
      assert.match(shown, /does not hide that this pod exists/);
    });
  });

  describe("given an encrypted pod that did not open", () => {
    const OUTCOMES: [string, RegExp, boolean][] = [
      ["secret needed", /six words to open it/, true],
      ["incorrect secret", /don't open this pod/, true],
      ["malformed", /header is damaged or was changed/, false],
      ["unsupported version", /newer version of Cascade/, false],
      ["cannot open", /another way, not with six words/, false],
    ];
    const open = (outcome: string) =>
      drawn.unlock({ pod: "grace-hopper", titles: new Map(), outcome });

    it("says why, for each outcome", () => {
      for (const [outcome, sentence] of OUTCOMES)
        assert.match(textOf(open(outcome)), sentence, outcome);
    });

    it("draws a field for the words only where words could open the pod", () => {
      for (const [outcome, , field] of OUTCOMES)
        assert.equal(
          open(outcome).includes("current-password"),
          field,
          outcome,
        );
    });
  });
});
/**
 * A person signs in at a hospital, sees what it has, and brings it into the pod. The connection's box says where that
 * has got to, whose record came back, and, when it failed, what the person can do about it.
 */
describe("Connecting to a demo hospital · ConnectionBox, HospitalsPage", () => {
  describe("given a pod whose demo person is at two hospitals", () => {
    const words = textOf(
      podPage(
        { pod: "rowan-ellery-marsh" },
        { name: "Rowan Ellery Marsh", at: [NORTH, SOUTH] },
      ),
    );

    it("says to sign in at a hospital, see what it has, and bring it into the pod", () => {
      assert.ok(
        words.includes(
          "Sign in at a hospital, see what it has, and bring it into this pod.",
        ),
      );
    });

    it("offers a sign-in at each of the person's hospitals", () => {
      for (const name of ["Cascade North", "Cascade South"])
        assert.ok(words.includes(`Sign in at ${name}`), name);
    });

    it("offers Find a hospital", () => {
      assert.ok(words.includes("Find a hospital"));
    });
  });

  describe("given Find a hospital, with three hospitals", () => {
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
      people: PEOPLE,
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

    it("draws a card for each hospital, with a sign-in", () => {
      assert.deepEqual(
        cards.map(({ heading }) => heading),
        ["Cascade North", "Cascade South", "SMART Health IT"],
      );
      for (const { heading, text } of cards)
        assert.ok(text.includes("Sign in"), heading);
    });

    it("names the town a hospital is in on its card", () => {
      assert.ok(cards[0]?.text.includes("North Town"));
    });

    it("lists the demo people a hospital holds, family name first, sorted", () => {
      assert.deepEqual(
        cards[0]?.people.map((person) => person.replace(/ also at .*/, "")),
        ["Abbot, Wren", "Thorne, Lark", "Thorne, Moss Avery"],
      );
    });

    it("says where else a demo person is", () => {
      assert.deepEqual(cards[0]?.people.slice(2), [
        "Thorne, Moss Avery also at Cascade South",
      ]);
      assert.deepEqual(cards[1]?.people, [
        "Thorne, Moss Avery also at Cascade North",
      ]);
    });

    it("says whose pod a hospital's records are brought into, with a link back to the pod", () => {
      const words = textOf(page);
      assert.ok(words.includes("and bring it into Alex Rivera's pod."));
      assert.ok(links(page, "/pods/alex-rivera/", "Back to Alex Rivera"));
    });

    it("tells a person to choose the patient on the hospital's own sign-in page, for a hospital with no demo person", () => {
      assert.deepEqual(cards[2]?.people, []);
      assert.ok(
        cards[2]?.text.includes(
          "A test server: you choose a patient on its own sign-in page.",
        ),
      );
    });
  });

  describe("when a hospital is being pulled", () => {
    it("counts the requests so far, as `3 requests answered so far`", () => {
      const page = podPage({ connection: at("pulling") });
      const box = page
        .split(/<div class="dialog[^"]*"/)
        .find((each) => each.startsWith(' id="connection"'));
      assert.ok(box?.includes("3 requests answered so far"));
    });
  });

  describe("when a pull has ended", () => {
    const box = drawn.connectionBox({
      pod: "alex-rivera",
      back: "#",
      connection: at("pulled", {
        sources: [{ records: { Condition: 2 }, holdsSubjectsRecords: false }],
        pulled: { missing: [], denied: [] },
      }),
    });
    const words = textOf(box);

    it("says what the hospital has, counted by kind of record", () => {
      assert.ok(words.includes("What Cascade North has: 2 conditions."));
    });

    it("offers to bring it into the pod, named by its person on the button only", () => {
      assert.ok(words.includes("This pod has nothing from here yet."));
      assert.ok(!words.includes("Alex Rivera's pod has"));
      assert.equal(
        textOf(/<button[^>]*>([^<]*)<\/button>/.exec(box)?.[1] ?? ""),
        "Bring it into Alex Rivera's pod",
      );
    });

    it("says `This pod already has records from here` when the pod holds the subject's records", () => {
      const held = textOf(
        drawn.connectionBox({
          pod: "alex-rivera",
          back: "#",
          connection: at("pulled", {
            sources: [
              { records: { Condition: 2 }, holdsSubjectsRecords: true },
            ],
            pulled: { missing: [], denied: [] },
          }),
        }),
      );
      assert.ok(held.includes("This pod already has records from here."));
      assert.ok(!held.includes("Alex Rivera's pod already"));
    });
  });

  describe("given a pulled record and the pod's person", () => {
    const ROWAN = "Rowan Ellery Marsh";
    const box = (
      given: string,
      family: string,
      titled = true,
      pod = "rowan-ellery-marsh",
      more: object = {},
    ) => {
      const markup = drawn.connectionBox({
        pod,
        titles: titled ? new Map([[pod, ROWAN]]) : undefined,
        back: "#",
        connection: at("pulled", {
          ...PULLED,
          sources: [{ records: {}, holdsSubjectsRecords: false }],
          patient: `${given} ${family}`,
          patientNames: [{ name: `${given} ${family}`, family }],
          ...more,
        }),
      });
      return {
        said: textOf(markup),
        button: textOf(
          /<button[^>]*>([^<]*)<\/button>/.exec(markup)?.[1] ?? "",
        ),
        buttonClass: /<button class="([^"]*)"/.exec(markup)?.[1]?.split(" ")[0],
        note: /<p class="(note[^"]*)"/
          .exec(markup)?.[1]
          ?.split(" ")
          .filter((each) => each === "note" || each === "warm")
          .join(" "),
      };
    };
    const same = box("Rowan Ellery", "Marsh");
    const maybe = box("Moss Avery", "Marsh");
    const other = box("Odalys", "Brandt");
    const untitled = box("Odalys", "Brandt", false);
    const KEEPS = "Bringing it in leaves this pod named";
    /** A pod that keeps a name the page cannot read, as an encrypted pod's is sealed: the record says it is titled. */
    const sealed = box("Ines", "Calloway", false, "cy-sealed", {
      titled: true,
    });
    const sealedNoNames = box("Ines", "Calloway", false, "cy-sealed", {
      titled: true,
      patientNames: [],
    });

    it("names the pod's slug name on the button when no patient and no title are on file", () => {
      const bare = textOf(
        drawn.connectionBox({
          pod: "alex-rivera",
          back: "#",
          connection: at("pulled", {
            sources: [{ records: {}, holdsSubjectsRecords: false }],
            pulled: { missing: [], denied: [] },
          }),
        }),
      );
      assert.ok(bare.includes("Bring it into Alex Rivera's pod"));
      assert.ok(bare.includes("This pod has nothing from here yet."));
    });

    it("offers \"Bring it into\" and the pod's person, with no word on whose record it is, when the record has the person's name", () => {
      assert.ok(!same.said.includes("This record is"));
      assert.equal(same.button, "Bring it into Rowan Ellery Marsh's pod");
    });

    it("says whose record it is, and names both people on the button, when only the family name is shared", () => {
      assert.ok(maybe.said.includes("This record is Moss Avery Marsh's."));
      assert.ok(maybe.said.includes(`${KEEPS} ${ROWAN}.`));
      assert.ok(maybe.note === undefined && !maybe.said.includes("not Rowan"));
      assert.equal(maybe.buttonClass, undefined);
      assert.equal(
        maybe.button,
        "Bring Moss Avery Marsh's records into Rowan Ellery Marsh's pod",
      );
    });

    it("warns that the record is another person's, not the pod's, with only a `quiet` button that ends \"anyway\", when no name is shared", () => {
      assert.ok(
        other.said.includes(
          "This record is Odalys Brandt's, not Rowan Ellery Marsh's.",
        ),
      );
      assert.ok(other.said.includes(`${KEEPS} ${ROWAN}.`));
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
    });

    it("says that bringing it in makes the pod that person's, when the app has no name for the pod's person", () => {
      assert.ok(
        untitled.said.includes(
          "This record is Odalys Brandt's. Bringing it in makes this Odalys Brandt's pod.",
        ),
      );
      assert.ok(untitled.said.includes("This pod has nothing from here yet."));
      assert.ok(!untitled.said.includes("Odalys Brandt's pod has"));
      assert.ok(!untitled.said.includes("Rowan"));
      assert.ok(!untitled.said.includes(KEEPS));
      assert.equal(untitled.button, "Bring it into Odalys Brandt's pod");
      assert.equal(untitled.note, "note", "an unknown pod's note stays plain");
    });

    it("says whose record it is and that the pod keeps its name, naming the pod's person on the button, when the pod is titled but its title cannot be read", () => {
      assert.ok(
        sealed.said.includes(
          "This record is Ines Calloway's, not Cy Sealed's. Bringing it in leaves this pod named Cy Sealed.",
        ),
      );
      assert.ok(!sealed.said.includes("makes this"));
      assert.equal(
        sealed.button,
        "Bring Ines Calloway's records into Cy Sealed's pod anyway",
      );
    });

    it("says whose record it is and that the pod keeps its name when the record names no one to grade, and never makes the pod the record's person's", () => {
      assert.ok(
        sealedNoNames.said.includes(
          "This record is Ines Calloway's. Bringing it in leaves this pod named Cy Sealed.",
        ),
      );
      assert.ok(!sealedNoNames.said.includes("makes this"));
      assert.equal(sealedNoNames.button, "Bring it into Cy Sealed's pod");
    });
  });

  describe("when a connection has failed", () => {
    const DETAIL =
      "https://cascade-north.demo.invalid refused Patient with 401: invalid_client.";
    /** What each kind of failure says, and whether signing in again can help. */
    const KINDS: Record<FailureKind, [said: RegExp, again: boolean]> = {
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
        connection: at("failed", { failed: DETAIL, failure }),
        ...more,
      });
    const kinds = Object.entries(KINDS) as [FailureKind, [RegExp, boolean]][];
    const sentenceOf = (markup: string) =>
      textOf(/<p role="alert">(.*?)<\/p>/.exec(markup)?.[1] ?? "");

    it("says what went wrong for each kind of failure, naming the hospital", () => {
      for (const [kind, [action]] of kinds) {
        const first = sentenceOf(box(kind));
        assert.match(first, /Cascade North/, kind);
        assert.match(first, action, kind);
      }
    });

    it("keeps the status code, the error's name and every address out of that sentence", () => {
      for (const [kind] of kinds)
        assert.doesNotMatch(
          sentenceOf(box(kind)),
          /401|invalid_client|https?:|\.invalid/,
          kind,
        );
    });

    it('offers "Sign in again at Cascade North" for the kinds signing in again can help, and for no other', () => {
      for (const [kind, [, again]] of kinds)
        assert.equal(
          /<button[^>]*>([^<]*)<\/button>/.exec(box(kind))?.[1],
          again ? "Sign in again at Cascade North" : undefined,
          kind,
        );
    });

    it("prints the developer's detail in a smaller line", () => {
      for (const [kind] of kinds)
        assert.match(
          box(kind),
          /<p class="muted detail[^"]*">https:\/\/cascade-north\.demo\.invalid refused Patient with 401/,
          kind,
        );
    });

    it("says the app's own sentence for a kind, with its own choice of the button, when `failures` gives one", () => {
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
    });

    it("prints the reason alone, with no sign-in, for a failure of no kind", () => {
      const plain = drawn.connectionBox({
        pod: "rowan-ellery-marsh",
        back: "#",
        connection: at("failed", { failed: "Refused: nothing to bring in" }),
      });
      assert.ok(plain.includes("Refused: nothing to bring in"));
      assert.ok(!plain.includes("Sign in again"));
    });
  });
});
/**
 * The form sets the day the demo hospitals answer as of, and Today clears it. Every screen that offers a sign-in says
 * which day is set, and a pull made under one says so.
 */
describe("Setting the world's date · WorldDate", () => {
  const AS_OF = "2024-02-01T23:59:59Z";

  describe("given the world's date set", () => {
    const form = drawn.worldDate({ asOf: AS_OF });

    it("shows the day it is set to, as a day in UTC, in the form's date field", () => {
      assert.match(
        form,
        /<input type="date"[^>]* name="date" value="2024-02-01"/,
      );
      assert.match(
        drawn.worldDate({ asOf: "2024-02-01T00:30:00+01:00" }),
        /<input type="date"[^>]* name="date" value="2024-01-31"/,
      );
    });

    it("offers Set, and Today, which posts an empty date", () => {
      assert.match(form, /<button>Set<\/button>/);
      assert.match(
        form,
        /<input type="hidden" name="date" value=""\/><button class="quiet[^"]*">Today<\/button>/,
      );
    });

    it("says `Hospitals answer as of 1 February 2024.`", () => {
      assert.ok(
        textOf(form).includes("Hospitals answer as of 1 February 2024."),
      );
    });
  });

  describe("given no world's date", () => {
    it("says `Hospitals answer with everything they hold.`", () => {
      assert.ok(
        textOf(drawn.worldDate({})).includes(
          "Hospitals answer with everything they hold.",
        ),
      );
    });
  });

  describe("given a pulled connection", () => {
    const box = (more: object) =>
      textOf(
        drawn.connectionBox({
          pod: "alex-rivera",
          back: "#",
          connection: at("pulled", { ...PULLED, ...more }),
        }),
      );

    it("says `Pulled as of 1 February 2024.` for a pull made under that date", () => {
      assert.ok(box({ asOf: AS_OF }).includes("Pulled as of 1 February 2024."));
    });

    it("says nothing of a date for a pull made under none", () => {
      assert.doesNotMatch(
        box({}),
        /Pulled as of|Hospitals answer|Change the world/,
      );
    });
  });

  describe("given a screen that offers a sign-in", () => {
    it("says on a pod's screen which day is set, with the form to change it", () => {
      const pod = podPage(
        { pod: "x", asOf: AS_OF },
        { name: "Rowan Marsh", at: [NORTH] },
      );
      assert.match(
        textOf(pod),
        /Hospitals answer as of 1 February 2024\.\s*Change the world's date/,
      );
      assert.match(pod, /<details[^>]* id="world-date">[\s\S]*name="date"/);
    });

    it("says on Find a hospital which day is set", () => {
      assert.ok(
        textOf(
          drawn.hospitalsPage({
            pod: "x",
            titles: new Map(),
            q: "",
            read: { rows: [], asOf: AS_OF },
            people: [],
          }),
        ).includes("Hospitals answer as of 1 February 2024."),
      );
    });
  });
});
const NOW = Date.parse("2026-10-08T22:00:00Z");

const coded = (notation: string, label: string) => ({
  code: `http://hl7.org/fhir/sid/cvx/${notation}`,
  notation,
  about: { name: { label, altLabels: [], origin: "n" } },
});

const PUBLISHER = "urn:uuid:17cec5a9-071a-4179-9403-5c1e3886fb7d";
const NAMES_TABLE = {
  ...GROUPS,
  iri: "urn:uuid:f71f6797-48ec-4875-9b87-4cb1be1d9be0",
  label: "Example CVX names",
  licence: "http://creativecommons.org/publicdomain/mark/1.0/",
  source: PUBLISHER,
};
const GROUPS_TABLE = {
  ...GROUPS,
  label: "Example CVX vaccine groups",
  source: PUBLISHER,
};
const ALONE_TABLE = { ...GROUPS, iri: "urn:uuid:0e2b", label: "Lone table" };
const PANEL_TABLE = {
  ...GROUPS,
  iri: "urn:uuid:7a1b",
  label: "Example panel members",
  credit: "Panels are LOINC's.",
};
const CLASS_TABLE = {
  ...GROUPS,
  iri: "urn:uuid:8c2d",
  label: "Example drug classes",
};
const [PUBLISHED] = said.sourcesOf([NAMES_TABLE, GROUPS_TABLE, ALONE_TABLE]);
const VERSION_FACT = { series: GROUPS_TABLE.iri, version: "ni:///v2" };
const placed = (notation: string, label: string, place: object) => ({
  ...coded(notation, label),
  ...place,
});

/**
 * The app lists the reference tables it holds, each with its publisher, licence and versions, and searches their
 * codes. A code's screen says what every table says of that code, each with the table and version it is from.
 */
describe("Browsing the reference tables · TablesNav, TablePage, SourcePage, CodePage", () => {
  describe("given the sidebar's list of tables", () => {
    const nav = (held: object[], read?: string, current?: string) =>
      drawn.tablesNav({ tables: { held, read }, current });
    const busy = (markup: string) =>
      markup.split('aria-busy="true"').length - 1;
    const loading = nav([]);
    const none = nav([], "read");
    const failed = nav([], "failed");
    const lists = nav([GROUPS], undefined, GROUPS.iri);

    it("says that the tables are loading, marked busy, until the app has read what it holds", () => {
      assert.match(textOf(loading), /Loading the reference tables/);
      assert.equal(busy(loading), 1);
      assert.doesNotMatch(textOf(loading), /None yet/);
    });

    it('says "None yet" only after a read that found none', () => {
      assert.match(textOf(none), /None yet/);
      assert.doesNotMatch(textOf(none), /Loading/);
      assert.equal(busy(none), 0);
    });

    it("says that the tables could not be read after a read that failed", () => {
      const text = textOf(failed);
      assert.match(text, /The reference tables could not be read\./);
      assert.doesNotMatch(text, /None yet|Loading/);
    });

    it("lists each table it holds as a link, the one shown marked as the current page", () => {
      assert.doesNotMatch(textOf(lists), /Loading/);
      assert.deepEqual(
        linksOf(lists).map(({ href, current, text }) => [href, current, text]),
        [
          [
            `/tables/${said.tableId(GROUPS.iri)}/`,
            true,
            "Example vaccine groups",
          ],
        ],
      );
    });

    it('ends with "Check now" in every state', () => {
      for (const [state, markup] of [
        ["loading", loading],
        ["none", none],
        ["lists", lists],
        ["failed", failed],
      ] as const)
        assert.match(textOf(markup), /Check now$/, state);
    });
  });

  describe("given a table's screen", () => {
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
    const past = table({
      searched: { total: 103, offset: 450, size: 50, found: [] },
      text: "",
      page: 10,
      uses: {},
      pods: [],
    });
    const text = textOf(shown);
    const links = linksOf(shown);
    const asks = (all: typeof links, rel: string) =>
      new URL(all.find((each) => each.rel === rel)?.href ?? "", "http://x")
        .searchParams;

    it("says the version in use, its publisher and its licence", () => {
      for (const sentence of [
        "Using version 2, Oct 8, 2026",
        "publisher.example Source: an example publisher",
        "CC0 1.0",
      ])
        assert.ok(text.includes(sentence), sentence);
    });

    it("says when the publisher was last checked for a new version, and when the app last read the feed", () => {
      assert.ok(
        text.includes(
          "The watcher checked the publisher 2 hours ago: nothing new. This app last read the feed 5 minutes ago.",
        ),
      );
    });

    it('lists a code a search found, tagged "Retired", with what it maps to', () => {
      assert.ok(text.includes("141 flu, split Retired 88 flu, NOS"));
    });

    it("links a found code to that code's screen", () => {
      assert.ok(
        links.some(
          ({ href, text }) =>
            href === `/tables/${said.tableId(source!.iri)}/?code=141` &&
            text === "141",
        ),
        "a code links to its page",
      );
    });

    it("says which of how many codes are shown, with links to the pages before and after that keep the search text", () => {
      assert.ok(text.includes("51–51 of 1,201 codes."));
      assert.deepEqual(
        [asks(links, "prev").get("q"), asks(links, "prev").get("page")],
        ["141", "1"],
      );
      assert.deepEqual(
        [asks(links, "next").get("q"), asks(links, "next").get("page")],
        ["141", "3"],
      );
    });

    it('lists each version with the pods using it, each a link, the version in use marked "current"', () => {
      assert.ok(text.includes("version 2, Oct 8, 2026 current : no pod"));
      assert.ok(text.includes("version 1, Oct 1, 2026 : Alex Rivera"));
      assert.ok(
        links.some(
          ({ href, text }) =>
            href === "/pods/alex-rivera/" && text === "Alex Rivera",
        ),
      );
    });

    it("leaves out a pod that is no longer there", () => {
      assert.ok(!text.includes("Gone"));
    });

    it("posts a search to the table's own address", () => {
      assert.match(
        shown,
        new RegExp(`<form[^>]* action="/tables/${said.tableId(GROUPS.iri)}/"`),
      );
    });

    it('says "None on page 10 of 103 codes." past the last page, with a link back to the last page and none forward', () => {
      assert.ok(textOf(past).includes("None on page 10 of 103 codes."));
      assert.equal(
        asks(linksOf(past), "prev").get("page"),
        "3",
        "a page past the last steps back to the last",
      );
      assert.ok(!linksOf(past).some((each) => each.rel === "next"));
    });
  });

  describe("given a publisher's screen", () => {
    const page = drawn.sourcePage({
      source: PUBLISHED,
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
    const links = linksOf(page);

    it("links a found code to its screen under the publisher, whichever of its tables holds it", () => {
      assert.ok(
        links.some(
          ({ href, text }) =>
            href === `/tables/${said.tableId(PUBLISHER)}/?code=141` &&
            text === "141",
        ),
      );
    });

    it("lists the publisher's tables, each a link, with each licence", () => {
      for (const sentence of [
        "What this source publishes",
        "Public domain",
        "CC0 1.0",
      ])
        assert.ok(textOf(page).includes(sentence), sentence);
      for (const series of PUBLISHED!.series)
        assert.ok(
          links.some(
            ({ href }) => href === `/tables/${said.tableId(series.iri)}/`,
          ),
          series.label,
        );
    });
  });

  describe("given a code's screen", () => {
    const code = textOf(
      drawn.codePage({
        source: PUBLISHED,
        held: [NAMES_TABLE, GROUPS_TABLE, ALONE_TABLE],
        facts: {
          ...coded("141", "flu, split"),
          names: [
            {
              ...VERSION_FACT,
              series: NAMES_TABLE.iri,
              label: "flu, split",
              altLabels: ["influenza, split"],
            },
          ],
          status: [],
          mappings: [
            {
              ...VERSION_FACT,
              series: ALONE_TABLE.iri,
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
    const panelsAndClasses = textOf(
      drawn.codePage({
        source: PUBLISHED,
        held: [
          NAMES_TABLE,
          GROUPS_TABLE,
          ALONE_TABLE,
          PANEL_TABLE,
          CLASS_TABLE,
        ],
        facts: {
          ...coded("24323-8", "Comprehensive metabolic panel"),
          names: [],
          status: [],
          mappings: [],
          panels: [
            {
              series: PANEL_TABLE.iri,
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
              series: CLASS_TABLE.iri,
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
    const clinvar = {
      ...GROUPS,
      iri: "urn:test:clinvar",
      label: "ClinVar variant classifications",
      credit: "ClinVar, NCBI.",
      source: "urn:test:ncbi",
      versions: [
        { iri: "ni:///clinvar-1", label: "1", issued: "2026-10-01T00:00:00Z" },
      ],
    };
    const [clinvarSource] = said.sourcesOf([clinvar]);
    const VARIATION = `${codeStems.ClinVar}90011`;
    const variantPage = (extra: object) =>
      drawn.codePage({
        source: clinvarSource,
        held: [clinvar],
        facts: {
          code: VARIATION,
          notation: "90011",
          names: [],
          status: [],
          mappings: [],
          classifications: [
            {
              series: clinvar.iri,
              version: "ni:///clinvar-1",
              variation: VARIATION,
              classification: [
                {
                  iri: terms.UncertainSignificance,
                  label: "Uncertain significance",
                },
              ],
            },
          ],
          ...extra,
        },
      });

    it("says the code's name and its other names, with the table and version they are from", () => {
      for (const sentence of [
        "141 flu, split",
        "influenza, split",
        "From Example CVX names, version 2, Oct 8, 2026.",
      ])
        assert.ok(code.includes(sentence), `${sentence} in ${code}`);
    });

    it("says what the code maps to, and which other codes map to the same", () => {
      for (const sentence of [
        "Maps to 88 flu, NOS, as do 15 flu, whole and 1 more.",
        "From Lone table, version 2, Oct 8, 2026.",
      ])
        assert.ok(code.includes(sentence), `${sentence} in ${code}`);
    });

    it("lists a panel's tests in the order given, each with its requirement", () => {
      for (const sentence of [
        "A panel of 3 members, in order:",
        "2823-3 Potassium R-a",
        "2951-2 Sodium required",
        "17861-6 Calcium Rflx",
      ])
        assert.ok(
          panelsAndClasses.includes(sentence),
          `${sentence} in ${panelsAndClasses}`,
        );
      const at = (notation: string) => panelsAndClasses.indexOf(notation);
      assert.ok(
        at("2823-3") < at("2951-2") && at("2951-2") < at("17861-6"),
        "members come in the order they were given",
      );
    });

    it("says how many panels the code is itself in, naming those given and counting the rest", () => {
      for (const sentence of [
        "Itself a member of 3 panels:",
        "34567-8 A larger panel",
        "and 2 more.",
      ])
        assert.ok(
          panelsAndClasses.includes(sentence),
          `${sentence} in ${panelsAndClasses}`,
        );
    });

    it("says each drug class of a medicine by its relation, and the ingredient it is classed through", () => {
      for (const sentence of [
        "Established pharmacologic class: N0000175562 ACE inhibitor [EPC] through 1546022 lisinopril anhydrous",
        "Chemical structure: M0014310 Lisinopril",
        "From Example drug classes, version 2, Oct 8, 2026.",
      ])
        assert.ok(
          panelsAndClasses.includes(sentence),
          `${sentence} in ${panelsAndClasses}`,
        );
    });

    it("says why no class is given for a relation", () => {
      assert.ok(
        panelsAndClasses.includes(
          "No mechanism of action is given: FDA classes a different form of 29046 lisinopril; RxNorm does not tie this drug to it.",
        ),
      );
    });

    it("prints a table's credit beside what that table says", () => {
      for (const sentence of [
        "Panels are LOINC's.",
        "From Example panel members, version 2, Oct 8, 2026.",
      ])
        assert.ok(
          panelsAndClasses.includes(sentence),
          `${sentence} in ${panelsAndClasses}`,
        );
    });

    it("says a variant's classification as ClinVar's sentence, with the ClinVar table's credit", () => {
      const text = textOf(variantPage({}));
      assert.ok(text.includes("ClinVar today says uncertain significance."));
      assert.ok(text.includes("ClinVar, NCBI."), "the table's credit");
    });

    it("links ClinVar's own page for the variant when the table gives one, and no outside page when it gives none", () => {
      const outside = "https://example.org/variation/90011/";
      const external = (markup: string) =>
        linksOf(markup).filter(({ rel }) => rel === "external");
      assert.deepEqual(
        external(variantPage({})),
        [],
        "no page, no outside link",
      );
      assert.deepEqual(
        external(
          variantPage({ page: { href: outside, system: "ClinVar" } }),
        ).map(({ href, text }) => [href, textOf(text)]),
        [[outside, "ClinVar's page for 90011"]],
      );
    });
  });
});
/**
 * The screen groups a pod's active medicines under the drug classes the reference tables put them in, and says of each
 * medicine in none why that is, so an absent medicine is not read as "in no class".
 */
describe("Seeing a pod's medicines by drug class · ClassesPage", () => {
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
  const named = (code: string, label: string): [string, object] => [
    code,
    {
      notation: code.split("/").pop(),
      name: { label, altLabels: [], origin: ORIGIN },
    },
  ];
  const about = new Map<string, object>([
    named(
      `${MEDRT}N0000175562`,
      "Angiotensin Converting Enzyme Inhibitor [EPC]",
    ),
    named(`${MEDRT}N0000000174`, "Angiotensin-converting Enzyme Inhibitors"),
    named(`${MEDRT}N0000175825`, "Estrogen [EPC]"),
    named("http://www.nlm.nih.gov/research/umls/rxnorm/3827", "enalapril"),
    named("http://www.nlm.nih.gov/research/umls/rxnorm/4083", "estradiol"),
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

  describe("given a pod's active medicines, classed by the tables", () => {
    it("groups the medicines under each class, with the relation that puts them there", () => {
      for (const sentence of [
        "Angiotensin Converting Enzyme Inhibitor [EPC] Established pharmacologic class",
        "Estrogen [EPC]",
        "Mechanism of action",
      ])
        assert.ok(all.includes(sentence), `${sentence} in ${all}`);
    });

    it("orders the relations as MED-RT does, `Established pharmacologic class` before `Mechanism of action`", () => {
      assert.ok(
        all.indexOf("Established pharmacologic class") <
          all.indexOf("Mechanism of action"),
      );
    });

    it("says the ingredient a medicine is classed through, and none where the entry states the classed code itself", () => {
      for (const sentence of [
        "Enalapril through enalapril",
        "Estradiol 1 MG Oral Tablet through estradiol",
      ])
        assert.ok(all.includes(sentence), `${sentence} in ${all}`);
      assert.ok(
        all.includes("Fluoroestradiol F-18") &&
          !all.includes("Fluoroestradiol F-18 through"),
        "a class on a code the entry states is not through anything",
      );
    });

    it("says the table and version the classes are from, with its credit", () => {
      for (const sentence of [
        "From Example drug classes, version 1, Oct 8, 2026.",
        "Classes are FDA's.",
      ])
        assert.ok(all.includes(sentence), `${sentence} in ${all}`);
    });

    it("draws one class alone when the address picks one", () => {
      const picked = page(`${MEDRT}N0000000174`);
      assert.ok(picked.includes("Enalapril through"));
      assert.ok(
        !picked.includes("Estradiol 1 MG Oral Tablet through"),
        "only the class picked",
      );
    });
  });

  describe("given a medicine in no class", () => {
    it("says that FDA classes a different form of a product's ingredient, which RxNorm does not tie the product to", () => {
      for (const sentence of [
        "Not in a class here",
        "Lisinopril 10 MG Oral Tablet: FDA classes a different form of lisinopril; RxNorm does not tie this product to it.",
      ])
        assert.ok(all.includes(sentence), `${sentence} in ${all}`);
    });

    it("says that MED-RT classes single ingredients, for a medicine with no reason of its own", () => {
      assert.ok(
        all.includes(
          "Lisinopril with hydrochlorothiazide. MED-RT classes single ingredients",
        ),
      );
      assert.ok(
        !all.includes("Lisinopril 10 MG Oral Tablet, ") &&
          !all.includes("Lisinopril 10 MG Oral Tablet and"),
        "a medicine with its own reason is not in the general one",
      );
    });

    it("says that none of the pod's active medicines is in a class, when the tables class none", () => {
      assert.ok(
        page(undefined, { ...read, rows: [] }).includes(
          "None of this pod's active medicines is in a class",
        ),
      );
    });
  });
});
/**
 * The screen sets a pod's lab results beside the tests of one LOINC panel: which the person has, which required ones
 * they lack. It says what LOINC lists, never that the results were drawn as that panel.
 */
describe("Seeing a pod's lab results by panel · PanelPage", () => {
  const LOINC = codeStems.LOINC;
  const ORIGIN = "urn:x:panels-1";
  const NAMES_VERSION = "urn:x:names-1";
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
    versions: [{ iri: NAMES_VERSION, label: "2.84", issued: "2026-10-06" }],
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
    { notation: code, name: { label, altLabels: [], origin: NAMES_VERSION } },
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

  describe("given a panel, and the pod's results for some of its tests", () => {
    const words = page();
    const has = (sentence: string) =>
      assert.ok(words.includes(sentence), `${sentence} in ${words}`);

    it("says how many of the required tests the pod has, and names those it lacks", () => {
      has(
        "Your results in Electrolytes panel You have 1 of 3 required tests; missing: Sodium and Chloride.",
      );
    });

    it('lists the tests in LOINC\'s order, each "required" or "optional"', () => {
      const order = ["Sodium", "Potassium", "Chloride", "Carbon dioxide"].map(
        (each) => words.indexOf(each, words.indexOf("Tests in the panel")),
      );
      assert.deepEqual(
        order,
        [...order].sort((a, b) => a - b),
        "LOINC's order",
      );
      has("Carbon dioxide optional 24 mmol/L");
    });

    it("lists a test's results newest first", () => {
      has("Potassium required 4.6 mmol/L Jun 1, 2025 4.1 mmol/L Mar 1, 2025");
    });

    it('says "No result" for a required test the pod lacks', () => {
      has("Sodium required No result");
    });

    it('lists a nested panel\'s tests under "Within" and its name, without a test the panel lists itself', () => {
      has("Within Nested panel Potassium in blood required 3.9 mmol/L");
      assert.equal(
        words.split("Potassium required").length,
        2,
        "a test the panel lists itself is not repeated under a nested panel",
      );
    });

    it("counts a nested panel's required tests among those the pod has and lacks", () => {
      const withMissingNested = page({
        ...read,
        rows: [...rows, row("6299-2", 2, "R", undefined, nested)],
        panelAbout: new Map([
          ...read.panelAbout,
          name("6299-2", "Another test"),
        ]),
      });
      assert.ok(
        withMissingNested.includes(
          "You have 2 of 5 required tests; missing: Sodium, Chloride and Another test.",
        ),
        "a nested panel the query requires counts its held tests too",
      );
    });

    it("says the tables and versions it read, with each one's credit", () => {
      has(
        "From Example panel members, version 2.83, Oct 5, 2026 and Example LOINC names, version 2.84, Oct 6, 2026.",
      );
      has("Panels: LOINC's credit.");
      has("Names: LOINC's credit.");
    });

    it("says that this does not say the results were drawn as part of the panel", () => {
      has("that does not say your results were drawn as part of it");
    });
  });

  describe("given a panel, and no results for any of its tests", () => {
    it('says "You have no results in this panel." when the pod has none', () => {
      assert.ok(
        page({ ...read, rows: [] }).includes(
          "You have no results in this panel.",
        ),
      );
    });
  });
});
const IMPORTS = "pod/What each import brought in";
const REVISIONS = "record/Its revisions, in the order they arrived";
const VERSIONS = "record/What each version says";
const CAUSES =
  /because|caus|due to|effect|led to|improv|worsen|thanks to|\bworks?\b/i;

/** The statin story's answers with a second import of the prescription, which ended it. */
function importedTwice(story: Story) {
  const [finding] = story.changes;
  const entry = finding!.medication.entry;
  const record = String(
    story.answers[said.SOURCES]!.find((row: Row) => row.entry === entry)!
      .record,
  );
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
  return {
    arrival,
    twice: {
      ...story.answers,
      [IMPORTS]: [
        ...imported(1, ["r-other", record]),
        ...imported(2, [record]),
      ],
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
    },
  };
}

/**
 * What changed, on a pod's screen, draws a card for each lab change: a test's results before and after the day a
 * medication was prescribed, started or stopped. The trend charts that test with the medication's days marked. Both
 * say what moved and never why.
 */
describe("Seeing what changed after a medication · PodPage, TrendPage, withImportHistory(), trendInput()", () => {
  describe("given a story pod whose cholesterol fell after a statin was prescribed", () => {
    let finding: LabChange;
    let page: string;
    before(async () => {
      const story = (await storyPods()).get("story-statin")!;
      finding = story.changes[0]!;
      assert.equal(finding.medication.dateIs, "prescription written");
      page = podOf("ines-calloway", story);
    });

    it("draws one card, saying that the test was lower after the medication was prescribed", () => {
      assert.equal(count(page, /class="change[ "]/g), 1);
      const sentence = `${capitalised(finding.test.name!)} was lower after ${finding.medication.name} was prescribed.`;
      assert.ok(textOf(page).includes(sentence), sentence);
    });

    it("marks the day the prescription was written on the card's chart", () => {
      assert.equal(count(page, /class="mark written[ "]/g), 1);
    });

    it("says both means, and how many results each is the mean of", () => {
      assert.match(
        textOf(page),
        /162 → 98\.3 mg\/dL, the mean of 3 results before and 3 after/,
      );
    });

    it('links each of the six results behind the change to its entry, in a box "Show the 6 results" opens', () => {
      const behind = page.slice(
        page.indexOf('id="change-start-617310-18262-6"'),
      );
      const [box = ""] = behind.split(/class="dialog[^"]*"/);
      assert.deepEqual(
        linksOf(box)
          .map(({ href }) => href)
          .filter((href) => href?.includes("/entries/"))
          .sort(),
        [...finding.rows.before, ...finding.rows.after]
          .map(({ entry }) => paths.entry("ines-calloway", entry!))
          .sort(),
      );
      assert.deepEqual(hrefsOf(page, "Show the 6 results"), [
        "#change-start-617310-18262-6",
      ]);
    });

    it('links "Open the trend" to the trend\'s address for the test and the medication', () => {
      assert.deepEqual(hrefsOf(page, "Open the trend"), [
        paths.trend("ines-calloway", { test: "18262-6", medication: "617310" }),
      ]);
    });
  });

  describe("given a lab change the tables have not yet named", () => {
    let finding: LabChange;
    let shown: Parameters<typeof podPage>[0];
    let unnamed: string;
    before(async () => {
      const story = (await storyPods()).get("story-statin")!;
      finding = story.changes[0]!;
      shown = {
        pod: "ines-calloway",
        answers: story.answers,
        changes: story.changes,
      };
      unnamed = podPage(shown);
    });

    it('draws no card, and says "Naming what changed…"', () => {
      assert.equal(count(unnamed, /class="change[ "]/g), 0);
      assert.match(textOf(unnamed), /What changed\s*Naming what changed…/);
    });

    it("marks What changed, the tiles and the credits busy", () => {
      assert.equal(
        count(unnamed, 'aria-busy="true"'),
        3,
        "it, the tiles and the credits wait",
      );
    });

    it("draws the card once the tables have said, in `changeSaid()`'s sentence with the tables' name, and nothing busy", () => {
      const about = new Map([
        [
          finding.medication.code,
          { name: { label: "Atorvastatin, per the tables", altLabels: [] } },
        ],
      ]);
      const landed = podPage({ ...shown, about });
      assert.equal(count(landed, "aria-busy"), 0);
      const sentence = said.changeSaid(finding, about);
      assert.ok(sentence.includes("Atorvastatin, per the tables"), sentence);
      assert.ok(textOf(landed).includes(sentence), sentence);
    });
  });

  describe("given a story pod with no change to show", () => {
    let stories: Map<string, Story>;
    let little: Story;
    let thin: string;
    before(async () => {
      stories = await storyPods();
      little = stories.get("story-too-little")!;
      thin = podOf("rafferty-moon", little);
    });

    it('says "Nothing stands out yet." when no medication and test changed together', () => {
      const herring = podOf("pell-hargrove", stories.get("story-red-herring")!);
      assert.match(textOf(herring), /Nothing stands out yet\./);
      assert.equal(count(herring, /class="change[ "]/g), 0);
    });

    it("counts a medication and test with too few results, with no card, and says how many results before and after", () => {
      assert.equal(count(thin, /class="change[ "]/g), 0);
      assert.match(
        textOf(thin),
        /1 pair of a medication and a test had too few results to say anything\./,
      );
      assert.match(
        textOf(thin),
        /[A-Z][^.:]*: [^.]+ was prescribed 6 May 2024, with 3 results before and 1 after\./,
      );
    });

    it("links that medication and test to their trend", () => {
      assert.deepEqual(hrefsOf(thin, "Open the trend"), [
        paths.trend("rafferty-moon", { test: "2823-3", medication: "979492" }),
      ]);
    });

    it("draws no What changed card for a pod with no lab result, or with no medication history", () => {
      for (const question of [LABS, HISTORY])
        assert.equal(
          count(
            podOf("pell-hargrove", little, {
              ...little.answers,
              [question]: [],
            }),
            /class="card [^"]*\bchanges\b/g,
          ),
          0,
          question,
        );
    });
  });

  describe("given every sentence the app says of a lab change", () => {
    let storyPodsMap: Map<string, Story>;
    before(async () => {
      storyPodsMap = await storyPods();
    });

    it("never says why a result changed, in any sentence `CHANGED` gives", () => {
      const changed = said.CHANGED as Record<
        string,
        (test: string, medication: string, day: string) => string
      >;
      const days = said.MEDICATION_DAY as Record<string, { said: string }>;
      const sentences = Object.values(changed).flatMap((say) =>
        Object.values(days).map((day) => say("Test", "Medication", day.said)),
      );
      assert.ok(sentences.length > 0, "the sentences to check");
      for (const sentence of sentences) assert.doesNotMatch(sentence, CAUSES);
    });

    it("never says why, of a lab change of the five story pods or on its trend", () => {
      for (const [patient, story] of storyPodsMap) {
        for (const finding of story.changes.filter(
          ({ direction }: LabChange) => direction !== "not enough results",
        ))
          assert.doesNotMatch(
            said.sentenceOf(finding, said.changeNames(finding, new Map())),
            CAUSES,
            patient,
          );
        assert.doesNotMatch(
          textOf(trendOf("a-pod", story, {})),
          CAUSES,
          patient,
        );
      }
    });
  });

  describe("given a pod brought in twice", () => {
    let story: Story;
    let twice: ReturnType<typeof importedTwice>["twice"];
    let text: string;
    let ahead: string;
    let undated: string;
    let once: string;
    let unrevised: string;
    before(async () => {
      story = (await storyPods()).get("story-statin")!;
      const built = importedTwice(story);
      twice = built.twice;
      const inZone = (zone: string) => {
        const was = process.env.TZ;
        process.env.TZ = zone;
        try {
          return textOf(podOf("pell-hargrove", story, twice));
        } finally {
          if (was === undefined) delete process.env.TZ;
          else process.env.TZ = was;
        }
      };
      text = inZone("America/Los_Angeles");
      ahead = inZone("Pacific/Auckland");
      undated = textOf(
        podOf("pell-hargrove", story, {
          ...twice,
          [REVISIONS]: twice[REVISIONS].map((row) =>
            Object.fromEntries(
              Object.entries(row).filter(([key]) => key !== "answeredAsOf"),
            ),
          ),
        }),
      );
      once = textOf(podOf("pell-hargrove", story));
      unrevised = textOf(
        podOf("pell-hargrove", story, {
          ...twice,
          [REVISIONS]: twice[REVISIONS].slice(0, 2).concat(
            built.arrival(2, "r-third", "ni:third"),
          ),
        }),
      );
    });

    it('lists the imports in order under "Where this comes from", each with its hospital and how many records it brought in', () => {
      assert.match(
        text,
        /Where this comes from The pod's records came in 2 imports, in this order: From Cascade North, [^:]+: 2 records\. From Cascade North, [^:]+: 1 record, /,
      );
    });

    it("gives an import's day as the world's date it was pulled under, else the day it was retrieved where the person is", () => {
      assert.match(
        text,
        /From Cascade North, retrieved 29 January 2024: 2 records\. From Cascade North, as of 1 February 2025: 1 record/,
      );
      assert.doesNotMatch(text, /Oct 17, 2026/);
    });

    it("gives the day retrieved in the person's own zone, so midnight UTC is the day before in Los Angeles and the same day in Auckland", () => {
      assert.match(text, /retrieved 29 January 2024/);
      assert.match(ahead, /retrieved 30 January 2024/);
    });

    it("counts the records of an import that were a new version of one the pod held", () => {
      assert.ok(
        text.includes(
          "1 record, 1 of them a new version of one the pod already held.",
        ),
      );
    });

    it("says which versions of the medication differ, in which import, and what differs between them", () => {
      assert.match(
        text,
        / came in a new version: version 1 to version 2, in import 2, as of 1 February 2025\. Workflow status active → completed; medication use end date none → 15 April 2024\./,
      );
    });

    it("says a value that looks like a date but is none as written, not as `NaN undefined NaN`", () => {
      const malformed = textOf(
        podOf("pell-hargrove", story, {
          ...twice,
          [VERSIONS]: twice[VERSIONS].map((row) =>
            row.value === "2024-04-15" ? { ...row, value: "2024-13-45" } : row,
          ),
        }),
      );
      assert.match(malformed, /medication use end date none → 2024-13-45\./);
      assert.doesNotMatch(malformed, /NaN/);
    });

    it("gives the day a new version arrived, where the person is, when its import had no world's date", () => {
      assert.ok(
        undated.includes(
          `in import 2, ${said.stepWhenSaid({ arrived: "2026-10-17T09:05:00Z" })}.`,
        ),
        undated,
      );
    });

    it("prints no IRI and no web address", () => {
      assert.doesNotMatch(text, /urn:|ni:|https?:/);
    });

    it("never says why", () => {
      assert.doesNotMatch(
        text.slice(text.indexOf("Where this comes from")),
        CAUSES,
      );
    });

    it('draws no "Where this comes from" for a pod of one import', () => {
      assert.match(once, /What changed/);
      assert.doesNotMatch(once, /Where this comes from/);
    });

    it("lists the imports with no word of a new version when the medication has one version", () => {
      assert.match(unrevised, /The pod's records came in 2 imports/);
      assert.doesNotMatch(unrevised, /came in a new version/);
    });
  });

  describe("withImportHistory(answers, changes, ask)", () => {
    let story: Story;
    let twice: ReturnType<typeof importedTwice>["twice"];
    before(async () => {
      story = (await storyPods()).get("story-statin")!;
      twice = importedTwice(story).twice;
    });
    const recorder = () => {
      const asked: string[] = [];
      return {
        asked,
        ask: async (question: string) => {
          asked.push(question);
          return [];
        },
      };
    };

    it("asks nothing for a pod of one import, or with no lab change", async () => {
      const oneImport = recorder();
      await said.withImportHistory(
        { ...story.answers, [IMPORTS]: twice[IMPORTS].slice(0, 2) },
        story.changes,
        oneImport.ask,
      );
      const noChange = recorder();
      await said.withImportHistory(
        { ...story.answers, [IMPORTS]: twice[IMPORTS] },
        [],
        noChange.ask,
      );
      assert.deepEqual(oneImport.asked, [], "one import");
      assert.deepEqual(noChange.asked, [], "no lab change");
    });

    it("asks for each record's revisions and what each version says, for two imports and a lab change", async () => {
      const both = recorder();
      await said.withImportHistory(
        { ...story.answers, [IMPORTS]: twice[IMPORTS] },
        story.changes,
        both.ask,
      );
      assert.deepEqual(both.asked, [REVISIONS, VERSIONS]);
    });
  });

  describe("given a trend", () => {
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
    const trend = (about?: Map<string, unknown>, naming?: boolean) =>
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
    const own = trend();
    const named = trend(
      new Map([
        [series.test.code, { name: { label: "LDL cholesterol" } }],
        [timeline[0]!.code!, { name: { label: "Atorvastatin calcium" } }],
      ]),
    );
    const naming = trend(undefined, true);

    const days = {
      test: { code: `${codeStems.LOINC}18262-6`, notation: "18262-6" },
      results: [{ date: "2024-03-10", value: 98, unit: "mg/dL" }],
      left: { unparsed: 0, undated: 0 },
    };
    const medicationDays = [
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
    const daysOf = (medication: string) =>
      draw("TrendPage", {
        pod: "a-pod",
        titles: new Map(),
        read: { labs: [], series: days, timeline: medicationDays, medication },
      });
    const marked = (page: string) =>
      ["written", "start", "stop"].map((kind) =>
        count(page, new RegExp(`class="mark ${kind}[ "]`, "g")),
      );
    const mixed = daysOf("617310");
    const lane = textAt(mixed, "trend-lane-desc") ?? "";
    let story: Story;
    before(async () => {
      story = (await storyPods()).get("story-statin")!;
    });

    it("describes the chart by its number of results, from the earliest day to the latest", () => {
      const page = trendOf("ines-calloway", story, {
        test: "18262-6",
        medication: "617310",
      });
      assert.match(
        textAt(page, "trend-chart-desc") ?? "",
        /^6 results from 1 September 2023 to 2 December 2024/,
      );
    });

    it("names the test and the medication by the record's own text, with nothing busy, until the tables name them", () => {
      assert.match(textOf(own), /LDL/);
      assert.match(textOf(own), /Atorvastatin/);
      assert.match(own, /Atorvastatin started 5 January 2024./);
      assert.doesNotMatch(own, /aria-busy/);
    });

    it("names them by the tables' names, and a medication the tables do not name by its own text", () => {
      assert.match(named, /<h1>LDL cholesterol[<]/);
      assert.match(named, /Atorvastatin calcium started/);
      assert.match(textOf(named), /Aspirin/);
    });

    it("marks the heading, the chart and the lists to choose from busy while the engine is still naming them", () => {
      assert.match(naming, /<h1 aria-busy="true">LDL</);
      for (const part of ["trend", "picker"])
        assert.match(
          naming,
          new RegExp(
            `<div class="card [^"]*\\b${part}\\b[^"]*" aria-busy="true">`,
          ),
          part,
        );
    });

    it("marks the day a prescription was written, the start of use and the stop once each, the earliest among the medication's entries", () => {
      assert.deepEqual(marked(mixed), [1, 1, 0]);
      assert.deepEqual(marked(daysOf("861007")), [1, 1, 1]);
    });

    it("describes the chart with the medication's days", () => {
      assert.match(
        textAt(mixed, "trend-chart-desc") ?? "",
        /Atorvastatin prescribed 1 January 2024\. Atorvastatin started 4 March 2024\.$/,
      );
    });

    it("says each medication's days in its lane", () => {
      for (const sentence of [
        "Atorvastatin: prescribed 1 January 2024, from 4 March 2024, not stopped.",
        "Metformin: prescribed 1 May 2023, from 1 June 2023 to 1 February 2024.",
      ])
        assert.ok(lane.includes(sentence), lane);
    });

    it("says that the chart leaves out a result in another unit, and lists it in the table", () => {
      const page = draw("TrendPage", {
        pod: "a-pod",
        titles: new Map(),
        read: {
          labs: [],
          series: {
            test: { code: `${codeStems.LOINC}18262-6`, notation: "18262-6" },
            results: [
              { date: "2024-03-10", value: 98, unit: "mg/dL" },
              { date: "2024-04-10", value: 98, unit: "mg/dL" },
              { date: "2024-05-10", value: 2.5, unit: "mmol/L" },
            ],
            left: { unparsed: 0, undated: 0 },
          },
          timeline: [],
        },
      });
      assert.match(
        textOf(page),
        /The chart leaves out 1 result in another unit/,
      );
      assert.doesNotMatch(textOf(page), /Left out/);
      assert.equal(rowsIn(page), 3);
    });
  });

  describe("given a trend's address", () => {
    let story: Story;
    let page: string;
    let asked: { test?: string; medication?: string };
    before(async () => {
      story = (await storyPods()).get("story-statin")!;
      const href = paths.trend("ines-calloway", {
        test: "18262-6",
        medication: "617310",
      });
      const query = new URL(href, "http://app.test").searchParams;
      asked = {
        test: query.get("test") ?? undefined,
        medication: query.get("medication") ?? undefined,
      };
      page = trendOf("ines-calloway", story, asked);
    });

    it("draws a marker for each result of the test the address names", () => {
      assert.deepEqual(asked, { test: "18262-6", medication: "617310" });
      assert.equal(count(page, /class="marker[ "]/g), 6);
    });

    it("names the test in the chart's title, and marks the test and the medication as the ones chosen", () => {
      const change = story.changes[0]!;
      assert.equal(textAt(page, "trend-chart-title"), change.test.name);
      assert.deepEqual(currentIn(page), [
        change.test.name,
        change.medication.name,
      ]);
    });

    it("lists every result in the table", () => {
      assert.equal(rowsIn(page), 6);
    });

    it("marks the day the prescription was written, and says in the lane that the start of use is not known", () => {
      assert.equal(count(page, /class="mark written[ "]/g), 1);
      assert.equal(count(page, /class="mark start[ "]/g), 0);
      assert.equal(count(page, /class="mark stop[ "]/g), 0);
      const lane = textAt(page, "trend-lane-desc");
      assert.ok(
        lane?.includes(
          `${story.changes[0]!.medication.name}: prescribed 4 March 2024, start of use not known, not stopped.`,
        ),
        lane,
      );
    });

    it("marks no day when the address names no medication", () => {
      const none = trendOf("ines-calloway", story, { test: "18262-6" });
      assert.equal(count(none, /class="mark [a-z]+[ "]/g), 0);
      assert.equal(count(none, /class="marker[ "]/g), 6);
    });

    it("picks the strongest lab change's test and medication, from `trendInput()`, when the address names neither", () => {
      assert.deepEqual(
        said.trendInput(
          { changes: story.changes, labs: story.answers[LABS]! },
          {},
        ),
        { test: "18262-6", medication: "617310" },
      );
    });
  });
});
/** The `data-ask` contexts a page draws, in order. */
const asksOf = (markup: string) =>
  [...markup.matchAll(/data-ask="([^"]*)"/g)].map(
    ([, context]) =>
      JSON.parse(context!.replaceAll("&quot;", '"')) as Record<string, unknown>,
  );

/**
 * Where the app has a chat that names a model, a screen draws an "Ask about this" button beside each thing a person
 * might ask of. The button carries a context, which says what it stands beside.
 */
describe("Asking the chat about what a screen shows · AskProvider", () => {
  let story: Story;
  before(async () => {
    story = (await storyPods()).get("story-statin")!;
  });
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
        { ask },
      );
  const reviewLine = pod({
    [REVIEW]: [
      { entry: "urn:uuid:e1", needs: "judged different, still joined" },
    ],
  });
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
      { ask },
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
      { ask },
    );
  /** The four screens that draw the button, each with the one context it draws. */
  const ROWS = (): [
    page: (ask: boolean) => string,
    asked: Record<string, unknown>[],
  ][] => [
    [
      pod(story.answers, story.changes),
      [{ kind: "finding", key: story.changes[0]!.key }],
    ],
    [reviewLine, [{ kind: "worth", entry: "e1" }]],
    [trend, [{ kind: "trend", test: "18262-6", medication: "617310" }]],
    [entry, [{ kind: "entry", id: "bb22" }]],
  ];
  const SCREENS = [
    "a What changed card",
    "a Worth a look line",
    "the trend",
    "the entry",
  ];

  describe("given a chat that names a model", () => {
    const contexts = (row: number, kind: string) =>
      asksOf(ROWS()[row]![0](true)).filter((context) => context.kind === kind);

    it("draws a button on each What changed card, its context the lab change's `key`", () => {
      assert.deepEqual(contexts(0, "finding"), ROWS()[0]![1]);
    });

    it("draws a button on each Worth a look line, its context the line's entry", () => {
      assert.deepEqual(contexts(1, "worth"), ROWS()[1]![1]);
    });

    it("draws a button on the trend, its context the test and the medication", () => {
      assert.deepEqual(contexts(2, "trend"), ROWS()[2]![1]);
    });

    it("draws a button on an entry's screen, its context the entry's address", () => {
      assert.deepEqual(contexts(3, "entry"), ROWS()[3]![1]);
    });

    it("draws no context of another kind on any of the four", () => {
      ROWS().forEach(([page, asked], row) =>
        assert.deepEqual(
          [...new Set(asksOf(page(true)).map(({ kind }) => kind))],
          [asked[0]!.kind],
          SCREENS[row],
        ),
      );
    });

    it('names each button "Ask about this", in its title and for a screen reader, with an icon and no text', () => {
      ROWS().forEach(([page], row) => {
        const buttons = [
          ...page(true).matchAll(
            /<button [^>]*data-ask="[^>]*>(.*?)<\/button>/g,
          ),
        ];
        assert.ok(buttons.length > 0, SCREENS[row]);
        for (const [button, inside] of buttons) {
          assert.match(button, /title="Ask about this"/, SCREENS[row]);
          assert.match(
            button,
            /aria-label="Ask about this: [^"]+"/,
            SCREENS[row],
          );
          assert.equal(inside!.replace(/<svg.*<\/svg>/, ""), "", SCREENS[row]);
        }
      });
    });
  });

  describe("given no chat", () => {
    it("draws no button and no context on any of the four", () => {
      ROWS().forEach(([page], row) => {
        assert.deepEqual(asksOf(page(false)), [], SCREENS[row]);
        assert.doesNotMatch(page(false), /Ask about this/, SCREENS[row]);
      });
    });
  });
});
