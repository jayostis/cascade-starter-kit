import assert from "node:assert/strict";
import { loadStories } from "@the-cascade-protocol/sandbox/node";
import {
  changesIn,
  type Finding,
  type Pod,
  type Row,
  type Terms,
  terms,
} from "cascade-runtime";
import { copiesFolder, removedCopy, storyPodIn } from "./built-pods.js";

export const said = await import(
  new URL("../../app/said.ts", import.meta.url).href
);

export const ALLERGIES = "pod/My active allergies";
export const CONDITIONS = "pod/My active conditions";
export const LABS = "pod/My lab results";
export const MEDICATIONS = "pod/My medication history";
export const HISTORY = "pod/My medication history";
export const SEEN = "pod/What was seen more than once";
export const REVIEW = "entry/What needs review";
export const SOURCES = "entry/Where it came from";
export const VARIANTS = "pod/My genetic variants";
export const REPORTS = "pod/What each report says of a variant";

export const GROUPS = {
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

const ACMG_LABELS = {
  Pathogenic: "Pathogenic",
  LikelyPathogenic: "Likely pathogenic",
  UncertainSignificance: "Uncertain significance",
  LikelyBenign: "Likely benign",
  Benign: "Benign",
} as const;
const CLINVAR_LABELS = {
  ClinVarConflicting: "Conflicting classifications of pathogenicity",
  ClinVarConflictingData: "conflicting data from submitters",
  ClinVarCombinationOnly: "-",
  ClinVarVusHigh: "VUS-high",
  ClinVarRiskFactor: "risk factor",
  ClinVarMultipleSubmittersNoConflicts:
    "criteria provided, multiple submitters, no conflicts",
  ClinVarSingleSubmitter: "criteria provided, single submitter",
  ClinVarNoAssertionCriteria: "no assertion criteria provided",
} as const;
const CONCEPTS: Record<string, string> = {
  ...ACMG_LABELS,
  ...CLINVAR_LABELS,
};
export const concept = (name: string) => {
  assert.ok(name in CONCEPTS, name);
  return { iri: terms[name as keyof Terms] as string, label: CONCEPTS[name] };
};
export const LABELS = new Map(
  Object.entries(ACMG_LABELS).map(([name, label]) => [
    terms[name as keyof typeof ACMG_LABELS],
    label,
  ]),
);
export const VERSION = "ni:///clinvar-1";
export const ROW = "http://www.ncbi.nlm.nih.gov/clinvar/90011";
export const rows = (fields: Record<string, unknown>) => ({
  found: "rows",
  series: "urn:test:clinvar",
  version: VERSION,
  rows: [{ variation: ROW, classification: [], ...fields }],
});
export const report = (
  id: string,
  classification: string | undefined,
  date: string | undefined,
) => ({
  report: id,
  variant: "v1",
  ...(classification === undefined
    ? {}
    : { classification: terms[classification as keyof Terms] as string }),
  ...(date === undefined ? {} : { date }),
});
export const verdict = (reportId: string, said: string, extra = {}) => ({
  report: reportId,
  row: ROW,
  origin: VERSION,
  verdict: said,
  ...extra,
});

export const DIFFERS = "Differs";
export const HARBOURLINE = "Harbourline Genetics";
export const COLUMBA = "St Columba's Hospital";
export const CLINVAR = {
  iri: "urn:test:clinvar",
  label: "ClinVar variant classifications",
  credit:
    "ClinVar, NCBI. Not intended for direct diagnostic use or medical decision-making without review by a genetics professional.",
  versions: [{ iri: VERSION, label: "1", issued: "2026-10-01" }],
};
export const entryRow = (
  entry: string,
  label: string,
  record: string,
  document: string,
  extra: object,
) => ({
  entry,
  entryLabel: label,
  record,
  document,
  importLabel: "FHIR pull",
  ...extra,
});
export const NAME = "NM_000249.3:c.2042C>T";
/**
 * One variant entry kept from two labs, a report of it from each, and a report whose variant only the reports name,
 * which has no lab.
 */
export const VARIANT_ANSWERS = {
  [ALLERGIES]: [{ entry: "e1", allergen: "Penicillin" }],
  [VARIANTS]: [
    { variant: "v1", gene: "MLH1", hgvs: NAME },
    { variant: "v1", gene: "MLH1", hgvs: "NM_000249.4:c.2042C>T" },
    { variant: "v1", gene: "MLH1", variation: "90011" },
  ],
  [REPORTS]: [
    report("r1", "UncertainSignificance", "2022-05-01"),
    report("r2", "LikelyPathogenic", "2024-03-21"),
    { ...report("r3", "Benign", "2023-01-01"), variant: "orphan" },
  ],
  [SEEN]: [HARBOURLINE, COLUMBA].map((place) => ({
    entry: "v1",
    place,
    records: "1",
    places: "2",
  })),
  [SOURCES]: [
    entryRow("v1", `Variant entry · ${NAME}`, "v1-a", "doc-2022", {
      hospital: HARBOURLINE,
      arrived: "2026-09-01T10:00:00Z",
    }),
    entryRow("v1", `Variant entry · ${NAME}`, "v1-b", "doc-2024", {
      hospital: COLUMBA,
      arrived: "2026-09-02T10:00:00Z",
    }),
    entryRow("r1", "Interpretation entry · VUS", "r1-a", "doc-2022", {
      hospital: HARBOURLINE,
      arrived: "2026-09-01T10:00:00Z",
    }),
    entryRow("r2", "Interpretation entry · LP", "r2-a", "doc-2024", {
      hospital: COLUMBA,
      arrived: "2026-09-02T10:00:00Z",
    }),
    entryRow("r3", "Interpretation entry · Benign", "r3-a", "doc-other", {}),
    entryRow(
      "orphan",
      "Variant entry · NM_000500.1:c.1A>G",
      "o-a",
      "doc-other",
      {},
    ),
  ],
};
export const VARIANTS_SAID = {
  says: new Map([["v1", rows({ classification: [concept("Pathogenic")] })]]),
  verdicts: [verdict("r1", "differs")],
  labels: LABELS,
};

export interface Story {
  pod: Pod;
  answers: Record<string, Row[]>;
  changes: Finding[];
}

let built: Promise<Map<string, Story>> | undefined;
let copies: string | undefined;

/** The five story patients' pods, brought in from North once and shared by the tests that need them. */
export function storyPods(): Promise<Map<string, Story>> {
  built ??= (async () => {
    const parent = await copiesFolder();
    copies = parent;
    const patients = await loadStories();
    return new Map(
      await Promise.all(
        patients.map(async ({ patient }) => {
          const pod = await storyPodIn(parent, patient);
          const answers = Object.fromEntries(
            await Promise.all(
              (said.QUESTIONS as string[]).map(
                async (question) =>
                  [question, await pod.ask(question)] as const,
              ),
            ),
          );
          const story: Story = {
            pod,
            answers,
            changes: changesIn(answers[HISTORY]!, answers[LABS]!, {
              limit: 20,
            }),
          };
          return [patient, story] as const;
        }),
      ),
    );
  })();
  return built;
}

/** Closes the story pods, if a test opened them. */
export async function closeStoryPods(): Promise<void> {
  for (const { pod } of (await built)?.values() ?? []) await pod.close();
  if (copies !== undefined) await removedCopy(copies);
}
