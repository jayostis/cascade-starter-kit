// What the starter reads of its pods and its reference tables, once, for every host: the Node server, the browser
// target, the chat, the MCP server and `npm run ask`. A host gives the pods, the tables and what only it knows;
// every operation takes and gives plain JSON, and refuses bad input with a `Refusal`.
import {
  changesIn,
  changeTools,
  checkInput,
  connect,
  ConnectionFailure,
  ConnectRefused,
  connectFiles,
  DEMO_PLAN,
  findChanges,
  labSeriesIn,
  pull,
  PullRefused,
  pullFiles,
  Refusal,
  searchDirectory,
  serverReport,
  sixWords,
  timelineIn,
  typedWords,
  Unopened,
  type Checked,
  type DirectoryRow,
  type ImportProgress,
  type InputSchema,
  type Pod,
  type Pull,
  type Registration,
  type SignIn,
  type Tables,
} from "cascade-runtime";
import {
  citedFinding,
  type TableLookups,
  unknownChangeTool,
} from "cascade-runtime/tools";
import {
  type Abouts,
  type Answers,
  classedElsewhere,
  classesSaid,
  codesSaid,
  entryId,
  entryOf,
  HISTORY,
  joinedBy,
  LABS,
  maps,
  MEDICATIONS,
  NOT_WORDS,
  pageNumber,
  panelSaid,
  panelsOf,
  patientName,
  patientNames,
  QUESTIONS,
  savedLoginChanged,
  slug,
  sourcesOf,
  tableId,
  testsIn,
  trendInput,
  utcInstant,
  type VariantsSaid,
  variantsSaid,
  withMechanism,
  worldInstant,
  worthALook,
} from "./said.ts";
import type { Input, Operation } from "./server/inputs.ts";

export { maps };

/** Why a host that opens no encrypted pod refuses the pod `name`, in one line. */
export function notOpenedHere(name: string): string {
  return `${name} is encrypted: open it in the app (\`npm start\`) with its six words; this command does not open encrypted pods`;
}

/** What the app asks a hospital it signs in at to let it read. */
export const SCOPES = ["launch/patient", "patient/*.read", "patient/*.rs"];

/** How long a `connection` call with `wait` holds before it answers the connection as it is. */
const WAIT_MS = 25_000;

/** What a person is told when a bring-in or a pull's files fail for a reason that is the app's, not the record's. */
const NOT_BROUGHT_IN =
  "Not brought in: the app hit an error of its own. Try again, and if it happens again, restart the app.";
const PULL_BROKEN =
  "The pull could not be saved: the app hit an error of its own.";

/** The steps of a connection that are under way. */
const UNDER_WAY = ["signing in", "pulling", "bringing in"];

/** Names Windows keeps for devices, which no folder may have. */
const DEVICES = /^(con|prn|aux|nul|com\d|lpt\d)$/;

const NOT_WAITING =
  "These six words are not waiting any more. Make the pod again.";

/** The pod as `said.ts` reads its rows: by the fields its queries give each, which `Row` leaves open. */
const byFields = (pod: Pod) =>
  pod as unknown as Parameters<typeof variantsSaid>[1]["pod"] &
    Parameters<typeof joinedBy>[0];

const pairs = <K, V>(map: ReadonlyMap<K, V> | undefined) =>
  map === undefined ? undefined : [...map];

/** A tool `tool` runs, as a model is told of it. */
export interface PodTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: InputSchema;
}

