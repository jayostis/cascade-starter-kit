// The one list of tools a model reaches the app by, over PodApi alone: the MCP server (`mcp-server.ts`), the chat
// (`server/chat.ts`) and the browser target's WebMCP each offer those their door may. A tool's `tier` is the person's consent: `free`
// reads or moves the app, `ask` writes once the person has said yes. What no tool ever calls is `NEVER`.
import {
  type CompactFinding,
  type Finding,
  type InputSchema,
  Refusal,
} from "cascade-runtime";
import { POD_TOOLS, type PodApi, trendOf } from "./pod-api.ts";
import { NO_INPUT, PAGE_TOOLS, type PageDoor, type PageTool } from "./said.ts";

/** A tool's input, as its door checked it against the tool's schema: `pod` beside it for a tool with `ofPod`. */
export type ToolInput = Readonly<Record<string, unknown>>;

/** What a door gives the tools: the builders of its own addresses it has, and `open`, where it moves its app. */
export interface Door {
  readonly address?: Partial<PageDoor["address"]>;
  open?(address: string): Promise<void>;
}

/** A tool of the list. */
export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: InputSchema;
  readonly tier: "free" | "ask";
  readonly ofPod?: true;
  readonly opens?: true;
  run(api: PodApi, input: ToolInput, door: Door): Promise<unknown>;
  findings?(
    api: PodApi,
    input: ToolInput,
    door?: Door,
  ): Promise<{ value: unknown[]; found: Finding[] }>;
}

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
export const NEVER: readonly {
  readonly op: keyof PodApi;
  readonly with?: string;
  readonly why: string;
}[] = [
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

/** `schema` with the pod's name beside its own properties: a tool of one pod as MCP and the chat take its input. */
export function withPod(schema: InputSchema): InputSchema {
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
async function findings(
  api: PodApi,
  { pod, ...input }: ToolInput,
  { address }: Door = {},
) {
  const { value, found } = (await api.tool({
    pod: pod as string,
    tool: "find_changes",
    input,
  })) as { value: CompactFinding[]; found: Finding[] };
  const trend = address?.trend;
  return {
    found,
    value:
      trend === undefined
        ? value
        : value.map((finding) => ({
            ...finding,
            view: trend(pod as string, trendOf(finding)),
          })),
  };
}

const ofPod = POD_TOOLS.map(({ name, description, inputSchema }): Tool => ({
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
          (await api.tool({ pod: pod as string, tool: name, input })).value,
      }),
}));

/** A tool of `PAGE_TOOLS`, which refuses by an error's name, refusing with the runtime's `Refusal` as every door here tells one. */
const refusing = (tool: PageTool): Tool => ({
  ...tool,
  inputSchema: tool.inputSchema as InputSchema,
  async run(api, input, door) {
    try {
      return await tool.run(
        api,
        input as Parameters<PageTool["run"]>[1],
        door as PageDoor,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "Refusal" &&
        !(error instanceof Refusal)
      )
        throw new Refusal(error.message);
      throw error;
    }
  },
});

/**
 * Every tool, each `{ name, description, inputSchema, tier, run(api, input, door) }`. `run` calls only `api`, PodApi's
 * operations; `door` is what the door gives: `address`, the builders of its own addresses (`pod(name)`,
 * `trend(name, { test, medication })`, `entry(name, entry)`), and `open(address)`, which moves its app there. A tool
 * with `ofPod` takes the pod's name in `input.pod`, which `inputSchema` leaves out (`withPod` adds it); one with `opens`
 * moves the app.
 */
export const TOOLS: readonly Tool[] = [
  {
    name: "list_pods",
    description: "The names of the pods there are.",
    inputSchema: NO_INPUT as InputSchema,
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
      api.ask({
        pod: pod as string,
        question: question as string,
        limit: (limit as number | undefined) ?? DEFAULT_ROWS,
      }),
  },
  ...PAGE_TOOLS.map(refusing),
];
