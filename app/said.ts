// What a pod's page says, as data: the sections and their rows, the names, dates and sentences the pages draw, from a
// pod's question rows and what the tables answer. Plain functions with no imports, which the view, PodApi, the chat,
// MCP and the tests all read, in Node and in a browser alike.

/** A question's row: each variable it binds, as text. */
export type Row = Readonly<Record<string, string>>;
/** A row a section shows: a question's row, or one a section builds, with its tags and, for a variant, its reports. */
export type SectionRow = Row & {
  readonly tags?: readonly string[];
  readonly reports?: number;
};
/** The rows of each question, by question. */
export type Answers = Readonly<Record<string, readonly Row[]>>;

/** A name the tables give a code, and the table version that gave it. */
export interface Naming {
  readonly label: string;
  readonly altLabels: readonly string[];
  readonly origin: string;
}
/** What the tables' `about` says of a code. */
export interface About {
  readonly notation?: string;
  readonly name?: Naming;
  readonly status?: {
    readonly deprecated: boolean;
    readonly replacedBy: readonly string[];
    readonly origin: string;
  };
  readonly ingredients?: {
    readonly codes: readonly string[];
    readonly origin: string;
  };
}
/** What the tables' `about` answers, by code. */
export type Abouts = ReadonlyMap<string, About>;

/** A version of a reference series. */
export interface Version {
  readonly iri: string;
  readonly label?: string;
  readonly issued?: string;
}
/** A held reference series, as the tables' `held()` gives it. */
export interface Series {
  readonly iri: string;
  readonly label: string;
  readonly source?: string;
  readonly credit?: string;
  readonly publisher?: string;
  readonly publisherName?: string;
  readonly licence?: string;
  readonly current: Version;
  readonly versions: readonly Version[];
  readonly watched?: { readonly at: string; readonly found: string };
  readonly checked?: string;
  readonly modified?: string;
}
/** A held series and the version of it that something came from. */
export interface HeldAt {
  readonly series: Series;
  readonly version: Version;
}
/** A source of the held series, as `sourcesOf` gives it. */
export interface Source {
  readonly iri: string;
  readonly label: string;
  readonly series: readonly Series[];
}

/** What a column of a section's table sorts and shows. */
export type ColumnType = "text" | "date" | "number";
/** A column of a section's table: its heading, what a cell shows, and what the column sorts by. */
export interface Column {
  readonly head: string;
  readonly type: ColumnType;
  key(row: SectionRow): string | number | undefined;
  show(row: SectionRow): string;
  warm?(row: SectionRow): boolean;
  readonly tag?: boolean;
}
/** A tile of a pod's page, as `SECTIONS` holds them. */
export interface Section {
  readonly title: string;
  readonly one: string;
  readonly question?: string;
  readonly field: string;
  readonly codes: readonly string[];
  shows?(row: SectionRow): boolean;
  current?(row: SectionRow): boolean;
  rows?(answers: Answers, said?: VariantsSaid): SectionRow[];
  readonly columns: readonly Column[];
  readonly sortBy: number;
  readonly newestFirst?: boolean;
}

/** A line of Worth a look. */
export interface Line {
  readonly sentence: string;
  readonly entry: string;
  readonly tag?: string;
}

/** A row of a variant classifications table, as the tables' `variantClassification` gives it. */
export interface ClassificationRow {
  readonly variation: string;
  readonly classification: readonly {
    readonly iri: string;
    readonly label: string;
  }[];
  readonly reviewStatus?: { readonly label: string };
  readonly contributingSubmitters?: number;
  readonly submitters?: number;
  readonly series?: string;
  readonly version?: string;
}
/** What the tables' `variantClassification` says of one variant. */
export type Classification =
  | {
      readonly found: "rows";
      readonly rows: readonly ClassificationRow[];
      readonly version: string;
      readonly series?: string;
    }
  | {
      readonly found: "not found";
      readonly version?: string;
      readonly series?: string;
    }
  | {
      readonly found: "not covered";
      readonly genes: readonly string[];
      readonly version?: string;
      readonly series?: string;
    }
  | {
      readonly found: "no table";
      readonly version?: undefined;
      readonly series?: undefined;
    };
/** A verdict of `pod.agreement()`. */
export interface Verdict {
  readonly report: string;
  readonly row: string;
  readonly origin: string;
  readonly verdict: string;
}
/** A variant as the tables' `variantClassification` is asked of it. */
export interface VariantAsked {
  hgvs: string[];
  variations: string[];
  gene?: string;
}
/** `variantsSaid`'s answer. */
export interface VariantsSaid {
  readonly says: ReadonlyMap<string, Classification>;
  readonly verdicts: readonly Verdict[];
  readonly labels: ReadonlyMap<string, string>;
  readonly names: ReadonlyMap<string, Naming>;
}
/** A report of a variant, as `variantSaid` says it. */
export interface ReportSaid {
  readonly report: string;
  readonly when?: string;
  readonly place?: string;
  readonly sentence: string;
  readonly tag?: string;
}
/** A variant entry, as `variantReports` gives it. */
export interface VariantReport {
  readonly name: string;
  readonly asked: VariantAsked;
  readonly reports: readonly ReportSaid[];
  readonly clinvar: string | undefined;
  readonly from?: HeldAt;
  readonly namedFrom?: HeldAt;
}

/** What the tables are asked by these functions. */
export interface Tables {
  about(codes: readonly string[]): Promise<Map<string, About>>;
  variantClassification(asked: VariantAsked): Promise<Classification>;
  labels(iris: readonly string[]): Promise<Map<string, string>>;
  held(): Promise<readonly Series[]>;
  inPanels(code: string): Promise<readonly InPanels[]>;
  classedElsewhere(
    codes: readonly string[],
  ): Promise<Map<string, readonly string[]>>;
}
/** What a pod is asked by these functions. */
export interface Pod {
  agreement(): Promise<readonly Verdict[]>;
  joinedBy(): Promise<readonly { entry: string; used: string }[]>;
}
/** The panels one held version lists a test in, as the tables' `inPanels` gives them. */
export interface InPanels {
  readonly version: string;
  readonly total: number;
  readonly panels: readonly {
    readonly code: string;
    readonly notation?: string;
    readonly required?: string;
    readonly about?: About;
  }[];
}

/** A test or a medication of a finding. */
export interface Coded {
  readonly code?: string;
  readonly name?: string;
  readonly notation?: string;
}
/** What was left out of a finding's means or a test's results. */
export interface Left {
  readonly unparsed?: number;
  readonly otherUnit?: number;
  readonly undated?: number;
}
/** A change after a medication started or stopped, as `changesIn` gives it. */
export interface Finding {
  readonly key: string;
  readonly kind: string;
  readonly direction: string;
  readonly unit: string;
  readonly before: { readonly mean: number; readonly count: number };
  readonly after: { readonly mean: number; readonly count: number };
  readonly left: Left;
  readonly rows: {
    readonly before: readonly Row[];
    readonly after: readonly Row[];
    readonly left: readonly Row[];
  };
  readonly test: Coded & { readonly code: string };
  readonly medication: Coded & {
    readonly entry?: string;
    readonly date: string;
  };
}
/** A trend's test and medication, as an address names them. */
export interface TrendAsked {
  readonly test: string;
  readonly medication?: string;
}
/** A medication of `timelineIn`'s answer. */
export interface Timed extends Coded {
  readonly started?: string;
  readonly ended?: string;
}
/** A medication as the trend draws it, from `therapiesOf`. */
export interface Therapy {
  key: string;
  name: string;
  code?: string;
  started?: string;
  ended?: string;
}
/** A point of a chart: a day, as a time, and a value. */
export interface Point {
  readonly time: number;
  readonly value: number;
}
/** A day marked across a chart. */
export interface Mark {
  readonly time: number;
  readonly kind: string;
  readonly text: string;
}
/** The size of a chart. */
export interface Size {
  readonly width: number;
  readonly height: number;
  readonly margin: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  readonly radius: number;
}
/** Where times and values fall in a chart, as `plotOf` gives it. */
export interface Plot extends Size {
  readonly from: number;
  readonly to: number;
  readonly low: number;
  readonly high: number;
  x(time: number): number;
  y(value: number): number;
}

/** A pull, as `howOf` lists it. */
export interface Pull {
  readonly label: string;
  readonly started: string;
  readonly hospital?: string;
  readonly retrieved?: string;
  readonly asOf?: string;
  readonly brought: number;
  readonly revised: number;
}
/** What differs between two versions of a record. */
export interface Difference {
  readonly field: string;
  readonly before: readonly string[];
  readonly after: readonly string[];
}
/** An arrival of a new version of a medication's record. */
export interface Step {
  readonly from: number;
  readonly to: number;
  readonly pull: number;
  readonly arrived: string;
  readonly asOf?: string;
  readonly said: readonly Difference[];
}
/** `howOf`'s answer. */
export interface How {
  readonly pulls: readonly Pull[];
  readonly revisions: readonly {
    readonly finding: Finding;
    readonly steps: readonly Step[];
  }[];
}

/** A hospital as the demo people's lists hold it. */
export interface Hospital {
  readonly name: string;
  readonly fhirBase: string;
}
/** A demo person, as `demoPeople` gives them. */
export interface Person {
  readonly name: string;
  readonly family: string;
  readonly given: string;
  readonly at: Hospital[];
}
/** A FHIR HumanName. */
export interface HumanName {
  readonly use?: string;
  readonly family?: string;
  readonly given?: readonly string[];
}
/** A FHIR Bundle, as far as these functions read it. */
export interface Bundle {
  readonly entry?: readonly {
    readonly resource?: {
      readonly resourceType?: string;
      readonly name?: readonly HumanName[];
      readonly birthDate?: string;
    };
    readonly response?: { readonly lastModified?: string };
  }[];
}

/** A line of what else is known of an entry. */
export interface Known {
  readonly sentence?: string;
  readonly tag?: string;
  readonly from?: HeldAt;
  readonly fromLead?: string;
}
/** A line of where an entry came from. */
export interface Where {
  place: string;
  issued?: string;
  retrieved?: string;
  arrived?: string;
  importLabel?: string;
  records: number;
}
/** An entry as its page reads it, as `entryOf` gives it. */
export interface Entry {
  readonly entry: string;
  readonly name: string;
  readonly kind: string;
  readonly tags: readonly string[];
  readonly what: readonly { readonly head: string; readonly text: string }[];
  readonly recorded?: string;
  readonly codes: readonly {
    readonly notation: string;
    readonly series?: Series;
  }[];
  readonly testCodes?: readonly string[];
  readonly where: readonly Where[];
  readonly known: readonly Known[];
  readonly credits: readonly string[];
}

/** The paths of an operation's output that hold a `Map` as `[key, value]` pairs. */
const MAPPED = ["about", "joined", "elsewhere", "classes", "panelAbout"];
const MAPPED_SAID = ["says", "labels", "names"];

type Pairs = Iterable<readonly [unknown, unknown]>;

/** An operation's `output` with each of its pairs a `Map` again, as the view takes them. */
export function maps(
  output: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = { ...output };
  for (const key of MAPPED)
    if (output[key] !== undefined) mapped[key] = new Map(output[key] as Pairs);
  if (output.said !== undefined) {
    const said = output.said as Readonly<Record<string, unknown>>;
    mapped.said = { ...said };
    for (const key of MAPPED_SAID)
      if (said[key] !== undefined)
        (mapped.said as Record<string, unknown>)[key] = new Map(
          said[key] as Pairs,
        );
  }
  return mapped;
}

/** A column of a section's table: its heading, what a cell shows, and what the column sorts by. */
const text = (head: string, of: (row: SectionRow) => string): Column => ({
  head,
  type: "text",
  key: of,
  show: of,
});
const date = (head: string, of: (row: SectionRow) => string): Column => ({
  head,
  type: "date",
  key: of,
  show: (row) => day(of(row)),
});
const number = (
  head: string,
  of: (row: SectionRow) => string | number | undefined,
): Column => ({
  head,
  type: "number",
  key: of,
  show: (row) => rounded(of(row)),
});

const SEVERITY: Readonly<Record<string, string>> = {
  high: "High severity",
  low: "Low severity",
};

export const REC = "https://ns.cascadeprotocol.org/records/v1-draft#";
const ACTIVE = `${REC}MedicationActive`;
const STOPPED = `${REC}MedicationStopped`;
const UNKNOWN = `${REC}MedicationUnknown`;
const ENTERED_IN_ERROR = `${REC}MedicationEnteredInError`;

/**
 * The lifecycle classes of rule L1 a person is shown, in the order the Medications table opens in, each with its word.
 * A medication of any but the last is current. Entered in error is not among them: such a medication is not shown.
 */
const LIFECYCLES = [
  [ACTIVE, "Active"],
  [`${REC}MedicationPaused`, "Paused"],
  [UNKNOWN, "Unknown"],
  [STOPPED, "Stopped"],
].map(([lifecycle, said], order) => ({ lifecycle, said, order }));

/** A medication row's lifecycle class, as `LIFECYCLES` holds it: unknown when the row states none. */
const lifecycleOf = (row: SectionRow) =>
  LIFECYCLES.find(({ lifecycle }) => lifecycle === row.lifecycle) ??
  LIFECYCLES.find(({ lifecycle }) => lifecycle === UNKNOWN)!;