const WORTH_A_LOOK: PodTool = {
  name: "worth_a_look",
  description:
    "What a pod's page lists under Worth a look, in its order: each line's sentence, the ID of the entry it is about and its tag. It states what is flagged (an entry that needs review, a report that differs from ClinVar today, medications that share an ingredient), never why; there are none when nothing is.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

/** The tools `tool` runs that the runtime's `cascade-runtime/tools` does not offer, as a model is told of them. */
export const POD_TOOLS: readonly PodTool[] = [WORTH_A_LOOK];

/** What a field a client may send can be: how its refusal reads, and which values pass. */
type Check = readonly [what: string, is: (value: unknown) => boolean];

const string: Check = ["a string", (value) => typeof value === "string"];
const boolean: Check = ["true or false", (value) => typeof value === "boolean"];
const positiveInteger: Check = [
  "a whole number from 1",
  (value) => Number.isSafeInteger(value) && (value as number) > 0,
];
const object: Check = [
  "an object",
  (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value),
];
const waitFor: Check = [
  'true or "change"',
  (value) => value === true || value === "change",
];

/** The check each input a client may send must pass when it is given, by operation. */
export const INPUTS: Readonly<
  Record<Operation, Readonly<Record<string, Check>>>
> = {
  pods: {},
  held: {},
  pod: { pod: string },
  answers: { pod: string },
  said: { pod: string, entry: string },
  trend: { pod: string, test: string, medication: string, named: boolean },
  classes: { pod: string },
  panel: { pod: string, panel: string },
  table: { id: string, q: string, page: positiveInteger, code: string },
  ask: { pod: string, question: string, limit: positiveInteger },
  tool: { pod: string, tool: string, input: object },
  makePod: { person: string, encrypt: boolean },
  waitingWords: { pod: string },
  confirmWords: {
    pod: string,
    word2: string,
    word5: string,
    password: string,
    username: string,
  },
  unlock: { pod: string, secret: string },
  deleteAll: {},
  resetAll: {},
  checkTables: {},
  setWorldDate: { date: string },
  hospitals: { q: string },
  connect: { pod: string, fhirBase: string },
  connection: { pod: string, connection: positiveInteger, wait: waitFor },
  bring: { pod: string, connection: positiveInteger },
};

/** The operations a client may call, which is every member of `podApi(host)` but `close`. */
export const OPERATIONS = Object.keys(INPUTS) as Operation[];

/** Why the operation `name` refuses `input`, an input that is no object or holds a field of the wrong type; else nothing. */
export function inputRefusal(
  name: Operation,
  input: unknown,
): string | undefined {
  if (!object[1](input)) return "the input must be an object";
  const fields = input as Record<string, unknown>;
  for (const [field, [what, is]] of Object.entries(INPUTS[name]))
    if (fields[field] !== undefined && !is(fields[field]))
      return `${field} must be ${what}`;
  return undefined;
}

/** The hospitals a host signs in at: the directory, who the app is there, and how a sign-in reaches the person. */
export interface Hospitals {
  directory(): Promise<readonly DirectoryRow[]>;
  readonly registration: Omit<Registration, "scopes">;
  fetch: typeof fetch;
  /** Resolves once the hospital of `row` can be signed in at. */
  ready(row: DirectoryRow): Promise<void>;
  /** The sign-in of one connection, which hands the authorize URL to `report` once it has one. */
  signIn(
    row: DirectoryRow,
    at: { pod: string; connection: number },
    report: (authorize: string) => void,
  ): SignIn;
  /** What a pull from the hospital is named after. */
  pullName(row: DirectoryRow): string;
}

/** The world's date the demo hospitals answer as of: an instant, or undefined for every version they hold. */
export interface World {
  get(): string | undefined | Promise<string | undefined>;
  set(asOf: string | undefined): void | Promise<void>;
}

/** What only the host knows: where the pods are, the tables, the samples, the hospitals and the world's date. */
export interface PodHost {
  readonly pods: {
    names(): Promise<string[]>;
    title(name: string): Promise<string | undefined>;
    open(
      name: string,
      options?: { title?: string; secret?: string },
    ): Promise<Pod>;
    /** Removes the pods and their answers, with `all` every answer kept; never the reference tables. */
    remove(
      names: readonly string[],
      options?: { all?: boolean },
    ): Promise<void>;
  };
  /** The sample pods, by name, that a pod of that name is copied from; none on a host that has none. */
  readonly samples?: readonly string[];
  copySample?(name: string): Promise<Pod>;
  /** Loads the kits' pods again, giving their names, on a host that has no samples. */
  restore?(): Promise<string[]>;
  tables(pod?: Pod): Promise<Tables>;
  checkTables(): Promise<Checked[]>;
  /** Whether an encrypted pod is asked for its words, rather than refused. */
  readonly opensEncrypted: boolean;
  /** Told when the tables cannot say what a page would name: `names`, or `variants`. */
  unsaid?(kind: string, error: Error): void;
  hospitals?: Hospitals;
  world?: World;
}

/** Each connection to a hospital, as the operations follow it. */
interface Underway {
  readonly pod: string;
  readonly row: DirectoryRow;
  readonly n: number;
  readonly name: string;
  step: string;
  requests: number;
  readonly asOf: string | undefined;
  readonly waiting: (() => void)[];
  readonly stop: AbortController;
  pulled?: Promise<Pull>;
  files?: Promise<Saved>;
  bringing?: ImportProgress;
  failed?: string;
  /** Why the pod holds no record of the connect, when it does not; the pull goes on. */
  notRecorded?: string;
  retry?: boolean;
  imported?: boolean;
  broughtIn?: boolean;
}

/** A connection's pull saved as files, or why there are none. */
type Saved =
  | { pulled: Pull; files: ReadonlyMap<string, Uint8Array>; failed?: never }
  | { failed: string; failure?: string; pulled?: never; files?: never };

/** `operation`, refusing an input that is no object or holds a field of the wrong type. */
function typed<K extends Operation, Output>(
  name: K,
  operation: (input: Input<K>) => Promise<Output>,
): (input?: Input<K>) => Promise<Output> {
  return async (input = {} as Input<K>) => {
    const refused = inputRefusal(name, input);
    if (refused !== undefined) throw new Refusal(refused);
    return operation(input);
  };
}

/** The operations over the pods and tables `host` gives; `host.hospitals` and `host.world` are read at each call. */
export function podApi(host: PodHost) {
  /** Each pod this instance opened, by name, as the promise of its opening. */
  const opened = new Map<string, Promise<Pod>>();
  /** The title each pod keeps, by name, once read. */
  const titles = new Map<string, string>();
  /** The last answers given for each pod, by name, as `answers` gave them. */
  const last = new Map<string, Answered>();
  /** The pods the folder was last seen to hold, so one page scans it once: a pod seen needs no second scan. */
  const seen = new Set<string>();
  /** The six words of each encrypted pod being made, and the person's name as typed, by the pod's name, until checked. */
  const waiting = new Map<string, { words: string; person: string }>();
  /** Each connection to a hospital, by its number; `count` numbers the next. */
  const connections = new Map<number, Underway>();
  let count = 0;

  /** Whether a record is being brought into the pod: its answers are then the ones last given, until it is in. */
  const bringingInto = (name: string) =>
    [...connections.values()].some(
      (each) => each.pod === name && each.bringing !== undefined,
    );

  /** The hospitals the host signs in at, which a Node host is given once its server listens. */
  function hospitalsOf(): Hospitals {
    if (host.hospitals === undefined)
      throw new Error("The app's hospitals are not set up yet.");
    return host.hospitals;
  }

  /** The pod named, opened once with `options` and kept; a failed opening is forgotten. */
  function openOnce(
    name: string,
    options?: { title?: string; secret?: string },
  ): Promise<Pod> {
    let opening = opened.get(name);
    if (opening === undefined) {
      opening = host.pods.open(name, options);
      opening.catch(() => opened.delete(name));
      opened.set(name, opening);
    }
    return opening;
  }

  function sampleFor(name: string): Promise<Pod> {
    let copying = opened.get(name);
    if (copying === undefined) {
      const copy = host.copySample;
      if (copy === undefined)
        throw new Error(`The host has no sample to copy ${name} from.`);
      copying = (async () => copy(name))();
      copying.catch(() => opened.delete(name));
      opened.set(name, copying);
    }
    return copying;
  }

  /** Closes the pods this instance opened, the encrypted ones too unless `plaintextOnly`, and forgets the last answers. */
  async function closeOpened({ plaintextOnly = false } = {}) {
    const closing: Promise<void>[] = [];
    for (const [name, opening] of [...opened]) {
      const pod = await opening.catch(() => undefined);
      if (plaintextOnly && pod?.encrypted) continue;
      opened.delete(name);
      if (pod !== undefined) closing.push(pod.close());
    }
    last.clear();
    seen.clear();
    if (!plaintextOnly) titles.clear();
    await Promise.allSettled(closing);
  }

  /** The title the pod keeps, read once, else its name. */
  async function titleOf(name: string): Promise<string> {
    if (!titles.has(name)) {
      const title = await host.pods.title(name);
      if (title !== undefined) titles.set(name, title);
    }
    return titles.get(name) ?? name;
  }

  async function held(tables = host.tables()) {
    return (await tables).held();
  }

  /** The pod named, which must be one there is: its name. */
  async function known(name: string | undefined): Promise<string> {
    if (name !== undefined && (seen.has(name) || opened.has(name))) return name;
    const names = await host.pods.names();
    seen.clear();
    for (const each of names) seen.add(each);
    if (name === undefined || !names.includes(name))
      throw new Refusal(
        names.length === 0
          ? `there is no pod ${name}, and no pod at all`
          : `there is no pod ${name}; the pods are ${names.join(", ")}`,
      );
    return name;
  }

  /** The pod there is by `name`, opened; a host that opens no encrypted pod refuses one. */
  async function podNamed(name: string): Promise<Pod> {
    try {
      return await openOnce(name);
    } catch (error) {
      if (error instanceof Unopened && !host.opensEncrypted)
        throw new Refusal(notOpenedHere(name));
      throw error;
    }
  }

  async function asked(pod: Pod) {
    const answers: Answers = Object.fromEntries(
      await Promise.all(
        QUESTIONS.map(async (question) => [question, await pod.ask(question)]),
      ),
    );
    const changes = changesIn(answers[HISTORY] ?? [], answers[LABS] ?? [], {
      limit: 20,
    });
    return {
      answers: await withMechanism(answers, changes, (question) =>
        pod.ask(question),
      ),
      changes,
      unheld: await pod.unheldTableVersions(),
    };
  }
  type Answered = Awaited<ReturnType<typeof asked>>;

  async function answers({ pod: given }: Input<"answers">) {
    const name = await known(given);
    const pod = await podNamed(name);
    const kept = bringingInto(name) ? last.get(name) : undefined;
    if (kept !== undefined) return kept;
    const answered = await asked(pod);
    last.set(name, answered);
    return answered;
  }

  /** What the tables say of the codes `answered` holds; nothing when they cannot say, which the host is told. */
  function aboutCodes(answered: Answers, pod: Pod) {
    return host
      .tables(pod)
      .then((tables) => codesSaid(answered, { tables }))
      .catch((error: Error) => {
        host.unsaid?.("names", error);
        return undefined;
      });
  }

  async function variantsOf(answered: Answers, pod: Pod) {
    try {
      return await variantsSaid(answered, {
        tables: await host.tables(pod),
        pod: byFields(pod),
      });
    } catch (error) {
      host.unsaid?.("variants", error as Error);
      return undefined;
    }
  }

  async function said({ pod: given, entry: id }: Input<"said">) {
    const name = await known(given);
    const pod = await podNamed(name);
    let answered = last.get(name) ?? (await answers({ pod: name }));
    if (id !== undefined && entryOf(answered.answers, id) === undefined) {
      answered = await answers({ pod: name });
      if (entryOf(answered.answers, id) === undefined)
        throw new Refusal(`the pod ${name} holds no entry ${id}`);
    }
    const [about, variants, heldNow] = await Promise.all([
      aboutCodes(answered.answers, pod),
      variantsOf(answered.answers, pod),
      held().catch(() => []),
    ]);
    const output = {
      ...(about !== undefined && { about: pairs(about) }),
      ...(variants !== undefined && {
        said: {
          ...variants,
          says: pairs(variants.says),
          labels: pairs(variants.labels),
          names: pairs(variants.names),
        },
      }),
      held: heldNow,
    };
    if (id === undefined) return output;
    const [panels, joined] = await Promise.all([
      host
        .tables()
        .then(async (tables) =>
          panelsOf(entryOf(answered.answers, id), {
            tables,
            held: await tables.held(),
          }),
        )
        .catch(() => []),
      joinedBy(byFields(pod)).catch(() => new Map<string, string[]>()),
    ]);
    return {
      ...output,
      entry: entryOf(answered.answers, id, {
        about,
        said: variants,
        held: heldNow,
        joined,
      }),
      panels,
      joined: pairs(joined),
    };
  }

  async function trend({
    pod: given,
    test,
    medication,
    named = true,
  }: Input<"trend">) {
    const name = await known(given);
    const pod = await podNamed(name);
    const [medications, labs] = await Promise.all([
      pod.ask(HISTORY),
      pod.ask(LABS),
    ]);
    const input = trendInput(
      { changes: changesIn(medications, labs, { limit: 20 }), labs },
      { test, medication },
    );
    if (input === undefined)
      throw new Refusal(`the pod ${name} holds no test results`);
    let series;
    try {
      series = labSeriesIn(labs, input.test);
    } catch (error) {
      if (!(error instanceof Refusal)) throw error;
      const tests = testsIn(labs).map(
        ({ code, notation, name: label }) =>
          `${notation ?? code}${label === undefined ? "" : ` (${label})`}`,
      );
      throw new Refusal(
        `${error.message}; ${tests.length === 0 ? "it holds no test results" : `the tests it holds are ${tests.join(", ")}`}`,
      );
    }
    const timeline = timelineIn(medications);
    const drug = input.medication;
    if (drug !== undefined) {
      const wanted = drug.toLowerCase();
      const found = timeline.find(
        (each) =>
          each.notation === drug ||
          each.code === drug ||
          each.name.toLowerCase() === wanted,
      );
      if (found === undefined) {
        const drugs = [
          ...new Set(timeline.map((each) => each.notation ?? each.name)),
        ];
        throw new Refusal(
          `no medication ${drug} in the pod; ${drugs.length === 0 ? "it holds no medications" : `the medications it holds are ${drugs.join(", ")}`}`,
        );
      }
    }
    const about = named
      ? await aboutCodes({ [HISTORY]: medications, [LABS]: labs }, pod)
      : undefined;
    return {
      labs,
      timeline,
      series,
      test: input.test,
      ...(drug !== undefined && { medication: drug }),
      ...(about !== undefined && { about: pairs(about) }),
    };
  }

  async function classes({ pod: given }: Input<"classes">) {
    const pod = await podNamed(await known(given));
    const [rows, medications] = await Promise.all([
      pod.medicationClasses(),
      pod.ask(MEDICATIONS),
    ]);
    const tables = await host.tables();
    const [about, elsewhere, heldNow] = await Promise.all([
      (async () => classesSaid(rows, { tables }))().catch(noop),
      (async () => classedElsewhere(rows, medications, { tables }))().catch(
        noop,
      ),
      held(Promise.resolve(tables)).catch(() => []),
    ]);
    return {
      rows,
      medications,
      ...(about !== undefined && { classes: pairs(about) }),
      ...(elsewhere !== undefined && { elsewhere: pairs(elsewhere) }),
      held: heldNow,
    };
  }

  async function panel({ pod: given, panel: code }: Input<"panel">) {
    const pod = await podNamed(await known(given));
    if (typeof code !== "string" || code === "")
      throw new Refusal("a panel is a LOINC code: name one");
    const [rows, labs] = await Promise.all([
      pod.panelResults(code),
      pod.ask(LABS),
    ]);
    const tables = await host.tables();
    const [about, heldNow] = await Promise.all([
      (async () => panelSaid(code, rows, { tables }))().catch(noop),
      held(Promise.resolve(tables)).catch(() => []),
    ]);
    return {
      panel: code,
      rows,
      labs,
      ...(about !== undefined && { panelAbout: pairs(about) }),
      held: heldNow,
    };
  }

  async function table({ id, q = "", page, code }: Input<"table">) {
    const tables = await host.tables();
    const heldNow = await tables.held();
    const sources = sourcesOf(heldNow);
    const series =
      id === undefined || code !== undefined
        ? undefined
        : heldNow.find((each) => tableId(each.iri) === id);
    const source =
      series !== undefined
        ? sources.find((each) => each.series.includes(series))
        : id === undefined
          ? sources[0]
          : sources.find((each) => tableId(each.iri) === id);
    if (source === undefined) {
      if (id === undefined) return { held: heldNow };
      throw new Refusal(`no reference table ${id} is held`);
    }
    const shown = pageNumber(page === undefined ? null : String(page));
    if (series !== undefined)
      return {
        held: heldNow,
        source,
        series,
        searched: await tables.search(series.iri, q, shown),
        uses: await tables.uses(),
      };
    const all = source.series.map(({ iri }) => iri);
    if (code !== undefined) {
      const found = await tables.codeNamed(
        [...new Set([...all, ...heldNow.map(({ iri }) => iri)])],
        code,
      );
      if (found === undefined)
        throw new Refusal(`${source.label} holds no code ${code}`);
      return {
        held: heldNow,
        source,
        facts: await tables.facts(found, all),
      };
    }
    return {
      held: heldNow,
      source,
      searched: await tables.search(all, q, shown),
    };
  }

  async function ask({ pod: given, question = "", limit }: Input<"ask">) {
    const pod = await podNamed(await known(given));
    const rows = await pod.ask(question);
    return {
      question,
      total: rows.length,
      rows: limit === undefined ? rows : rows.slice(0, limit),
    };
  }

  async function tool({ pod: given, tool: called, input = {} }: Input<"tool">) {
    if (called !== WORTH_A_LOOK.name) unknownChangeTool(String(called));
    const name = await known(given);
    const pod = await podNamed(name);
    if (called === WORTH_A_LOOK.name) {
      checkInput(WORTH_A_LOOK.inputSchema, input);
      const answered = last.get(name) ?? (await answers({ pod: name }));
      const { about, said: variants } = maps(await said({ pod: name }));
      return {
        value: worthALook(
          answered.answers,
          about as Abouts | undefined,
          variants as VariantsSaid | undefined,
        ).map(({ sentence, entry, tag }) => ({
          sentence,
          entry: entryId(entry),
          ...(tag === undefined ? {} : { tag }),
        })),
      };
    }
    const run = changeTools(pod).find((each) => each.name === called)!;
    if (called !== "find_changes") return { value: await run.execute(input) };
    checkInput(run.inputSchema, input);
    const found = await findChanges(pod, input);
    return { value: found.map(citedFinding), found };
  }

  /** What `reference_table_checks` asks of the tables and of the pod against them, as `cascade-runtime/tools` reads it. */
  async function tablesFor({
    pod: given,
  }: {
    pod: string;
  }): Promise<TableLookups> {
    const pod = await podNamed(await known(given));
    const tables = await host.tables(pod);
    return {
      held: () => tables.held(),
      about: (codes) => tables.about(codes),
      variantClassification: (variant) => tables.variantClassification(variant),
      agreement: () => pod.agreement(),
    };
  }

  async function makePod({ person = "", encrypt = false }: Input<"makePod">) {
    const name = slug(person);
    if (name === "")
      throw new Refusal(
        "Give a name with at least one letter from a to z, or a digit.",
      );
    if (DEVICES.test(name))
      throw new Refusal(
        "That name is one Windows keeps for itself: add another word.",
      );
    if ((await host.pods.names()).includes(name))
      return { pod: name, made: false };
    if (host.samples?.includes(name)) {
      await sampleFor(name);
      return { pod: name, loaded: true };
    }
    if (encrypt) {
      waiting.set(name, { words: sixWords(), person: person.trim() });
      return { pod: name, waiting: true };
    }
    await openOnce(name, { title: person.trim() });
    return { pod: name, made: true };
  }

  function waitingFor(name: string | undefined) {
    const words = name === undefined ? undefined : waiting.get(name);
    if (words === undefined) throw new Refusal(NOT_WAITING);
    return words;
  }

  async function confirmWords(input: Input<"confirmWords">) {
    const { pod: name, word2 = "", word5 = "" } = input;
    const { words, person } = waitingFor(name);
    const pod = name as string;
    const changed = savedLoginChanged(
      new Map(Object.entries(input)),
      pod,
      words,
    );
    if (changed !== undefined) throw new Refusal(changed);
    const asked = words.split(" ");
    if (typedWords(word2) !== asked[1] || typedWords(word5) !== asked[4])
      throw new Refusal(NOT_WORDS);
    waiting.delete(pod);
    if ((await host.pods.names()).includes(pod))
      throw new Refusal(
        `A pod named ${pod} exists already. Make the pod again under another name.`,
      );
    if (!(await openOnce(pod, { secret: words, title: person })).encrypted)
      throw new Error(`The pod ${pod} was made without its words.`);
    return { pod, made: true };
  }

  async function unlock({ pod: given, secret = "" }: Input<"unlock">) {
    const name = await known(given);
    try {
      await openOnce(name);
    } catch (error) {
      if (!(error instanceof Unopened)) throw error;
      if (secret.trim() === "")
        throw new Unopened("incorrect secret", "no secret was given");
      await openOnce(name, { secret });
    }
    return { pod: name, opened: true };
  }

  async function deleteAll() {
    const names = await host.pods.names();
    waiting.clear();
    forgetConnections();
    await closeOpened();
    await host.pods.remove(names, { all: true });
    return { deleted: names };
  }

  async function resetAll() {
    await deleteAll();
    const samples = host.samples ?? [];
    if (samples.length === 0) return { pods: (await host.restore?.()) ?? [] };
    for (const name of samples) await sampleFor(name);
    return { pods: [...samples] };
  }

  async function checkTables() {
    const checked = await host.checkTables();
    if (checked.some(({ kept }) => kept.length > 0))
      await closeOpened({ plaintextOnly: true });
    last.clear();
    return { checked, held: await held() };
  }

  async function setWorldDate({ date = "" }: Input<"setWorldDate">) {
    const asOf = worldInstant(date);
    if (date.trim() !== "" && asOf === undefined)
      throw new Refusal(
        `"${date}" is not a date: give a day as YYYY-MM-DD, or an instant with its timezone.`,
      );
    if (host.world === undefined)
      throw new Error("The app's world date is not set up yet.");
    await host.world.set(asOf);
    return asOf === undefined ? {} : { asOf };
  }

  /** The step a connection is at; `bringing in` while its record is brought in. */
  const stepOf = (connection: Underway) =>
    connection.bringing === undefined ? connection.step : "bringing in";
  const settled = (connection: Underway) =>
    !UNDER_WAY.includes(stepOf(connection));
  const stateOf = (connection: Underway) =>
    JSON.stringify([
      stepOf(connection),
      connection.requests,
      connection.bringing,
    ]);

  /** Stops every connection's sign-in and pull, and forgets them. */
  function forgetConnections() {
    for (const each of connections.values()) each.stop.abort();
    connections.clear();
  }

  /** Wakes whoever waits for the connection to change. */
  function changed(connection: Underway) {
    for (const wake of connection.waiting.splice(0)) wake();
  }

  const nextChange = (connection: Underway) =>
    new Promise<void>((wake) => connection.waiting.push(wake));

  /** Holds until the connection settles, or for `wait: "change"` changes, or `WAIT_MS` have passed. */
  async function holdFor(connection: Underway, wait: true | "change") {
    const was = stateOf(connection);
    const over = () =>
      settled(connection) || (wait === "change" && stateOf(connection) !== was);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<typeof LATE>((done) => {
      timer = globalThis.setTimeout(done, WAIT_MS, LATE);
      (timer as { unref?: () => void }).unref?.();
    });
    try {
      while (
        !over() &&
        (await Promise.race([nextChange(connection), late])) !== LATE
      );
    } finally {
      globalThis.clearTimeout(timer);
    }
  }

  /** The pod's record of a connect, before its pull; a server's refusal is kept to be shown, and the pull goes on. */
  async function record(
    connection: Underway,
    signed: Awaited<ReturnType<typeof connect>>,
  ) {
    try {
      const done = (await podNamed(connection.pod)).connect(
        connectFiles(
          await serverReport(signed, { signal: connection.stop.signal }),
          connection.name,
        ),
      );
      const { refused } = await done;
      if (refused !== undefined) connection.notRecorded = `Refused: ${refused}`;
    } catch (error) {
      if (error instanceof ConnectRefused)
        connection.notRecorded = `Refused: ${error.message}`;
      else if (
        error instanceof ConnectionFailure &&
        !connection.stop.signal.aborted
      )
        connection.notRecorded = `${error.message}.`;
      else throw error;
    }
  }

  async function connectTo({ pod: given, fhirBase }: Input<"connect">) {
    const name = await known(given);
    await podNamed(name);
    const hospitals = hospitalsOf();
    const row = (await hospitals.directory()).find(
      (each) => each.fhirBase === fhirBase,
    );
    if (row === undefined)
      throw new Refusal("That hospital is not in the directory.");
    const n = ++count;
    const connection: Underway = {
      pod: name,
      row,
      n,
      name: `${hospitals.pullName(row)}-${n}`,
      step: "signing in",
      requests: 0,
      asOf: row.vendor === "demo" ? await host.world?.get() : undefined,
      waiting: [],
      stop: new globalThis.AbortController(),
    };
    connections.set(n, connection);
    let report: (authorize: string) => void = noop;
    const reported = new Promise<string>((resolve) => (report = resolve));
    const signedIn = (async () => {
      await hospitals.ready(row);
      const signed = await connect(
        row,
        { ...hospitals.registration, scopes: SCOPES },
        {
          signIn: hospitals.signIn(row, { pod: name, connection: n }, report),
          fetch: async (url, init) => {
            const answer = await hospitals.fetch(url, init);
            connection.requests += 1;
            changed(connection);
            return answer;
          },
          signal: connection.stop.signal,
        },
      );
      await record(connection, signed);
      return signed;
    })();
    const pulled = signedIn.then((signed) => {
      connection.step = "pulling";
      changed(connection);
      return pull(signed, DEMO_PLAN, { signal: connection.stop.signal });
    });
    connection.pulled = pulled;
    pulled.then(
      () => {
        connection.step = "pulled";
        changed(connection);
      },
      () => {
        connection.step = "failed";
        changed(connection);
      },
    );
    const authorize = await Promise.race([reported, signedIn.then(noop, noop)]);
    return authorize === undefined
      ? { connection: n }
      : { connection: n, authorize };
  }

  function connectionOf(name: string, n: number | undefined) {
    const found = n === undefined ? undefined : connections.get(n);
    if (found?.pod !== name)
      throw new Refusal(`no connection ${n} for the pod ${name}`);
    return found;
  }

  /** The files a connection's pull is saved as, read once, or why there are none: it failed, or was refused. */
  function filesOf(connection: Underway): Promise<Saved> {
    connection.files ??= (async (): Promise<Saved> => {
      let pulled: Pull;
      try {
        pulled = await (connection.pulled as Promise<Pull>);
      } catch (error) {
        if (!(error instanceof ConnectionFailure)) throw error;
        const said = error.message;
        return {
          failed: said.endsWith(".") ? said : `${said}.`,
          failure: error.kind,
        };
      }
      try {
        return {
          pulled,
          files: pullFiles(
            { ...pulled, asOf: utcInstant(connection.asOf) },
            connection.name,
          ),
        };
      } catch (error) {
        if (error instanceof PullRefused)
          return { failed: `Refused: ${error.message}` };
        globalThis.console.error(error);
        return { failed: PULL_BROKEN };
      }
    })();
    return connection.files;
  }

  async function connectionNow({
    pod: given,
    connection: n,
    wait,
  }: Input<"connection">) {
    const name = await known(given);
    const connection = connectionOf(name, n);
    if (wait !== undefined) await holdFor(connection, wait);
    const shown = {
      n: connection.n,
      row: connection.row,
      step: stepOf(connection),
      settled: settled(connection),
      requests: connection.requests,
      ...(connection.asOf !== undefined && { asOf: connection.asOf }),
      ...(connection.notRecorded !== undefined && {
        notRecorded: connection.notRecorded,
      }),
      ...(connection.bringing !== undefined && {
        bringing: connection.bringing,
      }),
    };
    if (!settled(connection)) return shown;
    const saved = await filesOf(connection);
    if (saved.failed !== undefined)
      return {
        ...shown,
        failed: saved.failed,
        ...(saved.failure !== undefined && { failure: saved.failure }),
      };
    if (connection.failed !== undefined)
      return {
        ...shown,
        failed: connection.failed,
        ...(connection.retry && { retry: true }),
      };
    const { pulled, files } = saved;
    const patient = patientName(pulled.bundle);
    return {
      ...shown,
      sources: await (await podNamed(name)).look(files),
      pulled: { denied: pulled.denied, missing: pulled.missing },
      ...(patient !== undefined && { patient }),
      patientNames: patientNames(pulled.bundle),
      ...(connection.broughtIn && { broughtIn: true }),
    };
  }

  async function bring({ pod: given, connection: n }: Input<"bring">) {
    const name = await known(given);
    const connection = connectionOf(name, n);
    if (connection.bringing !== undefined) return { step: "bringing in" };
    const { files } =
      connection.step === "pulled" ? await filesOf(connection) : {};
    if (files === undefined) throw new Refusal("nothing pulled to bring in");
    const pod = await podNamed(name);
    if (connection.bringing !== undefined || connection.imported)
      return { step: stepOf(connection) };
    connection.failed = undefined;
    connection.retry = undefined;
    connection.bringing = { part: "loading the adapter" };
    changed(connection);
    pod
      .import(files, {
        aboutSubject: true,
        onProgress: (part) => {
          connection.bringing = part;
          changed(connection);
        },
      })
      .then(
        (done) => {
          connection.imported = true;
          if (done.refused === undefined) connection.broughtIn = true;
          else connection.failed = `Refused: ${done.refused}`;
          last.delete(name);
        },
        (error: unknown) => {
          globalThis.console.error(error);
          connection.failed = NOT_BROUGHT_IN;
          connection.retry = true;
        },
      )
      .finally(() => {
        connection.bringing = undefined;
        changed(connection);
      });
    return { step: "bringing in" };
  }

  const operations = {
    async pods(_input: Input<"pods">) {
      const names = await host.pods.names();
      seen.clear();
      for (const each of names) seen.add(each);
      return {
        pods: await Promise.all(
          names.map(async (name) => ({ name, title: await titleOf(name) })),
        ),
      };
    },
    async held(_input: Input<"held">) {
      try {
        return { held: await held() };
      } catch {
        return { held: [], failed: true };
      }
    },
    async pod({ pod: given }: Input<"pod">) {
      const name = await known(given);
      const title = await titleOf(name);
      try {
        const pod = await openOnce(name);
        return { name, title, encrypted: pod.encrypted === true };
      } catch (error) {
        if (!(error instanceof Unopened)) throw error;
        return { name, title, encrypted: true, locked: error.outcome };
      }
    },
    answers,
    said,
    trend,
    classes,
    panel,
    table,
    ask,
    tool,
    makePod,
    waitingWords: async ({ pod: name }: Input<"waitingWords">) => ({
      pod: name as string,
      ...waitingFor(name),
    }),
    confirmWords,
    unlock,
    deleteAll: (_input: Input<"deleteAll">) => deleteAll(),
    resetAll: (_input: Input<"resetAll">) => resetAll(),
    checkTables: (_input: Input<"checkTables">) => checkTables(),
    setWorldDate,
    async hospitals({ q = "" }: Input<"hospitals">) {
      const asOf = await host.world?.get();
      return {
        rows: searchDirectory(await hospitalsOf().directory(), q),
        ...(asOf !== undefined && { asOf }),
      };
    },
    connect: connectTo,
    connection: connectionNow,
    bring,
  } satisfies {
    readonly [K in Operation]: (input: Input<K>) => Promise<unknown>;
  };
  type Operations = typeof operations;
  return {
    ...(Object.fromEntries(
      OPERATIONS.map((name) => [
        name,
        typed(name, operations[name] as (input: object) => Promise<unknown>),
      ]),
    ) as {
      readonly [K in Operation]: (
        input?: Input<K>,
      ) => ReturnType<Operations[K]>;
    }),
    /** Not an operation: it gives functions, which cross no wire, for the tools that run where the pods are. */
    tables: tablesFor,
    close: async () => {
      forgetConnections();
      await closeOpened();
    },
  };
}

/** PodApi: each operation's input, as its route's schema says, and its output, as the operation gives it. */
export type PodApi = ReturnType<typeof podApi>;

/** What `operation` gives. */
export type Output<K extends Operation> = Awaited<ReturnType<PodApi[K]>>;

const noop = (): undefined => undefined;
const LATE = Symbol("late");
