// The one list of tools a model reaches the app by, over PodApi alone: the MCP server (`mcp-server.mjs`), the chat
// (`chat.mjs`) and try/'s WebMCP each offer those their door may. A tool's `tier` is the person's consent: `free`
// reads or moves the app, `ask` writes once the person has said yes. What no tool ever calls is `NEVER`.
import { Refusal } from "cascade-runtime";
import { POD_TOOLS, trendOf } from "./pod-api.mjs";
import { entryId, SOURCES, TREND_VIEW } from "./said.ts";

/** The questions `ask` offers: the person's own records, who they are and where an entry came from. Never free SPARQL. */
export const QUESTIONS = [
  "pod/My active allergies",
  "pod/My active conditions",
  "pod/My active medications",
  "pod/My medication history",
  "pod/My lab results",
  "pod/My immunizations",
  "pod/My procedures",
  "pod/My genetic variants",
  "pod/The person this pod is about",
  "entry/Where it came from",
];
/** How many rows `ask` gives unless asked for more: a pod's lab results run to thousands of tokens. */
export const DEFAULT_ROWS = 50;
export const MAXIMUM_ROWS = 500;

/**
 * The PodApi operations no tool calls, whatever the person says; `with` names the input that makes a call one of
 * them, where only some calls are.
 */
export const NEVER = [
  {
    op: "makePod",
    with: "encrypt",
    why: "an encrypted pod's six words are the person's alone",
  },
  { op: "waitingWords", why: "the six words are the person's alone" },
  {
    op: "confirmWords",
    why: "the six words and the password are the person's",
  },
  { op: "unlock", why: "the six words are the person's alone" },
  { op: "connect", why: "the sign-in at a hospital is the person's" },
  {
    op: "bring",
    why: "it imports what the person has not said is theirs; they bring a record in from its box",
  },
  { op: "deleteAll", why: "it removes every pod" },
  { op: "resetAll", why: "it removes every pod" },
];

const NO_INPUT = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

/** `schema` with the pod's name beside its own properties: a tool of one pod as MCP and the chat take its input. */
export function withPod(schema) {
  const { properties = {}, required = [] } = schema;
  return {
    ...schema,
    properties: {
      pod: {
        type: "string",
        description: "The pod's name, one of those list_pods gives.",
      },
      ...properties,
    },
    required: ["pod", ...required],
  };
}

/**
 * `find_changes` as `run` gives it, with `found`, the findings with their rows, beside `value`; with `address.trend`,
 * each finding of `value` carries `view`, the address of the page that draws its results.
 */
async function findings(api, { pod, ...input }, { address } = {}) {
  const { value, found } = await api.tool({ pod, tool: "find_changes", input });
  return {
    found,
    value:
      address?.trend === undefined
        ? value
        : value.map((finding) => ({
            ...finding,
            view: address.trend(pod, trendOf(finding)),
          })),
  };
}

const ofPod = POD_TOOLS.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
  tier: "free",
  ofPod: true,
  ...(name === "find_changes"
    ? {
        findings,
        run: async (api, input, door) =>
          (await findings(api, input, door)).value,
      }
    : {
        run: async (api, { pod, ...input }) =>
          (await api.tool({ pod, tool: name, input })).value,
      }),
}));

/** Goes to `address` by the door's `open`, and gives it. */
async function opening(address, { open }) {
  await open(address);
  return { opened: address };
}

/**
 * Every tool, each `{ name, description, inputSchema, tier, run(api, input, door) }`. `run` calls only `api`, PodApi's
 * operations; `door` is what the door gives: `address`, the builders of its own addresses (`pod(name)`,
 * `trend(name, { test, medication })`, `entry(name, entry)`), and `open(address)`, which moves its app there. A tool
 * with `ofPod` takes the pod's name in `input.pod`, which `inputSchema` leaves out (`withPod` adds it); one with `opens`
 * moves the app.
 */
export const TOOLS = [
  {
    name: "list_pods",
    description: "The names of the pods there are.",
    inputSchema: NO_INPUT,
    tier: "free",
    run: async (api) => (await api.pods({})).pods.map(({ name }) => name),
  },
  ...ofPod,
  {
    name: "ask",
    description:
      "A pod's records by the name of a question, as rows: its allergies, conditions, medications (active, or all with when each started and stopped), lab results, immunizations, procedures, genetic variants, the person it is about, or where an entry came from.",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question's name.",
          enum: QUESTIONS,
        },
        limit: {
          type: "integer",
          description: `At most this many rows; ${DEFAULT_ROWS} if left out. The answer says how many there are.`,
          minimum: 1,
          maximum: MAXIMUM_ROWS,
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
    tier: "free",
    ofPod: true,
    run: (api, { pod, question, limit }) =>
      api.ask({ pod, question, limit: limit ?? DEFAULT_ROWS }),
  },
  {
    name: "open_pod",
    description: "Opens a pod's page in the app.",
    inputSchema: NO_INPUT,
    tier: "free",
    ofPod: true,
    opens: true,
    async run(api, { pod }, door) {
      await api.pod({ pod });
      return opening(door.address.pod(pod), door);
    },
  },
  {
    name: TREND_VIEW.name,
    description: TREND_VIEW.description,
    inputSchema: TREND_VIEW.inputSchema,
    tier: "free",
    ofPod: true,
    opens: true,
    async run(api, { pod, test, medication }, door) {
      const drug = medication === "" ? undefined : medication;
      const { series, timeline } = await api.trend({
        pod,
        test,
        medication: drug,
        named: false,
      });
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
      return opening(
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
    async run(api, { pod, entry }, door) {
      const { rows } = await api.ask({ pod, question: SOURCES });
      if (!rows.some((row) => entryId(row.entry) === entryId(entry)))
        throw new Refusal(
          `the pod ${pod} holds no entry ${entry}; ask's rows give each entry's ID in their entry column`,
        );
      return opening(door.address.entry(pod, entry), door);
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
    run: (api, { person }) => api.makePod({ person }),
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
    run: (api, { date }) => api.setWorldDate({ date }),
  },
];
