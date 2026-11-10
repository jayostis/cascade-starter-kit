import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { codeStems, terms } from "cascade-runtime";
import {
  ALLERGIES,
  CLINVAR,
  closeStoryPods,
  COLUMBA,
  concept,
  CONDITIONS,
  DIFFERS,
  entryRow,
  GROUPS,
  HARBOURLINE,
  HISTORY,
  LABELS,
  LABS,
  MEDICATIONS,
  NAME,
  report,
  REVIEW,
  ROW,
  rows,
  said,
  SOURCES,
  storyPods,
  VARIANT_ANSWERS,
  VARIANTS,
  VARIANTS_SAID,
  verdict,
  VERSION,
} from "./fixtures.js";

after(closeStoryPods);

type Line = { sentence: string; entry: string; tag?: string };

/** The three things a line of Worth a look holds that a reader of a screen sees. */
const shown = ({ entry, sentence, tag }: Line) => [entry, sentence, tag];

/** A pod's rows: what needs review, and the names the rows are of. */
const REVIEWED = {
  [ALLERGIES]: [
    { entry: "e1", allergen: "Penicillin" },
    { entry: "e5", allergen: "Sulfamethoxazole" },
    { entry: "e6" },
  ],
  [CONDITIONS]: [
    { entry: "e2", condition: "Asthma" },
    { entry: "e3", condition: "Eczema" },
    { entry: "e4", condition: "Migraine" },
    { entry: "e7", condition: "Acute viral pharyngitis" },
  ],
  [MEDICATIONS]: [
    { entry: "e8", medication: "Lisinopril 10 MG Oral Tablet" },
    { entry: "e11" },
  ],
  [REVIEW]: [
    { entry: "e5", needs: "members disagree on criticality" },
    { entry: "e2", needs: "joined through two kinds of machine sameness" },
    { entry: "e3", needs: "judged different, still joined" },
    { entry: "e3", needs: "judged different, still joined" },
    {
      entry: "e9",
      entryLabel: "Allergy entry · Latex",
      needs: "judged different, still joined",
    },
    { entry: "e6", needs: "members disagree on criticality" },
    { entry: "e10", needs: "judged different, still joined" },
    { entry: "e4", needs: "same code, dates cannot tell" },
    { entry: "e7", needs: "joined before, apart under newer tables or rules" },
    { entry: "e6", needs: "joined before, apart under newer tables or rules" },
    {
      entry: "e8",
      needs: "possibly the same medication",
      otherRecord: "r1",
      otherRecordLabel: "Medication · Zestril · own entry",
    },
    {
      entry: "e8",
      needs: "possibly the same medication",
      otherRecord: "r2",
      otherRecordLabel: "Medication · no name · own entry",
    },
    { entry: "e11", needs: "possibly the same medication", otherRecord: "r3" },
  ],
};
const REVIEW_LINES = said.worthALook(REVIEWED) as Line[];
const SHARED =
  "Cascade cannot confirm that the shared code names one product, so they may or may not be the same.";

const RXNORM = codeStems.RxNorm;
const ingredients = (...codes: string[]) => ({
  ingredients: { codes: codes.map((code) => RXNORM + code), origin: "urn:v" },
});
/** What the reference tables say of each medication code and ingredient the leaves below use. */
const ABOUT = new Map<string, unknown>([
  [RXNORM + "197361", ingredients("17767")],
  [RXNORM + "212550", ingredients("17767")],
  [RXNORM + "308135", ingredients("17767", "5640")],
  [RXNORM + "1", ingredients("5640")],
  [RXNORM + "9", ingredients("777")],
  [RXNORM + "10", ingredients("777")],
  [
    RXNORM + "777",
    { name: { label: "hydrochlorothiazide / lisinopril", altLabels: [] } },
  ],
  [RXNORM + "17767", { name: { label: "amlodipine", altLabels: [] } }],
]);
const medications = (...each: Record<string, string>[]) => ({
  [MEDICATIONS]: each.map((row): Record<string, string> => ({
    ...row,
    lifecycle: terms.MedicationActive as string,
  })),
});
const sharedLines = (answers: object) =>
  (said.worthALook(answers, ABOUT) as Line[]).map(shown);
const PAIRED = medications(
  {
    entry: "e1",
    medication: "amlodipine 5 MG Oral Tablet",
    code: RXNORM + "197361",
  },
  {
    entry: "e2",
    medication: "Norvasc 10 MG Oral Tablet",
    code: RXNORM + "212550",
  },
  { entry: "e3", medication: "Aspirin" },
  { entry: "e4", medication: "Pain relief", code: RXNORM + "1" },
  { entry: "e5", medication: "Combined", code: RXNORM + "308135" },
  { entry: "e6", medication: "Zestoretic", code: RXNORM + "9" },
  { entry: "e7", medication: "Prinzide", code: RXNORM + "10" },
);
const RXNORM_SERIES = {
  iri: "urn:test:rxnorm",
  label: "RxNorm",
  credit: "RxNorm, NLM.",
  versions: [{ iri: "urn:v", label: "1", issued: "2026-10-01" }],
};
/** What `entryOf` says is known of an entry, among its sentences the ones that say a pair shares an ingredient. */
const sharedOf = (id: string, held: object[]) =>
  (
    said.entryOf(
      {
        ...PAIRED,
        "entry/Where it came from": PAIRED[MEDICATIONS].map((row) => ({
          ...row,
          record: `r-${row.entry}`,
        })),
      },
      id,
      { about: ABOUT, held },
    ).known as { sentence: string; from?: object }[]
  ).filter(({ sentence }) => sentence?.includes("share an"));

/**
 * Worth a look is the short list at the top of a pod's screen: a sentence for each view entry the pod says needs
 * review, for each report that differs from ClinVar today, and for each pair of medications that share an
 * ingredient. The sentences are the app's; which entries, reports and pairs there are comes from the pod's own
 * answer and from cascade-runtime.
 */