const isCurrent = (row: SectionRow) => lifecycleOf(row).lifecycle !== STOPPED;

/**
 * A medication's status in a person's words: its lifecycle class, with the day it stopped, or, for one not stopped
 * that states an end, the day it runs until.
 */
function medicationStatus(row: SectionRow): string {
  const { lifecycle, said } = lifecycleOf(row);
  if (row.ended === undefined) return said;
  return lifecycle === STOPPED
    ? `${said} ${day(row.ended)}`
    : `${said}, until ${day(row.ended)}`;
}

/**
 * One tile for each of these questions, in this order: its title, what one of its rows is called, the column of the
 * record's own name for it, the columns holding its codes in the order a name is taken from them, the table's columns,
 * the column the table opens sorted by, and whether it opens with the newest first; and, for a section that has them,
 * which of its question's rows it shows and which of those are current, the tile counting and naming the current ones.
 */
export const SECTIONS: readonly Section[] = [
  {
    title: "Allergies",
    one: "allergy",
    question: "pod/My active allergies",
    field: "allergen",
    codes: ["code"],
    columns: [
      text("Allergen", (row) => row.allergen),
      {
        head: "Severity",
        type: "number",
        key: (row) =>
          String(
            row.criticality === undefined
              ? 4
              : (({ high: 1, low: 2 } as Readonly<Record<string, number>>)[
                  row.criticality
                ] ?? 3),
          ),
        show: (row) =>
          row.criticality === undefined
            ? ""
            : (SEVERITY[row.criticality] ??
              row.criticality.replaceAll("-", " ")),
        warm: (row) => row.criticality === "high",
        tag: true,
      },
    ],
    sortBy: 1,
  },
  {
    title: "Medications",
    one: "medication",
    question: "pod/My medication history",
    field: "medication",
    codes: ["code"],
    shows: (row) => row.lifecycle !== ENTERED_IN_ERROR,
    current: isCurrent,
    columns: [
      text("Medication", (row) => row.medication),
      {
        head: "Status",
        type: "text",
        key: (row) =>
          `${lifecycleOf(row).order} ${isCurrent(row) ? "" : (row.ended ?? "")} ${row.medication ?? ""}`,
        show: medicationStatus,
      },
      date("Since", (row) => row.started),
    ],
    sortBy: 1,
  },
  {
    title: "Conditions",
    one: "condition",
    question: "pod/My active conditions",
    field: "condition",
    codes: ["icd10", "snomed"],
    columns: [
      text("Condition", (row) => row.condition),
      date("Since", (row) => row.onset),
    ],
    sortBy: 0,
  },
  {
    title: "Lab results",
    one: "lab result",
    question: "pod/My lab results",
    field: "test",
    codes: ["code"],
    columns: [
      text("Test", (row) => row.test),
      number("Value", (row) => row.value),
      text("Unit", (row) => row.unit),
      date("Date", (row) => row.performed),
    ],
    sortBy: 3,
    newestFirst: true,
  },
  {
    title: "Immunizations",
    one: "immunization",
    question: "pod/My immunizations",
    field: "vaccine",
    codes: ["code"],
    columns: [
      text("Vaccine", (row) => row.vaccine),
      date("Date", (row) => row.given),
    ],
    sortBy: 1,
    newestFirst: true,
  },
  {
    title: "Procedures",
    one: "procedure",
    question: "pod/My procedures",
    field: "procedure",
    codes: ["snomed"],
    columns: [
      text("Procedure", (row) => row.procedure),
      date("Date", (row) => row.performed),
    ],
    sortBy: 1,
    newestFirst: true,
  },
  {
    title: "Genetic variants",
    one: "variant",
    field: "variant",
    codes: [],
    rows: variantRows,
    columns: [
      text("Variant", (row) => row.variant),
      number("Reports", (row) => row.reports),
    ],
    sortBy: 0,
  },
];

export const SOURCES = "entry/Where it came from";
export const REVIEW = "entry/What needs review";

export const DIFFERS = "Differs";
export const NEEDS_REVIEW = "Needs review";
const RETIRED = "Retired code";

/** The one set of tags a line, a row and an entry share, in the order they are drawn, and whether each is warm. */
export const TAGS = [
  { tag: DIFFERS, warm: true },
  { tag: NEEDS_REVIEW, warm: true },
  { tag: RETIRED, warm: false },
];

/** The tags that hold, in `TAGS` order. */
export function tagsOf({
  differs = false,
  review = false,
  retired = false,
}: {
  differs?: boolean;
  review?: boolean;
  retired?: boolean;
}): string[] {
  const holds: Readonly<Record<string, boolean>> = {
    [DIFFERS]: differs,
    [NEEDS_REVIEW]: review,
    [RETIRED]: retired,
  };
  return TAGS.filter(({ tag }) => holds[tag]).map(({ tag }) => tag);
}

/** The entries `answers` say need review. */
export const reviewed = (answers: Answers) =>
  new Set((answers[REVIEW] ?? []).map((row) => row.entry));

const SEEN = "pod/What was seen more than once";
export const VARIANTS = "pod/My genetic variants";
export const REPORTS = "pod/What each report says of a variant";
export const HISTORY = "pod/My medication history";
export const MEDICATIONS = "pod/My active medications";
export const LABS = "pod/My lab results";
const IMPORTS = "pod/What each import brought in";
const REVISIONS = "record/Its revisions, in the order they arrived";
const VERSIONS = "record/What each version says";

/** The questions only the mechanism under What changed reads: see `withMechanism`. */
export const MECHANISM = [REVISIONS, VERSIONS];

/** Every question `podPage` reads: ask each, and hand it the rows by question. */
export const QUESTIONS = [
  ...new Set([
    SOURCES,
    SEEN,
    REVIEW,
    VARIANTS,
    REPORTS,
    HISTORY,
    IMPORTS,
    ...SECTIONS.flatMap(({ question }) => question ?? []),
  ]),
];

/**
 * The rows of `section` in `answers`: the only way a section's rows are read. A section with `rows` builds them from
 * several questions and `said` (`variantsSaid`'s answer, none until the tables can say) rather than from one.
 */
export function sectionRows(
  section: Section,
  answers: Answers,
  said?: VariantsSaid,
): readonly SectionRow[] {
  if (section.rows !== undefined) return section.rows(answers, said);
  const rows = answers[section.question!] ?? [];
  return section.shows === undefined ? rows : rows.filter(section.shows);
}

export const isCode = (code: string | undefined): code is string =>
  /^[a-z][a-z\d+.-]*:/i.test(code ?? "");

/**
 * The codes the sections' rows in `answers`, and every row of the medication history, hold, each once: what to ask the
 * tables' `about` of. The Medications section is the history less the medications entered in error, and the change
 * cards name their medication by any row of it.
 */
export function codesOf(answers: Answers): string[] {
  const codes = [
    ...SECTIONS.flatMap((section) =>
      sectionRows(section, answers).flatMap((row) =>
        section.codes.map((column) => row[column]),
      ),
    ),
    ...(answers[HISTORY] ?? []).map((row) => row.code),
  ];
  return [...new Set(codes.filter(isCode))];
}

/**
 * What the tables' `about` makes of a row of `section`: `label`, the name of the first of its codes `about` names,
 * `origin`, the version of the table that named it, and `retired`, whether the code that named it, or with none the first
 * of its codes with a status, is retired.
 */
function namingOf(section: Section, row: SectionRow, about: Abouts) {
  const said = section.codes.map((column) => about.get(row[column]));
  const naming = said.find((each) => each?.name !== undefined);
  return {
    label: naming?.name!.label,
    origin: naming?.name!.origin,
    retired:
      statusOf(naming ?? said.find((each) => each?.status !== undefined)) !==
      "",
  };
}

/**
 * The credit each series asks for that named a row of the sections in `answers` (by `about`), once, among `held`: a
 * credit travels with what a table says, and a series whose names a page shows is one of them.
 */
export function namingCredits(
  answers: Answers,
  about: Abouts,
  held: readonly Series[],
): string[] {
  const origins = SECTIONS.flatMap((section) =>
    section.question === undefined || answers[section.question] === undefined
      ? []
      : sectionRows(section, answers).flatMap((row) => {
          const { origin } = namingOf(section, row, about);
          return origin === undefined ? [] : [origin];
        }),
  );
  return [
    ...new Set(
      [...new Set(origins)].flatMap(
        (origin) => heldAt(origin, held)?.series.credit ?? [],
      ),
    ),
  ];
}

/**
 * The sections' rows in `answers`, each named by the first of its codes `about` (the tables' `about`) names, else by
 * the record's own text, and `tags` when it has any: `Retired code` when the code that named it, or with none the first
 * of its codes with a status, is retired, and `Needs review` when What needs review names its entry.
 */
export function named(
  answers: Answers,
  about: Abouts,
): Record<string, readonly SectionRow[]> {
  const renamed: Record<string, readonly SectionRow[]> = { ...answers };
  const review = reviewed(answers);
  for (const section of SECTIONS) {
    if (
      section.question === undefined ||
      answers[section.question] === undefined
    )
      continue;
    renamed[section.question] = sectionRows(section, answers).map((row) => {
      const { label, retired } = namingOf(section, row, about);
      const tags = tagsOf({ retired, review: review.has(row.entry) });
      return {
        ...row,
        ...(label !== undefined && { [section.field]: label }),
        ...(tags.length > 0 && { tags }),
      } as SectionRow;
    });
  }
  return renamed;
}

/**
 * What the tables say of the codes `answers` hold, as the tables' `about` answers (`tables` is the tables), and of the
 * ingredients those codes map to, which the sentences that name an ingredient need. An ingredient the tables cannot say
 * is left unnamed; the codes' own answer failing throws.
 */
export async function codesSaid(
  answers: Answers,
  { tables }: { tables: Pick<Tables, "about"> },
): Promise<Map<string, About>> {
  const about = await tables.about(codesOf(answers));
  const ingredients = new Set(
    [...about.values()].flatMap((each) => each.ingredients?.codes ?? []),
  );
  for (const [code, said] of await tables.about(
    [...ingredients].filter((code) => !about.has(code)),
  ))
    about.set(code, said);
  return about;
}

/** A measurement to three significant figures, as a lab report gives it: `60.967166` is `61`, `4.7055` is `4.71`. */
export function rounded(value: string | number | undefined): string {
  if (value === undefined) return "";
  const n = Number(value);
  return String(value).trim() !== "" && Number.isFinite(n)
    ? String(Number(n.toPrecision(3)))
    : String(value);
}

/** A date or a time, as the day it fell on where it was written: `Apr 22, 2025`. */
export function day(text: string | undefined): string {
  if (text === undefined) return "";
  const date = new Date(`${String(text).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? String(text)
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
}

/**
 * A time of the app's clock, as the day it fell on where the page is drawn: the person's own day. A date with no time
 * is said as written, as `day` says it.
 */
export function localDay(text: string | undefined): string {
  if (text === undefined || !/T\d\d:\d\d/.test(String(text))) return day(text);
  const date = new Date(Date.parse(String(text)));
  return Number.isNaN(date.getTime())
    ? String(text)
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

/**
 * How two cells compare, by what they sort by: numbers and dates by value, and text as text. A cell with nothing to
 * sort by, or what is no number or date, comes after every other. The page's script runs this same function.
 */
export function compare(type: string, a: string, b: string): number {
  if (type === "text")
    return a === "" || b === ""
      ? Number(a === "") - Number(b === "")
      : a.localeCompare(b);
  const value = (key: string) => {
    const n =
      key === "" ? NaN : type === "date" ? Date.parse(key) : Number(key);
    return Number.isNaN(n) ? Infinity : n;
  };
  const [x, y] = [value(a), value(b)];
  return x === y ? 0 : x < y ? -1 : 1;
}

/** `a`, `a and b`, `a, b and c`. */
export function listed(items: readonly string[]): string {
  return items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * A pod's name made from a person's: `Rowan Ellery Marsh` is `rowan-ellery-marsh`, `Zoë` is `zoe`. Empty when it has
 * no letter from a to z and no digit.
 */
export function slug(person: string): string {
  return String(person)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
}

/** The titles pods were made under, by pod name. */
export type Titles = ReadonlyMap<string, string | undefined>;

/** The title `titles` holds for a pod, as typed, when `slug` of it is the pod's name; else undefined. */
export function typedName(pod: string, titles?: Titles): string | undefined {
  const typed = titles?.get(pod)?.trim().replace(/\s+/g, " ");
  return typed !== undefined && typed !== pod && slug(typed) === pod
    ? typed
    : undefined;
}

/**
 * A pod's name as a person's: the title it was made under (`typedName`); else, and where the title is the pod's name
 * itself, as a pod made without one keeps, the pod's name capitalised: `rowan-ellery-marsh` is `Rowan Ellery Marsh`.
 */
export function personName(pod: string, titles?: Titles): string {
  return (
    typedName(pod, titles) ??
    pod
      .split(/[-_.]+/)
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ")
  );
}

/** A hospital's name as a person says it: `Cascade North Demo Hospital` is `Cascade North`. */
export function hospitalName(name: string): string {
  return name.replace(/ Demo Hospital$/, "");
}

/** Where a row of "Where it came from" came from, as a person would say it: see `placeName`. */
export function placeOf(row: Row): string {
  return placeName(row.hospital ?? row.importLabel);
}

/**
 * A place records came from, a hospital's name or an import's label, as a person would say it: the hospital without
 * " Demo Hospital", the person's own entries (`entered by Alex …` is "Alex's own entries", `entered by the person` is
 * "Own entries"), or how it arrived, without " export".
 */
export function placeName(place = ""): string {
  if (place.startsWith("entered by ")) {
    const name = /^entered by (\p{Lu}\S*)/u.exec(place)?.[1];
    return name === undefined ? "Own entries" : `${name}'s own entries`;
  }
  return place === ""
    ? "Somewhere unnamed"
    : hospitalName(place).replace(/ export$/, "");
}

