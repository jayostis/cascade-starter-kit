// The one list of tools a model reaches the app by, over PodApi alone: the browser target's WebMCP, and the chat
// (`server/chat.ts`) and the MCP server (`mcp-server.ts`) when they are added, each offer those their door may. A tool's `tier` is the person's consent: `free`
// reads or moves the app, `ask` writes once the person has said yes. What no tool ever calls is `NEVER`.
import { type Finding, type InputSchema, Refusal } from "cascade-runtime";
import {
  type PodReads,
  type PodTool,
  TOOLS as RUNTIME_TOOLS,
} from "cascade-runtime/tools";
import { POD_TOOLS, type PodApi } from "./pod-api.ts";
import { PAGE_TOOLS, type PageDoor, type PageTool } from "./said.ts";

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

/** PodApi as the runtime's tools read it: its operations, and the lookups `reference_table_checks` asks of the tables. */
const readsOf = (api: PodApi): PodReads => ({
  pods: (input) => api.pods(input),
  ask: (input) => api.ask(input),
  tool: (input) => api.tool(input as Parameters<PodApi["tool"]>[0]),
  tables: (input) => api.tables(input),
});

/** A tool of the runtime's list, which reads over `PodApi`. */
const reading = ({ run, findings, ...tool }: PodTool): Tool => ({
  ...tool,
  run: (api, input, door) => run(readsOf(api), input, door),
  ...(findings !== undefined && {
    findings: async (api, input, door) => {
      const { value, found } = await findings(readsOf(api), input, door);
      return { value, found: [...found] };
    },
  }),
});

/** `worth_a_look`, the kit's own: what the page lists under Worth a look, read through PodApi's `tool`. */
const OWN: Tool[] = POD_TOOLS.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
  tier: "free",
  ofPod: true,
  run: async (api, { pod, ...input }) =>
    (await api.tool({ pod: pod as string, tool: name, input })).value,
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
  ...RUNTIME_TOOLS.map(reading),
  ...OWN,
  ...PAGE_TOOLS.map(refusing),
];