describe("What a pod's screen says is worth a look · worthALook()", () => {
  describe("worthALook(answers)", () => {
    for (const [needs, entry, sentence] of [
      [
        "members disagree on criticality",
        "e5",
        "Sources disagree on how severe the Sulfamethoxazole allergy is.",
      ],
      [
        "joined through two kinds of machine sameness",
        "e2",
        "Asthma was matched in two different ways.",
      ],
      [
        "judged different, still joined",
        "e3",
        "Eczema was marked as different, but is still shown as one condition.",
      ],
      [
        "same code, dates cannot tell",
        "e4",
        "Migraine was recorded more than once, and its dates cannot tell whether it is one condition or several.",
      ],
      [
        "joined before, apart under newer tables or rules",
        "e7",
        "Acute viral pharyngitis was kept as one condition with another before; newer reference tables or rules no longer match them, so they are shown apart.",
      ],
      [
        "possibly the same medication",
        "e8",
        `Lisinopril 10 MG Oral Tablet shares a code with Zestril, which Cascade keeps apart. ${SHARED}`,
      ],
    ] as const)
      it(`says \`${needs}\` as \`${sentence}\``, () => {
        assert.equal(
          REVIEW_LINES.find((line) => line.entry === entry)?.sentence,
          sentence,
        );
      });

    it("gives each such line its view entry and the tag `Needs review`", () => {
      assert.deepEqual(
        REVIEW_LINES.map(({ entry }) => entry),
        [
          "e5",
          "e2",
          "e3",
          "e9",
          "e6",
          "e10",
          "e4",
          "e7",
          "e6",
          "e8",
          "e8",
          "e11",
        ],
      );
      for (const { tag } of REVIEW_LINES) assert.equal(tag, "Needs review");
    });

    it("says a row the pod gives twice once", () => {
      assert.equal(
        REVIEW_LINES.filter(({ entry }) => entry === "e3").length,
        1,
      );
    });

    it("says two rows of one view entry apart when they need different things, or name different other records", () => {
      assert.deepEqual(
        REVIEW_LINES.filter(({ entry }) => entry === "e6").map(
          ({ sentence }) => sentence,
        ),
        [
          "Sources disagree on how severe an unnamed allergy is.",
          "An unnamed allergy was kept as one allergy with another before; newer reference tables or rules no longer match them, so they are shown apart.",
        ],
      );
      assert.deepEqual(
        REVIEW_LINES.filter(({ entry }) => entry === "e8").map(
          ({ sentence }) => sentence,
        ),
        [
          `Lisinopril 10 MG Oral Tablet shares a code with Zestril, which Cascade keeps apart. ${SHARED}`,
          `Lisinopril 10 MG Oral Tablet shares a code with another medication, which Cascade keeps apart. ${SHARED}`,
        ],
      );
    });

    it("names a view entry no section shows by the name in its `entryLabel`: `Allergy entry · Latex` is `Latex`, one allergy", () => {
      assert.equal(
        REVIEW_LINES.find(({ entry }) => entry === "e9")?.sentence,
        "Latex was marked as different, but is still shown as one allergy.",
      );
    });

    it("calls a view entry with no name `an unnamed allergy`, and one with no `entryLabel` `An entry`", () => {
      assert.ok(
        REVIEW_LINES.some(
          ({ entry, sentence }) =>
            entry === "e6" &&
            sentence ===
              "Sources disagree on how severe an unnamed allergy is.",
        ),
      );
      assert.equal(
        REVIEW_LINES.find(({ entry }) => entry === "e10")?.sentence,
        "An entry was marked as different, but is still shown as one entry.",
      );
    });

    it("calls the other medication of a pair `another medication` when its `otherRecordLabel` holds no name", () => {
      assert.deepEqual(
        REVIEW_LINES.filter(({ entry }) => entry === "e8" || entry === "e11")
          .slice(1)
          .map(({ sentence }) => sentence),
        [
          `Lisinopril 10 MG Oral Tablet shares a code with another medication, which Cascade keeps apart. ${SHARED}`,
          `An unnamed medication shares a code with another medication, which Cascade keeps apart. ${SHARED}`,
        ],
      );
    });

    it("gives no line for a view entry that nothing says needs review", () => {
      assert.equal(
        REVIEW_LINES.some(({ entry }) => entry === "e1"),
        false,
      );
    });
  });

  describe("worthALook(answers, about)", () => {
    it("says two medications in two view entries whose codes share an ingredient, naming the ingredient, with no tag", () => {
      assert.deepEqual(sharedLines(PAIRED)[0], [
        "e1",
        "Amlodipine 5 MG Oral Tablet and Norvasc 10 MG Oral Tablet share an ingredient, amlodipine, and are shown apart.",
        undefined,
      ]);
    });

    it("gives the line the view entry of the first medication it names", () => {
      assert.deepEqual(
        sharedLines(PAIRED).map(([entry]) => entry),
        ["e1", "e1", "e2", "e4", "e6"],
      );
    });

    it("says a pair once for each two view entries, in the order of the Medications section", () => {
      assert.deepEqual(sharedLines(PAIRED), [
        [
          "e1",
          "Amlodipine 5 MG Oral Tablet and Norvasc 10 MG Oral Tablet share an ingredient, amlodipine, and are shown apart.",
          undefined,
        ],
        [
          "e1",
          "Amlodipine 5 MG Oral Tablet and Combined share an ingredient, amlodipine, and are shown apart.",
          undefined,
        ],
        [
          "e2",
          "Norvasc 10 MG Oral Tablet and Combined share an ingredient, amlodipine, and are shown apart.",
          undefined,
        ],
        [
          "e4",
          "Pain relief and Combined share an ingredient, 5640, and are shown apart.",
          undefined,
        ],
        [
          "e6",
          "Zestoretic and Prinzide share the combination, hydrochlorothiazide / lisinopril, and are shown apart.",
          undefined,
        ],
      ]);
    });

    it("says a pair once when the rows of one of its view entries are not adjacent", () => {
      assert.deepEqual(
        sharedLines(
          medications(
            {
              entry: "e1",
              medication: "amlodipine 5 MG Oral Tablet",
              code: RXNORM + "197361",
            },
            {
              entry: "e2",
              medication: "Bmlodipine",
              code: RXNORM + "212550",
            },
            {
              entry: "e1",
              medication: "Norvasc 10 MG Oral Tablet",
              code: RXNORM + "308135",
            },
          ),
        ),
        [
          [
            "e1",
            "Amlodipine 5 MG Oral Tablet and Bmlodipine share an ingredient, amlodipine, and are shown apart.",
            undefined,
          ],
        ],
      );
    });

    it("says `share the combination` when the shared ingredient's name holds ` / `", () => {
      assert.equal(
        sharedLines(PAIRED).find(([entry]) => entry === "e6")?.[1],
        "Zestoretic and Prinzide share the combination, hydrochlorothiazide / lisinopril, and are shown apart.",
      );
    });

    it("names an ingredient the reference tables do not name by the last part of its code", () => {
      assert.equal(
        sharedLines(PAIRED).find(([entry]) => entry === "e4")?.[1],
        "Pain relief and Combined share an ingredient, 5640, and are shown apart.",
      );
    });

    it("begins each sentence with a capital letter", () => {
      assert.ok(
        PAIRED[MEDICATIONS][0]!.medication!.startsWith("amlodipine"),
        "the row begins with a lower-case word",
      );
      for (const [, sentence] of sharedLines(PAIRED))
        assert.match(sentence as string, /^\p{Lu}/u);
    });
  });

  describe("worthALook(answers, about, said)", () => {
    it("says a report that differs from ClinVar today, naming the variant, the report's year and its lab, with the tag `Differs`", () => {
      assert.deepEqual(
        said.worthALook(VARIANT_ANSWERS, new Map(), VARIANTS_SAID),
        [
          {
            sentence: `MLH1 ${NAME}: your 2022 report from ${HARBOURLINE} differs from ClinVar today.`,
            entry: "v1",
            tag: DIFFERS,
          },
        ],
      );
    });

    it("says no such line before the reference tables have been asked", () => {
      assert.deepEqual(said.worthALook(VARIANT_ANSWERS), []);
    });
  });

  describe("entryOf(answers, id, { about, held })", () => {
    it("says a pair's sentence among what is known of each of its two view entries", () => {
      assert.deepEqual(
        sharedOf("e2", [RXNORM_SERIES]).map(({ sentence }) => sentence),
        [
          "Amlodipine 5 MG Oral Tablet and Norvasc 10 MG Oral Tablet share an ingredient, amlodipine, and are shown apart.",
          "Norvasc 10 MG Oral Tablet and Combined share an ingredient, amlodipine, and are shown apart.",
        ],
      );
    });

    it("gives each such sentence the version of the table its ingredients were read from, in `from`", () => {
      assert.deepEqual(
        sharedOf("e2", [RXNORM_SERIES]).map(({ from }) => from),
        [
          { series: RXNORM_SERIES, version: RXNORM_SERIES.versions[0] },
          { series: RXNORM_SERIES, version: RXNORM_SERIES.versions[0] },
        ],
      );
    });

    it("says no such sentence when the version of the table is not held", () => {
      assert.deepEqual(sharedOf("e2", []), []);
    });

    it("says no such sentence of a view entry in no pair", () => {
      assert.deepEqual(sharedOf("e3", [RXNORM_SERIES]), []);
    });
  });
});