/** How many of each kind, in words, from `look`'s counts: `1 allergy, 2 conditions, 3 lab results`. */
export function counted(records: Readonly<Record<string, number>>): string {
  return Object.entries(records)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => {
      const word = kind.toLowerCase();
      if (count === 1) return `1 ${word}`;
      return `${count} ${word.endsWith("y") ? `${word.slice(0, -1)}ies` : `${word}s`}`;
    })
    .join(", ");
}

const UNNAMED = "An entry";

export const capitalised = (sentence: string) =>
  sentence[0].toUpperCase() + sentence.slice(1);

/** An entry as a sentence names it: its name, and what one of its kind is called. */
interface Item {
  readonly name: string;
  readonly one: string;
}

const SAID: Readonly<Record<string, (item: Item, row: Row) => string>> = {
  "members disagree on criticality": ({ name, one }) =>
    `Sources disagree on how severe ${name === UNNAMED ? `an unnamed ${one}` : `the ${name} ${one}`} is.`,
  "joined through two kinds of machine sameness": ({ name }) =>
    `${name} was matched in two different ways.`,
  "judged different, still joined": ({ name, one }) =>
    `${name} was marked as different, but is still shown as one ${one}.`,
  "same code, dates cannot tell": ({ name, one }) =>
    `${name} was recorded more than once, and its dates cannot tell whether it is one ${one} or several.`,
  "joined before, apart under newer tables or rules": ({ name, one }) =>
    `${name === UNNAMED ? `An unnamed ${one}` : name} was kept as one ${one} with another before; newer reference tables or rules no longer match them, so they are shown apart.`,
  "possibly the same medication": ({ name, one }, { otherRecordLabel }) =>
    `${name === UNNAMED ? `An unnamed ${one}` : name} shares a code with ${otherNamed(otherRecordLabel, one)}, which Cascade keeps apart. Cascade cannot confirm that the shared code names one product, so they may or may not be the same.`,
};

/** The other record of a pair, named from its label `Medication · Name · …`, or `another medication` when it has no name. */
function otherNamed(label: string | undefined, one: string): string {
  const name = label?.split(" · ")[1];
  return name === undefined || name === "no name" ? `another ${one}` : name;
}

/** `at A and B`, `at A and in Alex's own entries`: records are at a hospital, but in a person's own entries. */
function where(places: readonly string[]): string {
  let said: string | undefined;
  return listed(
    places.map((place) => {
      const own = / own entries$|^Own entries$/.test(place);
      const word = own ? "in" : "at";
      const named =
        place === "Own entries" ? "the person's own entries" : place;
      const phrase = word === said ? named : `${word} ${named}`;
      said = word;
      return phrase;
    }),
  );
}

/** Where an entry seen more than once was seen, as `seenAt` gives it. */
export interface Seen {
  readonly places: string[];
  readonly across: number;
}

/**
 * Each entry `answers` say is seen more than once, by its IRI: the places its records came from, as a person says
 * them, and `across`, from how many places (a record with no place counts in none).
 */
export function seenAt(answers: Answers): Map<string, Seen> {
  const seen = new Map<string, Seen>();
  for (const row of answers[SEEN] ?? []) {
    if (!seen.has(row.entry))
      seen.set(row.entry, { places: [], across: Number(row.places) });
    const { places } = seen.get(row.entry)!;
    const place = row.place === undefined ? undefined : placeName(row.place);
    if (place !== undefined && !places.includes(place)) places.push(place);
  }
  return seen;
}

/** An entry the sections do not show, named from its label: `Allergy entry · Latex` is a latex allergy. */
export function fromLabel(label = ""): Item {
  const [kind = "", name = label] = label.split(" · ");
  return {
    name: name || UNNAMED,
    one: kind.replace(/ entry$/, "").toLowerCase() || "entry",
  };
}

/**
 * What is worth a look, as `{ sentence, entry, tag }` lines, `entry` the entry each is about and `tag` as `TAGS`
 * holds it, none for a shared ingredient: each entry that needs review; then each report that differs from ClinVar
 * today, which `said` (`variantsSaid`'s answer, none until the tables can say) gives; then each pair of medications in
 * two entries whose codes have an ingredient in common, which the tables' `about` gives. A line that needs the tables
 * comes after those that do not, so the part only grows when they load. `answers` holds the rows of each of
 * `QUESTIONS`, by question.
 *
 * The pair is a hint the starter gives, not something the pod knows: a pod's questions never read the tables' rows.
 * A combination maps to its own multiple-ingredient concept (MIN), never to each of its ingredients, so lisinopril and
 * lisinopril with hydrochlorothiazide share none; two drugs that map to the same MIN share the combination.
 */
export function worthALook(
  answers: Answers,
  about: Abouts = new Map(),
  said?: VariantsSaid,
): Line[] {
  const entries = new Map<string, Item>();
  for (const section of SECTIONS)
    for (const row of sectionRows(section, answers))
      entries.set(row.entry, {
        name: row[section.field] || fromLabel(row.entryLabel).name,
        one: section.one,
      });
  const review = new Map<string, Line>();
  for (const row of answers[REVIEW] ?? [])
    review.set(reviewKey(row), {
      sentence: reviewSaid(
        row,
        entries.get(row.entry) ?? fromLabel(row.entryLabel),
      ),
      entry: row.entry,
      tag: NEEDS_REVIEW,
    });
  const differing = [...variantReports(answers, said)].flatMap(
    ([entry, { name, reports }]) =>
      reports
        .filter(({ tag }) => tag === DIFFERS)
        .map(({ when, place }) => ({
          sentence: `${name}: ${when === undefined ? "an undated" : `your ${when}`} report${place === undefined ? "" : ` from ${place}`} differs from ClinVar today.`,
          entry,
          tag: DIFFERS,
        })),
  );
  return [
    ...review.values(),
    ...differing,
    ...sharedIngredients(answers, about).map(({ sentence, entries }) => ({
      sentence,
      entry: entries[0].entry,
    })),
  ].map((line) => ({ ...line, sentence: capitalised(line.sentence) }));
}

/** What a row of "What needs review" is told apart by: its entry, what it needs, and for a pair of medications, the other. */
export function reviewKey(row: Row): string {
  return JSON.stringify([
    row.entry,
    row.needs,
    row.needs === "possibly the same medication" ? row.otherRecord : null,
  ]);
}

/** The sentence a row of "What needs review" is told in, of `item`, the entry's `name` and what `one` of its kind is called. */
export function reviewSaid(row: Row, item: Item): string {
  return (SAID[row.needs] ?? (() => `${item.name}: ${row.needs}.`))(item, row);
}

/** A pair of medications that share an ingredient, as `sharedIngredients` gives it. */
interface Shared {
  readonly sentence: string;
  readonly entries: readonly {
    readonly entry: string;
    readonly origin: string | undefined;
  }[];
}

/**
 * A `{ sentence, entries }` for each pair of active medications (rule L1's class) in two entries whose codes share an
 * ingredient, in the order of the section, once for the pair of entries whatever codes their rows show, and none for a pair whose rows share a
 * code, which What needs review lists. `entries` are the pair's `{ entry, origin }`, the first the sentence's subject and
 * `origin` the table version its code's ingredients were read from.
 */
export function sharedIngredients(answers: Answers, about: Abouts): Shared[] {
  const medications = SECTIONS.find(({ one }) => one === "medication")!;
  const rows = sectionRows(medications, answers)
    .filter((row) => row.lifecycle === ACTIVE)
    .map((row) => ({
      entry: row.entry,
      name: row.medication || fromLabel(row.entryLabel).name,
      code: row.code,
      ingredients: about.get(row.code)?.ingredients?.codes ?? [],
    }));
  const same = new Set(
    rows.flatMap((one, at) =>
      rows
        .slice(at + 1)
        .filter((other) => other.code !== undefined && other.code === one.code)
        .map((other) => JSON.stringify([one.entry, other.entry].sort())),
    ),
  );
  const said = new Set(same);
  const sentences: Shared[] = [];
  for (const [at, one] of rows.entries())
    for (const other of rows.slice(at + 1)) {
      const pair = JSON.stringify([one.entry, other.entry].sort());
      const shared = one.ingredients.find((each) =>
        other.ingredients.includes(each),
      );
      if (one.entry === other.entry || shared === undefined || said.has(pair))
        continue;
      said.add(pair);
      const name = about.get(shared)?.name?.label ?? shared.split("/").at(-1)!;
      const what = name.includes(" / ") ? "the combination" : "an ingredient";
      sentences.push({
        sentence: `${one.name} and ${other.name} share ${what}, ${name}, and are shown apart.`,
        entries: [one, other].map(({ entry, code }) => ({
          entry,
          origin: about.get(code)?.ingredients?.origin,
        })),
      });
    }
  return sentences;
}

const GENOMICS = "https://ns.cascadeprotocol.org/genomics/v1#";
/** The five ACMG values, in the order a classification names them. */
const ACMG = [
  "Pathogenic",
  "LikelyPathogenic",
  "VUS",
  "LikelyBenign",
  "Benign",
].map((name) => GENOMICS + name);
const LABS_DISAGREE = ["ClinVarConflicting", "ClinVarConflictingData"].map(
  (name) => REC + name,
);
const COMBINATION_ONLY = `${REC}ClinVarCombinationOnly`;
const COUNSELLOR =
  "Your clinician or a genetic counsellor can explain what this means for you.";
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

/**
 * Each variant entry in `answers`, by its IRI, as the tables' `variantClassification` is asked of it: its distinct HGVS
 * expressions and ClinVar IDs, and its gene when its rows give one symbol, none when they give none or two.
 */
export function variantsAsked(answers: Answers): Map<string, VariantAsked> {
  const asked = new Map<string, VariantAsked>();
  const genes = new Map<string, Set<string>>();
  for (const row of answers[VARIANTS] ?? []) {
    const variant = asked.get(row.variant) ?? { hgvs: [], variations: [] };
    asked.set(row.variant, variant);
    if (row.hgvs !== undefined && !variant.hgvs.includes(row.hgvs))
      variant.hgvs.push(row.hgvs);
    if (
      row.variation !== undefined &&
      !variant.variations.includes(row.variation)
    )
      variant.variations.push(row.variation);
    if (row.gene !== undefined)
      genes.set(
        row.variant,
        new Set([...(genes.get(row.variant) ?? []), row.gene]),
      );
  }
  for (const [variant, symbols] of genes)
    if (symbols.size === 1) asked.get(variant)!.gene = [...symbols][0];
  return asked;
}

/** A variant as the page names it: its gene and first expression, else its ClinVar ID. */
function variantName({ gene, hgvs, variations }: VariantAsked): string {
  const named = [gene, hgvs[0]].filter(Boolean).join(" ");
  return named !== ""
    ? named
    : variations.length > 0
      ? `ClinVar ${variations[0]}`
      : UNNAMED;
}

/** A concept's label as a sentence holds it: its first letter lower-case unless the second is upper-case. */
function lowered(label: string): string {
  return /^.[A-Z]/.test(label)
    ? label
    : label.slice(0, 1).toLowerCase() + label.slice(1);
}

