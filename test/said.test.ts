import assert from "node:assert/strict";
import { after, test } from "node:test";
import { codeStems, type Terms, terms } from "cascade-runtime";
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
  SEEN,
  SOURCES,
  storyPods,
  VARIANT_ANSWERS,
  VARIANTS,
  VARIANTS_SAID,
  verdict,
  VERSION,
} from "./fixtures.js";

after(closeStoryPods);

test("worth a look: each thing that needs review, with its entry and the Needs review tag, and nothing for what was seen more than once", () => {
  const at = (entry: string, place: string, places: number) => ({
    entry,
    place,
    records: "1",
    places: String(places),
  });
  const answers = {
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
    [SEEN]: [
      at("e1", "Meridian Health System", 3),
      at("e1", "Larkspur Valley Health", 3),
      at("e1", "entered by Alex in the Cascade app", 3),
      at("e2", "Cascade North Demo Hospital", 1),
      at("e3", "Larkspur Valley Health", 1),
      at("e4", "Larkspur Valley Health", 1),
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
      {
        entry: "e7",
        needs: "joined before, apart under newer tables or rules",
      },
      {
        entry: "e6",
        needs: "joined before, apart under newer tables or rules",
      },
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
      {
        entry: "e11",
        needs: "possibly the same medication",
        otherRecord: "r3",
      },
    ],
  };
  const shared =
    "Cascade cannot confirm that the shared code names one product, so they may or may not be the same.";
  assert.deepEqual(
    said
      .worthALook(answers)
      .map(({ entry, sentence, tag }: Record<string, string>) => [
        entry,
        sentence,
        tag,
      ]),
    [
      [
        "e5",
        "Sources disagree on how severe the Sulfamethoxazole allergy is.",
        "Needs review",
      ],
      ["e2", "Asthma was matched in two different ways.", "Needs review"],
      [
        "e3",
        "Eczema was marked as different, but is still shown as one condition.",
        "Needs review",
      ],
      [
        "e9",
        "Latex was marked as different, but is still shown as one allergy.",
        "Needs review",
      ],
      [
        "e6",
        "Sources disagree on how severe an unnamed allergy is.",
        "Needs review",
      ],
      [
        "e10",
        "An entry was marked as different, but is still shown as one entry.",
        "Needs review",
      ],
      [
        "e4",
        "Migraine was recorded more than once, and its dates cannot tell whether it is one condition or several.",
        "Needs review",
      ],
      [
        "e7",
        "Acute viral pharyngitis was kept as one condition with another before; newer reference tables or rules no longer match them, so they are shown apart.",
        "Needs review",
      ],
      [
        "e6",
        "An unnamed allergy was kept as one allergy with another before; newer reference tables or rules no longer match them, so they are shown apart.",
        "Needs review",
      ],
      [
        "e8",
        `Lisinopril 10 MG Oral Tablet shares a code with Zestril, which Cascade keeps apart. ${shared}`,
        "Needs review",
      ],
      [
        "e8",
        `Lisinopril 10 MG Oral Tablet shares a code with another medication, which Cascade keeps apart. ${shared}`,
        "Needs review",
      ],
      [
        "e11",
        `An unnamed medication shares a code with another medication, which Cascade keeps apart. ${shared}`,
        "Needs review",
      ],
    ],
  );
});