/**
 * A pod's screen has a section for each kind of record, such as Medications or Lab results, each a table of the
 * pod's rows. These functions choose the codes the app asks the reference tables to name, and how a table's values
 * are rounded and its rows ordered.
 */
describe("Naming and ordering the rows of a pod's tables · codesOf(), codesSaid(), rounded(), compare(), openingOrder()", () => {
  const CVX = "urn:test:cvx/";
  const ICD = "urn:test:icd/";
  const SCT = "urn:test:sct/";
  const LOINC = codeStems.LOINC;

  describe("codesOf(answers)", () => {
    const codes = said.codesOf({
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
          snomed: `${SCT}195967001`,
          icd10: `${ICD}J45.909`,
        },
      ],
      [REVIEW]: [{ entry: "i3", needs: "judged different, still joined" }],
    }) as string[];

    it("returns the code of every row a section shows, each once", () => {
      assert.deepEqual(
        [...codes].sort(),
        [
          `${CVX}141`,
          `${CVX}15`,
          `${CVX}57`,
          `${CVX}999`,
          `${SCT}195967001`,
          `${ICD}J45.909`,
          `${LOINC}2823-3`,
          `${LOINC}2075-0`,
        ].sort(),
      );
    });

    it("returns both codes of a condition that has a SNOMED CT code and an ICD-10 code", () => {
      for (const code of [`${SCT}195967001`, `${ICD}J45.909`])
        assert.ok(codes.includes(code), code);
    });
  });

  describe("codesSaid(answers, { tables })", () => {
    const RX = "urn:test:rxnorm/";
    const asked: string[][] = [];
    let about: Map<string, { name: { label: string } }>;
    before(async () => {
      about = await said.codesSaid(
        {
          "pod/My medication history": [
            { entry: "m1", medication: "Lisinopril", code: `${RX}314076` },
            {
              entry: "m2",
              medication: "Old",
              code: `${RX}1`,
              ended: "2024-01-01",
            },
          ],
        },
        {
          tables: {
            about: async (codes: string[]) => {
              asked.push(codes);
              return new Map(
                codes.map((code) => [
                  code,
                  code === `${RX}314076`
                    ? {
                        ingredients: {
                          codes: [`${RX}29046`],
                          origin: "urn:v",
                        },
                      }
                    : {
                        name: {
                          label: "lisinopril",
                          altLabels: [],
                          origin: "urn:v",
                        },
                      },
                ]),
              );
            },
          },
        },
      );
    });

    it("asks the reference tables of the pod's codes, then once more of the ingredients those codes map to", () => {
      assert.deepEqual(asked, [[`${RX}314076`, `${RX}1`], [`${RX}29046`]]);
    });

    it("returns what the reference tables say of an ingredient beside what they say of the pod's codes", () => {
      assert.equal(about.get(`${RX}1`)?.name.label, "lisinopril");
      assert.equal(about.get(`${RX}29046`)?.name.label, "lisinopril");
    });
  });

  describe("rounded(value)", () => {
    it("rounds a number to three significant figures: `60.967166143994106` is `61`, `4.705469` is `4.71`", () => {
      assert.equal(said.rounded("60.967166143994106"), "61");
      assert.equal(said.rounded("4.705469"), "4.71");
    });

    it("returns a number of fewer figures as written", () => {
      assert.equal(said.rounded("0.8"), "0.8");
      assert.equal(said.rounded("192"), "192");
    });

    it("returns a value that is no number as written", () => {
      assert.equal(said.rounded("Negative"), "Negative");
    });
  });

  describe("compare(type, a, b)", () => {
    it("sorts an empty value after any other, for text, numbers and dates", () => {
      for (const [type, key] of [
        ["text", "Glucose"],
        ["number", "4.7"],
        ["date", "2025-01-05"],
      ] as const) {
        assert.ok(said.compare(type, "", key) > 0, `${type}: empty after`);
        assert.ok(said.compare(type, key, "") < 0, `${type}: other before`);
      }
    });
  });

  describe("openingOrder(section, rows)", () => {
    const section = said.SECTIONS.find(
      ({ question }: { question: string }) => question === LABS,
    );
    const opened = (
      said.openingOrder(section, [
        { test: "Sodium" },
        { test: "Glucose", performed: "2024-03-01" },
        { test: "Potassium", performed: "2025-06-18T14:10:00-07:00" },
        { test: "Creatinine", performed: "2025-01-05" },
      ]) as { test: string }[]
    ).map(({ test }) => test);

    it("returns the lab results newest first", () => {
      assert.deepEqual(opened.slice(0, 3), [
        "Potassium",
        "Creatinine",
        "Glucose",
      ]);
    });

    it("puts a row with no date last", () => {
      assert.equal(opened.at(-1), "Sodium");
    });
  });
});

const martin = rows({
  classification: [concept("LikelyPathogenic"), concept("Pathogenic")],
  reviewStatus: concept("ClinVarMultipleSubmittersNoConflicts"),
  lastEvaluated: "2024-12-11",
  contributingSubmitters: 5,
});
const MARTIN_SAYS =
  "ClinVar today says pathogenic/likely pathogenic: criteria provided, multiple submitters, no conflicts, five contributing submitters.";

interface Case {
  reports?: unknown[];
  says?: unknown;
  verdicts?: unknown[];
  gene?: string;
  labels?: Map<string, string>;
  places?: Map<string, string>;
}