/** A concept's last part of its IRI, in words, for a label nobody has given. */
function wordsOf(concept: string): string {
  return concept
    .replace(/^.*[/#]/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((word) => (/^[A-Z]{2,}$/.test(word) ? word : word.toLowerCase()))
    .join(" ");
}

/** How many submitters a row counts, in words. */
function counting({
  contributingSubmitters: contributing,
  submitters,
}: ClassificationRow): string | undefined {
  const number = (n: number) => (n < 10 ? DIGITS[n] : String(n));
  if (contributing !== undefined)
    return `${number(contributing)} contributing ${contributing === 1 ? "submitter" : "submitters"}`;
  if (submitters === undefined) return undefined;
  return submitters === 1
    ? "one submitter"
    : `${submitters === 0 ? "no" : submitters} submitters`;
}

/** What a variant classifications row says, as the sentence ClinVar's page and a code's page give it. */
export function rowSaid(row: ClassificationRow): string {
  const iris = new Set(row.classification.map(({ iri }) => iri));
  const said = [
    ACMG.filter((acmg) => iris.has(acmg))
      .map((acmg) =>
        lowered(row.classification.find(({ iri }) => iri === acmg)!.label),
      )
      .join("/"),
    ...row.classification
      .filter(({ iri }) => !ACMG.includes(iri))
      .map(({ iri, label }) =>
        LABS_DISAGREE.includes(iri)
          ? "labs that submit to ClinVar disagree"
          : iri === COMBINATION_ONLY
            ? "classified only as part of a combination"
            : lowered(label),
      ),
  ].filter((each) => each !== "");
  const status =
    row.reviewStatus === undefined
      ? ""
      : `: ${lowered(row.reviewStatus.label)}`;
  const count = counting(row);
  const lead =
    said.length === 0
      ? "ClinVar today gives no classification"
      : `ClinVar today says ${said.join("; ")}`;
  return `${lead}${status}${count === undefined ? "" : `, ${count}`}.`;
}

/**
 * What ClinVar says of one variant, as `variantClassification` answers (`says`): one sentence, none while it is not
 * known. `gene` is the variant's, for a gene the series does not cover.
 */
function clinvarSaid(
  says: Classification | undefined,
  gene: string | undefined,
): string | undefined {
  if (says === undefined) return undefined;
  switch (says.found) {
    case "rows":
      return rowSaid(says.rows[0]);
    case "not found":
      return "ClinVar, as this app holds it, has no row for this variant.";
    case "not covered":
      return `ClinVar, as this app holds it, covers ${listed(says.genes)}, not ${gene}.`;
    default:
      return "This app holds no ClinVar table.";
  }
}

/** The year a report is named by, or its day when another report of the variant is of the same year. */
function whenOf(
  date: string | undefined,
  dates: readonly string[],
): string | undefined {
  if (date === undefined) return undefined;
  const year = String(date).slice(0, 4);
  return dates.filter((each) => String(each).slice(0, 4) === year).length > 1
    ? day(date)
    : year;
}

/**
 * What a variant's page says: a sentence for each of its `reports` (rows of "What each report says of a variant"),
 * oldest first, each with a tag when `verdicts` (`Pod.agreement()`'s rows) say it differs from the row `says` read; and
 * what ClinVar says today. Each is `{ report, when, place, sentence, tag }`, the year or day it is named by and the lab
 * it came from (`places`, a report's IRI to its lab) only when it has them. A report's classification is named by
 * `labels` (`Tables.labels`' answer). `variant` is as `variantsAsked` gives it.
 */
export function variantSaid({
  variant,
  reports,
  says,
  verdicts = [],
  labels = new Map(),
  places = new Map(),
}: {
  variant?: VariantAsked;
  reports: readonly Row[];
  says?: Classification;
  verdicts?: readonly Verdict[];
  labels?: ReadonlyMap<string, string>;
  places?: ReadonlyMap<string, string>;
}): { reports: ReportSaid[]; clinvar: string | undefined } {
  const row = says?.found === "rows" ? says.rows[0] : undefined;
  const dates = reports.flatMap((report) => report.date ?? []);
  const ordered = [...reports].sort((a, b) =>
    a.date === undefined || b.date === undefined
      ? Number(a.date === undefined) - Number(b.date === undefined)
      : a.date.localeCompare(b.date),
  );
  return {
    reports: ordered.map((report) => {
      const when = whenOf(report.date, dates);
      const place = places.get(report.report);
      const head = `${when === undefined ? "An undated report" : `Your ${when} report`}${place === undefined ? "" : ` from ${place}`}`;
      const sentence =
        report.classification === undefined
          ? `${head} gives no ACMG classification.`
          : `${head} said ${lowered(labels.get(report.classification) ?? wordsOf(report.classification))}.`;
      const differs =
        row !== undefined &&
        verdicts.some(
          (each) =>
            each.report === report.report &&
            each.row === row.variation &&
            each.origin === says!.version &&
            each.verdict === "differs",
        );
      return {
        report: report.report,
        ...(when !== undefined && { when }),
        ...(place !== undefined && { place }),
        sentence,
        ...(differs && { tag: DIFFERS }),
      };
    }),
    clinvar: clinvarSaid(says, variant?.gene),
  };
}

/**
 * Everything the page says of variants that needs the tables: for each variant entry in `answers` what the tables'
 * `variantClassification` says of it, `pod.agreement()`'s verdicts only when the pod has a report, and the labels of
 * the reports' classifications; and `names`, the held ClinVar names' `about` answer's name of the one variation each
 * entry's classification found, an entry whose classification found none, or whose name's version the app does not hold,
 * having none.
 */
export async function variantsSaid(
  answers: Answers,
  {
    tables,
    pod,
  }: {
    tables: Pick<Tables, "variantClassification" | "labels" | "about" | "held">;
    pod: Pick<Pod, "agreement">;
  },
): Promise<VariantsSaid | undefined> {
  const asked = variantsAsked(answers);
  const reports = answers[REPORTS] ?? [];
  if (asked.size === 0 && reports.length === 0) return undefined;
  const says = new Map(
    await Promise.all(
      [...asked].map(
        async ([variant, each]) =>
          [variant, await tables.variantClassification(each)] as const,
      ),
    ),
  );
  const [verdicts, labels] = await Promise.all([
    reports.length === 0 ? [] : pod.agreement(),
    tables.labels([
      ...new Set(reports.flatMap(({ classification }) => classification ?? [])),
    ]),
  ]);
  const found = new Map(
    [...says].flatMap(([variant, each]) =>
      each.found === "rows" && each.rows.length === 1
        ? [[variant, each.rows[0].variation] as const]
        : [],
    ),
  );
  const about = await tables.about([...new Set(found.values())]);
  const named = [...found].flatMap(([variant, variation]) => {
    const name = about.get(variation)?.name;
    return name === undefined ? [] : [[variant, name] as const];
  });
  const held = named.length === 0 ? [] : await tables.held();
  const names = new Map(
    named.filter(([, { origin }]) => heldAt(origin, held) !== undefined),
  );
  return { says, verdicts, labels, names };
}

/**
 * Each variant entry the Genetic variants section shows, by its IRI: its `name`, `asked` as `variantsAsked` gives it
 * (none of either for a variant only a report names), its `reports` as `variantSaid` gives them, each naming the lab
 * of its own entry's documents, `clinvar`, what ClinVar says today, and `from`, the `{ series, version }` among `held`
 * that sentence was read from. `said` is `variantsSaid`'s answer, none until the tables can say, and then no report is
 * tagged and there is no sentence from ClinVar.
 */
export function variantReports(
  answers: Answers,
  said?: VariantsSaid,
  held: readonly Series[] = [],
): Map<string, VariantReport> {
  const sources = answers[SOURCES] ?? [];
  const reported = new Map<string, Row[]>();
  for (const report of answers[REPORTS] ?? [])
    reported.set(report.variant, [
      ...(reported.get(report.variant) ?? []),
      report,
    ]);
  const labs = new Map<string, string[]>();
  for (const row of sources)
    if (row.hospital !== undefined)
      labs.set(row.entry, [...(labs.get(row.entry) ?? []), placeOf(row)]);
  const places = new Map(
    [...labs].map(([report, each]) => [report, listed([...new Set(each)])]),
  );
  const asked = variantsAsked(answers);
  return new Map(
    [...new Set([...asked.keys(), ...reported.keys()])].map((entry) => {
      const variant = asked.get(entry) ?? { hgvs: [], variations: [] };
      const says = said?.says.get(entry);
      const read = variantSaid({
        variant,
        reports: reported.get(entry) ?? [],
        says,
        verdicts: said?.verdicts,
        labels: said?.labels,
        places,
      });
      const called = said?.names?.get(entry);
      const namedFrom =
        called === undefined ? undefined : heldAt(called.origin, held);
      const named = called?.label ?? variantName(variant);
      const from = says === undefined ? undefined : heldAt(says.version, held);
      return [
        entry,
        {
          name:
            named === UNNAMED
              ? fromLabel(
                  sources.find((row) => row.entry === entry)?.entryLabel,
                ).name
              : named,
          asked: variant,
          reports: read.reports,
          clinvar: read.clinvar,
          ...(from !== undefined && { from }),
          ...(namedFrom !== undefined && { namedFrom }),
        },
      ];
    }),
  );
}

/**
 * The Genetic variants section's rows: `{ entry, variant, reports, tags }` for each variant `variantReports` gives,
 * `tags` only when it has any.
 */
function variantRows(answers: Answers, said?: VariantsSaid): SectionRow[] {
  const review = reviewed(answers);
  return [...variantReports(answers, said)].map(
    ([entry, { name, reports }]) => {
      const tags = tagsOf({
        differs: reports.some(({ tag }) => tag === DIFFERS),
        review: review.has(entry),
      });
      return {
        entry,
        variant: name,
        reports: reports.length,
        ...(tags.length > 0 && { tags }),
      } as unknown as SectionRow;
    },
  );
}

/** The section's rows in the order its table opens in, a row with nothing to sort by last either way. */
export function opening(
  section: Section,
  rows: readonly SectionRow[],
): SectionRow[] {
  const column = section.columns[section.sortBy];
  const key = (row: SectionRow) => String(column.key(row) ?? "");
  const order = section.newestFirst ? -1 : 1;
  return [...rows].sort(
    (a, b) =>
      Number(key(a) === "") - Number(key(b) === "") ||
      order * compare(column.type, key(a), key(b)),
  );
}

/**
 * What a finding says, by its kind and direction: that a test's results were lower or higher after a medication started
 * or stopped, as a comparison of means in an order. It never says why.
 */
export const CHANGED: Readonly<
  Record<
    string,
    Readonly<Record<string, (test: string, medication: string) => string>>
  >
> = {
  "after start": {
    down: (test, medication) =>
      `${test} was lower after ${medication} started.`,
    up: (test, medication) => `${test} was higher after ${medication} started.`,
  },
  "after stop": {
    down: (test, medication) =>
      `${test} was lower after ${medication} stopped.`,
    up: (test, medication) => `${test} was higher after ${medication} stopped.`,
  },
};

/** The view a model can open: the trend of one test, a medication marked. A host registers it with what runs it. */
export const TREND_VIEW = {
  name: "open_trend",
  description:
    "Opens the trend of one lab test over time, the days a medication started and stopped marked on it. It shows what changed after what, never why.",
  inputSchema: {
    type: "object",
    properties: {
      test: { type: "string", description: "A LOINC code such as 18262-6." },
      medication: {
        type: "string",
        description:
          "An RxNorm code such as 617310, or the medication's name where it has no code; none marked if left out.",
      },
    },
    required: ["test"],
    additionalProperties: false,
  },
};

export const DAY_MS = 86_400_000;
export const timeOf = (text: string) =>
  Date.parse(`${String(text).slice(0, 10)}T00:00:00Z`);
export const dayAt = (time: number) => day(new Date(time).toISOString());
export const monthAt = (time: number) =>
  new Date(time).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
export const near = (n: number) => Math.round(n * 10) / 10;
export const resultsSaid = (n: number) =>
  `${n} ${n === 1 ? "result" : "results"}`;

/** The bare code of an IRI: its last `/` or `#` part. */
export function notationOf(code: string | undefined): string | undefined {
  const last = String(code ?? "")
    .split(/[/#]/)
    .pop();
  if (!last) return undefined;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** What was left out of a finding's means or a test's results, in words. */
export function leftSaid({
  unparsed = 0,
  otherUnit = 0,
  undated = 0,
}: Left): string | undefined {
  const parts = [
    unparsed > 0 &&
      (unparsed === 1
        ? "1 value that is not a number"
        : `${unparsed} values that are not numbers`),
    otherUnit > 0 && `${resultsSaid(otherUnit)} in another unit`,
    undated > 0 && `${resultsSaid(undated)} with no full date`,
  ].filter(Boolean) as string[];
  return parts.length === 0 ? undefined : `Left out: ${listed(parts)}.`;
}

/** A test a pod's lab rows hold, as `testsIn` gives it. */
export interface Test {
  code: string;
  notation: string | undefined;
  name: string | undefined;
}

/** The tests a pod's lab rows hold, by name: their code, bare code and name. */
export function testsIn(labs: readonly Row[]): Test[] {
  const tests = new Map<string, Test>();
  for (const row of labs) {
    if (!row.code) continue;
    const kept = tests.get(row.code);
    if (kept === undefined)
      tests.set(row.code, {
        code: row.code,
        notation: notationOf(row.code),
        name: row.test || undefined,
      });
    else if (kept.name === undefined && row.test) kept.name = row.test;
  }
  return [...tests.values()].sort((a, b) =>
    (a.name ?? a.notation ?? "").localeCompare(b.name ?? b.notation ?? ""),
  );
}

/** The trend a finding is about, as `trendHref` takes it: bare codes, the medication's name where it has no code. */
export function trendOfFinding({
  test,
  medication,
}: Pick<Finding, "test" | "medication">): TrendAsked {
  const drug = medication.notation ?? medication.name;
  return {
    test: test.notation ?? test.code,
    ...(drug ? { medication: drug } : {}),
  };
}

/**
 * The test and medication a trend shows, from what an address asked for: both as asked; with no test, the strongest
 * change's, else the pod's first test; none when the pod holds no lab row. `changes` is `changesIn`'s answer and `labs`
 * the rows of `pod/My lab results`.
 */
export function trendInput(
  {
    changes = [],
    labs = [],
  }: { changes?: readonly Finding[]; labs?: readonly Row[] },
  { test, medication }: { test?: string; medication?: string },
): TrendAsked | undefined {
  if (test) return { test, ...(medication ? { medication } : {}) };
  const strongest = changes.find(
    ({ direction }) => direction !== "not enough results",
  );
  if (strongest !== undefined) return trendOfFinding(strongest);
  const [first] = testsIn(labs);
  return first === undefined
    ? undefined
    : { test: first.notation ?? first.code };
}

/** The medications of `timeline` (`timelineIn`'s answer) as the therapies `changesIn` takes them for: a drug once, from its earliest start to its latest end. */
export function therapiesOf(
  timeline: readonly Timed[],
  about: Abouts = new Map(),
): Therapy[] {
  const drugs = new Map<string | undefined, Therapy>();
  for (const entry of timeline) {
    const key = entry.notation ?? entry.name;
    const kept = drugs.get(key);
    if (kept === undefined) {
      drugs.set(key, {
        key: key!,
        name: labelled(
          about,
          entry.code,
          entry.name || entry.notation || "Unnamed medication",
        ),
        code: entry.code,
        started: entry.started,
        ended: entry.ended,
      });
      continue;
    }
    if (entry.started && (!kept.started || entry.started < kept.started))
      kept.started = entry.started;
    if (entry.ended && (!kept.ended || entry.ended > kept.ended))
      kept.ended = entry.ended;
  }
  return [...drugs.values()];
}

/** Where a time and a value fall in a drawing of `size`, over the days and numbers of `points` and `marks`. */
export function plotOf({
  points,
  marks = [],
  size,
}: {
  points: readonly Point[];
  marks?: readonly Mark[];
  size: Size;
}): Plot {
  const { width, height, margin } = size;
  const times = [
    ...points.map(({ time }) => time),
    ...marks.map(({ time }) => time),
  ];
  let from = Math.min(...times);
  let to = Math.max(...times);
  if (from === to) {
    from -= DAY_MS;
    to += DAY_MS;
  }
  const values = points.map(({ value }) => value);
  let low = Math.min(...values);
  let high = Math.max(...values);
  const pad = (high - low) * 0.1 || Math.abs(low) * 0.1 || 1;
  low -= pad;
  high += pad;
  const across = width - margin.left - margin.right;
  const down = height - margin.top - margin.bottom;
  return {
    ...size,
    from,
    to,
    low,
    high,
    x: (time) => margin.left + ((time - from) / (to - from)) * across,
    y: (value) => margin.top + (1 - (value - low) / (high - low)) * down,
  };
}

export const SMALL: Size = {
  width: 240,
  height: 84,
  margin: { top: 8, right: 8, bottom: 8, left: 8 },
  radius: 3,
};
export const LARGE: Size = {
  width: 640,
  height: 280,
  margin: { top: 30, right: 36, bottom: 34, left: 60 },
  radius: 4,
};

/** `count` values from `from` to `to`, evenly. */
export const spread = (count: number, from: number, to: number) =>
  Array.from(
    { length: count },
    (_, at) => from + ((to - from) * at) / (count - 1),
  );

/** The unit most of `results` carry, the earliest on a tie. */
export function unitOf(results: readonly { readonly unit: string }[]): string {
  const counts = new Map<string, number>();
  for (const { unit } of results) counts.set(unit, (counts.get(unit) ?? 0) + 1);
  let chosen = "";
  let most = 0;
  for (const [unit, count] of counts)
    if (count > most) {
      chosen = unit;
      most = count;
    }
  return chosen;
}

/** The name a trend page and its tab give the test: the tables' where they name its code, else the record's own text. */
export function trendTitle(
  series: { readonly test: Coded & { readonly code: string } },
  about: Abouts = new Map(),
): string {
  const { code, name, notation } = series.test;
  return labelled(about, code, name ?? notation ?? code);
}

export const LAB_SECTION = SECTIONS.find(({ question }) => question === LABS)!;

/** The tables' name for `code` where it names it, else `own`. */
export const labelled = (
  about: Abouts,
  code: string | undefined,
  own: string,
): string =>
  (code === undefined ? undefined : about.get(code)?.name?.label) ?? own;

/** A finding's test and medication as the page names them: by the tables' `about` where it names the code, else by the record's own text. */
export function changeNames(
  finding: Pick<Finding, "test" | "medication">,
  about: Abouts,
): { test: string; medication: string } {
  const { test, medication } = finding;
  return {
    test: labelled(about, test.code, test.name ?? test.notation ?? test.code),
    medication: labelled(
      about,
      medication.code,
      medication.name || medication.notation || "an unnamed medication",
    ),
  };
}

/** What a finding says, in the words the page uses for it: its card, its "Ask about this" label and the chat's finding card. */
export function changeSaid(
  finding: Finding,
  about: Abouts = new Map(),
): string {
  return sentenceOf(finding, changeNames(finding, about));
}

export function sentenceOf(
  { kind, direction }: Pick<Finding, "kind" | "direction">,
  { test, medication }: { test: string; medication: string },
): string {
  return capitalised(CHANGED[kind][direction](test, medication));
}

/** The most questions an empty chat offers. */
const SUGGESTED = 4;

/**
 * The questions an empty chat offers, as texts: at most `SUGGESTED`, in a fixed order, the same for the same input,
 * and each only when the pod holds what answers it. First "Find anything interesting in this pod", when What changed
 * has a change or Worth a look has a line (`worth_a_look` gives the lines); then, for each change shown, strongest first, "Did <test> change after
 * <medication> started?" (or "stopped"), named as its card names them; last "Which medications have I stopped?", when a
 * medication of the history has an end date. The changes make room for the other two. `answers` holds the rows of each
 * of `QUESTIONS`, by question, and `changes`, `about` and `said` are as `podPage` takes them.
 */
export function suggestedQuestions(
  answers: Answers,
  {
    changes = [],
    about = new Map(),
    said,
  }: { changes?: readonly Finding[]; about?: Abouts; said?: VariantsSaid },
): string[] {
  const shown = changes.filter(
    ({ direction }) => direction !== "not enough results",
  );
  const first =
    shown.length > 0 || worthALook(answers, about, said).length > 0
      ? ["Find anything interesting in this pod"]
      : [];
  const last = (answers[HISTORY] ?? []).some((row) => row.ended)
    ? ["Which medications have I stopped?"]
    : [];
  const changed = [
    ...new Set(
      shown.map((finding) => {
        const names = changeNames(finding, about);
        return `Did ${names.test} change after ${names.medication} ${finding.kind === "after start" ? "started" : "stopped"}?`;
      }),
    ),
  ].slice(0, SUGGESTED - first.length - last.length);
  return [...first, ...changed, ...last];
}

/** A statement's field in words: `…/clinical/v1#endDate` is `end date`. */
const fieldSaid = (field: string) =>
  field
    .split(/[#/]/)
    .at(-1)!
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .toLowerCase();

/** A statement's value as a person reads it: a day as its date, a thing by its label, an address by its last part. */
function valueSaid({ value, valueLabel }: Row): string {
  if (valueLabel !== undefined) return valueLabel;
  if (/^\d{4}-\d\d-\d\d/.test(value)) return day(value);
  return isCode(value) ? value.split(/[#/:]/).at(-1)! : value;
}

/** What differs between two versions' statements, status first: `{ field, before, after }`, each side a list of values. */
function differences(
  before: ReadonlyMap<string, readonly string[]>,
  after: ReadonlyMap<string, readonly string[]>,
): Difference[] {
  return [...new Set([...before.keys(), ...after.keys()])]
    .sort()
    .flatMap((field) => {
      const [was, now] = [before.get(field) ?? [], after.get(field) ?? []];
      return was.join("\n") === now.join("\n")
        ? []
        : [{ field: fieldSaid(field), before: was, after: now }];
    })
    .sort(
      (a, b) => Number(b.field === "status") - Number(a.field === "status"),
    );
}

/**
 * `answers` with the rows of `MECHANISM` added when `podPage` would draw them: the pod holds two imports or more and
 * `changes` (as `changesIn` gives them) has a shown change of a medication. Otherwise `answers` as it is, and the two
 * questions are never asked; `ask` gives a question's rows.
 */
export async function withMechanism(
  answers: Answers,
  changes: readonly Finding[],
  ask: (question: string) => Promise<readonly Row[]>,
): Promise<Answers> {
  const imports = new Set((answers[IMPORTS] ?? []).map((row) => row.import));
  const shown = changes.some(
    ({ direction, medication }) =>
      direction !== "not enough results" && medication.entry,
  );
  if (imports.size < 2 || !shown) return answers;
  const rows = await Promise.all(
    MECHANISM.map(async (question) => [question, await ask(question)]),
  );
  return { ...answers, ...Object.fromEntries(rows) };
}

/**
 * How the pod came to hold what What changed reads, from the rows of the imports, the revisions and the versions in
 * `answers`; none until the pod holds two imports.
 *
 * - `pulls`: the imports, in the order they began, each `{ label, started, hospital, retrieved, asOf, brought, revised }`;
 *   `hospital`, `retrieved` and `asOf` (the world's date the hospital answered as of, its document's
 *   `rec:answeredAsOf`) only when a document says them, `brought` is how many records it brought in and `revised`
 *   how many of those were a new version of a record already held;
 * - `revisions`: for each medication of `findings` whose record has more than one version, `{ finding, steps }`, a step
 *   `{ from, to, pull, arrived, asOf, said }` for each arrival after the first: the versions numbered in the order they
 *   came, the number of the pull that brought `to`, `asOf` (that pull's, only when it has one), and `said`, what differs between the two, as `differences` gives it.
 */
export function howOf(
  answers: Answers,
  findings: readonly Finding[],
): How | undefined {
  const imports = new Map<
    string,
    { label: string; started: string; records: Set<string> }
  >();
  for (const row of answers[IMPORTS] ?? []) {
    const each = imports.get(row.import) ?? {
      label: row.importLabel,
      started: row.started,
      records: new Set(),
    };
    each.records.add(row.record);
    imports.set(row.import, each);
  }
  if (imports.size < 2) return undefined;
  const arrivals = answers[REVISIONS] ?? [];
  const pulls = [...imports].map(([id, each]) => {
    const own = arrivals.filter((row) => row.import === id);
    const document = own.find(
      (row) =>
        row.hospital !== undefined ||
        row.retrieved !== undefined ||
        row.answeredAsOf !== undefined,
    );
    return {
      label: each.label,
      started: each.started,
      ...(document?.hospital !== undefined && { hospital: document.hospital }),
      ...(document?.retrieved !== undefined && {
        retrieved: document.retrieved,
      }),
      ...(document?.answeredAsOf !== undefined && {
        asOf: document.answeredAsOf,
      }),
      brought: each.records.size,
      revised: new Set(
        own
          .filter((row) => row.previous !== undefined)
          .map((row) => row.record),
      ).size,
    };
  });
  const stated = new Map<string, Map<string, string[]>>();
  for (const row of answers[VERSIONS] ?? []) {
    const fields = stated.get(row.version) ?? new Map<string, string[]>();
    fields.set(
      row.field,
      [...(fields.get(row.field) ?? []), valueSaid(row)].sort(),
    );
    stated.set(row.version, fields);
  }
  const statements = (version: string) =>
    stated.get(version) ?? new Map<string, string[]>();
  const ids = [...imports.keys()];
  const medications = [
    ...new Map(
      findings
        .filter(({ medication }) => medication.entry)
        .map((finding) => [finding.medication.entry, finding]),
    ).values(),
  ];
  const revisions = medications.flatMap((finding) => {
    const records = new Set(
      (answers[SOURCES] ?? [])
        .filter((row) => row.entry === finding.medication.entry)
        .map((row) => row.record),
    );
    return [...records].flatMap((record) => {
      const seen = new Set<string>();
      const arrived = arrivals.filter(
        (row) =>
          row.record === record &&
          !seen.has(row.revision) &&
          seen.add(row.revision),
      );
      const versions = [...new Set(arrived.map((row) => row.version))];
      const steps = arrived.slice(1).map((row, at) => ({
        from: versions.indexOf(arrived[at].version) + 1,
        to: versions.indexOf(row.version) + 1,
        pull: ids.indexOf(row.import) + 1,
        arrived: row.arrived,
        asOf: pulls[ids.indexOf(row.import)]?.asOf,
        said: differences(
          statements(arrived[at].version),
          statements(row.version),
        ),
      }));
      return steps.length === 0 ? [] : [{ finding, steps }];
    });
  });
  return { pulls, revisions };
}

/** The values of one side of a difference, or `none`. */
export const valuesSaid = (values: readonly string[]) =>
  values.length === 0 ? "none" : values.join(", ");

/**
 * One pull as the mechanism lists it: from where, as of the world's date it answered for (else retrieved when, else the
 * day it came in), and what it brought in.
 */
export function pullSaid({
  label,
  started,
  hospital,
  retrieved,
  asOf,
  brought,
  revised,
}: Pull): string {
  const records = `${brought} ${brought === 1 ? "record" : "records"}`;
  const when =
    asOf !== undefined
      ? `as of ${dayInWords(asOf)}`
      : retrieved === undefined
        ? localDayInWords(started)
        : `retrieved ${localDayInWords(retrieved)}`;
  const newer =
    revised === 0
      ? ""
      : revised === 1
        ? ", 1 of them a new version of one the pod already held"
        : `, ${revised} of them new versions of records the pod already held`;
  return `From ${placeName(hospital ?? label)}, ${when}: ${records}${newer}.`;
}

/** An entry's part in an address: the last `:`-separated part of its IRI, which a host never turns back into one. */
export function entryId(entry: string): string {
  return entry.split(":").at(-1)!;
}

/** The held series that holds the version `origin`, with that version; none when no series does. */
export function heldAt(
  origin: string | undefined,
  held: readonly Series[],
): HeldAt | undefined {
  const series = held.find(({ versions }) =>
    versions.some(({ iri }) => iri === origin),
  );
  return series === undefined
    ? undefined
    : { series, version: series.versions.find(({ iri }) => iri === origin)! };
}

/** What names a code's page: the series of the version its name, else its status, else its ingredients came from. */
function seriesOf(
  said: About | undefined,
  held: readonly Series[],
): Series | undefined {
  for (const part of [said?.name, said?.status, said?.ingredients]) {
    const found = part === undefined ? undefined : heldAt(part.origin, held);
    if (found !== undefined) return found.series;
  }
  return undefined;
}

/**
 * The table versions the matcher's counting Sames of each entry's records cite, by the entry's IRI, as the vocabulary's
 * `tables/joined-by.rq` gives them (`pod.joinedBy()`). A version the app does not hold is left out by `entryOf`.
 */
export async function joinedBy(
  pod: Pick<Pod, "joinedBy">,
): Promise<Map<string, string[]>> {
  const joined = new Map<string, string[]>();
  for (const { entry, used } of await pod.joinedBy())
    joined.set(entry, [...(joined.get(entry) ?? []), used]);
  return joined;
}

/** What Cascade did with an entry seen more than once, as `seenAt` gives it, in a sentence about the entry itself. */
function seenSaid({ places, across }: Seen, one: string): string {
  return across > 1
    ? `Cascade recorded it ${where(places)} and keeps it as one ${one}.`
    : `It arrived more than once${places.length === 0 ? "" : ` from ${places[0]}`}. Cascade keeps it as one ${one}.`;
}

/**
 * A line for each document an entry's source rows came from, the oldest arrival first, as `entryOf`'s `where`;
 * `issued` is the date of the report each document held, by document, which the line says when it has one.
 */
function linesOf(
  rows: readonly Row[],
  issued: ReadonlyMap<string, string> = new Map(),
): Where[] {
  const lines = new Map<
    string,
    Omit<Where, "records"> & { records: Set<string> }
  >();
  for (const row of rows) {
    const document = row.document ?? row.record;
    const at = lines.get(document);
    if (at === undefined)
      lines.set(document, {
        place: placeOf(row),
        ...(issued.has(document) && { issued: issued.get(document) }),
        ...(row.retrieved !== undefined && { retrieved: row.retrieved }),
        arrived: row.arrived,
        ...(row.hospital !== undefined &&
          row.importLabel !== undefined && { importLabel: row.importLabel }),
        records: new Set([row.record]),
      });
    else {
      at.records.add(row.record);
      if (compare("date", row.arrived ?? "", at.arrived ?? "") < 0)
        at.arrived = row.arrived;
    }
  }
  return [...lines.values()]
    .map((line) => ({ ...line, records: line.records.size }))
    .sort((a, b) => compare("date", a.arrived ?? "", b.arrived ?? ""));
}

/** What the tables say of each of `codes`, as `entryOf`'s `known` lines: those of a table among `held` only. */
function claimsOf(
  codes: readonly string[],
  about: Abouts,
  held: readonly Series[],
): Known[] {
  const known: Known[] = [];
  for (const code of codes) {
    const said = about.get(code);
    if (said === undefined) continue;
    const notation = said.notation ?? codeShown(code);
    const claim = (part: { readonly origin: string }, sentence: string) => {
      const from = heldAt(part.origin, held);
      if (from !== undefined) known.push({ sentence, from });
    };
    if (said.name !== undefined)
      claim(said.name, `${notation} is named "${said.name.label}".`);
    if (said.status?.deprecated === true) {
      const instead = said.status.replacedBy.map(
        (each) => about.get(each)?.notation ?? codeShown(each),
      );
      claim(
        said.status,
        `${notation} is retired${instead.length === 0 ? "" : `, replaced by ${listed(instead)}`}.`,
      );
    }
    if ((said.ingredients?.codes.length ?? 0) > 0) {
      const names = said.ingredients!.codes.map(
        (each) => about.get(each)?.name?.label ?? codeShown(each),
      );
      claim(
        said.ingredients!,
        `${notation} ${names.length === 1 ? "has the ingredient" : "has the ingredients"} ${listed(names)}.`,
      );
    }
  }
  return known;
}

/**
 * What a variant entry's page says that no other kind's does, from `variantReports`: `what`, its genes and expressions
 * as written; `codes`, its ClinVar IDs, linked to the series `said` read them from when `held` holds it; `issued`, the
 * date of each report by the document it came from, which is a document of the variant too; and `known`, each report
 * oldest first, what ClinVar says today with the table it was read from, then the counsellor sentence.
 */
function variantFacts(
  answers: Answers,
  entry: string,
  said: VariantsSaid | undefined,
  held: readonly Series[],
) {
  const { name, asked, reports, clinvar, from, namedFrom } = variantReports(
    answers,
    said,
    held,
  ).get(entry)!;
  const genes = [
    ...new Set(
      (answers[VARIANTS] ?? [])
        .filter((row) => row.variant === entry)
        .flatMap(({ gene }) => gene ?? []),
    ),
  ];
  const facts: [string, readonly string[]][] = [
    [genes.length === 1 ? "Gene" : "Genes", genes],
    [asked.hgvs.length === 1 ? "Expression" : "Expressions", asked.hgvs],
  ];
  const series = held.find(({ iri }) => iri === said?.says.get(entry)?.series);
  const dates = new Map(
    (answers[REPORTS] ?? []).map(({ report, date }) => [report, date]),
  );
  const issued = new Map<string, string>();
  for (const { report } of reports)
    for (const row of answers[SOURCES] ?? [])
      if (
        row.entry === report &&
        row.document !== undefined &&
        dates.get(report) !== undefined &&
        !issued.has(row.document)
      )
        issued.set(row.document, dates.get(report)!);
  return {
    what: facts
      .filter(([, texts]) => texts.length > 0)
      .map(([head, texts]) => ({ head, text: texts.join(", ") })),
    codes: asked.variations.map((notation) => ({
      notation,
      ...(series !== undefined && { series }),
    })),
    issued,
    differs: reports.some(({ tag }) => tag === DIFFERS),
    known: [
      ...(namedFrom === undefined
        ? []
        : [
            {
              sentence: `ClinVar names this variation ${name}.`,
              from: namedFrom,
            },
          ]),
      ...reports.map(({ sentence, tag }) => ({
        sentence,
        ...(tag !== undefined && { tag }),
      })),
      ...(clinvar === undefined
        ? []
        : [{ sentence: clinvar, ...(from !== undefined && { from }) }]),
      { sentence: COUNSELLOR },
    ] as Known[],
  };
}

/**
 * The entry whose address part is `id` (see `entryId`), as its page reads it, or undefined when no row of "Where it
 * came from" has it. `answers` holds the rows of each of `QUESTIONS`, by question; `about` is `codesSaid`'s answer, and
 * `held` the tables' `held()`, both empty until the tables can say; `joined` is `joinedBy`'s answer, which names on the
 * entry's seen-more-than-once line the held table version whose rows joined its records.
 *
 * - `entry`, `name`, `kind` (`allergy`) and `tags`, as a row of its section has them: `Retired code`, `Needs review`
 *   when What needs review names it (an entry no section shows too), and `Differs` when a report of a variant does;
 * - `what`: the section's columns after the name, as `{ head, text }`; `recorded`, the record's own name when the tables
 *   named it otherwise; and `codes`, each `{ notation, series }`, the series that names it when one is held;
 * - `where`: a line for each document the entry's records came from, a record with none its own, the oldest arrival
 *   first, each `{ place, issued, retrieved, arrived, importLabel, records }`; `importLabel` only when a hospital is the place, `issued` only on a variant's line a report also came from;
 * - `known`: what Cascade did, each review line tagged `Needs review`, each pair of medications that share an ingredient
 *   the entry is one of, then what the tables say of each code, as `{ sentence, tag, from }`, a table's claim with
 *   `from`, the `{ series, version }` among `held` it came from; and `credits`, each cited series' once.
 *
 * An entry no section shows is named and kinded from its label, and has no columns or codes.
 *
 * A variant (the Genetic variants section's) has instead, by `variantFacts`: its genes and expressions for `what`, its
 * ClinVar IDs for `codes`, the date of each report on the `where` line of its document as `issued`, and `known` lines
 * for each report, ClinVar today and the counsellor sentence; `said` is `variantsSaid`'s answer, none until the tables
 * can say.
 */
export function entryOf(
  answers: Answers,
  id: string,
  {
    about = new Map(),
    said,
    held = [],
    joined = new Map(),
  }: {
    about?: Abouts;
    said?: VariantsSaid;
    held?: readonly Series[];
    joined?: ReadonlyMap<string, readonly string[]>;
  } = {},
): Entry | undefined {
  const sources = answers[SOURCES] ?? [];
  const entry = sources.find((row) => entryId(row.entry) === id)?.entry;
  if (entry === undefined) return undefined;
  const ofEntry = <R extends Row>(rows: readonly R[]) =>
    rows.filter((row) => row.entry === entry);
  const section = SECTIONS.find(
    (each) => ofEntry(sectionRows(each, answers, said)).length > 0,
  );
  const rows =
    section === undefined ? [] : ofEntry(sectionRows(section, answers, said));
  const variant =
    section?.one === "variant"
      ? variantFacts(answers, entry, said, held)
      : undefined;
  const label = [
    ...rows,
    ...ofEntry(sources),
    ...ofEntry(answers[REVIEW] ?? []),
  ]
    .map((row) => row.entryLabel)
    .find((each) => each !== undefined);
  const labelled = fromLabel(label);
  const kind = section?.one ?? labelled.one;
  const namings = rows.map((row) => namingOf(section!, row, about));
  const given = namings.find((each) => each.label !== undefined)?.label;
  const own = rows.map((row) => row[section!.field]).find(Boolean);
  const title = given ?? (own || labelled.name);

  const codes = [
    ...new Set(
      rows
        .flatMap((row) => section!.codes.map((column) => row[column]))
        .filter(isCode),
    ),
  ];

  const known: Known[] = [];
  const seen = seenAt(answers).get(entry);
  const matched = [
    ...new Map(
      (joined.get(entry) ?? []).flatMap((used) => {
        const at = heldAt(used, held);
        return at === undefined ? [] : [[used, at] as const];
      }),
    ).values(),
  ];
  const how = (at: HeldAt) => ({ from: at, fromLead: "Matched using" });
  if (seen !== undefined)
    known.push({
      sentence: seenSaid(seen, kind),
      ...(matched.length > 0 && how(matched.shift()!)),
    });
  else if (matched.length > 0)
    known.push({
      sentence: `Cascade keeps it as one ${kind}.`,
      ...how(matched.shift()!),
    });
  for (const at of matched)
    known.push({ from: at, fromLead: "Also matched using" });
  const reviews = new Map<string, string>();
  for (const row of ofEntry(answers[REVIEW] ?? []))
    reviews.set(
      reviewKey(row),
      capitalised(reviewSaid(row, { name: title, one: kind })),
    );
  for (const sentence of reviews.values())
    known.push({ sentence, tag: NEEDS_REVIEW });
  for (const { sentence, entries } of sharedIngredients(
    named(answers, about),
    about,
  )) {
    const origin = entries.find((each) => each.entry === entry)?.origin;
    const from = origin === undefined ? undefined : heldAt(origin, held);
    if (from !== undefined)
      known.push({ sentence: capitalised(sentence), from });
  }
  known.push(...claimsOf(codes, about, held));
  if (variant !== undefined) known.push(...variant.known);

  return {
    entry,
    name: title === UNNAMED ? `An unnamed ${kind}` : title,
    kind,
    tags: tagsOf({
      differs: variant?.differs === true,
      review: reviews.size > 0,
      retired: namings.some((each) => each.retired),
    }),
    what:
      variant !== undefined
        ? variant.what
        : section === undefined
          ? []
          : section.columns.slice(1).flatMap((column) => {
              const texts = [
                ...new Set(
                  rows.map((row) => column.show(row) ?? "").filter(Boolean),
                ),
              ];
              return texts.length === 0
                ? []
                : [{ head: column.head, text: texts.join(", ") }];
            }),
    ...(given !== undefined &&
      own !== undefined &&
      own !== given && { recorded: own }),
    codes:
      variant !== undefined
        ? variant.codes
        : codes.map((code) => {
            const series = seriesOf(about.get(code), held);
            return {
              notation: about.get(code)?.notation ?? codeShown(code),
              ...(series !== undefined && { series }),
            };
          }),
    ...(section?.one === "lab result" && { testCodes: codes }),
    where: linesOf(ofEntry(sources), variant?.issued),
    known,
    credits: [
      ...new Set(known.flatMap(({ from }) => from?.series.credit ?? [])),
    ],
  };
}

/**
 * The LOINC panels the held panel members tables list the lab result `entry` (`entryOf`'s answer) in, as `entryPage`
 * takes them: for each version among `held` that lists its test code in a panel, its series and version and the panels
 * with their requirement. Nothing for an entry that is no lab result, or when the tables cannot say.
 */
export async function panelsOf(
  entry: Entry | undefined,
  {
    tables,
    held,
  }: { tables: Pick<Tables, "inPanels">; held: readonly Series[] },
): Promise<(Omit<InPanels, "version"> & HeldAt)[]> {
  const found = await Promise.all(
    (entry?.testCodes ?? []).map((code) => tables.inPanels(code)),
  );
  return found.flat().flatMap((each) => {
    const at = heldAt(each.version, held);
    return at === undefined ? [] : [{ ...each, ...at }];
  });
}

/** What an import is doing, as `pod.import`'s `onProgress` says it: `converting, 3 of 10 documents done`. */
export function importPart({
  part,
  done,
  of,
}: {
  part: string;
  done?: number;
  of?: number;
}): string {
  const counted =
    of === undefined
      ? ""
      : `, ${done} of ${of} ${part === "converting" ? "documents" : "steps"} done`;
  return `${part}${counted}`;
}

/** The demo hospitals, as far as `demoPeople` reads them. */
export interface Demo {
  readonly hospital: Hospital;
  readonly patients: Readonly<Record<string, Bundle>>;
}

/**
 * Every person the demo hospitals hold, by name, the same person at two hospitals once, by name and birth date; each
 * with the hospitals that hold them, and their `family` and `given` names as the hospital holds them separately.
 * `demo` is the demo hospitals as `loadHospitals` gives them.
 */
export function demoPeople(demo: readonly Demo[]): Person[] {
  const people = new Map<string, Person>();
  for (const { hospital, patients } of demo)
    for (const bundle of Object.values(patients)) {
      const name = patientName(bundle);
      if (name === undefined) continue;
      const key = `${name}|${patientOf(bundle)!.birthDate}`;
      if (!people.has(key)) {
        const { family = "", given = [] } = patientOf(bundle)!.name![0];
        people.set(key, { name, family, given: given.join(" "), at: [] });
      }
      people.get(key)!.at.push(hospital);
    }
  return byFamily([...people.values()]);
}

/** A person as a list of people reads them, family name first: `Marsh, Rowan Ellery`; their name as it is when no family name is held. */
export function familyFirst({
  name,
  family,
  given,
}: Pick<Person, "name" | "family" | "given">): string {
  return family ? [family, given].filter(Boolean).join(", ") : name;
}

/** `people` sorted by family name, then given name; a person with no family name sorts by their name. */
export function byFamily<P extends Pick<Person, "name" | "family" | "given">>(
  people: readonly P[],
): P[] {
  return [...people].sort(
    (a, b) =>
      (a.family || a.name).localeCompare(b.family || b.name) ||
      (a.given ?? "").localeCompare(b.given ?? ""),
  );
}

type Entries = NonNullable<Bundle["entry"]>;

/** A patient file's Patient: its latest version, by record time, in a file that keeps versions. */
function patientOf(bundle: Bundle) {
  const recorded = (entry: Entries[number]) =>
    Date.parse(entry.response?.lastModified ?? "") || -Infinity;
  return (bundle.entry ?? [])
    .filter(({ resource }) => resource?.resourceType === "Patient")
    .reduce<Entries[number] | undefined>(
      (latest, entry) =>
        latest === undefined || recorded(entry) >= recorded(latest)
          ? entry
          : latest,
      undefined,
    )?.resource;
}

/** The person a FHIR Bundle is about, as the hospital names them: `Rowan Ellery Marsh`; undefined when it names none. */
export function patientName(bundle: Bundle): string | undefined {
  const name = officialName(bundle);
  return name === undefined
    ? undefined
    : [...(name.given ?? []), name.family].filter(Boolean).join(" ");
}

/** Every name the Patient of a FHIR Bundle holds (official, usual, maiden), as `{ name, family }`. */
export function patientNames(
  bundle: Bundle,
): { name: string; family: string | undefined }[] {
  return (patientOf(bundle)?.name ?? []).map((each) => ({
    name: [...(each.given ?? []), each.family].filter(Boolean).join(" "),
    family: each.family,
  }));
}

function officialName(bundle: Bundle): HumanName | undefined {
  const names = patientOf(bundle)?.name ?? [];
  return names.find(({ use }) => use === "official") ?? names[0];
}

const nameWords = (name: string) =>
  String(name)
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

const GRADES = ["certainly-not", "possible", "certain"];

/**
 * How sure it is that a record whose Patient holds `names` (`{ name, family }`, see `patientNames`) is about the person
 * `subject`, by the best of the names: `certain` when a name is the same, `possible` when a family name is among the
 * subject's words, else `certainly-not`; undefined when the subject or every name is blank. Case, the spaces at either
 * end and the Unicode form of a letter do not count.
 */
export function gradePerson(
  subject: string | undefined,
  names: readonly { name?: string; family?: string }[],
): string | undefined {
  const mine = nameWords(subject ?? "");
  const grades = names.flatMap(({ name, family }) => {
    const theirs = nameWords(name ?? "");
    if (mine.length === 0 || theirs.length === 0) return [];
    if (mine.join(" ") === theirs.join(" ")) return ["certain"];
    const surname = nameWords(family ?? "");
    return surname.length > 0 && surname.every((word) => mine.includes(word))
      ? ["possible"]
      : ["certainly-not"];
  });
  return grades.sort((a, b) => GRADES.indexOf(b) - GRADES.indexOf(a))[0];
}

/** The id of the new-pod box's checkbox, and the name of the field it adds to whichever form makes the pod. */
export const ENCRYPT_BOX = "encrypt-pod";
export const ENCRYPT_FIELD = "encrypt";

/** What the person is told of each way a pod can fail to open, by `Unopened`'s outcome. */
export const UNOPENED: Readonly<Record<string, string>> = {
  "incorrect secret":
    "Those words don't open this pod. Check each word and try again.",
  malformed:
    "This pod's encryption header is damaged or was changed, so no words were tried.",
  "unsupported version":
    "A newer version of Cascade encrypted this pod. Update the app to open it.",
  "cannot open": "This pod can only be opened another way, not with six words.",
};

/** What the six-words page says when the check fails, by the way it failed. */
export const NOT_WORDS = "Those aren't words 2 and 5.";
export const WORDS_CHANGED =
  "Don't change the Password field or take a suggested password: it must hold the six words above, so your password manager saves the words that open the pod.";
export const POD_CHANGED =
  "The Pod field must keep the pod's name, so the saved login matches the Open page.";

/**
 * What is wrong with the visible `password` and `username` of a submitted six-words form, or undefined when they are
 * still the `words` shown (spaces compared as single ones) and the pod's name `pod`. Never repeats a submitted value.
 */
export function savedLoginChanged(
  fields: { get(name: string): unknown },
  pod: string,
  words: string,
): string | undefined {
  const joined = String(fields.get("password") ?? "")
    .trim()
    .split(/\s+/)
    .join(" ");
  if (joined !== words) return WORDS_CHANGED;
  if (String(fields.get("username") ?? "") !== pod) return POD_CHANGED;
  return undefined;
}

/**
 * What the page says after a File menu item, from its address's `query`: `deleted=<n>`, how many pods went; `reset`,
 * that the pods `kits` are back; else undefined.
 */
export function didNote(
  query: { get(name: string): string | null; has(name: string): boolean },
  kits: readonly string[],
): string | undefined {
  const deleted = query.get("deleted");
  if (deleted !== null && /^\d+$/.test(deleted)) {
    const count = Number(deleted);
    return count === 0
      ? "There was no pod to delete."
      : `Deleted ${count} ${count === 1 ? "pod" : "pods"}.`;
  }
  if (query.has("reset"))
    return `Reset: ${listed(kits.map((kit) => personName(kit)))} ${kits.length === 1 ? "is" : "are"} back.`;
  return undefined;
}

/** A reference table's name in an address: its `urn:uuid:` without the prefix. */
export function tableId(series: string): string {
  return series.replace(/^urn:uuid:/, "");
}

/** How long before `now` the time `at` was: `just now`, `5 minutes ago`, `2 hours ago`, `3 days ago`. */
export function ago(at: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(at)) / 60_000);
  if (Number.isNaN(minutes)) return "at an unknown time";
  const said = (count: number, unit: string) =>
    `${count} ${unit}${count === 1 ? "" : "s"} ago`;
  if (minutes < 1) return "just now";
  if (minutes < 60) return said(minutes, "minute");
  if (minutes < 60 * 24) return said(Math.floor(minutes / 60), "hour");
  return said(Math.floor(minutes / (60 * 24)), "day");
}

/**
 * How fresh a series is, at `now`, in sentences: when the publisher's watcher last checked its source and whether it
 * found a new release, when this app last read the feed, and when the feed last changed.
 */
export function freshness(
  series: Pick<Series, "watched" | "checked" | "modified">,
  now = Date.now(),
): string {
  const { watched, checked, modified } = series;
  return [
    watched === undefined
      ? "The feed does not say when its watcher last checked the publisher."
      : `The watcher checked the publisher ${ago(watched.at, now)}: ${watched.found === "new" ? "a new release" : "nothing new"}.`,
    checked === undefined
      ? "This app has not read the feed yet."
      : `This app last read the feed ${ago(checked, now)}.`,
    modified !== undefined && `The feed last changed on ${day(modified)}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** A version as a person reads it: `version 2, Oct 8, 2026`. */
export function versionName({ label, issued }: Version): string {
  return [
    label === undefined ? "an unlabelled version" : `version ${label}`,
    issued !== undefined && day(issued),
  ]
    .filter(Boolean)
    .join(", ");
}

/** A code, as written: the end of its IRI. */
export function codeShown(code: string): string {
  return code.replace(/^.*[/#]/, "");
}

/** What a code's `about` says of its status, in words starting `said`: `Retired`, `Retired, replaced by 141`, or nothing. */
export function statusOf(about: About | undefined, said = "Retired"): string {
  const status = about?.status;
  if (status?.deprecated !== true) return "";
  return status.replacedBy.length === 0
    ? said
    : `${said}, replaced by ${listed(status.replacedBy.map(codeShown))}`;
}

/** The licences tables are published under, by their IRI, as a person names them. */
export const LICENCES: Readonly<Record<string, string>> = {
  "http://creativecommons.org/publicdomain/zero/1.0/": "CC0 1.0",
  "http://creativecommons.org/publicdomain/mark/1.0/": "Public domain",
};

/** What a panel's `ObservationRequiredInPanel` says, as LOINC writes it; a value not listed (R-a, Rflx) is shown as written. */
export const REQUIRED: Readonly<Record<string, string>> = {
  R: "required",
  O: "optional",
  C: "conditional",
};

/** The relations of a drug class row, in the order a page lists them, and what a person calls each. */
export const RELATIONS = [
  ["establishedPharmacologicClass", "Established pharmacologic class"],
  ["mechanismOfAction", "Mechanism of action"],
  ["physiologicEffect", "Physiologic effect"],
  ["chemicalStructure", "Chemical structure"],
].map(([term, name]) => [`${REC}${term}`, name]);

export const relationName = (relation: string) =>
  RELATIONS.find(([each]) => each === relation)?.[1] ?? notationOf(relation);

/** What a connection's box says while it brings a record in. */
export const BRINGING = "Bringing the record in…";

/** The page a query's `page` asks for: a whole number from 1, else 1. */
export function pageNumber(asked: unknown): number {
  const page = Number(asked);
  return Number.isSafeInteger(page) && page > 1 ? page : 1;
}

/** The words every label starts with, or, when they share none or there is one, the first label. */
function shared(labels: readonly string[]): string {
  const [first = "", ...others] = labels;
  const words = first.split(" ");
  let length = words.length;
  for (const other of others) {
    const theirs = other.split(" ");
    let same = 0;
    while (same < length && words[same] === theirs[same]) same += 1;
    length = same;
  }
  return length === 0 || others.length === 0
    ? first
    : words.slice(0, length).join(" ");
}

/**
 * The sources of the series `held` gives, in its order: each the feed's `source` of its series, or a series with none
 * its own; named by the words its series' labels share.
 */
export function sourcesOf(held: readonly Series[]): Source[] {
  const sources = new Map<string, Series[]>();
  for (const series of held) {
    const iri = series.source ?? series.iri;
    sources.set(iri, [...(sources.get(iri) ?? []), series]);
  }
  return [...sources].map(([iri, series]) => ({
    iri,
    label: shared(series.map(({ label }) => label)),
    series,
  }));
}

/**
 * What the tables say of the classes `rows` (`pod.medicationClasses()`'s answer) hold and of the codes they were
 * reached through, as `about` answers: their names. Names nothing when the tables cannot say.
 */
export async function classesSaid(
  rows: readonly Row[],
  { tables }: { tables: Pick<Tables, "about"> },
): Promise<Map<string, About>> {
  return tables.about([
    ...new Set(rows.flatMap((row) => [row.class, row.through]).filter(Boolean)),
  ]);
}

/**
 * Of the `medications` (rows of `pod/My active medications`) in no class of `rows`, those whose code is in no class
 * though FDA classes a different form of its ingredient, by the code: the names of those ingredients. Says nothing
 * when the tables cannot say.
 */
export async function classedElsewhere(
  rows: readonly Row[],
  medications: readonly Row[],
  { tables }: { tables: Pick<Tables, "about" | "classedElsewhere"> },
): Promise<Map<string, (string | undefined)[]>> {
  const classed = new Set(rows.map(({ entry }) => entry));
  const codes = [
    ...new Set(
      medications
        .filter(({ entry, code }) => !classed.has(entry) && code !== undefined)
        .map(({ code }) => code),
    ),
  ];
  if (codes.length === 0) return new Map();
  const found = await tables.classedElsewhere(codes);
  const about = await tables.about([...new Set([...found.values()].flat())]);
  const nameOf = (code: string) =>
    about.get(code)?.name?.label ??
    about.get(code)?.notation ??
    notationOf(code);
  return new Map(
    [...found].map(([code, ingredients]) => [code, ingredients.map(nameOf)]),
  );
}

/**
 * What the tables say of the panel and of the codes `rows` (`pod.panelResults(panel)`'s answer) hold: their names. Names
 * nothing when the tables cannot say.
 */
export async function panelSaid(
  panel: string,
  rows: readonly Row[],
  { tables }: { tables: Pick<Tables, "about"> },
): Promise<Map<string, About>> {
  return tables.about([
    ...new Set([panel, ...rows.flatMap((row) => [row.member, row.via])]),
  ]);
}

/** What a check of the feeds did, by feed, as `checkTables` gives it. */
export interface Checked {
  readonly kept: readonly string[];
  readonly later?: string;
  readonly refused: readonly { readonly reason: string }[];
}

/**
 * What a check did, as one note: `checked` its answer, `held` what the app holds after it, as `held()` gives it, to
 * name each version kept.
 */
export function checkedNote(
  checked: readonly Checked[],
  held: readonly Series[],
): string {
  const kept = checked.flatMap((each) => each.kept);
  const named = (version: string) => {
    const series = held.find((each) =>
      each.versions.some((one) => one.iri === version),
    );
    const found = series?.versions.find((one) => one.iri === version);
    return series === undefined
      ? "a version"
      : `${series.label}, ${versionName(found!)}`;
  };
  const said = [
    kept.length > 0 && `Kept ${listed(kept.map(named))}.`,
    ...checked.flatMap(({ later }) =>
      later === undefined ? [] : [`Not read now, tried again later: ${later}.`],
    ),
    ...checked.flatMap(({ refused }) =>
      refused.map(({ reason }) => `Refused a version: ${reason}.`),
    ),
  ].filter(Boolean);
  return said.length === 0 ? "Checked the feeds: nothing new." : said.join(" ");
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
/** An instant as a program gives it: to the second, with a timezone, every part one the demo hospitals accept. */
const WORLD_INSTANT =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,9})?(Z|[+-]((0\d|1[0-3]):[0-5]\d))$/;

/** Whether `text`, as `YYYY-MM-DD`, names a day of the calendar. */
function isDay(text: string): boolean {
  const day = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(text);
}

/**
 * The world's date a person or a program gave, as the instant a hospital answers as of: a calendar day `D`
 * (`YYYY-MM-DD`) is the end of that day in UTC, `D` and `T23:59:59Z`; an instant with a timezone is kept as it is.
 * Undefined for anything else, empty text and a year below 1000 included.
 */
export function worldInstant(text: unknown): string | undefined {
  const given = String(text ?? "").trim();
  if (Number(given.slice(0, 4)) < 1000) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(given))
    return isDay(given) ? `${given}T23:59:59Z` : undefined;
  return WORLD_INSTANT.test(given) &&
    isDay(given.slice(0, 10)) &&
    !Number.isNaN(Date.parse(given))
    ? given
    : undefined;
}

/** An instant in UTC, as a pull.json states it: `2024-02-01T07:00:00Z` for `2024-02-01T09:00:00+02:00`; undefined stays undefined. */
export function utcInstant(asOf: string | undefined): string | undefined {
  return asOf === undefined
    ? undefined
    : new Date(Date.parse(asOf)).toISOString().replace(".000Z", "Z");
}

/** A time of the app's clock as the person's own day, in the words `dayInWords` uses: `29 January 2024`. */
function localDayInWords(text: string): string {
  const date = new Date(Date.parse(String(text)));
  return Number.isNaN(date.getTime())
    ? String(text)
    : `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** The UTC day of an instant, in words: `1 February 2024`. */
export function dayInWords(asOf: string): string {
  const day = new Date(Date.parse(asOf));
  return `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]} ${day.getUTCFullYear()}`;
}

/** What the hospitals answer as of, said in words: `Hospitals answer as of 1 February 2024.`, or with no date, with everything. */
export function worldDateSaid(asOf: string | undefined): string {
  if (asOf === undefined) return "Hospitals answer with everything they hold.";
  return `Hospitals answer as of ${dayInWords(asOf)}.`;
}

/** What a pull answered as of, in words: `Pulled as of 1 February 2024.`; undefined when no date was set. */
export function pulledAsOfSaid(asOf: string | undefined): string | undefined {
  return asOf === undefined ? undefined : `Pulled as of ${dayInWords(asOf)}.`;
}

/** What to tell a person of a connection that ended early, and whether signing in again can help. */
export interface Failure {
  said(name: string): string;
  readonly again: boolean;
}

/**
 * What to tell a person of a connection that ended early, by the `kind` of its `ConnectionFailure`: what happened at
 * the hospital called `name`, and what to do. Never a host, a status or a code. `again` is whether signing in again
 * can help: false for a failure that every try meets the same way.
 */
const FAILURES: Readonly<Record<string, Failure>> = {
  cancelled: {
    said: (name) =>
      `The sign-in at ${name} was cancelled, so nothing was brought in. Sign in again when you are ready.`,
    again: true,
  },
  "state-mismatch": {
    said: (name) =>
      `The sign-in at ${name} did not come back the way it was started, so it was dropped. Sign in again.`,
    again: true,
  },
  "host-not-allowed": {
    said: (name) =>
      `${name}'s address is not one the app will talk to, so nothing was fetched.`,
    again: false,
  },
  "cap-exceeded": {
    said: (name) =>
      `${name}'s record is larger than the app brings in at once, so it stopped. Nothing was brought in.`,
    again: false,
  },
  unauthorized: {
    said: (name) =>
      `${name} did not accept the access token, so the record stopped coming in. Sign in again to carry on.`,
    again: true,
  },
  "retries-exhausted": {
    said: (name) =>
      `${name} did not answer after several tries. Wait a little, then sign in again.`,
    again: true,
  },
  "sign-in-unavailable": {
    said: (name) =>
      `The sign-in at ${name} could not be started, so nothing was brought in. If it keeps happening, the app's sign-in setup needs a look.`,
    again: false,
  },
  "hospital-error": {
    said: (name) =>
      `${name} refused the sign-in or sent something the app cannot read. Sign in again; if it keeps happening, the hospital's side needs a look.`,
    again: true,
  },
};

/**
 * What to say of a failed connection of `kind` at the hospital `name`, as `{ said, again }`; undefined for a kind not
 * known. A surface whose cause differs gives `overrides`, a map of kind to the same `{ said, again }` shape.
 */
export function failureSaid(
  kind: string,
  name: string,
  overrides: Readonly<Record<string, Failure>> = {},
): { said: string; again: boolean } | undefined {
  const row = overrides[kind] ?? FAILURES[kind];
  return row === undefined
    ? undefined
    : { said: row.said(name), again: row.again };
}

/** The question a click on an "Ask about this" button for `context` sends at once; undefined for a kind it does not know. */
export function firstQuestion(
  context: { readonly kind?: string } | undefined,
): string | undefined {
  const questions: Readonly<Record<string, string>> = {
    finding: "What does this change show?",
    trend: "What does this trend show?",
    entry: "What is this, and where did it come from?",
    worth: "What does this flag mean?",
  };
  return Object.hasOwn(questions, context?.kind as PropertyKey)
    ? questions[context!.kind!]
    : undefined;
}

/** A tool's input, as its door checked it against the tool's schema; `pod` for a tool with `ofPod`. */
export type ToolInput = Readonly<Record<string, string | undefined>>;

/** The PodApi operations the tools a page runs call, each as PodApi answers it. */
export interface PageToolsApi {
  pod(input: { pod: string }): Promise<unknown>;
  trend(input: {
    pod: string;
    test?: string;
    medication?: string;
    named?: boolean;
  }): Promise<unknown>;
  ask(input: { pod: string; question: string }): Promise<unknown>;
  makePod(input: { person: string }): Promise<unknown>;
  checkTables(input: object): Promise<unknown>;
  setWorldDate(input: { date: string }): Promise<unknown>;
}

/** What a door gives the tools that move its app: its own addresses, and `open`, which moves the app to one. */
export interface PageDoor {
  readonly address: {
    pod(name: string): string;
    trend(
      name: string,
      trend: { test: string; medication?: string | undefined },
    ): string;
    entry(name: string, entry: string): string;
  };
  open(address: string): Promise<void>;
}

/** A tool a page can run itself, with no runtime: it moves the app, or writes once the person has said yes (`ask`). */
export interface PageTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: object;
  readonly tier: "free" | "ask";
  readonly ofPod?: true;
  readonly opens?: true;
  run(api: PageToolsApi, input: ToolInput, door: PageDoor): Promise<unknown>;
}

/** An error its door tells by its name, as PodApi's own refusals: the input was turned down and nothing was done. */
export const refusal = (message: string): Error =>
  Object.assign(new Error(message), { name: "Refusal" });

export const NO_INPUT = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

/** Goes to `address` by the door's `open`, and gives it. */
async function going(address: string, { open }: PageDoor) {
  await open(address);
  return { opened: address };
}

/**
 * The tools a page runs itself, the last six of `TOOLS` in `tools.mjs`: the three that move the app, each giving
 * `{ opened }`, and the three writes the person confirms first, each giving PodApi's answer. They need no runtime, so
 * the Node target's chat runs them in the page.
 */
export const PAGE_TOOLS: readonly PageTool[] = [
  {
    name: "open_pod",
    description: "Opens a pod's page in the app.",
    inputSchema: NO_INPUT,
    tier: "free",
    ofPod: true,
    opens: true,
    async run(api, { pod = "" }, door) {
      await api.pod({ pod });
      return going(door.address.pod(pod), door);
    },
  },
  {
    name: TREND_VIEW.name,
    description: TREND_VIEW.description,
    inputSchema: TREND_VIEW.inputSchema,
    tier: "free",
    ofPod: true,
    opens: true,
    async run(api, { pod = "", test, medication }, door) {
      const drug = medication === "" ? undefined : medication;
      const { series, timeline } = (await api.trend({
        pod,
        ...(test === undefined ? {} : { test }),
        ...(drug === undefined ? {} : { medication: drug }),
        named: false,
      })) as {
        series: { test: { notation?: string; code: string } };
        timeline: { notation?: string; code?: string; name: string }[];
      };
      const wanted = drug?.toLowerCase();
      const found =
        drug === undefined
          ? undefined
          : timeline.find(
              (each) =>
                each.notation === drug ||
                each.code === drug ||
                each.name.toLowerCase() === wanted,
            );
      return going(
        door.address.trend(pod, {
          test: series.test.notation ?? series.test.code,
          ...(found === undefined
            ? {}
            : { medication: found.notation ?? found.name }),
        }),
        door,
      );
    },
  },
  {
    name: "open_entry",
    description:
      "Opens the page of one entry of a pod: what it is and where it came from.",
    inputSchema: {
      type: "object",
      properties: {
        entry: {
          type: "string",
          description:
            "The entry's IRI or ID, as the entry column of the rows of ask gives it.",
        },
      },
      required: ["entry"],
      additionalProperties: false,
    },
    tier: "free",
    ofPod: true,
    opens: true,
    async run(api, { pod = "", entry = "" }, door) {
      const { rows } = (await api.ask({ pod, question: SOURCES })) as {
        rows: { entry: string }[];
      };
      if (!rows.some((row) => entryId(row.entry) === entryId(entry)))
        throw refusal(
          `the pod ${pod} holds no entry ${entry}; ask's rows give each entry's ID in their entry column`,
        );
      return going(door.address.entry(pod, entry), door);
    },
  },
  {
    name: "make_pod",
    description:
      "Makes a pod for a person, named after them: empty, or the sample of that name; a pod of that name already there is left as it is. It is never encrypted.",
    inputSchema: {
      type: "object",
      properties: {
        person: {
          type: "string",
          description: "The person's name, as they write it.",
        },
      },
      required: ["person"],
      additionalProperties: false,
    },
    tier: "ask",
    run: (api, { person = "" }) => api.makePod({ person }),
  },
  {
    name: "check_tables",
    description:
      "Checks each source of the reference tables for a newer version and keeps any there is.",
    inputSchema: NO_INPUT,
    tier: "ask",
    run: (api) => api.checkTables({}),
  },
  {
    name: "set_world_date",
    description:
      "Sets the date the demo hospitals answer as of: their records as they stood at the end of that day. An empty date takes it back to everything they hold.",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description:
            "A day as YYYY-MM-DD, or an instant with its timezone; empty for none.",
        },
      },
      required: ["date"],
      additionalProperties: false,
    },
    tier: "ask",
    run: (api, { date = "" }) => api.setWorldDate({ date }),
  },
];