test("worth a look: two medications in two entries whose codes share an ingredient are shown apart, once for each pair in the order of the section even when an entry's rows are not adjacent, a combination of one MIN said as a combination, and one entry's own rows, a medication with no code or two entries that share a code give nothing, since What needs review lists those, and a medication stopped or paused shares with none", () => {
  const RXNORM = codeStems.RxNorm;
  const ingredients = (...codes: string[]) => ({
    ingredients: { codes: codes.map((code) => RXNORM + code), origin: "urn:v" },
  });
  const about = new Map<string, unknown>([
    [RXNORM + "197361", ingredients("17767")],
    [RXNORM + "212550", ingredients("17767")],
    [RXNORM + "308135", ingredients("17767", "5640")],
    [RXNORM + "1", ingredients("5640")],
    [RXNORM + "9", ingredients("777")],
    [RXNORM + "10", ingredients("777")],
    [RXNORM + "20", ingredients("888")],
    [RXNORM + "21", ingredients("888")],
    [RXNORM + "30", ingredients("17767")],
    [RXNORM + "31", ingredients("17767")],
    [
      RXNORM + "777",
      { name: { label: "hydrochlorothiazide / lisinopril", altLabels: [] } },
    ],
    [RXNORM + "17767", { name: { label: "amlodipine", altLabels: [] } }],
  ]);
  const answers = (...rows: Record<string, string>[]) => ({
    [MEDICATIONS]: rows.map((row): Record<string, string> => ({
      ...row,
      lifecycle: terms[
        `Medication${row.lifecycle ?? "Active"}` as keyof Terms
      ] as string,
    })),
  });
  const lines = (rows: object) =>
    said
      .worthALook(rows, about)
      .map(({ entry, sentence, tag }: Record<string, string>) => [
        entry,
        sentence,
        tag,
      ]);
  const all = answers(
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
    { entry: "e8", medication: "Metformin", code: RXNORM + "20" },
    { entry: "e9", medication: "Glucophage XR", code: RXNORM + "21" },
    { entry: "e9", medication: "Glucophage", code: RXNORM + "20" },
    {
      entry: "e10",
      medication: "Stopped amlodipine",
      code: RXNORM + "30",
      lifecycle: "Stopped",
    },
    {
      entry: "e11",
      medication: "Paused amlodipine",
      code: RXNORM + "31",
      lifecycle: "Paused",
    },
  );
  assert.deepEqual(lines(all), [
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

  const series = {
    iri: "urn:test:rxnorm",
    label: "RxNorm",
    credit: "RxNorm, NLM.",
    versions: [{ iri: "urn:v", label: "1", issued: "2026-10-01" }],
  };
  const sourced = {
    ...all,
    "entry/Where it came from": all[MEDICATIONS].map((row) => ({
      ...row,
      record: `r-${row.entry}`,
    })),
  };
  const sentenceOf = (id: string, held: object[]) =>
    said
      .entryOf(sourced, id, { about, held })
      .known.map(({ sentence, from }: { sentence: string; from?: object }) => [
        sentence,
        from === undefined ? undefined : "from a table",
      ])
      .filter(([sentence]: string[]) => sentence?.includes("share an"));
  assert.deepEqual(
    sentenceOf("e2", [series]).map(([sentence]: string[]) => sentence),
    [
      "Amlodipine 5 MG Oral Tablet and Norvasc 10 MG Oral Tablet share an ingredient, amlodipine, and are shown apart.",
      "Norvasc 10 MG Oral Tablet and Combined share an ingredient, amlodipine, and are shown apart.",
    ],
    "the second medication of a pair says it too, and so does the first of the next",
  );
  assert.deepEqual(
    sentenceOf("e2", [series]).map(([, from]: string[]) => from),
    ["from a table", "from a table"],
  );
  assert.deepEqual(
    sentenceOf("e2", []),
    [],
    "a line from a table that is not held is not said",
  );
  assert.deepEqual(sentenceOf("e3", [series]), []);
  assert.deepEqual(
    lines(
      answers(
        {
          entry: "e1",
          medication: "amlodipine 5 MG Oral Tablet",
          code: RXNORM + "197361",
        },
        { entry: "e2", medication: "Bmlodipine", code: RXNORM + "212550" },
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

test("a row's place, as a person says it", () => {
  for (const [row, place] of [
    [
      {
        hospital: "Larkspur Valley Health",
        importLabel: "Apple Health export",
      },
      "Larkspur Valley Health",
    ],
    [
      { hospital: "Cascade North Demo Hospital", importLabel: "FHIR pull" },
      "Cascade North",
    ],
    [
      { importLabel: "entered by Alex in the Cascade app" },
      "Alex's own entries",
    ],
    [{ importLabel: "entered by the person" }, "Own entries"],
    [{ importLabel: "Apple Health export" }, "Apple Health"],
    [{}, "Somewhere unnamed"],
  ] as const)
    assert.equal(said.placeOf(row), place, JSON.stringify(row));
});

test("a hospital's people are named family name first and sorted by family name, then given name", () => {
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
  ]);
  assert.deepEqual(people.map(said.familyFirst), [
    "Abbot, Wren",
    "Thorne, Lark",
    "Thorne, Moss Avery",
  ]);
  assert.deepEqual(
    people.map(({ name, at }: { name: string; at: unknown[] }) => [
      name,
      at.length,
    ]),
    [
      ["Wren Abbot", 1],
      ["Lark Thorne", 1],
      ["Moss Avery Thorne", 2],
    ],
    "the same person at two hospitals once",
  );
});

test("a pod's name, from a person's", () => {
  for (const [person, pod] of [
    ["Rowan Ellery Marsh", "rowan-ellery-marsh"],
    ["  Zoë Ångström-Lee ", "zoe-angstrom-lee"],
    ["李明", ""],
  ])
    assert.equal(said.slug(person), pod, person);
});

test("a person's name is the one typed when the pod was made, else the pod's name capitalised", () => {
  const titles = new Map([
    ["tamsin-at-north", "Tamsin at North"],
    ["o-brien-mcdonald", "O'Brien McDonald"],
    ["ada", "ada"],
    ["alex-rivera-j24", "Alex Rivera"],
  ]);
  for (const [pod, person] of [
    ["rowan-ellery-marsh", "Rowan Ellery Marsh"],
    ["tamsin-at-north", "Tamsin at North"],
    ["o-brien-mcdonald", "O'Brien McDonald"],
    ["ada", "Ada"],
    ["alex-rivera-j24", "Alex Rivera J24"],
  ])
    assert.equal(said.personName(pod, titles), person, pod);
  assert.equal(said.personName("tamsin-at-north"), "Tamsin At North");
});

test("a record's person against the pod's: the grade", () => {
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
  for (const [subject, names, grade] of [
    [rowan, named(["Rowan Ellery", "Marsh"]), "certain"],
    [" rowan  ellery MARSH ", named(["Rowan Ellery", "Marsh"]), "certain"],
    ["José García", named(["José", "García"]), "certain"],
    [
      "Blanche Weber",
      named(
        ["Blanche", "Hermiston", "official"],
        ["Blanche", "Weber", "maiden"],
      ),
      "certain",
    ],
    [
      "Bertie Predovic",
      named(
        ["Bertie", "Hackett", "official"],
        ["Bertie", "Predovic", "maiden"],
      ),
      "certain",
    ],
    [rowan, named(["Hedda", "Marsh"]), "possible"],
    [rowan, named(["Moss Avery", "Marsh"]), "possible"],
    [rowan, named(["Odalys", "Brandt"]), "certainly-not"],
    [rowan, named(["Rowan Ellery", ""]), "certainly-not"],
  ] as const)
    assert.equal(said.gradePerson(subject, names), grade, subject);
  assert.equal(
    said.gradePerson(undefined, named(["Odalys", "Brandt"])),
    undefined,
  );
  assert.equal(said.gradePerson(rowan, []), undefined);
});

test("a measurement, to three significant figures", () => {
  for (const [value, shown] of [
    ["60.967166143994106", "61"],
    ["4.705469", "4.71"],
    ["0.8", "0.8"],
    ["192", "192"],
    ["Negative", "Negative"],
  ])
    assert.equal(said.rounded(value), shown, value);
});

test("a cell with nothing to sort by sorts after the rest", () => {
  for (const [type, key] of [
    ["text", "Glucose"],
    ["number", "4.7"],
    ["date", "2025-01-05"],
  ])
    assert.ok(said.compare(type, "", key) > 0, type);
});

test("the codes a pod's page asks the tables to name are every code of every row", () => {
  const CVX = "urn:test:cvx/";
  const ICD = "urn:test:icd/";
  const SCT = "urn:test:sct/";
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
        snomed: `${SCT}195967001`,
        icd10: `${ICD}J45.909`,
      },
    ],
    [REVIEW]: [{ entry: "i3", needs: "judged different, still joined" }],
  };
  assert.deepEqual(
    said.codesOf(answers).sort(),
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

test("what the page says after a File menu item: how many pods were deleted, or that the samples are back", () => {
  for (const [query, kits, note] of [
    ["deleted=3", [], "Deleted 3 pods."],
    ["deleted=1", [], "Deleted 1 pod."],
    ["deleted=0", [], "There was no pod to delete."],
    ["deleted=some", [], undefined],
    [
      "pod=alex-rivera&reset",
      ["alex-rivera", "priya-natarajan"],
      "Reset: Alex Rivera and Priya Natarajan are back.",
    ],
    ["pod=alex-rivera", [], undefined],
  ] as const)
    assert.equal(said.didNote(new URLSearchParams(query), kits), note, query);
});

test("a table opens newest first, a row with no date last", () => {
  const section = said.SECTIONS.find(
    ({ question }: { question: string }) => question === LABS,
  );
  const rows = [
    { test: "Sodium" },
    { test: "Glucose", performed: "2024-03-01" },
    { test: "Potassium", performed: "2025-06-18T14:10:00-07:00" },
    { test: "Creatinine", performed: "2025-01-05" },
  ];
  assert.deepEqual(
    said.opening(section, rows).map(({ test }: { test: string }) => test),
    ["Potassium", "Creatinine", "Glucose", "Sodium"],
  );
});

test("a page of results is asked for by a whole number from 1, else the first", () => {
  assert.deepEqual(
    ["3", "", null, "0", "-2", "2.5", "x", "Infinity", "1e400", "1e20"].map(
      said.pageNumber,
    ),
    [3, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  );
});

test("a source is named by the words its tables share, and a table of its own is a source of its own", () => {
  const SOURCE = "urn:uuid:17cec5a9-071a-4179-9403-5c1e3886fb7d";
  const NAMES = {
    ...GROUPS,
    iri: "urn:uuid:f71f6797-48ec-4875-9b87-4cb1be1d9be0",
    label: "Example CVX names",
    source: SOURCE,
  };
  const groups = {
    ...GROUPS,
    label: "Example CVX vaccine groups",
    source: SOURCE,
  };
  const alone = { ...GROUPS, iri: "urn:uuid:0e2b", label: "Lone table" };
  assert.deepEqual(
    said
      .sourcesOf([NAMES, groups, alone])
      .map(
        ({
          iri,
          label,
          series,
        }: {
          iri: string;
          label: string;
          series: { iri: string }[];
        }) => [iri, label, series.length],
      ),
    [
      [SOURCE, "Example CVX", 2],
      ["urn:uuid:0e2b", "Lone table", 1],
    ],
  );
});

test("what a check did, in one note", () => {
  const checked = (fields: object) => ({
    feed: "https://f.example/feed.ttl",
    kept: [],
    refused: [],
    ...fields,
  });
  for (const [did, note] of [
    [[checked({})], "Checked the feeds: nothing new."],
    [
      [checked({ kept: ["ni:///v2"] })],
      "Kept Example vaccine groups, version 2, Oct 8, 2026.",
    ],
    [
      [checked({ later: "https://f.example/feed.ttl answered 503" })],
      "Not read now, tried again later: https://f.example/feed.ttl answered 503.",
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
    ],
  ] as const)
    assert.equal(said.checkedNote(did, [GROUPS]), note);
});

test("what a variant's page says: a sentence for each report, oldest first, tagged when it differs from the row ClinVar holds today, and one for what ClinVar says, in every state of its answer", () => {
  const martin = rows({
    classification: [concept("LikelyPathogenic"), concept("Pathogenic")],
    reviewStatus: concept("ClinVarMultipleSubmittersNoConflicts"),
    lastEvaluated: "2024-12-11",
    contributingSubmitters: 5,
  });
  const cases: [
    string,
    {
      reports?: unknown[];
      says?: unknown;
      verdicts?: unknown[];
      gene?: string;
      labels?: Map<string, string>;
      places?: Map<string, string>;
    },
    { sentence: string; tag?: string }[],
    string | undefined,
  ][] = [
    [
      "a report with its lab: its sentence names it, the year and the lab are kept apart, and a report of no lab says nothing of one",
      {
        reports: [
          report("r1", "UncertainSignificance", "2022-05-01"),
          report("r2", undefined, "2024-03-21"),
          report("r3", "Benign", undefined),
          report("r4", "Benign", "2023-01-01"),
        ],
        says: martin,
        verdicts: [verdict("r1", "differs")],
        places: new Map([
          ["r1", "Harbourline Genetics"],
          ["r2", "St Columba's Hospital"],
          ["r3", "Harbourline Genetics"],
        ]),
      },
      [
        {
          sentence:
            "Your 2022 report from Harbourline Genetics said uncertain significance.",
          tag: "Differs",
        },
        { sentence: "Your 2023 report said benign." },
        {
          sentence:
            "Your 2024 report from St Columba's Hospital gives no ACMG classification.",
        },
        {
          sentence: "An undated report from Harbourline Genetics said benign.",
        },
      ],
      "ClinVar today says pathogenic/likely pathogenic: criteria provided, multiple submitters, no conflicts, five contributing submitters.",
    ],
    [
      "Martin's page, in #138's words",
      {
        reports: [
          report("r2", "LikelyPathogenic", "2024-03-21"),
          report("r1", "UncertainSignificance", "2022-05-01"),
        ],
        says: martin,
        verdicts: [verdict("r1", "differs"), verdict("r2", "agrees")],
      },
      [
        {
          sentence: "Your 2022 report said uncertain significance.",
          tag: "Differs",
        },
        { sentence: "Your 2024 report said likely pathogenic." },
      ],
      "ClinVar today says pathogenic/likely pathogenic: criteria provided, multiple submitters, no conflicts, five contributing submitters.",
    ],
    [
      "a benign row both reports agree with, one contributing submitter",
      {
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
      [
        { sentence: "Your 2023 report said benign." },
        { sentence: "Your 2024 report said likely benign." },
      ],
      "ClinVar today says likely benign/benign: criteria provided, single submitter, one contributing submitter.",
    ],
    [
      "two reports of one year are named by their day, an undated one last, one with no classification says so",
      {
        reports: [
          report("r1", undefined, "2020-01-01"),
          report("r2", "Benign", undefined),
          report("r3", "UncertainSignificance", "2024-11-02"),
          report("r4", "Pathogenic", "2024-03-21"),
        ],
        says: {
          found: "not found",
          series: "urn:test:clinvar",
          version: VERSION,
        },
      },
      [
        { sentence: "Your 2020 report gives no ACMG classification." },
        { sentence: "Your Mar 21, 2024 report said pathogenic." },
        { sentence: "Your Nov 2, 2024 report said uncertain significance." },
        { sentence: "An undated report said benign." },
      ],
      "ClinVar, as this app holds it, has no row for this variant.",
    ],
    [
      "a verdict of another row or version, and every verdict but differs, adds no tag",
      {
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
      [2021, 2022, 2023, 2024].map((year) => ({
        sentence: `Your ${year} report said uncertain significance.`,
      })),
      "ClinVar today says pathogenic/likely pathogenic: criteria provided, multiple submitters, no conflicts, five contributing submitters.",
    ],
    [
      "a gene the series does not cover",
      {
        gene: "BRCA2",
        says: {
          found: "not covered",
          series: "urn:test:clinvar",
          version: VERSION,
          genes: ["EPCAM", "MLH1", "MSH2", "MSH6", "PMS2"],
        },
      },
      [],
      "ClinVar, as this app holds it, covers EPCAM, MLH1, MSH2, MSH6 and PMS2, not BRCA2.",
    ],
    [
      "no table held",
      { says: { found: "no series" } },
      [],
      "This app holds no ClinVar table.",
    ],
    [
      "the tables cannot say yet",
      { reports: [report("r1", "UncertainSignificance", "2022-01-01")] },
      [{ sentence: "Your 2022 report said uncertain significance." }],
      undefined,
    ],
    [
      "a report named by its concept's words when no label is known",
      {
        reports: [report("r1", "LikelyPathogenic", "2024-03-21")],
        labels: new Map(),
      },
      [{ sentence: "Your 2024 report said likely pathogenic." }],
      undefined,
    ],
    [
      "labs that disagree, with another word after it, and a count of twelve",
      {
        says: rows({
          classification: [
            concept("ClinVarConflicting"),
            concept("ClinVarRiskFactor"),
          ],
          reviewStatus: concept("ClinVarNoAssertionCriteria"),
          contributingSubmitters: 12,
        }),
      },
      [],
      "ClinVar today says labs that submit to ClinVar disagree; risk factor: no assertion criteria provided, 12 contributing submitters.",
    ],
    [
      "a sub-tier after the ACMG value, and no contributing submitters",
      {
        says: rows({
          classification: [
            concept("ClinVarVusHigh"),
            concept("UncertainSignificance"),
          ],
          contributingSubmitters: 0,
        }),
      },
      [],
      "ClinVar today says uncertain significance; VUS-high, no contributing submitters.",
    ],
    [
      "a classification only as part of a combination, and two submitters in words",
      {
        says: rows({
          classification: [concept("ClinVarCombinationOnly")],
          contributingSubmitters: 2,
        }),
      },
      [],
      "ClinVar today says classified only as part of a combination, two contributing submitters.",
    ],
    [
      "a row that counts submitters, not contributing ones",
      {
        says: rows({
          classification: [concept("UncertainSignificance")],
          submitters: 3,
        }),
      },
      [],
      "ClinVar today says uncertain significance, 3 submitters.",
    ],
    [
      "one submitter, and a row with no classification",
      {
        says: rows({
          reviewStatus: concept("ClinVarNoAssertionCriteria"),
          submitters: 1,
        }),
      },
      [],
      "ClinVar today gives no classification: no assertion criteria provided, one submitter.",
    ],
  ];
  for (const [name, input, reports, clinvar] of cases) {
    const variant = said.variantSaid({
      variant: { gene: input.gene, hgvs: [], variations: [] },
      reports: input.reports ?? [],
      says: input.says,
      verdicts: input.verdicts ?? [],
      labels: input.labels ?? LABELS,
      ...(input.places && { places: input.places }),
    });
    assert.deepEqual(
      variant.reports.map(
        ({ sentence, tag }: { sentence: string; tag?: string }) =>
          tag === undefined ? { sentence } : { sentence, tag },
      ),
      reports,
      name,
    );
    assert.equal(variant.clinvar, clinvar, name);
    for (const each of variant.reports)
      assert.equal(
        "when" in each,
        !each.sentence.includes("undated"),
        `${name}: an undated report has no when`,
      );
  }
});

test("a variation's classification is said as ClinVar's sentence", () => {
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

test("what the tables say of the codes a pod holds includes the ingredients those codes map to", async () => {
  const RX = "urn:test:rxnorm/";
  const answers = {
    "pod/My medication history": [
      { entry: "m1", medication: "Lisinopril", code: `${RX}314076` },
      { entry: "m2", medication: "Old", code: `${RX}1`, ended: "2024-01-01" },
    ],
  };
  const asked: string[][] = [];
  const tables = () => ({
    about: async (codes: string[]) => {
      asked.push(codes);
      return new Map(
        codes.map((code) => [
          code,
          code === `${RX}314076`
            ? { ingredients: { codes: [`${RX}29046`], origin: "urn:v" } }
            : { name: { label: "lisinopril", altLabels: [], origin: "urn:v" } },
        ]),
      );
    },
  });
  const about = await said.codesSaid(answers, { tables: tables() });
  assert.deepEqual(asked, [[`${RX}314076`, `${RX}1`], [`${RX}29046`]]);
  assert.equal(about.get(`${RX}1`).name.label, "lisinopril");
  assert.equal(about.get(`${RX}29046`).name.label, "lisinopril");
});

test("variantReports gives each variant entry a pod holds, those its questions list first and a variant only a report names last, with its reports apart from their sentences", () => {
  const found = said.variantReports(VARIANT_ANSWERS, VARIANTS_SAID, [CLINVAR]);
  assert.deepEqual([...found.keys()], ["v1", "orphan"]);
  const mlh1 = found.get("v1");
  assert.equal(mlh1.name, `MLH1 ${NAME}`);
  assert.deepEqual(mlh1.asked, {
    gene: "MLH1",
    hgvs: [NAME, "NM_000249.4:c.2042C>T"],
    variations: ["90011"],
  });
  assert.deepEqual(
    mlh1.reports.map(({ report, when, place, tag }: Record<string, string>) => [
      report,
      when,
      place,
      tag,
    ]),
    [
      ["r1", "2022", HARBOURLINE, DIFFERS],
      ["r2", "2024", COLUMBA, undefined],
    ],
  );
  assert.equal(mlh1.clinvar, "ClinVar today says pathogenic.");
  assert.deepEqual(mlh1.from, {
    series: CLINVAR,
    version: CLINVAR.versions[0],
  });
  const orphan = found.get("orphan");
  assert.equal(orphan.name, "NM_000500.1:c.1A>G");
  assert.deepEqual(orphan.asked, { hgvs: [], variations: [] });
  assert.deepEqual(orphan.reports, [
    { report: "r3", when: "2023", sentence: "Your 2023 report said benign." },
  ]);
  assert.equal(orphan.clinvar, undefined);
  assert.equal(orphan.from, undefined);
  const early = said.variantReports(VARIANT_ANSWERS).get("v1");
  assert.deepEqual(
    early.reports.map(({ tag }: { tag?: string }) => tag),
    [undefined, undefined],
  );
  assert.equal(early.clinvar, undefined);
});

test("a variant is named by ClinVar's name of the one variation its classification found, its page saying which table named it; one the classification found none for, found two variations for, or the names table has no row for, or whose names version is not held, keeps its gene and expression", async () => {
  const PROTEIN = "NM_000249.4(MLH1):c.2042C>T (p.Ala681Val)";
  const NAMES = { iri: "urn:test:names", versions: [{ iri: "ni:///names-1" }] };
  const name = { label: PROTEIN, altLabels: [], origin: "ni:///names-1" };
  const stem = codeStems.ClinVar;
  const answers = {
    [VARIANTS]: ["named", "unfound", "unnamed", "twofold"].map(
      (variant, at) => ({
        variant,
        gene: "MLH1",
        variation: String(at),
      }),
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
    variantClassification: async ({ variations }: { variations: string[] }) =>
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
          code === `${stem}0` ? { notation: "0", name } : { notation: "x" },
        ]),
      ),
  };
  const variants = await said.variantsSaid(answers, { tables, pod: undefined });
  const named = said.variantReports(answers, variants, [NAMES]);
  assert.deepEqual(
    [...named].map(([entry, { name }]) => [entry, name]),
    [
      ["named", PROTEIN],
      ["unfound", "MLH1"],
      ["unnamed", "MLH1"],
      ["twofold", "MLH1"],
    ],
  );
  const unheld = said.variantReports(
    answers,
    await said.variantsSaid(answers, {
      tables: { ...tables, held: async () => [] },
      pod: undefined,
    }),
    [],
  );
  assert.equal(unheld.get("named").name, "MLH1");
  assert.equal(unheld.get("named").namedFrom, undefined);
  assert.deepEqual(named.get("named").namedFrom, {
    series: NAMES,
    version: NAMES.versions[0],
  });
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

test("Ask about this: a click sends the kind's first question, and none for a kind it does not know", () => {
  for (const [context, question] of [
    [{ kind: "finding", key: "k" }, "What does this change show?"],
    [{ kind: "trend", test: "t" }, "What does this trend show?"],
    [{ kind: "entry", id: "e" }, "What is this, and where did it come from?"],
    [{ kind: "worth", entry: "e" }, "What does this flag mean?"],
    [{ kind: "other" }, undefined],
    [{ kind: "toString" }, undefined],
  ] as const)
    assert.equal(said.firstQuestion(context), question, context.kind);
});

test("suggested questions: Ines Calloway's find a change and ask about it named as the page names it, after the day her prescription was written, a pod with a Worth a look line and no change is offered it too, a pod's four at most keep the first and last in place, and the same answers give the same list", async () => {
  const story = (await storyPods()).get("story-statin")!;
  const [finding] = story.changes;
  const ines = said.suggestedQuestions(story.answers, {
    changes: story.changes,
  }) as string[];
  assert.deepEqual(ines, [
    "Find anything interesting in this pod",
    `Did ${finding!.test.name} change after ${finding!.medication.name} was prescribed?`,
  ]);
  assert.deepEqual(
    said.suggestedQuestions(story.answers, { changes: story.changes }),
    ines,
  );

  assert.deepEqual(
    said.suggestedQuestions(
      {
        [HISTORY]: [],
        [LABS]: [],
        [REVIEW]: [{ entry: "e1", needs: "judged different, still joined" }],
      },
      { changes: [] },
    ),
    ["Find anything interesting in this pod"],
  );

  const change = (n: number, dateIs: string) => ({
    kind: dateIs === "end of use" ? "after stop" : "after start",
    direction: "down",
    test: { code: `t${n}`, name: `Test ${n}` },
    medication: { code: `m${n}`, name: `Drug ${n}`, dateIs },
  });
  const many = said.suggestedQuestions(
    { [HISTORY]: [{ medication: "Drug 1", ended: "2024-05-01" }] },
    {
      changes: [
        change(1, "start of use"),
        change(2, "end of use"),
        change(3, "start of use"),
        change(4, "start of use"),
        { ...change(5, "start of use"), direction: "not enough results" },
      ],
    },
  );
  assert.deepEqual(many, [
    "Find anything interesting in this pod",
    "Did Test 1 change after Drug 1 started?",
    "Did Test 2 change after Drug 2 stopped?",
    "Which medications have I stopped?",
  ]);
  assert.deepEqual(said.suggestedQuestions({}, { changes: [] }), []);
});

test("the world's date: a calendar day is the end of that day in UTC, an instant stays as given, and anything else is none; it is said as the day the hospitals answer as of, and a pull's as the day it was pulled as of", () => {
  const instants: [string, string | undefined][] = [
    ["2024-02-01", "2024-02-01T23:59:59Z"],
    [" 2024-02-01 ", "2024-02-01T23:59:59Z"],
    ["2024-02-01T00:00:00Z", "2024-02-01T00:00:00Z"],
    ["2024-02-01T10:00:00+02:00", "2024-02-01T10:00:00+02:00"],
    ["", undefined],
    ["2024-02-30", undefined],
    ["2024-13-01", undefined],
    ["2024-02-01T10:00:00", undefined],
    ["0099-01-01", undefined],
    ["0999-12-31T23:59:59Z", undefined],
    ["1000-01-01", "1000-01-01T23:59:59Z"],
    ["yesterday", undefined],
  ];
  for (const [text, instant] of instants)
    assert.equal(said.worldInstant(text), instant, JSON.stringify(text));
  assert.equal(
    said.utcInstant("2024-02-01T09:00:00+02:00"),
    "2024-02-01T07:00:00Z",
    "a world date with an offset is saved in UTC, which pull.json requires",
  );
  assert.equal(said.utcInstant(undefined), undefined);

  assert.equal(
    said.worldDateSaid("2024-02-01T23:59:59Z"),
    "Hospitals answer as of 1 February 2024.",
  );
  assert.equal(
    said.worldDateSaid(undefined),
    "Hospitals answer with everything they hold.",
  );
  assert.equal(
    said.worldDateSaid("2024-02-01T00:30:00+01:00"),
    "Hospitals answer as of 31 January 2024.",
  );
  assert.equal(
    said.pulledAsOfSaid("2024-02-01T23:59:59Z"),
    "Pulled as of 1 February 2024.",
  );
  assert.equal(said.pulledAsOfSaid(undefined), undefined);
});