/** What a variant's page is given, by what each case shows; a case is said with `variantOf`. */
const CASES = {
  lab: {
    reports: [
      report("r1", "UncertainSignificance", "2022-05-01"),
      report("r2", undefined, "2024-03-21"),
      report("r3", "Benign", undefined),
      report("r4", "Benign", "2023-01-01"),
    ],
    says: martin,
    verdicts: [verdict("r1", "differs")],
    places: new Map([
      ["r1", HARBOURLINE],
      ["r2", COLUMBA],
      ["r3", HARBOURLINE],
    ]),
  },
  martin: {
    reports: [
      report("r2", "LikelyPathogenic", "2024-03-21"),
      report("r1", "UncertainSignificance", "2022-05-01"),
    ],
    says: martin,
    verdicts: [verdict("r1", "differs"), verdict("r2", "agrees")],
  },
  benign: {
    reports: [
      report("r1", "Benign", "2023-01-01"),
      report("r2", "LikelyBenign", "2024-01-01"),
    ],
    says: rows({
      classification: [concept("Benign"), concept("LikelyBenign")],
      reviewStatus: concept("ClinVarSingleSubmitter"),
      contributingSubmitters: 1,
    }),
    verdicts: [verdict("r1", "agrees"), verdict("r2", "agrees")],
  },
  days: {
    reports: [
      report("r1", undefined, "2020-01-01"),
      report("r2", "Benign", undefined),
      report("r3", "UncertainSignificance", "2024-11-02"),
      report("r4", "Pathogenic", "2024-03-21"),
    ],
    says: { found: "not found", series: "urn:test:clinvar", version: VERSION },
  },
  others: {
    reports: [
      report("r1", "UncertainSignificance", "2021-01-01"),
      report("r2", "UncertainSignificance", "2022-01-01"),
      report("r3", "UncertainSignificance", "2023-01-01"),
      report("r4", "UncertainSignificance", "2024-01-01"),
    ],
    says: martin,
    verdicts: [
      verdict("r1", "differs", { origin: "ni:///clinvar-0" }),
      verdict("r2", "differs", { row: "urn:test:other" }),
      verdict("r3", "labs disagree"),
      verdict("r4", "as ClinVar writes it"),
    ],
  },
  uncovered: {
    gene: "BRCA2",
    says: {
      found: "not covered",
      series: "urn:test:clinvar",
      version: VERSION,
      genes: ["EPCAM", "MLH1", "MSH2", "MSH6", "PMS2"],
    },
  },
  noTable: { says: { found: "no series" } },
  notAsked: {
    reports: [report("r1", "UncertainSignificance", "2022-01-01")],
  },
  words: {
    reports: [report("r1", "LikelyPathogenic", "2024-03-21")],
    labels: new Map(),
  },
  disagree: {
    says: rows({
      classification: [
        concept("ClinVarConflicting"),
        concept("ClinVarRiskFactor"),
      ],
      reviewStatus: concept("ClinVarNoAssertionCriteria"),
      contributingSubmitters: 12,
    }),
  },
  subTier: {
    says: rows({
      classification: [
        concept("ClinVarVusHigh"),
        concept("UncertainSignificance"),
      ],
      contributingSubmitters: 0,
    }),
  },
  combination: {
    says: rows({
      classification: [concept("ClinVarCombinationOnly")],
      contributingSubmitters: 2,
    }),
  },
  counted: {
    says: rows({
      classification: [concept("UncertainSignificance")],
      submitters: 3,
    }),
  },
  unclassified: {
    says: rows({
      reviewStatus: concept("ClinVarNoAssertionCriteria"),
      submitters: 1,
    }),
  },
} satisfies Record<string, Case>;

const variantOf = (name: keyof typeof CASES) => {
  const input: Case = CASES[name];
  return said.variantSaid({
    variant: { gene: input.gene, hgvs: [], variations: [] },
    reports: input.reports ?? [],
    says: input.says,
    verdicts: input.verdicts ?? [],
    labels: input.labels ?? LABELS,
    ...(input.places && { places: input.places }),
  }) as {
    reports: {
      report: string;
      when?: string;
      sentence: string;
      tag?: string;
    }[];
    clinvar?: string;
  };
};
const sentencesOf = (name: keyof typeof CASES) =>
  variantOf(name).reports.map(({ sentence }) => sentence);
const clinvarOf = (name: keyof typeof CASES) => variantOf(name).clinvar;

/**
 * A variant's screen says in sentences what each lab's report said of the variant and what ClinVar says today, and
 * tags a report `Differs` when ClinVar's row no longer holds its classification. Each sentence says only what the
 * pod's rows, `tables.variantClassification()` and `pod.agreement()` hold, so a missing date, lab or classification
 * is said as missing.
 */
describe("Saying what ClinVar says of a variant and of each report · variantSaid(), rowSaid(), variantsSaid(), variantReports()", () => {
  describe("variantSaid({ variant, reports, says, verdicts, labels, places })", () => {
    it("says each report in a sentence, oldest first, an undated one last", () => {
      assert.deepEqual(
        variantOf("days").reports.map(({ report }) => report),
        ["r1", "r4", "r3", "r2"],
      );
    });

    it("names a report by its year, and by its day when two reports are of one year", () => {
      assert.deepEqual(
        variantOf("days").reports.map(({ when }) => when),
        ["2020", "Mar 21, 2024", "Nov 2, 2024", undefined],
      );
      assert.deepEqual(sentencesOf("days").slice(0, 3), [
        "Your 2020 report gives no ACMG classification.",
        "Your Mar 21, 2024 report said pathogenic.",
        "Your Nov 2, 2024 report said uncertain significance.",
      ]);
    });

    it("names the lab a report came from when `places` holds it, and no lab otherwise", () => {
      assert.deepEqual(sentencesOf("lab").slice(0, 2), [
        `Your 2022 report from ${HARBOURLINE} said uncertain significance.`,
        "Your 2023 report said benign.",
      ]);
    });

    it("says `gives no ACMG classification` of a report that has none", () => {
      assert.equal(
        sentencesOf("lab")[2],
        `Your 2024 report from ${COLUMBA} gives no ACMG classification.`,
      );
    });

    it("calls a report with no date `An undated report`, and gives it no `when`", () => {
      const reports = variantOf("lab").reports;
      assert.equal(
        reports[3]!.sentence,
        `An undated report from ${HARBOURLINE} said benign.`,
      );
      assert.deepEqual(
        reports.map((each) => "when" in each),
        [true, true, true, false],
      );
    });

    it("tags `Differs` a report whose verdict is `differs` against the row and the version of the table ClinVar's sentence was read from", () => {
      assert.deepEqual(
        variantOf("martin").reports.map(({ sentence, tag }) => [sentence, tag]),
        [
          ["Your 2022 report said uncertain significance.", DIFFERS],
          ["Your 2024 report said likely pathogenic.", undefined],
        ],
      );
    });

    it("adds no tag for a verdict about another row or another version of the table", () => {
      const reports = variantOf("others").reports;
      assert.equal(reports[0]!.tag, undefined, "a version of ClinVar's row");
      assert.equal(reports[1]!.tag, undefined, "another row");
    });

    it("adds no tag for a verdict other than `differs`", () => {
      const reports = variantOf("others").reports;
      assert.equal(reports[2]!.tag, undefined, "labs disagree");
      assert.equal(reports[3]!.tag, undefined, "as ClinVar writes it");
    });

    it("says a classification in the words of its term when `labels` holds nothing for it", () => {
      assert.deepEqual(sentencesOf("words"), [
        "Your 2024 report said likely pathogenic.",
      ]);
    });

    it("says the reports, and nothing of ClinVar, when the reference tables have not been asked", () => {
      assert.deepEqual(sentencesOf("notAsked"), [
        "Your 2022 report said uncertain significance.",
      ]);
      assert.equal(clinvarOf("notAsked"), undefined);
    });

    it("says a row as `ClinVar today says pathogenic/likely pathogenic: criteria provided, multiple submitters, no conflicts, five contributing submitters.`", () => {
      assert.equal(clinvarOf("martin"), MARTIN_SAYS);
    });

    it("says two ACMG classifications as `pathogenic/likely pathogenic` or `likely benign/benign`, whatever order the row holds them in", () => {
      assert.match(clinvarOf("martin")!, /says pathogenic\/likely pathogenic:/);
      assert.match(clinvarOf("benign")!, /says likely benign\/benign:/);
    });

    it("says a count of contributing submitters under ten in words, and from ten in figures", () => {
      assert.match(clinvarOf("benign")!, /, one contributing submitter\.$/);
      assert.match(
        clinvarOf("combination")!,
        /, two contributing submitters\.$/,
      );
      assert.match(clinvarOf("martin")!, /, five contributing submitters\.$/);
      assert.match(clinvarOf("disagree")!, /, 12 contributing submitters\.$/);
      assert.match(clinvarOf("subTier")!, /, no contributing submitters\.$/);
    });

    it("says a row that counts submitters, not contributing ones, as `3 submitters`, and one as `one submitter`", () => {
      assert.equal(
        clinvarOf("counted"),
        "ClinVar today says uncertain significance, 3 submitters.",
      );
      assert.match(clinvarOf("unclassified")!, /, one submitter\.$/);
    });

    it("says `labs that submit to ClinVar disagree` for a row ClinVar marks conflicting, with its other value after `;`", () => {
      assert.equal(
        clinvarOf("disagree"),
        "ClinVar today says labs that submit to ClinVar disagree; risk factor: no assertion criteria provided, 12 contributing submitters.",
      );
    });

    it("says a sub-tier after its ACMG classification: `uncertain significance; VUS-high`", () => {
      assert.equal(
        clinvarOf("subTier"),
        "ClinVar today says uncertain significance; VUS-high, no contributing submitters.",
      );
    });

    it("says `classified only as part of a combination` for a row that holds only that", () => {
      assert.equal(
        clinvarOf("combination"),
        "ClinVar today says classified only as part of a combination, two contributing submitters.",
      );
    });

    it("says `ClinVar today gives no classification` for a row with a review status and no classification", () => {
      assert.equal(
        clinvarOf("unclassified"),
        "ClinVar today gives no classification: no assertion criteria provided, one submitter.",
      );
    });

    it("says `ClinVar, as this app holds it, has no row for this variant.` when the series has none", () => {
      assert.equal(
        clinvarOf("days"),
        "ClinVar, as this app holds it, has no row for this variant.",
      );
    });

    it("says which genes the held series covers when the variant's gene is not among them", () => {
      assert.equal(
        clinvarOf("uncovered"),
        "ClinVar, as this app holds it, covers EPCAM, MLH1, MSH2, MSH6 and PMS2, not BRCA2.",
      );
    });

    it("says `This app holds no ClinVar table.` when no series is held", () => {
      assert.equal(clinvarOf("noTable"), "This app holds no ClinVar table.");
    });
  });

  describe("rowSaid(row)", () => {
    it("says a row with one classification and nothing else as `ClinVar today says uncertain significance.`", () => {
      assert.equal(
        said.rowSaid({
          series: "urn:test:clinvar",
          version: VERSION,
          variation: ROW,
          classification: [concept("UncertainSignificance")],
        }),
        "ClinVar today says uncertain significance.",
      );
    });
  });

  describe("variantReports(answers, said, held)", () => {
    const found = said.variantReports(VARIANT_ANSWERS, VARIANTS_SAID, [
      CLINVAR,
    ]);
    const mlh1 = found.get("v1");
    const orphan = found.get("orphan");

    it("returns each variant's view entry, those the pod's variants question lists first and one only a report names last", () => {
      assert.deepEqual([...found.keys()], ["v1", "orphan"]);
    });

    it("names a variant by its gene and first expression, and one with no gene by its expression alone", () => {
      assert.equal(mlh1.name, `MLH1 ${NAME}`);
      assert.equal(orphan.name, "NM_000500.1:c.1A>G");
    });

    it("returns in `asked` the gene, expressions and ClinVar IDs the reference tables are asked of", () => {
      assert.deepEqual(mlh1.asked, {
        gene: "MLH1",
        hgvs: [NAME, "NM_000249.4:c.2042C>T"],
        variations: ["90011"],
      });
      assert.deepEqual(orphan.asked, { hgvs: [], variations: [] });
    });

    it("returns each report's year, lab and tag apart from its sentence", () => {
      assert.deepEqual(
        mlh1.reports.map(
          ({ report, when, place, tag }: Record<string, string>) => [
            report,
            when,
            place,
            tag,
          ],
        ),
        [
          ["r1", "2022", HARBOURLINE, DIFFERS],
          ["r2", "2024", COLUMBA, undefined],
        ],
      );
      assert.deepEqual(orphan.reports, [
        {
          report: "r3",
          when: "2023",
          sentence: "Your 2023 report said benign.",
        },
      ]);
    });

    it("returns ClinVar's sentence with the series and version it was read from, in `from`", () => {
      assert.equal(mlh1.clinvar, "ClinVar today says pathogenic.");
      assert.deepEqual(mlh1.from, {
        series: CLINVAR,
        version: CLINVAR.versions[0],
      });
      assert.equal(orphan.clinvar, undefined);
      assert.equal(orphan.from, undefined);
    });

    it("returns the reports with no tag, and no ClinVar sentence, before the reference tables have been asked", () => {
      const early = said.variantReports(VARIANT_ANSWERS).get("v1");
      assert.deepEqual(
        early.reports.map(({ tag }: { tag?: string }) => tag),
        [undefined, undefined],
      );
      assert.equal(early.clinvar, undefined);
    });
  });

  describe("variantsSaid(answers, { tables, pod })", () => {
    const PROTEIN = "NM_000249.4(MLH1):c.2042C>T (p.Ala681Val)";
    const NAMES = {
      iri: "urn:test:names",
      versions: [{ iri: "ni:///names-1" }],
    };
    const stem = codeStems.ClinVar;
    const answers = {
      [VARIANTS]: ["named", "unfound", "unnamed", "twofold"].map(
        (variant, at) => ({ variant, gene: "MLH1", variation: String(at) }),
      ),
      [SOURCES]: [
        entryRow("named", "Variant entry · MLH1", "n-a", "doc", {
          hospital: HARBOURLINE,
          arrived: "2026-09-01T10:00:00Z",
        }),
      ],
    };
    const found = (variation: string) => ({
      ...rows({}),
      rows: [{ variation, classification: [] }],
    });
    const tables = {
      variantClassification: async ({
        variations,
      }: {
        variations: string[];
      }) =>
        variations[0] === "1"
          ? { found: "not found", series: "s", version: "v" }
          : variations[0] === "3"
            ? {
                ...found(`${stem}0`),
                rows: [`${stem}0`, `${stem}3`].map((variation) => ({
                  variation,
                  classification: [],
                })),
              }
            : found(`${stem}${variations[0]}`),
      labels: async () => new Map(),
      held: async () => [NAMES],
      about: async (codes: string[]) =>
        new Map(
          codes.map((code) => [
            code,
            code === `${stem}0`
              ? {
                  notation: "0",
                  name: {
                    label: PROTEIN,
                    altLabels: [],
                    origin: "ni:///names-1",
                  },
                }
              : { notation: "x" },
          ]),
        ),
    };
    let variants: unknown;
    let named: Map<string, { name: string; namedFrom?: unknown }>;
    let unheld: Map<string, { name: string; namedFrom?: unknown }>;
    before(async () => {
      variants = await said.variantsSaid(answers, { tables, pod: undefined });
      named = said.variantReports(answers, variants, [NAMES]);
      unheld = said.variantReports(
        answers,
        await said.variantsSaid(answers, {
          tables: { ...tables, held: async () => [] },
          pod: undefined,
        }),
        [],
      );
    });

    it("names a variant by ClinVar's name of the one variation its classification found", () => {
      assert.equal(named.get("named")?.name, PROTEIN);
    });

    it("returns the series and version that named it, in `namedFrom`", () => {
      assert.deepEqual(named.get("named")?.namedFrom, {
        series: NAMES,
        version: NAMES.versions[0],
      });
    });

    it("keeps the gene as the name when the classification found no variation, found two, or the names table has no row for the one", () => {
      for (const entry of ["unfound", "unnamed", "twofold"])
        assert.equal(named.get(entry)?.name, "MLH1", entry);
    });

    it("keeps the gene as the name, with no `namedFrom`, when the version that named it is not held", () => {
      assert.equal(unheld.get("named")?.name, "MLH1");
      assert.equal(unheld.get("named")?.namedFrom, undefined);
    });

    it("says `ClinVar names this variation …` first among what is known of the view entry, with the version of the table it came from", () => {
      const entry = said.entryOf(answers, "named", {
        said: variants,
        held: [NAMES],
      });
      assert.equal(entry.name, PROTEIN);
      assert.deepEqual(entry.known[0], {
        sentence: `ClinVar names this variation ${PROTEIN}.`,
        from: { series: NAMES, version: NAMES.versions[0] },
      });
    });
  });
});

/**
 * A pod is a folder named from a person's name, and its screens show that name, and the places records came from,
 * as a person would say them rather than as a folder or an import states them. `gradePerson()` grades how surely a
 * hospital's patient is the pod's subject, so the app can warn before another person's records are brought in.
 */
describe("Naming pods, people and places as a person says them · slug(), personName(), placeOf(), demoPeople(), familyFirst(), gradePerson(), didNote()", () => {
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
  ]) as { name: string; at: unknown[] }[];

  describe("slug(person)", () => {
    it("makes a pod's name of lower-case words with a hyphen between them: `Rowan Ellery Marsh` is `rowan-ellery-marsh`", () => {
      assert.equal(said.slug("Rowan Ellery Marsh"), "rowan-ellery-marsh");
    });

    it("drops accents and the spaces at either end: `  Zoë Ångström-Lee ` is `zoe-angstrom-lee`", () => {
      assert.equal(said.slug("  Zoë Ångström-Lee "), "zoe-angstrom-lee");
    });

    it("returns an empty name for a person's name with no letter from a to z and no digit", () => {
      assert.equal(said.slug("李明"), "");
    });
  });

  describe("personName(pod, titles)", () => {
    const titles = new Map([
      ["tamsin-at-north", "Tamsin at North"],
      ["o-brien-mcdonald", "O'Brien McDonald"],
      ["ada", "ada"],
      ["alex-rivera-j24", "Alex Rivera"],
    ]);

    it("returns the name typed when the pod was made, as typed, `O'Brien McDonald` included", () => {
      assert.equal(
        said.personName("tamsin-at-north", titles),
        "Tamsin at North",
      );
      assert.equal(
        said.personName("o-brien-mcdonald", titles),
        "O'Brien McDonald",
      );
    });

    it("returns the pod's name with a capital on each word when no typed name is held", () => {
      assert.equal(
        said.personName("rowan-ellery-marsh", titles),
        "Rowan Ellery Marsh",
      );
      assert.equal(said.personName("tamsin-at-north"), "Tamsin At North");
    });

    it("returns the pod's name with a capital on each word when the typed name is the pod's name itself", () => {
      assert.equal(said.personName("ada", titles), "Ada");
    });

    it("returns the pod's name with a capital on each word when the typed name would make a pod of another name", () => {
      assert.equal(
        said.personName("alex-rivera-j24", titles),
        "Alex Rivera J24",
      );
    });
  });

  describe("placeOf(row)", () => {
    for (const [row, place, title] of [
      [
        {
          hospital: "Larkspur Valley Health",
          importLabel: "Apple Health export",
        },
        "Larkspur Valley Health",
        "returns the hospital's name when the row has one, whatever its import is called",
      ],
      [
        { hospital: "Cascade North Demo Hospital", importLabel: "FHIR pull" },
        "Cascade North",
        "drops ` Demo Hospital` from a demo hospital's name",
      ],
      [
        { importLabel: "entered by Alex in the Cascade app" },
        "Alex's own entries",
        "says `entered by Alex in the Cascade app` as `Alex's own entries`",
      ],
      [
        { importLabel: "entered by the person" },
        "Own entries",
        "says `entered by the person` as `Own entries`",
      ],
      [
        { importLabel: "Apple Health export" },
        "Apple Health",
        "drops ` export` from the name of an import",
      ],
      [
        {},
        "Somewhere unnamed",
        "returns `Somewhere unnamed` for a row with neither",
      ],
    ] as const)
      it(title, () => {
        assert.equal(said.placeOf(row), place);
      });
  });

  describe("demoPeople(demo)", () => {
    it("sorts the demo hospitals' people by family name, then given name", () => {
      assert.deepEqual(people.map(said.familyFirst), [
        "Abbot, Wren",
        "Thorne, Lark",
        "Thorne, Moss Avery",
      ]);
    });

    it("returns a person two hospitals hold once, with both hospitals", () => {
      assert.deepEqual(
        people.map(({ name, at }) => [name, at.length]),
        [
          ["Wren Abbot", 1],
          ["Lark Thorne", 1],
          ["Moss Avery Thorne", 2],
        ],
      );
    });
  });

  describe("familyFirst(person)", () => {
    it("writes a person family name first: `Thorne, Moss Avery`", () => {
      assert.equal(said.familyFirst(people[2]), "Thorne, Moss Avery");
    });
  });

  describe("gradePerson(subject, names)", () => {
    const named = (...names: [string, string, string?][]) =>
      said.patientNames({
        entry: [
          {
            resource: {
              resourceType: "Patient",
              name: names.map(([given, family, use]) => ({
                given: [given],
                family,
                use,
              })),
            },
          },
        ],
      });
    const rowan = "Rowan Ellery Marsh";

    it("returns `certain` when a name of the patient is the subject's, whatever its case, spacing or how an accent is written, as one character or a letter and a mark", () => {
      for (const [subject, names] of [
        [rowan, named(["Rowan Ellery", "Marsh"])],
        [" rowan  ellery MARSH ", named(["Rowan Ellery", "Marsh"])],
        ["José García", named(["José", "García"])],
        ["José García", named(["José", "García"])],
        ["JOSÉ GARCÍA", named(["José", "García"])],
      ] as const)
        assert.equal(said.gradePerson(subject, names), "certain", subject);
    });

    it("returns `certain` when any one of the patient's names is the subject's, a maiden name included", () => {
      assert.equal(
        said.gradePerson(
          "Blanche Weber",
          named(
            ["Blanche", "Hermiston", "official"],
            ["Blanche", "Weber", "maiden"],
          ),
        ),
        "certain",
      );
      assert.equal(
        said.gradePerson(
          "Bertie Predovic",
          named(
            ["Bertie", "Hackett", "official"],
            ["Bertie", "Predovic", "maiden"],
          ),
        ),
        "certain",
      );
    });

    it("returns `possible` when only the patient's family name is among the subject's words", () => {
      assert.equal(
        said.gradePerson(rowan, named(["Hedda", "Marsh"])),
        "possible",
      );
      assert.equal(
        said.gradePerson(rowan, named(["Moss Avery", "Marsh"])),
        "possible",
      );
    });

    it("returns `certainly-not` when neither the name nor the family name matches", () => {
      assert.equal(
        said.gradePerson(rowan, named(["Odalys", "Brandt"])),
        "certainly-not",
      );
    });

    it("returns `certainly-not` for a patient with no family name whose given names are only part of the subject's", () => {
      assert.equal(
        said.gradePerson(rowan, named(["Rowan Ellery", ""])),
        "certainly-not",
      );
    });

    it("returns undefined when the subject is not given or the patient has no name", () => {
      assert.equal(
        said.gradePerson(undefined, named(["Odalys", "Brandt"])),
        undefined,
      );
      assert.equal(said.gradePerson(rowan, []), undefined);
    });
  });

  describe("didNote(query, kits)", () => {
    const noted = (query: string, kits: string[] = []) =>
      said.didNote(new URLSearchParams(query), kits);

    it("says how many pods were deleted: `Deleted 3 pods.`, `Deleted 1 pod.`", () => {
      assert.equal(noted("deleted=3"), "Deleted 3 pods.");
      assert.equal(noted("deleted=1"), "Deleted 1 pod.");
    });

    it("says `There was no pod to delete.` for a count of none", () => {
      assert.equal(noted("deleted=0"), "There was no pod to delete.");
    });

    it("names the people whose pods are back after a reset: `Reset: Alex Rivera and Priya Natarajan are back.`", () => {
      assert.equal(
        noted("pod=alex-rivera&reset", ["alex-rivera", "priya-natarajan"]),
        "Reset: Alex Rivera and Priya Natarajan are back.",
      );
    });

    it("returns undefined for a count that is no whole number", () => {
      assert.equal(noted("deleted=some"), undefined);
    });

    it("returns undefined for a query that says neither", () => {
      assert.equal(noted("pod=alex-rivera"), undefined);
    });
  });
});

/**
 * The reference tables screen lists the series the app holds under whoever publishes them, shows a series' rows a
 * page at a time, and says in one note what a check of the feeds just did.
 */
describe("Grouping reference tables by publisher, and saying what a check did · sourcesOf(), pageNumber(), checkedNote()", () => {
  describe("sourcesOf(held)", () => {
    const SOURCE = "urn:uuid:17cec5a9-071a-4179-9403-5c1e3886fb7d";
    const groups = (
      said.sourcesOf([
        {
          ...GROUPS,
          iri: "urn:uuid:f71f6797-48ec-4875-9b87-4cb1be1d9be0",
          label: "Example CVX names",
          source: SOURCE,
        },
        { ...GROUPS, label: "Example CVX vaccine groups", source: SOURCE },
        { ...GROUPS, iri: "urn:uuid:0e2b", label: "Lone table" },
      ]) as { iri: string; label: string; series: unknown[] }[]
    ).map(({ iri, label, series }) => [iri, label, series.length]);

    it("groups the series one publisher gives, under the words their names share: `Example CVX`", () => {
      assert.deepEqual(groups[0], [SOURCE, "Example CVX", 2]);
    });

    it("returns a series that names no publisher as a group of its own, under its own name", () => {
      assert.deepEqual(groups[1], ["urn:uuid:0e2b", "Lone table", 1]);
    });
  });

  describe("pageNumber(asked)", () => {
    it("returns a whole number above 1 as the page asked for", () => {
      assert.equal(said.pageNumber("3"), 3);
    });

    it("returns 1 for anything else: nothing, zero, a negative number, a fraction, a word, or a number too large to count by", () => {
      assert.deepEqual(
        ["", null, "0", "-2", "2.5", "x", "Infinity", "1e400", "1e20"].map(
          said.pageNumber,
        ),
        [1, 1, 1, 1, 1, 1, 1, 1, 1],
      );
    });
  });

  describe("checkedNote(did, held)", () => {
    const checked = (fields: object) => ({
      feed: "https://f.example/feed.ttl",
      kept: [],
      refused: [],
      ...fields,
    });
    for (const [did, note, title] of [
      [
        [checked({})],
        "Checked the feeds: nothing new.",
        "says `Checked the feeds: nothing new.` when no feed gave a version",
      ],
      [
        [checked({ kept: ["ni:///v2"] })],
        "Kept Example vaccine groups, version 2, Oct 8, 2026.",
        "names the series and version a check kept: `Kept Example vaccine groups, version 2, Oct 8, 2026.`",
      ],
      [
        [checked({ later: "https://f.example/feed.ttl answered 503" })],
        "Not read now, tried again later: https://f.example/feed.ttl answered 503.",
        "says a feed that was not read now and is tried again later, with the reason",
      ],
      [
        [
          checked({
            refused: [
              {
                version: "ni:///v3",
                reason: "its rows do not have the checksum the feed gives",
              },
            ],
          }),
        ],
        "Refused a version: its rows do not have the checksum the feed gives.",
        "says why a version was refused",
      ],
    ] as const)
      it(title, () => {
        assert.equal(said.checkedNote(did, [GROUPS]), note);
      });
  });
});

/**
 * An "Ask about this" button sends a first question that fits the kind of thing it sits beside, and an empty chat
 * offers up to four questions. Each is offered only when the pod holds what answers it.
 */
describe("Questions the chat offers before a person types · firstQuestion(), suggestedQuestions()", () => {
  describe("firstQuestion(context)", () => {
    for (const [context, question, title] of [
      [
        { kind: "finding", key: "k" },
        "What does this change show?",
        "returns `What does this change show?` for a lab change",
      ],
      [
        { kind: "trend", test: "t" },
        "What does this trend show?",
        "returns `What does this trend show?` for a trend",
      ],
      [
        { kind: "entry", id: "e" },
        "What is this, and where did it come from?",
        "returns `What is this, and where did it come from?` for a view entry",
      ],
      [
        { kind: "worth", entry: "e" },
        "What does this flag mean?",
        "returns `What does this flag mean?` for a Worth a look line",
      ],
    ] as const)
      it(title, () => {
        assert.equal(said.firstQuestion(context), question);
      });

    it("returns undefined for a kind it does not know, a name every object has, such as `toString`, included", () => {
      assert.equal(said.firstQuestion({ kind: "other" }), undefined);
      assert.equal(said.firstQuestion({ kind: "toString" }), undefined);
      assert.equal(said.firstQuestion(undefined), undefined);
    });
  });

  describe("suggestedQuestions(answers, { changes })", () => {
    const change = (n: number, dateIs: string) => ({
      kind: dateIs === "end of use" ? "after stop" : "after start",
      direction: "down",
      test: { code: `t${n}`, name: `Test ${n}` },
      medication: { code: `m${n}`, name: `Drug ${n}`, dateIs },
    });
    const FIRST = "Find anything interesting in this pod";
    let ines: string[];
    let finding: { test: { name: string }; medication: { name: string } };
    const many = said.suggestedQuestions(
      { [HISTORY]: [{ medication: "Drug 1", ended: "2024-05-01" }] },
      {
        changes: [
          change(1, "start of use"),
          change(2, "end of use"),
          change(3, "start of use"),
          change(4, "start of use"),
          change(5, "start of use"),
        ],
      },
    ) as string[];
    before(async () => {
      const story = (await storyPods()).get("story-statin")!;
      finding = story.changes[0] as unknown as typeof finding;
      ines = said.suggestedQuestions(story.answers, {
        changes: story.changes,
      }) as string[];
    });

    it("offers `Find anything interesting in this pod` first when the pod has a lab change", () => {
      assert.equal(ines[0], FIRST);
    });

    it("offers it too for a pod with a Worth a look line and no lab change", () => {
      assert.deepEqual(
        said.suggestedQuestions(
          {
            [HISTORY]: [],
            [LABS]: [],
            [REVIEW]: [
              { entry: "e1", needs: "judged different, still joined" },
            ],
          },
          { changes: [] },
        ),
        [FIRST],
      );
    });

    it("offers a question for each lab change, with its test and medication as the pod's screen names them", () => {
      assert.equal(
        ines[1],
        `Did ${finding.test.name} change after ${finding.medication.name} was prescribed?`,
      );
    });

    it("ends that question `was prescribed`, `started` or `stopped`, by the day the change is counted from", () => {
      assert.match(ines[1]!, / was prescribed\?$/);
      assert.equal(many[1], "Did Test 1 change after Drug 1 started?");
      assert.equal(many[2], "Did Test 2 change after Drug 2 stopped?");
    });

    it("offers `Which medications have I stopped?` last when a medication of the history has an end date", () => {
      assert.equal(many.at(-1), "Which medications have I stopped?");
    });

    it("offers four at most, the first and the last keeping their places", () => {
      assert.deepEqual(many, [
        FIRST,
        "Did Test 1 change after Drug 1 started?",
        "Did Test 2 change after Drug 2 stopped?",
        "Which medications have I stopped?",
      ]);
    });

    it("offers no question for a change with not enough results", () => {
      assert.deepEqual(
        said.suggestedQuestions(
          {},
          {
            changes: [
              { ...change(5, "start of use"), direction: "not enough results" },
            ],
          },
        ),
        [],
      );
    });

    it("offers none for a pod with nothing to ask about", () => {
      assert.deepEqual(said.suggestedQuestions({}, { changes: [] }), []);
    });
  });
});

/**
 * The world's date is the day the demo hospitals answer as of, so a story's later records are not yet there. A
 * calendar day is the last second of that day in UTC; the app says it in words, and says it of a pull.
 */
describe("Setting the day the demo hospitals answer as of · api.setWorldDate(), worldInstant(), utcInstant(), worldDateSaid(), pulledAsOfSaid(), GET /world-date", () => {
  describe("worldInstant(text)", () => {
    it("takes a calendar day as the last second of that day in UTC, spaces at either end aside", () => {
      assert.equal(said.worldInstant("2024-02-01"), "2024-02-01T23:59:59Z");
      assert.equal(said.worldInstant(" 2024-02-01 "), "2024-02-01T23:59:59Z");
      assert.equal(said.worldInstant("1000-01-01"), "1000-01-01T23:59:59Z");
    });

    it("keeps an instant that states its timezone as it was given", () => {
      for (const instant of [
        "2024-02-01T00:00:00Z",
        "2024-02-01T10:00:00+02:00",
      ])
        assert.equal(said.worldInstant(instant), instant);
    });

    it("returns undefined for a day the calendar does not have", () => {
      for (const text of ["2024-02-30", "2024-13-01"])
        assert.equal(said.worldInstant(text), undefined, text);
    });

    it("returns undefined for an instant with no timezone", () => {
      assert.equal(said.worldInstant("2024-02-01T10:00:00"), undefined);
    });

    it("returns undefined for a year below 1000", () => {
      for (const text of ["0099-01-01", "0999-12-31T23:59:59Z"])
        assert.equal(said.worldInstant(text), undefined, text);
    });

    it("returns undefined for empty text, and for words", () => {
      for (const text of ["", "yesterday"])
        assert.equal(said.worldInstant(text), undefined, JSON.stringify(text));
    });
  });

  describe("utcInstant(asOf)", () => {
    it("returns an instant written with an offset in UTC: `2024-02-01T09:00:00+02:00` is `2024-02-01T07:00:00Z`", () => {
      assert.equal(
        said.utcInstant("2024-02-01T09:00:00+02:00"),
        "2024-02-01T07:00:00Z",
      );
      assert.equal(said.utcInstant(undefined), undefined);
    });
  });

  describe("worldDateSaid(asOf)", () => {
    it("says the day in UTC, in words: `Hospitals answer as of 1 February 2024.`", () => {
      assert.equal(
        said.worldDateSaid("2024-02-01T23:59:59Z"),
        "Hospitals answer as of 1 February 2024.",
      );
      assert.equal(
        said.worldDateSaid("2024-02-01T00:30:00+01:00"),
        "Hospitals answer as of 31 January 2024.",
      );
    });

    it("says `Hospitals answer with everything they hold.` when no date is set", () => {
      assert.equal(
        said.worldDateSaid(undefined),
        "Hospitals answer with everything they hold.",
      );
    });
  });

  describe("pulledAsOfSaid(asOf)", () => {
    it("says `Pulled as of 1 February 2024.`, and nothing when no date was set", () => {
      assert.equal(
        said.pulledAsOfSaid("2024-02-01T23:59:59Z"),
        "Pulled as of 1 February 2024.",
      );
      assert.equal(said.pulledAsOfSaid(undefined), undefined);
    });
  });
});
